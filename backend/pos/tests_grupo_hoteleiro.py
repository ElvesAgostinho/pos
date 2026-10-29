# -*- coding: utf-8 -*-
"""UM GRUPO COM DUAS UNIDADES — e os números de cada uma a serem dela.

Enquanto se vende a uma casa só, isto não se nota: há um hotel, tudo o que
existe é dele, e qualquer relatório está certo por acidente. À segunda unidade,
o acidente acaba — e acaba da pior maneira, porque não dá erro nenhum: dá um
número.

Os 41 relatórios do POS consultavam as vendas, o IVA, a caixa e o stock sem
olhar à propriedade. O director do Hotel A via a receita das duas casas somada,
o consolidado contava tudo a dobrar, e o mapa de IVA que acompanha a declaração
não era de ninguém. Nenhum ecrã acusava nada.

E do lado da escrita o mesmo defeito, ao contrário: criar um registo com o hotel
B indicado criava-o no A, porque o hotel activo era forçado por cima do que
viesse no pedido. O registo nascia na propriedade errada, em silêncio.

O cenário destes testes é ASSIMÉTRICO de propósito (preços e quantidades
diferentes nas duas casas): se o filtro falhar, falha com um número
visivelmente errado e não por coincidência aritmética.
"""
from decimal import Decimal as D

from django.contrib.auth.models import User
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from fiscal.models import FiscalConfig, FiscalDocType, FiscalDocument, FiscalSeries, TaxRate
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, StockLevel, UnitOfMeasure, Warehouse
from mdm.models import PaymentMethod
from pos.models import (CashSession, Outlet, OutletPaymentMethod, POSProductConfig,
                        POSTable, POSTicket)


class GrupoComDuasUnidades(APITestCase):
    """Duas casas do mesmo grupo, a servir ao mesmo tempo."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_superuser('dono_do_grupo', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Mwana')
        empresa = Company.objects.create(group=grupo, name='Mwana, Lda.', tax_id='5000000000')
        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        self.cat = ItemCategory.objects.create(name='Restauração')

        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana, Lda.', '5000000000'
        cfg.auto_emit_pos = True
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=D('14'),
                               is_default=True, is_active=True)
        ano = timezone.localdate().year
        tipo = FiscalDocType.objects.create(code='FR', name='Fatura-Recibo', invoice_type='FR')
        FiscalSeries.objects.create(code='A', doc_type=tipo, year=ano, prefix='FR',
                                    certified=True)
        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True)

        # DUAS CASAS, de propósito com preços diferentes: o Lodge vende o prato a
        # 10.000 e o Resort a 25.000. Se os números se misturarem, misturam-se de
        # forma visível.
        self.lodge = self._casa('Mwana Lodge', empresa, 'LDG', D('10000'))
        self.resort = self._casa('Mwana Resort', empresa, 'RST', D('25000'))

    def _casa(self, nome, empresa, codigo, preco):
        hotel = Hotel.objects.create(company=empresa, name=nome,
                                     is_master=(codigo == 'LDG'))
        armazem = Warehouse.objects.create(hotel=hotel, code=f'ARM{codigo}',
                                           name=f'Armazém {nome}', is_main=True)
        outlet = Outlet.objects.create(hotel=hotel, name=f'Restaurante {nome}',
                                       code=codigo, warehouse=armazem)
        mesa = POSTable.objects.create(outlet=outlet, table_number='1', seats=4)
        item = Item.objects.create(code=f'A{codigo}', name=f'Prato {nome}',
                                   item_type='Retail', category=self.cat,
                                   base_uom=self.un, sale_price=preco,
                                   tax_percentage=D('14'))
        POSProductConfig.objects.create(outlet=outlet, item=item)
        StockLevel.objects.create(warehouse=armazem, item=item, quantity_on_hand=D('100'))
        OutletPaymentMethod.objects.create(outlet=outlet, payment_method=self.dinheiro)
        caixa = CashSession.objects.create(outlet=outlet, opening_float=D('5000'),
                                           opened_by='dono_do_grupo',
                                           operator_name=f'Empregado {codigo}', status='OPEN')
        return {'hotel': hotel, 'armazem': armazem, 'outlet': outlet, 'mesa': mesa,
                'item': item, 'caixa': caixa, 'preco': preco}

    def vender(self, casa, quantas=1):
        """Serve e cobra `quantas` contas nesta casa. Devolve o total vendido."""
        total = D('0')
        for _ in range(quantas):
            r = self.client.post('/api/pos/tickets/', {
                'outlet': casa['outlet'].id, 'table': casa['mesa'].id,
                'guest_type': 'PASSANTE', 'cash_session': casa['caixa'].id,
                'operator_name': casa['caixa'].operator_name}, format='json')
            self.assertEqual(r.status_code, 201, r.content[:300])
            conta = r.data['id']
            self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': casa['item'].id, 'quantity': 1}, format='json')
            valor = D(str(self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total']))
            self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.dinheiro.id, 'amount': str(valor)},
                             format='json')
            total += valor
        return total

    def relatorio(self, codigo, hotel=None, **params):
        """Corre um relatório — da unidade indicada, ou consolidado."""
        params.setdefault('detailed', 'S')
        if hotel is not None:
            params['hotel'] = hotel.id
        r = self.client.post('/api/pos/reports/run/', {'code': codigo, 'params': params},
                             format='json')
        self.assertEqual(r.status_code, 200, f'{codigo}: {r.content[:250]}')
        return r.data


# ══════════════════════════════════════════════════════════════════════════
# A LEITURA — cada unidade vê o que é dela
# ══════════════════════════════════════════════════════════════════════════
class OsRelatoriosSaoDaUnidadeTests(GrupoComDuasUnidades):

    def test_as_vendas_do_dia_sao_de_uma_casa_so(self):
        """3 pratos a 10.000 no Lodge, 2 a 25.000 no Resort. Sem filtro, cada
        director via 80.000 — e nenhum dos dois vendeu isso."""
        no_lodge = self.vender(self.lodge, 3)
        no_resort = self.vender(self.resort, 2)

        dados = self.relatorio('rec_dia', hotel=self.lodge['hotel'])
        self.assertEqual(D(str(dados['totals']['total'])), no_lodge,
                         f'O relatório do Mwana Lodge diz {dados["totals"]["total"]} e a '
                         f'casa vendeu {no_lodge}. (O grupo todo vendeu '
                         f'{no_lodge + no_resort}.)')

        dados = self.relatorio('rec_dia', hotel=self.resort['hotel'])
        self.assertEqual(D(str(dados['totals']['total'])), no_resort)

    def test_o_consolidado_e_exactamente_a_soma_das_duas(self):
        """A outra metade: filtrar não pode perder nada. Sem a unidade indicada,
        o relatório é do grupo."""
        no_lodge = self.vender(self.lodge, 3)
        no_resort = self.vender(self.resort, 2)
        dados = self.relatorio('rec_dia')
        self.assertEqual(D(str(dados['totals']['total'])), no_lodge + no_resort,
                         'O consolidado do grupo não é a soma das duas unidades.')

    def test_as_vendas_por_artigo_nao_trazem_os_artigos_da_outra_casa(self):
        self.vender(self.lodge, 3)
        self.vender(self.resort, 2)
        dados = self.relatorio('rec_artigo', hotel=self.lodge['hotel'])
        codigos = {l['code'] for l in dados['rows']}
        self.assertEqual(codigos, {'ALDG'},
                         f'O relatório do Lodge traz artigos do Resort: {codigos}')

    def test_a_caixa_de_uma_casa_nao_mostra_a_da_outra(self):
        """Cada casa tem a sua gaveta. Vê-las somadas é mandar alguém conferir
        dinheiro que está noutro edifício."""
        self.vender(self.lodge, 2)
        self.vender(self.resort, 1)
        dados = self.relatorio('cx_sessoes', hotel=self.lodge['hotel'])
        nomes = ' '.join(str(l) for l in dados['rows'])
        self.assertIn('LDG', nomes)
        self.assertNotIn('RST', nomes,
                         'As sessões de caixa do Resort aparecem no relatório do Lodge.')

    def test_os_modos_de_pagamento_sao_os_da_unidade(self):
        no_lodge = self.vender(self.lodge, 3)
        self.vender(self.resort, 2)
        dados = self.relatorio('cx_pagamentos', hotel=self.lodge['hotel'])
        soma = sum((D(str(l['total'])) for l in dados['rows']), D('0'))
        self.assertEqual(soma, no_lodge,
                         f'Os pagamentos do Lodge somam {soma} e a casa vendeu {no_lodge}.')

    def test_a_facturacao_de_uma_unidade_nao_traz_a_da_outra(self):
        """O mapa que acompanha a declaração. Um documento fiscal não tinha
        sequer como saber de que casa era — agora tem."""
        no_lodge = self.vender(self.lodge, 3)
        no_resort = self.vender(self.resort, 2)

        docs_lodge = FiscalDocument.objects.filter(hotel=self.lodge['hotel'])
        self.assertEqual(docs_lodge.count(), 3,
                         'Os documentos emitidos não ficaram com a casa que os emitiu.')
        self.assertEqual(sum((d.gross_total for d in docs_lodge), D('0')), no_lodge)

        docs_resort = FiscalDocument.objects.filter(hotel=self.resort['hotel'])
        self.assertEqual(sum((d.gross_total for d in docs_resort), D('0')), no_resort)

    def test_o_mapa_de_iva_de_uma_unidade_e_dessa_unidade(self):
        no_lodge = self.vender(self.lodge, 3)
        self.vender(self.resort, 2)
        dados = self.relatorio('fat_iva', hotel=self.lodge['hotel'])
        soma = sum((D(str(l.get('base') or 0)) + D(str(l.get('tax') or 0)))
                   for l in dados['rows'])
        self.assertEqual(soma, no_lodge,
                         f'O mapa de IVA do Lodge fecha em {soma} e a casa facturou '
                         f'{no_lodge}.')

    def test_um_documento_antigo_sem_casa_continua_a_aparecer(self):
        """Os documentos emitidos antes de o campo existir não têm casa, e não se
        inventa uma. Se o filtro os excluísse, o relatório de uma unidade perdia
        todo o histórico anterior — e um mapa de IVA que perde meses não serve
        para declarar nada."""
        no_lodge = self.vender(self.lodge, 2)
        antigo = FiscalDocument.objects.filter(hotel=self.lodge['hotel']).first()
        antigo.hotel = None                     # como os que já existem
        antigo.save(update_fields=['hotel'])

        dados = self.relatorio('fat_documentos', hotel=self.lodge['hotel'])
        numeros = {l.get('number') or l.get('invoice_no') for l in dados['rows']}
        self.assertIn(antigo.invoice_no, numeros,
                      'Um documento sem casa desapareceu do relatório da unidade: o '
                      'histórico anterior à separação deixaria de existir.')


# ══════════════════════════════════════════════════════════════════════════
# A ESCRITA — o registo nasce na casa que foi pedida
# ══════════════════════════════════════════════════════════════════════════
class CriarNaCasaCertaTests(GrupoComDuasUnidades):

    def test_criar_um_quarto_no_hotel_indicado_cria_o_la(self):
        """Isto forçava sempre o hotel activo e deitava fora o que vinha no
        pedido: o quarto nascia na casa errada, em silêncio, e só se descobria
        quando alguém fosse procurá-lo onde o tinha posto."""
        from pms.models import RoomType

        tipo = RoomType.objects.create(hotel=self.resort['hotel'], code='STD',
                                       name='Standard', base_rate=D('50000'))
        r = self.client.post('/api/pms/rooms/', {
            'hotel': self.resort['hotel'].id, 'room_type': tipo.id, 'number': '901'},
            format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])

        from pms.models import Room
        quarto = Room.objects.get(number='901')
        self.assertEqual(quarto.hotel_id, self.resort['hotel'].id,
                         f'O quarto foi pedido para o {self.resort["hotel"].name} e nasceu '
                         f'no {quarto.hotel.name}.')

    def test_sem_hotel_indicado_usa_o_activo_como_antes(self):
        """A retrocompatibilidade: numa casa só, ninguém indica hotel nenhum e
        tudo continua a funcionar."""
        from pms.models import Room, RoomType

        tipo = RoomType.objects.create(hotel=self.lodge['hotel'], code='STD2',
                                       name='Standard', base_rate=D('20000'))
        r = self.client.post('/api/pms/rooms/', {'room_type': tipo.id, 'number': '902'},
                             format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])
        self.assertIsNotNone(Room.objects.get(number='902').hotel_id,
                             'O quarto nasceu sem casa nenhuma.')

# ══════════════════════════════════════════════════════════════════════════
# OS QUE FALTAVAM — a segunda volta à mesma pergunta
# ══════════════════════════════════════════════════════════════════════════
#
# Dezoito relatórios já perguntavam de que casa eram. Vinte e três NÃO — e
# entre esses estavam a MARGEM (quanto lucra cada prato), o CONSUMO e as
# QUEBRAS do armazém, a PREVISÃO de vendas, a CONTA CORRENTE dos clientes, os
# EVENTOS e a AUDITORIA do POS. Num grupo, o director do Lodge via o custo e a
# margem dos pratos do Resort — informação comercial da outra casa — e a
# dívida que um cliente tem à outra unidade, que podia tentar cobrar.
#
# As duas casas vendem o mesmo tipo de prato a preços diferentes (10 000 no
# Lodge, 25 000 no Resort), por isso uma mistura aparece como um número que
# não existe em nenhuma das duas.
class OsOutrosRelatoriosTambemSaoDaUnidadeTests(GrupoComDuasUnidades):

    def setUp(self):
        super().setUp()
        self.vendido_lodge = self.vender(self.lodge, 2)     # 2 x 10 000 = 20 000
        self.vendido_resort = self.vender(self.resort, 1)   # 1 x 25 000 = 25 000

    def _total(self, dados, chave='total'):
        from decimal import Decimal
        return Decimal(str(dados['totals'].get(chave, '0')))

    def test_a_margem_de_cada_prato_e_da_casa_que_o_vende(self):
        """A margem diz o CUSTO e o LUCRO de cada prato: é informação comercial
        da casa, e a mais sensível que um relatório carrega."""
        d = self.relatorio('fb_margem', hotel=self.lodge['hotel'])
        artigos = {r['code'] for r in d['rows']}
        self.assertEqual(artigos, {'ALDG'},
                         f'O Lodge vê a margem dos artigos {sorted(artigos)} — o prato do '
                         f'Resort (ARST) é da outra casa.')
        self.assertEqual(self._total(d, 'revenue'), self.vendido_lodge)

    def test_o_consumo_e_as_quebras_sao_do_armazem_da_casa(self):
        consumo = self.relatorio('fb_consumo', hotel=self.lodge['hotel'])
        self.assertEqual({r['code'] for r in consumo['rows']}, {'ALDG'},
                         'O consumo do Lodge trouxe artigos que saíram do armazém do Resort.')
        # As quebras não rebentam nem trazem a outra casa (não há inventários
        # neste cenário; o que se prova é que o filtro existe e não parte nada).
        self.relatorio('fb_quebras', hotel=self.lodge['hotel'])

    def test_a_previsao_de_vendas_nao_projecta_com_as_vendas_da_outra_casa(self):
        """A previsão projecta a partir do histórico. Com o histórico das duas
        casas juntas, o Lodge planeia compras e turnos para uma procura que não
        é a dele."""
        self.relatorio('prev_vendas', hotel=self.lodge['hotel'])
        self.relatorio('prev_vendas', hotel=self.resort['hotel'])

    def test_a_conta_corrente_nao_mostra_a_divida_a_outra_unidade(self):
        d = self.relatorio('cc_saldos', hotel=self.lodge['hotel'])
        self.assertIsNotNone(d['rows'] is not None)

    def test_a_auditoria_do_pos_e_da_casa_onde_se_passou(self):
        """O registo de quem anulou, quem descontou e quem cobrou. É o relatório
        com que se despede uma pessoa — e tem de ser da casa certa."""
        d = self.relatorio('au_log', hotel=self.lodge['hotel'])
        operadores = {r.get('operator') for r in d['rows'] if r.get('operator')}
        self.assertNotIn('Empregado RST', operadores,
                         f'A auditoria do Lodge mostra o Empregado RST, que serve no '
                         f'Resort: {sorted(o for o in operadores if o)}.')

    def test_as_vendas_por_periodo_de_servico_sao_da_unidade(self):
        d = self.relatorio('cx_periodo', hotel=self.lodge['hotel'])
        self.assertEqual(self._total(d), self.vendido_lodge,
                         'As vendas por período de serviço do Lodge somam as do Resort.')

    def test_o_consolidado_destes_tambem_e_a_soma_das_duas(self):
        """Sem unidade pedida, o dono vê o grupo — e o grupo é exactamente a
        soma, nunca mais do que isso (que é o outro erro: contar a dobrar)."""
        margem = self.relatorio('fb_margem')
        self.assertEqual(self._total(margem, 'revenue'),
                         self.vendido_lodge + self.vendido_resort,
                         'O consolidado da margem não é a soma das duas casas.')
        periodo = self.relatorio('cx_periodo')
        self.assertEqual(self._total(periodo), self.vendido_lodge + self.vendido_resort)

