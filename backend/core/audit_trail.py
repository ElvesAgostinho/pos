"""
TRILHO DE AUDITORIA UNIVERSAL — o sistema regista tudo, sozinho.

O problema dos ERPs mal feitos: cada módulo "lembra-se" de registar o que quer, e o
resto perde-se. Quando o auditor pergunta "quem anulou esta fatura?", ninguém sabe.

Aqui a captura é AUTOMÁTICA, ao nível da base de dados (signals do Django): qualquer
criação, alteração ou eliminação em QUALQUER modelo do sistema fica registada — com
quem fez, quando, de que posto, o que estava antes, o que ficou depois. Um módulo novo
fica auditado sem escrever uma linha.

Além disso captura-se o que os signals não veem:
  · CONSULTAS (quem viu o quê) — via middleware;
  · ANULAÇÕES com motivo (fatura, comanda da cozinha/bar/pastelaria, lançamento);
  · EXPORTAÇÕES (quem tirou dados do sistema — é aqui que as fugas acontecem).
"""
import json
import threading

from django.db import models
from django.utils import timezone

# Contexto do pedido HTTP em curso (quem, de onde) — os signals não o conhecem.
_ctx = threading.local()


def set_context(user=None, ip=None, path=None, hotel_id=None):
    _ctx.user = user
    _ctx.ip = ip
    _ctx.path = path
    _ctx.hotel_id = hotel_id


def get_context():
    return {
        'user': getattr(_ctx, 'user', None),
        'ip': getattr(_ctx, 'ip', None),
        'path': getattr(_ctx, 'path', None),
        'hotel_id': getattr(_ctx, 'hotel_id', None),
    }


class AuditEvent(models.Model):
    """Um acontecimento no sistema. Nunca se apaga, nunca se edita."""
    ACTIONS = [
        ('CREATE', 'Criado'), ('UPDATE', 'Alterado'), ('DELETE', 'Eliminado'),
        ('VOID', 'Anulado'), ('VIEW', 'Consultado'), ('EXPORT', 'Exportado'),
        ('LOGIN', 'Entrada no sistema'), ('LOGOUT', 'Saída'), ('DENIED', 'Acesso recusado'),
        ('PRINT', 'Impresso'), ('SUBMIT', 'Comunicado à AGT'),
    ]

    at = models.DateTimeField(default=timezone.now, db_index=True)
    action = models.CharField(max_length=10, choices=ACTIONS, db_index=True)

    # Onde aconteceu — é isto que permite organizar por ÁREA e DEPARTAMENTO.
    module = models.CharField(max_length=40, db_index=True)     # pms, pos, fiscal, accounting…
    area = models.CharField(max_length=40, blank=True, null=True, db_index=True)  # Cozinha, Bar, Receção…
    entity = models.CharField(max_length=60, db_index=True)     # Reservation, FiscalDocument…
    entity_id = models.CharField(max_length=40, blank=True, null=True, db_index=True)
    label = models.CharField(max_length=250)                    # o registo, em linguagem humana

    # Quem, quando, de onde.
    user = models.CharField(max_length=120, blank=True, null=True, db_index=True)
    ip_address = models.CharField(max_length=60, blank=True, null=True)
    hotel_id = models.IntegerField(blank=True, null=True, db_index=True)

    # O que mudou (só os campos que mudaram — não a linha inteira).
    changes = models.JSONField(blank=True, null=True)
    reason = models.CharField(max_length=255, blank=True, null=True)   # motivo da anulação
    amount = models.DecimalField(max_digits=16, decimal_places=2, blank=True, null=True)

    # Texto achatado para a PESQUISA GLOBAL (um só campo, um só índice).
    search_text = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'core_audit_event'
        ordering = ['-at']
        indexes = [
            models.Index(fields=['module', '-at']),
            models.Index(fields=['entity', 'entity_id']),
        ]

    def __str__(self):
        return f"[{self.at:%Y-%m-%d %H:%M}] {self.user or '?'} {self.get_action_display()} {self.label}"


# --------------------------------------------------------------------------
# Mapa: modelo → módulo e área do negócio (é a organização por departamento)
# --------------------------------------------------------------------------
MODULE_AREA = {
    'pms': ('PMS', 'Alojamento'),
    'pos': ('POS', 'Vendas'),
    'production': ('Restauração', 'Produção'),
    'inventory': ('Stock', 'Armazém'),
    'procurement': ('Compras', 'Aprovisionamento'),
    'esm': ('Compras', 'Fornecedores'),
    'finance': ('Financeiro', 'Tesouraria'),
    'accounting': ('Contabilidade', 'Contabilidade'),
    'fiscal': ('Fiscal', 'AGT'),
    'identity': ('Administração', 'Estrutura'),
    'auth_engine': ('Segurança', 'Acessos'),
    'eae': ('Segurança', 'Perfis'),
    'commercial': ('Comercial', 'Preços'),
    'licensing': ('Administração', 'Licenciamento'),
    'workforce': ('Recursos Humanos', 'Pessoal'),
}

# Estações de produção: uma linha de comanda pertence à Cozinha, ao Bar ou à Pastelaria.
KDS_AREA = {'KITCHEN': 'Cozinha', 'BAR': 'Bar', 'PASTRY': 'Pastelaria', 'NONE': 'Sem produção'}

# Modelos que NÃO se auditam (senão o trilho auditava-se a si próprio, ou enchia-se de ruído).
SKIP_MODELS = {
    'core.auditevent', 'pos.posauditlog', 'fiscal.fiscalauditlog', 'auth_engine.autheventlog',
    'auth_engine.usersession', 'django_celery_beat.periodictask', 'sessions.session',
    'admin.logentry', 'contenttypes.contenttype', 'auth.permission',
}


def record(action, instance=None, *, module=None, area=None, entity=None, entity_id=None,
           label=None, changes=None, reason=None, amount=None, user=None):
    """Escreve um acontecimento. Nunca rebenta o pedido do utilizador se falhar."""
    try:
        ctx = get_context()
        app = instance._meta.app_label if instance is not None else (module or 'core')
        mod, ar = MODULE_AREA.get(app, (module or app.title(), area))
        ent = entity or (instance.__class__.__name__ if instance is not None else 'Sistema')
        eid = str(entity_id if entity_id is not None else (getattr(instance, 'pk', '') or ''))
        lab = label or (str(instance)[:240] if instance is not None else '')

        # Área específica: uma linha de POS que vai para o BAR pertence ao Bar, não a "Vendas".
        station = getattr(instance, 'kds_station', None) if instance is not None else None
        if station:
            ar = KDS_AREA.get(station, ar)

        ev = AuditEvent(
            action=action, module=module or mod, area=area or ar,
            entity=ent, entity_id=eid or None, label=lab,
            user=user or ctx['user'], ip_address=ctx['ip'], hotel_id=ctx['hotel_id'],
            changes=changes, reason=reason, amount=amount,
        )
        # Tudo o que se pode pesquisar, num só campo.
        ev.search_text = ' '.join(str(x) for x in [
            ev.module, ev.area, ev.entity, ev.entity_id, ev.label, ev.user,
            ev.reason, ev.get_action_display(),
            json.dumps(changes, ensure_ascii=False) if changes else '',
        ] if x).lower()
        ev.save()
        return ev
    except Exception:      # a auditoria NUNCA pode partir a operação
        return None
