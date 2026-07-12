from rest_framework import serializers
from .models import (FiscalConfig, FiscalDocType, FiscalSeries, FiscalDocument,
                     FiscalDocumentLine, SubmissionQueue, FiscalAuditLog,
                     AGTConnection, DigitalCertificate, TaxRate, TaxExemptionReason)
from . import secrets as fsecrets


from .models import CommercialDocument, CommercialDocumentLine


class CommercialDocumentLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialDocumentLine
        exclude = ('document',)
        read_only_fields = ('tax_amount', 'line_total')


class CommercialDocumentSerializer(serializers.ModelSerializer):
    lines = CommercialDocumentLineSerializer(many=True, read_only=True)
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    state_display = serializers.CharField(source='get_state_display', read_only=True)
    editable = serializers.BooleanField(read_only=True)
    converted_invoice_no = serializers.CharField(source='converted_to.invoice_no', read_only=True, default=None)

    class Meta:
        model = CommercialDocument
        fields = '__all__'
        read_only_fields = ('number', 'year', 'seq', 'state', 'converted_to',
                            'net_total', 'tax_total', 'gross_total')


class TaxRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRate
        fields = '__all__'


class TaxExemptionReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxExemptionReason
        fields = '__all__'


class FiscalConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalConfig
        fields = '__all__'


class FiscalDocTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalDocType
        fields = '__all__'


class FiscalSeriesSerializer(serializers.ModelSerializer):
    doc_type_code = serializers.CharField(source='doc_type.code', read_only=True)
    doc_type_name = serializers.CharField(source='doc_type.name', read_only=True)

    class Meta:
        model = FiscalSeries
        fields = '__all__'
        validators = []  # unicidade garantida na BD; evita 400 espúrio no formulário


class FiscalDocumentLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalDocumentLine
        exclude = ('document',)


class FiscalDocumentSerializer(serializers.ModelSerializer):
    lines = FiscalDocumentLineSerializer(many=True, read_only=True)
    doc_type_code = serializers.CharField(source='doc_type.code', read_only=True)
    doc_type_name = serializers.CharField(source='doc_type.name', read_only=True)
    lifecycle_state = serializers.CharField(read_only=True)

    class Meta:
        model = FiscalDocument
        fields = '__all__'


class SubmissionQueueSerializer(serializers.ModelSerializer):
    invoice_no = serializers.CharField(source='document.invoice_no', read_only=True)

    class Meta:
        model = SubmissionQueue
        fields = '__all__'


class FiscalAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalAuditLog
        fields = '__all__'


class AGTConnectionSerializer(serializers.ModelSerializer):
    """Segredos entram em claro (write-only) e saem mascarados; guardados encriptados."""
    client_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_client_secret = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    has_api_key = serializers.SerializerMethodField()

    class Meta:
        model = AGTConnection
        exclude = ('client_secret_enc', 'password_enc', 'api_key_enc',
                   'access_token', 'refresh_token')

    def get_has_client_secret(self, o):
        return bool(o.client_secret_enc)

    def get_has_password(self, o):
        return bool(o.password_enc)

    def get_has_api_key(self, o):
        return bool(o.api_key_enc)

    def _apply_secrets(self, validated):
        for field, col in (('client_secret', 'client_secret_enc'),
                           ('password', 'password_enc'), ('api_key', 'api_key_enc')):
            if field in validated:
                raw = validated.pop(field)
                if raw:  # só sobrescreve se enviado
                    validated[col] = fsecrets.encrypt(raw)
        return validated

    def create(self, validated):
        return super().create(self._apply_secrets(validated))

    def update(self, instance, validated):
        return super().update(instance, self._apply_secrets(validated))


class DigitalCertificateSerializer(serializers.ModelSerializer):
    """Chave privada write-only e nunca devolvida; pública visível."""
    private_key_pem = serializers.CharField(write_only=True, required=False, allow_blank=True)
    private_key_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_private_key = serializers.SerializerMethodField()

    class Meta:
        model = DigitalCertificate
        exclude = ('private_key_enc', 'private_key_password_enc')

    def get_has_private_key(self, o):
        return bool(o.private_key_enc)

    def _apply(self, validated):
        pk = validated.pop('private_key_pem', None)
        pw = validated.pop('private_key_password', None)
        if pk:
            validated['private_key_enc'] = fsecrets.encrypt(pk)
        if pw:
            validated['private_key_password_enc'] = fsecrets.encrypt(pw)
        return validated

    def create(self, validated):
        return super().create(self._apply(validated))

    def update(self, instance, validated):
        return super().update(instance, self._apply(validated))
