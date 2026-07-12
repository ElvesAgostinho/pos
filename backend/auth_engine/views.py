import datetime

import jwt
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from identity.models import PosOperator
from eae.models import Role
from .models import UserSession, AuthEventLog

# --- Proteção contra força-bruta (lockout temporário por IP/identidade) ---
MAX_ATTEMPTS = 5
LOCK_SECONDS = 900  # 15 minutos


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')


def _lock_key(kind, ident):
    return f"authlock:{kind}:{ident}"


def _attempts_left(kind, ident):
    used = cache.get(_lock_key(kind, ident), 0)
    return max(0, MAX_ATTEMPTS - used)


def _is_locked(kind, ident):
    return cache.get(_lock_key(kind, ident), 0) >= MAX_ATTEMPTS


def _register_failure(kind, ident):
    key = _lock_key(kind, ident)
    try:
        used = cache.incr(key)
    except ValueError:
        cache.set(key, 1, LOCK_SECONDS)
        used = 1
    return used


def _clear_failures(kind, ident):
    cache.delete(_lock_key(kind, ident))


def _roles_for(user):
    return [
        {'code': r.profile.code, 'name': r.profile.name, 'category': r.profile.category}
        for r in Role.objects.filter(user=user).select_related('profile')
    ]


class BackofficeLoginView(APIView):
    """Login administrativo por credenciais (username/email + password). Devolve JWT."""
    permission_classes = [AllowAny]

    def post(self, request):
        identifier = (request.data.get('username') or request.data.get('email') or '').strip()
        password = request.data.get('password') or ''
        ip = _client_ip(request)

        if _is_locked('bo', ip):
            return Response(
                {'detail': 'Demasiadas tentativas falhadas. Tente novamente dentro de 15 minutos.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = authenticate(username=identifier, password=password)
        # Permitir login por email
        if user is None and '@' in identifier:
            from django.contrib.auth.models import User
            match = User.objects.filter(email__iexact=identifier).first()
            if match:
                user = authenticate(username=match.username, password=password)

        if user is None or not user.is_active:
            _register_failure('bo', ip)
            AuthEventLog.objects.create(
                event_type='LOGIN_FAILED_PASSWORD', identity_attempt=identifier, ip_address=ip
            )
            return Response(
                {'detail': 'Credenciais inválidas.', 'attempts_left': _attempts_left('bo', ip)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        _clear_failures('bo', ip)
        refresh = RefreshToken.for_user(user)
        UserSession.objects.create(user=user, token_jti=str(refresh['jti']), status='Active')
        AuthEventLog.objects.create(
            event_type='LOGIN_SUCCESS', identity_attempt=user.username, ip_address=_client_ip(request)
        )

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'name': user.get_full_name() or user.username,
                'email': user.email,
                'is_superuser': user.is_superuser,
                'is_staff': user.is_staff,
            },
            'roles': _roles_for(user),
        })


class PosLoginView(APIView):
    """Login de operador POS por PIN. Devolve um token de terminal e a identidade do operador."""
    permission_classes = [AllowAny]

    def post(self, request):
        pin = str(request.data.get('pin') or '').strip()
        workstation_id = request.data.get('workstation_id')
        ip = _client_ip(request)

        if _is_locked('pin', ip):
            return Response(
                {'detail': 'Terminal bloqueado por demasiadas tentativas. Aguarde 15 minutos ou contacte o gestor.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Recolhe TODOS os operadores cujo PIN corresponde (PIN não é globalmente único).
        matches = []
        if pin:
            for op in PosOperator.objects.filter(is_active=True).select_related('collaborator'):
                if check_password(pin, op.pin_code):
                    matches.append(op)

        # Colisão: nunca autenticar o operador errado — exige correção pelo gestor.
        if len(matches) > 1:
            AuthEventLog.objects.create(
                event_type='LOGIN_FAILED_PIN', identity_attempt='PIN', ip_address=ip,
                workstation_id=workstation_id or None,
                details=f'PIN ambíguo: {len(matches)} operadores com o mesmo PIN.',
            )
            return Response(
                {'detail': 'PIN ambíguo (usado por mais do que um operador). Contacte o gestor.'},
                status=status.HTTP_409_CONFLICT,
            )

        if not matches:
            _register_failure('pin', ip)
            AuthEventLog.objects.create(
                event_type='LOGIN_FAILED_PIN', identity_attempt='PIN', ip_address=ip,
                workstation_id=workstation_id or None,
            )
            return Response(
                {'detail': 'PIN inválido.', 'attempts_left': _attempts_left('pin', ip)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        _clear_failures('pin', ip)
        operator = matches[0]

        # Token de API (DRF/JWT) de uma conta de serviço do terminal: permite ao POS
        # FrontOffice chamar a API. A identidade do OPERADOR viaja no payload (operator_name)
        # e é registada na auditoria; este token só autentica o terminal.
        from django.contrib.auth.models import User
        svc, _ = User.objects.get_or_create(
            username='pos_terminal', defaults={'is_staff': False, 'is_active': True})
        api_access = str(RefreshToken.for_user(svc).access_token)

        payload = {
            'operator_id': operator.id,
            'name': operator.name,
            'type': 'pos_operator',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12),
            'iat': datetime.datetime.utcnow(),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

        UserSession.objects.create(
            pos_operator=operator, workstation_id=workstation_id or None, status='Active'
        )
        AuthEventLog.objects.create(
            event_type='LOGIN_SUCCESS', identity_attempt=operator.name, ip_address=_client_ip(request),
            workstation_id=workstation_id or None,
        )

        allowed = [
            {'id': c.workstation_id, 'name': c.workstation.name}
            for c in operator.workstation_constraints.select_related('workstation').all()
        ]

        return Response({
            'token': token,
            'access': api_access,
            'operator': {
                'id': operator.id,
                'name': operator.name,
                'collaborator': operator.collaborator.name,
                'collaborator_code': operator.collaborator.code,
            },
            'allowed_workstations': allowed,
        })


class MeView(APIView):
    """Devolve o utilizador autenticado e os seus perfis RBAC."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response({
            'id': u.id,
            'username': u.username,
            'name': u.get_full_name() or u.username,
            'email': u.email,
            'is_superuser': u.is_superuser,
            'is_staff': u.is_staff,
            'roles': _roles_for(u),
        })


class ChangePasswordView(APIView):
    """Permite ao utilizador autenticado alterar a sua própria palavra-passe."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.data.get('current_password') or ''
        new = request.data.get('new_password') or ''

        if not request.user.check_password(current):
            return Response(
                {'detail': 'A palavra-passe atual está incorreta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new) < 6:
            return Response(
                {'detail': 'A nova palavra-passe deve ter pelo menos 6 caracteres.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new == current:
            return Response(
                {'detail': 'A nova palavra-passe tem de ser diferente da atual.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new)
        request.user.save()
        AuthEventLog.objects.create(
            event_type='LOGIN_SUCCESS', identity_attempt=request.user.username,
            ip_address=_client_ip(request), details='Password alterada pelo próprio utilizador.',
        )
        return Response({'detail': 'Palavra-passe alterada com sucesso.'})


class LogoutView(APIView):
    """Termina a sessão: coloca o refresh token na blacklist e fecha a UserSession."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if refresh:
            try:
                token = RefreshToken(refresh)
                UserSession.objects.filter(token_jti=str(token['jti'])).update(status='Logged_Out')
                token.blacklist()
            except Exception:
                pass
        AuthEventLog.objects.create(
            event_type='LOGOUT', identity_attempt=request.user.username, ip_address=_client_ip(request)
        )
        return Response({'detail': 'Sessão terminada.'})
