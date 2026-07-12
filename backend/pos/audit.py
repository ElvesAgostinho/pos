"""Helper do Motor 10 — regista eventos de operação do POS (quem/quando/IP/valor)."""


def _ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')


def log_event(request, event_type, description, *, operator_name=None, outlet=None,
              terminal_name=None, reference=None, old_value=None, new_value=None, amount=None):
    from .models import POSAuditLog
    try:
        POSAuditLog.objects.create(
            event_type=event_type,
            description=description,
            operator_name=operator_name,
            user=getattr(getattr(request, 'user', None), 'username', None) or None,
            outlet=outlet,
            terminal_name=terminal_name,
            reference=reference,
            ip_address=_ip(request),
            old_value=old_value,
            new_value=new_value,
            amount=amount,
        )
    except Exception:
        # A auditoria nunca deve quebrar a operação.
        pass
