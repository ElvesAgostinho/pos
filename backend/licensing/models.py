from django.db import models
from identity.models import Company


class FeatureFlag(models.Model):
    """Override do admin para uma funcionalidade (dentro do que a licença permite)."""
    key = models.CharField(max_length=60, unique=True)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'licensing_feature_flag'

    def __str__(self):
        return f"{self.key}={'on' if self.enabled else 'off'}"


class SupportSetting(models.Model):
    """Configuração de suporte/assistência remota (singleton). Encaixa na arquitetura VPN."""
    support_url = models.CharField(max_length=300, blank=True, null=True)   # servidor de suporte (HQ) p/ enviar logs
    support_token = models.CharField(max_length=120, blank=True, null=True) # autenticação no servidor de suporte
    auto_send_logs = models.BooleanField(default=False)
    last_sent_at = models.DateTimeField(blank=True, null=True)
    remote_assist_enabled = models.BooleanField(default=False)
    remote_assist_until = models.DateTimeField(blank=True, null=True)
    remote_assist_code = models.CharField(max_length=20, blank=True, null=True)
    # VERSÃO — o que o PCC disse na última sincronização (licenses/latest/).
    # O cliente só LÊ isto (nunca escreve); serve para o Diagnóstico avisar
    # "há uma atualização" sem ter de perguntar ao PCC outra vez.
    latest_version = models.CharField(max_length=20, blank=True, null=True)
    latest_download_url = models.URLField(max_length=300, blank=True, null=True)
    latest_release_notes = models.TextField(blank=True, null=True)
    version_checked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'licensing_support_setting'

    @classmethod
    def get(cls):
        return cls.objects.first() or cls.objects.create()
