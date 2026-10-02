"""
PONTE WHATSAPP — ligar o número que o hotel já usa, sem esperar pela Meta.

Porquê uma ponte e não um cliente dentro do Django: as bibliotecas que falam o
protocolo do WhatsApp Web (Baileys, whatsapp-web.js) são Node e precisam de
manter uma ligação aberta e um estado de sessão vivo — coisa que um processo
WSGI, que nasce e morre a cada pedido, não sabe fazer. Por isso a ponte é um
serviço à parte e este módulo é o CLIENTE HTTP dela: fala-lhe por uma API
pequena e explícita, documentada em `CONTRATO` mais abaixo.

A disciplina é a mesma do Channel Manager e do `fiscal/agt_client.py`: nunca se
fabrica um "ligado" que não foi confirmado do outro lado. Sem endereço de ponte
configurado, as acções dizem exactamente o que falta em vez de fingirem.
"""
import base64
from io import BytesIO

import requests

TIMEOUT = 20

CONTRATO = """
O serviço de ponte tem de expor estes quatro endpoints (JSON, com o cabeçalho
`Authorization: Bearer <bridge_token>`), um por sessão identificada por `session`:

  POST  /sessions/<session>/start   {"method": "QR"|"PHONE", "phone": "+2449..."}
        -> {"status": "PAIRING", "qr": "<conteúdo do QR>"}            (method=QR)
        -> {"status": "PAIRING", "pairing_code": "ABCD-EFGH"}         (method=PHONE)
        -> {"status": "CONNECTED", "number": "+2449..."}              (já emparelhado)

  GET   /sessions/<session>/status
        -> {"status": "DISCONNECTED"|"PAIRING"|"CONNECTED"|"ERROR",
            "qr": "...", "pairing_code": "...", "number": "...", "message": "..."}

  POST  /sessions/<session>/logout  -> {"status": "DISCONNECTED"}

  POST  /sessions/<session>/send    {"to": "+2449...", "text": "..."}
        -> {"id": "<id da mensagem>"}
"""


class PonteIndisponivel(Exception):
    """A ponte não respondeu, ou não está configurada."""


def _base(settings_obj):
    url = (settings_obj.bridge_url or '').strip().rstrip('/')
    if not url:
        raise PonteIndisponivel(
            'Ainda não há serviço de ponte configurado. Indique o endereço do serviço '
            '(e a chave) em "API não oficial" — é o serviço que mantém a sessão do '
            'WhatsApp Web aberta com o número do hotel.')
    return url


def _headers(settings_obj):
    h = {'Content-Type': 'application/json'}
    if settings_obj.bridge_token:
        h['Authorization'] = f'Bearer {settings_obj.bridge_token}'
    return h


def _sessao(settings_obj):
    """Uma sessão por hotel — dois hotéis do mesmo grupo têm números diferentes."""
    return f'hotel-{settings_obj.hotel_id}'


def _pedir(settings_obj, metodo, caminho, dados=None):
    url = f'{_base(settings_obj)}/sessions/{_sessao(settings_obj)}{caminho}'
    try:
        r = requests.request(metodo, url, json=dados, headers=_headers(settings_obj), timeout=TIMEOUT)
    except requests.RequestException as e:
        raise PonteIndisponivel(f'Não foi possível falar com o serviço de ponte ({url}): {e}')
    if r.status_code >= 400:
        detalhe = ''
        try:
            detalhe = (r.json() or {}).get('message') or r.text[:200]
        except ValueError:
            detalhe = r.text[:200]
        raise PonteIndisponivel(f'O serviço de ponte recusou o pedido ({r.status_code}): {detalhe}')
    try:
        return r.json() or {}
    except ValueError:
        raise PonteIndisponivel('O serviço de ponte respondeu algo que não é JSON.')


def start(settings_obj):
    """Começa (ou retoma) a sessão. Devolve o que a ponte deu para emparelhar."""
    dados = {'method': settings_obj.pairing_method or 'QR'}
    if (settings_obj.pairing_method or 'QR') == 'PHONE':
        numero = (settings_obj.whatsapp_phone_number or '').strip()
        if not numero:
            raise PonteIndisponivel(
                'Para emparelhar por código é preciso o número de telemóvel do hotel — '
                'é para esse telefone que o WhatsApp mostra o pedido.')
        dados['phone'] = numero
    return _pedir(settings_obj, 'POST', '/start', dados)


def status(settings_obj):
    return _pedir(settings_obj, 'GET', '/status')


def logout(settings_obj):
    return _pedir(settings_obj, 'POST', '/logout')


def send(settings_obj, to, text):
    return _pedir(settings_obj, 'POST', '/send', {'to': to, 'text': text})


def qr_png(conteudo):
    """O QR como imagem, para o ecrã o mostrar sem bibliotecas no browser.

    O que a ponte devolve é o TEXTO do QR (a string que o WhatsApp Web gera); é
    aqui que vira desenho, no mesmo sítio onde a factura gera o dela.
    """
    if not conteudo:
        return None
    try:
        import qrcode
        img = qrcode.make(conteudo, box_size=6, border=2)
        buf = BytesIO()
        img.save(buf, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
    except Exception:
        return None
