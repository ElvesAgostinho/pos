# -*- coding: utf-8 -*-
"""O CAMINHO TODO, de ponta a ponta — e pela API, não por atalhos.

Estes testes não verificam funções soltas: percorrem o que uma noite de serviço
faz, pela mesma porta que o terminal usa. Abrir caixa, sentar uma mesa, pedir um
prato e uma cerveja, mandar para produção, ver onde cada coisa foi parar,
cobrar, emitir o documento fiscal, imprimir. E, quando o cliente é hóspede,
atravessar para o PMS e cair no folio do quarto certo.

Está tudo num ficheiro de propósito: o valor está em as peças estarem LIGADAS.
Um teste que confirma que `fire_kitchen` marca linhas como FIRED não diz nada
sobre o que o cozinheiro vê; o que importa é que a cerveja apareça no bar e o
bife na cozinha, cada um no seu papel e no seu ecrã.

Regra de leitura: cada teste tem um nome que diz o que a casa espera, e o
`assert` diz porquê quando falha. Um teste que falha e só diz "False is not
True" obriga a reconstruir o raciocínio de novo.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, Printer, UnitOfMeasure
from mdm.models import PaymentMethod
from pos.models import (CashSession, Outlet, OutletPaymentMethod, POSProductConfig,
                        POSTable, POSTicket, PosHardware, PrintJob)


class CasaMontada(APITestCase):
    """A casa pronta a abrir: hotel, restaurante, impressoras, artigos, caixa.

    É o mínimo para servir uma mesa — e é propositadamente o MESMO mínimo que um
    cliente novo tem de configurar. Se um teste precisar aqui de alguma coisa que
    o ecrã de configuração não oferece, isso é uma lacuna do produto, não do teste.
    """

    def setUp(self):
        self.user = User.objects.create_superuser('dono_teste', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST')
        self.mesa = POSTable.objects.create(outlet=self.outlet, table_number='12', seats=4)

        # ── os APARELHOS de impressão, e as impressoras de cada estação ──────
        # Sem aparelho a comanda fica em fila e ninguém a vai buscar: é o caso
        # que o teste `test_estacao_sem_aparelho_avisa_o_empregado` cobre.
        self.maq_cozinha = PosHardware.objects.create(code='HW-COZ', name='Impressora Cozinha')
        self.maq_bar = PosHardware.objects.create(code='HW-BAR', name='Impressora Bar')
        self.prn_cozinha = Printer.objects.create(code='P-COZ', name='Cozinha', station='KITCHEN',
                                                  outlet=self.outlet, device=self.maq_cozinha)
        self.prn_bar = Printer.objects.create(code='P-BAR', name='Bar', station='BAR',
                                              outlet=self.outlet, device=self.maq_bar)

        # ── os ARTIGOS, e onde cada um se prepara ───────────────────────────
        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Restauração')
        self.bife = Item.objects.create(code='A001', name='Bife à Casa', item_type='Manufactured',
                                        category=cat, base_uom=un, sale_price=Decimal('8500.00'),
                                        tax_percentage=Decimal('14.00'))
        self.cerveja = Item.objects.create(code='A002', name='Cerveja Cuca', item_type='Retail',
                                           category=cat, base_uom=un, sale_price=Decimal('1200.00'),
                                           tax_percentage=Decimal('14.00'))
        self.tabaco = Item.objects.create(code='A003', name='Maço de tabaco', item_type='Retail',
                                          category=cat, base_uom=un, sale_price=Decimal('3000.00'),
                                          tax_percentage=Decimal('14.00'))
        # A ficha POS por outlet é quem manda no destino — o artigo só dá o valor
        # por omissão. É assim que o mesmo artigo vai à cozinha num sítio e ao bar
        # noutro (uma tosta no restaurante e no bar da piscina).
        POSProductConfig.objects.create(outlet=self.outlet, item=self.bife, kds_station='KITCHEN')
        POSProductConfig.objects.create(outlet=self.outlet, item=self.cerveja, kds_station='BAR')
        # NONE = não se prepara em lado nenhum: vende-se e pronto. Não pode
        # aparecer em ecrã de produção nenhum nem gerar comanda.
        POSProductConfig.objects.create(outlet=self.outlet, item=self.tabaco, kds_station='NONE')

        # ── os MODOS DE PAGAMENTO autorizados nesta sala ────────────────────
        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True)
        self.quarto = PaymentMethod.objects.create(code='QRT', name='Conta Quarto', method_type='ROOM',
                                                   for_pos=True, charge_to_room=True)
        self.cartao_nao_autorizado = PaymentMethod.objects.create(code='MB', name='Multibanco',
                                                                  method_type='CARD', for_pos=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.dinheiro)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.quarto)
        # O Multibanco NÃO é autorizado aqui de propósito — é o que o teste da
        # regra de autorização usa.

        # ── a casa FISCAL ───────────────────────────────────────────────────
        FiscalConfig.objects.create(company_name='Mwana Lodge, Lda.', company_nif='5000000000',
                                    trade_name='Mwana Lodge')
        ano = timezone.localdate().year
        self.tipo_fr = FiscalDocType.objects.create(code='FR', name='Fatura-Recibo',
                                                    invoice_type='FR')
        self.tipo_ft = FiscalDocType.objects.create(code='FT', name='Fatura', invoice_type='FT')
        self.serie_fr = FiscalSeries.objects.create(code='A', doc_type=self.tipo_fr, year=ano,
                                                    prefix='FR', certified=True)
        self.serie_ft = FiscalSeries.objects.create(code='A', doc_type=self.tipo_ft, year=ano,
                                                    prefix='FT', certified=True)
        # CM — Consulta de Mesa. O talão que o cliente pede antes de pagar também é
        # um documento da AGT (documento de conferência, 4.3 do SAF-T): numerado,
        # assinado e exportado. Não é um papel qualquer.
        self.tipo_cm = FiscalDocType.objects.create(code='CM', name='Consulta de Mesa',
                                                    saft_type='WorkingDocument', invoice_type='CM')
        self.serie_cm = FiscalSeries.objects.create(code='A', doc_type=self.tipo_cm, year=ano,
                                                    prefix='CM', certified=True)

        # ── a CAIXA aberta ──────────────────────────────────────────────────
        self.caixa = CashSession.objects.create(outlet=self.outlet, opening_float=Decimal('10000'),
                                                opened_by='dono_teste', status='OPEN')

    # ── atalhos de leitura, para os testes dizerem o que fazem ──────────────

    def abrir_conta(self, **extra):
        # O TIPO DE CLIENTE pergunta-se ao abrir a conta (parâmetro 8333) e não
        # é opcional: é ele que decide, lá à frente, se o "Conta Quarto" pode
        # aparecer. Por omissão aqui, passante — o caso mais comum numa sala.
        dados = {'outlet': self.outlet.id, 'table': self.mesa.id, 'guest_type': 'PASSANTE',
                 'cash_session': self.caixa.id, 'operator_name': 'Empregado 1'}
        dados.update(extra)
        r = self.client.post('/api/pos/tickets/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data['id']

    def pedir(self, ticket_id, item, qty=1, **extra):
        dados = {'item': item.id, 'quantity': qty}
        dados.update(extra)
        r = self.client.post(f'/api/pos/tickets/{ticket_id}/add_line/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data


class OndeVaoPararOsPedidosTests(CasaMontada):
    """A pergunta do dono: o que vai para a cozinha, onde fica? E o do bar?"""

    def test_cada_pedido_vai_para_a_sua_estacao(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 2)
        self.pedir(conta, self.cerveja, 3)

        r = self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])

        # 1) SÃO DUAS COMANDAS, não uma. Uma só comanda com tudo obrigava a
        #    cozinha a ler os pedidos do bar e vice-versa.
        comandas = {j.job_type: j for j in PrintJob.objects.all()}
        self.assertIn('KITCHEN', comandas, 'O bife não gerou comanda de cozinha.')
        self.assertIn('BAR', comandas, 'A cerveja não gerou comanda de bar.')
        self.assertEqual(len(comandas), 2, f'Esperava 2 comandas, uma por estação; vieram {len(comandas)}.')

        # 2) CADA UMA LEVA SÓ O QUE É DELA.
        coz, bar = comandas['KITCHEN'], comandas['BAR']
        self.assertIn('Bife à Casa', coz.content)
        self.assertNotIn('Cerveja', coz.content, 'A cozinha recebeu o pedido do bar.')
        self.assertIn('Cerveja Cuca', bar.content)
        self.assertNotIn('Bife', bar.content, 'O bar recebeu o pedido da cozinha.')

        # 3) CADA UMA SAI NO APARELHO DA SUA ESTAÇÃO.
        self.assertEqual(coz.target, self.maq_cozinha.name)
        self.assertEqual(bar.target, self.maq_bar.name)

        # 4) AS QUANTIDADES VÃO LÁ — uma comanda sem quantidade não serve.
        self.assertIn('2x', coz.content)
        self.assertIn('3x', bar.content)

        # 5) A COMANDA DIZ DE QUE MESA É. Sem isto o empregado não sabe onde
        #    entregar o que a cozinha lhe passa.
        self.assertIn('12', coz.title, 'A comanda não identifica a mesa.')

    def test_o_que_nao_se_prepara_nao_vai_a_producao(self):
        """Um maço de tabaco vende-se; não passa pela cozinha nem pelo bar."""
        conta = self.abrir_conta()
        self.pedir(conta, self.tabaco, 1)
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        self.assertEqual(PrintJob.objects.count(), 0,
                         'Um artigo sem produção gerou comanda — ia aparecer num ecrã de cozinha.')

    def test_o_cozinheiro_ve_o_que_e_dele_e_so_isso(self):
        """O ecrã da cozinha (KDS) filtra por estação — é o mesmo ecrã, filtrado."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.pedir(conta, self.cerveja, 1)
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')

        na_cozinha = self.client.get('/api/pos/kds/?station=KITCHEN').data
        no_bar = self.client.get('/api/pos/kds/?station=BAR').data
        nomes_cozinha = [l['description'] for l in na_cozinha]
        nomes_bar = [l['description'] for l in no_bar]

        self.assertEqual(nomes_cozinha, ['Bife à Casa'], f'O ecrã da cozinha mostra {nomes_cozinha}.')
        self.assertEqual(nomes_bar, ['Cerveja Cuca'], f'O ecrã do bar mostra {nomes_bar}.')

    def test_o_pedido_percorre_os_estados_ate_ser_entregue(self):
        """Enviado → a preparar → pronto → entregue. É o que o passe acompanha."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')

        linha = self.client.get('/api/pos/kds/?station=KITCHEN').data[0]
        estados = []
        for _ in range(3):
            r = self.client.post(f"/api/pos/kds/{linha['id']}/advance/", {}, format='json')
            self.assertEqual(r.status_code, 200, r.content[:300])
            estados.append(r.data.get('kds_status'))
        self.assertEqual(estados, ['PREPARING', 'READY', 'SERVED'],
                         f'O pedido percorreu {estados} em vez de a preparar → pronto → entregue.')

    def test_duplo_envio_nao_duplica_a_comanda(self):
        """Duplo toque, ou o ecrã a reenviar por não ter tido resposta.

        Sem a tranca, as duas chamadas liam as mesmas linhas por enviar e a cozinha
        fazia o prato duas vezes.
        """
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        self.assertEqual(PrintJob.objects.filter(job_type='KITCHEN').count(), 1,
                         'O segundo envio imprimiu a comanda outra vez — prato feito a dobrar.')

    def test_estacao_sem_aparelho_avisa_o_empregado(self):
        """A impressora existe na configuração mas não tem máquina atrás.

        A comanda fica em fila e NINGUÉM a vai buscar: o pedido nunca chega à
        cozinha. Mais vale o empregado saber enquanto está à mesa.
        """
        self.prn_cozinha.device = None
        self.prn_cozinha.save(update_fields=['device'])

        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')

        avisos = r.data.get('print_warnings') or []
        self.assertTrue(avisos, 'A comanda não foi impressa e o empregado não foi avisado.')
        self.assertIn('KITCHEN', ' '.join(avisos))
        job = PrintJob.objects.get(job_type='KITCHEN')
        self.assertEqual(job.status, 'FAILED')
        self.assertTrue(job.error, 'A comanda falhou sem dizer porquê.')

    def test_anulacao_depois_de_enviado_volta_a_estacao(self):
        """Anular um prato já na cozinha tem de LÁ CHEGAR — senão continua a fazer-se."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.bife, 1)['lines'][0]['id']
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')

        r = self.client.delete(f'/api/pos/ticket-lines/{linha_id}/?reason=Cliente desistiu')
        self.assertIn(r.status_code, (200, 204), r.content[:400])
        na_cozinha = self.client.get('/api/pos/kds/?station=KITCHEN').data
        self.assertTrue(any(l['kds_status'] == 'CANCELLED' for l in na_cozinha),
                        'A anulação não apareceu no ecrã da cozinha — o prato continuava a fazer-se.')


class CobrancaEDocumentoTests(CasaMontada):
    """Do pagamento ao papel: as regras que protegem a caixa e a AGT."""

    def test_caminho_completo_pedido_pagamento_fatura(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.pedir(conta, self.cerveja, 2)
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')

        t = self.client.get(f'/api/pos/tickets/{conta}/').data
        total = Decimal(t['grand_total'])
        self.assertEqual(total, Decimal('10900.00'),
                         f'8500 + 2×1200 = 10900; a conta diz {total}.')

        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.dinheiro.id, 'amount': str(total)},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'PAID')

        # COBRAR JÁ EMITE O DOCUMENTO. O empregado não tem um segundo botão a
        # dizer "agora fatura": ao balcão, o papel sai com o troco. Sem isto
        # havia vendas cobradas e por faturar à espera de alguém se lembrar.
        from fiscal.models import FiscalDocument
        doc = FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta)).first()
        self.assertIsNotNone(doc, 'A conta foi cobrada e não saiu documento fiscal nenhum.')
        self.assertTrue(doc.invoice_no, 'O documento saiu sem número.')
        self.assertEqual(doc.gross_total, total,
                         'O documento fiscal não declara o mesmo que entrou na caixa.')
        # Assinado e encadeado: é o que o torna um documento e não um talão.
        self.assertTrue(doc.doc_hash and doc.doc_hash != '0', 'O documento saiu sem assinatura.')

        # E foi para a fila de impressão — a fatura imprime-se sozinha.
        self.assertTrue(PrintJob.objects.filter(job_type__in=('INVOICE', 'RECEIPT')).exists(),
                        'O documento foi emitido mas nunca foi mandado imprimir.')

        # Pedir a fatura outra vez devolve A MESMA, não uma segunda.
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FR'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['invoice_no'], doc.invoice_no)

    def test_a_mesma_venda_nunca_da_dois_documentos(self):
        """Carregar duas vezes em "Faturar" não pode duplicar receita na AGT."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.client.post(f'/api/pos/tickets/{conta}/pay/',
                         {'payment_method': self.dinheiro.id, 'amount': '8500.00'}, format='json')

        a = self.client.post(f'/api/pos/tickets/{conta}/issue_document/', {'doc_type': 'FR'}, format='json')
        b = self.client.post(f'/api/pos/tickets/{conta}/issue_document/', {'doc_type': 'FR'}, format='json')
        self.assertEqual(a.data['invoice_no'], b.data['invoice_no'],
                         'A segunda emissão criou um documento fiscal novo da mesma venda.')
        self.assertTrue(b.data.get('reissued'))

    def test_fatura_recibo_exige_que_o_dinheiro_tenha_entrado(self):
        """Uma FR diz à AGT que se recebeu. Emiti-la por cobrar é declarar falso."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/', {'doc_type': 'FR'}, format='json')
        self.assertEqual(r.status_code, 400, 'Emitiu fatura-recibo de uma conta por cobrar.')
        self.assertTrue(r.data.get('requires_payment'))

    def test_fatura_a_credito_emite_se_sem_pagamento(self):
        """Quem vai pagar depois leva FT, não FR. É a saída que o erro acima indica."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/', {'doc_type': 'FT'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(r.data['doc_type'], 'FT')

    def test_conta_vazia_nao_se_fatura(self):
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/', {'doc_type': 'FT'}, format='json')
        self.assertEqual(r.status_code, 400, 'Emitiu um documento fiscal sem uma única linha.')

    def test_modo_de_pagamento_nao_autorizado_na_sala_e_recusado(self):
        """O Multibanco existe no sistema mas não foi autorizado neste outlet."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.cartao_nao_autorizado.id, 'amount': '8500.00'},
                             format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])

    def test_caixa_fechada_nao_recebe_dinheiro(self):
        """Uma venda numa sessão já fechada existe no sistema e não existe no cofre."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.caixa.status = 'CLOSED'
        self.caixa.save(update_fields=['status'])
        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.dinheiro.id, 'amount': '8500.00'}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('cash_session_closed'))

    def test_talao_de_conferencia_nao_fecha_a_conta(self):
        """A "consulta de mesa" é o papel que o cliente pede antes de pagar."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/consult/', {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'OPEN',
                         'O talão de conferência fechou a conta.')


class PosFalaComOPmsTests(CasaMontada):
    """A travessia: o consumo feito na sala tem de cair no quarto certo."""

    def _hospede_instalado(self):
        """Uma reserva com check-in feito e folio aberto — o estado normal à noite."""
        from datetime import timedelta

        from mdm.models import Customer
        from pms.models import Folio, Reservation, Room, RoomType

        # O hóspede é uma ENTIDADE do cadastro mestre (mdm.Customer), a mesma a
        # quem se emite a fatura — o PMS não tem um cadastro de pessoas à parte.
        tipo = RoomType.objects.create(hotel=self.hotel, code='STD', name='Standard',
                                       base_rate=Decimal('25000'))
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number='101')
        hospede = Customer.objects.create(code='C001', name='Ana Silva')
        hoje = timezone.localdate()
        reserva = Reservation.objects.create(
            hotel=self.hotel, confirmation='RES0001', guest=hospede, room=quarto, room_type=tipo,
            check_in=hoje, check_out=hoje + timedelta(days=2),
            status='CHECKED_IN', adults=1)
        folio = Folio.objects.create(reservation=reserva, number='F0001', status='OPEN')
        return quarto, folio

    def test_consumo_do_hospede_cai_no_folio_do_quarto(self):
        quarto, folio = self._hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)

        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.quarto.id, 'amount': '8500.00',
                              'room': quarto.number}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])

        encargos = list(folio.charges.all())
        self.assertEqual(len(encargos), 1,
                         'O consumo não chegou ao folio — o hóspede saía sem o pagar.')
        self.assertEqual(encargos[0].amount, Decimal('8500.00'))
        self.assertEqual(encargos[0].charge_type, 'FNB')

    def test_a_noite_toda_do_jantar_ao_check_out(self):
        """A TRAVESSIA COMPLETA — a pergunta a que todo o resto serve.

        O hóspede janta no restaurante e manda para o quarto. No dia seguinte faz
        check-out. O jantar TEM de aparecer na fatura que ele leva: é aqui que os
        dois módulos ou se ligam, ou o hotel perde dinheiro em silêncio — a
        refeição fica no folio, o folio fecha, e ninguém a cobra.
        """
        from fiscal.models import TaxRate
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        quarto, folio = self._hospede_instalado()

        # ── à noite, no restaurante ──────────────────────────────────────────
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        self.pedir(conta, self.cerveja, 2)
        self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        total_jantar = Decimal(self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total'])

        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.quarto.id, 'amount': str(total_jantar),
                              'room': quarto.number}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])

        # ── de manhã, na recepção ────────────────────────────────────────────
        encargos = folio.charges.filter(is_void=False)
        self.assertEqual(sum(c.amount for c in encargos), total_jantar,
                         'A conta do restaurante não chegou inteira ao quarto.')

        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        r = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        self.assertTrue(r.data.get('invoice_number'), 'A fatura do hóspede saiu sem número.')
        self.assertEqual(Decimal(str(r.data['total'])), total_jantar,
                         f"A fatura do check-out não inclui o jantar ({total_jantar}).")

        r = self.client.post(f'/api/pms/reservations/{folio.reservation_id}/check_out/',
                             {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        folio.refresh_from_db()
        self.assertEqual(folio.status, 'CLOSED')

    def test_passante_nao_pode_lancar_no_quarto(self):
        """Um passante não tem quarto onde a conta caia.

        Deixá-lo "pagar no quarto" criava dívida num quarto que não existe, e a
        auditoria da noite nunca mais fechava.
        """
        self._hospede_instalado()
        conta = self.abrir_conta(guest_type='PASSANTE')
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.quarto.id, 'amount': '8500.00',
                              'room': '101'}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])

    def test_quarto_sem_folio_aberto_recusa_e_explica(self):
        """Quarto vazio, ou hóspede que já fez check-out: não há onde lançar."""
        from pms.models import Room, RoomType
        tipo = RoomType.objects.create(hotel=self.hotel, code='STD2', name='Standard',
                                       base_rate=Decimal('25000'))
        Room.objects.create(hotel=self.hotel, room_type=tipo, number='202')

        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.quarto.id, 'amount': '8500.00',
                              'room': '202'}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertIn('folio', str(r.data).lower(),
                      'Recusou sem dizer que o problema é não haver conta aberta nesse quarto.')

    def test_conta_quarto_sem_indicar_quarto_pergunta_qual(self):
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.quarto.id, 'amount': '8500.00'}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
