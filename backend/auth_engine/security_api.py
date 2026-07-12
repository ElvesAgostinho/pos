"""
API de Segurança (Security Center): Utilizadores, Sessões e Histórico de Login.
Liga-se ao login REAL (Django User + JWT) e ao RBAC real (eae.Profile/Role).
"""
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import viewsets, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from eae.models import Profile, Role
from .models import UserSession, AuthEventLog


class MyAccessView(APIView):
    """
    GET /api/auth/access/ — acessos do utilizador ATUAL (para ocultar o que não pode ver).
    - Superuser (dono) → acesso total.
    - Sem perfis OU qualquer perfil com full_access → acesso total (retrocompatível).
    - Caso contrário → apenas os módulos/ecrãs autorizados (união dos perfis).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        if u.is_superuser:
            return Response({'full': True, 'modules': [], 'screens': [], 'is_superuser': True})
        profiles = [r.profile for r in u.eae_roles.select_related('profile').all()]
        if not profiles or any(getattr(p, 'full_access', True) for p in profiles):
            return Response({'full': True, 'modules': [], 'screens': [], 'is_superuser': False})
        modules, screens = set(), set()
        for p in profiles:
            modules.update(p.allowed_modules or [])
            screens.update(p.allowed_screens or [])
        return Response({'full': False, 'modules': sorted(modules), 'screens': sorted(screens),
                         'is_superuser': False, 'profiles': [p.name for p in profiles]})


# ---------------- Utilizadores ----------------
class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    profile_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    profiles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'is_active', 'is_staff', 'is_superuser', 'last_login',
                  'password', 'profile_ids', 'profiles']
        read_only_fields = ['last_login']

    def get_profiles(self, obj):
        return [{'id': r.profile_id, 'code': r.profile.code, 'name': r.profile.name}
                for r in obj.eae_roles.select_related('profile').all()]

    def _sync(self, user, password, profile_ids):
        if password:
            user.set_password(password)
            user.save()
        if profile_ids is not None:
            user.eae_roles.all().delete()
            for pid in profile_ids:
                p = Profile.objects.filter(pk=pid).first()
                if p:
                    Role.objects.create(user=user, profile=p)

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        profile_ids = validated_data.pop('profile_ids', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        self._sync(user, None, profile_ids)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        profile_ids = validated_data.pop('profile_ids', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, password, profile_ids)
        return instance


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().prefetch_related('eae_roles__profile').order_by('username')
    serializer_class = UserSerializer

    @action(detail=True, methods=['post'])
    def set_password(self, request, pk=None):
        u = self.get_object()
        pw = request.data.get('password') or ''
        if len(pw) < 4:
            return Response({'detail': 'A palavra-passe deve ter pelo menos 4 caracteres.'}, status=400)
        u.set_password(pw); u.save()
        return Response({'detail': 'Palavra-passe atualizada.'})

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        u = self.get_object()
        u.is_active = not u.is_active; u.save(update_fields=['is_active'])
        return Response(self.get_serializer(u).data)


# ---------------- Sessões ----------------
class UserSessionSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True, default=None)
    operator_name = serializers.CharField(source='pos_operator.name', read_only=True, default=None)

    class Meta:
        model = UserSession
        fields = ['id', 'user_name', 'operator_name', 'status', 'login_time', 'last_activity', 'logout_time']


class UserSessionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        qs = UserSession.objects.select_related('user', 'pos_operator').order_by('-login_time')
        s = self.request.query_params.get('status')
        return (qs.filter(status=s) if s else qs)[:500]

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        sess = self.get_object()
        sess.status = 'Logged_Out'
        sess.logout_time = timezone.now()
        sess.save(update_fields=['status', 'logout_time'])
        return Response(self.get_serializer(sess).data)


# ---------------- Histórico de Login ----------------
class AuthEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuthEventLog
        fields = ['id', 'event_type', 'identity_attempt', 'ip_address', 'timestamp', 'details']


class AuthEventViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuthEventSerializer

    def get_queryset(self):
        qs = AuthEventLog.objects.order_by('-timestamp')
        e = self.request.query_params.get('event_type')
        return (qs.filter(event_type=e) if e else qs)[:500]
