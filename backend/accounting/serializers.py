from rest_framework import serializers
from .models import Account, Journal, FiscalPeriod, JournalEntry, JournalEntryLine


class AccountSerializer(serializers.ModelSerializer):
    class_display = serializers.CharField(source='get_account_class_display', read_only=True)
    type_display = serializers.CharField(source='get_account_type_display', read_only=True)

    class Meta:
        model = Account
        fields = '__all__'


class JournalSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_journal_type_display', read_only=True)

    class Meta:
        model = Journal
        fields = '__all__'


class FiscalPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = '__all__'


class JournalEntryLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = JournalEntryLine
        fields = ['id', 'account', 'account_code', 'account_name', 'description', 'debit', 'credit', 'cost_center']

    def validate(self, data):
        """As MESMAS regras do `clean()` do modelo — porque aqui ele não corre.

        As linhas entram por este serializer encaixado, e o DRF não chama o
        `clean()` do modelo nesse caminho. Sem esta validação, o ecrã gravava
        duas linhas impossíveis:

        - DÉBITO E CRÉDITO na mesma linha: as duas somas de controlo sobem o
          mesmo valor, o lançamento PARECE saldar e não movimenta nada. É a
          maneira mais simples de fazer passar um lançamento inventado.
        - LINHA A ZERO: não é um movimento, é ruído no razão de uma conta.

        A conta tem de ser DE MOVIMENTO: lançar num título (a "31" em vez da
        "311") faz o balancete somar o mesmo valor duas vezes.
        """
        debito = data.get('debit') or 0
        credito = data.get('credit') or 0
        if debito and credito:
            raise serializers.ValidationError(
                'Uma linha não pode ter débito e crédito ao mesmo tempo — '
                'são duas linhas.')
        if not debito and not credito:
            raise serializers.ValidationError('Indique um valor a débito ou a crédito.')
        if debito < 0 or credito < 0:
            raise serializers.ValidationError(
                'Não se lançam valores negativos: troca-se o lado (débito ↔ crédito).')
        conta = data.get('account')
        if conta is not None and not conta.is_movement:
            raise serializers.ValidationError(
                f'A conta {conta.code} é agregadora (título) — escolha uma conta '
                f'de movimento.')
        return data


class JournalEntrySerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    lines = JournalEntryLineSerializer(many=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    journal_name = serializers.CharField(source='journal.name', read_only=True)
    total_debit = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    total_credit = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    is_balanced = serializers.BooleanField(read_only=True)

    class Meta:
        model = JournalEntry
        fields = '__all__'

    def _next_number(self):
        from .models import JournalEntry
        n = JournalEntry.objects.count() + 1
        while JournalEntry.objects.filter(number=f'LC{n:06d}').exists():
            n += 1
        return f'LC{n:06d}'

    def create(self, validated):
        lines = validated.pop('lines', [])
        if not validated.get('number'):
            validated['number'] = self._next_number()
        entry = JournalEntry.objects.create(**validated)
        for ln in lines:
            JournalEntryLine.objects.create(entry=entry, **ln)
        return entry

    def update(self, instance, validated):
        if instance.status == 'POSTED':
            raise serializers.ValidationError('Lançamento lançado é imutável.')
        lines = validated.pop('lines', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for ln in lines:
                JournalEntryLine.objects.create(entry=instance, **ln)
        return instance
