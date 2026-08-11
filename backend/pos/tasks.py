"""
TAREFAS DE FUNDO DO POS — hoje só o envio de e-mail.

A criação do registo no EmailOutbox (mailer.send) continua síncrona — quem
chama sabe logo que ficou em fila. O que vai para o Celery é só a parte que
demora e depende de rede (a ligação SMTP em si), para um pedido HTTP nunca
ficar preso à espera de um servidor de e-mail lento ou em baixo.
"""
import logging

from celery import shared_task

log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, outbox_id, reply_to=None):
    """Entrega o e-mail já registado em EmailOutbox (status QUEUED) e atualiza o estado."""
    from django.conf import settings
    from .models import EmailOutbox
    from .params import P

    try:
        reg = EmailOutbox.objects.get(pk=outbox_id)
    except EmailOutbox.DoesNotExist:
        log.warning("send_email_task: outbox %s já não existe", outbox_id)
        return

    host = P.text(9500, '') or getattr(settings, 'EMAIL_HOST', '')
    password = P.text(9503, '') or getattr(settings, 'EMAIL_HOST_PASSWORD', '')
    if not (host and password):
        reg.status = 'SIMULATED'
        reg.save(update_fields=['status'])
        return

    try:
        from django.core.mail import EmailMessage, get_connection
        conn = get_connection(
            host=host,
            port=P.int(9501, 0) or getattr(settings, 'EMAIL_PORT', 587),
            username=P.text(9502, '') or getattr(settings, 'EMAIL_HOST_USER', ''),
            password=password,
            use_tls=P.bool(9505, True),
        )
        remetente = (P.text(9504, '') or getattr(settings, 'DEFAULT_FROM_EMAIL', None))
        to = [t.strip() for t in reg.to.split(';') if t.strip()]
        msg = EmailMessage(subject=reg.subject, body=reg.body or '',
                           from_email=remetente, connection=conn, to=to,
                           reply_to=[reply_to] if reply_to else None)
        msg.content_subtype = 'html'
        msg.send(fail_silently=False)
        reg.status = 'SENT'
        reg.save(update_fields=['status'])
    except Exception as e:                                    # nunca rebenta a fila
        reg.status, reg.error = 'FAILED', str(e)[:500]
        reg.save(update_fields=['status', 'error'])
        raise self.retry(exc=e)
