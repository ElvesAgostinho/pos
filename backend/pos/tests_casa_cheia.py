# -*- coding: utf-8 -*-
"""UM SERÃO DE CASA CHEIA — 20 hóspedes, 10 passantes, e um empregado a sério.

Os outros testes percorrem um caminho de cada vez: uma venda, um check-in, um
fecho. Este monta a casa e põe-na a trabalhar: um funcionário com PIN e com
LIMITES, doze mesas, um menu de cozinha e de bar, vinte quartos ocupados e dez
clientes de rua. Trinta contas numa noite, como numa sexta-feira.

Porque é que o volume importa e não é exibição: há defeitos que só aparecem no
plural. Um consumo lançado no quarto certo com UM hóspede não prova nada — com
vinte, prova que o 14 não caiu no folio do 15. Uma venda que fecha a conta da
caixa com uma venda é aritmética; com dez, é o fecho a sério. E o defeito mais
caro que esta casa teve — a MESMA refeição declarada duas vezes à AGT, uma pelo
POS ao lançar no quarto e outra pelo PMS ao fechar o folio — só se vê somando
tudo no fim e comparando com o que a casa realmente vendeu.

As quatro perguntas que este ficheiro responde, e que são as do dono:
  1. o empregado entra, e as regras dele mandam mesmo?
  2. os pedidos vão para onde têm de ir — a comida à cozinha, a bebida ao bar?
  3. cada consumo cai no SÍTIO CERTO: o do hóspede no folio do quarto dele, o do
     passante numa factura com número;
  4. ao fechar o dia, a conta BATE — e os relatórios dizem o mesmo número.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from fiscal.models import (FiscalConfig, FiscalDocType, FiscalDocument, FiscalSeries,
                           TaxRate)
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import (Item, ItemCategory, Printer, StockLevel, UnitOfMeasure,
                              Warehouse)
from mdm.models import Customer, PaymentMethod
from pms.models import Folio, FolioCharge, Reservation, Room, RoomType
from pos.models import (CashSession, Outlet, OutletPaymentMethod, POSProductConfig,
                        POSTable, POSTicket, PosHardware, PosSector, PosUser,
                        PosUserGroup, PrintJob)

HOSPEDES = 20
PASSANTES = 10


# O LIMITE DE PEDIDOS DA API, REPOSTO A CADA TESTE.
#
# A API trava a 1200 pedidos por minuto e por utilizador (DEFAULT_THROTTLE_RATES).
# Servir trinta contas são algumas centenas de chamadas, e cada teste deste
# ficheiro serve a casa toda outra vez: ao terceiro teste o limite entrava e as
# contas começavam a responder 429. O que estava a ser medido era o travão, não o
# serviço.
#
# NÃO se desliga por `override_settings`: a DRF lê as classes de travão no
# IMPORT (`APIView.throttle_classes = api_settings.DEFAULT_THROTTLE_CLASSES` é
# avaliado no corpo da classe), e um override posterior não muda nada — tentou-se
# e os 429 continuaram. O que se limpa é o HISTÓRICO, que vive na cache: cada
# teste recomeça com a sua conta a zero e serve a casa dentro do limite.
#
# E fica escrito o que isto deixa a saber: num hotel grande, com vários terminais
# a partilhar a mesma conta de serviço e os ecrãs de cozinha a sondar de poucos
# em poucos segundos, 1200 pedidos por minuto é um número que se deve MEDIR antes
# de o dar por folgado — quando ele entra, o terminal deixa de aceitar pedidos a
# meio do serviço.
class CasaCheia(APITestCase):
    """A casa montada e cheia: o mínimo que um cliente configura, à escala de uma noite."""

    @classmethod
    def setUpTestData(cls):
        # O PLANO DE CONTAS vem do mesmo comando que o instalador corre. Sem ele
        # não há diário, e `post_pos_ticket` desiste em silêncio: as vendas são
        # cobradas, declaradas à AGT, e nunca chegam à contabilidade.
        call_command('seed_accounting', verbosity=0)

    def setUp(self):
        # O travão de pedidos guarda o histórico na cache, que NÃO é desfeita
        # entre testes (ao contrário da base de dados). Sem isto, o terceiro
        # teste do ficheiro começava já com a conta cheia do segundo.
        from django.core.cache import cache
        cache.clear()

        self.user = User.objects.create_superuser('dono_casa', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Mwana')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.',
                                         tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='ECO', name='Economato',
                                                is_main=True)
        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST',
                                            warehouse=self.armazem)
        self.sector = PosSector.objects.create(outlet=self.outlet, name='Sala')

        # ── AS MESAS ────────────────────────────────────────────────────────
        self.mesas = [POSTable.objects.create(outlet=self.outlet, table_number=str(n),
                                              seats=4 if n % 2 else 2)
                      for n in range(1, 13)]

        # ── AS IMPRESSORAS: é por elas que o pedido vai parar ao sítio certo ─
        maquina = PosHardware.objects.create(code='HW1', name='Posto 1')
        self.imp_cozinha = Printer.objects.create(code='P-COZ', name='Cozinha', station='KITCHEN',
                                                  outlet=self.outlet, device=maquina)
        self.imp_bar = Printer.objects.create(code='P-BAR', name='Bar', station='BAR',
                                              outlet=self.outlet, device=maquina)

        # ── OS ARTIGOS ──────────────────────────────────────────────────────
        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cozinha = ItemCategory.objects.create(name='Cozinha')
        bar = ItemCategory.objects.create(name='Bar')
        self.bife = self._artigo('A001', 'Bife à Casa', '8500', cozinha, un, 'KITCHEN')
        self.peixe = self._artigo('A002', 'Peixe Grelhado', '7200', cozinha, un, 'KITCHEN')
        self.sopa = self._artigo('A003', 'Sopa do Dia', '1800', cozinha, un, 'KITCHEN')
        self.cerveja = self._artigo('B001', 'Cerveja Cuca 33cl', '1200', bar, un, 'BAR')
        self.agua = self._artigo('B002', 'Água 50cl', '600', bar, un, 'BAR')
        self.vinho = self._artigo('B003', 'Vinho da Casa (copo)', '2500', bar, un, 'BAR')
        for artigo in (self.bife, self.peixe, self.sopa, self.cerveja, self.agua, self.vinho):
            StockLevel.objects.create(warehouse=self.armazem, item=artigo,
                                      quantity_on_hand=D('500'))

        # ── OS MEIOS DE PAGAMENTO ───────────────────────────────────────────
        self.dinheiro = self._pagamento('DIN', 'Dinheiro', 'CASH')
        self.multicaixa = self._pagamento('MCX', 'Multicaixa', 'CARD')
        self.conta_quarto = self._pagamento('QRT', 'Conta Quarto', 'ROOM', charge_to_room=True)

        # ── O FISCAL ────────────────────────────────────────────────────────
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.auto_emit_pos = True
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=D('14'),
                               is_default=True, is_active=True)
        ano = timezone.localdate().year
        self.series = {}
        for codigo, nome in (('FR', 'Fatura-Recibo'), ('FT', 'Fatura'), ('PF', 'Proforma')):
            tipo = FiscalDocType.objects.create(code=codigo, name=nome, invoice_type=codigo)
            self.series[codigo] = FiscalSeries.objects.create(code='A', doc_type=tipo, year=ano,
                                                              prefix=codigo, certified=True)

        # ── O FUNCIONÁRIO, com PIN e com LIMITES ────────────────────────────
        self.grupo_sala = PosUserGroup.objects.create(code='SALA', name='Empregados de Sala',
                                                      number=10)
        self.grupo_chefe = PosUserGroup.objects.create(code='CHEFE', name='Chefe de Sala',
                                                        number=1)
        self.empregado = PosUser.objects.create(
            code='EMP1', first_name='Joaquim', last_name='Pedro', position='Empregado de Mesa',
            pos_group=self.grupo_sala, pos_pin=make_password('4071', hasher='pbkdf2_pos_pin'),
            internal_consumption=False,     # não lança consumo da casa
            use_cost_price=False,           # vende ao preço de venda, não ao custo
            is_fnb_user=False, is_active=True)

        # ── A CAIXA ABERTA ──────────────────────────────────────────────────
        self.caixa = CashSession.objects.create(
            outlet=self.outlet, opening_float=D('20000'), opened_by='dono_casa',
            operator_name='Joaquim Pedro', status='OPEN')

        self.anonimo = APIClient()      # o ecrã de login do terminal não tem sessão

    # ── montagem ────────────────────────────────────────────────────────────
    def _artigo(self, codigo, nome, preco, categoria, un, estacao):
        item = Item.objects.create(code=codigo, name=nome, item_type='Retail',
                                   category=categoria, base_uom=un, sale_price=D(preco),
                                   tax_percentage=D('14'))
        POSProductConfig.objects.create(outlet=self.outlet, item=item, kds_station=estacao)
        return item

    def _pagamento(self, codigo, nome, tipo, **extra):
        pm = PaymentMethod.objects.create(code=codigo, name=nome, method_type=tipo,
                                          for_pos=True, **extra)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=pm)
        return pm

    def instalar_hospedes(self, quantos=HOSPEDES):
        """`quantos` quartos ocupados, com folio aberto. O estado normal às 20h."""
        tipo = RoomType.objects.create(hotel=self.hotel, code='STD', name='Standard',
                                       base_rate=D('25000'))
        hoje = timezone.localdate()
        instalados = []
        for n in range(quantos):
            numero = str(101 + n)
            quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number=numero,
                                         status='OCCUPIED')
            hospede = Customer.objects.create(code=f'H{n:03d}', name=f'Hóspede {numero}',
                                              tax_id=f'54{n:08d}')
            reserva = Reservation.objects.create(
                hotel=self.hotel, confirmation=f'RES{n:04d}', guest=hospede, room=quarto,
                room_type=tipo, check_in=hoje, check_out=hoje + timedelta(days=2),
                status='CHECKED_IN', adults=1, rate=D('25000'))
            folio = Folio.objects.create(reservation=reserva, number=f'F{n:04d}', status='OPEN')
            instalados.append({'quarto': quarto, 'hospede': hospede, 'folio': folio})
        return instalados

    # ── atalhos de serviço, na voz de quem serve ────────────────────────────
    def abrir_conta(self, mesa, tipo='PASSANTE'):
        r = self.client.post('/api/pos/tickets/', {
            'outlet': self.outlet.id, 'table': mesa.id, 'guest_type': tipo,
            'cash_session': self.caixa.id, 'operator_name': 'Joaquim Pedro'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data['id']

    def pedir(self, conta, artigo, qtd=1, **extra):
        dados = {'item': artigo.id, 'quantity': qtd}
        dados.update(extra)
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data

    def mandar_para_producao(self, conta):
        r = self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.data

    def total(self, conta):
        return D(str(self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total']))

    def cobrar(self, conta, pm, **extra):
        dados = {'payment_method': pm.id, 'amount': str(self.total(conta))}
        dados.update(extra)
        return self.client.post(f'/api/pos/tickets/{conta}/pay/', dados, format='json')

    def relatorio(self, codigo, **params):
        """Corre um relatório como o ecrã o corre — COM detalhe.

        "Incluir detalhes?" é obrigatório em todos os relatórios (o catálogo
        injecta-o em cada um e o botão só liga depois de o operador escolher), e
        a resposta muda por inteiro: a "Não", qualquer relatório colapsa numa
        linha de resumo ("Registos / Total"). Pedir o detalhe aqui não é
        comodidade do teste — é o único modo de VERIFICAR o que o relatório diz
        linha a linha. Quem o quiser ver colapsado passa `detailed='N'`.
        """
        params.setdefault('detailed', 'S')
        r = self.client.post('/api/pos/reports/run/',
                             {'code': codigo, 'params': params}, format='json')
        self.assertEqual(r.status_code, 200,
                         f'O relatório "{codigo}" não abriu: {r.content[:300]}')
        return r.data


# ══════════════════════════════════════════════════════════════════════════
# 1 · O FUNCIONÁRIO — a senha, e as regras a morder
# ══════════════════════════════════════════════════════════════════════════
class OFuncionarioDoTerminalTests(CasaCheia):
    """A ficha do empregado é escrita no backoffice e tem de MANDAR no terminal.

    Uma caixa na ficha que o terminal ignora é pior do que não existir: o dono
    pensa que limitou alguém e não limitou nada.
    """

    def test_o_pin_certo_abre_o_terminal_e_diz_quem_esta_a_servir(self):
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '4071'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertTrue(r.data.get('access'),
                        'O terminal entrou sem token — não conseguia chamar mais nada.')
        self.assertEqual(r.data['operator']['name'], 'Joaquim Pedro',
                         'O terminal não sabe QUEM está a servir: a auditoria da noite '
                         'fica anónima e nenhuma venda tem dono.')

    def test_o_pin_errado_nao_entra_e_diz_quantas_tentativas_faltam(self):
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '0000'}, format='json')
        self.assertEqual(r.status_code, 401, r.content[:300])
        self.assertIn('attempts_left', r.data,
                      'Recusou o PIN sem dizer quantas tentativas faltam — o empregado '
                      'tenta às cegas até se bloquear sozinho.')

    def test_despedir_alguem_fecha_mesmo_a_porta(self):
        """Tirar o PIN a quem saiu é a única barreira entre um ex-funcionário e a
        caixa da casa."""
        self.empregado.is_blocked = True
        self.empregado.save(update_fields=['is_blocked'])
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '4071'}, format='json')
        self.assertEqual(r.status_code, 401,
                         'Um operador BLOQUEADO continuou a entrar no terminal.')

    def test_as_regras_da_ficha_viajam_com_o_login(self):
        """O terminal tem de receber as caixas da ficha ao entrar: é com elas que
        ele decide o que mostrar e o que pedir autorização."""
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '4071'}, format='json')
        flags = r.data['operator']['flags']
        self.assertFalse(flags['internal_consumption'],
                         'A ficha NÃO autoriza consumo interno e o terminal ficou a '
                         'pensar que sim.')
        self.assertFalse(flags.get('use_cost_price', False))

    def test_quem_nao_pode_lancar_consumo_da_casa_nao_lanca(self):
        """Consumo interno é custo da casa, não venda. Sem a caixa na ficha, o
        empregado não o lança — senão o prejuízo da casa fica à escolha de quem
        está ao balcão."""
        conta = self.abrir_conta(self.mesas[0], tipo='INTERNO')
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.bife.id, 'quantity': 1,
                              'operator': self.empregado.id}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.assertTrue(r.data.get('requires_supervisor'),
                        'Recusou sem dizer que é preciso um supervisor.')

    def test_quem_vende_ao_custo_vende_ao_custo(self):
        """A caixa "Usa preço de custo" existe para o consumo do pessoal. Se não
        funcionasse, o staff pagava preço de tabela — ou, pior, o dono pensava
        que estava a dar ao custo e estava a dar de graça."""
        self.bife.current_average_cost = D('3000')
        self.bife.save(update_fields=['current_average_cost'])
        cozinheiro = PosUser.objects.create(code='EMP2', first_name='Maria', last_name='Costa',
                                            use_cost_price=True, internal_consumption=True)
        conta = self.abrir_conta(self.mesas[1])
        self.pedir(conta, self.bife, 1, operator=cozinheiro.id)
        linha = POSTicket.objects.get(pk=conta).lines.get()
        self.assertEqual(linha.unit_price, D('3000.0000'),
                         f'Lançou a {linha.unit_price} em vez do custo (3000).')

    def test_desconto_acima_do_limite_pede_supervisor(self):
        """O limite do desconto manual (parâmetro 8620) é o que separa um gesto
        comercial de um buraco na receita."""
        conta = self.abrir_conta(self.mesas[2])
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                             {'percent': '50'}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.assertTrue(r.data.get('requires_supervisor'))
        self.assertIn('max_without_supervisor', r.data,
                      'Recusou sem dizer qual é o limite — o empregado não sabe o que pedir.')

    def test_desconto_com_autorizacao_do_chefe_passa_e_fica_assinado(self):
        """Autorizado, passa — e fica escrito QUEM autorizou. Um desconto sem
        nome é um desconto que ninguém assume."""
        conta = self.abrir_conta(self.mesas[3])
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                             {'percent': '50', 'authorized_by': 'Chefe de Sala'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        conta_db = POSTicket.objects.get(pk=conta)
        self.assertEqual(conta_db.discount_authorized_by, 'Chefe de Sala')
        self.assertEqual(conta_db.grand_total, D('4250.00'),
                         'Metade de 8500 são 4250 — o desconto não entrou no total.')


# ══════════════════════════════════════════════════════════════════════════
# 2 · O SERÃO — 20 hóspedes e 10 passantes
# ══════════════════════════════════════════════════════════════════════════
class UmSeraoDeCasaCheiaTests(CasaCheia):
    """Trinta contas numa noite — e a conta a fechar no fim.

    Este é o teste em que o dono se reconhece: às 20h abre a sala, às 23h fecha a
    caixa, e no fim tem de lhe bater. Tudo o que está a seguir corre numa só
    história, de propósito: o valor está nas peças estarem LIGADAS.
    """

    def servir_hospede(self, instalado, mesa):
        """Jantar de hóspede: pede, manda para produção, lança no quarto."""
        conta = self.abrir_conta(mesa, tipo='HOTEL')
        self.pedir(conta, self.bife, 1)
        self.pedir(conta, self.cerveja, 2)
        self.mandar_para_producao(conta)
        total = self.total(conta)
        r = self.cobrar(conta, self.conta_quarto, room=instalado['quarto'].number)
        self.assertEqual(r.status_code, 200,
                         f'Lançar no quarto {instalado["quarto"].number} falhou: '
                         f'{r.content[:300]}')
        return conta, total

    def servir_passante(self, mesa, com_nif=False):
        """Cliente de rua: pede, paga, leva factura."""
        conta = self.abrir_conta(mesa)
        self.pedir(conta, self.peixe, 1)
        self.pedir(conta, self.vinho, 1)
        self.pedir(conta, self.agua, 1)
        self.mandar_para_producao(conta)
        total = self.total(conta)
        extra = {}
        if com_nif:
            extra = {'customer_name': 'Empresa Teste, Lda.', 'customer_tax_id': '5417000000'}
        if extra:
            self.client.post(f'/api/pos/tickets/{conta}/set_customer/', extra, format='json')
        r = self.cobrar(conta, self.dinheiro if mesa.id % 2 else self.multicaixa)
        self.assertEqual(r.status_code, 200, f'Cobrar o passante falhou: {r.content[:300]}')
        return conta, total

    def o_serao_todo(self):
        """Serve a casa inteira e devolve o que foi servido, para as contas."""
        instalados = self.instalar_hospedes()
        hospedes, passantes = [], []
        for i, inst in enumerate(instalados):
            conta, total = self.servir_hospede(inst, self.mesas[i % len(self.mesas)])
            hospedes.append({'conta': conta, 'total': total, **inst})
        for i in range(PASSANTES):
            conta, total = self.servir_passante(self.mesas[i % len(self.mesas)],
                                                com_nif=(i == 0))
            passantes.append({'conta': conta, 'total': total})
        return hospedes, passantes

    # ── o que se tem de ver ─────────────────────────────────────────────────
    def test_as_trinta_contas_fecham_pagas(self):
        hospedes, passantes = self.o_serao_todo()
        pagas = POSTicket.objects.filter(status='PAID').count()
        self.assertEqual(pagas, HOSPEDES + PASSANTES,
                         f'Fecharam {pagas} contas de {HOSPEDES + PASSANTES} servidas — '
                         f'ficaram contas abertas numa sala já vazia.')

    def test_cada_consumo_cai_no_folio_do_QUARTO_CERTO(self):
        """O TESTE QUE SÓ O PLURAL FAZ. Com um hóspede, qualquer coisa parece
        certa. Com vinte, prova-se que o jantar do 114 não foi para a conta do
        115 — que é o erro que o hóspede descobre no check-out, à frente da
        recepção, e que não se desfaz sem perder a cara."""
        hospedes, _ = self.o_serao_todo()
        trocados = []
        for h in hospedes:
            encargos = FolioCharge.objects.filter(folio=h['folio'], is_void=False)
            soma = sum((c.amount for c in encargos), D('0'))
            if soma != h['total']:
                trocados.append(f'Quarto {h["quarto"].number}: consumiu {h["total"]}, '
                                f'tem {soma} na conta ({encargos.count()} linha(s))')
        self.assertEqual(trocados, [],
                         'Consumos no folio errado (ou a dobrar):\n  ' + '\n  '.join(trocados))

    def test_o_que_vai_para_o_quarto_NAO_e_facturado_no_pos(self):
        """O defeito mais caro que esta casa teve: o POS emitia o documento
        fiscal ao lançar no quarto, e o PMS emitia outro ao fechar o folio. A
        MESMA refeição declarada DUAS VEZES à AGT — IVA pago a dobrar sobre cada
        consumo de hóspede, e as duas facturas certas vistas uma a uma."""
        hospedes, passantes = self.o_serao_todo()
        for h in hospedes:
            docs = FiscalDocument.objects.filter(source_module='pos',
                                                 source_ref=str(h['conta']))
            self.assertFalse(
                docs.exists(),
                f'A conta do quarto {h["quarto"].number} saiu com documento fiscal do '
                f'POS ({[d.invoice_no for d in docs]}). Quem paga é o hóspede no '
                f'CHECK-OUT, e é aí que a factura sai — senão declara-se a mesma '
                f'refeição duas vezes.')

    def test_cada_passante_leva_a_sua_factura_com_numero(self):
        _, passantes = self.o_serao_todo()
        sem_documento = []
        for p in passantes:
            doc = FiscalDocument.objects.filter(source_module='pos',
                                                source_ref=str(p['conta'])).first()
            if doc is None:
                sem_documento.append(p['conta'])
            else:
                self.assertEqual(doc.gross_total, p['total'],
                                 f'A factura {doc.invoice_no} declara {doc.gross_total} e a '
                                 f'venda foi de {p["total"]}.')
                self.assertTrue(doc.invoice_no, 'Documento fiscal sem número.')
        self.assertEqual(sem_documento, [],
                         f'{len(sem_documento)} venda(s) de passante cobradas SEM documento '
                         f'fiscal — dinheiro na caixa e nada declarado à AGT.')

    def test_as_facturas_dos_passantes_sao_numeradas_sem_saltos_nem_repeticoes(self):
        """A numeração é a primeira coisa que uma inspecção da AGT olha: um salto
        ou um número repetido numa série é matéria de auto."""
        self.o_serao_todo()
        numeros = sorted(FiscalDocument.objects
                         .filter(doc_type__code='FR')
                         .values_list('number', flat=True))
        self.assertEqual(len(numeros), len(set(numeros)),
                         f'Números de factura REPETIDOS na série FR: {numeros}')
        self.assertEqual(numeros, list(range(numeros[0], numeros[0] + len(numeros))),
                         f'A série FR tem saltos na numeração: {numeros}')

    def test_a_comida_vai_a_cozinha_e_a_bebida_vai_ao_bar(self):
        """Onde é que o pedido vai parar. Se a cerveja sair na impressora da
        cozinha, ninguém a tira — e o cliente espera por uma bebida que está
        pedida e que nenhum bar viu."""
        self.o_serao_todo()
        corpos = {}
        for estacao, artigos in (('KITCHEN', ('A001', 'A002')), ('BAR', ('B001', 'B003'))):
            comandas = PrintJob.objects.filter(job_type=estacao)
            self.assertTrue(comandas.exists(),
                            f'Nenhuma comanda chegou à estação {estacao} numa noite com '
                            f'30 contas servidas.')
            corpos[estacao] = ' '.join((j.content or '') for j in comandas)
            for artigo in artigos:
                nome = Item.objects.get(code=artigo).name
                self.assertIn(nome, corpos[estacao],
                              f'"{nome}" não apareceu em nenhuma comanda de {estacao}.')

        # E O CONTRÁRIO, que é a metade que conta: cada comanda leva SÓ o que é
        # dela. Uma comanda única com tudo obriga a cozinha a ler os pedidos do
        # bar para encontrar os seus — e é assim que um prato se perde.
        self.assertNotIn('Bife à Casa', corpos['BAR'],
                         'O bife foi parar à comanda do BAR — a cozinha nunca o vai fazer.')
        self.assertNotIn('Cerveja', corpos['KITCHEN'],
                         'A cerveja foi parar à comanda da COZINHA — ninguém a vai tirar, '
                         'e o cliente espera por uma bebida que está pedida.')

        # E CADA UMA SAI NO APARELHO DA SUA ESTAÇÃO: é o `target` que o agente de
        # impressão lê para saber onde imprimir.
        self.assertEqual(
            {j.target for j in PrintJob.objects.filter(job_type='KITCHEN')},
            {self.imp_cozinha.device.name},
            'As comandas da cozinha não saem no aparelho da cozinha.')

    def test_a_gaveta_tem_exactamente_o_dinheiro_das_vendas_em_dinheiro(self):
        """O fecho de caixa. O que foi pago em Multicaixa não está na gaveta, e o
        que foi lançado no quarto também não — e é aqui que um sistema que
        confunde receita com dinheiro faz o empregado pagar do bolso uma
        diferença que não existe."""
        hospedes, passantes = self.o_serao_todo()
        from pos.models import POSTicketPayment
        em_dinheiro = sum(
            (p.amount for p in POSTicketPayment.objects.filter(payment_method=self.dinheiro)),
            D('0'))
        esperado = CashSession.objects.get(pk=self.caixa.pk).expected_cash
        self.assertEqual(esperado, D('20000') + em_dinheiro,
                         f'A caixa espera {esperado}; devia esperar o fundo (20000) mais '
                         f'{em_dinheiro} de vendas em dinheiro. O que entrou por '
                         f'Multicaixa ou foi para o quarto NÃO está na gaveta.')

        r = self.client.post(f'/api/pos/cash-sessions/{self.caixa.id}/close/',
                             {'counted_amount': str(esperado), 'closed_by': 'Joaquim Pedro'},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        caixa = CashSession.objects.get(pk=self.caixa.pk)
        self.assertEqual(caixa.difference, D('0'), 'A gaveta não bateu certo.')
        self.assertEqual(caixa.status, 'CLOSED')

    def test_o_que_a_casa_declarou_e_o_que_a_casa_vendeu(self):
        """A SOMA FINAL — a pergunta a que todo o resto serve.

        O que a casa vendeu esta noite = o que está nas facturas dos passantes +
        o que está nas contas dos quartos. Nem mais (declarar duas vezes) nem
        menos (cobrar e não declarar). Era este `assert` que acusava 30300 contra
        20600 quando o POS facturava o que ia para o quarto.
        """
        hospedes, passantes = self.o_serao_todo()

        vendido_passantes = sum((p['total'] for p in passantes), D('0'))
        vendido_hospedes = sum((h['total'] for h in hospedes), D('0'))

        facturado = sum((d.gross_total for d in
                         FiscalDocument.objects.filter(doc_type__code__in=('FR', 'FT'))), D('0'))
        nos_quartos = sum((c.amount for c in FolioCharge.objects.filter(is_void=False,
                                                                        charge_type='FNB')), D('0'))

        self.assertEqual(facturado, vendido_passantes,
                         f'A casa declarou {facturado} de passantes e vendeu '
                         f'{vendido_passantes}.')
        self.assertEqual(nos_quartos, vendido_hospedes,
                         f'Os quartos têm {nos_quartos} lançados e os hóspedes consumiram '
                         f'{vendido_hospedes}.')
        self.assertEqual(facturado + nos_quartos, vendido_passantes + vendido_hospedes,
                         'A soma do que o sistema registou não é a do que a sala vendeu.')

    def test_o_hospede_leva_o_jantar_na_factura_do_check_out(self):
        """A travessia completa: o consumo do POS tem de aparecer na factura que
        o hóspede leva. É aqui que os dois módulos ou se ligam, ou o hotel perde
        a refeição em silêncio."""
        hospedes, _ = self.o_serao_todo()
        h = hospedes[0]
        self.client.post(f'/api/pms/folios/{h["folio"].id}/settle/', {}, format='json')
        r = self.client.post(f'/api/pms/folios/{h["folio"].id}/generate-invoice/',
                             {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        self.assertTrue(r.data.get('invoice_number'), 'A factura do hóspede saiu sem número.')
        self.assertEqual(D(str(r.data['total'])), h['total'],
                         f'A factura do check-out traz {r.data["total"]} e o hóspede '
                         f'consumiu {h["total"]}.')


# ══════════════════════════════════════════════════════════════════════════
# 3 · OS RELATÓRIOS — o que o dono e o contabilista vêem na manhã seguinte
# ══════════════════════════════════════════════════════════════════════════
class OsRelatoriosDaNoiteTests(UmSeraoDeCasaCheiaTests):
    """Um relatório que soma mal não dá erro: dá um número, e alguém acredita.

    Por isso nenhum destes testes se contenta com "abriu": todos comparam o
    número do relatório com o que a noite realmente vendeu, calculado à parte.
    """

    def test_o_relatorio_do_dia_soma_as_trinta_contas(self):
        hospedes, passantes = self.o_serao_todo()
        vendido = sum((x['total'] for x in hospedes + passantes), D('0'))
        dados = self.relatorio('rec_dia')
        self.assertEqual(D(str(dados['totals']['total'])), vendido,
                         f'O relatório do dia diz {dados["totals"]["total"]} e a casa '
                         f'vendeu {vendido}. Um relatório que só contasse o DINHEIRO dava '
                         f'ao dono metade da noite — o que foi para os quartos é receita '
                         f'igual.')

    def test_o_relatorio_por_artigo_bate_com_o_que_saiu_da_cozinha(self):
        self.o_serao_todo()
        dados = self.relatorio('rec_artigo')
        por_codigo = {l['code']: l for l in dados['rows']}
        self.assertIn('A001', por_codigo, 'O bife não aparece nas vendas por artigo.')
        # 20 hóspedes comeram um bife cada; os passantes comeram peixe.
        self.assertEqual(D(str(por_codigo['A001']['qty'])), D(HOSPEDES),
                         f'Venderam-se {HOSPEDES} bifes e o relatório conta '
                         f'{por_codigo["A001"]["qty"]}.')
        self.assertEqual(D(str(por_codigo['A002']['qty'])), D(PASSANTES),
                         'O peixe dos passantes não bate.')
        # 2 cervejas por hóspede.
        self.assertEqual(D(str(por_codigo['B001']['qty'])), D(HOSPEDES * 2),
                         'As cervejas não batem.')

    def test_o_relatorio_por_operador_poe_a_noite_no_nome_de_quem_a_serviu(self):
        hospedes, passantes = self.o_serao_todo()
        vendido = sum((x['total'] for x in hospedes + passantes), D('0'))
        dados = self.relatorio('rec_operador')
        self.assertTrue(dados['rows'], 'O relatório por operador veio vazio numa noite '
                                       'com 30 contas.')
        soma = sum((D(str(l.get('total') or 0)) for l in dados['rows']), D('0'))
        self.assertEqual(soma, vendido,
                         f'Por operador soma {soma}; a noite foi de {vendido}.')

    def test_o_relatorio_de_modos_de_pagamento_separa_a_gaveta_do_resto(self):
        """É este que o dono usa para saber quanto vai ao banco e quanto fica na
        gaveta. Misturar o Multicaixa com o dinheiro é mandar alguém ao banco
        depositar o que não tem."""
        self.o_serao_todo()
        dados = self.relatorio('cx_pagamentos')
        self.assertTrue(dados['rows'], 'Modos de pagamento veio vazio.')
        nomes = {l['method']: l for l in dados['rows']}
        self.assertIn('Dinheiro', nomes)
        self.assertIn('Multicaixa', nomes)

    def test_o_mapa_de_iva_cobre_a_noite_toda(self):
        """O mapa que acompanha a declaração. O IVA declarado é o dos documentos
        emitidos — e os consumos de quarto só entram quando o folio fechar."""
        _, passantes = self.o_serao_todo()
        dados = self.relatorio('fat_iva')
        self.assertTrue(dados['rows'], 'O mapa de IVA do dia veio vazio.')
        base_mais_iva = sum((D(str(l.get('base') or 0)) + D(str(l.get('tax') or 0)))
                            for l in dados['rows'])
        self.assertEqual(base_mais_iva, sum((p['total'] for p in passantes), D('0')),
                         f'O mapa de IVA fecha em {base_mais_iva} e os documentos emitidos '
                         f'nesta noite somam {sum((p["total"] for p in passantes), D("0"))}.')

    def test_as_vendas_do_serao_chegam_a_contabilidade(self):
        """O defeito silencioso: sem diário, `post_pos_ticket` devolve None e
        desiste. As vendas são cobradas, declaradas, e o razão fica vazio — e
        ninguém dá por nada até o contabilista o abrir no fim do mês."""
        from accounting.models import JournalEntry
        from accounting.posting import post_pos_ticket

        _, passantes = self.o_serao_todo()
        lancados = 0
        for p in passantes:
            if post_pos_ticket(POSTicket.objects.get(pk=p['conta'])) is not None:
                lancados += 1
        self.assertEqual(lancados, PASSANTES,
                         f'Só {lancados} de {PASSANTES} vendas foram lançadas na '
                         f'contabilidade.')
        # E lançar duas vezes não duplica a receita do mês.
        antes = JournalEntry.objects.count()
        for p in passantes:
            post_pos_ticket(POSTicket.objects.get(pk=p['conta']))
        self.assertEqual(JournalEntry.objects.count(), antes,
                         'As mesmas vendas foram lançadas duas vezes na contabilidade.')

    def test_o_fecho_do_dia_fecha_e_nao_apaga_o_arquivo_fiscal(self):
        """A AGT pode pedir o arquivo anos depois. Um fecho que limpa é um fecho
        que destrói prova."""
        _, passantes = self.o_serao_todo()
        numeros = list(FiscalDocument.objects.values_list('invoice_no', flat=True))
        esperado = CashSession.objects.get(pk=self.caixa.pk).expected_cash
        self.client.post(f'/api/pos/cash-sessions/{self.caixa.id}/close/',
                         {'counted_amount': str(esperado), 'closed_by': 'Joaquim Pedro'},
                         format='json')
        r = self.client.post('/api/pos/ops/day-close/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        depois = list(FiscalDocument.objects.values_list('invoice_no', flat=True))
        self.assertEqual(sorted(numeros), sorted(depois),
                         'O fecho do dia mexeu no arquivo fiscal.')
