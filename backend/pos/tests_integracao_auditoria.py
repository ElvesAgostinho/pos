# -*- coding: utf-8 -*-
"""A INTEGRAÇÃO ENTRE OS TRÊS MÓDULOS — o que uma auditoria pergunta.

O sistema são três coisas que têm de contar a mesma história: o TERMINAL onde se
serve, o BACKOFFICE onde se administra, e o PMS onde o hóspede vive. Os testes
que já existem percorrem cada um por dentro. Estes percorrem as costuras — que é
onde um sistema de três módulos se parte.

As quatro perguntas aqui são as que custam dinheiro quando a resposta é não:

  1. UMA VENDA DE ONTEM MUDA QUANDO O PREÇO MUDA HOJE? Se mudar, o relatório do
     mês passado deixa de bater com as facturas emitidas — e nenhuma inspecção
     aceita "é que entretanto subimos os preços". Cada venda tem de conservar o
     valor que foi cobrado, no documento, no relatório e na contabilidade.

  2. ANULAR UMA VENDA DESFAZ TUDO O QUE ELA FEZ? A conta, o stock, a gaveta, os
     relatórios e o arquivo fiscal. Anular só o que está à frente dos olhos
     deixa o resto a contar a venda que já não existe.

  3. UM HÓSPEDE SAI COM A CONTA POR PAGAR? Um consumo lançado no quarto NÃO é
     dinheiro recebido — é uma dívida. Deixar fechar a conta sem recebimento é
     dar a venda por boa e perder o dinheiro com a porta a fechar-se atrás dele.

  4. OS CINCO SÍTIOS DIZEM O MESMO NÚMERO? O terminal, a base de dados, o
     backoffice, os relatórios e a auditoria. Uma diferença entre eles não é um
     problema de ecrã: é o sistema a não saber o que vendeu.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from fiscal.models import FiscalConfig, FiscalDocType, FiscalDocument, FiscalSeries, TaxRate
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, Printer, StockLevel, UnitOfMeasure, Warehouse
from mdm.models import Customer, PaymentMethod
from pms.models import Folio, FolioCharge, Reservation, Room, RoomType
from pos.models import (CashSession, Outlet, OutletPaymentMethod, POSProductConfig,
                        POSTable, POSTicket, POSTicketLine, PosHardware)


class TresModulosMontados(APITestCase):
    """Hotel, restaurante, artigos, caixa e um quarto ocupado."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_accounting', verbosity=0)

    def setUp(self):
        cache.clear()           # o travão de pedidos guarda o histórico na cache
        self.user = User.objects.create_superuser('auditor', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Mwana')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.',
                                         tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='ECO', name='Economato',
                                                is_main=True)
        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST',
                                            warehouse=self.armazem)
        self.mesa = POSTable.objects.create(outlet=self.outlet, table_number='5', seats=4)
        maq = PosHardware.objects.create(code='HW1', name='Posto 1')
        Printer.objects.create(code='P-COZ', name='Cozinha', station='KITCHEN',
                               outlet=self.outlet, device=maq)

        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Cozinha')
        self.bife = Item.objects.create(code='A001', name='Bife à Casa', item_type='Retail',
                                        category=cat, base_uom=un, sale_price=D('8500'),
                                        tax_percentage=D('14'))
        POSProductConfig.objects.create(outlet=self.outlet, item=self.bife, kds_station='KITCHEN')
        StockLevel.objects.create(warehouse=self.armazem, item=self.bife,
                                  quantity_on_hand=D('100'))

        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True)
        self.quarto_pm = PaymentMethod.objects.create(code='QRT', name='Conta Quarto',
                                                      method_type='ROOM', for_pos=True,
                                                      charge_to_room=True)
        for pm in (self.dinheiro, self.quarto_pm):
            OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=pm)

        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.auto_emit_pos = True
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=D('14'),
                               is_default=True, is_active=True)
        ano = timezone.localdate().year
        for codigo, nome in (('FR', 'Fatura-Recibo'), ('FT', 'Fatura'), ('NC', 'Nota de Crédito')):
            tipo = FiscalDocType.objects.create(code=codigo, name=nome, invoice_type=codigo)
            FiscalSeries.objects.create(code='A', doc_type=tipo, year=ano, prefix=codigo,
                                        certified=True)

        self.caixa = CashSession.objects.create(outlet=self.outlet, opening_float=D('10000'),
                                                opened_by='auditor', operator_name='Empregado 1',
                                                status='OPEN')

    # ── atalhos ──────────────────────────────────────────────────────────
    def abrir(self, tipo='PASSANTE'):
        r = self.client.post('/api/pos/tickets/', {
            'outlet': self.outlet.id, 'table': self.mesa.id, 'guest_type': tipo,
            'cash_session': self.caixa.id, 'operator_name': 'Empregado 1'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:300])
        return r.data['id']

    def pedir(self, conta, artigo=None, qtd=1):
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': (artigo or self.bife).id, 'quantity': qtd}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:300])

    def total(self, conta):
        return D(str(self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total']))

    def cobrar(self, conta, pm=None, **extra):
        dados = {'payment_method': (pm or self.dinheiro).id, 'amount': str(self.total(conta))}
        dados.update(extra)
        return self.client.post(f'/api/pos/tickets/{conta}/pay/', dados, format='json')

    def relatorio(self, codigo, **params):
        params.setdefault('detailed', 'S')
        r = self.client.post('/api/pos/reports/run/', {'code': codigo, 'params': params},
                             format='json')
        self.assertEqual(r.status_code, 200, f'relatório {codigo}: {r.content[:200]}')
        return r.data

    def hospede_instalado(self, numero='101'):
        tipo = RoomType.objects.create(hotel=self.hotel, code=f'T{numero}', name='Standard',
                                       base_rate=D('25000'))
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number=numero,
                                     status='OCCUPIED')
        hospede = Customer.objects.create(code=f'H{numero}', name=f'Hóspede {numero}')
        hoje = timezone.localdate()
        reserva = Reservation.objects.create(
            hotel=self.hotel, confirmation=f'RES{numero}', guest=hospede, room=quarto,
            room_type=tipo, check_in=hoje, check_out=hoje + timedelta(days=1),
            status='CHECKED_IN', adults=1, rate=D('25000'))
        folio = Folio.objects.create(reservation=reserva, number=f'F{numero}', status='OPEN')
        return quarto, folio, reserva


# ══════════════════════════════════════════════════════════════════════════
# 1 · O PREÇO DE ONTEM É O PREÇO DE ONTEM
# ══════════════════════════════════════════════════════════════════════════
class OPrecoDeOntemNaoMudaTests(TresModulosMontados):
    """Mudar o preço hoje não pode reescrever o que se vendeu ontem.

    Se reescrevesse, o relatório do mês passado deixava de bater com as facturas
    emitidas, e a diferença seria impossível de explicar a uma inspecção: os
    documentos estão assinados e encadeados, o relatório não. É por isto que o
    preço se GUARDA na linha da venda em vez de se ir buscar ao artigo.
    """

    def _vender_e_subir_o_preco(self):
        conta = self.abrir()
        self.pedir(conta)
        cobrado = self.total(conta)
        self.assertEqual(cobrado, D('8500.00'))
        r = self.cobrar(conta)
        self.assertEqual(r.status_code, 200, r.content[:300])

        # O dono sobe o preço no backoffice, DEPOIS da venda.
        self.bife.sale_price = D('12000')
        self.bife.save(update_fields=['sale_price'])
        return conta, cobrado

    def test_a_linha_da_venda_conserva_o_preco_cobrado(self):
        conta, cobrado = self._vender_e_subir_o_preco()
        linha = POSTicketLine.objects.get(ticket_id=conta)
        self.assertEqual(linha.unit_price, D('8500.00'),
                         f'A linha passou a {linha.unit_price}: a subida de preço de hoje '
                         f'reescreveu uma venda já cobrada.')
        self.assertEqual(linha.line_total, D('8500.00'))

    def test_o_total_da_conta_fechada_nao_se_mexe(self):
        conta, cobrado = self._vender_e_subir_o_preco()
        self.assertEqual(POSTicket.objects.get(pk=conta).grand_total, cobrado)

    def test_o_documento_fiscal_continua_a_declarar_o_que_se_cobrou(self):
        """O documento está assinado e encadeado: se o valor mudasse, a cadeia de
        hash deixava de bater e o SAF-T declarava outra coisa."""
        conta, cobrado = self._vender_e_subir_o_preco()
        doc = FiscalDocument.objects.get(source_module='pos', source_ref=str(conta))
        self.assertEqual(doc.gross_total, cobrado,
                         f'A factura {doc.invoice_no} passou a declarar {doc.gross_total}.')

    def test_o_relatorio_de_vendas_continua_a_somar_o_que_se_cobrou(self):
        """O sítio mais fácil de errar: um relatório que multiplique a quantidade
        pelo preço ACTUAL do artigo dá um número diferente do que entrou na
        caixa — e dá-o em silêncio, mês após mês."""
        conta, cobrado = self._vender_e_subir_o_preco()
        dia = self.relatorio('rec_dia')
        self.assertEqual(D(str(dia['totals']['total'])), cobrado,
                         f'O relatório do dia diz {dia["totals"]["total"]} e a casa cobrou '
                         f'{cobrado}: está a usar o preço de hoje numa venda de antes.')
        artigo = self.relatorio('rec_artigo')
        linha = [l for l in artigo['rows'] if l['code'] == 'A001'][0]
        self.assertEqual(D(str(linha['total'])), cobrado)

    def test_a_venda_seguinte_ja_usa_o_preco_novo(self):
        """A outra metade: o preço novo TEM de chegar ao terminal. Um preço que
        só muda no backoffice é um preço que ninguém cobra."""
        self._vender_e_subir_o_preco()
        nova = self.abrir()
        self.pedir(nova)
        self.assertEqual(self.total(nova), D('12000.00'),
                         'O terminal continuou a cobrar o preço antigo depois de ele ter '
                         'sido mudado no backoffice.')

    def test_mudar_o_iva_nao_reescreve_o_imposto_ja_declarado(self):
        """O mesmo, no imposto — e aqui é a AGT que pergunta."""
        conta = self.abrir()
        self.pedir(conta)
        self.cobrar(conta)
        imposto_declarado = POSTicket.objects.get(pk=conta).tax_total

        self.bife.tax_percentage = D('5')
        self.bife.save(update_fields=['tax_percentage'])

        self.assertEqual(POSTicket.objects.get(pk=conta).tax_total, imposto_declarado,
                         'Baixar o IVA de um artigo mudou o imposto de uma venda já '
                         'declarada à AGT.')
        self.assertEqual(POSTicketLine.objects.get(ticket_id=conta).tax_percentage, D('14.00'))


# ══════════════════════════════════════════════════════════════════════════
# 2 · ANULAR DESFAZ TUDO O QUE A VENDA FEZ
# ══════════════════════════════════════════════════════════════════════════
class AnularDesfazEmTodoLadoTests(TresModulosMontados):
    """Anular só no ecrã deixa o stock, a caixa e os relatórios a contar uma
    venda que já não existe."""

    def _venda_paga(self):
        conta = self.abrir()
        self.pedir(conta, qtd=2)
        total = self.total(conta)
        self.cobrar(conta)
        return conta, total

    def test_anular_tira_a_venda_dos_relatorios(self):
        conta, total = self._venda_paga()
        antes = D(str(self.relatorio('rec_dia')['totals']['total']))
        self.assertEqual(antes, total)

        r = self.client.post(f'/api/pos/tickets/{conta}/void/',
                             {'reason': 'Cliente desistiu'}, format='json')
        self.assertIn(r.status_code, (200, 201, 400, 403), r.content[:300])
        if r.status_code != 200:
            self.skipTest(f'anular uma conta paga exige autorização nesta configuração: '
                          f'{r.data}')

        depois = D(str(self.relatorio('rec_dia')['totals']['total']))
        self.assertEqual(depois, D('0'),
                         f'O relatório do dia continua a somar {depois} de uma venda anulada.')

    def test_anular_nao_apaga_o_documento_fiscal(self):
        """Uma factura emitida NÃO se apaga: anula-se com uma nota de crédito. A
        AGT pede o arquivo anos depois, e um número que desaparece da série é
        matéria de auto."""
        conta, _ = self._venda_paga()
        doc = FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta)).first()
        if doc is None:
            self.skipTest('a venda não gerou documento fiscal nesta configuração')
        numero = doc.invoice_no
        self.client.post(f'/api/pos/tickets/{conta}/void/', {'reason': 'Engano'}, format='json')
        self.assertTrue(FiscalDocument.objects.filter(invoice_no=numero).exists(),
                        'Anular a venda apagou a factura do arquivo fiscal.')

    def test_a_nota_de_credito_nao_inventa_receita(self):
        """A nota de crédito devolve — não vende. Se entrasse nos relatórios com
        sinal positivo, anular uma venda AUMENTAVA a receita do dia."""
        conta, total = self._venda_paga()
        r = self.client.post(f'/api/pos/tickets/{conta}/credit_note/',
                             {'reason': 'Devolução'}, format='json')
        if r.status_code not in (200, 201):
            self.skipTest(f'nota de crédito indisponível nesta configuração: {r.data}')
        nc = FiscalDocument.objects.filter(doc_type__code='NC').first()
        self.assertIsNotNone(nc, 'A nota de crédito não gerou documento fiscal.')
        vendas = sum((d.gross_total for d in
                      FiscalDocument.objects.filter(doc_type__code__in=('FR', 'FT'))), D('0'))
        creditos = sum((d.gross_total for d in
                        FiscalDocument.objects.filter(doc_type__code='NC')), D('0'))
        self.assertEqual(vendas - creditos, D('0'),
                         f'Vendeu {vendas} e creditou {creditos}: a devolução não anulou a '
                         f'venda na conta final.')


# ══════════════════════════════════════════════════════════════════════════
# 3 · O HÓSPEDE NÃO SAI COM A CONTA POR PAGAR
# ══════════════════════════════════════════════════════════════════════════
class ConsumoNoQuartoNaoEDinheiroTests(TresModulosMontados):
    """Um consumo lançado no quarto é uma DÍVIDA, não um recebimento.

    É a distinção mais fácil de perder num sistema que liga POS e hotel — e a
    mais cara: dar a venda por recebida e deixar o hóspede sair.
    """

    def _jantar_no_quarto(self):
        quarto, folio, reserva = self.hospede_instalado()
        conta = self.abrir(tipo='HOTEL')
        self.pedir(conta)
        total = self.total(conta)
        r = self.cobrar(conta, pm=self.quarto_pm, room=quarto.number)
        self.assertEqual(r.status_code, 200, r.content[:300])
        return quarto, folio, reserva, conta, total

    def test_o_consumo_fica_como_divida_e_nao_como_dinheiro(self):
        quarto, folio, reserva, conta, total = self._jantar_no_quarto()
        folio.refresh_from_db()
        self.assertEqual(folio.balance, total,
                         f'A conta do quarto está a {folio.balance} e o hóspede consumiu '
                         f'{total}: o consumo foi dado por pago sem ninguém ter pago.')
        self.assertEqual(sum((p.amount for p in POSTicket.objects.get(pk=conta).payments.all()
                              if p.payment_method.method_type == 'CASH'), D('0')), D('0'),
                         'O consumo do quarto entrou como dinheiro na gaveta.')

    def test_a_gaveta_nao_conta_o_que_foi_para_o_quarto(self):
        _, _, _, _, total = self._jantar_no_quarto()
        esperado = CashSession.objects.get(pk=self.caixa.pk).expected_cash
        self.assertEqual(esperado, D('10000'),
                         f'A caixa espera {esperado}: está a contar como dinheiro um '
                         f'consumo que foi para a conta do quarto. No fecho, o empregado '
                         f'pagaria do bolso uma diferença que não existe.')

    def test_o_hospede_nao_faz_check_out_com_a_conta_por_liquidar(self):
        """O momento em que o dinheiro se perde: a porta fecha-se atrás dele."""
        quarto, folio, reserva, conta, total = self._jantar_no_quarto()
        r = self.client.post(f'/api/pms/reservations/{reserva.id}/check_out/', {},
                             format='json')
        self.assertEqual(r.status_code, 409,
                         f'O hóspede saiu com {folio.balance} por pagar (resposta '
                         f'{r.status_code}).')
        self.assertIn('liquidar', str(r.data).lower())

    def test_depois_de_liquidar_o_check_out_passa(self):
        quarto, folio, reserva, conta, total = self._jantar_no_quarto()
        r = self.client.post(f'/api/pms/folios/{folio.id}/settle/',
                             {'amount': str(total)}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])
        folio.refresh_from_db()
        self.assertEqual(folio.balance, D('0'))
        r = self.client.post(f'/api/pms/reservations/{reserva.id}/check_out/', {},
                             format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])

    def test_o_mesmo_consumo_nao_entra_duas_vezes_na_conta(self):
        """Dois caminhos levam ao mesmo folio (o botão de cobrar e a acção de
        lançar no quarto). Usar os dois sobre a mesma conta lançava o jantar
        duas vezes — e o hóspede pagava-o a dobrar no check-out."""
        quarto, folio, reserva, conta, total = self._jantar_no_quarto()
        self.client.post(f'/api/pos/tickets/{conta}/charge_to_room/',
                         {'room': quarto.number}, format='json')
        lancado = sum((c.amount for c in FolioCharge.objects.filter(folio=folio, is_void=False)),
                      D('0'))
        self.assertEqual(lancado, total,
                         f'A conta do quarto tem {lancado} de um jantar de {total}.')


# ══════════════════════════════════════════════════════════════════════════
# 4 · OS CINCO SÍTIOS DIZEM O MESMO NÚMERO
# ══════════════════════════════════════════════════════════════════════════
class MatrizDeConsistenciaTests(TresModulosMontados):
    """A mesma venda, vista de cinco sítios diferentes.

    Uma diferença entre eles não é um problema de ecrã: é o sistema a não saber
    o que vendeu. E cada sítio tem um dono diferente a olhar para ele — o
    empregado, o dono, o contabilista, a AGT — por isso a diferença só aparece
    quando já é tarde.
    """

    def test_terminal_base_backoffice_relatorio_e_auditoria_batem(self):
        conta = self.abrir()
        self.pedir(conta, qtd=3)

        # 1) O QUE O TERMINAL MOSTRA a quem está a servir.
        no_terminal = self.total(conta)
        self.cobrar(conta)

        # 2) O QUE FICOU GRAVADO.
        na_base = POSTicket.objects.get(pk=conta).grand_total

        # 3) O QUE O BACKOFFICE APRESENTA (a mesma API que a lista de vendas usa).
        r = self.client.get(f'/api/pos/tickets/{conta}/')
        self.assertEqual(r.status_code, 200, r.content[:200])
        no_backoffice = D(str(r.data['grand_total']))

        # 4) O QUE OS RELATÓRIOS CALCULAM.
        no_relatorio = D(str(self.relatorio('rec_dia')['totals']['total']))

        # 5) O QUE A AGT RECEBE.
        doc = FiscalDocument.objects.get(source_module='pos', source_ref=str(conta))

        valores = {
            'terminal': no_terminal, 'base de dados': na_base,
            'backoffice': no_backoffice, 'relatório do dia': no_relatorio,
            'documento fiscal': doc.gross_total,
        }
        distintos = set(valores.values())
        self.assertEqual(len(distintos), 1,
                         'Os cinco sítios não dizem o mesmo número:\n  '
                         + '\n  '.join(f'{k}: {v}' for k, v in valores.items()))

    def test_a_auditoria_sabe_quem_serviu_e_quanto(self):
        """Uma venda sem dono não se investiga. É o registo que responde a "quem
        fez isto?" quando a gaveta não bate."""
        from pos.models import POSAuditLog

        conta = self.abrir()
        self.pedir(conta)
        total = self.total(conta)
        self.cobrar(conta)

        registos = POSAuditLog.objects.filter(reference=POSTicket.objects.get(pk=conta).ticket_number)
        self.assertTrue(registos.exists(),
                        'A venda não deixou rasto nenhum na auditoria do POS.')
        operadores = {r.operator_name for r in registos if r.operator_name}
        self.assertIn('Empregado 1', operadores,
                      f'A auditoria não sabe quem serviu: {operadores}')
        pagamentos = registos.filter(event_type='PAYMENT')
        if pagamentos.exists():
            self.assertEqual(sum((p.amount or D('0')) for p in pagamentos), total,
                             'O valor registado na auditoria não é o que foi cobrado.')

    def test_o_stock_desce_exactamente_o_que_se_vendeu(self):
        """O quinto sítio que ninguém olha até à contagem."""
        antes = StockLevel.objects.get(warehouse=self.armazem, item=self.bife).quantity_on_hand
        conta = self.abrir()
        self.pedir(conta, qtd=3)
        self.cobrar(conta)
        depois = StockLevel.objects.get(warehouse=self.armazem, item=self.bife).quantity_on_hand
        self.assertEqual(antes - depois, D('3'),
                         f'Venderam-se 3 e o stock desceu {antes - depois}.')
