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
        # fb_quebras REBENTA de propósito — ver
        # `test_DEFEITO_quebras_de_inventario_rebenta_quando_ha_quebras`. Está
        # nomeado aqui para que este teste continue a apanhar o próximo que
        # rebentar, em vez de ficar vermelho por um defeito já conhecido.
        REBENTAM_HOJE = {'fb_quebras'}
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
