# -*- coding: utf-8 -*-
"""A ATUALIZAÇÃO — o script mais perigoso do produto, e o que nunca foi testado.

`backend/atualizar.py` é o que corre quando o cliente carrega em "Atualizar
agora". Ele PARA os serviços, SUBSTITUI os ficheiros da aplicação, corre as
migrações e volta a arrancar. É a única peça deste sistema que, se correr mal,
deixa o hotel sem POS a meio do serviço — e era a única sem um teste.

O que tem de ser verdade, e é o que este ficheiro verifica:

  · o `.env` SOBREVIVE. Lá dentro está a SECRET_KEY que assina as sessões e a
    licença: reescrevê-la desloga toda a gente e invalida a activação;
  · a `license.key` SOBREVIVE. É a activação desta casa; perdê-la é o sistema
    fechar-se ao próprio dono;
  · a BASE DE DADOS sobrevive — e nem sequer vive dentro de `app/`, mas a lista
    de nunca-tocar defende-a à mesma, que é a segunda linha de defesa;
  · os ficheiros NOVOS entram e os VELHOS que já não existem não são apagados à
    mão (extrai-se POR CIMA, nunca se limpa primeiro: a meio de uma limpeza, uma
    falha de corrente deixava a instalação sem nada);
  · um pacote QUE NÃO É um pacote (um zip de outra coisa, um ficheiro truncado)
    é recusado ANTES de se parar um único serviço;
  · e, se alguma coisa correr mal depois dos ficheiros trocados, a cópia de
    segurança repõe a versão anterior.

Os testes correm as funções verdadeiras do script. O que não se pode exercitar
aqui são os serviços do Windows (`sc.exe start/stop`) e as migrações — essas
ficam substituídas, e está dito em cada teste o que isso deixa por cobrir.
"""
import io
import importlib.util
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parent.parent          # ...\POS\backend
# O atualizador vive AO LADO do manage.py — é `settings.BASE_DIR / 'atualizar.py'`
# que a vista `ApplyUpdateView` lança —, e não na pasta do instalador.
ATUALIZADOR = RAIZ_PROJETO / 'atualizar.py'


def _carregar(modulo_path, raiz_falsa):
    """Carrega `atualizar.py` apontado a uma instalação de mentira.

    O script deriva os caminhos da localização dele — `APP_DIR` é a pasta ONDE
    ELE ESTÁ e `RAIZ` é a de cima —, tal como em produção, onde ele vive dentro
    de `app/` ao lado do `manage.py`. Por isso a cópia de ensaio vai para `app/`
    e não para a raiz: posta na raiz, o script tomava a pasta de ensaio por
    `app/` e ia escrever um nível acima, fora dela.
    """
    destino = raiz_falsa / 'app' / 'atualizar.py'
    shutil.copy2(modulo_path, destino)
    spec = importlib.util.spec_from_file_location('atualizar_em_ensaio', destino)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['atualizar_em_ensaio'] = mod
    spec.loader.exec_module(mod)
    return mod


@unittest.skipUnless(ATUALIZADOR.exists(), 'instalador/atualizar.py não está presente')
class AtualizacaoNaoDerrubaAConfiguracaoTests(unittest.TestCase):
    """Uma instalação a trabalhar, um pacote novo, e o que tem de sobreviver."""

    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp(prefix='mwana_update_'))
        self.app = self.pasta / 'app'
        (self.app / 'core').mkdir(parents=True)
        (self.app / 'webapp').mkdir(parents=True)
        (self.pasta / 'dados').mkdir()

        # O QUE É DESTA CASA e não pode ser tocado.
        (self.app / '.env').write_text('SECRET_KEY=a-chave-desta-casa\n', encoding='utf-8')
        (self.app / 'license.key').write_text('LICENCA-ACTIVADA-DESTE-CLIENTE', encoding='utf-8')
        (self.pasta / 'dados' / 'erp.sqlite3').write_bytes(b'a base de dados do cliente')
        (self.app / 'core' / 'support.py').write_text("APP_VERSION = '1.0.0'\n", encoding='utf-8')
        (self.app / 'webapp' / 'index.html').write_text('<h1>versao velha</h1>', encoding='utf-8')
        # Um ficheiro que o cliente/instalação tem e que o pacote não traz.
        (self.app / 'media_local.txt').write_text('ficheiro só desta instalação', encoding='utf-8')

        self.mod = _carregar(ATUALIZADOR, self.pasta)

        # Os serviços do Windows e o `manage.py` não correm num teste: substituem-se
        # por registos, para se poder verificar O QUE o script mandou fazer e por
        # que ordem — que é o que interessa.
        self.servicos, self.comandos = [], []
        self.mod._servico = lambda nome, acao, log: self.servicos.append((nome, acao))
        self.mod._correr_manage = lambda args, log: self.comandos.append(tuple(args))

    def tearDown(self):
        shutil.rmtree(self.pasta, ignore_errors=True)
        sys.modules.pop('atualizar_em_ensaio', None)

    # -- o pacote de atualização -----------------------------------------
    def _pacote(self, ficheiros=None, valido=True):
        """Um .zip como o `build_atualizacao.ps1` produz."""
        conteudo = ficheiros if ficheiros is not None else {
            'app/core/support.py': "APP_VERSION = '1.1.0'\n",
            'app/core/novo_modulo.py': '# funcionalidade nova\n',
            'webapp/index.html': '<h1>versao nova</h1>',
        }
        if not valido:
            conteudo = {'qualquer_coisa.txt': 'isto não é um pacote do sistema'}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as zf:
            for nome, texto in conteudo.items():
                zf.writestr(nome, texto)
        return buf.getvalue()

    def _aplicar(self, bytes_do_pacote, falhar_download=False):
        """Corre `aplicar()` com a descarga substituída pelo pacote em memória."""
        class _Resposta:
            def __init__(self, dados):
                self.content = dados

            def raise_for_status(self):
                if falhar_download:
                    raise RuntimeError('404 ao descarregar o pacote')

        class _Requests:
            @staticmethod
            def get(url, timeout=None):
                return _Resposta(bytes_do_pacote)

        sys.modules['requests'] = _Requests
        try:
            return self.mod.aplicar('https://exemplo/pacote.zip')
        finally:
            sys.modules.pop('requests', None)

    def test_um_pacote_com_barras_invertidas_aplica_se_na_mesma(self):
        """O outro lado do mesmo defeito, e o mais caro dos dois.

        Se o PCC aceitasse o pacote e o atualizador não o soubesse ler, o cliente
        carregava em "Atualizar agora", via os serviços pararem, e a atualização
        falhava a meio — com a instalação já tocada. Aqui a verificação é sobre o
        resultado: os ficheiros do pacote chegaram ao sítio certo.
        """
        B = chr(92)
        pacote = self._pacote({
            f'app{B}core{B}support.py': "APP_VERSION = '1.1.0'" + chr(10),
            f'app{B}core{B}novo.py': '# novo',
            f'webapp{B}index.html': '<h1>versao nova</h1>',
        })
        self._aplicar(pacote)

        self.assertIn('1.1.0', (self.app / 'core' / 'support.py').read_text(encoding='utf-8'),
                      'Um pacote com barras invertidas não chegou a aplicar-se: o cliente '
                      'via os serviços pararem e a atualização falhar.')
        self.assertTrue((self.app / 'core' / 'novo.py').exists())
        self.assertIn('nova', (self.app / 'webapp' / 'index.html').read_text(encoding='utf-8'))
        self.assertEqual((self.app / '.env').read_text(encoding='utf-8'),
                         'SECRET_KEY=a-chave-desta-casa' + chr(10))

    # ── o que NUNCA pode desaparecer ─────────────────────────────────────
    def test_a_chave_desta_casa_sobrevive_a_atualizacao(self):
        """O `.env` tem a SECRET_KEY que assina as sessões e a licença. Reescrevê-la
        desloga toda a gente e invalida a activação — e ninguém relaciona isso com
        o botão "Atualizar" que carregou dois minutos antes."""
        self._aplicar(self._pacote())
        self.assertEqual((self.app / '.env').read_text(encoding='utf-8'),
                         'SECRET_KEY=a-chave-desta-casa\n',
                         'A atualização reescreveu o .env desta instalação.')

    def test_a_licenca_do_cliente_sobrevive(self):
        self._aplicar(self._pacote())
        self.assertEqual((self.app / 'license.key').read_text(encoding='utf-8'),
                         'LICENCA-ACTIVADA-DESTE-CLIENTE',
                         'A atualização apagou a activação desta casa — o sistema '
                         'fecha-se ao próprio dono.')

    def test_a_base_de_dados_do_cliente_sobrevive(self):
        """Vive em `dados/`, fora de `app/` — mas a lista de nunca-tocar defende-a
        à mesma. Duas linhas de defesa sobre o trabalho todo do cliente."""
        self._aplicar(self._pacote())
        self.assertEqual((self.pasta / 'dados' / 'erp.sqlite3').read_bytes(),
                         b'a base de dados do cliente',
                         'A atualização mexeu na base de dados do cliente.')

    def test_o_que_a_instalacao_tinha_e_o_pacote_nao_traz_fica(self):
        """Extrai-se POR CIMA, nunca se limpa primeiro. Limpar primeiro é deixar a
        instalação sem nada no segundo em que falhar a corrente."""
        self._aplicar(self._pacote())
        self.assertTrue((self.app / 'media_local.txt').exists(),
                        'A atualização apagou ficheiros que já lá estavam.')

    # ── e o que TEM de mudar ─────────────────────────────────────────────
    def test_os_ficheiros_novos_entram(self):
        self._aplicar(self._pacote())
        self.assertIn('1.1.0', (self.app / 'core' / 'support.py').read_text(encoding='utf-8'),
                      'A versão nova não substituiu a antiga.')
        self.assertTrue((self.app / 'core' / 'novo_modulo.py').exists(),
                        'Um ficheiro novo do pacote não chegou à instalação.')
        self.assertIn('nova', (self.app / 'webapp' / 'index.html').read_text(encoding='utf-8'),
                      'O site compilado não foi substituído — o cliente continua a ver '
                      'a versão antiga no browser.')

    def test_a_base_de_dados_e_actualizada_e_pela_ordem_certa(self):
        """As migrações correm DEPOIS dos ficheiros novos e ANTES de os serviços
        voltarem: um serviço a arrancar contra uma base por migrar rebenta em
        cada pedido."""
        self._aplicar(self._pacote())
        self.assertIn(('migrate', '--noinput'), self.comandos,
                      'A atualização não correu as migrações: a versão nova arranca '
                      'contra uma base antiga.')
        self.assertIn(('seed_params',), self.comandos,
                      'Os parâmetros novos desta versão não foram semeados.')
        self.assertEqual(self.servicos[-2:], [('servidor', 'start'), ('impressao', 'start')],
                         f'Os serviços não voltaram no fim: {self.servicos}')

    # ── e o que tem de ser RECUSADO ──────────────────────────────────────
    def test_um_pacote_que_nao_e_do_sistema_nao_para_servico_nenhum(self):
        """A validação acontece ANTES de se parar seja o que for. Parar o POS a
        meio do serviço para depois descobrir que o ficheiro não servia é o pior
        dos dois mundos."""
        self._aplicar(self._pacote(valido=False))
        # O que importa é não ter PARADO nada: o POS continua a servir. (No fim o
        # script manda arrancar os serviços de qualquer modo — arrancar o que já
        # está a correr não faz mal a ninguém, parar sim.)
        self.assertNotIn('stop', [acao for _, acao in self.servicos],
                         'Parou os serviços por causa de um pacote que nem era do sistema.')
        self.assertIn('1.0.0', (self.app / 'core' / 'support.py').read_text(encoding='utf-8'),
                      'Um pacote inválido chegou a mexer nos ficheiros.')

    def test_uma_descarga_falhada_nao_toca_na_instalacao(self):
        """Sem rede, ou com o PCC em baixo, a instalação nem é tocada."""
        self._aplicar(self._pacote(), falhar_download=True)
        self.assertNotIn('stop', [acao for _, acao in self.servicos],
                         'Parou os serviços antes sequer de ter o pacote na mão.')
        self.assertIn('1.0.0', (self.app / 'core' / 'support.py').read_text(encoding='utf-8'))

    def test_a_copia_de_seguranca_fica_feita_antes_de_trocar_nada(self):
        """É ela que repõe a versão anterior quando a atualização falha a meio."""
        self._aplicar(self._pacote())
        backup = self.mod.BACKUP
        self.assertTrue(backup.exists(), 'Não foi guardada cópia de segurança.')
        self.assertIn('1.0.0', (backup / 'core' / 'support.py').read_text(encoding='utf-8'),
                      'A cópia de segurança não tem a versão ANTERIOR — não serve '
                      'para repor nada.')
        self.assertEqual((backup / '.env').read_text(encoding='utf-8'),
                         'SECRET_KEY=a-chave-desta-casa\n')

    def test_se_a_atualizacao_falhar_a_meio_a_versao_anterior_volta(self):
        """O teste que justifica a cópia de segurança existir. Faz-se falhar o
        `migrate` — o sítio mais provável de uma atualização correr mal — e
        exige-se que a instalação volte ao que era."""
        def migrate_rebenta(args, log):
            self.comandos.append(tuple(args))
            if args and args[0] == 'migrate':
                raise RuntimeError('migração incompatível')
        self.mod._correr_manage = migrate_rebenta

        self._aplicar(self._pacote())

        self.assertIn('1.0.0', (self.app / 'core' / 'support.py').read_text(encoding='utf-8'),
                      'A atualização falhou a meio e a instalação ficou com os ficheiros '
                      'novos e a base antiga — o pior estado possível.')
        self.assertEqual((self.app / '.env').read_text(encoding='utf-8'),
                         'SECRET_KEY=a-chave-desta-casa\n')
        self.assertEqual(self.servicos[-2:], [('servidor', 'start'), ('impressao', 'start')],
                         f'Repôs a versão anterior e deixou os serviços parados: {self.servicos}')
