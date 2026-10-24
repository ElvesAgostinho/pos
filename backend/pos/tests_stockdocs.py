# -*- coding: utf-8 -*-
"""OS DOCUMENTOS DE STOCK DO POS — e o motor que agora os move.

A entrada de mercadoria, a requisição do bar ao economato, a transferência entre
armazéns e a contagem de inventário são os quatro documentos com que o economato
trabalha todos os dias. Eles escreviam o saldo do armazém À MÃO, com o seu
próprio cálculo de custo médio: um SEGUNDO motor de stock a viver ao lado do
verdadeiro (`inventory/stock.py`).

O que lhe faltava eram os LOTES. Uma compra lançada por aqui subia o saldo e não
criava lote nenhum; uma requisição baixava o saldo e não abatia lote nenhum. À
primeira compra, a soma dos lotes já não batia com o stock do artigo — e com ela
ia-se a validade (o FEFO a apontar para mercadoria já consumida, e a esconder a
que estava mesmo a expirar) e a rastreabilidade, a que serve para responder a
uma recolha do fornecedor: "esta caixa, de que lote veio?".

Por isso o `assert` que se repete neste ficheiro é sempre o mesmo, e é o único
que importa: **a soma dos lotes é igual ao saldo do armazém**. Se um dia voltar a
haver dois motores, é aqui que se dá por isso.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import (Item, ItemCategory, StockLevel, StockLot, StockMovement,
                              UnitOfMeasure, Warehouse)
from pos.models import StockDoc, StockDocLine, StockDocSeries


class EconomatoMontado(APITestCase):
    """Dois armazéns, dois artigos, e uma série para cada tipo de documento."""

    def setUp(self):
        self.user = User.objects.create_superuser('economato', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.',
                                         tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.economato = Warehouse.objects.create(hotel=self.hotel, code='ECO',
                                                  name='Economato', is_main=True)
        self.bar = Warehouse.objects.create(hotel=self.hotel, code='BAR', name='Bar da Piscina')

        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Bebidas')
        self.cerveja = Item.objects.create(code='B001', name='Cerveja Cuca 33cl',
                                           item_type='RawMaterial', category=cat,
                                           base_uom=self.un)
        self.leite = Item.objects.create(code='B002', name='Leite 1L', item_type='RawMaterial',
                                         category=cat, base_uom=self.un, shelf_life_days=15)

        self.compras = StockDocSeries.objects.create(code='FTF', name='Fatura de Fornecedor',
                                                     kind='INVOICE', nature='PAYABLE')
        self.requisicoes = StockDocSeries.objects.create(code='REQ', name='Requisição Interna',
                                                         kind='REQUEST')
        self.transferencias = StockDocSeries.objects.create(code='TRF', name='Transferência',
                                                             kind='TRANSFER')
        self.inventarios = StockDocSeries.objects.create(code='INV', name='Inventário',
                                                          kind='INVENTORY')

    # -- utilitários de leitura ------------------------------------------
    def saldo(self, armazem, artigo):
        n = StockLevel.objects.filter(warehouse=armazem, item=artigo).first()
        return (n.quantity_on_hand if n else Decimal('0')) or Decimal('0')

    def soma_dos_lotes(self, armazem, artigo):
        return sum((l.quantity or Decimal('0')) for l in
                   StockLot.objects.filter(warehouse=armazem, item=artigo))

    def bate(self, armazem, artigo, porque=''):
        """O ASSERT DESTE FICHEIRO. Os dois números contam a mesma mercadoria."""
        saldo, lotes = self.saldo(armazem, artigo), self.soma_dos_lotes(armazem, artigo)
        self.assertEqual(
            lotes, saldo,
            f'{porque}: o armazém {armazem.name} diz ter {saldo} de {artigo.name}, '
            f'mas a soma dos lotes dá {lotes}. São duas contas da mesma mercadoria — '
            f'quando divergem, a lista de validades e a rastreabilidade do lote '
            f'passam a mentir.')

    # -- utilitários de escrita ------------------------------------------
    def documento(self, serie, linhas, destino=None, origem=None):
        doc = StockDoc.objects.create(series=serie, doc_date=timezone.localdate(),
                                      warehouse=destino or self.economato,
                                      warehouse_from=origem)
        for l in linhas:
            StockDocLine.objects.create(doc=doc, **l)
        return doc

    def comprar(self, artigo, qtd, custo='100', lote=None, validade=None):
        doc = self.documento(self.compras, [dict(item=artigo, quantity=Decimal(str(qtd)),
                                                 unit_cost=Decimal(str(custo)),
                                                 lot=lote, expiry=validade)])
        doc.post(user='economato')
        return doc


class EntradaDeMercadoriaTests(EconomatoMontado):
    """A fatura do fornecedor — a mercadoria a ENTRAR."""

    def test_a_entrada_sobe_o_saldo_e_cria_o_lote(self):
        self.comprar(self.cerveja, 100)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('100.0000'))
        self.bate(self.economato, self.cerveja, 'depois de uma compra de 100')

    def test_a_entrada_usa_o_lote_e_a_validade_escritos_no_documento(self):
        """A guia do fornecedor traz o lote e o prazo. É o que se escreve na linha,
        e tem de ser o que fica no armazém — senão a recolha de um lote
        contaminado não tem por onde começar."""
        prazo = timezone.localdate() + timedelta(days=40)
        self.comprar(self.leite, 24, lote='L-2026-ABC', validade=prazo)
        lote = StockLot.objects.get(warehouse=self.economato, item=self.leite)
        self.assertEqual(lote.lot_number, 'L-2026-ABC')
        self.assertEqual(lote.expiry_date, prazo)

    def test_sem_lote_no_documento_o_lote_fica_com_o_numero_do_documento(self):
        """Ninguém escreve lotes à mão todos os dias. Sem lote, o rasto tem de ser
        o documento de entrada — é por ele que se descobre de quem veio."""
        doc = self.comprar(self.cerveja, 50)
        lote = StockLot.objects.get(warehouse=self.economato, item=self.cerveja)
        self.assertEqual(lote.lot_number, doc.number)

    def test_sem_validade_no_documento_vale_a_validade_da_ficha_do_artigo(self):
        """O leite tem 15 dias na ficha. Quem recebe não tem de os contar."""
        self.comprar(self.leite, 10)
        lote = StockLot.objects.get(warehouse=self.economato, item=self.leite)
        self.assertEqual(lote.expiry_date, timezone.localdate() + timedelta(days=15))

    def test_a_entrada_recalcula_o_custo_medio_ponderado(self):
        self.comprar(self.cerveja, 100, custo='100')
        self.comprar(self.cerveja, 100, custo='200')
        self.cerveja.refresh_from_db()
        self.assertEqual(self.cerveja.current_average_cost, Decimal('150.0000'),
                         'Cem a 100 e cem a 200 dão um custo médio de 150. É este '
                         'número que decide a margem de cada prato.')

    def test_serie_sem_atualizar_custo_medio_nao_toca_no_custo_do_artigo(self):
        """A caixa está no ecrã da série; se não fizesse nada, era um botão a
        mentir."""
        self.compras.updates_avg_cost = False
        self.compras.save(update_fields=['updates_avg_cost'])
        self.comprar(self.cerveja, 100, custo='100')
        self.cerveja.refresh_from_db()
        self.assertEqual(self.cerveja.current_average_cost or Decimal('0'), Decimal('0'))
        self.bate(self.economato, self.cerveja, 'entrada sem recálculo de custo')

    def test_serie_com_atualizar_ultimo_preco_poe_o_preco_de_compra_na_ficha(self):
        self.comprar(self.cerveja, 100, custo='137.5')
        self.cerveja.refresh_from_db()
        self.assertEqual(self.cerveja.purchase_price, Decimal('137.5000'))

    def test_lancar_duas_vezes_nao_entra_a_mercadoria_duas_vezes(self):
        doc = self.comprar(self.cerveja, 100)
        self.assertEqual(doc.post(user='economato'), 0)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('100.0000'))
        self.bate(self.economato, self.cerveja, 'depois de tentar lançar duas vezes')

    def test_serie_sem_ligacao_aos_stocks_nao_mexe_em_nada(self):
        """Uma encomenda ao fornecedor não é mercadoria no armazém."""
        self.compras.links_stock = False
        self.compras.save(update_fields=['links_stock'])
        doc = self.comprar(self.cerveja, 100)
        self.assertTrue(doc.posted)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('0'))
        self.assertFalse(StockLot.objects.filter(item=self.cerveja).exists())


class RequisicaoDoBarTests(EconomatoMontado):
    """A requisição — a mercadoria a SAIR do economato."""

    def test_a_requisicao_baixa_o_saldo_e_abate_o_lote(self):
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.requisicoes,
                             [dict(item=self.cerveja, quantity=Decimal('30'))],
                             origem=self.economato)
        doc.post(user='economato')
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('70.0000'))
        self.bate(self.economato, self.cerveja, 'depois de uma requisição de 30')

    def test_a_requisicao_tira_primeiro_o_que_expira_primeiro(self):
        """FEFO a EXECUTAR, não a informar: quem está a expirar sai primeiro,
        mesmo que tenha chegado depois."""
        self.comprar(self.leite, 10, lote='VELHO',
                     validade=timezone.localdate() + timedelta(days=3))
        self.comprar(self.leite, 10, lote='NOVO',
                     validade=timezone.localdate() + timedelta(days=90))
        doc = self.documento(self.requisicoes,
                             [dict(item=self.leite, quantity=Decimal('10'))],
                             origem=self.economato)
        doc.post(user='economato')
        velho = StockLot.objects.get(warehouse=self.economato, item=self.leite,
                                     lot_number='VELHO')
        novo = StockLot.objects.get(warehouse=self.economato, item=self.leite,
                                    lot_number='NOVO')
        self.assertEqual(velho.quantity, Decimal('0.0000'))
        self.assertEqual(novo.quantity, Decimal('10.0000'))
        self.assertFalse(velho.is_active, 'Um lote esgotado tem de sair das contagens '
                                          'de validade do painel.')

    def test_requisitar_mais_do_que_ha_e_recusado_e_explicado(self):
        """O motor recusa tirar o que não existe. Aqui há alguém ao ecrã que pode
        receber a mercadoria ou corrigir o inventário — ao contrário do balcão,
        onde a venda nunca se trava."""
        self.comprar(self.cerveja, 10)
        doc = self.documento(self.requisicoes,
                             [dict(item=self.cerveja, quantity=Decimal('40'))],
                             origem=self.economato)
        r = self.client.post(f'/api/pos/fnb/documents/{doc.id}/post_stock/', {}, format='json')
        self.assertEqual(r.status_code, 409, 'Falta de stock não é erro interno: é uma '
                                             'razão que se diz a quem está a lançar.')
        self.assertIn('40', str(r.data['detail']))
        self.assertIn('10', str(r.data['detail']))
        doc.refresh_from_db()
        self.assertFalse(doc.posted)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('10.0000'),
                         'Um documento recusado não pode ter mexido em nada.')
        self.bate(self.economato, self.cerveja, 'depois de uma requisição recusada')


class TransferenciaEntreArmazensTests(EconomatoMontado):
    """A transferência — a mesma mercadoria, outro armazém."""

    def test_a_transferencia_passa_o_saldo_de_um_armazem_para_o_outro(self):
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.transferencias,
                             [dict(item=self.cerveja, quantity=Decimal('40'))],
                             destino=self.bar, origem=self.economato)
        doc.post(user='economato')
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('60.0000'))
        self.assertEqual(self.saldo(self.bar, self.cerveja), Decimal('40.0000'))
        self.bate(self.economato, self.cerveja, 'origem, depois de transferir 40')
        self.bate(self.bar, self.cerveja, 'destino, depois de receber 40')

    def test_o_lote_e_a_validade_viajam_com_a_mercadoria(self):
        """A mesma caixa de leite não pode mudar de prazo só por ter mudado de
        armazém — é isso que a HACCP pede para se poder seguir a cadeia de frio
        de ponta a ponta."""
        prazo = timezone.localdate() + timedelta(days=7)
        self.comprar(self.leite, 24, lote='L-FRIO-9', validade=prazo)
        doc = self.documento(self.transferencias,
                             [dict(item=self.leite, quantity=Decimal('12'))],
                             destino=self.bar, origem=self.economato)
        doc.post(user='economato')
        chegou = StockLot.objects.get(warehouse=self.bar, item=self.leite)
        self.assertEqual(chegou.lot_number, 'L-FRIO-9')
        self.assertEqual(chegou.expiry_date, prazo)
        self.assertEqual(chegou.quantity, Decimal('12.0000'))

    def test_transferir_mais_do_que_ha_na_origem_e_recusado(self):
        """Sem isto, a origem ficava a negativo e o destino com mercadoria que
        nunca lá entrou: inventário inventado nos dois sítios ao mesmo tempo."""
        self.comprar(self.cerveja, 10)
        doc = self.documento(self.transferencias,
                             [dict(item=self.cerveja, quantity=Decimal('50'))],
                             destino=self.bar, origem=self.economato)
        r = self.client.post(f'/api/pos/fnb/documents/{doc.id}/post_stock/', {}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('10.0000'))
        self.assertEqual(self.saldo(self.bar, self.cerveja), Decimal('0'))


class ContagemDeInventarioTests(EconomatoMontado):
    """O inventário — o que foi CONTADO passa a ser a verdade."""

    def test_contar_menos_do_que_o_sistema_diz_abate_os_lotes(self):
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('94'),
                                   theoretical_qty=Decimal('100'))])
        doc.post(user='economato')
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('94.0000'))
        self.bate(self.economato, self.cerveja, 'contagem que encontrou 6 a menos')

    def test_contar_mais_do_que_o_sistema_diz_faz_entrar_a_sobra(self):
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('103'),
                                   theoretical_qty=Decimal('100'))])
        doc.post(user='economato')
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('103.0000'))
        self.bate(self.economato, self.cerveja, 'contagem que encontrou 3 a mais')

    def test_contagem_igual_ao_sistema_nao_gera_movimento_nenhum(self):
        self.comprar(self.cerveja, 100)
        antes = StockMovement.objects.count()
        doc = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('100'),
                                   theoretical_qty=Decimal('100'))])
        self.assertEqual(doc.post(user='economato'), 0)
        self.assertEqual(StockMovement.objects.count(), antes,
                         'Uma contagem que confirma o stock não é um movimento.')

    def test_a_contagem_guarda_o_saldo_que_havia_no_momento_do_lancamento(self):
        """É contra ESTE número que o ajuste foi feito — e é a única forma de o
        poder desfazer com exactidão, porque o movimento de ajuste guarda a
        diferença sem o sinal."""
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('94'))])
        doc.post(user='economato')
        linha = doc.lines.get()
        self.assertEqual(linha.balance_before, Decimal('100.000'))


class AnularDesfazTests(EconomatoMontado):
    """Anular — e o lote a voltar atrás com o saldo."""

    def test_anular_uma_compra_tira_a_mercadoria_e_o_lote_que_ela_criou(self):
        """Anular sem desfazer o lote devolvia o saldo e deixava a mercadoria em
        lote, com validade, à espera de ser consumida: a soma dos lotes passava a
        ser maior do que o stock."""
        doc = self.comprar(self.cerveja, 100)
        r = self.client.post(f'/api/pos/fnb/documents/{doc.id}/void/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('0.0000'))
        self.bate(self.economato, self.cerveja, 'depois de anular a compra')

    def test_anular_uma_requisicao_devolve_a_mercadoria_ao_armazem(self):
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.requisicoes,
                             [dict(item=self.cerveja, quantity=Decimal('30'))],
                             origem=self.economato)
        doc.post(user='economato')
        r = self.client.post(f'/api/pos/fnb/documents/{doc.id}/void/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('100.0000'))
        self.bate(self.economato, self.cerveja, 'depois de anular a requisição')

    def test_anular_uma_contagem_que_encontrou_falta_devolve_a_falta(self):
        """O ERRO QUE ISTO FECHA: o movimento de ajuste guarda a MAGNITUDE da
        diferença e perde o sinal. A anulação tratava todo o ajuste como se tivesse
        sido uma entrada e SUBTRAÍA — anular uma contagem que encontrara 6
        garrafas a menos tirava outras 6 do armazém, e o buraco duplicava."""
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('94'))])
        doc.post(user='economato')
        r = self.client.post(f'/api/pos/fnb/documents/{doc.id}/void/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('100.000'),
                         'Anular a contagem tem de repor as 100 que lá estavam '
                         'antes dela — não tirar 6 outra vez.')
        self.bate(self.economato, self.cerveja, 'depois de anular a contagem')

    def test_anular_uma_contagem_que_encontrou_sobra_retira_a_sobra(self):
        self.comprar(self.cerveja, 100)
        doc = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('107'))])
        doc.post(user='economato')
        self.client.post(f'/api/pos/fnb/documents/{doc.id}/void/', {}, format='json')
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('100.000'))
        self.bate(self.economato, self.cerveja, 'depois de anular a contagem com sobra')

    def test_anular_duas_vezes_e_recusado(self):
        doc = self.comprar(self.cerveja, 100)
        self.client.post(f'/api/pos/fnb/documents/{doc.id}/void/', {}, format='json')
        r = self.client.post(f'/api/pos/fnb/documents/{doc.id}/void/', {}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('0.0000'))


class UmDiaNoEconomatoTests(EconomatoMontado):
    """O dia todo seguido — e a conta a fechar no fim."""

    def test_compra_requisicao_transferencia_e_contagem_fecham_a_mesma_conta(self):
        """Nenhum destes testes vale se os quatro documentos juntos não derem o
        mesmo número. É este o teste que apanha um motor a aparecer outra vez."""
        self.comprar(self.cerveja, 240, custo='150')          # chega a cerveja
        self.comprar(self.leite, 48, custo='400')             # e o leite

        req = self.documento(self.requisicoes,
                             [dict(item=self.cerveja, quantity=Decimal('60')),
                              dict(item=self.leite, quantity=Decimal('12'))],
                             origem=self.economato)
        req.post(user='economato')                            # o bar requisita

        trf = self.documento(self.transferencias,
                             [dict(item=self.cerveja, quantity=Decimal('30'))],
                             destino=self.bar, origem=self.economato)
        trf.post(user='economato')                            # e leva 30 para o bar

        inv = self.documento(self.inventarios,
                             [dict(item=self.cerveja, quantity=Decimal('148'))])
        inv.post(user='economato')                            # a contagem: faltam 2

        self.assertEqual(self.saldo(self.economato, self.cerveja), Decimal('148.0000'))
        self.assertEqual(self.saldo(self.bar, self.cerveja), Decimal('30.0000'))
        self.assertEqual(self.saldo(self.economato, self.leite), Decimal('36.0000'))
        for armazem, artigo in ((self.economato, self.cerveja), (self.bar, self.cerveja),
                                (self.economato, self.leite)):
            self.bate(armazem, artigo, 'fim do dia no economato')

    def test_cada_documento_deixa_o_seu_rasto_no_livro_de_movimentos(self):
        """Quem pergunta "de onde veio esta falta?" segue a referência do
        documento. Um movimento sem referência não se explica a ninguém."""
        doc = self.comprar(self.cerveja, 100)
        mv = StockMovement.objects.get(reference=doc.number)
        self.assertEqual(mv.movement_type, 'GRN')
        self.assertEqual(mv.quantity, Decimal('100.0000'))
        self.assertEqual(mv.note, self.compras.name)
        self.assertEqual(mv.created_by, 'economato')
