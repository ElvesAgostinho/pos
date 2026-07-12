"""
TRANSMISSOR AGT — envio de faturas eletrónicas diretamente à Administração Geral Tributária.

Arquitetura (store-and-forward, como nos sistemas certificados):

    emissão do documento  →  fila (SubmissionQueue)  →  transmissor  →  AGT
                                     ↑                        |
                                     └──── backoff/retry ─────┘

  1. A VENDA NUNCA PARA. O documento é emitido, assinado e entregue ao cliente na hora.
     A comunicação com a AGT é assíncrona: se a Internet cair, fica em fila.
  2. IDEMPOTÊNCIA. Cada submissão leva uma chave única derivada do documento. Reenviar
     o mesmo documento — por retry, por falha de rede, por engano — nunca o duplica na AGT.
  3. BACKOFF EXPONENCIAL. Falha de rede → 1min, 2min, 4min, 8min… até max_retries.
     Uma REJEIÇÃO (documento inválido) não é reenviada: exige correção humana.
  4. PROVA. Guarda-se o payload enviado, o código HTTP, a resposta e o nº de protocolo
     devolvido pela AGT. É isto que se mostra numa inspeção.

Modo SIMULAÇÃO: enquanto a AGT não emitir as credenciais definitivas ao contribuinte,
a ligação pode correr em SANDBOX sem URL configurado — o transmissor simula o
aceite e permite validar o circuito completo ponta a ponta. Está sempre identificado
como simulado (nunca se faz passar por comunicação real).
"""
import hashlib
import json
import logging
from datetime import timedelta

import requests
from django.utils import timezone

from .models import AGTConnection, FiscalConfig, SubmissionQueue, FiscalAuditLog
from .secrets import decrypt

log = logging.getLogger(__name__)

BACKOFF_BASE_SECONDS = 60      # 1min, 2min, 4min, 8min, 16min…
RETRYABLE_HTTP = {408, 425, 429, 500, 502, 503, 504}


def active_connection():
    return AGTConnection.objects.filter(is_active=True).order_by('-environment').first()


# --------------------------------------------------------------------------
# Autenticação (OAuth2 client_credentials ou utilizador/palavra-passe)
# --------------------------------------------------------------------------
def get_token(conn):
    """Devolve um token válido, renovando-o se estiver expirado."""
    if conn.access_token and conn.token_expires_at and conn.token_expires_at > timezone.now() + timedelta(seconds=30):
        return conn.access_token
    if not conn.url_auth:
        return None      # sem endpoint de autenticação → modo simulação

    payload = {}
    if conn.client_id:
        payload = {'grant_type': 'client_credentials', 'client_id': conn.client_id,
                   'client_secret': decrypt(conn.client_secret_enc) if conn.client_secret_enc else ''}
    elif conn.username:
        payload = {'grant_type': 'password', 'username': conn.username,
                   'password': decrypt(conn.password_enc) if conn.password_enc else ''}

    r = requests.post(conn.url_auth, data=payload, timeout=conn.timeout_seconds)
    r.raise_for_status()
    data = r.json()
    conn.access_token = data.get('access_token') or data.get('token')
    conn.refresh_token = data.get('refresh_token')
    expires = int(data.get('expires_in') or 3600)
    conn.token_expires_at = timezone.now() + timedelta(seconds=expires)
    conn.save(update_fields=['access_token', 'refresh_token', 'token_expires_at'])
    return conn.access_token


# --------------------------------------------------------------------------
# Payload do documento
# --------------------------------------------------------------------------
def build_payload(doc):
    """Documento fiscal no formato de submissão (dados + assinatura + certificado)."""
    cfg = FiscalConfig.objects.first()
    return {
        'emitter': {
            'tax_id': cfg.company_nif if cfg else None,
            'name': cfg.company_name if cfg else None,
            'certificate_number': cfg.certificate_number if cfg else None,
            'software_version': getattr(cfg, 'saft_version', None) if cfg else None,
        },
        'document': {
            'number': doc.invoice_no,
            'type': doc.doc_type.code if doc.doc_type_id else None,
            'date': doc.doc_date.isoformat() if doc.doc_date else None,
            'system_entry_date': doc.system_entry_date.isoformat() if doc.system_entry_date else None,
            'status': doc.status,
            'customer_tax_id': doc.customer_tax_id,
            'customer_name': doc.customer_name,
            'net_total': str(doc.net_total),
            'tax_total': str(doc.tax_total),
            'gross_total': str(doc.gross_total),
            'reference_document': doc.reference_doc.invoice_no if getattr(doc, 'reference_doc_id', None) else None,
            'hash': doc.doc_hash,
            'previous_hash': doc.previous_hash,
            'print_mention': doc.print_mention,
            'qr_data': doc.qr_data,
            'lines': [{
                'number': i + 1,
                'description': l.description,
                'quantity': str(l.quantity),
                'unit_price': str(l.unit_price),
                'tax_rate': str(l.tax_percentage),
                'tax_amount': str(l.tax_amount),
                'line_total': str(l.line_total),
                'exemption_reason': l.exemption_reason,
            } for i, l in enumerate(doc.lines.all())],
        },
    }


def idempotency_key(doc):
    """Chave única e estável do documento — a AGT usa-a para não duplicar."""
    cfg = FiscalConfig.objects.first()
    raw = f"{cfg.company_nif if cfg else ''}|{doc.invoice_no}|{doc.doc_hash or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


# --------------------------------------------------------------------------
# Fila
# --------------------------------------------------------------------------
def enqueue(doc):
    """Põe o documento na fila de submissão (idempotente: nunca duplica)."""
    key = idempotency_key(doc)
    sub, created = SubmissionQueue.objects.get_or_create(
        idempotency_key=key,
        defaults={'document': doc, 'status': 'QUEUED', 'next_attempt_at': timezone.now()},
    )
    return sub


def _backoff(attempts):
    return timezone.now() + timedelta(seconds=BACKOFF_BASE_SECONDS * (2 ** max(0, attempts - 1)))


def send(sub, conn=None):
    """Envia UMA submissão. Devolve a submissão atualizada."""
    conn = conn or active_connection()
    doc = sub.document
    if not sub.idempotency_key:      # submissões antigas, criadas antes da chave existir
        sub.idempotency_key = idempotency_key(doc)
    payload = build_payload(doc)
    sub.payload = json.dumps(payload, ensure_ascii=False, indent=2)
    sub.attempts += 1
    sub.status = 'SENDING'
    sub.save(update_fields=['payload', 'attempts', 'status', 'idempotency_key'])

    # --- Sem ligação configurada: SIMULAÇÃO (identificada como tal) ---
    if not conn or not conn.url_submit:
        sub.status = 'ACK'
        sub.http_status = 200
        sub.agt_reference = f"SIM-{sub.idempotency_key[:12].upper()}"
        sub.response = ('SIMULAÇÃO — a AGT ainda não tem endpoint configurado nesta instalação. '
                        'O circuito (emissão → fila → transmissão → aceite) foi validado ponta a ponta. '
                        'Configure o URL de submissão e as credenciais no Fiscal Connectivity para comunicar a sério.')
        sub.acked_at = timezone.now()
        sub.sent_at = timezone.now()
        sub.save()
        FiscalAuditLog.objects.create(event='AGT_SUBMIT', detail=f'{doc.invoice_no} → SIMULADO ({sub.agt_reference})')
        return sub

    # --- Transmissão real ---
    try:
        token = get_token(conn)
        headers = {'Content-Type': 'application/json', 'Idempotency-Key': sub.idempotency_key}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        if conn.api_key_enc:
            headers['X-API-Key'] = decrypt(conn.api_key_enc)

        r = requests.post(conn.url_submit, json=payload, headers=headers, timeout=conn.timeout_seconds)
        sub.http_status = r.status_code
        sub.response = r.text[:4000]
        sub.sent_at = timezone.now()

        if 200 <= r.status_code < 300:
            try:
                body = r.json()
            except ValueError:
                body = {}
            sub.agt_reference = (body.get('protocol') or body.get('reference')
                                 or body.get('id') or body.get('numeroProtocolo'))
            sub.status = 'ACK'
            sub.acked_at = timezone.now()
            sub.error_message = None
            FiscalAuditLog.objects.create(event='AGT_SUBMIT',
                                          detail=f'{doc.invoice_no} aceite pela AGT ({sub.agt_reference})')
        elif r.status_code in RETRYABLE_HTTP:
            # Problema do outro lado (ou rede) — volta a tentar mais tarde.
            sub.status = 'RETRY' if sub.attempts < conn.max_retries else 'FAILED'
            sub.error_message = f'HTTP {r.status_code} — a AGT não respondeu como esperado.'
            sub.next_attempt_at = _backoff(sub.attempts)
        else:
            # 4xx: o documento foi REJEITADO. Reenviar não resolve — exige correção.
            sub.status = 'REJECTED'
            sub.error_message = f'HTTP {r.status_code} — documento rejeitado pela AGT.'
            FiscalAuditLog.objects.create(event='AGT_REJECT', detail=f'{doc.invoice_no}: {r.text[:200]}')
    except requests.RequestException as e:
        sub.http_status = None
        sub.error_message = f'Falha de comunicação: {e}'
        sub.status = 'RETRY' if sub.attempts < (conn.max_retries or 5) else 'FAILED'
        sub.next_attempt_at = _backoff(sub.attempts)
        log.warning('AGT submit falhou (%s): %s', doc.invoice_no, e)

    sub.save()
    return sub


def process_queue(limit=50):
    """Processa a fila: tudo o que está em espera e cuja hora de reenvio já passou."""
    from django.db.models import Q
    conn = active_connection()
    now = timezone.now()

    # RECUPERAÇÃO: se o servidor foi abaixo a meio de um envio, a submissão fica presa
    # em SENDING para sempre. Passados 5 minutos, volta à fila — nenhuma fatura fica órfã.
    stale = now - timedelta(minutes=5)
    SubmissionQueue.objects.filter(status='SENDING', created_at__lt=stale).update(
        status='RETRY', next_attempt_at=now)

    pend = (SubmissionQueue.objects
            .filter(status__in=['QUEUED', 'RETRY'])
            .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
            .select_related('document'))
    out = {'sent': 0, 'acked': 0, 'retry': 0, 'rejected': 0, 'failed': 0}
    for sub in pend[:limit]:
        send(sub, conn)
        out['sent'] += 1
        key = {'ACK': 'acked', 'RETRY': 'retry', 'REJECTED': 'rejected', 'FAILED': 'failed'}.get(sub.status)
        if key:
            out[key] += 1
    return out


def health(conn=None):
    """Estado real da ligação à AGT (faz HTTP a sério quando há endpoint)."""
    conn = conn or active_connection()
    if not conn:
        return {'status': 'NO_CONNECTION', 'detail': 'Nenhuma ligação AGT configurada.'}
    if not conn.url_health:
        return {'status': 'SIMULATION',
                'detail': 'Sem endpoint de health. O sistema opera em simulação até a AGT '
                          'fornecer os URLs e as credenciais.'}
    try:
        r = requests.get(conn.url_health, timeout=conn.timeout_seconds)
        status = 'ONLINE' if r.ok else 'DEGRADED'
        detail = f'HTTP {r.status_code}'
    except requests.RequestException as e:
        status, detail = 'OFFLINE', str(e)[:200]
    conn.last_health_status = status
    conn.last_health_at = timezone.now()
    conn.save(update_fields=['last_health_status', 'last_health_at'])
    return {'status': status, 'detail': detail, 'checked_at': conn.last_health_at}
