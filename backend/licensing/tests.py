# -*- coding: utf-8 -*-
"""O CIRCUITO COM O PCC — o sistema instalado a falar com a consola do fornecedor.

Aqui testa-se a ligação inteira, com o código REAL dos dois lados: o cliente
chama `licensing/sync/`, esse pedido sai por HTTP, e o teste encaminha-o para a
view `clm/licenses/latest/` que corre no PCC. Nada de `mock` a devolver uma
resposta inventada: o que responde é o PCC a sério, com uma licença assinada a
sério, e o cliente verifica-a como verificaria em produção.

Isto importa porque este é o único circuito que atravessa DUAS máquinas e duas
organizações — o hotel e o fornecedor. É também o único onde uma falha deixa o
cliente sem sistema: uma licença corrompida a ser gravada por cima da boa não se
desfaz por telefone.

Daí a forma dos testes: um prova que a renovação CHEGA; os outros provam que, em
tudo o que corre mal, **o ficheiro em disco não é tocado**. É mais importante o
sistema ficar como estava do que receber a licença.
"""
import base64
import json
import os
from datetime import date, timedelta
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from clm.models import Client, Installation, License, SystemRelease
from licensing.engine.crypto import sign_license


def _chave(client_code='MWANA', numero='LIC-0001', modules=None, validade=None, **extra):
    """Um license.key assinado DE VERDADE — o mesmo formato que o PCC emite."""
    payload = {
        'license_number': numero,
        'client_code': client_code,
        'modules': modules if modules is not None else ['pos', 'pms'],
        'feature_flags': {},
        'valid_until': (validade or (date.today() + timedelta(days=365))).isoformat(),
        'limits': {'hotels': 1, 'pos': 2, 'users': 10},
    }
    payload.update(extra)
    payload['signature'] = sign_license({k: v for k, v in payload.items() if k != 'signature'})
    return base64.b64encode(json.dumps(payload).encode('utf-8')).decode('ascii')


class CircuitoPcc(APITestCase):
    """O hotel de um lado, o PCC do outro, e o ficheiro license.key no meio."""

    def setUp(self):
        self.user = User.objects.create_superuser('dono_teste', '', 'x')
        self.client.force_authenticate(self.user)

        # ── o lado do PCC ───────────────────────────────────────────────────
        self.cliente = Client.objects.create(code='MWANA', commercial_name='Mwana Lodge',
                                             legal_name='Mwana Lodge, Lda.', nif='5000000000',
                                             status='ACTIVE')
        self.licenca = License.objects.create(
            client=self.cliente, license_number='LIC-0002', plan='Completo',
            modules=['pos', 'pms', 'inventory'], feature_flags={},
            valid_until=date.today() + timedelta(days=730),
            max_hotels=2, max_pos=4, max_users=25)
        SystemRelease.objects.create(version='1.2.0', download_url='https://exemplo.ao/erp-1.2.0.zip',
                                     release_notes='Correções no fecho de caixa.')

        # ── o lado do hotel: a licença que está instalada neste momento ────
        self.caminho = os.path.join(settings.BASE_DIR, 'license.key')
        self.anterior = open(self.caminho).read() if os.path.exists(self.caminho) else None
        self.instalada = _chave(numero='LIC-0001', modules=['pos'])
        with open(self.caminho, 'w') as f:
            f.write(self.instalada)

    def tearDown(self):
        """O license.key é um ficheiro REAL do projeto — repõe-se sempre.

        Sem isto, um teste deixava a máquina de quem o corre com a licença de
        teste instalada. Um teste não pode mudar a casa onde corre.
        """
        for extra in ('', '.bak'):
            p = self.caminho + extra
            if os.path.exists(p):
                os.remove(p)
        if self.anterior is not None:
            with open(self.caminho, 'w') as f:
                f.write(self.anterior)

    def _ligar_ao_pcc(self, resposta_falsa=None, rebenta=None):
        """Encaminha o pedido HTTP do cliente para a view REAL do PCC.

        É a única peça simulada, e simula só o FIO — não a resposta. O que
        responde do outro lado é `clm/licenses/latest/` a correr a sério.
        """
        cliente_http = self.client

        class _Resp:
            def __init__(self, r):
                self.status_code = r.status_code
                self._d = r.data if hasattr(r, 'data') else {}

            def json(self):
                return self._d

        def _post(url, json=None, timeout=None, **kw):
            if rebenta:
                raise rebenta
            if resposta_falsa is not None:
                return resposta_falsa
            caminho = '/api/clm/licenses/latest/'
            return _Resp(cliente_http.post(caminho, json, format='json'))

        return mock.patch('requests.post', side_effect=_post)

    def _no_disco(self):
        return open(self.caminho).read().strip()


class SincronizacaoComOPccTests(CircuitoPcc):
    """O caso bom: o botão "Sincronizar" do Gestor de Licenças."""

    def test_a_licenca_nova_chega_e_traz_o_resto_com_ela(self):
        with self._ligar_ao_pcc():
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:500])

        # 1) A LICENÇA NOVA ficou em disco, e é a do PCC.
        gravada = json.loads(base64.b64decode(self._no_disco()).decode('utf-8'))
        self.assertEqual(gravada['license_number'], 'LIC-0002',
                         'O ficheiro continua com a licença antiga.')
        self.assertEqual(sorted(gravada['modules']), ['inventory', 'pms', 'pos'],
                         'Os módulos comprados não chegaram ao sistema instalado.')
        self.assertEqual(gravada['limits']['pos'], 4)

        # 2) A ANTIGA ficou guardada. Se a nova vier errada, há para onde voltar.
        self.assertTrue(os.path.exists(self.caminho + '.bak'),
                        'A licença anterior não foi guardada — não há como recuar.')
        self.assertEqual(open(self.caminho + '.bak').read().strip(), self.instalada)

        # 3) O AVISO DE VERSÃO veio no mesmo canal (é assim que o cliente sabe
        #    que há atualização, sem andar a consultar sítios).
        from licensing.models import SupportSetting
        ss = SupportSetting.get()
        self.assertEqual(ss.latest_version, '1.2.0')
        self.assertEqual(ss.latest_download_url, 'https://exemplo.ao/erp-1.2.0.zip')

        # 4) OS DADOS DA EMPRESA, que o técnico já escreveu no PCC, não se
        #    escrevem outra vez à mão no hotel.
        self.assertTrue(r.data.get('company_applied'),
                        'Os dados da empresa vieram do PCC e não foram aplicados.')

    def test_o_pcc_fica_a_saber_que_esta_instalacao_esta_viva(self):
        """Cada sincronização é também o sinal de vida da instalação."""
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')
        inst = Installation.objects.filter(client=self.cliente).first()
        self.assertIsNotNone(inst, 'O PCC não registou a instalação que sincronizou.')
        self.assertIsNotNone(inst.last_ping, 'Sincronizou e o PCC não marcou o sinal de vida.')
        self.assertTrue(inst.version, 'O PCC não ficou a saber que versão o cliente corre.')


class QuandoCorreMalTests(CircuitoPcc):
    """Em tudo o que falha, o ficheiro em disco NÃO pode ser tocado.

    É mais importante o sistema ficar como estava do que receber a licença: uma
    licença corrompida gravada por cima da boa deixa o hotel sem sistema, e isso
    não se desfaz por telefone.
    """

    def test_sem_ligacao_o_sistema_continua_a_trabalhar(self):
        with self._ligar_ao_pcc(rebenta=OSError('ligação recusada')):
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 502)
        self.assertIn('Sem ligação ao PCC', str(r.data),
                      'Falhou sem dizer que o problema é a ligação.')
        self.assertEqual(self._no_disco(), self.instalada,
                         'Sem internet, a licença instalada foi alterada.')

    def test_endereco_que_nao_e_um_pcc_diz_isso_mesmo(self):
        """O caso mais confuso de todos: HÁ um servidor vivo naquele endereço,
        por isso não parece problema de rede — e o dono fica a ver "404".

        Acontece sempre que o endereço aponta para o sítio errado: para o
        próprio ERP (que não publica as rotas do PCC), para um site qualquer,
        ou para um PCC antigo. A resposta tem de dizer QUE o endereço está
        errado, não repetir o número.
        """
        class _NaoEPcc:
            status_code = 404
            @staticmethod
            def json():
                raise ValueError('isto é HTML, não JSON')

        with self._ligar_ao_pcc(resposta_falsa=_NaoEPcc()):
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 502)
        self.assertIn('não é uma consola PCC', str(r.data))
        self.assertEqual(self._no_disco(), self.instalada)

    def test_sem_ligacao_a_mensagem_diz_onde_se_corrige(self):
        """Falhar não chega: tem de dizer o que fazer a seguir."""
        with self._ligar_ao_pcc(rebenta=OSError('ligação recusada')):
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        texto = str(r.data)
        self.assertIn('PCC_URL', texto, 'Não diz onde se corrige o endereço.')
        self.assertIn('continua a trabalhar', texto,
                      'Não tranquiliza: o sistema não pára por estar sem PCC.')

    def test_licenca_de_outro_cliente_e_recusada(self):
        """Um PCC comprometido, ou uma troca de ficheiros, não entra aqui."""
        class _Outro:
            status_code = 200
            @staticmethod
            def json():
                return {'license_key': _chave(client_code='OUTRO_HOTEL', numero='LIC-9999')}

        with self._ligar_ao_pcc(resposta_falsa=_Outro()):
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 502, r.content[:300])
        self.assertIn('OUTRO cliente', str(r.data))
        self.assertEqual(self._no_disco(), self.instalada)

    def test_assinatura_falsificada_e_recusada(self):
        """O cliente NÃO confia no PCC só por ser o PCC: confere a assinatura."""
        payload = {
            'license_number': 'LIC-FALSA', 'client_code': 'MWANA',
            'modules': ['pos', 'pms', 'inventory', 'commercial'], 'feature_flags': {},
            'valid_until': (date.today() + timedelta(days=3650)).isoformat(),
            'limits': {'hotels': 99, 'pos': 99, 'users': 999},
            'signature': base64.b64encode(b'assinatura inventada').decode('ascii'),
        }
        falsa = base64.b64encode(json.dumps(payload).encode()).decode('ascii')

        class _Falsa:
            status_code = 200
            @staticmethod
            def json():
                return {'license_key': falsa}

        with self._ligar_ao_pcc(resposta_falsa=_Falsa()):
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 502, r.content[:300])
        self.assertIn('assinatura', str(r.data).lower())
        self.assertEqual(self._no_disco(), self.instalada,
                         'Uma licença com assinatura falsa foi gravada em disco.')

    def test_cliente_suspenso_no_pcc_nao_renova(self):
        self.cliente.status = 'SUSPENDED'
        self.cliente.save(update_fields=['status'])
        with self._ligar_ao_pcc():
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.assertEqual(self._no_disco(), self.instalada)

    def test_cliente_desconhecido_diz_qual(self):
        self.cliente.code = 'OUTRO'
        self.cliente.save(update_fields=['code'])
        with self._ligar_ao_pcc():
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 404, r.content[:300])
        self.assertIn('MWANA', str(r.data), 'Não diz QUE cliente é que o PCC não conhece.')
        self.assertEqual(self._no_disco(), self.instalada)

    def test_sem_licenca_instalada_nao_se_sincroniza(self):
        """A primeira licença instala-se com o ficheiro, não por sincronização —
        a sincronização autentica-se apresentando a licença que já se tem."""
        os.remove(self.caminho)
        r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])


class ModulosBemOrganizadosTests(CircuitoPcc):
    """O que o cliente COMPROU, o que está INSTALADO, e o que ele VÊ.

    São três coisas diferentes e é fácil confundi-las. `pos`, `inventory` e
    `commercial` estão sempre instalados (as tabelas têm de existir); é a licença
    que decide se se usam. Um módulo não licenciado não pode aparecer, e um
    módulo licenciado que não esteja instalado não pode ser prometido.
    """

    def _modulos_ativos(self):
        return set(self.client.get('/api/licensing/active-modules/').data.get('active') or [])

    def test_so_aparece_o_que_foi_comprado(self):
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')
        ativos = self._modulos_ativos()
        self.assertIn('pos', ativos)
        self.assertIn('pms', ativos)
        self.assertIn('inventory', ativos)
        self.assertNotIn('commercial', ativos,
                         'Apareceu um módulo que o cliente não comprou.')

    def test_tirar_um_modulo_no_pcc_tira_o_do_sistema(self):
        """O cliente devolve o PMS. Na sincronização seguinte, desaparece."""
        self.licenca.modules = ['pos']
        self.licenca.save(update_fields=['modules'])
        with self._ligar_ao_pcc():
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        ativos = self._modulos_ativos()
        self.assertIn('pos', ativos)
        self.assertNotIn('pms', ativos,
                         'O módulo foi retirado no PCC e continua ativo no cliente.')

    def test_o_fiscal_nunca_se_desliga(self):
        """Faturar não é um extra. Um cliente sem o módulo fiscal não emite
        documentos legais — e isso não é uma opção comercial em Angola."""
        self.licenca.modules = ['pos']
        self.licenca.save(update_fields=['modules'])
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertIn('fiscal', self._modulos_ativos())

    def test_um_modulo_licenciado_que_nao_esta_instalado_nao_se_promete(self):
        """Vender não é instalar. Anunciar um módulo que não está no servidor
        dá um menu que abre para um erro — pior do que não ter o menu."""
        self.licenca.modules = ['pos', 'pms', 'modulo_que_nao_existe']
        self.licenca.save(update_fields=['modules'])
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertNotIn('modulo_que_nao_existe', self._modulos_ativos())


class PuxarAtualizacaoTests(CircuitoPcc):
    """O cliente carrega em "Atualizar" — e o que acontece a seguir."""

    def test_sem_sincronizar_nao_ha_atualizacao_nenhuma_a_puxar(self):
        r = self.client.post('/api/licensing/apply-update/', {}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertIn('instalador completo', str(r.data),
                      'Recusou sem explicar que esta versão exige o instalador .exe.')

    def test_depois_de_sincronizar_a_atualizacao_arranca(self):
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')

        # O processo da atualização NÃO se lança a sério dentro de um teste: ele
        # pára o serviço e reescreve a pasta do projeto. O que se verifica é que
        # é lançado, com o pacote certo — o resto é o atualizar.py, que corre
        # fora daqui por desenho (sobrevive ao Django ser morto).
        with mock.patch('subprocess.Popen') as lancar:
            r = self.client.post('/api/licensing/apply-update/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertTrue(lancar.called, 'Respondeu "a atualizar" e não lançou nada.')
        argumentos = lancar.call_args[0][0]
        self.assertIn('--url', argumentos)
        self.assertIn('https://exemplo.ao/erp-1.2.0.zip', argumentos,
                      'Lançou a atualização sem o pacote que o PCC indicou.')

    def test_so_o_dono_atualiza(self):
        """Uma atualização pára o serviço a meio do serviço. Não é um botão
        para o empregado de mesa."""
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')
        operador = User.objects.create_user('empregado', '', 'x')
        self.client.force_authenticate(operador)
        r = self.client.post('/api/licensing/apply-update/', {}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])

    def test_pacote_exe_nao_se_aplica_a_um_clique(self):
        """Um .exe é um assistente com janelas: não se corre sozinho num
        servidor sem ninguém à frente."""
        SystemRelease.objects.all().delete()
        SystemRelease.objects.create(version='1.3.0',
                                     download_url='https://exemplo.ao/setup-1.3.0.exe')
        with self._ligar_ao_pcc():
            self.client.post('/api/licensing/sync/', {}, format='json')
        r = self.client.post('/api/licensing/apply-update/', {}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])


class AtivacaoAutomaticaTests(CircuitoPcc):
    """A PRIMEIRA licença, sem ninguém copiar ficheiros.

    Era aqui que a instalação acabava mal: o setup corria até ao fim, o cliente
    abria o browser — e encontrava um ecrã bloqueado à espera de um
    `license.key` que alguém tinha de ir pôr à mão dentro da pasta do servidor.
    Na prática: ou o técnico ficava lá, ou o dono telefonava no dia seguinte a
    dizer que não entrava.

    Agora o próprio instalador vai buscá-la, autenticando-se com o código do
    cliente e a senha de instalação — as duas coisas que o técnico já tem para
    abrir o .exe. Estes testes correm o MESMO código que o instalador corre.
    """

    def setUp(self):
        super().setUp()
        # Esta é a primeira activação: ainda NÃO há licença instalada.
        import os
        if os.path.exists(self.caminho):
            os.remove(self.caminho)
        from clm.secrets import encrypt
        self.licenca.install_password_enc = encrypt('Senha#Instalacao2026')
        self.licenca.save(update_fields=['install_password_enc'])

    def _ligar_activacao(self, rebenta=None):
        """O mesmo fio do `_ligar_ao_pcc`, mas para a rota de ativação."""
        from unittest import mock
        cliente_http = self.client

        class _Resp:
            def __init__(self, r):
                self.status_code = r.status_code
                self._d = r.data if hasattr(r, 'data') else {}

            def json(self):
                return self._d

        def _post(url, json=None, timeout=None, **kw):
            if rebenta:
                raise rebenta
            return _Resp(cliente_http.post('/api/clm/licenses/activate/', json, format='json'))

        return mock.patch('requests.post', side_effect=_post)

    def test_a_instalacao_acaba_com_o_sistema_pronto(self):
        from licensing.activation import activar
        with self._ligar_activacao():
            r = activar('MWANA', 'Senha#Instalacao2026', pcc_url='http://pcc-de-teste')

        self.assertEqual(r['license_number'], 'LIC-0002')
        self.assertTrue(r['modules'], 'Ativou sem módulos nenhuns.')
        gravada = json.loads(base64.b64decode(self._no_disco()).decode('utf-8'))
        self.assertEqual(gravada['client_code'], 'MWANA',
                         'O ficheiro gravado não é a licença deste cliente.')
        # E os dados da empresa vieram no mesmo canal: o dono não os reescreve.
        self.assertTrue(r['company_applied'])

    def test_a_conta_do_dono_vem_do_pcc_e_obriga_a_trocar(self):
        """O técnico deixa de precisar de SABER a senha do dono.

        Antes, ele lia-a no PCC e escrevia-a no wizard — ou seja, toda a gente
        que instala conhece a senha com que o dono entra no sistema dele. Agora
        ela viaja no mesmo canal da licença, é usada uma vez para criar a conta,
        e o dono é obrigado a trocá-la no primeiro login: não sobrevive nenhuma
        senha de fábrica.
        """
        from clm.secrets import encrypt
        from licensing.activation import activar
        self.licenca.owner_username = 'dono'
        self.licenca.owner_password_enc = encrypt('Provisoria#2026')
        self.licenca.save(update_fields=['owner_username', 'owner_password_enc'])

        with self._ligar_activacao():
            r = activar('MWANA', 'Senha#Instalacao2026', pcc_url='http://pcc-de-teste')

        self.assertIsNotNone(r.get('owner'), 'A conta do dono não veio do PCC.')
        self.assertEqual(r['owner']['username'], 'dono')
        self.assertEqual(r['owner']['password'], 'Provisoria#2026')
        self.assertTrue(r['owner']['must_change'],
                        'Uma senha que viajou tem de ser trocada no primeiro login.')

    def test_o_nome_do_dono_escolhido_no_pcc_e_o_que_chega(self):
        """O nome estava fixo em 'dono' para toda a gente — e não havia onde o
        escrever, nem no assistente nem nos Acessos. Um hotel que quisesse
        entrar como "gerente" não tinha por onde."""
        from clm.secrets import encrypt
        from licensing.activation import activar
        self.licenca.owner_username = 'gerente'
        self.licenca.owner_password_enc = encrypt('Provisoria#2026')
        self.licenca.save(update_fields=['owner_username', 'owner_password_enc'])

        with self._ligar_activacao():
            r = activar('MWANA', 'Senha#Instalacao2026', pcc_url='http://pcc-de-teste')
        self.assertEqual(r['owner']['username'], 'gerente',
                         'O nome escolhido no PCC não chegou à instalação.')

    def test_o_pcc_deixa_escolher_o_nome_ao_gerar_a_senha(self):
        """O ecrã "Acessos": gerar a senha do dono passa a poder mudar o nome."""
        r = self.client.post(f'/api/clm/licenses/{self.licenca.id}/regenerate-access/',
                             {'kind': 'owner', 'owner_username': 'recepcao'},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.data['username'], 'recepcao')
        self.licenca.refresh_from_db()
        self.assertEqual(self.licenca.owner_username, 'recepcao')

    def test_sem_escolha_continua_a_ser_dono(self):
        r = self.client.post(f'/api/clm/licenses/{self.licenca.id}/regenerate-access/',
                             {'kind': 'owner'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.data['username'], 'dono')

    def test_a_senha_do_dono_nunca_volta_para_o_browser(self):
        """Ela existe para o INSTALADOR criar a conta sem ninguém a ler.

        Devolvê-la numa resposta HTTP era pô-la no histórico do browser e na
        consola de rede de quem estivesse a ver o ecrã. E quem ativa pelo ecrã
        já entrou — já tem conta.
        """
        from clm.secrets import encrypt
        from unittest import mock as _m
        self.licenca.owner_password_enc = encrypt('Provisoria#2026')
        self.licenca.save(update_fields=['owner_password_enc'])

        with _m.patch.dict('os.environ', {'PCC_URL': 'http://pcc-de-teste'}), self._ligar_activacao():
            r = self.client.post('/api/licensing/activate-remote/',
                                 {'client_code': 'MWANA',
                                  'install_password': 'Senha#Instalacao2026'},
                                 format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertNotIn('owner', r.data)
        self.assertNotIn('Provisoria#2026', str(r.data))

    def test_a_renovacao_nao_transporta_a_senha_do_dono(self):
        """Sincronizar é uma renovação numa instalação a trabalhar: o dono já
        tem conta. Mandar a senha outra vez seria um segredo a viajar sem
        motivo nenhum."""
        from clm.secrets import encrypt
        self.licenca.owner_password_enc = encrypt('Provisoria#2026')
        self.licenca.save(update_fields=['owner_password_enc'])
        with open(self.caminho, 'w') as f:
            f.write(self.instalada)

        with self._ligar_ao_pcc():
            r = self.client.post('/api/licensing/sync/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertNotIn('Provisoria#2026', str(r.data))

    def test_senha_de_instalacao_errada_nao_ativa_nada(self):
        import os
        from licensing.activation import ErroDeAtivacao, activar
        with self._ligar_activacao():
            with self.assertRaises(ErroDeAtivacao) as ctx:
                activar('MWANA', 'senha-errada', pcc_url='http://pcc-de-teste')
        self.assertIn('incorret', ctx.exception.detalhe.lower())
        self.assertFalse(os.path.exists(self.caminho),
                         'Gravou uma licença apesar de a senha estar errada.')

    def test_sem_internet_a_instalacao_nao_se_perde(self):
        """Falhar a ativação não pode estragar a instalação: o sistema fica
        montado e ativa-se depois pelo ecrã."""
        import os
        from licensing.activation import ErroDeAtivacao, activar
        with self._ligar_activacao(rebenta=OSError('sem rota para o host')):
            with self.assertRaises(ErroDeAtivacao) as ctx:
                activar('MWANA', 'Senha#Instalacao2026', pcc_url='http://pcc-de-teste')
        self.assertIn('Sem ligação ao PCC', ctx.exception.detalhe)
        self.assertFalse(os.path.exists(self.caminho))

    def test_nao_se_ativa_por_cima_de_uma_licenca_que_ja_existe(self):
        """Ativar é para a PRIMEIRA vez. Renovar é "Sincronizar com o PCC", que
        exige prova de posse — e não a senha de instalação, que anda com o .exe."""
        from licensing.activation import ErroDeAtivacao, activar
        with open(self.caminho, 'w') as f:
            f.write(self.instalada)
        with self.assertRaises(ErroDeAtivacao) as ctx:
            activar('MWANA', 'Senha#Instalacao2026', pcc_url='http://pcc-de-teste')
        self.assertEqual(ctx.exception.estado, 400)
        self.assertEqual(self._no_disco(), self.instalada)

    def test_licenca_de_outro_cliente_e_recusada_tambem_na_ativacao(self):
        """A mesma desconfiança da sincronização: o cliente verifica a
        assinatura e o código, mesmo vindo do PCC."""
        from unittest import mock
        from licensing.activation import ErroDeAtivacao, activar

        class _Trocada:
            status_code = 200
            @staticmethod
            def json():
                return {'license_key': _chave(client_code='OUTRO_HOTEL', numero='LIC-9999')}

        with mock.patch('requests.post', return_value=_Trocada()):
            with self.assertRaises(ErroDeAtivacao) as ctx:
                activar('MWANA', 'Senha#Instalacao2026', pcc_url='http://pcc-de-teste')
        self.assertIn('OUTRO_HOTEL', ctx.exception.detalhe)

    def test_o_ecra_de_ativacao_usa_o_mesmo_caminho(self):
        """O botão do ecrã e o instalador não podem divergir: é a mesma função."""
        from unittest import mock as _m
        # O ecrã não recebe o endereço: lê-o do ambiente, como numa instalação
        # a sério (o instalador grava-o no .env).
        with _m.patch.dict('os.environ', {'PCC_URL': 'http://pcc-de-teste'}), self._ligar_activacao():
            r = self.client.post('/api/licensing/activate-remote/',
                                 {'client_code': 'MWANA',
                                  'install_password': 'Senha#Instalacao2026'},
                                 format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['license_number'], 'LIC-0002')

class ReposicaoDePasswordTests(CircuitoPcc):
    """"Esqueci-me da password" — numa instalação JÁ a trabalhar.

    Ao contrário da ativação, esta exige licença instalada: é ela que diz ao
    PCC a que cliente esta máquina pertence. Por isso vive aqui, e não na
    classe da ativação (que apaga a licença de propósito).
    """

    def test_repor_a_password_deixa_rasto_e_derruba_as_sessoes(self):
        """A operação mais sensível do sistema não deixava rasto NENHUM.

        Quem consegue repor a password do dono fica com acesso total — basta um
        telefonema ao fornecedor. E não ficava registado quem, quando, nem de
        que máquina: quem auditasse a instalação não tinha como saber que tinha
        acontecido.

        E as sessões antigas continuavam vivas. Repõe-se uma password por duas
        razões: ou se perdeu, ou alguém a tem. No segundo caso, mudar a password
        e deixar a sessão do intruso a funcionar não resolve nada.
        """
        from unittest import mock as _m
        from auth_engine.models import AuthEventLog
        from django.contrib.auth import get_user_model

        User = get_user_model()
        dono = User.objects.create_user('dono_do_hotel', '', 'antiga')

        class _Pcc:
            status_code = 200
            headers = {'content-type': 'application/json'}
            @staticmethod
            def json():
                return {'valid': True, 'username': 'dono_do_hotel'}

        with _m.patch.dict('os.environ', {'PCC_URL': 'http://pcc-de-teste'}),                 _m.patch('requests.post', return_value=_Pcc()):
            r = self.client.post('/api/licensing/reset-owner-password/',
                                 {'code': 'ABC123', 'new_password': 'NovaSenha#2026'},
                                 format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])

        dono.refresh_from_db()
        self.assertTrue(dono.check_password('NovaSenha#2026'), 'A password não foi reposta.')

        ev = AuthEventLog.objects.filter(event_type='PASSWORD_RESET').first()
        self.assertIsNotNone(ev, 'A reposição de password não deixou rasto nenhum.')
        self.assertEqual(ev.identity_attempt, 'dono_do_hotel')
        self.assertIn('sessão', ev.details)

    def test_codigo_errado_tambem_fica_registado(self):
        """É assim que se vê alguém a experimentar códigos."""
        from unittest import mock as _m
        from auth_engine.models import AuthEventLog

        class _Recusa:
            status_code = 200
            headers = {'content-type': 'application/json'}
            @staticmethod
            def json():
                return {'valid': False, 'detail': 'Código inválido ou expirado.'}

        with _m.patch.dict('os.environ', {'PCC_URL': 'http://pcc-de-teste'}),                 _m.patch('requests.post', return_value=_Recusa()):
            r = self.client.post('/api/licensing/reset-owner-password/',
                                 {'code': 'ERRADO', 'new_password': 'NovaSenha#2026'},
                                 format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.assertTrue(AuthEventLog.objects.filter(event_type='PASSWORD_RESET_FAILED').exists(),
                        'Uma tentativa falhada de reposição não ficou registada.')


class CatalogoDeModulosTests(APITestCase):
    """O catálogo tem de descrever o sistema que existe — não um de 2025.

    O catálogo (`core/modules.py`) é a fonte única: dele saem as apps que o
    Django carrega, o que o PCC oferece a um cliente novo, e o que a licença
    valida. Quando uma app nasce e ninguém a declara lá, ela funciona na mesma —
    e é exactamente isso que a torna perigosa: fica invisível ao licenciamento.
    Não se vende, não se desliga, o PCC nem sabe que existe. Foi o que aconteceu
    com a Faturação e com a Contabilidade.

    Este teste é o aviso que faltou: quem acrescentar uma app sem a declarar
    sabe disso no momento, não meses depois.
    """

    def test_toda_a_app_do_sistema_esta_declarada_no_catalogo(self):
        from django.conf import settings
        from core.modules import CORE_MODULES, OPTIONAL_MODULES

        catalogo = ({m['code'] for m in CORE_MODULES}
                    | {m['code'] for m in OPTIONAL_MODULES})
        nossas = {a for a in settings.INSTALLED_APPS
                  if not a.startswith(('django', 'rest_framework', 'corsheaders',
                                       'django_filters'))}
        em_falta = sorted(nossas - catalogo)
        self.assertEqual(em_falta, [],
                         f'Apps instaladas que o catálogo de módulos não conhece: {em_falta}. '
                         f'Declare-as em core/modules.py (CORE_MODULES se nunca devem ser '
                         f'desligáveis, OPTIONAL_MODULES se se vendem à parte) — senão ficam '
                         f'invisíveis ao licenciamento e ao PCC.')

    def test_o_catalogo_nao_promete_apps_que_nao_existem(self):
        from django.conf import settings
        from core.modules import CORE_MODULES

        nossas = set(settings.INSTALLED_APPS)
        fantasmas = sorted({m['code'] for m in CORE_MODULES} - nossas)
        self.assertEqual(fantasmas, [],
                         f'O catálogo diz que estes módulos são núcleo mas não estão '
                         f'instalados: {fantasmas}.')

    def test_as_dependencias_entre_modulos_existem(self):
        """Um módulo que depende de outro que não está no catálogo nunca ativa."""
        from core.modules import OPTIONAL_MODULES
        codigos = {m['code'] for m in OPTIONAL_MODULES}
        for m in OPTIONAL_MODULES:
            for dep in m.get('requires', []):
                self.assertIn(dep, codigos,
                              f'"{m["code"]}" exige "{dep}", que não existe no catálogo.')

    def test_o_pms_pode_ser_vendido_a_um_cliente_novo(self):
        """Esteve marcado "ainda em desenvolvimento" e isso deixou de ser
        verdade. Enquanto a marca lá esteve, um cliente novo não o conseguia
        comprar pelo assistente do PCC, por muito que o quisesse."""
        from core.modules import sellable_modules
        self.assertIn('pms', {m['code'] for m in sellable_modules()})

    def test_a_consola_do_fornecedor_nao_se_vende_a_um_hotel(self):
        """O `clm` está instalado no cliente (outras apps importam os seus
        modelos) e por isso TEM de estar declarado — mas não é um produto."""
        from core.modules import all_modules, sellable_modules
        self.assertIn('clm', {m['code'] for m in all_modules()},
                      'O clm saiu do catálogo e volta a ficar invisível.')
        self.assertNotIn('clm', {m['code'] for m in sellable_modules()},
                         'A consola do fornecedor está a ser oferecida a clientes.')

    def test_o_validador_de_licencas_ve_tudo_o_que_existe(self):
        """`all_modules` serve o validador offline: tem de reconhecer até o que
        já não se vende, senão a licença de quem o tem deixa de ser válida."""
        from core.modules import all_modules, OPTIONAL_MODULES
        todos = {m['code'] for m in all_modules()}
        for m in OPTIONAL_MODULES:
            self.assertIn(m['code'], todos,
                          f'"{m["code"]}" existe mas o validador de licenças não o conhece.')

    def test_comprar_um_modulo_traz_o_que_ele_precisa(self):
        """Quem compra Compras não tem de saber que precisa de Inventário e de
        Fornecedores — o sistema resolve a cadeia sozinho."""
        from core.modules import resolve_active
        ativos = resolve_active(['procurement'])
        self.assertIn('procurement', ativos)
        self.assertIn('esm', ativos, 'Compras sem Fornecedores não arranca.')
        self.assertIn('inventory', ativos, 'Compras sem Inventário não arranca.')
