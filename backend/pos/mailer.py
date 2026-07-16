"""
MOTOR DE E-MAIL — o que faltava para os modelos de e-mail deixarem de ser decoração.

O backoffice já tinha TUDO menos o envio: modelos por língua (EmailTemplate/Text),
variáveis (@Model[0].Campo — TemplateVariable), anexos (TemplateAttachment) e os
parâmetros de Marketing (4079/4179 pedidos de eventos, 4080/4180 newsletter). Este
módulo é só o carteiro: pega no que está configurado e envia.

Regras:
  · NUNCA se envia sem registo: cada e-mail fica no EmailOutbox (enviado ou falhado,
    com o erro). Um e-mail "que se perdeu" sem rasto é uma reserva perdida sem culpado.
  · Sem password SMTP configurada (ambiente de desenvolvimento), o envio é SIMULADO:
    fica no outbox como SIMULATED — o fluxo testa-se sem mandar e-mails a clientes reais.
  · As variáveis vêm do CONTEXTO que o chamador dá; `is_table` (a caixa da ficha da
    variável) faz de uma lista uma tabela HTML.
"""
from django.conf import settings


def _render_valor(valor, como_tabela=False):
    """Um valor simples vira texto; uma lista com is_table vira tabela HTML."""
    if como_tabela and isinstance(valor, (list, tuple)) and valor:
        if isinstance(valor[0], dict):
            cab = list(valor[0].keys())
            linhas = ''.join(
                '<tr>' + ''.join(f'<td style="border:1px solid #ccc;padding:4px">{r.get(c, "")}</td>'
                                 for c in cab) + '</tr>'
                for r in valor)
            head = ''.join(f'<th style="border:1px solid #ccc;padding:4px">{c}</th>' for c in cab)
            return f'<table style="border-collapse:collapse">{head}{linhas}</table>'
        return '<br>'.join(str(v) for v in valor)
    return '' if valor is None else str(valor)


def render(template, ctx=None, culture='pt-PT'):
    """Devolve (assunto, corpo) do modelo NA língua pedida, com as variáveis substituídas.

    Tokens aceites: `@Model[0].Campo` (o formato HOST) e `{Campo}`.
    """
    from .models import TemplateVariable
    ctx = ctx or {}
    texto = (template.texts.filter(culture=culture).first()
             or template.texts.first())
    assunto = (texto.subject if texto else '') or template.name
    corpo = (texto.body if texto else '') or ''

    # as variáveis DA FICHA dizem como cada campo se renderiza (is_table)
    defs = {v.field: v for v in TemplateVariable.objects.filter(culture=culture)}
    for campo, valor in ctx.items():
        v = defs.get(campo)
        rend = _render_valor(valor, como_tabela=bool(v and getattr(v, 'is_table', False)))
        corpo = corpo.replace(f'@Model[0].{campo}', rend).replace('{' + campo + '}', rend)
        assunto = assunto.replace(f'@Model[0].{campo}', rend).replace('{' + campo + '}', rend)
    return assunto, corpo


def send(to, subject, body, reply_to=None, template=None, context_ref=None):
    """Envia (ou simula) e REGISTA. Devolve o registo do outbox."""
    from .models import EmailOutbox
    to = [t.strip() for t in (to if isinstance(to, (list, tuple)) else str(to).split(';'))
          if t and t.strip()]
    reg = EmailOutbox.objects.create(
        to='; '.join(to), subject=subject[:300], body=body,
        template=template, context_ref=(context_ref or '')[:120], status='QUEUED')
    if not to:
        reg.status, reg.error = 'FAILED', 'Sem destinatários.'
        reg.save(update_fields=['status', 'error'])
        return reg

    if not getattr(settings, 'EMAIL_HOST_PASSWORD', ''):
        # ambiente sem SMTP: o fluxo funciona, o envio é simulado e fica no registo
        reg.status = 'SIMULATED'
        reg.save(update_fields=['status'])
        return reg

    try:
        from django.core.mail import EmailMessage
        msg = EmailMessage(subject=subject, body=body,
                           from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
                           to=to, reply_to=[reply_to] if reply_to else None)
        msg.content_subtype = 'html'
        msg.send(fail_silently=False)
        reg.status = 'SENT'
        reg.save(update_fields=['status'])
    except Exception as e:                                    # nunca rebenta o fluxo que enviou
        reg.status, reg.error = 'FAILED', str(e)[:500]
        reg.save(update_fields=['status', 'error'])
    return reg


def send_template(template, to, ctx=None, culture='pt-PT', reply_to=None, context_ref=None):
    assunto, corpo = render(template, ctx, culture)
    return send(to, assunto, corpo, reply_to=reply_to, template=template, context_ref=context_ref)
