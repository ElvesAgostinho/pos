# -*- coding: utf-8 -*-
"""O CENTRO DE RELATÓRIOS, RELATÓRIO A RELATÓRIO.

Um relatório que soma mal não dá erro: dá um número. E alguém — o contabilista,
o proprietário, a AGT — acredita nele. Por isso estes testes não se contentam
com "devolveu uma linha": montam UM DIA DE CASA CHEIA (hotel com quartos
ocupados, reservas, check-ins, consumos no POS, pagamentos, documentos fiscais,
compras, inventários, movimentos de stock), calculam os totais À MÃO aqui no
teste, e comparam com o que o ecrã recebe pela API.

Três perguntas em cada relatório, porque são as três maneiras de ele mentir:

  1. ABRE?           — um relatório que rebenta é um ecrã que diz "erro interno".
  2. SOMA CERTO?     — o total é o que se calcula à mão com os dados do cenário.
  3. RESPEITA O QUE  — o PERÍODO pedido (o erro mais comum é somar tudo e ignorar
     NÃO É RECEITA?    as datas) e o que está ANULADO/CANCELADO/ESTORNADO.

Onde vive o Centro: o catálogo e o motor estão em `pos/reports.py` (pastas,
filtro universal, "incluir detalhes", comparação de períodos); o PMS acrescenta
as suas pastas em `pms/reports_catalog.py`; a porta é `pos/config_api.py`
(PosReportCatalogView / PosReportRunView), e o ecrã é
`frontend/src/components/posconfig/PosReports.tsx`. Os testes entram pela PORTA
(a API), porque é por ela que o ecrã entra: um motor certo com uma porta errada
é um relatório que ninguém consegue abrir.

MARCA `DEFEITO` nos nomes dos testes: há defeitos deste Centro que vivem em
ficheiros que esta auditoria NÃO pode editar (`pos/reports.py`,
`pms/reports.py`, `pms/reports_catalog.py` estavam a ser corrigidos por outra
mão ao mesmo tempo). Esses testes fixam o comportamento ERRADO DE HOJE com o
número certo escrito no comentário, para que (a) ninguém diga que o defeito não
estava provado e (b) quem o corrigir saiba exatamente que número passa a sair.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

import io


def _dh(dia, hora=12, minuto=0):
    """Data+hora na hora de Luanda — as contas fecham a horas de serviço, e é
    pela hora local que os relatórios agrupam (ver r_horas_pico)."""
    return timezone.make_aware(datetime.combine(dia, time(hora, minuto)))


def _forcar(modelo, pk, **campos):
    """Mete uma data num campo `auto_now_add`.

    Metade dos relatórios filtra por `created_at`/`opened_at`, que o Django
    preenche sozinho com o AGORA. Sem este empurrão, todo o cenário nasceria
    hoje e nenhum teste conseguia provar que o filtro de período funciona.
    """
    modelo.objects.filter(pk=pk).update(**campos)


class CasaCheia(APITestCase):
    """UM DIA DE CASA CHEIA — o cenário que todos os testes deste ficheiro leem.

    Tudo o que entra aqui entra com valores REDONDOS e propositados, para que
    cada total se possa escrever à mão na mensagem do assert. E entra sempre em
    três datas:

        FORA  (há 40 dias)  — fora do período pedido: NUNCA pode aparecer;
        ONTEM e HOJE        — o período pedido em quase todos os testes.

    O que NÃO É RECEITA entra de propósito, porque é isso que se quer ver
    excluído: uma conta aberta, uma conta estornada, uma linha anulada, uma
    oferta, um documento fiscal anulado, uma fatura regularizada por nota de
    crédito, uma compra anulada, uma reserva cancelada e um no-show.
    """

    # ───────────────────────────────── o cenário
    @classmethod
    def setUpTestData(cls):
        call_command('seed_fiscal', verbosity=0, stdout=io.StringIO())

    def setUp(self):
        from fiscal import signing
        from fiscal.models import FiscalConfig

        from identity.models import Company, EnterpriseGroup, Hotel
        from inventory.models import (Item, ItemCategory, ItemFamily, ItemGroup,
                                      ItemSubFamily, StockLevel, UnitOfMeasure, Warehouse)
        from mdm.models import Customer, PaymentMethod
        from pos.models import (Allergen, CashMovement, CashSession, EntityDeposit,
                                EventRequest, EventReservationState, EventType, GiftCard,
                                HappyHour, HRCommission, HRType, HumanResource, Outlet,
                                POSAuditLog, POSReservation, POSTicket, POSTicketLine,
                                POSTicketPayment, MemberCard, MemberCardMovement,
                                PosSector, StockDoc, StockDocLine, StockDocSeries, TimeBand)
        from pos.params import invalidate

        invalidate()
        self.addCleanup(invalidate)

        self.user = User.objects.create_superuser('dono_relatorios', '', 'x')
        self.client.force_authenticate(self.user)

        self.HOJE = timezone.localdate()
        self.ONTEM = self.HOJE - timedelta(days=1)
        self.FORA = self.HOJE - timedelta(days=40)

        # ── a casa
        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.certificate_number = '147/AGT/2026'
        cfg.environment = 'TEST'
        cfg.prices_include_tax = False
        cfg.save()
        signing.ensure_keys()

        self.restaurante = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST')
        self.lounge = Outlet.objects.create(hotel=self.hotel, name='Lounge', code='LNG')

        # (8611) A ficha do setor escolhe a banda horária de reporting — é o que o
        # relatório "Vendas por Hora (período)" usa para agrupar.
        self.banda = TimeBand.objects.create(code='001', name='Almoço (12:00 as 15:00)')
        PosSector.objects.create(code='S-RST', name='Sala', outlet=self.restaurante,
                                 params={'8611': str(self.banda.id)})
        PosSector.objects.create(code='S-LNG', name='Lounge', outlet=self.lounge)

        # ── artigos: dois, com CUSTO (é o custo que faz a margem) e com a árvore
        # grupo→família→sub-família completa (é por ela que o relatório de famílias soma).
        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Restauração')
        g_coz = ItemGroup.objects.create(code='G1', name='Cozinha')
        g_bar = ItemGroup.objects.create(code='G2', name='Bar')
        f_com = ItemFamily.objects.create(group=g_coz, code='F1', name='Comida')
        f_beb = ItemFamily.objects.create(group=g_bar, code='F2', name='Bebidas')
        sf_car = ItemSubFamily.objects.create(family=f_com, code='SF1', name='Carnes')
        sf_cer = ItemSubFamily.objects.create(family=f_beb, code='SF2', name='Cervejas')

        self.bife = Item.objects.create(code='A001', name='Bife à Casa', item_type='Manufactured',
                                        category=cat, base_uom=un, subfamily=sf_car,
                                        sale_price=Decimal('4000.00'),
                                        current_average_cost=Decimal('1500.0000'),
                                        tax_percentage=Decimal('14.00'))
        self.cerveja = Item.objects.create(code='A002', name='Cerveja Cuca', item_type='Retail',
                                           category=cat, base_uom=un, subfamily=sf_cer,
                                           sale_price=Decimal('1000.00'),
                                           current_average_cost=Decimal('400.0000'),
                                           tax_percentage=Decimal('14.00'))

        # ── armazéns e stock (o "dinheiro parado")
        self.central = Warehouse.objects.create(code='CEN', name='Armazém Central',
                                                hotel=self.hotel, is_main=True)
        self.bar = Warehouse.objects.create(code='BAR', name='Armazém do Bar', hotel=self.hotel)
        StockLevel.objects.create(warehouse=self.central, item=self.cerveja,
                                  quantity_on_hand=Decimal('95'))
        StockLevel.objects.create(warehouse=self.central, item=self.bife,
                                  quantity_on_hand=Decimal('10'))
        StockLevel.objects.create(warehouse=self.bar, item=self.cerveja,
                                  quantity_on_hand=Decimal('5'))

        # ── modos de pagamento
        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True)
        self.tpa = PaymentMethod.objects.create(code='TPA', name='Multibanco', method_type='CARD',
                                                for_pos=True)
        self.transf = PaymentMethod.objects.create(code='TRF', name='Transferência',
                                                   method_type='TRANSFER', for_pos=True,
                                                   bank_transfer=True)

        # ── caixas
        self.caixa = CashSession.objects.create(outlet=self.restaurante, operator_name='Ana',
                                                opening_float=Decimal('10000'), status='CLOSED')
        _forcar(CashSession, self.caixa.pk, opened_at=_dh(self.HOJE, 8),
                closed_at=_dh(self.HOJE, 23))
        self.caixa_antiga = CashSession.objects.create(outlet=self.restaurante, operator_name='Ana',
                                                      opening_float=Decimal('5000'), status='CLOSED')
        _forcar(CashSession, self.caixa_antiga.pk, opened_at=_dh(self.FORA, 8))

        mv1 = CashMovement.objects.create(session=self.caixa, movement_type='SANGRIA',
                                          amount=Decimal('3000'), reason='Depósito no banco',
                                          created_by='Ana')
        mv2 = CashMovement.objects.create(session=self.caixa, movement_type='REFORCO',
                                          amount=Decimal('1000'), reason='Troco', created_by='Ana')
        mv3 = CashMovement.objects.create(session=self.caixa_antiga, movement_type='SANGRIA',
                                          amount=Decimal('50000'), reason='Fora do período')
        _forcar(CashMovement, mv1.pk, created_at=_dh(self.HOJE, 18))
        _forcar(CashMovement, mv2.pk, created_at=_dh(self.HOJE, 19))
        _forcar(CashMovement, mv3.pk, created_at=_dh(self.FORA, 18))

        # ── AS CONTAS DO DIA ────────────────────────────────────────────────
        self.t1 = self._conta('T1', self.restaurante, 'Ana', self.HOJE, 12, 30, 'PAID',
                              guests=2, total='10000', desconto='500', sessao=self.caixa)
        self._linha(self.t1, self.bife, 2, '4000')
        self._linha(self.t1, self.cerveja, 2, '1000')

        self.t2 = self._conta('T2', self.lounge, 'Bruno', self.HOJE, 20, 15, 'PAID',
                              guests=1, total='5000')
        self._linha(self.t2, self.cerveja, 5, '1000')

        self.t3 = self._conta('T3', self.restaurante, 'Ana', self.ONTEM, 13, 0, 'PAID',
                              guests=3, total='4000')
        self._linha(self.t3, self.bife, 1, '4000')

        # FORA do período — 100 000 Kz que nenhum relatório do período pode somar.
        self.t4 = self._conta('T4', self.restaurante, 'Ana', self.FORA, 19, 0, 'PAID',
                              guests=4, total='100000')
        self._linha(self.t4, self.bife, 25, '4000')

        # ABERTA — ainda não é receita de ninguém.
        self.t5 = self._conta('T5', self.restaurante, 'Ana', self.HOJE, 22, 0, 'OPEN',
                              guests=2, total='4000', sessao=self.caixa)
        self._linha(self.t5, self.bife, 1, '4000')

        # Uma anulada e uma oferta na mesma conta: o que se lançou e se tirou.
        self.t6 = self._conta('T6', self.restaurante, 'Ana', self.HOJE, 21, 0, 'PAID',
                              guests=2, total='1000', sessao=self.caixa)
        self._linha(self.t6, self.cerveja, 1, '1000')
        self._linha(self.t6, self.bife, 1, '4000', void=True, motivo='Cliente desistiu')
        self._linha(self.t6, self.cerveja, 1, '1000', desconto=100)

        # ESTORNADA — o dinheiro voltou ao cliente; não é venda do dia.
        self.t7 = self._conta('T7', self.restaurante, 'Carla', self.HOJE, 14, 0, 'REFUNDED',
                              guests=2, total='8000', sessao=self.caixa)
        self._linha(self.t7, self.bife, 2, '4000')

        # Histórico (mesmo dia da semana que HOJE) — é a base da PREVISÃO.
        self.h1 = self._conta('H1', self.restaurante, 'Ana', self.HOJE - timedelta(days=7),
                              12, 0, 'PAID', guests=2, total='6000')
        self._linha(self.h1, self.cerveja, 6, '1000')
        self.h2 = self._conta('H2', self.restaurante, 'Ana', self.HOJE - timedelta(days=14),
                              12, 0, 'PAID', guests=2, total='4000')
        self._linha(self.h2, self.cerveja, 4, '1000')

        # ── pagamentos
        self._pagar(self.t1, self.dinheiro, '10000', self.HOJE, 12, 35)
        self._pagar(self.t2, self.tpa, '5000', self.HOJE, 20, 20, auth_code='TPA-99')
        self._pagar(self.t3, self.transf, '4000', self.ONTEM, 13, 10, bank_reference='TRF-7')
        self._pagar(self.t6, self.dinheiro, '1000', self.HOJE, 21, 5)
        self._pagar(self.t7, self.dinheiro, '8000', self.HOJE, 14, 10)
        self._pagar(self.t4, self.dinheiro, '100000', self.FORA, 19, 10)
        self._pagar(self.h1, self.dinheiro, '6000', self.HOJE - timedelta(days=7), 12, 10)
        self._pagar(self.h2, self.dinheiro, '4000', self.HOJE - timedelta(days=14), 12, 10)

        # ── clientes, depósitos e pontos
        self.empresa_x = Customer.objects.create(code='C001', name='Empresa X',
                                                 tax_id='5401234567', phone='923000111')
        self.empresa_y = Customer.objects.create(code='C002', name='Empresa Y', tax_id='5409999999')

        d1 = EntityDeposit.objects.create(customer=self.empresa_x, kind='IN',
                                          amount=Decimal('50000'), reason='Adiantamento',
                                          created_by='Ana')
        d2 = EntityDeposit.objects.create(customer=self.empresa_x, kind='USE',
                                          amount=Decimal('20000'), reason='Jantar de grupo',
                                          created_by='Ana')
        d3 = EntityDeposit.objects.create(customer=self.empresa_y, kind='IN',
                                          amount=Decimal('9000'), reason='Fora do período')
        _forcar(EntityDeposit, d1.pk, created_at=_dh(self.HOJE, 10))
        _forcar(EntityDeposit, d2.pk, created_at=_dh(self.HOJE, 21))
        _forcar(EntityDeposit, d3.pk, created_at=_dh(self.FORA, 10))

        cartao = MemberCard.objects.create(code='CL1', name='Clube Mwana', has_points=True,
                                           points_per_100=Decimal('1'))
        p1 = MemberCardMovement.objects.create(customer=self.empresa_x, card=cartao, kind='EARN',
                                               points=Decimal('100'), ticket=self.t1)
        p2 = MemberCardMovement.objects.create(customer=self.empresa_x, card=cartao, kind='REDEEM',
                                               points=Decimal('30'), ticket=self.t6)
        p3 = MemberCardMovement.objects.create(customer=self.empresa_x, card=cartao, kind='EARN',
                                               points=Decimal('500'), ticket=self.t4)
        _forcar(MemberCardMovement, p1.pk, created_at=_dh(self.HOJE, 12))
        _forcar(MemberCardMovement, p2.pk, created_at=_dh(self.HOJE, 21))
        _forcar(MemberCardMovement, p3.pk, created_at=_dh(self.FORA, 19))

        GiftCard.objects.create(code='GC-1', initial_balance=Decimal('20000'),
                                balance=Decimal('15000'), is_active=True)
        GiftCard.objects.create(code='GC-2', initial_balance=Decimal('5000'),
                                balance=Decimal('5000'), is_active=False)

        HappyHour.objects.create(name='Cerveja a metade', kind='PRICE', outlet=self.lounge,
                                 cells={'12': 1, '13': 1}, is_active=True)

        gluten = Allergen.objects.create(code='GL', name='Glúten')
        Allergen.objects.create(code='LA', name='Lactose')
        from pos.models import ItemPosProfile
        ItemPosProfile.objects.create(item=self.bife).allergens.add(gluten)

        tipo_rh = HRType.objects.create(code='SALA', name='Sala')
        rh = HumanResource.objects.create(code='RH1', first_name='Ana', last_name='Silva',
                                          hr_type=tipo_rh)
        HRCommission.objects.create(resource=rh, subfamily=sf_car, commission_type='PERCENT',
                                    value=Decimal('5'))

        # ── reservas de mesa
        r1 = POSReservation.objects.create(outlet=self.restaurante, guest_name='Família Dias',
                                           party_size=4, reserved_for=_dh(self.HOJE, 20),
                                           status='BOOKED')
        r2 = POSReservation.objects.create(outlet=self.restaurante, guest_name='Sr. Mendes',
                                           party_size=2, reserved_for=_dh(self.ONTEM, 19),
                                           status='SEATED')
        POSReservation.objects.create(outlet=self.restaurante, guest_name='Grupo Antigo',
                                      party_size=10, reserved_for=_dh(self.FORA, 19),
                                      status='BOOKED')
        self.reservas_mesa = (r1, r2)

        # ── eventos
        tipo_ev = EventType.objects.create(code='CAS', name='Casamento')
        estado = EventReservationState.objects.create(code='CONF', name='Confirmado')
        espaco = PosSector.objects.get(code='S-RST')
        EventRequest.objects.create(number='EV1', title='Casamento Silva', event_type=tipo_ev,
                                    space=espaco, state=estado, pax=50,
                                    price_per_pax=Decimal('6000'), extra_total=Decimal('50000'),
                                    start_at=_dh(self.HOJE, 18), end_at=_dh(self.HOJE, 23),
                                    customer=self.empresa_x)
        EventRequest.objects.create(number='EV0', title='Evento antigo', event_type=tipo_ev,
                                    space=espaco, state=estado, pax=10,
                                    price_per_pax=Decimal('1000'),
                                    start_at=_dh(self.FORA, 18), end_at=_dh(self.FORA, 23))

        # ── compras e inventário
        serie_compras = StockDocSeries.objects.create(code='CMP', name='Compras', kind='STOCK',
                                                      nature='PAYABLE', links_stock=True)
        serie_inv = StockDocSeries.objects.create(code='INV', name='Inventários', kind='INVENTORY',
                                                  links_stock=True)
        self.compra1 = StockDoc.objects.create(series=serie_compras, doc_date=self.HOJE,
                                               entity=self.empresa_x, warehouse=self.central,
                                               external_ref='FT-F/120', tax_included=True)
        StockDocLine.objects.create(doc=self.compra1, item=self.cerveja, quantity=Decimal('100'),
                                    unit_cost=Decimal('400'))
        self.compra2 = StockDoc.objects.create(series=serie_compras, doc_date=self.ONTEM,
                                               entity=self.empresa_y, warehouse=self.central,
                                               tax_included=True)
        StockDocLine.objects.create(doc=self.compra2, item=self.bife, quantity=Decimal('10'),
                                    unit_cost=Decimal('1500'))
        compra_anulada = StockDoc.objects.create(series=serie_compras, doc_date=self.HOJE,
                                                 entity=self.empresa_x, warehouse=self.central,
                                                 tax_included=True, voided=True)
        StockDocLine.objects.create(doc=compra_anulada, item=self.cerveja, quantity=Decimal('100'),
                                    unit_cost=Decimal('990'))
        compra_antiga = StockDoc.objects.create(series=serie_compras, doc_date=self.FORA,
                                                entity=self.empresa_x, warehouse=self.central,
                                                tax_included=True)
        StockDocLine.objects.create(doc=compra_antiga, item=self.cerveja, quantity=Decimal('100'),
                                    unit_cost=Decimal('770'))

        self.inv = StockDoc.objects.create(series=serie_inv, doc_date=self.HOJE,
                                           warehouse=self.central, posted=True,
                                           created_by='Ana')
        StockDocLine.objects.create(doc=self.inv, item=self.cerveja, quantity=Decimal('95'),
                                    theoretical_qty=Decimal('100'),
                                    theoretical_cost=Decimal('400'))
        StockDocLine.objects.create(doc=self.inv, item=self.bife, quantity=Decimal('10'),
                                    theoretical_qty=Decimal('10'),
                                    theoretical_cost=Decimal('1500'))
        inv_antigo = StockDoc.objects.create(series=serie_inv, doc_date=self.FORA,
                                             warehouse=self.central, posted=True)
        StockDocLine.objects.create(doc=inv_antigo, item=self.cerveja, quantity=Decimal('0'),
                                    theoretical_qty=Decimal('100'),
                                    theoretical_cost=Decimal('400'))

        # ── movimentos de stock (o consumo que a venda tirou do armazém)
        from inventory.models import StockMovement
        m1 = StockMovement.objects.create(warehouse=self.central, item=self.cerveja,
                                          movement_type='OUT', quantity=Decimal('9'),
                                          unit_cost=Decimal('400'), reference='T1/T2/T6')
        m2 = StockMovement.objects.create(warehouse=self.central, item=self.bife,
                                          movement_type='CONSUMPTION', quantity=Decimal('3'),
                                          unit_cost=Decimal('1500'), reference='T1/T3')
        m3 = StockMovement.objects.create(warehouse=self.central, item=self.cerveja,
                                          movement_type='OUT', quantity=Decimal('100'),
                                          unit_cost=Decimal('400'), reference='antigo')
        m4 = StockMovement.objects.create(warehouse=self.central, item=self.cerveja,
                                          movement_type='IN', quantity=Decimal('100'),
                                          unit_cost=Decimal('400'), reference='compra')
        _forcar(StockMovement, m1.pk, created_at=_dh(self.HOJE, 23))
        _forcar(StockMovement, m2.pk, created_at=_dh(self.ONTEM, 23))
        _forcar(StockMovement, m3.pk, created_at=_dh(self.FORA, 23))
        _forcar(StockMovement, m4.pk, created_at=_dh(self.HOJE, 9))

        # ── auditoria do POS e trilho do sistema
        a1 = POSAuditLog.objects.create(event_type='PAYMENT', description='Pagamento T1',
                                        operator_name='Ana', outlet=self.restaurante,
                                        reference='T1', amount=Decimal('10000'))
        a2 = POSAuditLog.objects.create(event_type='LINE_VOID', description='Linha anulada',
                                        operator_name='Ana', outlet=self.restaurante,
                                        reference='T6', amount=Decimal('4000'))
        a3 = POSAuditLog.objects.create(event_type='PAYMENT', description='Pagamento antigo',
                                        operator_name='Ana', outlet=self.restaurante,
                                        reference='T4', amount=Decimal('100000'))
        _forcar(POSAuditLog, a1.pk, created_at=_dh(self.HOJE, 12))
        _forcar(POSAuditLog, a2.pk, created_at=_dh(self.HOJE, 21))
        _forcar(POSAuditLog, a3.pk, created_at=_dh(self.FORA, 19))

        from core.audit_trail import AuditEvent
        AuditEvent.objects.create(at=_dh(self.HOJE, 9), action='CREATE', module='pos',
                                  entity='POSTicket', entity_id=str(self.t1.pk),
                                  label='Conta T1 aberta', user='ana')
        AuditEvent.objects.create(at=_dh(self.HOJE, 10), action='VIEW', module='fiscal',
                                  entity='FiscalDocument', label='Consulta de faturas',
                                  user='ana')
        AuditEvent.objects.create(at=_dh(self.HOJE, 11), action='EXPORT', module='pos',
                                  entity='Report', label='Vendas por artigo (CSV)',
                                  user='carla', ip_address='10.0.0.9')
        AuditEvent.objects.create(at=_dh(self.ONTEM, 23), action='UPDATE', module='pms',
                                  entity='Reservation', label='Reserva alterada', user='bruno')
        AuditEvent.objects.create(at=_dh(self.FORA, 9), action='EXPORT', module='pos',
                                  entity='Report', label='Exportação antiga', user='ana')

        from auth_engine.models import AuthEventLog
        e1 = AuthEventLog.objects.create(event_type='LOGIN_SUCCESS', identity_attempt='ana')
        e2 = AuthEventLog.objects.create(event_type='LOGIN_FAILED_PASSWORD',
                                         identity_attempt='ana')
        e3 = AuthEventLog.objects.create(event_type='LOGIN_FAILED_PIN', identity_attempt='x')
        e4 = AuthEventLog.objects.create(event_type='LOGIN_SUCCESS', identity_attempt='antigo')
        _forcar(AuthEventLog, e1.pk, timestamp=_dh(self.HOJE, 8))
        _forcar(AuthEventLog, e2.pk, timestamp=_dh(self.HOJE, 23, 50))
        _forcar(AuthEventLog, e3.pk, timestamp=_dh(self.ONTEM, 2))
        _forcar(AuthEventLog, e4.pk, timestamp=_dh(self.FORA, 8))

        # ── contas bancárias da empresa (saem no rodapé da fatura)
        from fiscal.models import CompanyBankAccount
        CompanyBankAccount.objects.create(bank_name='Banco BFA', account_number='123456',
                                          iban='AO06000600001234567890123', is_default=True,
                                          account_holder='Mwana Lodge, Lda.')
        CompanyBankAccount.objects.create(bank_name='Banco BIC', account_number='999',
                                          is_active=False)

        self._documentos_fiscais()
        self._o_hotel()

    # ───────────────────────────────── atalhos do cenário
    def _conta(self, numero, outlet, operador, dia, hora, minuto, estado, guests=1,
               total='0', desconto='0', sessao=None):
        from pos.models import POSTicket
        t = POSTicket.objects.create(
            ticket_number=numero, outlet=outlet, operator_name=operador, guests=guests,
            status=estado, grand_total=Decimal(total), subtotal=Decimal(total),
            discount_total=Decimal(desconto), cash_session=sessao,
            closed_at=(None if estado == 'OPEN' else _dh(dia, hora, minuto)))
        _forcar(POSTicket, t.pk, opened_at=_dh(dia, max(hora - 1, 0), minuto))
        t.refresh_from_db()
        return t

    def _linha(self, conta, artigo, qtd, preco, void=False, motivo=None, desconto=0):
        from pos.models import POSTicketLine
        return POSTicketLine.objects.create(
            ticket=conta, item=artigo, description=artigo.name, quantity=Decimal(str(qtd)),
            unit_price=Decimal(preco), tax_percentage=artigo.tax_percentage,
            discount_percent=Decimal(str(desconto)), is_void=void, void_reason=motivo)

    def _pagar(self, conta, metodo, valor, dia, hora, minuto, **extra):
        from pos.models import POSTicketPayment
        p = POSTicketPayment.objects.create(ticket=conta, payment_method=metodo,
                                            amount=Decimal(valor), **extra)
        _forcar(POSTicketPayment, p.pk, created_at=_dh(dia, hora, minuto))
        return p

    def _documentos_fiscais(self):
        """OS DOCUMENTOS passam pelo motor fiscal a sério (assinados e encadeados).

        Inventá-los à mão com um `objects.create` escondia justamente o que se
        quer auditar: o que o motor faz a uma fatura ANULADA e a uma fatura
        REGULARIZADA POR NOTA DE CRÉDITO — os dois casos em que o relatório de
        vendas não pode continuar a contar o dinheiro.
        """
        from fiscal import services
        from fiscal.models import FiscalDocument, FiscalSeries

        def serie(codigo):
            return FiscalSeries.objects.filter(doc_type__code=codigo, is_active=True).first()

        def emitir(codigo, valor, dia, **kw):
            return services.issue_document(
                serie(codigo).id, lines=[{'description': 'Consumo no restaurante',
                                          'quantity': 1, 'unit_price': Decimal(valor),
                                          'tax_percentage': Decimal('14')}],
                doc_date=dia, tax_inclusive=False, source_module='pos',
                operator_name='Ana', user='ana', **kw)

        self.doc_normal = emitir('FR', '10000', self.HOJE, settled=True)
        self.doc_por_receber = emitir('FT', '4000', self.ONTEM,
                                      customer=self.empresa_x, customer_name='Empresa X',
                                      customer_tax_id='5401234567')
        self.doc_anulado = emitir('FR', '5000', self.HOJE)
        services.void_document(self.doc_anulado.id, reason='Erro do operador', user='ana')
        self.doc_anulado.refresh_from_db()

        self.doc_creditado = emitir('FR', '2000', self.HOJE)
        self.nota_credito = services.create_credit_note(self.doc_creditado.id,
                                                        reason='Cliente devolveu', user='ana')
        self.doc_creditado.refresh_from_db()

        self.doc_antigo = emitir('FT', '50000', self.FORA)
        # Um documento do PMS: o relatório de Facturação do POS é do POS.
        self.doc_pms = services.issue_document(
            serie('FT').id, lines=[{'description': 'Alojamento', 'quantity': 1,
                                    'unit_price': Decimal('7000'),
                                    'tax_percentage': Decimal('14')}],
            doc_date=self.HOJE, tax_inclusive=False, source_module='pms', user='ana')
        self.FiscalDocument = FiscalDocument

    def _o_hotel(self):
        """A CASA CHEIA do lado do alojamento — quartos, estadias e contas."""
        from mdm.models import Customer
        from identity.models import Building, Floor
        from pms.models import (BookingPayment, Folio, FolioCharge,
                                HousekeepingTask, Reservation, Room, RoomType)

        bloco = Building.objects.create(hotel=self.hotel, code='A', name='Edifício Principal')
        piso = Floor.objects.create(building=bloco, number=1, name='1.º piso')
        self.std = RoomType.objects.create(hotel=self.hotel, code='STD', name='Standard',
                                           base_rate=Decimal('25000'))
        self.sui = RoomType.objects.create(hotel=self.hotel, code='SUI', name='Suite',
                                           base_rate=Decimal('60000'))
        self.q101 = Room.objects.create(hotel=self.hotel, room_type=self.std, number='101',
                                        floor=piso, status='OCCUPIED')
        self.q102 = Room.objects.create(hotel=self.hotel, room_type=self.std, number='102',
                                        floor=piso, status='VACANT_CLEAN')
        self.q103 = Room.objects.create(hotel=self.hotel, room_type=self.std, number='103',
                                        floor=piso, status='VACANT_DIRTY')
        self.q201 = Room.objects.create(hotel=self.hotel, room_type=self.sui, number='201',
                                        floor=piso, status='OCCUPIED')
        # Quarto DESATIVADO (em obras): não é capacidade da casa — não pode entrar
        # no denominador da ocupação.
        Room.objects.create(hotel=self.hotel, room_type=self.std, number='104', floor=piso,
                            is_active=False, status='OUT_OF_ORDER')

        g1 = Customer.objects.create(code='H001', name='Ana Silva')
        g2 = Customer.objects.create(code='H002', name='Bruno Costa')
        g3 = Customer.objects.create(code='H003', name='Clara Dias')
        g4 = Customer.objects.create(code='H004', name='David Eva')
        g5 = Customer.objects.create(code='H005', name='Eva Nunes')
        g6 = Customer.objects.create(code='H006', name='Grupo Antigo')

        def reserva(conf, hospede, quarto, tipo, ci, co, estado, tarifa, origem='DIRECT'):
            return Reservation.objects.create(
                hotel=self.hotel, confirmation=conf, guest=hospede, room=quarto, room_type=tipo,
                check_in=ci, check_out=co, status=estado, rate=Decimal(tarifa), source=origem,
                adults=2)

        self.res_a = reserva('RA', g1, self.q101, self.std, self.ONTEM,
                             self.HOJE + timedelta(days=1), 'CHECKED_IN', '25000')
        self.res_b = reserva('RB', g2, self.q201, self.sui, self.HOJE,
                             self.HOJE + timedelta(days=1), 'CHECKED_IN', '60000', 'ONLINE')
        self.res_cancelada = reserva('RC', g3, self.q102, self.std, self.HOJE,
                                     self.HOJE + timedelta(days=2), 'CANCELLED', '25000')
        self.res_noshow = reserva('RD', g4, self.q103, self.std, self.ONTEM, self.HOJE,
                                  'NO_SHOW', '25000')
        # Estadia LONGA, a atravessar o período: é o caso que distingue "noites
        # vendidas no período" de "noites da estadia inteira".
        self.res_longa = reserva('RF', g5, self.q102, self.std, self.HOJE - timedelta(days=5),
                                 self.HOJE + timedelta(days=5), 'CHECKED_IN', '10000', 'BLOCK')
        self.res_antiga = reserva('RE', g6, self.q103, self.std, self.FORA,
                                  self.FORA + timedelta(days=2), 'CHECKED_OUT', '20000')

        self.folio_a = Folio.objects.create(reservation=self.res_a, number='F-RA', status='OPEN')
        self.folio_b = Folio.objects.create(reservation=self.res_b, number='F-RB', status='CLOSED')

        def encargo(folio, tipo, valor, dia, hora, void=False):
            c = FolioCharge.objects.create(folio=folio, charge_type=tipo, amount=Decimal(valor),
                                           description=tipo, is_void=void)
            _forcar(FolioCharge, c.pk, created_at=_dh(dia, hora))
            return c

        encargo(self.folio_a, 'ROOM', '25000', self.HOJE, 3)
        encargo(self.folio_a, 'FNB', '8000', self.HOJE, 21)
        encargo(self.folio_a, 'PAYMENT', '20000', self.HOJE, 22)
        encargo(self.folio_a, 'MISC', '5000', self.HOJE, 22, void=True)
        encargo(self.folio_b, 'ROOM', '25000', self.FORA, 3)

        bp1 = BookingPayment.objects.create(reservation=self.res_b, amount=Decimal('30000'),
                                            status='PAID', method='GATEWAY', reference='MC-1',
                                            posted_to_folio=True)
        bp2 = BookingPayment.objects.create(reservation=self.res_cancelada,
                                            amount=Decimal('10000'), status='PENDING',
                                            method='TRANSFER', reference='MC-2')
        bp3 = BookingPayment.objects.create(reservation=self.res_antiga, amount=Decimal('50000'),
                                            status='PAID', method='GATEWAY')
        _forcar(BookingPayment, bp1.pk, created_at=_dh(self.HOJE, 7))
        _forcar(BookingPayment, bp2.pk, created_at=_dh(self.HOJE, 8))
        _forcar(BookingPayment, bp3.pk, created_at=_dh(self.FORA, 8))

        HousekeepingTask.objects.create(hotel=self.hotel, room=self.q101,
                                        title='Limpeza de saída', status='PENDING')
        HousekeepingTask.objects.create(hotel=self.hotel, room=self.q101,
                                        title='Repor minibar', status='IN_PROGRESS')
        HousekeepingTask.objects.create(hotel=self.hotel, room=self.q201,
                                        title='Limpeza feita', status='DONE')

    # ───────────────────────────────── atalhos dos testes
    def catalogo(self):
        r = self.client.get('/api/pos/reports/catalog/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.data

    def pedir(self, code, detalhe='Sim', **params):
        """O pedido cru — devolve a resposta HTTP, sem exigir que tenha corrido.

        `raise_request_exception=False` é o que faz o teste ver o que o OPERADOR
        vê: em produção, uma exceção dentro de um relatório sai como HTTP 500
        ("erro interno") e não como um traceback. Sem isto, o cliente de testes
        volta a levantar a exceção e um relatório estragado parece um teste
        estragado.
        """
        params.setdefault('detailed', detalhe)
        antes = self.client.raise_request_exception
        self.client.raise_request_exception = False
        try:
            return self.client.post('/api/pos/reports/run/',
                                    {'code': code, 'params': params}, format='json')
        finally:
            self.client.raise_request_exception = antes

    def correr(self, code, detalhe='Sim', **params):
        """Corre o relatório PELA PORTA DO ECRÃ (/api/pos/reports/run/)."""
        r = self.pedir(code, detalhe, **params)
        self.assertEqual(r.status_code, 200,
                         f'O relatório {code} não abriu (HTTP {r.status_code}): '
                         f'{r.content[:400]}')
        return r.data

    def periodo(self, code, **params):
        return self.correr(code, **{'from': str(self.ONTEM), 'to': str(self.HOJE), **params})

    def linha(self, dados, coluna, valor):
        """A linha em que `coluna` vale `valor` — e uma mensagem útil se não existir."""
        for r in dados['rows']:
            if str(r.get(coluna)) == str(valor):
                return r
        self.fail(f'Não há linha com {coluna}={valor!r} em {dados.get("title")}. '
                  f'Linhas: {dados["rows"]}')

    def total(self, dados, chave):
        return Decimal(str(dados['totals'].get(chave, '0')))

    def soma(self, dados, coluna):
        return sum((Decimal(str(r.get(coluna) or 0)) for r in dados['rows']), Decimal('0'))


# ══════════════════════════════════════════════════════════════════════════════
# 1 · O INVENTÁRIO — o que o Centro promete
# ══════════════════════════════════════════════════════════════════════════════
class InventarioDoCentroTests(CasaCheia):

    def test_o_catalogo_oferece_as_pastas_do_negocio_e_todos_os_relatorios(self):
        cat = self.catalogo()
        pastas = cat['folders']
        total = sum(len(f['reports']) for f in pastas)
        self.assertEqual(len(pastas), 19,
                         f'O Centro de Relatórios tinha 19 pastas (16 do POS + 3 do PMS) e '
                         f'passou a ter {len(pastas)}: '
                         f'{[f["code"] for f in pastas]}. Uma pasta que desaparece é um '
                         f'conjunto de relatórios que o dono deixa de encontrar.')
        self.assertEqual(total, 51,
                         f'O catálogo tinha 51 relatórios e tem {total}. Se foi de propósito, '
                         f'este número atualiza-se; se não, alguém perdeu um relatório pelo '
                         f'caminho (ou duplicou um código).')

    def test_cada_relatorio_diz_o_que_promete_e_com_que_parametros(self):
        for f in self.catalogo()['folders']:
            for r in f['reports']:
                self.assertTrue(r['name'].strip(),
                                f'Relatório {r["code"]} sem nome — na lista aparece uma linha '
                                f'em branco e ninguém sabe o que vai abrir.')
                chaves = [p['key'] for p in r['params']]
                self.assertIn('detailed', chaves,
                              f'{r["code"]} não pergunta "Incluir detalhes?" — é a pergunta '
                              f'que TODO o relatório faz antes de abrir (pos/reports.py: '
                              f'catalog() acrescenta-a a todos).')

    def test_nenhum_relatorio_do_catalogo_rebenta_com_a_casa_cheia(self):
        """UM RELATÓRIO QUE REBENTA é um ecrã que diz "erro interno".

        Com dados a sério em todas as tabelas, os 51 têm de abrir e devolver
        colunas. É o teste mais barato do Centro e o que apanha mais estragos:
        um campo que mudou de nome num modelo rebenta aqui, não em produção.
        """
        # NENHUM. `fb_quebras` rebentava com AttributeError (`StockDoc` não tem
        # `responsible`) e está corrigido — ver
        # `test_as_quebras_de_inventario_abrem_quando_ha_quebras`. Este conjunto
        # fica VAZIO de propósito: qualquer relatório que passe a rebentar torna
        # este teste vermelho, que é o que se quer.
        REBENTAM_HOJE = set()
        rebentaram, vazios = [], []
        for f in self.catalogo()['folders']:
            for r in f['reports']:
                resp = self.pedir(r['code'])
                if resp.status_code != 200:
                    rebentaram.append((r['code'], resp.status_code))
                    continue
                d = resp.data
                self.assertTrue(d['columns'],
                                f'{r["code"]} ({r["name"]}) abriu sem colunas nenhumas — '
                                f'o ecrã mostra uma grelha vazia.')
                if not d['rows']:
                    vazios.append(r['code'])
        self.assertEqual(
            {c for c, _ in rebentaram}, REBENTAM_HOJE,
            f'Mudou a lista dos relatórios que REBENTAM: {rebentaram} '
            f'(conhecidos: {sorted(REBENTAM_HOJE)}). Cada um destes é um ecrã que '
            f'diz "erro interno" ao contabilista.')
        self.assertEqual(
            vazios, [],
            f'Estes relatórios não trouxeram UMA linha num dia de casa cheia: {vazios}. '
            f'Ou o cenário não lhes dá dados, ou o filtro deles está a excluir tudo — '
            f'em qualquer dos casos, o dono abre e vê "Não foram encontrados dados".')

    def test_o_catalogo_anuncia_as_colunas_de_cada_relatorio(self):
        """O ecrã oferece "agrupar por <coluna>" ANTES de o relatório correr: as
        colunas vêm no catálogo (pos/reports.py:_columns_of, que corre o relatório
        com um período de 1900). Um relatório que rebente nesse arranque fica sem
        colunas no catálogo — e o agrupamento desaparece do ecrã sem avisar."""
        sem = [r['code'] for f in self.catalogo()['folders'] for r in f['reports']
               if not r['columns']]
        self.assertEqual(sem, [],
                         f'Sem colunas anunciadas no catálogo: {sem}. '
                         f'(_columns_of engole a exceção: se um destes rebenta com o período '
                         f'de 1900, ninguém dá por isso.)')

    def test_o_relatorio_que_nao_existe_responde_404_e_nao_500(self):
        r = self.client.post('/api/pos/reports/run/',
                             {'code': 'nao_existe', 'params': {}}, format='json')
        self.assertEqual(r.status_code, 404,
                         'Um código de relatório desconhecido tem de dar 404 com explicação, '
                         'não um erro interno.')

    def test_o_relatorio_sai_com_a_identificacao_da_empresa_para_se_poder_imprimir(self):
        d = self.periodo('rec_dia')
        self.assertEqual(d['company'], 'Mwana Lodge, Lda.')
        self.assertEqual(d['tax_id'], '5000000000',
                         'Sem NIF no cabeçalho, o papel impresso não identifica a empresa.')
        self.assertEqual(d['user'], 'dono_relatorios',
                         'O relatório impresso tem de dizer QUEM o tirou.')
        self.assertTrue(d['title'] and d['folder'],
                        'Sem título e pasta, o papel que sai da impressora não se identifica.')


# ══════════════════════════════════════════════════════════════════════════════
# 2 · OS NÚMEROS — a pergunta que um relatório que "abre" não responde
# ══════════════════════════════════════════════════════════════════════════════
#
# O cenário, para se poder conferir à mão sem o reler todo:
#
#   T1  HOJE   Restaurante  Ana    PAGA        10 000  (2 bifes 4 000 + 2 cervejas 1 000)
#   T2  HOJE   Lounge       Bruno  PAGA         5 000  (5 cervejas 1 000)
#   T3  ONTEM  Restaurante  Ana    PAGA         4 000  (1 bife 4 000)
#   T4  -40d   Restaurante  Ana    PAGA       100 000  ← FORA DO PERÍODO
#   T5  HOJE   Restaurante  Ana    ABERTA       4 000  ← ainda não é receita
#   T6  HOJE   Restaurante  Ana    PAGA         1 000  (1 cerveja + 1 bife ANULADO
#                                                       + 1 cerveja OFERECIDA)
#   T7  HOJE   Restaurante  Carla  ESTORNADA    8 000  ← o dinheiro voltou
#
# RECEITA DO PERÍODO (ONTEM..HOJE) = 10 000 + 5 000 + 4 000 + 1 000 = 20 000 Kz.
#
# Esse 20 000 é o número que TODOS os caminhos têm de dar: por dia, por artigo,
# por família, por operador, por sector, por hora e por meio de pagamento. Um
# relatório que dê outro número está a mentir a alguém — e cada uma das quatro
# contas de fora (T4, T5, T6 anulada/oferta, T7) é uma maneira diferente de
# mentir.
class OsNumerosBatemTests(CasaCheia):

    RECEITA = Decimal('20000')

    def test_o_dia_soma_o_que_se_vendeu_e_so_isso(self):
        d = self.periodo('rec_dia')
        self.assertEqual(self.total(d, 'total'), self.RECEITA,
                         'A receita do período não é 20 000 Kz. É a soma das quatro contas '
                         'PAGAS do período (10 000 + 5 000 + 4 000 + 1 000) — e de mais '
                         'nenhuma.')
        self.assertEqual(d['totals']['tickets'], 4,
                         'Quatro contas pagas no período. Cinco significa que a aberta, a '
                         'estornada ou a de fora entrou na conta.')
        hoje = self.linha(d, 'date', self.HOJE)
        self.assertEqual(Decimal(hoje['total']), Decimal('16000'))
        self.assertEqual(hoje['pax'], 5, 'Pax de hoje: 2 (T1) + 1 (T2) + 2 (T6) = 5.')
        self.assertEqual(Decimal(hoje['avg']), Decimal('5333.33'),
                         'Ticket médio de hoje: 16 000 / 3 contas.')
        ontem = self.linha(d, 'date', self.ONTEM)
        self.assertEqual(Decimal(ontem['total']), Decimal('4000'))

    def test_a_conta_de_fora_do_periodo_nao_entra_em_relatorio_nenhum(self):
        """T4 SÃO 100 000 Kz — cinco vezes a receita do período.

        É o erro mais comum e o mais caro: um relatório que esquece o filtro de
        datas não dá erro, dá um número enorme. Se algum destes falhar, o dono
        está a ver (e a declarar) receita de outro mês.
        """
        for code in ['rec_dia', 'rec_artigo', 'rec_familia', 'rec_operador', 'rec_sector',
                     'est_top', 'est_horas', 'cx_pagamentos']:
            d = self.periodo(code)
            total = self.total(d, 'total')
            self.assertEqual(total, self.RECEITA,
                             f'{code} deu {total} em vez de 20 000 Kz. Se deu 120 000, '
                             f'somou a conta T4 que é de há 40 dias — o filtro de período '
                             f'não está a ser aplicado.')

    def test_uma_conta_ainda_aberta_nao_e_receita(self):
        """T5 está ABERTA com 4 000 Kz. Contá-la é contar dinheiro que ainda
        está na mesa — e no fecho do dia o caixa não bate."""
        d = self.periodo('rec_dia')
        self.assertEqual(self.total(d, 'total'), self.RECEITA,
                         'A conta ABERTA (T5, 4 000 Kz) entrou na receita: se o total deu '
                         '24 000, o relatório conta contas que ainda não foram cobradas.')
        self.assertNotIn(Decimal('4000'), [Decimal(r['total']) for r in d['rows']
                                           if r['date'] == str(self.HOJE)])

    def test_uma_conta_estornada_nao_e_venda_nem_do_operador_que_a_fez(self):
        """T7 foram 8 000 Kz cobrados e devolvidos. Não é venda da casa — e, em
        particular, não é venda da Carla: quem estorna não ganha comissão."""
        d = self.periodo('rec_operador')
        operadores = {r['operator'] for r in d['rows']}
        self.assertNotIn('Carla', operadores,
                         'A Carla aparece nas vendas por operador, e a única conta dela '
                         '(T7) foi ESTORNADA. Isto paga comissão sobre dinheiro devolvido.')
        self.assertEqual(self.total(d, 'total'), self.RECEITA)
        pagos = self.periodo('cx_pagamentos')
        self.assertEqual(self.total(pagos, 'total'), self.RECEITA,
                         'O pagamento de 8 000 Kz da conta estornada continua a contar '
                         'como dinheiro recebido.')

    def test_a_linha_anulada_sai_das_vendas_e_entra_nas_anulacoes(self):
        """Um bife de 4 000 Kz anulado na conta T6: tem de sair das vendas do
        artigo E aparecer, pelo nome de quem o anulou, no relatório de linhas
        anuladas. Sair dos dois é esconder; ficar nos dois é somar a dobrar."""
        art = self.periodo('rec_artigo')
        bife = self.linha(art, 'code', 'A001')
        self.assertEqual(Decimal(bife['total']), Decimal('12000'),
                         'Bife: 2 em T1 (8 000) + 1 em T3 (4 000) = 12 000. Se deu 16 000, '
                         'a linha ANULADA de T6 continua a contar como venda.')
        self.assertEqual(Decimal(bife['qty']), Decimal('3'))

        anul = self.periodo('est_anulados')
        self.assertEqual(self.total(anul, 'value'), Decimal('4000'),
                         'O relatório de anulações tem de mostrar os 4 000 Kz anulados — '
                         'é onde se vê um empregado a anular vendas já cobradas.')
        l = anul['rows'][0]
        self.assertEqual(l['ticket'], 'T6')
        self.assertEqual(l['operator'], 'Ana',
                         'Uma anulação sem o nome de quem a fez não serve para nada.')
        self.assertEqual(l['reason'], 'Cliente desistiu',
                         'O motivo da anulação é o que o dono vai ler.')

    def test_uma_oferta_vale_zero_na_receita_e_o_preco_de_tabela_nas_ofertas(self):
        """A terceira cerveja de T6 foi oferecida (100% de desconto).

        São dois números diferentes e os dois importam: na receita vale 0 (não
        se cobrou), nas ofertas vale 1 000 Kz (é o que a casa deixou de cobrar,
        e é por aí que se percebe quanto custam as ofertas ao fim do mês). A
        QUANTIDADE conta nos dois: a garrafa saiu do bar.
        """
        art = self.periodo('rec_artigo')
        cerveja = self.linha(art, 'code', 'A002')
        self.assertEqual(Decimal(cerveja['total']), Decimal('8000'),
                         'Cerveja: 2 (T1) + 5 (T2) + 1 (T6) = 8 000 Kz cobrados; a '
                         'oferecida vale 0. Se deu 9 000, a oferta está a ser cobrada no '
                         'relatório e não foi cobrada ao cliente.')
        self.assertEqual(Decimal(cerveja['qty']), Decimal('9'),
                         'Nove garrafas saíram do bar (a oferecida também). A quantidade '
                         'é do armazém, não da caixa.')

        of = self.periodo('est_ofertas')
        self.assertEqual(self.total(of, 'value'), Decimal('1000.00'),
                         'A oferta vale o PREÇO DE TABELA (1 000 Kz) no relatório de '
                         'ofertas — se der 0, o dono nunca sabe quanto ofereceu.')
        self.assertEqual(of['rows'][0]['value'], '1000.00',
                         'O valor saía "1000.00000" (as casas da quantidade a multiplicar '
                         'pelas do preço) — num papel de contabilidade.')

    def test_cada_caminho_chega_ao_mesmo_total(self):
        """O TESTE QUE APANHA O QUE NENHUM OUTRO APANHA.

        A receita de um dia é UM número. Vista por dia, por artigo, por família,
        por sector, por operador, por hora ou por meio de pagamento, tem de dar
        sempre o mesmo. Quando dois caminhos divergem é porque um deles filtra
        diferente — e o dono fica com dois relatórios a dizerem coisas
        diferentes sobre o mesmo dia, sem saber em qual acreditar.
        """
        caminhos = {c: self.total(self.periodo(c), 'total')
                    for c in ['rec_dia', 'rec_artigo', 'rec_familia', 'rec_sector',
                              'rec_operador', 'est_top', 'est_horas', 'cx_pagamentos']}
        self.assertEqual(set(caminhos.values()), {self.RECEITA},
                         f'Os caminhos da receita divergem: {caminhos}. Todos têm de dar '
                         f'20 000 Kz — é o mesmo dinheiro visto de ângulos diferentes.')

    def test_as_vendas_repartem_se_certas_por_operador_sector_e_familia(self):
        op = self.periodo('rec_operador')
        self.assertEqual(Decimal(self.linha(op, 'operator', 'Ana')['total']), Decimal('15000'),
                         'Ana: T1 (10 000) + T3 (4 000) + T6 (1 000) = 15 000.')
        self.assertEqual(Decimal(self.linha(op, 'operator', 'Ana')['discount']), Decimal('500'),
                         'O desconto de 500 Kz dado em T1 é da Ana — é o número que trava '
                         'o empregado que desconta a amigos.')
        self.assertEqual(Decimal(self.linha(op, 'operator', 'Bruno')['total']), Decimal('5000'))

        sec = self.periodo('rec_sector')
        self.assertEqual(Decimal(self.linha(sec, 'outlet', 'Restaurante')['total']),
                         Decimal('15000'))
        self.assertEqual(Decimal(self.linha(sec, 'outlet', 'Lounge')['total']), Decimal('5000'),
                         'O Lounge vendeu as 5 cervejas de T2. Se vier 0, o relatório está '
                         'a pôr tudo no sector principal.')

        fam = self.periodo('rec_familia')
        comida = self.linha(fam, 'family', 'Comida')
        bebidas = self.linha(fam, 'family', 'Bebidas')
        self.assertEqual(Decimal(comida['total']), Decimal('12000'))
        self.assertEqual(Decimal(bebidas['total']), Decimal('8000'))
        self.assertEqual(comida['pct'], '60.0%',
                         '12 000 de 20 000 são 60% — a percentagem é do total do PERÍODO, '
                         'e se a conta de fora entrasse no denominador dava 10%.')
        self.assertEqual(bebidas['pct'], '40.0%')

    def test_as_horas_agrupam_pela_hora_de_luanda(self):
        """O relatório de horas de ponta decide turnos e escalas. Agrupar em UTC
        punha o jantar de Luanda (20h) à meia-noite — e a casa punha gente a
        trabalhar à hora errada."""
        d = self.periodo('est_horas')
        self.assertEqual(Decimal(self.linha(d, 'hour', '12:00')['total']), Decimal('10000'),
                         'T1 fechou às 12:30 de Luanda. Se aparecer às 11:00, o relatório '
                         'está a agrupar em UTC.')
        self.assertEqual(Decimal(self.linha(d, 'hour', '20:00')['total']), Decimal('5000'))
        self.assertEqual(Decimal(self.linha(d, 'hour', '21:00')['total']), Decimal('1000'))

    def test_o_dinheiro_reparte_se_pelos_meios_de_pagamento_que_o_receberam(self):
        d = self.periodo('cx_pagamentos')
        din = self.linha(d, 'method', 'Dinheiro')
        self.assertEqual(Decimal(din['total']), Decimal('11000'),
                         'Dinheiro: T1 (10 000) + T6 (1 000). Os 8 000 de T7 foram '
                         'devolvidos e não estão na gaveta.')
        self.assertEqual(din['count'], 2)
        self.assertEqual(din['pct'], '55.0%')
        self.assertEqual(Decimal(self.linha(d, 'method', 'Multibanco')['total']),
                         Decimal('5000'))
        self.assertEqual(Decimal(self.linha(d, 'method', 'Transferência')['total']),
                         Decimal('4000'))

    def test_o_caixa_fecha_com_as_vendas_das_contas_que_lhe_pertencem(self):
        """A sessão de caixa tem quatro contas: T1 (paga), T5 (aberta), T6
        (paga) e T7 (estornada). Fecha com 11 000 Kz — e é por este número que
        o operador responde ao entregar a gaveta."""
        d = self.periodo('cx_sessoes')
        self.assertEqual(self.total(d, 'sales'), Decimal('11000'),
                         'O caixa tem de fechar com 11 000 Kz (T1 + T6). Se der 23 000, '
                         'está a pedir contas ao operador por uma conta ainda aberta e por '
                         'outra que foi devolvida.')
        linha = d['rows'][0]
        self.assertEqual(Decimal(linha['float']), Decimal('10000.00'),
                         'O fundo de caixa com que a sessão abriu.')
        self.assertEqual(linha['operator'], 'Ana')

    def test_os_movimentos_de_caixa_do_periodo_e_so_do_periodo(self):
        d = self.periodo('cx_movimentos')
        self.assertEqual(len(d['rows']), 2,
                         'Dois movimentos hoje (sangria de 3 000 e reforço de 1 000). Três '
                         'significa que a sangria de 50 000 de há 40 dias entrou.')
        self.assertEqual(self.total(d, 'amount'), Decimal('4000.00'))

    def test_a_conta_corrente_mostra_a_divida_e_o_adiantamento_separados(self):
        """São dois dinheiros em sentidos contrários e não se somam: a Empresa X
        DEVE 4 560 Kz (a factura por receber) e TEM 30 000 Kz adiantados. Juntar
        os dois dava um cliente com saldo a favor que ainda deve uma factura."""
        d = self.periodo('cc_saldos')
        x = self.linha(d, 'name', 'Empresa X')
        self.assertEqual(Decimal(x['balance']), Decimal('4560.00'),
                         'A dívida da Empresa X é a factura FT por receber (4 000 + IVA).')
        self.assertEqual(Decimal(x['advance']), Decimal('30000'),
                         'Adiantamento: 50 000 entrados menos 20 000 usados.')


# ══════════════════════════════════════════════════════════════════════════════
# 3 · FACTURAÇÃO — o relatório que a AGT pode pedir
# ══════════════════════════════════════════════════════════════════════════════
#
# Os documentos do cenário (todos emitidos pelo motor fiscal a sério):
#
#   FT A/1  ONTEM   4 000 + 560    Empresa X, POR RECEBER
#   FR A/1  HOJE   10 000 + 1 400  liquidada
#   FR A/2  HOJE    5 000 + 700    ANULADA
#   FR A/3  HOJE    2 000 + 280    regularizada por nota de crédito
#   NC A/1  HOJE    2 000 + 280    a nota de crédito de FR A/3
#   FT      -40d   50 000          fora do período
#
# INCIDÊNCIA DO PERÍODO = 4 000 + 10 000 + 2 000 − 2 000 = 14 000 Kz
# IVA LIQUIDADO         =   560 +  1 400 +   280 −   280 =  1 960 Kz
#
# A anulada não entra (não houve venda) e a regularizada entra com a sua nota de
# crédito a subtrair (houve venda e desfez-se). É este 1 960 Kz que se paga ao
# Estado: declarar 2 240 é pagar imposto sobre uma venda que voltou atrás.
class OIvaQueSePagaTests(CasaCheia):

    def test_o_mapa_de_iva_declara_o_que_se_vendeu_menos_o_que_se_regularizou(self):
        d = self.periodo('fat_iva')
        self.assertEqual(self.total(d, 'base'), Decimal('14000'),
                         'A incidência do período é 14 000 Kz (4 000 + 10 000 + 2 000 − '
                         '2 000 da nota de crédito). 16 000 significa que a nota de '
                         'crédito não está a subtrair; 18 000, que está a somar.')
        self.assertEqual(self.total(d, 'tax'), Decimal('1960'),
                         'IVA a entregar: 1 960 Kz. Declarar 2 240 é pagar imposto sobre '
                         'uma venda que foi anulada por nota de crédito.')
        self.assertEqual(len(d['rows']), 1,
                         'Uma linha por TAXA. Duas linhas a 14% (uma das vendas, outra das '
                         'retificações) é um mapa que o contabilista não consegue copiar '
                         'para a declaração.')

    def test_a_nota_de_credito_existe_para_os_relatorios_do_pos(self):
        """ERA O DEFEITO DA RAIZ: a nota de crédito nascia com
        `source_module='void'` (fiscal/services.py) e TODOS os relatórios do POS
        procuram `source_module='pos'`. Resultado: as notas de crédito não
        existiam para o POS — nem na lista de documentos, nem no mapa de IVA,
        nem no relatório de anulações, nem no SAF-T."""
        self.assertEqual(self.nota_credito.source_module, 'pos',
                         'A nota de crédito tem de pertencer ao módulo da factura que '
                         'anula, senão desaparece de todos os relatórios desse módulo.')
        d = self.periodo('fat_documentos')
        nc = self.linha(d, 'type', 'NC')
        self.assertEqual(nc['ref'] if 'ref' in nc else self.nota_credito.reference_doc,
                         self.doc_creditado.invoice_no,
                         'A nota de crédito tem de dizer QUE factura retifica.')

    def test_a_lista_de_documentos_mostra_todos_e_soma_so_a_receita(self):
        """A lista mostra TODOS os papéis emitidos — a AGT exige-o, inclusive os
        anulados. Mas o rodapé é RECEITA: o anulado vale 0 e a nota de crédito
        subtrai. Somar os papéis dava 23 940 Kz de vendas num dia em que a casa
        facturou 15 960."""
        d = self.periodo('fat_documentos')
        numeros = {r['invoice_no'] for r in d['rows']}
        self.assertEqual(len(d['rows']), 5,
                         f'Cinco documentos no período (FT, FR x3, NC) e apareceram '
                         f'{len(d["rows"])}: {sorted(numeros)}. Falta algum documento à '
                         f'lista que se entrega a quem fiscaliza.')
        self.assertIn(self.doc_antigo.invoice_no, [r['invoice_no'] for r in
                                                   self.correr('fat_documentos',
                                                               **{'from': str(self.FORA),
                                                                  'to': str(self.HOJE)})['rows']],
                      'O documento antigo tem de aparecer quando se pede o período dele.')
        self.assertNotIn(self.doc_antigo.invoice_no, numeros,
                         'O documento de há 40 dias apareceu no período de ontem e hoje.')
        self.assertEqual(self.total(d, 'gross'), Decimal('15960.00'),
                         'Facturação do período: 11 400 + 4 560 + 2 280 (regularizada) − '
                         '2 280 (nota de crédito) + 0 (anulada) = 15 960 Kz.')
        self.assertEqual(self.total(d, 'net'), Decimal('14000.00'),
                         'A incidência no rodapé da lista tem de ser a MESMA do mapa de '
                         'IVA (14 000 Kz) — são dois relatórios sobre os mesmos documentos.')
        self.assertEqual(self.total(d, 'net'),
                         self.total(self.periodo('fat_iva'), 'base'),
                         'A lista de documentos e o mapa de IVA divergem na incidência do '
                         'mesmo período.')

    def test_cada_linha_diz_quanto_pesa_no_total_para_o_ecra_nao_desfazer_a_conta(self):
        """O CONTRATO ENTRE O RELATÓRIO E A GRELHA.

        A grelha do ecrã NÃO usa o `totals` que o servidor manda: recalcula os
        totais sobre as linhas que passam nos filtros, porque o rodapé tem de
        falar do que está à vista. Isso é bom — e desfazia esta conta: somava a
        factura anulada e a nota de crédito como se fossem vendas, e o rodapé
        que o contabilista lê voltava a mostrar 23 940 Kz num dia de 15 960.

        Por isso o peso viaja NA LINHA (`_peso`: 1 normal, 0 anulada, −1
        retificativa) e a grelha multiplica por ele
        (frontend/src/components/posconfig/ReportGrid.tsx). Se alguém tirar este
        campo, o ecrã volta a mentir sem que nenhum outro teste note.
        """
        d = self.periodo('fat_documentos')
        pesos = {r['invoice_no']: r.get('_peso') for r in d['rows']}
        self.assertEqual(pesos[self.doc_anulado.invoice_no], 0,
                         'Uma factura ANULADA tem de pesar 0 no total do ecrã.')
        self.assertEqual(pesos[self.nota_credito.invoice_no], -1,
                         'Uma NOTA DE CRÉDITO tem de pesar −1: devolve dinheiro.')
        self.assertEqual(pesos[self.doc_normal.invoice_no], 1)
        self.assertEqual(pesos[self.doc_creditado.invoice_no], 1,
                         'A factura regularizada pesa 1 (foi emitida); é a nota de crédito '
                         'que a desconta. Pô-la a 0 descontava a venda duas vezes.')

        # O total que o servidor manda tem de ser o mesmo que a grelha calcula
        # ao multiplicar cada linha pelo seu peso — senão os dois divergem e o
        # ecrã mostra um número diferente do relatório impresso.
        for coluna in ('gross', 'net', 'tax'):
            como_o_ecra_soma = sum((Decimal(str(r['_peso'])) * Decimal(r[coluna])
                                    for r in d['rows']), Decimal('0'))
            self.assertEqual(self.total(d, coluna), como_o_ecra_soma,
                             f'O total de "{coluna}" que o servidor manda ({self.total(d, coluna)}) '
                             f'não é o que a grelha vai calcular ({como_o_ecra_soma}).')

    def test_o_estado_distingue_uma_venda_boa_de_uma_que_voltou_atras(self):
        """Uma factura regularizada por nota de crédito fica com estado NORMAL
        (é o que a AGT espera), e por isso aparecia na lista como "Liquidado" —
        igual a uma venda boa. Quem lia a lista via dinheiro que já tinha
        voltado ao cliente."""
        d = self.periodo('fat_documentos')
        estados = {r['invoice_no']: r['status'] for r in d['rows']}
        self.assertEqual(estados[self.doc_anulado.invoice_no], 'Anulado')
        self.assertEqual(estados[self.doc_creditado.invoice_no], 'Regularizado por NC',
                         f'A factura anulada por nota de crédito aparece como '
                         f'"{estados[self.doc_creditado.invoice_no]}" — indistinguível de '
                         f'uma venda cobrada.')
        self.assertEqual(estados[self.nota_credito.invoice_no], 'Nota de crédito')
        self.assertEqual(estados[self.doc_normal.invoice_no], 'Liquidado')
        self.assertEqual(estados[self.doc_por_receber.invoice_no], 'Por receber')

    def test_as_anulacoes_mostram_as_duas_formas_de_desfazer_uma_venda(self):
        """O relatório chama-se "Anulações e notas de crédito" e não mostrava
        uma única nota de crédito. São as duas formas legais de desfazer uma
        venda em Angola, e quem audita tem de ver as duas no mesmo papel."""
        d = self.periodo('fat_anulacoes')
        tipos = {r['invoice_no']: r['type'] for r in d['rows']}
        self.assertIn(self.doc_anulado.invoice_no, tipos)
        self.assertIn(self.nota_credito.invoice_no, tipos,
                      'A nota de crédito não aparece no relatório de anulações.')
        self.assertEqual(self.total(d, 'gross'), Decimal('7980.00'),
                         'Desfez-se 5 700 (anulada) + 2 280 (nota de crédito) = 7 980 Kz.')
        nc = self.linha(d, 'invoice_no', self.nota_credito.invoice_no)
        self.assertEqual(nc['ref'], self.doc_creditado.invoice_no,
                         'Uma nota de crédito sem a factura que retifica não se audita.')

    def test_o_saft_do_pos_leva_as_notas_de_credito(self):
        """O SAF-T é o ficheiro que se entrega à AGT. Saía com a venda e SEM a
        nota de crédito que a desfez — declarava receita (e IVA) a mais do que o
        devido. O gerador já sabia tratar uma NC (vai a TotalDebit, não a
        TotalCredit); nunca lha chegava nenhuma, porque o filtro é por módulo.
        """
        from fiscal.saft import generate_saft
        xml = generate_saft(self.ONTEM, self.HOJE, module='pos')
        self.assertIn(self.nota_credito.invoice_no, xml,
                      'A nota de crédito não está no SAF-T do POS. O ficheiro declara a '
                      'venda e não a sua anulação.')
        # O SAF-T soma pelo VALOR SEM IMPOSTO das linhas (é a convenção: o IVA
        # vai no `TaxPayable` de cada documento, não nos totais da secção).
        self.assertIn('<TotalDebit>2000.00</TotalDebit>', xml,
                      'A nota de crédito tem de entrar no SAF-T como DÉBITO à receita '
                      '(convenção SAF-T), não como mais uma venda. Se o TotalDebit for '
                      '0.00, a NC está a ser declarada como receita.')
        self.assertIn('<TotalCredit>16000.00</TotalCredit>', xml,
                      'Crédito declarado: 10 000 + 4 000 + 2 000 (a anulada não conta). '
                      'Menos o débito de 2 000 da nota de crédito, dá os mesmos 14 000 Kz '
                      'de incidência do mapa de IVA — o SAF-T e o relatório têm de dizer '
                      'o mesmo à AGT.')
        self.assertIn('<DebitAmount>2000.00</DebitAmount>', xml,
                      'A linha da nota de crédito tem de ser um DebitAmount; um '
                      'CreditAmount fazia dela uma venda.')
        self.assertIn(self.doc_anulado.invoice_no, xml,
                      'Um documento anulado também vai no SAF-T — não se apaga, declara-se '
                      'como anulado.')
        self.assertNotIn(self.doc_antigo.invoice_no, xml,
                         'O documento de fora do período entrou no SAF-T do período.')
        self.assertNotIn(self.doc_pms.invoice_no, xml,
                         'O SAF-T do POS levou um documento do alojamento.')


# ══════════════════════════════════════════════════════════════════════════════
# 4 · ARMAZÉM E COMPRAS — o dinheiro que não está na caixa
# ══════════════════════════════════════════════════════════════════════════════
class OArmazemContaCertoTests(CasaCheia):

    def test_as_quebras_de_inventario_abrem_quando_ha_quebras(self):
        """REBENTAVA EXATAMENTE QUANDO ERA ÚTIL.

        O relatório lia `d.responsible`, um campo que `StockDoc` não tem. Mas a
        leitura estava dentro do `if dif:` — só se chegava lá quando havia uma
        diferença. Um inventário perfeito abria; o dia em que faltavam cinco
        cervejas, o relatório das quebras dizia "erro interno".
        """
        d = self.periodo('fb_quebras')
        self.assertEqual(len(d['rows']), 1,
                         'Uma quebra no inventário de hoje: faltaram 5 cervejas (contaram-se '
                         '95 onde deviam estar 100). O bife bateu certo e não é quebra.')
        l = d['rows'][0]
        self.assertEqual(Decimal(l['diff']), Decimal('-5.000'))
        self.assertEqual(Decimal(l['value']), Decimal('-2000.00'),
                         '5 cervejas a 400 Kz de custo = 2 000 Kz que desapareceram.')
        self.assertEqual(l['responsible'], 'Ana',
                         'Uma quebra sem responsável não serve para nada — e era este '
                         'campo que rebentava.')
        self.assertEqual(self.total(d, 'value'), Decimal('-2000.00'))

    def test_as_compras_contam_as_do_periodo_e_nao_a_anulada(self):
        """Quatro documentos de compra no cenário: 100 cervejas a 400 (hoje),
        10 bifes a 1 500 (ontem), uma compra ANULADA de 99 000 Kz (hoje) e uma
        de há 40 dias. O período só tem os dois primeiros: 40 000 + 15 000.

        A compra anulada é a armadilha: são 99 000 Kz que, somados, fazem o
        dono acreditar que gastou cinco vezes mais do que gastou — e o custo
        das mercadorias vendidas vai todo atrás.
        """
        d = self.periodo('fb_compras')
        total = self.total(d, 'total')
        self.assertEqual(total, Decimal('55000'),
                         f'As compras do período são 55 000 Kz (40 000 de cervejas + '
                         f'15 000 de bifes) e deram {total}. Se deu 154 000, a compra '
                         f'ANULADA de 99 000 Kz está a contar; se deu 132 000, entrou a '
                         f'de há 40 dias.')

    def test_o_stock_valorizado_e_a_quantidade_vezes_o_custo_de_cada_armazem(self):
        """O "dinheiro parado no armazém" é o número que vai ao balanço.

        O cenário tem 95 cervejas e 10 bifes no Central e 5 cervejas no Bar, com
        custos médios de 400 e 1 500 Kz:
          Central: 95 x 400 = 38 000  +  10 x 1 500 = 15 000
          Bar:      5 x 400 =  2 000
        Total: 55 000 Kz. Um armazém a mais ou a menos na soma é um balanço
        errado, e um stock valorizado pelo PREÇO DE VENDA (em vez do custo)
        inflaciona o activo da casa.
        """
        d = self.correr('fb_stock')
        self.assertEqual(self.total(d, 'value'), Decimal('55000'),
                         'Stock valorizado: 38 000 (cervejas no Central) + 15 000 (bifes) '
                         '+ 2 000 (cervejas no Bar) = 55 000 Kz ao CUSTO. Se der muito '
                         'mais, está valorizado ao preço de venda.')
        linhas = {(r['warehouse'], r['code']): r for r in d['rows']}
        central_cerveja = linhas[('Armazém Central', 'A002')]
        self.assertEqual(Decimal(central_cerveja['qty']), Decimal('95'))
        self.assertEqual(Decimal(central_cerveja['cost']), Decimal('400'),
                         'O custo é o CUSTO MÉDIO do artigo, não o preço de venda (1 000).')
        self.assertEqual(Decimal(central_cerveja['value']), Decimal('38000'))
        self.assertEqual(Decimal(linhas[('Armazém do Bar', 'A002')]['value']),
                         Decimal('2000'),
                         'O mesmo artigo em dois armazéns são duas linhas — e as duas '
                         'contam para o total.')

    def test_o_consumo_fecha_o_ciclo_entre_a_venda_e_o_armazem(self):
        """O que a venda tirou da prateleira. Venderam-se 9 cervejas e 3 bifes
        no período; é esse o consumo, e é por aqui que se descobre o artigo que
        sai do armazém sem passar pela caixa."""
        d = self.periodo('fb_consumo')
        cerveja = self.linha(d, 'code', 'A002')
        self.assertEqual(Decimal(cerveja['qty']), Decimal('9'),
                         'Nove cervejas consumidas (as mesmas 9 das vendas por artigo). '
                         'Se vier 109, entrou o movimento de há 40 dias.')
        self.assertEqual(Decimal(self.linha(d, 'code', 'A001')['qty']), Decimal('3'))

# ══════════════════════════════════════════════════════════════════════════════
# 5 · O RODAPÉ — o número que o contabilista lê, e que o ecrã recalcula
# ══════════════════════════════════════════════════════════════════════════════
class ORodapeNaoMenteTests(CasaCheia):
    """A GRELHA DO ECRÃ NÃO USA O `totals` QUE O SERVIDOR MANDA.

    Recalcula-o sobre as linhas que passam nos filtros, porque o rodapé tem de
    falar do que está à vista (ReportGrid.tsx). É a decisão certa — e, somando
    as colunas à bruta, desfazia a conta do servidor em CINCO relatórios:

      · Documentos: somava a factura ANULADA e a NOTA DE CRÉDITO como vendas;
      · Depósitos: somava a utilização ao adiantamento;
      · Pontos: somava os pontos resgatados aos ganhos;
      · Reservas do PMS: somava as canceladas e os no-shows à receita;
      · Ocupação: somava percentagens (125% de ocupação) e dois ADR.

    O contrato que resolve os cinco tem duas peças, e são estas que se testam
    aqui — uma de cada vez, para quem mexer saber qual quebrou:

      1. `_peso` na linha: quanto ela pesa no total (1, 0 ou −1);
      2. um total que NÃO é uma soma das linhas não se recalcula — e este teste
         prova que ele existe e é diferente da soma, que é a única razão pela
         qual a grelha tem de deixar o número do servidor em paz.
    """

    @staticmethod
    def _numero(v):
        """O MESMO `num()` da grelha (ReportGrid.tsx): tira espaços, aceita a
        vírgula decimal, e o que não é número vale zero. Imitá-lo ao pormenor é
        o que faz destes testes uma prova sobre o ecrã e não sobre uma ideia do
        ecrã."""
        try:
            return Decimal(str(v if v is not None else '').replace(' ', '').replace(',', '.'))
        except Exception:
            return Decimal('0')

    def _como_a_grelha_soma(self, dados, coluna):
        """A conta que ReportGrid.tsx faz: soma a coluna, pesando cada linha."""
        return sum((self._numero(r.get('_peso', 1)) * self._numero(r.get(coluna))
                    for r in dados['rows']), Decimal('0'))

    def test_os_depositos_mostram_o_saldo_e_nao_a_soma_dos_movimentos(self):
        """50 000 entraram e 20 000 foram usados: o adiantamento é 30 000 Kz.
        Somar os dois movimentos dava 70 000 — mais do dobro do que a entidade
        tem a favor, e um crédito que ela não tem."""
        d = self.periodo('dep_movimentos')
        self.assertEqual(self.total(d, 'amount'), Decimal('30000.00'))
        self.assertEqual(self._como_a_grelha_soma(d, 'amount'), Decimal('30000.00'),
                         'O ecrã vai mostrar outro número: falta o `_peso` que diz que uma '
                         'UTILIZAÇÃO tira em vez de somar.')
        pesos = {r['kind']: r.get('_peso') for r in d['rows']}
        self.assertEqual(pesos['Entrada (depósito)'], 1)
        self.assertEqual(pesos['Utilização'], -1)

    def test_os_pontos_mostram_o_saldo_e_nao_a_soma_dos_movimentos(self):
        d = self.periodo('pts_movimentos')
        self.assertEqual(self.total(d, 'points'), Decimal('70.00'),
                         '100 pontos ganhos menos 30 usados = 70.')
        self.assertEqual(self._como_a_grelha_soma(d, 'points'), Decimal('70.00'),
                         'O ecrã vai somar 130 pontos — os usados a somar aos ganhos.')

    def test_as_reservas_mostram_as_canceladas_e_nao_as_somam(self):
        """Uma reserva cancelada à vista é informação útil (mostra o que se
        perdeu). Somada ao total é receita que nunca entrou: no cenário são
        75 000 Kz de uma cancelada e de um no-show."""
        d = self.correr('pms_reservas', **{'from': str(self.ONTEM), 'to': str(self.HOJE)})
        estados = {r['confirmation']: (r['status'], r.get('_peso')) for r in d['rows']}
        self.assertIn('Cancelada', [e[0] for e in estados.values()],
                      'A reserva cancelada tem de APARECER na lista.')
        for conf, (estado, peso) in estados.items():
            esperado = 0 if estado in ('Cancelada', 'No-show') else 1
            self.assertEqual(peso, esperado,
                             f'A reserva {conf} está "{estado}" e pesa {peso} no rodapé.')
        self.assertEqual(self._como_a_grelha_soma(d, 'total'),
                         Decimal(str(d['totals']['total'])),
                         'O ecrã vai somar as canceladas e os no-shows à receita.')

    def test_uma_percentagem_nao_se_soma(self):
        """50% de ocupação num dia e 75% no outro não são 125% de ocupação — são
        62,5%. O mesmo para o ADR e o RevPAR: são rácios do PERÍODO (receita a
        dividir pelas noites), e não há soma de linhas que lhes dê o valor.

        Este teste prova que o total do servidor é DIFERENTE da soma das linhas:
        é precisamente por isso que a grelha tem de o deixar em paz (ver
        `somaveis` em ReportGrid.tsx) em vez de o recalcular.
        """
        d = self.correr('pms_ocupacao', **{'from': str(self.ONTEM), 'to': str(self.HOJE)})
        self.assertEqual(Decimal(str(d['totals']['occupancy'])), Decimal('62.5'),
                         'A ocupação do período é as noites vendidas sobre as disponíveis '
                         '(5 de 8 = 62,5%), não a soma das percentagens diárias.')
        self.assertNotEqual(Decimal(str(d['totals']['occupancy'])),
                            self._como_a_grelha_soma(d, 'occupancy'),
                            'Se a soma das percentagens diárias der a ocupação do período, '
                            'este cenário deixou de provar o que tem de provar.')
        noites = Decimal(str(d['totals']['occupied']))
        receita = Decimal(str(d['totals']['revenue']))
        self.assertEqual(Decimal(str(d['totals']['adr'])),
                         (receita / noites).quantize(Decimal('0.01')),
                         'O ADR do período é a receita total sobre as noites vendidas.')

    def test_nenhum_relatorio_do_catalogo_tem_um_rodape_que_o_ecra_desfaz(self):
        """A VARREDURA — o teste que apanha o próximo.

        Para cada um dos 51 relatórios: se o total do servidor não é a soma
        pesada das linhas, então o ecrã TEM de o deixar em paz — e para isso o
        contrato exige que a diferença seja intencional (um rácio, um derivado),
        não um `_peso` que alguém se esqueceu de pôr.

        Os que aqui aparecem estão na lista com o motivo. Um relatório novo que
        apareça sem motivo torna este teste vermelho, que é o que se quer: é um
        rodapé que o ecrã vai mostrar errado, e ninguém dava por isso.
        """
        # Total que NÃO é uma soma das linhas, por ser um rácio ou um derivado
        # do período — a grelha mostra o número do servidor e diz "do período".
        POR_MOTIVO = {
            ('pms_ocupacao', 'occupancy'): 'percentagem do período',
            ('pms_ocupacao', 'adr'): 'receita / noites do período',
            ('pms_ocupacao', 'revpar'): 'receita / quartos-noite do período',
            ('pms_depositos', 'pendente'): 'derivado: só os depósitos por receber',
            # A coluna "Falhou" diz SIM/vazio (lê-se melhor assim), e o total é
            # a CONTAGEM das que falharam. A grelha somava "SIM" como zero e o
            # rodapé de um relatório de SEGURANÇA dizia 0 tentativas falhadas
            # onde houve 2 — agora fica o número do servidor.
            ('sy_acessos', 'failed'): 'contagem das linhas marcadas, não soma',
        }
        maus = []
        for f in self.catalogo()['folders']:
            for r in f['reports']:
                resp = self.pedir(r['code'], **{'from': str(self.FORA), 'to': str(self.HOJE)})
                if resp.status_code != 200:
                    continue
                d = resp.data
                for coluna, total in (d.get('totals') or {}).items():
                    try:
                        servidor = Decimal(str(total))
                    except Exception:
                        continue
                    if (r['code'], coluna) in POR_MOTIVO:
                        continue
                    grelha = self._como_a_grelha_soma(d, coluna)
                    if abs(servidor - grelha) > Decimal('0.01'):
                        maus.append(f'{r["code"]}.{coluna}: servidor={servidor} '
                                    f'ecrã={grelha}')
        self.assertEqual(maus, [],
                         'Nestes relatórios o ecrã vai mostrar um total diferente do que o '
                         f'servidor calculou: {maus}. Se a linha não deve contar, dá-lhe '
                         f'`_peso` (0 ou −1); se o total é um rácio do período, acrescenta-o '
                         f'a POR_MOTIVO com a razão.')

# ══════════════════════════════════════════════════════════════════════════════
# 6 · O ALOJAMENTO — o que é consumo, o que é pagamento, e o que não tem quarto
# ══════════════════════════════════════════════════════════════════════════════
class OAlojamentoContaCertoTests(CasaCheia):

    def test_um_pagamento_nao_entra_nos_consumos(self):
        """A conta do hóspede tem 25 000 Kz de alojamento, 8 000 de F&B e um
        pagamento de 20 000.

        Os consumos são 33 000 Kz. O total somava os três e dava 53 000 — nem o
        que o hóspede consumiu, nem o que pagou, nem o que deve. Na conta do
        hóspede um pagamento é um lançamento como os outros (gravado em
        positivo; o que lhe dá o sinal é o tipo), e é por isso que escapava.
        """
        d = self.periodo('pms_consumos')
        self.assertEqual(self.total(d, 'amount'), Decimal('33000'),
                         'Os consumos do período são 33 000 Kz. Se der 53 000, o pagamento '
                         'de 20 000 está a contar como consumo.')
        tipos = {r['kind']: r for r in d['rows']}
        self.assertIn('Pagamento', tipos,
                      'A linha do pagamento tem de FICAR À VISTA — esconder lançamentos de '
                      'uma conta é o que nunca se pode fazer.')
        self.assertEqual(tipos['Pagamento']['_peso'], 0,
                         'O pagamento aparece mas pesa zero no total dos consumos.')
        self.assertEqual(tipos['Alojamento']['_peso'], 1)
        self.assertEqual(d['totals']['count'], 2,
                         'Dois consumos lançados (alojamento e F&B). Três é contar o '
                         'pagamento como um consumo.')

    def test_uma_tarefa_sem_quarto_nao_desaparece_da_governanta(self):
        """O relatório percorre os QUARTOS, e por isso só via tarefas que têm um.

        Mas `HousekeepingTask.room` é anulável: uma tarefa pode nascer sem
        quarto (limpar a piscina, arranjar o elevador) e — pior — uma tarefa
        cujo quarto foi apagado fica com `room=NULL` (`on_delete=SET_NULL`).
        Essas desapareciam do único sítio onde as tarefas pendentes se contam:
        ficavam por fazer e ninguém sabia que existiam.
        """
        from pms.models import HousekeepingTask
        antes = self.total(self.correr('pms_governanta'), 'tasks')
        HousekeepingTask.objects.create(hotel=self.hotel, title='Limpar a piscina',
                                        task_type='CLEANING', status='PENDING')
        d = self.correr('pms_governanta')
        self.assertEqual(self.total(d, 'tasks'), antes + 1,
                         'A tarefa sem quarto não entrou na contagem das tarefas por fazer.')
        linha = self.linha(d, 'room', '(sem quarto)')
        self.assertEqual(linha['tasks'], 1)
        self.assertIn('piscina', linha['detail'],
                      'A linha tem de dizer QUE tarefas são, senão conta-se um número que '
                      'ninguém sabe o que é.')

    def test_uma_tarefa_feita_nao_conta_mesmo_sem_quarto(self):
        from pms.models import HousekeepingTask
        antes = self.total(self.correr('pms_governanta'), 'tasks')
        HousekeepingTask.objects.create(hotel=self.hotel, title='Já tratada',
                                        task_type='CLEANING', status='DONE')
        self.assertEqual(self.total(self.correr('pms_governanta'), 'tasks'), antes,
                         'Uma tarefa FEITA entrou nas tarefas por fazer.')


# ══════════════════════════════════════════════════════════════════════════════
# 7 · O CABEÇALHO — de que casa é este papel
# ══════════════════════════════════════════════════════════════════════════════
class OPapelDizDeQuemETests(CasaCheia):

    def test_o_relatorio_diz_a_unidade_a_que_pertence(self):
        """Num grupo, o relatório de uma unidade e o consolidado saíam da
        impressora iguais — e quem os lia três meses depois não tinha como
        saber qual era qual."""
        d = self.correr('rec_dia', hotel=self.hotel.id,
                        **{'from': str(self.ONTEM), 'to': str(self.HOJE)})
        self.assertEqual(d['hotel_scope'], self.hotel.name,
                         'O cabeçalho tem de dizer o NOME da unidade.')

    def test_o_consolidado_diz_por_palavras_que_e_consolidado(self):
        d = self.periodo('rec_dia')
        self.assertTrue(d['hotel_scope'],
                        'Um relatório de grupo tem de o dizer, não ficar em branco — '
                        'um cabeçalho vazio lê-se como se fosse de uma casa só.')

    def test_um_relatorio_que_nao_se_separa_por_unidade_diz_isso(self):
        """Um adiantamento de cliente, um cartão de fidelização e um
        cartão-prenda são do GRUPO: nenhum deles sabe de que casa é, e nem
        deve (um cartão-prenda comprado numa casa tem de ser aceite na outra).

        Filtrá-los pelo pouco que há dava um relatório meio-filtrado — pior do
        que um relatório de grupo assumido, porque quem o lê acredita que está
        completo. Então assume-se, e o cabeçalho impresso di-lo.
        """
        for code in ('dep_movimentos', 'pts_movimentos', 'pts_saldos', 'outros_giftcards'):
            d = self.correr(code, hotel=self.hotel.id,
                            **{'from': str(self.ONTEM), 'to': str(self.HOJE)})
            self.assertIn('Grupo', d['hotel_scope'],
                          f'{code} aceitou uma unidade e não avisa que não a respeita: '
                          f'"{d["hotel_scope"]}".')

    def test_o_relatorio_de_uma_casa_continua_a_dizer_a_casa(self):
        """A marca "do grupo" é só dos quatro — não pode ter contaminado o
        resto do catálogo."""
        for code in ('rec_dia', 'fat_iva', 'cx_sessoes', 'fb_margem'):
            d = self.correr(code, hotel=self.hotel.id,
                            **{'from': str(self.ONTEM), 'to': str(self.HOJE)})
            self.assertEqual(d['hotel_scope'], self.hotel.name,
                             f'{code} deixou de dizer de que unidade é.')

