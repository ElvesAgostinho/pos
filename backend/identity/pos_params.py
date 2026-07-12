"""
PARÂMETROS DO SISTEMA (Configuração POS) — Grupo.

O GRUPO é o topo da estrutura. É aqui que se define, uma vez só e para todos os
hotéis dele:
  · as LÍNGUAS em que o sistema fala com o hóspede (menu digital, fatura, reserva);
  · as MOEDAS em que se aceita pagar, e a taxa face à moeda base.
"""
from rest_framework import viewsets, serializers
from rest_framework.permissions import IsAuthenticated

from .models import (EnterpriseGroup, GroupLanguage, GroupCurrency, Hotel,
                     HotelGroupMembership, HotelCustomText)


class GroupLanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupLanguage
        fields = ('id', 'culture_code', 'name', 'sort_order', 'legacy_code', 'is_default')


class GroupCurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupCurrency
        fields = ('id', 'code', 'name', 'symbol', 'rate', 'sort_order', 'is_default')


class EnterpriseGroupSerializer(serializers.ModelSerializer):
    """O grupo e as suas línguas/moedas gravam-se de uma vez (como no botão "Gravar")."""
    languages = GroupLanguageSerializer(many=True, required=False)
    currencies = GroupCurrencySerializer(many=True, required=False)
    hotels_count = serializers.SerializerMethodField()

    class Meta:
        model = EnterpriseGroup
        fields = ('id', 'code', 'name', 'sort_order', 'is_active',
                  'languages', 'currencies', 'hotels_count')

    def get_hotels_count(self, o):
        return sum(c.hotels.count() for c in o.companies.all())

    def create(self, validated):
        langs = validated.pop('languages', [])
        curs = validated.pop('currencies', [])
        g = EnterpriseGroup.objects.create(**validated)
        self._sync(g, langs, curs)
        return g

    def update(self, instance, validated):
        langs = validated.pop('languages', None)
        curs = validated.pop('currencies', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, langs, curs)
        return instance

    def _sync(self, g, langs, curs):
        if langs is not None:
            g.languages.all().delete()
            for l in langs:
                GroupLanguage.objects.create(group=g, **l)
        if curs is not None:
            g.currencies.all().delete()
            for c in curs:
                GroupCurrency.objects.create(group=g, **c)
        # Só pode haver UMA por omissão — senão o sistema não sabe em que língua falar.
        for qs in (g.languages.filter(is_default=True), g.currencies.filter(is_default=True)):
            if qs.count() > 1:
                keep = qs.first()
                qs.exclude(pk=keep.pk).update(is_default=False)


class PosGroupViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = EnterpriseGroup.objects.prefetch_related('languages', 'currencies', 'companies__hotels')
    serializer_class = EnterpriseGroupSerializer


# ==========================================================================
# EMPRESA (o hotel, do ponto de vista da Configuração POS)
# ==========================================================================
class HotelMembershipSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = HotelGroupMembership
        fields = ('id', 'group', 'group_name', 'sort_order', 'is_active')


class HotelCustomTextSerializer(serializers.ModelSerializer):
    class Meta:
        model = HotelCustomText
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class PosCompanySerializer(serializers.ModelSerializer):
    memberships = HotelMembershipSerializer(many=True, required=False)
    custom_texts = HotelCustomTextSerializer(many=True, required=False)
    license = serializers.SerializerMethodField()
    bank_accounts = serializers.SerializerMethodField()

    class Meta:
        model = Hotel
        fields = '__all__'

    def get_license(self, o):
        """Dados da licença — SÓ DE LEITURA.

        Vêm do license.key assinado. Não são editáveis aqui de propósito: se o cliente
        pudesse escrever "Máx. Terminais = 99", a licença deixava de valer alguma coisa.
        """
        from licensing.limits import status as lim_status
        from licensing.offline_validator import get_license
        from django.conf import settings
        lic = get_license(settings.BASE_DIR) or {}
        mods = lic.get('modules', [])
        limits = lim_status()
        feats = list((lic.get('feature_flags') or {}).keys())
        return {
            'license_number': lic.get('license_number'),
            'license_code': lic.get('license_number'),          # "Código Licença"
            'client_code': lic.get('client_code'),
            'valid_until': lic.get('valid_until'),
            'version': '1.0',                                   # versão do software
            'modules': mods,
            'modules_flag_1': len(mods),                        # nº de módulos licenciados
            'modules_flag_2': len(feats),                       # nº de funcionalidades
            'features': ','.join(feats) or ','.join(mods),      # "Características"
            'max_rooms': (lic.get('limits') or {}).get('rooms', 999),
            'max_terminals_internal': limits['pos']['licensed'],
            'max_terminals_external': (lic.get('limits') or {}).get('pos_external', 0),
            'max_terminals_mobile': (lic.get('limits') or {}).get('pos_mobile', 0),
            'limits': limits,
            'read_only': True,
        }

    def get_bank_accounts(self, o):
        from fiscal.models import CompanyBankAccount
        return [{
            'id': b.id, 'bank_name': b.bank_name, 'branch': b.branch,
            'account_number': b.account_number, 'nib': b.nib, 'iban': b.iban,
            'swift': b.swift, 'bic': b.bic, 'sepa': b.sepa, 'is_default': b.is_default,
        } for b in CompanyBankAccount.objects.filter(is_active=True)]

    def update(self, instance, validated):
        mems = validated.pop('memberships', None)
        texts = validated.pop('custom_texts', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if mems is not None:
            instance.memberships.all().delete()
            for m in mems:
                m.pop('hotel', None)
                HotelGroupMembership.objects.create(hotel=instance, **m)
        if texts is not None:
            for t in texts:
                t.pop('hotel', None)
                HotelCustomText.objects.update_or_create(
                    hotel=instance, code=t.pop('code'), defaults=t)
        return instance


class PosCompanyViewSet(viewsets.ModelViewSet):
    """Configuração POS → Empresa. O hotel visto pelo POS: identificação, contactos,
    aparência nos terminais, grupos a que pertence, textos dos documentos e bancos."""
    permission_classes = [IsAuthenticated]
    queryset = Hotel.objects.prefetch_related('memberships__group', 'custom_texts')
    serializer_class = PosCompanySerializer
