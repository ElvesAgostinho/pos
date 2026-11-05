# -*- coding: utf-8 -*-
"""UMA INSTALAÇÃO SÓ ESTÁ PRONTA SE ALGUÉM CONSEGUIR ENTRAR.

O instalador terminava a dizer "Base de dados pronta" mesmo quando nenhuma
conta de acesso tinha sido criada. O caso estava previsto no código — havia
um ramo que imprimia "AVISO: nenhuma conta de acesso foi criada" — mas era um
`print` para um ficheiro de registo que ninguém abre. A barra de progresso
chegava ao fim, o técnico ia-se embora, e o dono descobria no ecrã de login,
que lhe responde "credenciais inválidas": a frase errada para o problema
certo, e a que o manda procurar a senha em vez de reinstalar.

Estes testes exigem as duas metades. Só a primeira não chegava: um comando
que grita sempre seria desligado por quem instala à segunda vez.
"""
import importlib.util
import tempfile
from pathlib import Path

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase


class SoEstaProntoSeAlguemPuderEntrar(TestCase):

    def test_sem_conta_nenhuma_a_instalacao_tem_de_parar(self):
        """O caso que ficava invisível."""
        User.objects.all().delete()

        with self.assertRaises(SystemExit) as caixa:
            call_command('verificar_acesso')

        # A mensagem é para quem está a instalar, de pé ao lado da máquina —
        # tem de dizer o que fazer, não só o que aconteceu.
        texto = str(caixa.exception)
        self.assertIn('NINGUÉM CONSEGUE ENTRAR', texto)
        self.assertIn('criar_dono', texto, 'não diz como resolver na hora')

    def test_com_a_conta_do_dono_segue_em_frente(self):
        User.objects.all().delete()
        User.objects.create_superuser('dono', '', 'x')

        call_command('verificar_acesso')      # não levanta nada

    def test_uma_conta_desactivada_nao_conta_como_acesso(self):
        """Uma conta desligada não deixa entrar ninguém — e seria fácil
        contá-la por engano, porque existe na tabela."""
        User.objects.all().delete()
        u = User.objects.create_superuser('dono', '', 'x')
        u.is_active = False
        u.save()

        with self.assertRaises(SystemExit):
            call_command('verificar_acesso')

    def test_um_utilizador_comum_nao_abre_o_backoffice(self):
        """Um operador de POS não é uma conta de administração. Se contasse,
        a instalação dava-se por boa sem ninguém que possa configurar nada."""
        User.objects.all().delete()
        User.objects.create_user('operador', '', 'x')     # nem staff nem superuser

        with self.assertRaises(SystemExit):
            call_command('verificar_acesso')


class AsPasswordsDaInstalacaoNaoFicamNoDisco(TestCase):
    """O configurar.log e o instalacao.ini ficam na pasta do cliente."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        caminho = Path(__file__).resolve().parents[2] / 'instalador' / 'configurar.py'
        spec = importlib.util.spec_from_file_location('configurar_em_ensaio', caminho)
        cls.configurar = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.configurar)

    def test_a_password_do_dono_nao_vai_para_o_registo(self):
        linha = ' '.join(self.configurar._para_o_registo(
            ('criar_dono', '--username', 'dono', '--password', 'Segredo#1')))

        self.assertNotIn('Segredo#1', linha)
        self.assertIn('--username dono', linha)

    def test_o_ini_fica_sem_passwords_e_com_o_resto(self):
        with tempfile.TemporaryDirectory() as pasta:
            ini = Path(pasta) / 'instalacao.ini'
            ini.write_text('[bd]\ntipo=postgres\nadmin_password=Admin#1\n'
                           '[dono]\nutilizador=dono\npassword=Segredo#1\n', encoding='utf-8')

            self.configurar.limpar_passwords_do_ini(ini)

            texto = ini.read_text(encoding='utf-8')
        self.assertNotIn('Segredo#1', texto)
        self.assertNotIn('Admin#1', texto)
        self.assertIn('postgres', texto)
        self.assertIn('utilizador = dono', texto)


class OInstaladorNaoEscondeFalhas(TestCase):
    """O Inno Setup ignora o código de saída das entradas [Run]."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        raiz = Path(__file__).resolve().parents[2] / 'instalador'
        cls.setup = (raiz / 'setup.iss').read_text(encoding='utf-8')
        caminho = raiz / 'configurar.py'
        spec = importlib.util.spec_from_file_location('configurar_em_ensaio2', caminho)
        cls.configurar = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.configurar)

    def test_o_instalador_corre_em_64_bits(self):
        """Em 32 bits não vê o SQL Server de 64 bits, que está na outra vista do registo."""
        self.assertIn('ArchitecturesInstallIn64BitMode=x64compatible', self.setup)

    def test_as_escolhas_sao_escritas_antes_de_o_configurador_correr(self):
        """O [Run] corre antes de ssPostInstall: escrito lá, o ini chegava tarde, a base
        escolhida era ignorada e não se criava a conta do dono. Visto numa instalação real."""
        self.assertIn('BeforeInstall: PrepararConfiguracao', self.setup)
        self.assertNotIn('ssPostInstall then', self.setup)

    def test_o_configurador_encontra_os_seus_modulos_no_python_embutido(self):
        """python312._pth desliga a pasta do script do sys.path."""
        texto = (Path(self.configurar.__file__)).read_text(encoding='utf-8')
        self.assertIn('sys.path.insert(0, str(RAIZ))', texto)

    def test_uma_falha_impede_os_servicos_de_arrancar(self):
        self.assertIn('AfterInstall: VerificarConfiguracao', self.setup)
        for linha in self.setup.splitlines():
            if linha.startswith('Filename: "{app}\\servicos') and '"start"' in linha:
                self.assertIn('Check: ConfiguracaoOk', linha)

    def test_o_resultado_fica_nas_marcas_que_o_instalador_le(self):
        with tempfile.TemporaryDirectory() as pasta:
            antes = self.configurar.DADOS
            self.configurar.DADOS = Path(pasta)
            (Path(pasta) / 'logs').mkdir()
            try:
                self.configurar.registar_resultado(False, 'a base falhou')
                self.assertFalse((Path(pasta) / 'logs' / 'configurar.ok').exists())
                self.assertIn('a base falhou',
                              (Path(pasta) / 'logs' / 'configurar.erro.txt').read_text())
                self.configurar.registar_resultado(True, '')
                self.assertTrue((Path(pasta) / 'logs' / 'configurar.ok').exists())
                self.assertFalse((Path(pasta) / 'logs' / 'configurar.erro.txt').exists())
            finally:
                self.configurar.DADOS = antes


class AAtivacaoDeixaOHotelProntoParaVender(TestCase):

    def test_o_hotel_criado_na_ativacao_nasce_com_caixa(self):
        from finance.models import FinanceAccount
        from identity.models import Hotel
        from licensing.views import _aplicar_dados_empresa
        Hotel.objects.all().delete()

        self.assertTrue(_aplicar_dados_empresa({'name': 'Hotel do Cliente', 'nif': '5000000000'}))

        hotel = Hotel.objects.get()
        self.assertEqual(hotel.name, 'Hotel do Cliente')
        self.assertEqual(FinanceAccount.objects.filter(hotel=hotel, account_type='CASH').count(), 1)


class OsSeedsCabemNasColunas(TestCase):
    """O SQLite não impõe `max_length`; o SQL Server e o PostgreSQL recusam.

    Um texto de ajuda com 326 caracteres numa coluna de 250 passava em todos os testes
    e parava a instalação de quem escolhia um servidor a sério.
    """

    def test_nenhum_valor_semeado_excede_a_coluna(self):
        from django.apps import apps
        from django.db import models

        for seed in ('seed_params', 'seed_fiscal', 'seed_uoms', 'seed_accounting'):
            call_command(seed, verbosity=0)

        excessos = []
        for modelo in apps.get_models():
            for campo in modelo._meta.concrete_fields:
                if not isinstance(campo, models.CharField) or not campo.max_length:
                    continue
                for valor in modelo.objects.values_list(campo.attname, flat=True).distinct():
                    if valor and len(str(valor)) > campo.max_length:
                        excessos.append(f'{modelo.__name__}.{campo.name}: {len(str(valor))}'
                                        f' > {campo.max_length}')
        self.assertEqual(excessos, [])


class OsServicosDoWindowsArrancam(TestCase):
    """O WinSW recusa um XML inválido e o Inno ignora o erro: o serviço não existia."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.raiz = Path(__file__).resolve().parents[2] / 'instalador'
        cls.xmls = sorted((cls.raiz / 'servicos').glob('*.xml'))

    def test_os_xml_dos_servicos_sao_validos(self):
        from xml.dom import minidom
        self.assertGreaterEqual(len(self.xmls), 4)
        for xml in self.xmls:
            minidom.parse(str(xml))

    def test_o_trabalhador_nao_pede_o_agendador_no_windows(self):
        """`-B` faz o Celery sair com erro no Windows."""
        texto = (self.raiz / 'servicos' / 'celery.xml').read_text(encoding='utf-8')
        self.assertNotIn('worker -B', texto)

    def test_cada_servico_e_empacotado_instalado_e_removido(self):
        build = (self.raiz / 'build_instalador.ps1').read_text(encoding='utf-8-sig')
        setup = (self.raiz / 'setup.iss').read_text(encoding='utf-8')
        for xml in self.xmls:
            nome = xml.stem
            self.assertIn('servicos\\' + nome + '.xml', build, nome)
            self.assertRegex(build, r'servicos\\' + nome + r'\.exe', nome)
            for acao in ('install', 'start', 'stop', 'uninstall'):
                self.assertRegex(setup, r'servicos\\' + nome + r'\.exe"; +Parameters: "' + acao + '"')
