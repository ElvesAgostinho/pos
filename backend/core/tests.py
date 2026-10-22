# -*- coding: utf-8 -*-
"""Uma instalação acabada de montar não pode responder "erro interno".

Quase todos os registos do sistema pertencem a um hotel, e os ecrãs preenchiam-no
com `Hotel.objects.first()`. Antes de existir empresa/hotel isso é `None`, a
gravação viola o NOT NULL da base de dados, e o cliente novo — que está
precisamente no primeiro ecrã que vê — recebe "Ocorreu um erro interno ao
processar o pedido" em cerca de uma dezena de sítios diferentes, sem nada que
lhe diga o que fazer.

Estes testes fixam as duas metades da correcção: sem hotel, um 400 que se lê;
com hotel, grava normalmente.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel


class InstalacaoNovaSemHotelTests(APITestCase):
    """O caminho que o cliente novo percorre antes de configurar a empresa."""

    def setUp(self):
        self.user = User.objects.create_superuser('dono_teste', '', 'x')
        self.client.force_authenticate(self.user)

    def test_gravar_sem_hotel_explica_em_vez_de_rebentar(self):
        r = self.client.post('/api/finance/accounts/', {
            'code': 'CX01', 'name': 'Caixa', 'account_type': 'CASH', 'currency': 'AOA',
        }, format='json')
        self.assertEqual(r.status_code, 400, r.content[:400])
        texto = str(r.data)
        # A mensagem tem de dizer ONDE se resolve, não só que falhou.
        self.assertIn('Empresa', texto)
        self.assertIn('Adicionar', texto)

    def test_criar_a_empresa_pelo_ecra_da_configuracao_cria_a_hierarquia(self):
        """Grupo → Empresa → Hotel: o dono só preenche o hotel, o resto nasce sozinho."""
        r = self.client.post('/api/org/pos/companies/', {
            'name': 'Mwana Lodge', 'country': 'Angola', 'currency': 'AOA',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(Hotel.objects.count(), 1)
        self.assertEqual(Company.objects.count(), 1)
        self.assertEqual(EnterpriseGroup.objects.count(), 1)

    def test_depois_de_haver_hotel_grava_normalmente(self):
        g = EnterpriseGroup.objects.create(name='Grupo Principal')
        c = Company.objects.create(group=g, name='Empresa Principal')
        Hotel.objects.create(company=c, name='Mwana Lodge')
        r = self.client.post('/api/finance/accounts/', {
            'code': 'CX01', 'name': 'Caixa', 'account_type': 'CASH', 'currency': 'AOA',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(r.data['hotel'], Hotel.objects.first().id)
