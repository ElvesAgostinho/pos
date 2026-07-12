from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import transaction
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
import uuid

from identity.models import Collaborator, PosOperator, Department, Hotel, Workstation, Shift, OperatorWorkstationConstraint
from eae.models import Profile, Role
from clm.models import TerminalLicense
from .serializers import CollaboratorSerializer, DepartmentSerializer, ProfileSerializer, WorkstationSerializer, ShiftSerializer, PosOperatorSerializer

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer

class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

class PosOperatorViewSet(viewsets.ModelViewSet):
    queryset = PosOperator.objects.all()
    serializer_class = PosOperatorSerializer

class CollaboratorViewSet(viewsets.ModelViewSet):
    queryset = Collaborator.objects.all()
    serializer_class = CollaboratorSerializer

class WorkforceViewSet(viewsets.ViewSet):
    # permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def profiles(self, request):
        profs = Profile.objects.all()
        return Response(ProfileSerializer(profs, many=True).data)

    @action(detail=False, methods=['get'])
    def workstations(self, request):
        ws = Workstation.objects.all()
        return Response(WorkstationSerializer(ws, many=True).data)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def activate_license(self, request):
        """
        Activates a PCC TerminalLicense via Activation Key and creates a local Workstation.
        Autenticado pela própria activation key (device onboarding, antes de qualquer login).
        """
        activation_key = request.data.get('activation_key')
        if not activation_key:
            return Response({"error": "Activation key required."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            with transaction.atomic():
                # 1. Procura a licença no CLM
                license_obj = TerminalLicense.objects.select_for_update().get(activation_key=activation_key)
                
                if license_obj.status != 'CREATED':
                    return Response({"error": f"Esta licença já foi utilizada ou está {license_obj.status}."}, status=status.HTTP_400_BAD_REQUEST)
                
                # 2. Atualiza o estado no CLM
                license_obj.status = 'ACTIVATED'
                license_obj.activated_at = timezone.now()
                license_obj.save()
                
                # 3. Cria a máquina no ERP (Workstation)
                device_token = str(uuid.uuid4())
                
                # Obtém o primeiro hotel ou cria um se não existir para o ERP local
                hotel = Hotel.objects.first()
                if not hotel:
                    hotel = Hotel.objects.create(name="Hotel Principal")
                    
                workstation = Workstation.objects.create(
                    hotel=hotel,
                    name=f"Terminal {license_obj.terminal_id}",
                    ip_address="127.0.0.1", # Será atualizado pelo frontend
                    is_active=True
                )
                
                return Response({
                    "status": "success",
                    "workstation_id": workstation.id,
                    "terminal_name": workstation.name,
                    "device_token": device_token
                }, status=status.HTTP_200_OK)
                
        except TerminalLicense.DoesNotExist:
            return Response({"error": "Activation Key inválida ou não encontrada."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def onboarding(self, request):
        data = request.data
        try:
            with transaction.atomic():
                # 1. Colaborador
                # Normaliza FKs vazias ('' -> None) e deriva o hotel do departamento
                # quando não é enviado explicitamente (o wizard só escolhe departamento).
                department_id = data.get('department_id') or None
                hotel_id = data.get('hotel_id') or None
                if not hotel_id and department_id:
                    hotel_id = (
                        Department.objects.filter(id=department_id)
                        .values_list('hotel_id', flat=True)
                        .first()
                    )

                collaborator = Collaborator.objects.create(
                    hotel_id=hotel_id,
                    department_id=department_id,
                    name=data.get('name'),
                    code=data.get('code'),
                    email=data.get('email'),
                    job_title=data.get('job_title')
                )
                
                # 2. Utilizador Backoffice (opcional)
                # Aceita ambas as convenções de nomes (wizard usa 'erp_*').
                create_user = data.get('create_user') or data.get('create_erp_account')
                username = data.get('username') or data.get('erp_username')
                password = data.get('password') or data.get('erp_password')
                user = None
                if create_user and username and password:
                    user = User.objects.create_user(
                        username=username,
                        email=data.get('email'),
                        password=password,
                        first_name=collaborator.name
                    )
                
                # 3. Operador POS (só se houver PIN, para não criar operador sem login válido)
                pos_operator = None
                if data.get('create_pos_operator') and data.get('pos_pin'):
                    pos_operator = PosOperator.objects.create(
                        collaborator=collaborator,
                        name=data.get('pos_name') or collaborator.name,
                        pin_code=make_password(data.get('pos_pin'))  # PIN sempre hasheado
                    )
                
                # 4. Atribuir Perfil (Role)
                profile_id = data.get('profile_id')
                if profile_id and user:
                    Role.objects.create(
                        user=user,
                        profile_id=profile_id
                    )
                
                # 5. Associar Terminais Autorizados
                terminals = data.get('allowed_workstations', [])
                if pos_operator:
                    for t_id in terminals:
                        OperatorWorkstationConstraint.objects.create(
                            operator=pos_operator,
                            workstation_id=t_id
                        )
                
                return Response({"status": "success", "message": "Colaborador criado com sucesso!", "collaborator_id": collaborator.id}, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
