# -*- coding: utf-8 -*-
"""A INSTALAÇÃO, CORRIDA A SÉRIO — e o primeiro dia do cliente.

O `setup.exe` tem duas metades. Uma é empacotamento (o Inno Setup a extrair
ficheiros e a registar serviços) e essa é mecânica: ou extrai, ou não extrai.
A outra é `instalador/configurar.py` — o par de mãos que a Primavera esconde
atrás da barra de progresso: escreve o `.env`, cria a base de dados, semeia o
catálogo de parâmetros, o catálogo fiscal, as unidades de medida e o plano de
contas, activa a licença e cria a conta do dono.

É nessa segunda metade que uma instalação falha de maneiras que ninguém vê na
hora. E já falhou, duas vezes, do mesmo modo: um seed que o instalador não corria.

  · sem `seed_uoms`, o cliente não conseguia criar NENHUM artigo (o modelo exige
    uma unidade de medida e a ficha do artigo deriva-a — sem nenhuma cadastrada,
    não há de onde a derivar). Foi encontrado a investigar "não consigo criar
    artigo" num cliente real;
  · sem `seed_accounting`, não há plano de contas nem diários — e
    `post_pos_ticket` devolve `None` e DESISTE EM SILÊNCIO. Cada venda do dia era
    cobrada, declarada à AGT, e não chegava à contabilidade. Ninguém dava por
    nada até o contabilista abrir o razão no fim do mês e encontrá-lo vazio, com
    as facturas todas já emitidas e o período a fechar.

Os dois eram invisíveis a toda a suite de testes, porque a suite corre as
migrações e os testes semeiam o que precisam. Ninguém testava a INSTALAÇÃO.

Isto corre o configurador verdadeiro, como subprocesso, contra uma pasta
temporária — e depois pergunta à base de dados que ele criou aquilo que o
cliente vai perguntar no primeiro dia: consigo entrar? consigo criar um artigo?
consigo emitir uma factura? a venda chega à contabilidade?
"""
import configparser
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parent.parent          # ...\POS\backend
INSTALADOR = RAIZ_PROJETO.parent / 'instalador'
CONFIGURADOR = INSTALADOR / 'configurar.py'


@unittest.skipUnless(CONFIGURADOR.exists(), 'instalador/configurar.py não está presente')
class InstalacaoDoZeroTests(unittest.TestCase):
    """Uma instalação acabada de montar, feita pelo configurador verdadeiro.

    NÃO é um APITestCase de propósito: não queremos a base de dados de teste do
    Django nem as migrações já aplicadas. Queremos o que o cliente tem — uma
    pasta vazia e um `instalacao.ini`.
    """

    @classmethod
    def setUpClass(cls):
        cls.pasta = Path(tempfile.mkdtemp(prefix='mwana_instalacao_'))

        # A ÁRVORE QUE O SETUP CRIA, montada a sério — o configurador deriva
        # TUDO da sua própria localização, por isso tem de estar aqui dentro:
        #   configurar.py   o configurador
        #   app/            o backend Django
        #   python/         o Python embutido (o cliente não instala Python)
        #   dados/          base, media, logs — sobrevive às atualizações
        #
        # O backend é COPIADO e não ligado por symlink, e a razão é o que faz
        # deste teste uma instalação de facto: o configurador escreve o `.env`
        # dentro de `app`, e com um symlink encontraria o `.env` que já existe no
        # backend de desenvolvimento, respeitá-lo-ia ("mantido"), e o teste
        # passava a medir a configuração desta máquina em vez do primeiro arranque
        # — ou, pior, escrevia por cima dela.
        cls.app = cls.pasta / 'app'
        shutil.copytree(RAIZ_PROJETO, cls.app,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.env',
                                                      'staticfiles', '*.sqlite3',
                                                      'media', 'logs'))
        shutil.copy2(CONFIGURADOR, cls.pasta / 'configurar.py')
        # O Python embutido: o configurador chama `python/python.exe`. Aponta-se
        # para o desta máquina, que faz o mesmo papel que o embutido no pacote.
        (cls.pasta / 'python').symlink_to(Path(sys.executable).parent,
                                          target_is_directory=True)

        cls.ini = cls.pasta / 'instalacao.ini'
        cls.base = cls.pasta / 'dados' / 'erp.sqlite3'

        cfg = configparser.ConfigParser()
        cfg['bd'] = {'tipo': 'sqlite'}
        cfg['dono'] = {'utilizador': 'dono', 'password': 'PrimeiroDia#2026'}
        with open(cls.ini, 'w', encoding='utf-8') as f:
            cfg.write(f)

        ambiente = dict(os.environ)
        # O configurador usa o Python embutido do pacote quando existe e cai no
        # do sistema quando não — é esse caminho que corre aqui.
        ambiente['SQLITE_PATH'] = str(cls.base)
        ambiente['DJANGO_DEBUG'] = 'True'
        ambiente.pop('DJANGO_SETTINGS_MODULE', None)

        cls.resultado = subprocess.run(
            [sys.executable, str(cls.pasta / 'configurar.py'), '--ini', str(cls.ini)],
            cwd=str(cls.pasta), env=ambiente, capture_output=True, text=True,
            encoding='utf-8', errors='replace', timeout=900)
        cls.saida = (cls.resultado.stdout or '') + (cls.resultado.stderr or '')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.pasta, ignore_errors=True)

    # -- o que o configurador tem de ter feito ----------------------------
    def test_o_configurador_termina_sem_erro(self):
        self.assertEqual(
            self.resultado.returncode, 0,
            f'O configurador falhou — é isto que o cliente vê como "a instalação '
            f'deu erro no fim":\n{self.saida[-3000:]}')

    def test_a_instalacao_diz_que_a_base_esta_pronta(self):
        self.assertIn('Base de dados pronta', self.saida,
                      f'O configurador não chegou ao fim:\n{self.saida[-2000:]}')

    def test_a_base_de_dados_fica_criada_na_pasta_de_dados(self):
        """Na pasta `dados`, que é a que sobrevive a uma atualização. Se a base
        fosse para dentro de `app`, a atualização seguinte apagava-a com o
        código."""
        self.assertTrue(self.base.exists(),
                        f'A base de dados não foi criada em {self.base}')

    def test_o_env_e_escrito_e_tem_uma_chave_propria(self):
        env = (self.app / '.env')
        self.assertTrue(env.exists(), 'O .env não foi escrito — a instalação arranca sem configuração.')
        texto = env.read_text(encoding='utf-8', errors='replace')
        self.assertIn('SECRET_KEY', texto)
        self.assertNotIn('django-insecure', texto,
                         'A instalação ficou com uma SECRET_KEY de exemplo: as sessões e a '
                         'licença desta casa passam a ser assinadas com uma chave pública.')


@unittest.skipUnless(CONFIGURADOR.exists(), 'instalador/configurar.py não está presente')
class PrimeiroDiaDoClienteTests(InstalacaoDoZeroTests):
    """A base que o configurador acabou de criar responde às perguntas do 1º dia.

    Herda a instalação (feita uma vez) e abre-a com o Django, como os serviços a
    abrem quando arrancam.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ligacao = None
        if cls.resultado.returncode != 0 or not cls.base.exists():
            return
        # Abre a base INSTALADA com uma ligação própria. Não se usa o ORM do
        # processo de teste (esse está ligado à base de teste do Django): abre-se
        # a instalação como um programa de fora a abriria.
        import sqlite3
        cls.ligacao = sqlite3.connect(str(cls.base))

    @classmethod
    def tearDownClass(cls):
        if cls.ligacao is not None:
            cls.ligacao.close()
        super().tearDownClass()

    def _contar(self, tabela, onde=''):
        self.assertIsNotNone(self.ligacao, 'A instalação não chegou a produzir base de dados.')
        cur = self.ligacao.execute(f'SELECT COUNT(*) FROM {tabela} {onde}')
        return cur.fetchone()[0]

    def test_a_conta_do_dono_existe_e_entra(self):
        """A pergunta nº 1 do primeiro dia. Já aconteceu o cliente receber a
        instalação sem conta nenhuma criada."""
        linhas = self.ligacao.execute(
            'SELECT username, password, is_superuser, is_active FROM auth_user').fetchall()
        self.assertTrue(linhas, 'A instalação acabou sem NENHUMA conta de acesso criada: '
                                'o cliente não consegue entrar no sistema dele.')
        nomes = [l[0] for l in linhas]
        self.assertIn('dono', nomes, f'Contas criadas: {nomes}')
        dono = [l for l in linhas if l[0] == 'dono'][0]
        from django.contrib.auth.hashers import check_password
        self.assertTrue(check_password('PrimeiroDia#2026', dono[1]),
                        'A senha do dono não abre a conta do dono.')
        self.assertTrue(dono[2], 'A conta do dono não é administrador.')
        self.assertTrue(dono[3], 'A conta do dono está inactiva.')

    def test_as_unidades_de_medida_estao_cadastradas(self):
        """Sem UMA unidade de medida, o cliente não cria NENHUM artigo. Já
        aconteceu a um cliente real."""
        self.assertGreater(self._contar('inventory_unitofmeasure'), 0,
                           'Zero unidades de medida: o cliente não consegue criar artigos.')

    def test_o_catalogo_fiscal_agt_esta_semeado(self):
        """Sem tipos de documento, não se emite NADA: `issue_document` precisa de
        um FiscalDocType para saber o que assinar."""
        tipos = self._contar('fis_doc_type')
        self.assertGreater(tipos, 0, 'Zero tipos de documento fiscal: a casa abre e não '
                                     'consegue emitir uma factura.')
        self.assertGreater(self._contar('fis_tax_rate'), 0, 'Zero taxas de IVA configuradas.')

    def test_o_plano_de_contas_e_os_diarios_estao_semeados(self):
        """O defeito silencioso: sem diário, `post_pos_ticket` devolve None e as
        vendas do dia nunca chegam à contabilidade — sem erro nenhum."""
        contas = self._contar('acc_account')
        diarios = self._contar('acc_journal')
        self.assertGreater(contas, 0, 'Plano de contas (PGC-AO) vazio.')
        self.assertGreater(diarios, 0,
                           'Zero diários contabilísticos: cada venda vai ser cobrada, '
                           'declarada à AGT, e NÃO vai chegar à contabilidade — e ninguém '
                           'dá por isso até o contabilista abrir o razão no fim do mês.')

    def test_o_catalogo_de_parametros_esta_semeado(self):
        """Sem ele a tabela fica vazia: o motor cai nos valores por omissão do
        código e funciona, mas o dono não vê um único parâmetro para configurar
        — nem sabe que eles existem."""
        self.assertGreater(self._contar('pos_parameter'), 50,
                           'O catálogo de parâmetros ficou (quase) vazio: a Configuração '
                           'POS → Parâmetros abre sem nada para configurar.')

    def test_a_instalacao_nao_traz_dados_de_desenvolvimento(self):
        """Uma instalação nova é uma casa VAZIA. Se trouxesse o hotel, os artigos
        ou as vendas da máquina de quem fez o build, o cliente começava com a
        contabilidade de outra pessoa."""
        self.assertEqual(self._contar('pos_ticket'), 0, 'A instalação traz vendas feitas.')
        self.assertEqual(self._contar('fis_document'), 0,
                         'A instalação traz documentos fiscais emitidos — números de '
                         'factura de outra casa.')
        self.assertEqual(self._contar('identity_hotel'), 0, 'A instalação traz hotéis configurados.')

    def test_correr_o_configurador_outra_vez_nao_estraga_nada(self):
        """É o que o setup.exe de uma ATUALIZAÇÃO faz: volta a chamá-lo por cima
        de uma instalação a trabalhar. Os seeds são idempotentes de propósito —
        se não fossem, a atualização apagava o que o contabilista já ajustou (ou
        duplicava o plano de contas)."""
        antes = (self._contar('inventory_unitofmeasure'), self._contar('fis_doc_type'),
                 self._contar('acc_account'), self._contar('acc_journal'),
                 self._contar('auth_user'))

        ambiente = dict(os.environ)
        ambiente['SQLITE_PATH'] = str(self.base)
        ambiente['DJANGO_DEBUG'] = 'True'
        ambiente.pop('DJANGO_SETTINGS_MODULE', None)
        r = subprocess.run([sys.executable, str(self.pasta / 'configurar.py'),
                            '--ini', str(self.ini)],
                           cwd=str(self.pasta), env=ambiente, capture_output=True,
                           text=True, encoding='utf-8', errors='replace', timeout=900)
        saida = (r.stdout or '') + (r.stderr or '')
        self.assertEqual(r.returncode, 0,
                         f'A segunda passagem (atualização) falhou:\n{saida[-2500:]}')

        depois = (self._contar('inventory_unitofmeasure'), self._contar('fis_doc_type'),
                  self._contar('acc_account'), self._contar('acc_journal'),
                  self._contar('auth_user'))
        self.assertEqual(antes, depois,
                         f'A atualização mudou as contagens dos catálogos: {antes} -> {depois}. '
                         f'Os seeds têm de ser idempotentes — uma atualização não pode '
                         f'duplicar o plano de contas nem criar outra conta de dono.')
        # Compara-se por um pedaço SEM acentos de propósito: a saída do
        # subprocesso vem na codificação da consola do Windows e, lida como UTF-8
        # com `errors='replace'`, cada acento torna-se um caractere de
        # substituição. Procurar "mantido (instalação existente)" nunca
        # encontrava nada — e o teste falhava por causa da acentuação, não do
        # comportamento.
        self.assertIn('.env mantido', saida,
                      'O .env foi REESCRITO numa atualização: a SECRET_KEY nova desloga '
                      'todos os utilizadores e invalida a licença já activada. '
                      f'Saída: {saida[-800:]}')
