# -*- coding: utf-8 -*-
"""O PCC NA VPS — o que tem de estar certo antes de alguém fazer deploy.

O PCC é o registo central de TODOS os clientes: as licenças, as chaves AGT, as
versões publicadas. Corre num contentor (`deploy/pcc/Dockerfile`) num painel
como o EasyPanel, onde há uma regra que não perdoa: **o que não está no volume
persistente desaparece no redeploy seguinte** — sem erro, sem aviso, sem nada
no log. É a diferença entre uma configuração errada que se vê e uma que só se vê
quando já não há dados.

Estes testes não precisam de VPS nem de Docker: lêem o Dockerfile e arrancam as
settings com as variáveis que ele define, num subprocesso. É o que se pode
provar nesta máquina sobre um deploy que corre noutra.

Correm as settings num SUBPROCESSO de propósito: as settings do Django leem-se
uma vez e ficam, e um teste que mexa no ambiente e as reimporte contamina todos
os que vierem a seguir.
"""
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parent.parent          # ...\POS\backend
DOCKERFILE = RAIZ_PROJETO.parent / 'deploy' / 'pcc' / 'Dockerfile'
ENV_EXEMPLO = RAIZ_PROJETO.parent / 'deploy' / 'pcc' / '.env.example'


def _arrancar_settings(**ambiente):
    """Arranca o Django com este ambiente e devolve (saída, avisos)."""
    amb = dict(os.environ)
    amb.pop('DJANGO_SETTINGS_MODULE', None)
    amb.update({k: str(v) for k, v in ambiente.items()})
    guiao = (
        'import os, warnings, django\n'
        "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')\n"
        'with warnings.catch_warnings(record=True) as w:\n'
        "    warnings.simplefilter('always')\n"
        '    django.setup()\n'
        '    from django.conf import settings\n'
        "    print('MOTOR=' + settings.DATABASES['default']['ENGINE'])\n"
        "    print('NOME=' + str(settings.DATABASES['default']['NAME']))\n"
        "    for a in w:\n"
        "        print('AVISO=' + str(a.message).replace(chr(10), ' '))\n"
    )
    r = subprocess.run([sys.executable, '-W', 'always', '-c', guiao],
                       cwd=str(RAIZ_PROJETO), env=amb, capture_output=True,
                       text=True, encoding='utf-8', errors='replace', timeout=180)
    linhas = (r.stdout or '').splitlines()
    return r, [l[6:] for l in linhas if l.startswith('AVISO=')], \
        {l.split('=', 1)[0]: l.split('=', 1)[1] for l in linhas if l.startswith(('MOTOR=', 'NOME='))}


BASE = dict(DJANGO_DEBUG='False', DJANGO_SECRET_KEY='uma-chave-longa-de-ensaio-xxxxxxxx',
            DJANGO_ALLOWED_HOSTS='pcc.exemplo.ao')


class OPccAvisaQuandoAParteErradaTests(unittest.TestCase):
    """O PCC em SQLite arranca e funciona — e é isso que o torna perigoso."""

    def test_o_pcc_em_sqlite_avisa_que_vai_perder_os_dados(self):
        """A armadilha: sem `DB_ENGINE=postgresql` o Django cai em SQLite, o PCC
        arranca, funciona, e o primeiro redeploy leva as licenças, os clientes e
        as chaves AGT. Quem faz o deploy tem de ler isto no log do arranque, que
        é onde está a olhar nesse momento."""
        r, avisos, bd = _arrancar_settings(SYSTEM_MODE='PCC',
                                           SQLITE_PATH='/tmp/pcc_de_ensaio.sqlite3', **BASE)
        self.assertEqual(r.returncode, 0, f'as settings nem arrancaram: {r.stderr[-600:]}')
        self.assertTrue(bd['MOTOR'].endswith('sqlite3'), bd)
        doPcc = [a for a in avisos if 'PCC' in a]
        self.assertEqual(len(doPcc), 1,
                         f'O PCC em SQLite tem de avisar UMA vez e avisou {len(doPcc)}: {avisos}')
        self.assertIn('DB_ENGINE=postgresql', doPcc[0],
                      'O aviso tem de dizer O QUE FAZER, não só que algo está mal.')

    def test_o_pcc_em_postgresql_nao_avisa_nada(self):
        r, avisos, _ = _arrancar_settings(SYSTEM_MODE='PCC', DB_ENGINE='postgresql',
                                          DB_NAME='mwana_pcc', DB_USER='mwana_pcc',
                                          DB_PASSWORD='x', DB_HOST='pcc-db', **BASE)
        self.assertEqual(r.returncode, 0, r.stderr[-600:])
        self.assertEqual([a for a in avisos if 'PCC' in a], [],
                         'Um PCC bem configurado não pode levar com um aviso — um aviso que '
                         'aparece sempre é um aviso que ninguém lê.')

    def test_a_instalacao_de_um_cliente_em_sqlite_nao_leva_com_o_aviso(self):
        """O cliente corre em SQLite DE PROPÓSITO: é uma casa, num computador,
        com o instalador. O aviso é só do PCC."""
        r, avisos, bd = _arrancar_settings(SQLITE_PATH='/tmp/erp_de_ensaio.sqlite3', **BASE)
        self.assertEqual(r.returncode, 0, r.stderr[-600:])
        self.assertTrue(bd['MOTOR'].endswith('sqlite3'))
        self.assertEqual([a for a in avisos if 'PCC' in a], [])

    def test_em_desenvolvimento_nao_se_avisa_de_nada(self):
        """Com DEBUG ligado está-se a ensaiar, e um aviso a cada arranque é
        ruído que ensina a ignorar avisos."""
        r, avisos, _ = _arrancar_settings(SYSTEM_MODE='PCC', DJANGO_DEBUG='True',
                                          SQLITE_PATH='/tmp/pcc_dev.sqlite3')
        self.assertEqual(r.returncode, 0, r.stderr[-600:])
        self.assertEqual([a for a in avisos if 'PCC' in a], [])


@unittest.skipUnless(DOCKERFILE.exists(), 'deploy/pcc/Dockerfile não está presente')
class OContentorDoPccTests(unittest.TestCase):
    """O que o Dockerfile promete tem de ser o que o código lê."""

    @classmethod
    def setUpClass(cls):
        cls.texto = DOCKERFILE.read_text(encoding='utf-8')
        # As variáveis do bloco ENV, como o contentor as vai ter.
        cls.env = dict(re.findall(r'^\s*(?:ENV\s+)?([A-Z_]+)=(\S+)', cls.texto, re.M))

    def test_a_base_sqlite_cai_dentro_do_volume_persistente(self):
        """Rede de segurança: mesmo que alguém esqueça o `DB_ENGINE`, a base não
        pode nascer dentro da imagem, onde o redeploy a apaga."""
        caminho = self.env.get('SQLITE_PATH')
        self.assertIsNotNone(caminho,
                             'O Dockerfile não define SQLITE_PATH. Sem isso, uma base SQLite '
                             'nasce em /app/db.sqlite3 e desaparece no redeploy seguinte.')
        self.assertTrue(caminho.startswith('/app/dados/'),
                        f'SQLITE_PATH é "{caminho}", fora do volume persistente '
                        f'(/app/dados). É exactamente o que faz perder os dados.')

    def test_tudo_o_que_tem_de_sobreviver_esta_no_volume(self):
        """Os três caminhos de dados e a chave de licenciamento."""
        for var in ('DJANGO_MEDIA_ROOT', 'DJANGO_STATIC_ROOT', 'LICENSING_KEYS_DIR'):
            valor = self.env.get(var)
            self.assertIsNotNone(valor, f'O Dockerfile não define {var}.')
            self.assertTrue(valor.startswith('/app/dados/'),
                            f'{var} aponta para "{valor}", fora do volume persistente.')

    def test_o_volume_e_criado_antes_de_alguem_escrever_la(self):
        self.assertIn('mkdir -p /app/dados', self.texto,
                      'As pastas do volume têm de existir antes do primeiro arranque.')

    def test_as_variaveis_do_contentor_sao_lidas_pelo_codigo(self):
        """UMA VARIÁVEL QUE O CÓDIGO JÁ NÃO LÊ é uma configuração que o deploy
        faz e o sistema ignora — e ninguém dá por isso, porque arranca igual."""
        fontes = []
        for base, _dirs, fich in os.walk(RAIZ_PROJETO):
            if any(x in base for x in ('venv', '__pycache__', 'staticfiles', 'media')):
                continue
            for f in fich:
                if f.endswith('.py'):
                    fontes.append(Path(base) / f)
        texto = '\n'.join(p.read_text(encoding='utf-8', errors='replace') for p in fontes)
        for var in ('SYSTEM_MODE', 'MWANA_WEBAPP', 'SQLITE_PATH', 'DJANGO_MEDIA_ROOT',
                    'DJANGO_STATIC_ROOT', 'LICENSING_KEYS_DIR'):
            self.assertIn(var, texto,
                          f'O Dockerfile define {var} e nenhum ficheiro do backend a lê. '
                          f'Ou foi renomeada no código, ou já não serve para nada.')

    def test_o_contentor_arranca_a_servir_em_todas_as_interfaces(self):
        """`--bind 0.0.0.0:8000`: ligado só a 127.0.0.1, o painel não chega ao
        contentor e o domínio responde 502 sem o log dizer porquê."""
        self.assertIn('0.0.0.0:8000', self.texto)
        self.assertIn('EXPOSE 8000', self.texto)

    def test_a_base_e_migrada_a_cada_arranque(self):
        """Um redeploy traz código novo contra uma base antiga. As migrações têm
        de correr no arranque, senão o primeiro pedido rebenta."""
        self.assertIn('migrate --noinput', self.texto)
        self.assertIn('collectstatic --noinput', self.texto)


@unittest.skipUnless(ENV_EXEMPLO.exists(), 'deploy/pcc/.env.example não está presente')
class OExemploDeConfiguracaoTests(unittest.TestCase):

    def test_o_exemplo_manda_postgresql_e_nao_deixa_passwords_reais(self):
        texto = ENV_EXEMPLO.read_text(encoding='utf-8')
        self.assertIn('DB_ENGINE=postgresql', texto,
                      'O exemplo tem de mandar PostgreSQL — é a configuração certa do PCC.')
        # Nenhum valor a sério num ficheiro que vai para o repositório.
        for linha in texto.splitlines():
            if linha.startswith(('DJANGO_SECRET_KEY=', 'DB_PASSWORD=', 'EMAIL_HOST_PASSWORD=')):
                self.assertIn('TROQUE', linha.upper(),
                              f'Há um valor a sério no exemplo: "{linha.split("=")[0]}".')
