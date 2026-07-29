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
    # Um token velho (expirado, ou doutro arranque do servidor) no cabeçalho
    # Authorization nunca pode impedir o login: o JWTAuthentication por omissão
    # rejeita o pedido ANTES de a permissão (AllowAny) sequer ser vista — "senha
    # falha" sem ser mesmo a senha, só porque o browser ainda tinha um token
    # antigo guardado. O login é a única porta que tem de aceitar sempre.
    authentication_classes = []

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

        # (Utilizador POS) "Obrigar a mudar a password" — a caixa da ficha viaja no login.
        # O ecrã força a troca ANTES de deixar trabalhar; ao mudar, a caixa desliga-se.
        # É assim que se entrega um utilizador novo com password provisória.
        must_change = False
        try:
            from pos.models import PosUser
            pu = PosUser.objects.filter(auth_user=user).first()
            must_change = bool(pu and pu.must_change_password)
        except Exception:
            pass

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'must_change_password': must_change,
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
    # Ver o comentário em BackofficeLoginView: um token velho no cabeçalho não
    # pode barrar este ecrã — é aqui que se entra quando já não se tem sessão.
    authentication_classes = []

    def post(self, request):
        pin = str(request.data.get('pin') or '').strip()
        workstation_id = request.data.get('workstation_id')
        ip = _client_ip(request)

        if _is_locked('pin', ip):
            return Response(
                {'detail': 'Terminal bloqueado por demasiadas tentativas. Aguarde 15 minutos ou contacte o gestor.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # FONTE ÚNICA DE VERDADE: o PIN autentica PRIMEIRO contra o UTILIZADOR POS do
        # backoffice (pos.PosUser) — é lá que vivem as caixas (setores, preço de custo,
        # gestor de eventos, mudar PIN…). Havia duas fichas de operador e o terminal
        # usava a que NÃO tinha configuração nenhuma: o backoffice mandava no vazio.
        # O operador antigo (identity.PosOperator) fica como retrocompatibilidade.
        matches = []
        if pin:
            try:
                from pos.models import PosUser
                for pu in PosUser.objects.filter(is_active=True, is_blocked=False):
                    if pu.pos_pin and check_password(pin, pu.pos_pin):
                        matches.append(pu)
            except Exception:
                pass
        if pin and not matches:
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
        # As duas fichas têm nomes de campos diferentes; normalizamos aqui.
        is_pos_user = not isinstance(operator, PosOperator)
        op_name = (getattr(operator, 'full_name', '') or getattr(operator, 'name', '')
                   or getattr(operator, 'code', '') or f'Operador {operator.id}')
        op_code = getattr(operator, 'code', '') or str(operator.id)

        # Token de API (DRF/JWT) de uma conta de serviço do terminal: permite ao POS
        # FrontOffice chamar a API. A identidade do OPERADOR viaja no payload (operator_name)
        # e é registada na auditoria; este token só autentica o terminal.
        from django.contrib.auth.models import User
        svc, _ = User.objects.get_or_create(
            username='pos_terminal', defaults={'is_staff': False, 'is_active': True})
        api_access = str(RefreshToken.for_user(svc).access_token)

        # AS CAIXAS DA FICHA DO OPERADOR viajam com o login — é a única fonte de verdade.
        # O terminal não decide nada: obedece ao que o backoffice marcou.
        flags = {
            # "Todos os setores": desmarcada, o operador só vê os setores da lista dele.
            'all_sectors': bool(getattr(operator, 'all_sectors', True)),
            'sector_ids': list(operator.sectors.values_list('id', flat=True))
            if hasattr(operator, 'sectors') else [],
            'all_complexes': bool(getattr(operator, 'all_complexes', True)),
            # "Obrigar a mudar o PIN": o terminal força a troca antes de vender.
            'must_change_pin': bool(getattr(operator, 'pos_must_change_pin', False)),
            # "Usa preço de custo": o teclado mostra o custo (staff/consumo interno).
            'use_cost_price': bool(getattr(operator, 'use_cost_price', False)),
            'internal_consumption': bool(getattr(operator, 'internal_consumption', False)),
            'is_event_manager': bool(getattr(operator, 'is_event_manager', False)),
            'is_fnb_user': bool(getattr(operator, 'is_fnb_user', False)),
        }
        payload = {
            'operator_id': operator.id,
            'name': op_name,
            'type': 'pos_operator',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12),
            'iat': datetime.datetime.utcnow(),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

        # A FK de sessão aponta para a ficha antiga; para o PosUser fica só o registo de auditoria.
        if not is_pos_user:
            UserSession.objects.create(
                pos_operator=operator, workstation_id=workstation_id or None, status='Active'
            )
        AuthEventLog.objects.create(
            event_type='LOGIN_SUCCESS', identity_attempt=op_name, ip_address=_client_ip(request),
            workstation_id=workstation_id or None,
        )

        # devolve-as também no corpo, para o terminal as guardar
        # (o token é do terminal; a identidade do operador é esta)
        request._operator_flags = flags
        allowed = []
        if not is_pos_user:
            allowed = [
                {'id': c.workstation_id, 'name': c.workstation.name}
                for c in operator.workstation_constraints.select_related('workstation').all()
            ]

        return Response({
            'token': token,
            'access': api_access,
            'operator': {
                'flags': flags,
                'id': operator.id,
                'name': op_name,
                'collaborator': getattr(getattr(operator, 'collaborator', None), 'name', op_name),
                'collaborator_code': getattr(getattr(operator, 'collaborator', None), 'code', op_code),
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
        # A caixa "Obrigar a mudar a password" desliga-se SOZINHA quando ele a muda —
        # senão ficava a pedir a troca para sempre.
        try:
            from pos.models import PosUser
            PosUser.objects.filter(auth_user=request.user,
                                   must_change_password=True).update(must_change_password=False)
        except Exception:
            pass
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
