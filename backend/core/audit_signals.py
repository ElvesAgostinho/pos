"""
Captura automática. Nenhum módulo precisa de se lembrar de registar nada.
"""
import datetime
import uuid
from decimal import Decimal

from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver

from .audit_trail import AuditEvent, SKIP_MODELS, record

# Campos que não vale a pena registar como "alteração" (ruído).
NOISE = {'updated_at', 'last_login', 'modified', 'search_text', 'password'}

# Campos que indicam ANULAÇÃO — e onde está o motivo.
VOID_FLAGS = [('is_void', 'void_reason'), ('status', None)]
VOID_STATUS = {'VOID', 'CANCELLED', 'A', 'REJECTED', 'CANCELED'}


SKIP_APPS = {'contenttypes', 'sessions', 'admin', 'migrations', 'token_blacklist',
             'auth', 'django_celery_beat', 'django_celery_results'}


def _skip(instance):
    app = instance._meta.app_label
    return (f'{app}.{instance._meta.model_name}' in SKIP_MODELS
            or app in SKIP_APPS)


def _json_safe(v):
    """O trilho guarda-se em JSON: datas, decimais e UUIDs têm de ir como texto.
    (Sem isto, o registo de ELIMINAÇÃO — o mais importante de todos — falhava em
    silêncio, porque o retrato do registo apagado leva sempre um campo de data.)"""
    if isinstance(v, (Decimal, uuid.UUID)):
        return str(v)
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, (bytes, memoryview)):
        return '<binário>'
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def _snapshot(instance):
    out = {}
    for f in instance._meta.fields:
        if f.name in NOISE:
            continue
        try:
            out[f.name] = _json_safe(getattr(instance, f.attname, None))
        except Exception:
            continue
    return out


def _amount_of(instance):
    for f in ('grand_total', 'gross_total', 'amount', 'total', 'line_total'):
        v = getattr(instance, f, None)
        if isinstance(v, Decimal):
            return v
    return None


@receiver(pre_save)
def _before(sender, instance, **kw):
    """Guarda o estado ANTES, para se poder dizer o que mudou."""
    if _skip(instance) or not instance.pk:
        return
    try:
        old = sender.objects.filter(pk=instance.pk).first()
        instance._audit_before = _snapshot(old) if old else None
    except Exception:
        instance._audit_before = None


@receiver(post_save)
def _after(sender, instance, created, **kw):
    if _skip(instance):
        return
    if created:
        record('CREATE', instance, amount=_amount_of(instance))
        return

    before = getattr(instance, '_audit_before', None)
    after = _snapshot(instance)
    if not before:
        record('UPDATE', instance, amount=_amount_of(instance))
        return

    changes = {k: {'antes': before.get(k), 'depois': after.get(k)}
               for k in after if before.get(k) != after.get(k)}
    if not changes:
        return   # gravou-se, mas nada mudou de facto

    # É uma ANULAÇÃO? (o motivo interessa mais do que o campo)
    reason = None
    action = 'UPDATE'
    if changes.get('is_void', {}).get('depois') is True:
        action, reason = 'VOID', getattr(instance, 'void_reason', None)
    elif 'status' in changes and str(changes['status']['depois']) in VOID_STATUS:
        action = 'VOID'
        reason = (getattr(instance, 'void_reason', None) or getattr(instance, 'cancel_reason', None)
                  or getattr(instance, 'notes', None))
    record(action, instance, changes=changes, reason=reason, amount=_amount_of(instance))


@receiver(post_delete)
def _deleted(sender, instance, **kw):
    if _skip(instance):
        return
    # Eliminar é o acontecimento mais importante de todos — é o que desaparece do sistema.
    record('DELETE', instance, changes={'eliminado': _snapshot(instance)}, amount=_amount_of(instance))
