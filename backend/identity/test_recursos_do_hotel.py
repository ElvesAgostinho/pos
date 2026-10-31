# -*- coding: utf-8 -*-
"""OS RECURSOS DO HOTEL — a lista tem de abrir.

Este ficheiro nasce de um defeito concreto: a consulta dos recursos pedia
`select_related('cost_center')` e o `HotelResource` não tem centro de custo
nenhum — tem hotel. O Django só valida o nome de um `select_related` quando a
consulta CORRE, e por isso nada se queixava: nem o arranque, nem as
verificações, nem o TypeScript do outro lado. O ecrã de Recursos respondia 500
a toda a gente, sempre, desde o dia em que a linha foi escrita.

É o defeito mais barato de escrever que existe — um nome dentro de uma string —
e o mais caro de encontrar, porque não deixa rasto nenhum até alguém abrir
aquele ecrã. O que o apanha é isto: abrir a lista de verdade e exigir 200.

Por isso o teste não verifica o conteúdo da resposta. Verifica que ela acontece.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel, HotelResource


class ListaDeRecursos(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('tecnico', '', 'x')
        self.client.force_authenticate(self.user)
        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Empresa', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Hotel Luanda')
        HotelResource.objects.create(hotel=self.hotel, code='VIAT-01',
                                     name='Carrinha de serviço', resource_type='VEHICLE')

    def test_a_lista_abre(self):
        r = self.client.get('/api/org/resources/')
        self.assertEqual(
            r.status_code, 200,
            'A lista de recursos não abriu (%s). Era isto que o '
            "select_related('cost_center') fazia: 500 a toda a gente, sempre."
            % r.status_code)

    def test_o_filtro_por_tipo_tambem_abre(self):
        """O filtro corre a MESMA consulta — e era aí que a linha má estava.

        Sem este, um dia alguém arranja a lista e deixa o filtro a rebentar, que
        é o caminho por onde o ecrã entra quando se escolhe uma categoria.
        """
        r = self.client.get('/api/org/resources/?resource_type=VEHICLE')
        self.assertEqual(r.status_code, 200)
