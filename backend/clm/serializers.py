from rest_framework import serializers
from .models import Client, Contact, CommercialData, License, Installation, Equipment, AuditLogCLM, TerminalLicense

class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = '__all__'

class CommercialDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialData
        fields = '__all__'

class LicenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = License
        fields = '__all__'

class ClientSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, read_only=True)
    commercial_data = CommercialDataSerializer(read_only=True)
    licenses = LicenseSerializer(many=True, read_only=True)

    class Meta:
        model = Client
        fields = '__all__'

class InstallationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Installation
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

