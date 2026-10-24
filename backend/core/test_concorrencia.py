# -*- coding: utf-8 -*-
"""DUAS PESSOAS A FAZER A MESMA COISA AO MESMO TEMPO.

Um grupo hoteleiro nunca tem uma pessoa a trabalhar. Tem a recepção e o
restaurante, dois terminais na mesma sala, o economato e o chefe, o motor de
reservas do site e o rececionista ao telefone. Tudo o que está aqui já aconteceu
ou pode acontecer num serviço normal — ninguém precisa de ter má intenção, basta
o ecrã demorar meio segundo e o empregado carregar outra vez.

PORQUE É QUE ESTE FICHEIRO É DIFERENTE DOS OUTROS

1. `TransactionTestCase` e não `TestCase`. O `TestCase` envolve cada teste numa
   transação que nunca é confirmada: as threads, que têm as suas próprias
   ligações, NÃO VEEM NADA do que o teste montou — e um teste de corrida que não
   vê os dados não testa corrida nenhuma, passa sempre.

2. Threads a sério (`threading.Thread`), cada uma com a SUA ligação à base de
   dados (`connection.close()` à entrada e à saída). Duas chamadas seguidas na
   mesma ligação são duas chamadas seguidas — não há corrida nenhuma nisso.

3. O que se verifica é SEMPRE o estado final dos dados: quantos documentos,
   quanto dinheiro, quantos lançamentos. Nunca o código HTTP — um 400 ou um 409
   é uma defesa a funcionar, e um 200 nos dois pode ser um 200 com duas facturas
   emitidas. O dinheiro está nos dados.

O QUE O SQLITE NÃO CONSEGUE MOSTRAR, E COMO SE PROVA AQUI

Em desenvolvimento a base é SQLite, e o SQLite só deixa UM escritor de cada vez
(aqui com `transaction_mode=IMMEDIATE`, ver erp_server/settings.py: a transação
pede a tranca de escrita logo ao começar). Resultado: duas transações nunca
correm de facto ao mesmo tempo — a segunda espera pela primeira. Isso ESCONDE
precisamente o defeito que se quer provar, porque faz com que até o código mal
protegido pareça seguro. E o `select_for_update()`, que é a defesa certa em
PostgreSQL, no SQLite é ignorado em silêncio: não tranca linha nenhuma.

A única defesa que se comporta IGUAL nos dois motores é uma CONSTRAINT da base
de dados. Por isso, onde a corrida custa dinheiro, cada teste aqui verifica duas
coisas:

  · com DUAS THREADS, que o estado final está certo (o que se consegue
    reproduzir, reproduz-se);
  · e que a CONSTRAINT existe e MORDE — uma segunda escrita directa dos mesmos
    dados levanta `IntegrityError`. É isso que prova o que protege a casa em
    PostgreSQL, onde as duas transações correm a sério em paralelo.

Correr:
  python manage.py test core.test_concorrencia
"""
import ast
import threading
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.contrib.auth.models import User
from django.db import IntegrityError, connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from fiscal.models import FiscalConfig, FiscalDocType, FiscalDocument, FiscalSeries
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, StockLevel, StockMovement, UnitOfMeasure, Warehouse
from mdm.models import Customer, PaymentMethod
from pms.models import Folio, FolioCharge, NightAuditRun, Reservation, Room, RoomType
from pos.models import (CashSession, Outlet, OutletPaymentMethod, POSProductConfig, POSTable,
                        POSTicket, POSTicketPayment, StockDoc, StockDocLine, StockDocSeries)


# ──────────────────────────────────────────────────────────────────────────────
# O ANDAIME: duas threads, duas ligações, uma só vez
# ──────────────────────────────────────────────────────────────────────────────
class DoisAoMesmoTempo(TransactionTestCase):
    """A casa montada e aberta, e a maneira de pôr dois a trabalhar nela."""

    # Sem isto, o flush entre testes não repõe os dados de referência que as
    # migrações criam (tipos de documento, parâmetros) e o teste seguinte corre
    # numa casa meio desmontada.
    # `serialized_rollback` NÃO: parecia o caminho certo (o TransactionTestCase
    # esvazia as tabelas no fim de cada teste, e esta opção repõe o que as
    # migrações tinham semeado) mas o que ela repõe inclui os `content_type` do
    # Django, que já lá estão — e a reposição rebentava no setUpClass com
    # "UNIQUE constraint failed: django_content_type". Estes testes montam o que
    # precisam no setUp, por isso não têm nada para repor.

    def so_a_base_travou(self, resultados):
        """As falhas são TODAS da base a serializar escritores?

        Em SQLite acontece: a base só deixa um escritor de cada vez e recusa os
        outros com "database table is locked". Quando NENHUMA das threads chega a
        passar, não há corrida nenhuma para medir — e um teste que falhe aí está
        a dizer uma coisa falsa sobre o produto. Nesse caso salta-se, com a razão
        escrita, e a defesa fica provada pelo teste da constraint ao lado (essa
        vale igual nas duas bases).
        """
        erros = [str(r[1]) for r in resultados if r[0] == 'erro']
        return bool(erros) and all('locked' in e or 'is locked' in e for e in erros)

    def ao_mesmo_tempo(self, tarefa, quantos=2):
        """Corre `tarefa(i)` em `quantos` threads e devolve o que cada uma viu.

        A BARREIRA é o que torna isto uma corrida: sem ela, a primeira thread
        tem tempo de acabar antes de a segunda arrancar — é o que acontece numa
        máquina rápida — e o teste passa sem nunca ter posto dois em cima do
        mesmo registo. Com a barreira, nenhuma avança até estarem todas prontas.

        Cada thread fecha a ligação à entrada (para abrir a SUA) e à saída (para
        não deixar ligações penduradas que fazem o `flush` do fim do teste ficar
        à espera de uma tranca que ninguém largou).
        """
        portao = threading.Barrier(quantos)
        resultados = [None] * quantos

        def correr(i):
            connection.close()
            try:
                portao.wait(timeout=20)
                resultados[i] = ('ok', tarefa(i))
            except Exception as e:                 # noqa — o erro É o resultado
                resultados[i] = ('erro', e)
            finally:
                connection.close()

        fios = [threading.Thread(target=correr, args=(i,)) for i in range(quantos)]
        for f in fios:
            f.start()
        for f in fios:
            f.join(timeout=60)
        return resultados

    def cliente(self):
        """Um cliente de API novo — um por thread, como dois terminais."""
        c = APIClient()
        c.force_authenticate(self.user)
        return c

    # ── a casa ───────────────────────────────────────────────────────────────
    def setUp(self):
        self.user = User.objects.create_superuser('dono_teste', '', 'x')
        self.client = self.cliente()

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST')
        self.mesa = POSTable.objects.create(outlet=self.outlet, table_number='12', seats=4)

        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Restauração')
        self.bife = Item.objects.create(code='A001', name='Bife à Casa', item_type='Retail',
                                        category=cat, base_uom=un, sale_price=Decimal('10000.00'),
                                        tax_percentage=Decimal('14.00'))
        POSProductConfig.objects.create(outlet=self.outlet, item=self.bife, kds_station='NONE')

        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True)
        self.conta_quarto = PaymentMethod.objects.create(code='QRT', name='Conta Quarto',
                                                         method_type='ROOM', for_pos=True,
                                                         charge_to_room=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.dinheiro)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.conta_quarto)

        FiscalConfig.objects.create(company_name='Mwana Lodge, Lda.', company_nif='5000000000',
                                    trade_name='Mwana Lodge')
        ano = timezone.localdate().year
        self.tipo_fr = FiscalDocType.objects.create(code='FR', name='Fatura-Recibo',
                                                    invoice_type='FR')
        self.serie_fr = FiscalSeries.objects.create(code='A', doc_type=self.tipo_fr, year=ano,
                                                    prefix='FR', certified=True)

        self.caixa = CashSession.objects.create(outlet=self.outlet, opening_float=Decimal('10000'),
                                                opened_by='dono_teste', operator_name='Empregado 1',
                                                status='OPEN')

    # ── atalhos ──────────────────────────────────────────────────────────────
    def conta_com_um_bife(self):
        """Uma conta aberta com um bife de 10.000 Kz (+IVA já incluído no preço)."""
        r = self.client.post('/api/pos/tickets/', {
            'outlet': self.outlet.id, 'table': self.mesa.id, 'guest_type': 'PASSANTE',
            'cash_session': self.caixa.id, 'operator_name': 'Empregado 1'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:300])
        tid = r.data['id']
        r = self.client.post(f'/api/pos/tickets/{tid}/add_line/',
                             {'item': self.bife.id, 'quantity': 1}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:300])
        return POSTicket.objects.get(pk=tid)

    def hospede_instalado(self, numero='101', confirmacao='RES0001'):
        tipo = (RoomType.objects.filter(hotel=self.hotel, code='STD').first()
                or RoomType.objects.create(hotel=self.hotel, code='STD', name='Standard',
                                           base_rate=Decimal('25000')))
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number=numero)
        hospede = Customer.objects.create(code='C' + numero, name='Ana Silva ' + numero)
        hoje = timezone.localdate()
        reserva = Reservation.objects.create(
            hotel=self.hotel, confirmation=confirmacao, guest=hospede, room=quarto,
            room_type=tipo, check_in=hoje, check_out=hoje + timedelta(days=3),
            status='CHECKED_IN', adults=1, rate=Decimal('25000'))
        folio = Folio.objects.create(reservation=reserva,
                                     number='FOL-' + numero, status='OPEN')
        return quarto, folio, reserva


# ──────────────────────────────────────────────────────────────────────────────
# 1. DOIS PAGAMENTOS DA MESMA CONTA
# ──────────────────────────────────────────────────────────────────────────────
class DoisPagamentosDaMesmaContaTests(DoisAoMesmoTempo):

    def test_duas_cobrancas_ao_mesmo_tempo_cobram_a_conta_uma_so_vez(self):
        """O cliente não pode pagar o jantar duas vezes.

        Dois terminais na mesma sala, a mesma conta aberta nos dois (ou o mesmo
        empregado a carregar duas vezes porque o ecrã demorou). Sem tranca, os
        dois leem "falta pagar 10.000" e os dois cobram 10.000: o cliente paga
        20.000, a caixa fecha com uma sobra que ninguém explica, e o troco que o
        empregado devolveu saiu do bolso da casa.

        O que se verifica é o DINHEIRO: a soma dos pagamentos da conta tem de
        ser exactamente o que a conta vale.
        """
        conta = self.conta_com_um_bife()
        total = conta.grand_total

        def cobrar(_i):
            c = self.cliente()
            r = c.post(f'/api/pos/tickets/{conta.id}/pay/',
                       {'payment_method': self.dinheiro.id, 'amount': str(total)}, format='json')
            return r.status_code

        self.ao_mesmo_tempo(cobrar)

        pagamentos = POSTicketPayment.objects.filter(ticket=conta)
        recebido = sum((p.amount for p in pagamentos), Decimal('0'))
        self.assertEqual(recebido, total,
                         'A conta de %s Kz recebeu %s Kz em %s pagamento(s) — duas cobranças '
                         'ao mesmo tempo passaram as duas.' % (total, recebido, pagamentos.count()))
        self.assertEqual(pagamentos.count(), 1,
                         'Ficaram %s pagamentos na mesma conta.' % pagamentos.count())
        self.assertEqual(POSTicket.objects.get(pk=conta.id).status, 'PAID')

    def test_duas_cobrancas_nao_emitem_dois_documentos_fiscais(self):
        """A MESMA venda declarada duas vezes à AGT é IVA pago a dobrar.

        A cobrança emite o documento fiscal. Se as duas cobranças passassem,
        saíam duas facturas reais, numeradas e assinadas, da mesma venda — e
        corrigir isso exige uma nota de crédito que alguém tem primeiro de
        descobrir que é preciso.
        """
        conta = self.conta_com_um_bife()
        total = conta.grand_total

        def cobrar(_i):
            c = self.cliente()
            return c.post(f'/api/pos/tickets/{conta.id}/pay/',
                          {'payment_method': self.dinheiro.id, 'amount': str(total)},
                          format='json').status_code

        self.ao_mesmo_tempo(cobrar)

        docs = FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta.id))
        self.assertEqual(docs.count(), 1,
                         'Saíram %s documentos fiscais da MESMA venda: %s'
                         % (docs.count(), [d.invoice_no for d in docs]))


# ──────────────────────────────────────────────────────────────────────────────
# 2. DOIS DOCUMENTOS FISCAIS PARA A MESMA ORIGEM
# ──────────────────────────────────────────────────────────────────────────────
class UmDocumentoFiscalPorOrigemTests(DoisAoMesmoTempo):

    def test_duas_emissoes_em_paralelo_da_mesma_venda_dao_o_mesmo_documento(self):
        """Chama-se o motor fiscal DIRECTAMENTE, duas vezes ao mesmo tempo.

        Pelo botão de cobrar, a tranca do ticket já serializa as duas chamadas.
        Aqui entra-se pela porta de baixo (`emit_for_pos_ticket`), que é por onde
        entram a fila de reemissão, a sincronização do offline e o botão manual
        de "Emitir documento" — caminhos que não trancam o ticket nenhum.

        A idempotência estava só em código (`existing_for`): duas chamadas em
        paralelo passam ambas pelo `if` antes de qualquer uma gravar. Agora a
        constraint `fis_um_documento_por_origem` não deixa, e quem perde o empate
        recebe o documento do outro — que é o que ele queria.
        """
        from fiscal.integration import emit_for_pos_ticket

        conta = self.conta_com_um_bife()
        conta.status = 'PAID'
        conta.save(update_fields=['status'])

        def emitir(_i):
            t = POSTicket.objects.get(pk=conta.id)
            with transaction.atomic():
                doc = emit_for_pos_ticket(t, user='dono_teste')
            return doc.invoice_no if doc else None

        resultados = self.ao_mesmo_tempo(emitir)

        docs = FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta.id))
        self.assertEqual(docs.count(), 1,
                         'A mesma venda ficou com %s facturas: %s'
                         % (docs.count(), [d.invoice_no for d in docs]))
        emitidos = {r[1] for r in resultados if r[0] == 'ok'}
        self.assertEqual(len(emitidos), 1,
                         'As duas emissões devolveram documentos diferentes (%s) — quem perde '
                         'o empate tem de levar o documento do outro, não um novo.' % emitidos)

    def test_a_base_de_dados_recusa_um_segundo_documento_para_a_mesma_venda(self):
        """A prova que vale em PostgreSQL.

        O SQLite não deixa as duas transações correrem a sério ao mesmo tempo, por
        isso a corrida de cima não se consegue reproduzir aqui com as duas a
        passarem. O que SE PODE provar é a defesa: uma segunda gravação com a
        mesma origem é recusada pela base de dados. Uma constraint comporta-se
        igual nos dois motores — logo, o que recusa aqui recusa lá.
        """
        from fiscal import services

        doc = services.issue_document(
            self.serie_fr.id, customer_name='Consumidor Final',
            lines=[{'description': 'Jantar', 'quantity': 1, 'unit_price': Decimal('10000'),
                    'tax_percentage': Decimal('14')}],
            source_module='pos', source_ref='9999')

        with self.assertRaises(IntegrityError, msg='A base de dados aceitou uma SEGUNDA factura '
                                                   'para a mesma venda — é a mesma receita '
                                                   'declarada duas vezes à AGT.'):
            FiscalDocument.objects.create(
                series=doc.series, doc_type=doc.doc_type, number=doc.number + 1,
                invoice_no='FR A/9998', doc_date=doc.doc_date,
                system_entry_date=doc.system_entry_date, doc_hash='x',
                gross_total=doc.gross_total, source_module='pos', source_ref='9999')

    def test_um_documento_anulado_deixa_a_venda_voltar_a_ser_facturada(self):
        """A constraint não pode fechar a porta a uma correcção legítima.

        Anular uma factura (ou regularizá-la por nota de crédito) é o caminho
        legal para corrigir um erro. Se o índice contasse os anulados, a venda
        corrigida ficava impossível de facturar outra vez — sem documento, para
        sempre. O índice ignora `status='A'` e `credited`, exactamente como o
        `existing_for` que ele reforça.
        """
        from fiscal import services

        doc = services.issue_document(
            self.serie_fr.id, customer_name='Consumidor Final',
            lines=[{'description': 'Jantar', 'quantity': 1, 'unit_price': Decimal('10000'),
                    'tax_percentage': Decimal('14')}],
            source_module='pos', source_ref='7777')
        services.void_document(doc.id, reason='erro do empregado')

        novo = services.issue_document(
            self.serie_fr.id, customer_name='Consumidor Final',
            lines=[{'description': 'Jantar', 'quantity': 1, 'unit_price': Decimal('10000'),
                    'tax_percentage': Decimal('14')}],
            source_module='pos', source_ref='7777')
        self.assertNotEqual(novo.id, doc.id)
        self.assertEqual(FiscalDocument.objects.filter(source_module='pos', source_ref='7777',
                                                       status='N').count(), 1)


# ──────────────────────────────────────────────────────────────────────────────
# 3. O MESMO CONSUMO DUAS VEZES NO FOLIO DO HÓSPEDE
# ──────────────────────────────────────────────────────────────────────────────
class ConsumoNoFolioTests(DoisAoMesmoTempo):

    def test_dois_lancamentos_em_quarto_ao_mesmo_tempo_lancam_uma_so_vez(self):
        """O hóspede não pode pagar o jantar duas vezes no check-out.

        Dois toques em "Lançar no Quarto" — ou este botão e o `pay()` com o meio
        "Conta Quarto" — lançavam o MESMO consumo duas vezes no folio. As duas
        linhas são legítimas vistas uma a uma: ninguém dá por nada até o hóspede
        reclamar na recepção, e aí já não há como saber qual é a verdadeira.

        Verifica-se o SALDO DA CONTA, que é o que ele vai pagar.
        """
        _quarto, folio, _res = self.hospede_instalado()
        conta = self.conta_com_um_bife()
        total = conta.grand_total

        def lancar(_i):
            c = self.cliente()
            return c.post(f'/api/pos/tickets/{conta.id}/charge_to_room/',
                          {'room': '101'}, format='json').status_code

        self.ao_mesmo_tempo(lancar)

        encargos = FolioCharge.objects.filter(source_reference=conta.ticket_number, is_void=False)
        somado = sum((e.amount for e in encargos), Decimal('0'))
        self.assertEqual(somado, total,
                         'A conta de %s Kz entrou no folio por %s Kz em %s lançamento(s) — o '
                         'hóspede ia pagar o mesmo jantar mais de uma vez.'
                         % (total, somado, encargos.count()))
        self.assertEqual(Folio.objects.get(pk=folio.pk).balance, total)


# ──────────────────────────────────────────────────────────────────────────────
# 4. DOIS CHECK-INS / DUAS RESERVAS NO MESMO QUARTO
# ──────────────────────────────────────────────────────────────────────────────
class CheckInEOverbookingTests(DoisAoMesmoTempo):

    def _reserva_por_instalar(self, numero='201', confirmacao='RES-IN-1'):
        tipo = RoomType.objects.create(hotel=self.hotel, code='SUI' + numero, name='Suite',
                                       base_rate=Decimal('30000'))
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number=numero)
        hospede = Customer.objects.create(code='CH' + numero, name='João Chegada')
        hoje = timezone.localdate()
        res = Reservation.objects.create(
            hotel=self.hotel, confirmation=confirmacao, guest=hospede, room=quarto,
            room_type=tipo, check_in=hoje, check_out=hoje + timedelta(days=2),
            status='BOOKED', adults=1, rate=Decimal('30000'))
        return res, quarto, tipo

    def test_dois_check_ins_da_mesma_reserva_abrem_uma_so_conta(self):
        """Duas contas na mesma reserva é alojamento dado de graça.

        `Reservation.folio` devolve a primeira conta que encontra: com duas, o
        POS lança o jantar numa e a Auditoria da Noite lança a diária na outra.
        O check-out factura a que vê — e o resto fica numa conta que ninguém
        volta a abrir.

        O estado da reserva lia-se FORA da transação e só o quarto era trancado:
        num check-in sem quarto novo (o quarto foi atribuído na véspera, que é o
        caso normal) não havia tranca nenhuma.
        """
        res, _quarto, _tipo = self._reserva_por_instalar()

        def instalar(_i):
            c = self.cliente()
            return c.post(f'/api/pms/reservations/{res.id}/check_in/', {}, format='json').status_code

        self.ao_mesmo_tempo(instalar)

        folios = Folio.objects.filter(reservation=res)
        self.assertEqual(folios.count(), 1,
                         'A reserva ficou com %s contas abertas — metade dos consumos cai numa '
                         'e metade na outra.' % folios.count())
        diarias = FolioCharge.objects.filter(folio__reservation=res, charge_type='ROOM',
                                             is_void=False)
        self.assertEqual(diarias.count(), 1,
                         'A primeira diária foi lançada %s vezes.' % diarias.count())

    def test_a_base_de_dados_recusa_uma_segunda_conta_principal(self):
        """A prova que vale em PostgreSQL (ver a nota do documento fiscal)."""
        _q, folio, res = self.hospede_instalado(numero='301', confirmacao='RES-301')
        self.assertTrue(folio.is_primary)
        with self.assertRaises(IntegrityError, msg='A base aceitou uma segunda conta PRINCIPAL '
                                                   'na mesma reserva.'):
            Folio.objects.create(reservation=res, number='FOL-301-B', is_primary=True)

    def test_duas_reservas_nao_ficam_com_o_mesmo_quarto_nas_mesmas_noites(self):
        """Overbooking: dois hóspedes no átrio, um quarto.

        O anti-overbooking era uma pergunta à base de dados sem nada entre a
        pergunta e a gravação: a recepção e o motor de reservas online liam ambos
        "o quarto está livre" e gravavam ambos. Custa um quarto noutro hotel,
        pago pela casa, e o cliente não volta.

        Não há constraint que cubra intervalos que se sobrepõem em SQLite (isso
        exige uma EXCLUDE constraint com btree_gist, só PostgreSQL) — a defesa é
        trancar a linha do quarto antes de perguntar, dentro da transação que
        grava.
        """
        tipo = RoomType.objects.create(hotel=self.hotel, code='DUP', name='Duplo',
                                       base_rate=Decimal('20000'))
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number='401')
        hoje = timezone.localdate()
        hospedes = [Customer.objects.create(code='CR%s' % i, name='Hóspede %s' % i).id
                    for i in range(2)]

        def reservar(i):
            c = self.cliente()
            r = c.post('/api/pms/reservations/', {
                'hotel': self.hotel.id, 'guest': hospedes[i], 'room_type': tipo.id,
                'room': quarto.id, 'check_in': str(hoje + timedelta(days=5)),
                'check_out': str(hoje + timedelta(days=7)), 'adults': 1}, format='json')
            return r.status_code

        self.ao_mesmo_tempo(reservar)

        vivas = Reservation.objects.filter(room=quarto,
                                           status__in=['OPTION', 'BOOKED', 'CHECKED_IN'],
                                           check_in__lt=hoje + timedelta(days=7),
                                           check_out__gt=hoje + timedelta(days=5))
        self.assertEqual(vivas.count(), 1,
                         'O quarto 401 ficou com %s reservas vivas nas mesmas noites '
                         '(overbooking).' % vivas.count())

    def test_a_base_de_dados_recusa_dois_codigos_de_confirmacao_iguais(self):
        """A prova que vale em PostgreSQL — e que se corre em qualquer base.

        Uma corrida que o SQLite não deixa reproduzir não deixa de ter de estar
        fechada. Uma constraint de unicidade comporta-se IGUAL nas duas bases: é
        ela, e não o código Python, que garante que dois pedidos em paralelo
        nunca gravam o mesmo código de confirmação.
        """
        tipo = RoomType.objects.filter(hotel=self.hotel).first() or RoomType.objects.create(
            hotel=self.hotel, code='STDX', name='Standard', base_rate=Decimal('25000'))
        hospede = Customer.objects.create(code='CONF1', name='Hóspede do Teste')
        comum = dict(hotel=self.hotel, room_type=tipo, guest=hospede,
                     check_in=timezone.localdate(),
                     check_out=timezone.localdate() + timedelta(days=1), adults=1)
        Reservation.objects.create(confirmation='RES-IGUAL', **comum)
        # O `atomic` é obrigatório: uma IntegrityError apanhada FORA de uma
        # transação deixa a ligação marcada como inutilizável e tudo o que venha
        # a seguir no teste rebenta com "An error occurred in the current
        # transaction" — o erro verdadeiro desaparece atrás desse.
        with self.assertRaises(IntegrityError,
                               msg='A base aceitou duas reservas com o MESMO código de '
                                   'confirmação: a recepção procura uma e encontra duas.'):
            with transaction.atomic():
                Reservation.objects.create(confirmation='RES-IGUAL', **comum)

    def test_duas_reservas_ao_mesmo_tempo_nao_levam_o_mesmo_codigo_de_confirmacao(self):
        """O código de confirmação é o que o hóspede traz na mão.

        Dois hóspedes com o mesmo código é a recepção a encontrar duas reservas
        quando procura uma — e a escolher a errada.

        NOTA SOBRE O SQLITE, que vale para todas as corridas deste ficheiro: a
        base de desenvolvimento só deixa UM escritor de cada vez e recusa o
        segundo com "database table is locked", enquanto o PostgreSQL da
        produção põe o segundo à espera e deixa-o passar. Por isso o que se
        afirma aqui é o INVARIANTE — nunca dois iguais — e não "os dois
        passaram": o invariante vale nas duas bases e é ele que interessa.
        """
        tipo = RoomType.objects.create(hotel=self.hotel, code='TWN', name='Twin',
                                       base_rate=Decimal('18000'))
        hoje = timezone.localdate()
        quartos = [Room.objects.create(hotel=self.hotel, room_type=tipo, number='50%s' % i).id
                   for i in range(2)]
        hospedes = [Customer.objects.create(code='CC%s' % i, name='Cliente %s' % i).id
                    for i in range(2)]

        def reservar(i):
            c = self.cliente()
            r = c.post('/api/pms/reservations/', {
                'hotel': self.hotel.id, 'guest': hospedes[i], 'room_type': tipo.id,
                'room': quartos[i], 'check_in': str(hoje + timedelta(days=10)),
                'check_out': str(hoje + timedelta(days=11)), 'adults': 1}, format='json')
            return r.status_code

        resultados = self.ao_mesmo_tempo(reservar)

        passaram = [r for r in resultados if r[0] == 'ok']
        recusadas = [str(r[1])[:60] for r in resultados if r[0] == 'erro']
        if not passaram and self.so_a_base_travou(resultados):
            self.skipTest('o SQLite recusou as duas escritas ("database table is locked") — '
                          'esta corrida só se corre em PostgreSQL. A defesa está provada em '
                          'test_a_base_de_dados_recusa_dois_codigos_de_confirmacao_iguais.')
        self.assertTrue(passaram, 'Nenhuma das reservas passou: %s' % recusadas)
        self.assertEqual(Reservation.objects.count(), len(passaram),
                         'Gravaram-se %s reservas para %s pedidos aceites.'
                         % (Reservation.objects.count(), len(passaram)))
        codigos = list(Reservation.objects.values_list('confirmation', flat=True))
        self.assertEqual(len(set(codigos)), 2, 'Dois códigos de confirmação iguais: %s' % codigos)


# ──────────────────────────────────────────────────────────────────────────────
# 5. DUAS SESSÕES DE CAIXA ABERTAS
# ──────────────────────────────────────────────────────────────────────────────
class DuasCaixasAbertasTests(DoisAoMesmoTempo):

    def test_duas_aberturas_ao_mesmo_tempo_deixam_uma_caixa_aberta(self):
        """Com duas caixas abertas, nenhum dos fechos bate.

        O `pay()` escolhe UMA sessão aberta do ponto de venda (a mais recente):
        as vendas repartem-se entre as duas ao sabor da hora a que cada conta
        nasceu. A falta de uma é a sobra da outra — parece roubo e é um duplo
        toque no botão de abrir.
        """
        def abrir(_i):
            c = self.cliente()
            return c.post('/api/pos/cash-sessions/', {
                'outlet': self.outlet.id, 'opening_float': '5000',
                'operator_name': 'Empregado 2', 'opened_by': 'Empregado 2'},
                format='json').status_code

        self.ao_mesmo_tempo(abrir)

        abertas = CashSession.objects.filter(outlet=self.outlet, operator_name='Empregado 2',
                                             status='OPEN')
        self.assertEqual(abertas.count(), 1,
                         'Ficaram %s caixas abertas para o mesmo operador no mesmo ponto de '
                         'venda.' % abertas.count())

    def test_a_base_de_dados_recusa_a_segunda_caixa_aberta(self):
        """A prova que vale em PostgreSQL — e a garantia de que o histórico fica.

        Fechada, a sessão sai do índice: o operador pode abrir caixa todos os
        dias e o histórico dos fechos é precisamente o que se quer guardar.
        """
        with self.assertRaises(IntegrityError, msg='A base aceitou uma segunda caixa ABERTA para '
                                                   'o mesmo operador e ponto de venda.'):
            CashSession.objects.create(outlet=self.outlet, opening_float=Decimal('1'),
                                       operator_name='Empregado 1', status='OPEN')

        self.caixa.status = 'CLOSED'
        self.caixa.closed_at = timezone.now()
        self.caixa.save(update_fields=['status', 'closed_at'])
        nova = CashSession.objects.create(outlet=self.outlet, opening_float=Decimal('2'),
                                          operator_name='Empregado 1', status='OPEN')
        self.assertIsNotNone(nova.pk, 'Depois de fechar a caixa, o mesmo operador tem de poder '
                                      'abrir outra — senão não se trabalha no dia seguinte.')


# ──────────────────────────────────────────────────────────────────────────────
# 6. DUAS AUDITORIAS DA NOITE
# ──────────────────────────────────────────────────────────────────────────────
class DuasAuditoriasDaNoiteTests(DoisAoMesmoTempo):

    def test_duas_auditorias_da_mesma_noite_lancam_a_diaria_uma_vez(self):
        """A diária da noite não se cobra duas vezes.

        A auditoria defende-se por dois lados: a referência `ROOM-<data>` de cada
        lançamento e o `unique_together (hotel, audit_date)` do registo da
        execução. O que faz esta defesa resistir a duas execuções em paralelo é o
        registo ser gravado DENTRO da mesma transação que lança as diárias: a
        execução que perde o empate leva IntegrityError e TUDO o que ela lançou
        volta atrás com ela.
        """
        _q, folio, res = self.hospede_instalado(numero='601', confirmacao='RES-601')
        ontem = timezone.localdate() - timedelta(days=1)
        res.check_in = ontem
        res.save(update_fields=['check_in'])

        def auditar(_i):
            c = self.cliente()
            r = c.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
            return r.status_code

        self.ao_mesmo_tempo(auditar)

        self.assertEqual(NightAuditRun.objects.filter(audit_date=ontem).count(), 1,
                         'A mesma noite foi fechada duas vezes.')
        diarias = FolioCharge.objects.filter(folio=folio, charge_type='ROOM', is_void=False,
                                             source_reference='ROOM-%s' % ontem.isoformat())
        self.assertEqual(diarias.count(), 1,
                         'A diária de %s foi lançada %s vezes — %s Kz a mais na conta do '
                         'hóspede.' % (ontem, diarias.count(),
                                       sum((d.amount for d in diarias), Decimal('0'))))
        self.assertEqual(Folio.objects.get(pk=folio.pk).balance, Decimal('25000'))

    def test_a_base_de_dados_recusa_a_mesma_diaria_duas_vezes_na_conta(self):
        """A prova que vale em PostgreSQL."""
        _q, folio, _res = self.hospede_instalado(numero='602', confirmacao='RES-602')
        ref = 'ROOM-%s' % timezone.localdate().isoformat()
        FolioCharge.objects.create(folio=folio, charge_type='ROOM', description='Alojamento',
                                   amount=Decimal('25000'), source_reference=ref)
        with self.assertRaises(IntegrityError, msg='A base aceitou a MESMA noite lançada duas '
                                                   'vezes na conta do hóspede.'):
            FolioCharge.objects.create(folio=folio, charge_type='ROOM',
                                       description='Alojamento (outra vez)',
                                       amount=Decimal('25000'), source_reference=ref)

    def test_a_conta_dividida_continua_a_poder_lancar_o_mesmo_ticket_duas_vezes(self):
        """A constraint não pode tirar dinheiro ao hotel.

        Uma conta do bar paga em duas partes (metade agora, metade depois) lança
        DUAS linhas com a referência do mesmo ticket — e as duas são dinheiro a
        sério. É por isso que o consumo do POS (`FNB`) fica fora do índice: ali
        quem trava o duplicado é a SOMA (ver `_lancar_no_folio`).
        """
        _q, folio, _res = self.hospede_instalado(numero='603', confirmacao='RES-603')
        FolioCharge.objects.create(folio=folio, charge_type='FNB', description='POS T1',
                                   amount=Decimal('2500'), source_reference='T-1')
        FolioCharge.objects.create(folio=folio, charge_type='FNB', description='POS T1 (resto)',
                                   amount=Decimal('2500'), source_reference='T-1')
        self.assertEqual(FolioCharge.objects.filter(folio=folio, source_reference='T-1').count(), 2)


# ──────────────────────────────────────────────────────────────────────────────
# 7. O MESMO DOCUMENTO DE STOCK LANÇADO DUAS VEZES
# ──────────────────────────────────────────────────────────────────────────────
class LancamentoDeStockTests(DoisAoMesmoTempo):

    def _documento_de_compra(self, quantidade=Decimal('100')):
        serie = StockDocSeries.objects.create(code='COMPRA', name='Factura de fornecedor',
                                              kind='STOCK', links_stock=True,
                                              updates_avg_cost=True)
        armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM', name='Armazém Central')
        doc = StockDoc.objects.create(series=serie, doc_date=timezone.localdate(),
                                      warehouse=armazem)
        StockDocLine.objects.create(doc=doc, item=self.bife, quantity=quantidade,
                                    unit_cost=Decimal('500'))
        return doc, armazem

    def test_lancar_o_mesmo_documento_duas_vezes_entra_a_mercadoria_uma_vez(self):
        """Stock a dobrar, e o custo médio corrompido para sempre.

        `post()` era idempotente pela marca `posted`, mas lida em memória: dois
        pedidos de "Lançar" leem ambos `posted=False` e ambos mexem no stock. O
        custo médio ponderado é CUMULATIVO — depois de entrar mercadoria a dobro
        não há como reconstituir o valor certo, e a margem de cada prato que leve
        o artigo passa a ser uma invenção.

        A defesa é um `UPDATE ... WHERE posted=False`: a base de dados aplica-o a
        uma linha de cada vez e só um dos dois vê "1 linha alterada". Vale igual
        no SQLite e no PostgreSQL.
        """
        doc, armazem = self._documento_de_compra()

        def lancar(_i):
            d = StockDoc.objects.get(pk=doc.pk)
            with transaction.atomic():
                return d.post(user='economato')

        resultados = self.ao_mesmo_tempo(lancar)

        nivel = StockLevel.objects.get(warehouse=armazem, item=self.bife)
        self.assertEqual(nivel.quantity_on_hand, Decimal('100'),
                         'Entraram %s unidades em vez de 100 — o documento foi lançado duas '
                         'vezes.' % nivel.quantity_on_hand)
        movimentos = StockMovement.objects.filter(item=self.bife, reference=doc.number)
        self.assertEqual(movimentos.count(), 1,
                         'Ficaram %s movimentos de stock do mesmo documento.' % movimentos.count())
        lancaram = [r[1] for r in resultados if r[0] == 'ok' and r[1]]
        self.assertEqual(len(lancaram), 1,
                         'Mais do que um pedido deu o documento por lançado: %s' % lancaram)

    def test_duas_saidas_ao_mesmo_tempo_deixam_o_saldo_certo(self):
        """A "actualização perdida" — e o que o SQLite deixa e não deixa provar.

        Toda a entrada e saída lia o saldo, somava ou subtraía, e gravava o
        resultado: três passos com uma janela aberta no meio. Duas saídas ao mesmo
        tempo liam AMBAS 100 e gravavam AMBAS 90 — dez unidades desapareciam do
        papel sem sair do armazém, sem erro e sem rasto. Descobre-se meses depois,
        numa contagem, e chama-se-lhe "quebra".

        O QUE ESTE TESTE AFIRMA é o invariante, não "as duas saídas passaram": o
        saldo final tem de ser 100 menos 10 por CADA saída que chegou a
        acontecer. Esta distinção não é detalhe — a primeira versão deste teste
        exigia que as duas passassem, e em SQLite uma delas é recusada com
        "database table is locked" (a base só deixa um escritor de cada vez). O
        teste falhava a dizer "uma escreveu por cima da outra", que era falso: a
        causa era outra, e perseguir a causa errada custa mais do que não ter
        teste nenhum.

        Assim, o invariante vale nas duas bases: em PostgreSQL as duas passam e o
        saldo tem de ser 80; em SQLite passa uma e tem de ser 90 — e uma
        actualização perdida continua a falhar aqui, porque aí haveria DUAS saídas
        bem-sucedidas e o saldo em 90.
        """
        from inventory import stock as motor

        armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM2', name='Armazém')
        motor.move_in(armazem, self.bife, Decimal('100'), Decimal('500'), reference='INICIAL')

        def tirar(_i):
            item = Item.objects.get(pk=self.bife.pk)
            arm = Warehouse.objects.get(pk=armazem.pk)
            motor.move_out(arm, item, Decimal('10'), reference='SAIDA')
            return True

        resultados = self.ao_mesmo_tempo(tirar)
        passaram = [r for r in resultados if r[0] == 'ok']
        recusadas = [str(r[1])[:60] for r in resultados if r[0] == 'erro']
        self.assertTrue(passaram, 'Nenhuma das saídas passou: %s' % recusadas)

        nivel = StockLevel.objects.get(warehouse=armazem, item=self.bife)
        esperado = Decimal('100') - Decimal('10') * len(passaram)
        self.assertEqual(
            nivel.quantity_on_hand, esperado,
            'Passaram %s saída(s) de 10 sobre um saldo de 100, logo o saldo tem de ser %s '
            'e está em %s. Se passaram duas e o saldo está em 90, uma escreveu por cima '
            'da outra. (Recusadas pela base: %s)'
            % (len(passaram), esperado, nivel.quantity_on_hand, recusadas or 'nenhuma'))
        self.assertEqual(
            StockMovement.objects.filter(item=self.bife, reference='SAIDA').count(),
            len(passaram),
            'O número de movimentos no livro não é o número de saídas que aconteceram.')

    def test_a_conta_do_saldo_e_feita_pela_base_de_dados(self):
        """A PROVA DETERMINÍSTICA da correcção — sem threads, em qualquer base.

        A actualização perdida precisa de duas coisas: um saldo lido para a
        memória e uma gravação feita a partir desse número velho. Reproduz-se sem
        concorrência nenhuma: pega-se no objecto do saldo, deixa-se que outra
        operação mexa no stock pelas costas dele, e grava-se a partir do objecto
        velho. Com a conta feita em Python, o valor velho ganhava e a outra
        operação desaparecia. Com `F('quantity_on_hand') - 10`, a soma é feita
        DENTRO do UPDATE, pela própria base — o número que está em memória deixa
        de ter voto na matéria.

        É este teste que protege a correcção: ele falha no dia em que alguém
        voltar a escrever `nivel.quantity_on_hand = x; nivel.save()`.
        """
        from inventory import stock as motor
        from inventory.stock import _somar_ao_saldo

        armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM9', name='Armazém')
        motor.move_in(armazem, self.bife, Decimal('100'), Decimal('500'), reference='INICIAL')

        # O objecto VELHO: leu 100 e ficou com esse número na mão.
        velho = StockLevel.objects.get(warehouse=armazem, item=self.bife)
        self.assertEqual(velho.quantity_on_hand, Decimal('100'))

        # Pelas costas dele, saem 30 (outra conta a fechar no POS, uma requisição).
        motor.move_out(armazem, self.bife, Decimal('30'), reference='OUTRA')
        self.assertEqual(
            StockLevel.objects.get(pk=velho.pk).quantity_on_hand, Decimal('70.0000'))

        # Agora o objecto velho grava a SUA saída de 10. A conta certa é
        # 70 − 10 = 60. Feita em Python a partir do número velho, dava 100 − 10 = 90
        # e as 30 que saíram desapareciam.
        _somar_ao_saldo(velho, Decimal('-10'))
        self.assertEqual(
            StockLevel.objects.get(pk=velho.pk).quantity_on_hand, Decimal('60.0000'),
            'O saldo foi escrito a partir do número que estava em memória: as 30 '
            'unidades que saíram entretanto desapareceram do papel sem sair do armazém.')
        # E o objecto em mão também tem de passar a ver a verdade.
        self.assertEqual(velho.quantity_on_hand, Decimal('60.0000'),
                         'O objecto ficou com um saldo velho em memória — quem o usar a '
                         'seguir (custo médio, lotes, nota do movimento) usa um número falso.')


# ──────────────────────────────────────────────────────────────────────────────
# 8. DOIS NÚMEROS DE DOCUMENTO IGUAIS
# ──────────────────────────────────────────────────────────────────────────────
class NumeracaoTests(DoisAoMesmoTempo):

    def test_duas_emissoes_ao_mesmo_tempo_numeram_em_sequencia(self):
        """Dois números iguais partem a cadeia que a AGT verifica primeiro.

        A numeração é `current_number + 1`, lida e gravada em passos separados.
        Duas emissões em paralelo disputam o mesmo número e, pior, partem o
        encadeamento de hash — e uma cadeia partida é o que uma inspeção olha
        primeiro.
        """
        from fiscal import services

        def emitir(i):
            return services.issue_document(
                self.serie_fr.id, customer_name='Consumidor Final',
                lines=[{'description': 'Jantar %s' % i, 'quantity': 1,
                        'unit_price': Decimal('10000'), 'tax_percentage': Decimal('14')}],
                source_module='manual').invoice_no

        self.ao_mesmo_tempo(emitir)

        docs = list(FiscalDocument.objects.filter(series=self.serie_fr).order_by('number'))
        self.assertEqual(len(docs), 2, 'Uma das duas emissões perdeu-se.')
        self.assertEqual([d.number for d in docs], [1, 2],
                         'Os números saíram %s — a sequência da série tem de ser contínua.'
                         % [d.number for d in docs])
        self.assertEqual(len({d.invoice_no for d in docs}), 2)
        self.assertTrue(services.verify_chain(self.serie_fr.id)['all_ok'],
                        'Duas emissões ao mesmo tempo partiram a cadeia de hash da série.')

    def test_a_base_de_dados_recusa_dois_numeros_iguais_na_serie(self):
        """A prova que vale em PostgreSQL."""
        from fiscal import services

        doc = services.issue_document(
            self.serie_fr.id, customer_name='Consumidor Final',
            lines=[{'description': 'Jantar', 'quantity': 1, 'unit_price': Decimal('10000'),
                    'tax_percentage': Decimal('14')}],
            source_module='manual')
        with self.assertRaises(IntegrityError, msg='A base aceitou dois documentos com o mesmo '
                                                   'número na mesma série.'):
            FiscalDocument.objects.create(
                series=doc.series, doc_type=doc.doc_type, number=doc.number,
                invoice_no='FR A/clone', doc_date=doc.doc_date,
                system_entry_date=doc.system_entry_date, doc_hash='x',
                gross_total=doc.gross_total, source_module='manual')

    def test_dois_documentos_de_stock_ao_mesmo_tempo_nao_levam_o_mesmo_numero(self):
        """Duas facturas de fornecedor com o mesmo número não se conferem.

        A numeração do documento de stock faz-se no `save()`, pelo mesmo
        mecanismo de ler-somar-gravar. Numa manhã de recepção de mercadoria há
        duas pessoas a registar facturas ao mesmo tempo, e as duas saíam com
        "ARM/1".
        """
        serie = StockDocSeries.objects.create(code='ARM', name='Entradas', kind='STOCK')
        armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM3', name='Armazém')

        def registar(_i):
            s = StockDocSeries.objects.get(pk=serie.pk)
            a = Warehouse.objects.get(pk=armazem.pk)
            d = StockDoc.objects.create(series=s, doc_date=timezone.localdate(), warehouse=a)
            return d.number

        resultados = self.ao_mesmo_tempo(registar)

        docs = list(StockDoc.objects.filter(series=serie).order_by('id'))
        passaram = [r for r in resultados if r[0] == 'ok']
        recusadas = [str(r[1])[:60] for r in resultados if r[0] == 'erro']
        if not passaram and self.so_a_base_travou(resultados):
            self.skipTest('o SQLite recusou as duas escritas — esta corrida só se corre em '
                          'PostgreSQL. A defesa está provada em '
                          'test_a_base_de_dados_recusa_dois_numeros_iguais_na_serie_de_stock.')
        self.assertTrue(passaram, 'Nenhum dos documentos foi registado: %s' % recusadas)
        # O INVARIANTE, não "os dois passaram": em SQLite a base recusa o segundo
        # escritor ("database table is locked"); em PostgreSQL passa. O que não pode
        # acontecer, em nenhuma das duas, é dois documentos com o MESMO número.
        self.assertEqual(len(docs), len(passaram),
                         'Gravaram-se %s documentos para %s registos aceites. (Recusados: %s)'
                         % (len(docs), len(passaram), recusadas or 'nenhum'))
        numeros = [d.number for d in docs]
        self.assertEqual(len(set(numeros)), len(numeros),
                         'Dois documentos de stock com o MESMO número: %s. Duas facturas de '
                         'fornecedor com o mesmo número não se conferem — e a conta corrente '
                         'do fornecedor deixa de bater.' % numeros)

    def test_a_base_de_dados_recusa_dois_numeros_iguais_na_serie_de_stock(self):
        """A prova que vale em PostgreSQL."""
        serie = StockDocSeries.objects.create(code='ARM4', name='Entradas', kind='STOCK')
        armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM5', name='Armazém')
        doc = StockDoc.objects.create(series=serie, doc_date=timezone.localdate(),
                                      warehouse=armazem)
        with self.assertRaises(IntegrityError, msg='A base aceitou dois documentos de stock com '
                                                   'o mesmo número na mesma série.'):
            StockDoc.objects.create(series=serie, number=doc.number,
                                    doc_date=timezone.localdate(), warehouse=armazem)


# ──────────────────────────────────────────────────────────────────────────────
# A VARREDURA: uma tranca fora de uma transação é uma tranca que não existe
# ──────────────────────────────────────────────────────────────────────────────
class TrancasForaDeTransacaoTests(TransactionTestCase):
    """O `select_for_update()` solto é um erro que o SQLite esconde.

    No SQLite a tranca é ignorada em silêncio e tudo parece bem; no PostgreSQL
    do cliente o Django levanta `TransactionManagementError` e o ecrã rebenta
    com "erro interno". Não há teste de comportamento que apanhe isto numa base
    SQLite — por isso a verificação é sobre o CÓDIGO.

    A mesma ideia já existe em `pms/tests.py`
    (`test_trancar_registos_nunca_fica_fora_de_uma_transacao`) para os três
    módulos do PMS. Isto NÃO a duplica: estende-a ao RESTO do backend, que não
    estava coberto — e é lá que estão os caminhos do dinheiro do POS, do motor
    fiscal e do stock.
    """

    # Os módulos que o teste do PMS já varre — não se varrem outra vez.
    JA_COBERTOS = {
        str(Path('pms') / 'views.py'),
        str(Path('pms') / 'booking_engine.py'),
        str(Path('pms') / 'night_audit.py'),
    }

    def test_nenhuma_tranca_do_backend_fica_fora_de_uma_transacao(self):
        raiz = Path(__file__).resolve().parent.parent
        faltam = []
        for caminho in sorted(raiz.rglob('*.py')):
            rel = caminho.relative_to(raiz)
            partes = set(rel.parts)
            if partes & {'venv', 'migrations', '__pycache__', 'node_modules'}:
                continue
            if str(rel) in self.JA_COBERTOS:
                continue
            texto = caminho.read_text(encoding='utf-8', errors='replace')
            if 'select_for_update' not in texto:
                continue
            try:
                arvore = ast.parse(texto)
            except SyntaxError:                    # noqa — ficheiro não é deste Python
                continue
            for no in ast.walk(arvore):
                if not isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                trancas = [f.lineno for f in ast.walk(no)
                           if isinstance(f, ast.Call) and isinstance(f.func, ast.Attribute)
                           and f.func.attr == 'select_for_update']
                if not trancas:
                    continue
                if any('atomic' in ast.dump(d) for d in no.decorator_list):
                    continue
                protegidas = set()
                for w in ast.walk(no):
                    if isinstance(w, ast.With) and any('atomic' in ast.dump(i.context_expr)
                                                       for i in w.items):
                        protegidas.update(range(w.lineno, (w.end_lineno or w.lineno) + 1))
                for linha in trancas:
                    if linha not in protegidas:
                        faltam.append('%s:%s (em %s)' % (rel, linha, no.name))
        self.assertEqual(faltam, [],
                         'há select_for_update() fora de uma transação — no SQLite é ignorado '
                         'em silêncio e em PostgreSQL rebenta: ' + ', '.join(faltam))
