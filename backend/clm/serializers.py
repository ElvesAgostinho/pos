from rest_framework import serializers
from .models import (Client, Contact, CommercialData, License, Installation, Equipment,
                     AuditLogCLM, TerminalLicense, SystemRelease, ErrorReport)

class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = '__all__'

class CommercialDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialData
        fields = '__all__'

class LicenseSerializer(serializers.ModelSerializer):
    # Os campos _enc são a senha CIFRADA — nunca saem pela API, nem cifrados (é
    # material criptográfico sem uso nenhum do lado de fora). Só se expõe SE está
    # definida e QUANDO — nunca a senha em si.
    has_install_password = serializers.SerializerMethodField()
    has_owner_password = serializers.SerializerMethodField()

    class Meta:
        model = License
        # agt_private_key: a chave de assinatura do FORNECEDOR — quem a precisa (o
        # próprio ecrã de Certificação AGT) já a lê por um endpoint dedicado
        # (AgtLicenseCredentialsView); não faz sentido ir também no JSON genérico
        # de qualquer listagem de clientes/licenças.
        exclude = ('install_password_enc', 'owner_password_enc', 'agt_private_key')

    def get_has_install_password(self, o):
        return bool(o.install_password_enc)

    def get_has_owner_password(self, o):
        return bool(o.owner_password_enc)

class InstallationSerializer(serializers.ModelSerializer):
    # "Online" é um cálculo, não um estado gravado — nunca fica desatualizado
    # (ninguém tem de correr uma tarefa a apagar isto quando o cliente cai).
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Installation
        fields = '__all__'

    def get_is_online(self, o):
        if not o.last_ping:
            return False
        from django.utils import timezone
        from datetime import timedelta
        return timezone.now() - o.last_ping < timedelta(hours=6)

class ClientSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, read_only=True)
    commercial_data = CommercialDataSerializer(read_only=True)
    licenses = LicenseSerializer(many=True, read_only=True)
    installations = InstallationSerializer(many=True, read_only=True)

    class Meta:
        model = Client
        fields = '__all__'

class AuditLogCLMSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLogCLM
        fields = '__all__'

class ProvisioningRequestSerializer(serializers.Serializer):
    client_data = serializers.DictField()
    commercial_data = serializers.DictField()
    modules = serializers.ListField(child=serializers.CharField())
    feature_flags = serializers.DictField(required=False)
    limits = serializers.DictField(required=False)

class TerminalLicenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminalLicense
        fields = '__all__'

class SystemReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemRelease
        fields = '__all__'
        read_only_fields = ('created_at',)

    def validate(self, attrs):
        """Ou se carrega o ficheiro, ou se cola um link — mas tem de haver um."""
        ficheiro = attrs.get('package') or getattr(self.instance, 'package', None)
        link = attrs.get('download_url') or getattr(self.instance, 'download_url', '')
        if not ficheiro and not link:
            raise serializers.ValidationError({
                'package': ['Carregue o ficheiro da versão (.zip da atualização ou .exe do '
                            'instalador), ou cole o link de onde ele já está alojado. Sem um '
                            'dos dois, o cliente não tem de onde descarregar.'],
            })
        return attrs

    def _com_morada(self, instance):
        """O LINK, feito a partir do ficheiro carregado.

        Isto é o que faltava para o ecrã deixar de pedir uma coisa impossível:
        quem publica a versão carrega o ficheiro e o endereço nasce dele. Tem de
        ser ABSOLUTO (com o domínio do PCC), porque quem o vai abrir é a
        instalação do cliente, noutra máquina e noutra rede — um caminho
        relativo só funcionaria dentro do próprio PCC.
        """
        if instance.package and not instance.download_url:
            pedido = self.context.get('request')
            url = instance.package.url
            instance.download_url = pedido.build_absolute_uri(url) if pedido else url
            instance.save(update_fields=['download_url'])
        return instance

    def create(self, validated):
        return self._com_morada(super().create(validated))

    def update(self, instance, validated):
        return self._com_morada(super().update(instance, validated))

class ErrorReportSerializer(serializers.ModelSerializer):
    installation_name = serializers.CharField(source='installation.name', read_only=True)

    class Meta:
        model = ErrorReport
        fields = '__all__'
        read_only_fields = ('installation', 'client_code', 'level', 'logger_name', 'message',
                            'traceback', 'path', 'app_version', 'hostname', 'created_at')

