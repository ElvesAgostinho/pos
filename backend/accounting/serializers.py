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
