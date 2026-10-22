# -*- coding: utf-8 -*-
"""ATIVAR A PRIMEIRA LICENÇA — um só caminho, usado de dois sítios.

Isto vivia dentro da view `RemoteActivationView`, e era por isso que o
instalador não a podia usar: no momento em que o instalador prepara a base de
dados, ainda não há servidor web a correr para lhe fazer um pedido HTTP. O
resultado prático era o que o LEIA-ME do instalador admitia — *"hoje tem de ser
colocado à mão em {app}\\app\\license.key"*: o cliente acabava a instalação e
encontrava um ecrã bloqueado à espera de um ficheiro que alguém tinha de ir lá
copiar.

Passa a ser uma função. A view chama-a; o `configurar.py` do instalador também,
em processo, logo a seguir às migrações. O mesmo código, a mesma validação, as
mesmas mensagens — e a instalação acaba com o sistema pronto a usar, não com
uma tarefa pendente.

A regra de ouro mantém-se: o cliente NUNCA confia no PCC só por ser o PCC. A
licença que vem é verificada contra a chave pública que já está nesta
instalação, e o código do cliente tem de bater certo. Um PCC comprometido não
consegue instalar aqui uma licença que não assinou.
"""
import base64
import json
import os
import socket


class ErroDeAtivacao(Exception):
    """Falhou — e a mensagem é para ser mostrada a quem está a instalar."""

    def __init__(self, detalhe, estado=502):
        super().__init__(detalhe)
        self.detalhe = detalhe
        self.estado = estado


def activar(codigo, senha, pcc_url=None):
    """Puxa a PRIMEIRA licença do PCC e deixa o sistema pronto.

    `codigo` e `senha` são o código do cliente e a senha de instalação — as duas
    coisas que o técnico já tem para correr o setup.exe (PCC → Gestão de
    Clientes → Acessos). Devolve um dicionário com o que foi aplicado.
    """
    import requests as http
    from django.conf import settings

    from core.support import APP_VERSION
    from licensing.engine.crypto import verify_license
    from licensing.views import _aplicar_extras_pcc

    caminho = os.path.join(settings.BASE_DIR, 'license.key')
    if os.path.exists(caminho):
        raise ErroDeAtivacao(
            'Já há uma licença instalada nesta máquina — use "Sincronizar com o '
            'PCC" para renovar, não a ativação.', 400)

    codigo = (codigo or '').strip()
    senha = senha or ''
    if not (codigo and senha):
        raise ErroDeAtivacao('Indique o código do cliente e a senha de instalação.', 400)

    pcc = pcc_url or os.environ.get('PCC_URL', getattr(settings, 'PCC_URL', ''))
    if not pcc:
        raise ErroDeAtivacao('PCC_URL não configurado nesta instalação.', 500)

    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = ''

    try:
        r = http.post(f'{pcc.rstrip("/")}/api/clm/licenses/activate/',
                      json={'client_code': codigo, 'install_password': senha,
                            'hostname': hostname, 'app_version': APP_VERSION},
                      timeout=20)
    except Exception as e:
        raise ErroDeAtivacao(
            f'Sem ligação ao PCC em {pcc}. Verifique a ligação à Internet e que o '
            f'endereço do fornecedor está certo.\n\nDetalhe técnico: {e}')

    if r.status_code != 200:
        try:
            corpo = r.json()
        except Exception:
            corpo = None
        if isinstance(corpo, dict) and corpo.get('detail'):
            # O PCC respondeu e explicou-se (cliente desconhecido, senha errada,
            # conta suspensa) — essa explicação é melhor do que qualquer uma que
            # se possa inventar aqui.
            raise ErroDeAtivacao(corpo['detail'], r.status_code)
        raise ErroDeAtivacao(f'O endereço {pcc} respondeu {r.status_code} mas não como '
                             f'uma consola PCC. Confirme o endereço do fornecedor.')

    body = r.json()
    raw = (body.get('license_key') or '').strip()
    try:
        data = json.loads(base64.b64decode(raw).decode('utf-8'))
        sig = data.pop('signature', None)
        if not (sig and verify_license(data, sig)):
            raise ErroDeAtivacao('O PCC devolveu uma licença com assinatura inválida '
                                 '— nada foi ativado.')
        if data.get('client_code') != codigo:
            raise ErroDeAtivacao(f'A licença devolvida é do cliente '
                                 f'"{data.get("client_code")}" e não de "{codigo}" '
                                 f'— nada foi ativado.')
    except ErroDeAtivacao:
        raise
    except Exception:
        raise ErroDeAtivacao('Licença devolvida ilegível — nada foi ativado.')

    with open(caminho, 'w') as f:
        f.write(raw)

    flags, erro = _aplicar_extras_pcc(body)

    return {
        'detail': ('Licença ativada com sucesso — o sistema já está pronto a usar.'
                   if not erro else f'Licença ativada, mas {erro}'),
        'license_number': data.get('license_number'),
        'valid_until': data.get('valid_until'),
        'modules': len(data.get('modules') or []),
        'agt_applied': flags['agt_applied'],
        'agt_connection_applied': flags['agt_connection_applied'],
        'company_applied': flags['company_applied'],
        'aviso': erro,
        # A conta do dono, quando o PCC a manda. Quem chama decide o que fazer
        # com ela: o instalador cria o utilizador, o ecrã ignora-a (nesse caso
        # já há alguém com sessão iniciada, logo já há conta).
        'owner': body.get('owner') or None,
    }
