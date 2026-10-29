# -*- coding: utf-8 -*-
"""O NOME DA CONTA DO DONO DO CLIENTE, do Wizard até ao login dele.

O fornecedor escreve, no Wizard do PCC, o nome com que o dono daquele hotel vai
entrar no sistema — "nataniel", "sr.silva", o que for. Era ignorado: a conta
chamava-se SEMPRE "dono", escrevesse-se lá o que se escrevesse.

A causa era uma linha em falta. O `ProvisioningRequestSerializer` não declarava
`owner_username`, e o DRF atira fora tudo o que um serializer não declara: o
ecrã enviava o nome, a vista fazia `validated_data.get('owner_username')` e
recebia `None`, caindo no `or 'dono'`. Nenhum teste apanhava isto porque todos
chamavam o motor (`ProvisioningWorkflow`) directamente, passando o nome à mão —
e o motor sempre funcionou. O que estava partido era a PORTA.

É por isso que estes testes entram pela porta — `POST /api/clm/clients/provision/`
— e seguem o nome até ao sítio onde o cliente o vai usar: a resposta da
activação remota, que é o que cria a conta na máquina dele.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase


class OFornecedorEscolheONomeDaContaTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('fornecedor', '', 'x')
        self.client.force_authenticate(self.user)

    def _provisionar(self, **extra):
        corpo = {
            'client_data': {'code': 'HTL-NAT', 'commercial_name': 'Hotel Nataniel',
                            'client_type': 'COMPANY'},
            'commercial_data': {'plan': 'Completo'},
            'modules': ['core', 'pos', 'pms'],
            **extra,
        }
        return self.client.post('/api/clm/clients/provision/', corpo, format='json')

    def _licenca(self):
        from clm.models import License
        return License.objects.order_by('-created_at').first()

    def test_o_nome_escrito_no_wizard_e_o_nome_da_conta(self):
        r = self._provisionar(owner_username='nataniel')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        self.assertEqual(self._licenca().owner_username, 'nataniel',
                         'O nome escrito no Wizard não chegou à licença — a conta do '
                         'cliente vai chamar-se "dono" outra vez.')

    def test_a_resposta_do_wizard_diz_o_nome_que_ficou(self):
        """O fornecedor tem de o LER no ecrã, para o poder dizer ao cliente."""
        r = self._provisionar(owner_username='sr.silva')
        self.assertEqual(r.data.get('owner_username'), 'sr.silva',
                         f'O Wizard não devolveu o nome da conta: {r.data}')

    def test_sem_nome_escrito_continua_a_chamar_se_dono(self):
        """O comportamento de sempre quando o campo fica vazio — é um valor por
        omissão útil, o defeito era ele ser o ÚNICO possível."""
        self._provisionar()
        self.assertEqual(self._licenca().owner_username, 'dono')

    def test_um_campo_vazio_tambem_cai_no_dono(self):
        """O ecrã manda string vazia quando não se escreve nada, e uma conta
        chamada "" não se pode criar."""
        self._provisionar(owner_username='   ')
        self.assertEqual(self._licenca().owner_username, 'dono')

    def test_o_nome_chega_a_maquina_do_cliente_na_activacao(self):
        """O FIM DO CAMINHO. É a resposta da activação remota que cria a conta
        na instalação do cliente: se o nome não vier aqui, não serve de nada ter
        ficado guardado no PCC."""
        self._provisionar(owner_username='nataniel')
        lic = self._licenca()
        self.assertTrue(lic.install_password_enc,
                        'A licença nasceu sem senha de instalação.')
        from clm.secrets import decrypt
        senha = decrypt(lic.install_password_enc)

        # A activação é pública (é a instalação do cliente a chamar).
        self.client.force_authenticate(None)
        r = self.client.post('/api/clm/licenses/activate/',
                             {'client_code': 'HTL-NAT', 'install_password': senha,
                              'hostname': 'PC-RECEPCAO'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data.get('owner', {}).get('username'), 'nataniel',
                         f'A activação mandou "{r.data.get("owner", {}).get("username")}" '
                         f'para a máquina do cliente, e o dono escolheu "nataniel".')
        self.assertTrue(r.data['owner'].get('must_change'),
                        'A senha de fábrica tem de ser trocada no primeiro login.')

    def test_dois_clientes_podem_ter_nomes_de_dono_diferentes(self):
        """O que o defeito tornava impossível: cada casa com o seu nome."""
        self._provisionar(owner_username='nataniel')
        corpo_b = {
            'client_data': {'code': 'HTL-MAR', 'commercial_name': 'Hotel Marítimo',
                            'client_type': 'COMPANY'},
            'commercial_data': {'plan': 'Completo'},
            'modules': ['core', 'pos'],
            'owner_username': 'gerente.mar',
        }
        self.client.post('/api/clm/clients/provision/', corpo_b, format='json')
        from clm.models import License
        nomes = dict(License.objects.values_list('client__code', 'owner_username'))
        self.assertEqual(nomes.get('HTL-NAT'), 'nataniel')
        self.assertEqual(nomes.get('HTL-MAR'), 'gerente.mar')
