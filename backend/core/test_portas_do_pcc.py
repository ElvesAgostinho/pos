# -*- coding: utf-8 -*-
"""AS PORTAS PÚBLICAS DO PCC — o que qualquer pessoa na internet pode pedir.

O PCC está num domínio público e tem de ter portas abertas: é por elas que as
instalações dos clientes activam e sincronizam a licença sozinhas, sem ninguém
lá ter de fazer login. Essas portas autenticam-se a si mesmas (pela assinatura
da licença apresentada).

O problema não são as portas abertas — é o que passa por elas. Os dois buracos
que estes testes fecham foram encontrados a sondar o PCC a correr de verdade:

  1. `/api/licensing/status/` publicava a licença do CLIENTE MAIS RECENTE.
     Numa instalação de cliente, `clm.License` tem uma linha — a dele — e
     "a licença mais recente" é a resposta certa. No PCC, a mesma tabela é o
     registo de TODOS os clientes, e a vista é `AllowAny`: qualquer pessoa lia o
     nome do cliente, o número da licença, a validade, os módulos e os limites
     contratados. A cada cliente novo, a fuga passava a ser do seguinte.

  2. `/admin/login/` não tinha travão de força bruta. A API tem (5 tentativas,
     15 minutos), mas o admin do Django é outra vista e o throttle do DRF não
     lhe chega. Numa consola pública, com um superutilizador cujo nome vem de
     uma variável de ambiente previsível, eram tentativas sem limite.

Correm com `SYSTEM_MODE=PCC` forçado no próprio teste, porque é o modo em que o
defeito existe — em modo ERP o comportamento tem de continuar exactamente o
mesmo, e isso também se prova aqui.
"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase


def _um_cliente_com_licenca(nome='Hotel Nataniel', numero='LIC-CLI-5005-709898A8'):
    """Um cliente e uma licença no registo, como o PCC os tem."""
    from clm.models import Client, License
    c = Client.objects.create(code='CLI-TESTE', commercial_name=nome)
    return License.objects.create(
        client=c, license_number=numero, plan='Completo',
        valid_until=timezone.localdate() + timedelta(days=365),
        modules=['core', 'pos', 'pms'], max_hotels=1, max_pos=2, max_users=10, max_rooms=30)


class AConsolaNaoPublicaOsClientesTests(APITestCase):
    """O registo de clientes não sai por uma porta sem login."""

    def setUp(self):
        cache.clear()
        self.lic = _um_cliente_com_licenca()

    @override_settings(RUN_MODE='PCC')
    def test_o_pcc_nao_devolve_a_licenca_de_um_cliente_a_quem_nao_tem_sessao(self):
        r = self.client.get('/api/licensing/status/')
        self.assertEqual(r.status_code, 200, 'A porta responde — o que não pode é dizer isto.')
        corpo = str(r.content, 'utf-8', 'replace')
        self.assertNotIn('Hotel Nataniel', corpo,
                         f'O PCC publicou o NOME de um cliente numa porta sem login: {corpo[:300]}')
        self.assertNotIn('LIC-CLI-5005-709898A8', corpo,
                         'O PCC publicou o NÚMERO da licença de um cliente.')
        self.assertFalse(r.data.get('licensed'),
                         'O PCC não é uma instalação licenciada — é o registo das licenças.')

    @override_settings(RUN_MODE='PCC')
    def test_nem_os_modulos_e_limites_contratados(self):
        """Os módulos e os limites são o CONTRATO do cliente: quantos hotéis,
        quantos postos, quantos utilizadores comprou."""
        for caminho in ('/api/licensing/status/', '/api/licensing/active-modules/'):
            corpo = str(self.client.get(caminho).content, 'utf-8', 'replace')
            self.assertNotIn('Hotel Nataniel', corpo, f'{caminho} leva o nome do cliente.')
            self.assertNotIn('"max_hotels"', corpo, f'{caminho} leva os limites contratados.')
            self.assertNotIn('LIC-CLI', corpo, f'{caminho} leva o número da licença.')

    @override_settings(RUN_MODE='PCC')
    def test_a_resposta_explica_porque_e_que_nao_ha_licenca(self):
        """Um "licensed: false" seco faz parecer que o PCC está avariado. A
        resposta tem de dizer que a pergunta não se aplica aqui."""
        d = self.client.get('/api/licensing/status/').data
        self.assertEqual(d.get('source'), 'pcc')
        self.assertIn('Control Center', d.get('detail', ''))

    def test_na_instalacao_de_um_cliente_continua_a_responder_como_sempre(self):
        """O MESMO código corre nas duas pontas, e é por isso que este teste
        existe: na casa do cliente, `clm.License` tem a licença DELE e esta
        vista é o que diz ao ecrã que a instalação está activa. Se a correcção
        do PCC a calasse também aqui, nenhum cliente entrava no sistema."""
        r = self.client.get('/api/licensing/status/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data.get('licensed'),
                        'A instalação do cliente deixou de se ver como licenciada.')
        self.assertEqual(r.data.get('client'), 'Hotel Nataniel')
        self.assertEqual(r.data.get('license_number'), 'LIC-CLI-5005-709898A8')
        self.assertEqual(r.data.get('source'), 'clm')


class OAdminNaoAceitaTentativasSemFimTests(APITestCase):
    """Cinco tentativas e fica trancado 15 minutos — como na API."""

    def setUp(self):
        cache.clear()
        User.objects.create_superuser('dono-pcc', 'dono@exemplo.ao', 'uma-password-boa')

    def _tentar(self, password='errada', quem='dono-pcc'):
        return self.client.post('/admin/login/',
                                {'username': quem, 'password': password,
                                 'next': '/admin/'})

    def test_depois_de_cinco_tentativas_erradas_bloqueia(self):
        for i in range(5):
            r = self._tentar()
            self.assertNotEqual(r.status_code, 429,
                                f'Bloqueou à tentativa {i + 1}; o limite são 5.')
        r = self._tentar()
        self.assertEqual(r.status_code, 429,
                         'A sexta tentativa passou — o /admin/ aceita tentativas sem fim.')
        self.assertIn('15 minutos', str(r.content, 'utf-8', 'replace'),
                      'A resposta tem de dizer quanto tempo falta.')

    def test_o_bloqueio_segue_o_utilizador_e_nao_so_o_ip(self):
        """Quem distribui as tentativas por muitos IPs passa ao lado de um
        limite por IP. O nome tentado conta também."""
        for _ in range(5):
            self._tentar()
        # outro IP, mesmo utilizador
        r = self.client.post('/admin/login/',
                             {'username': 'dono-pcc', 'password': 'errada'},
                             REMOTE_ADDR='203.0.113.99')
        self.assertEqual(r.status_code, 429,
                         'Mudar de IP contornou o bloqueio da conta.')

    def test_um_login_certo_limpa_a_contagem(self):
        """Quem se enganou três vezes e depois acertou não pode ficar com
        tentativas gastas — à quarta vez que se enganasse ficava trancado sem
        nunca ter chegado a cinco seguidas."""
        for _ in range(3):
            self._tentar()
        r = self._tentar(password='uma-password-boa')
        self.assertEqual(r.status_code, 302, 'O login certo devia ter passado.')
        for i in range(5):
            self.assertNotEqual(self._tentar().status_code, 429,
                                f'A contagem não foi limpa: bloqueou à {i + 1}.ª.')

    def test_o_bloqueio_fica_no_registo_de_acessos(self):
        """Um bloqueio que não se registe não aparece no relatório de acessos —
        e é precisamente o que o dono precisa de ver."""
        from auth_engine.models import AuthEventLog
        for _ in range(5):
            self._tentar()
        registos = AuthEventLog.objects.filter(event_type='LOGIN_FAILED_PASSWORD')
        self.assertTrue(registos.filter(identity_attempt__contains='admin').exists(),
                        'O bloqueio do /admin/ não deixou rasto na auditoria.')

    def test_navegar_no_admin_com_sessao_nao_e_travado(self):
        """O travão é só do LOGIN. Travar navegação normal era bloquear quem
        está a trabalhar."""
        self.client.force_login(User.objects.get(username='dono-pcc'))
        for _ in range(10):
            r = self.client.get('/admin/')
            self.assertNotEqual(r.status_code, 429)
