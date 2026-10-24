# -*- coding: utf-8 -*-
"""O TERMINAL DO EMPREGADO DE MESA, FUNÇÃO A FUNÇÃO.

Isto não é o backoffice nem o motor fiscal: é o ecrã tátil que está em cima do
balcão, e a lista de coisas que o empregado lhe faz durante um serviço. Cada
teste aqui corresponde a UM TOQUE que ele dá — entrar com o PIN, sentar a mesa,
lançar o bife, enviar à cozinha, dividir a conta, cobrar, imprimir.

Percorre-se pela mesma porta que o terminal usa (a API REST), porque o que
interessa não é se a função existe em Python: é se o botão do ecrã faz o que o
empregado espera. Um motor certo com a porta errada é um motor que ninguém usa.

A PERGUNTA DO DONO, que tem uma classe inteira para ela:
    "Os hóspedes do hotel aparecem no terminal?"
Ou seja: o empregado consegue PROCURAR o hóspede (não escrever o quarto de
cabeça), LANÇAR o jantar no quarto certo, e o dinheiro aparecer no folio dele —
e NÃO na gaveta do dinheiro, que ninguém pagou. Ver `HospedesDoHotelNoTerminalTests`.

Regra de leitura: o nome do teste diz o que a casa espera; a mensagem do assert
diz o que o empregado (ou o cliente, ou a caixa) sofre quando está errado.
"""
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, Printer, UnitOfMeasure
from mdm.models import PaymentMethod
from pos.params import invalidate
from pos.models import (CashSession, GiftCard, Outlet, OutletPaymentMethod,
                        POSProductConfig, POSTable, POSTicket, POSTicketLine,
                        PosHardware, PosUser, PrintJob, ServiceDestination)


class CasaDoTerminal(APITestCase):
    """A casa montada ao mínimo — o MESMO mínimo que um cliente novo configura.

    É de propósito igual ao cenário de `pos/tests.py` (CasaMontada): um teste do
    terminal que precise de algo que o ecrã de configuração não oferece está a
    apontar uma lacuna do produto, não a faltar-lhe cenário.
    """

    def setUp(self):
        # Os parâmetros do POS vivem em cache (30s). Um teste que mexa num parâmetro
        # não pode deixá-lo a valer para o teste seguinte — seria um teste a mudar a
        # casa debaixo dos pés do outro.
        invalidate()
        self.addCleanup(invalidate)
        self.user = User.objects.create_superuser('dono_terminal', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST')
        self.mesa = POSTable.objects.create(outlet=self.outlet, table_number='12', seats=4)
        self.mesa2 = POSTable.objects.create(outlet=self.outlet, table_number='13', seats=2)

        # Impressoras com APARELHO atrás: sem aparelho a comanda fica em fila e
        # ninguém a vai buscar (caso já coberto em pos/tests.py).
        self.maq_cozinha = PosHardware.objects.create(code='HW-COZ', name='Impressora Cozinha')
        self.maq_bar = PosHardware.objects.create(code='HW-BAR', name='Impressora Bar')
        Printer.objects.create(code='P-COZ', name='Cozinha', station='KITCHEN',
                               outlet=self.outlet, device=self.maq_cozinha)
        Printer.objects.create(code='P-BAR', name='Bar', station='BAR',
                               outlet=self.outlet, device=self.maq_bar)
        # A GAVETA liga-se à impressora de caixa: sem este posto não há por onde
        # mandar o pulso que a abre.
        self.maq_caixa = PosHardware.objects.create(code='HW-CX', name='Impressora Caixa')
        Printer.objects.create(code='P-CX', name='Caixa', station='CASHIER',
                               outlet=self.outlet, device=self.maq_caixa)

        self.un = un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        self.cat = cat = ItemCategory.objects.create(name='Restauração')
        self.bife = Item.objects.create(code='A001', name='Bife à Casa', item_type='Manufactured',
                                        category=cat, base_uom=un, sale_price=Decimal('8500.00'),
                                        tax_percentage=Decimal('14.00'))
        self.cerveja = Item.objects.create(code='A002', name='Cerveja Cuca', item_type='Retail',
                                           category=cat, base_uom=un, sale_price=Decimal('1200.00'),
                                           tax_percentage=Decimal('14.00'))
        self.tabaco = Item.objects.create(code='A003', name='Maço de tabaco', item_type='Retail',
                                          category=cat, base_uom=un, sale_price=Decimal('3000.00'),
                                          tax_percentage=Decimal('14.00'))
        POSProductConfig.objects.create(outlet=self.outlet, item=self.bife, kds_station='KITCHEN')
        POSProductConfig.objects.create(outlet=self.outlet, item=self.cerveja, kds_station='BAR')
        POSProductConfig.objects.create(outlet=self.outlet, item=self.tabaco, kds_station='NONE')

        # Modos de pagamento AUTORIZADOS nesta sala.
        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True,
                                                     opens_drawer=True)
        self.quarto = PaymentMethod.objects.create(code='QRT', name='Conta Quarto', method_type='ROOM',
                                                   for_pos=True, charge_to_room=True,
                                                   allows_change=False)
        self.tpa = PaymentMethod.objects.create(code='TPA', name='Multibanco', method_type='CARD',
                                                for_pos=True, allows_change=False)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.dinheiro)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.quarto)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.tpa)

        # Casa fiscal (o terminal emite ao cobrar — tem de haver série).
        FiscalConfig.objects.create(company_name='Mwana Lodge, Lda.', company_nif='5000000000',
                                    trade_name='Mwana Lodge')
        ano = timezone.localdate().year
        tipo_fr = FiscalDocType.objects.create(code='FR', name='Fatura-Recibo', invoice_type='FR')
        tipo_ft = FiscalDocType.objects.create(code='FT', name='Fatura', invoice_type='FT')
        FiscalSeries.objects.create(code='A', doc_type=tipo_fr, year=ano, prefix='FR', certified=True)
        FiscalSeries.objects.create(code='A', doc_type=tipo_ft, year=ano, prefix='FT', certified=True)
        tipo_cm = FiscalDocType.objects.create(code='CM', name='Consulta de Mesa',
                                               saft_type='WorkingDocument', invoice_type='CM')
        FiscalSeries.objects.create(code='A', doc_type=tipo_cm, year=ano, prefix='CM', certified=True)
        tipo_nc = FiscalDocType.objects.create(code='NC', name='Nota de Crédito', invoice_type='NC',
                                               is_rectifying=True)
        FiscalSeries.objects.create(code='A', doc_type=tipo_nc, year=ano, prefix='NC', certified=True)

        self.caixa = CashSession.objects.create(outlet=self.outlet, opening_float=Decimal('10000'),
                                                opened_by='dono_terminal', status='OPEN')

    # ── atalhos: cada um é UM TOQUE no terminal ─────────────────────────────

    def artigo(self, code, name, preco='1000', **extra):
        """Um artigo do menu. A unidade e a família são obrigatórias na ficha —
        um artigo sem unidade não se vende nem se compra."""
        return Item.objects.create(code=code, name=name, item_type='Retail',
                                   category=self.cat, base_uom=self.un,
                                   sale_price=Decimal(preco),
                                   tax_percentage=Decimal('14.00'), **extra)

    def abrir_conta(self, **extra):
        dados = {'outlet': self.outlet.id, 'table': self.mesa.id, 'guest_type': 'PASSANTE',
                 'cash_session': self.caixa.id, 'operator_name': 'Empregado 1'}
        dados.update(extra)
        r = self.client.post('/api/pos/tickets/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data['id']

    def pedir(self, conta, item, qty=1, **extra):
        dados = {'item': item.id, 'quantity': qty}
        dados.update(extra)
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data

    def total(self, conta):
        return Decimal(self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total'])

    def cobrar(self, conta, metodo=None, valor=None, **extra):
        dados = {'payment_method': (metodo or self.dinheiro).id,
                 'amount': str(valor if valor is not None else self.total(conta))}
        dados.update(extra)
        return self.client.post(f'/api/pos/tickets/{conta}/pay/', dados, format='json')

    def enviar(self, conta):
        r = self.client.post(f'/api/pos/tickets/{conta}/fire_kitchen/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        return r

    def hospede_instalado(self, nome='Ana Silva', numero='101', codigo='C001'):
        """Um hóspede COM check-in feito e folio aberto — o estado normal à noite.

        É este o cenário que interessa ao dono: o cliente que está a dormir em
        casa e janta no restaurante.
        """
        from datetime import timedelta

        from mdm.models import Customer
        from pms.models import Folio, Reservation, Room, RoomType

        tipo, _ = RoomType.objects.get_or_create(
            hotel=self.hotel, code='STD', defaults={'name': 'Standard',
                                                    'base_rate': Decimal('25000')})
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number=numero)
        hospede = Customer.objects.create(code=codigo, name=nome)
        hoje = timezone.localdate()
        reserva = Reservation.objects.create(
            hotel=self.hotel, confirmation=f'RES-{codigo}', guest=hospede, room=quarto,
            room_type=tipo, check_in=hoje, check_out=hoje + timedelta(days=2),
            status='CHECKED_IN', adults=1)
        folio = Folio.objects.create(reservation=reserva, number=f'F-{codigo}', status='OPEN')
        return quarto, folio, hospede


# ══════════════════════════════════════════════════════════════════════════════
# 1 · ENTRAR NO TERMINAL
# ══════════════════════════════════════════════════════════════════════════════

class LoginDoOperadorTests(CasaDoTerminal):
    """O PIN É A PORTA. Quem entra, entra como ELE — não como "o terminal".

    No terminal não se escreve utilizador e password com o cliente à frente:
    escrevem-se 4 dígitos. O que esse PIN decide não é só "entra/não entra": é
    QUE SETORES ele vê, se pode lançar consumo interno, se vende ao custo. Tudo
    isso vive na ficha do backoffice e tem de VIAJAR no login — senão o dono
    configura e o terminal ignora.
    """

    def setUp(self):
        super().setUp()
        self.anonimo = APIClient()      # o ecrã de login não tem sessão nenhuma
        self.empregado = PosUser.objects.create(
            code='EMP1', first_name='João', last_name='Silva',
            pos_pin=make_password('1234', hasher='pbkdf2_pos_pin'),
            internal_consumption=True, use_cost_price=False)

    def test_pin_certo_abre_o_terminal_e_traz_a_ficha_do_operador(self):
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '1234'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertTrue(r.data.get('access'),
                        'O terminal entrou sem token de API — não conseguia chamar mais nada.')
        self.assertEqual(r.data['operator']['name'], 'João Silva',
                         'O terminal não sabe QUEM está a servir — a auditoria fica anónima.')
        # As caixas da ficha viajam com o login: é o backoffice a mandar no terminal.
        self.assertTrue(r.data['operator']['flags']['internal_consumption'],
                        'A ficha autoriza consumo interno e o terminal não ficou a saber.')

    def test_pin_errado_nao_entra_e_diz_quantas_tentativas_restam(self):
        """Sem contador, o empregado tenta às cegas e o terminal fica mudo."""
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '9999'}, format='json')
        self.assertEqual(r.status_code, 401, r.content[:300])
        self.assertIn('attempts_left', r.data,
                      'Recusou o PIN sem dizer quantas tentativas faltam.')

    def test_operador_bloqueado_nao_entra_com_o_pin_antigo(self):
        """Despedir alguém e esquecer de lhe tirar o PIN é deixar a porta aberta."""
        self.empregado.is_blocked = True
        self.empregado.save(update_fields=['is_blocked'])
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '1234'}, format='json')
        self.assertEqual(r.status_code, 401,
                         'Um operador bloqueado continuou a entrar no terminal.')

    def test_pin_repetido_entre_dois_operadores_nao_autentica_nenhum(self):
        """Dois empregados com o mesmo PIN: as vendas de um ficavam no nome do outro.

        Escolher "o primeiro que aparecer" era pior do que recusar — a auditoria
        passava a culpar a pessoa errada, e ninguém dava por isso.
        """
        PosUser.objects.create(code='EMP2', first_name='Maria',
                               pos_pin=make_password('1234', hasher='pbkdf2_pos_pin'))
        r = self.anonimo.post('/api/auth/pos-login/', {'pin': '1234'}, format='json')
        self.assertEqual(r.status_code, 409, r.content[:300])
        self.assertIn('ambíguo', str(r.data).lower())

    def test_o_operador_muda_o_seu_pin_no_proprio_terminal(self):
        """O PIN provisório que o gestor entregou tem de poder mudar-se ali, sem
        ir ao backoffice — senão metade da casa anda com o PIN de fábrica."""
        r = self.client.post('/api/pos/terminal/change-pin/',
                             {'operator': self.empregado.id, 'current_pin': '1234',
                              'new_pin': '4321'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(self.anonimo.post('/api/auth/pos-login/',
                                           {'pin': '4321'}, format='json').status_code, 200,
                         'Mudou o PIN e o novo não entra.')
        self.assertEqual(self.anonimo.post('/api/auth/pos-login/',
                                           {'pin': '1234'}, format='json').status_code, 401,
                         'O PIN antigo continua a abrir o terminal depois de mudado.')


class EstacaoDeTrabalhoTests(CasaDoTerminal):
    """A ESTAÇÃO — o terminal não tem opinião própria: pergunta ao servidor.

    Se o terminal decidisse sozinho, cada posto da casa comportava-se à sua
    maneira e o dono mudava uma caixa no backoffice sem nada acontecer.
    """

    def test_o_terminal_pergunta_ao_servidor_como_se_comporta(self):
        r = self.client.get('/api/pos/terminal/config/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        for chave in ('sectors', 'direct_sale', 'ask_guest_type', 'require_cash_open',
                      'transfers', 'tables_refresh_seconds'):
            self.assertIn(chave, r.data, f'O terminal arranca sem saber "{chave}".')

    def test_o_arranque_do_terminal_traz_tudo_de_uma_vez(self):
        """O bootstrap existe para o ecrã não fazer dez pedidos ao ligar — num
        terminal com rede fraca, dez pedidos é meio minuto a olhar para o nada."""
        r = self.client.get('/api/pos/terminal/bootstrap/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertTrue(r.data, 'O arranque do terminal veio vazio.')

    def test_a_sessao_de_caixa_abre_pelo_terminal_e_a_gaveta_abre_com_ela(self):
        """O fundo de maneio entra fisicamente na gaveta: ela tem de abrir."""
        r = self.client.post('/api/pos/cash-sessions/',
                             {'outlet': self.outlet.id, 'opening_float': '5000',
                              'operator_name': 'Empregado 1'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertTrue(r.data.get('open_drawer'),
                        'Abriu a caixa e a gaveta não abriu — o dinheiro ficou na mão.')
        sessao = CashSession.objects.get(pk=r.data['id'])
        self.assertEqual(sessao.expected_cash, Decimal('5000'))
        # (8005) FECHO CEGO: enquanto a caixa está aberta, o terminal NÃO mostra o
        # esperado. Se o operador o visse, escrevia-o na contagem e o desvio nunca
        # aparecia — o fecho deixava de servir para o que serve.
        self.assertIsNone(r.data.get('expected_cash'),
                          'O terminal mostrou o valor esperado ao operador: a contagem '
                          'deixa de ser às cegas e nenhum desvio volta a aparecer.')

    def test_a_gaveta_abre_a_pedido_sem_haver_venda(self):
        """Dar troco a um cliente não é uma venda — e às vezes é preciso abrir."""
        r = self.client.post('/api/pos/terminal/open-drawer/',
                             {'outlet': self.outlet.id, 'reason': 'Trocos'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])


# ══════════════════════════════════════════════════════════════════════════════
# 2 · ABRIR A CONTA
# ══════════════════════════════════════════════════════════════════════════════

class AbrirContaTests(CasaDoTerminal):
    """SENTAR O CLIENTE. A conta é o papel onde tudo o resto se escreve."""

    def test_abrir_conta_na_mesa_ocupa_a_mesa_no_mapa(self):
        """Sem isto, o mapa mostrava a mesa livre com gente sentada lá — e dois
        empregados abriam duas contas na mesma mesa."""
        conta = self.abrir_conta()
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'OCCUPIED',
                         'A mesa continua livre no mapa com uma conta aberta nela.')
        self.assertEqual(POSTicket.objects.get(pk=conta).table_id, self.mesa.id)

    def test_venda_ao_balcao_abre_conta_sem_mesa(self):
        """O balcão não tem mesa: uma cerveja ao passar não se senta."""
        conta = self.abrir_conta(table=None)
        self.assertIsNone(POSTicket.objects.get(pk=conta).table_id)

    def test_tipo_de_cliente_e_obrigatorio_ao_abrir(self):
        """(8333) Sem saber se é passante, hóspede ou consumo interno, a receita
        da casa mistura-se com o custo do pessoal e o mapa mente ao dono."""
        r = self.client.post('/api/pos/tickets/',
                             {'outlet': self.outlet.id, 'table': self.mesa.id,
                              'operator_name': 'Empregado 1'}, format='json')
        self.assertEqual(r.status_code, 400, 'Abriu uma conta sem dizer que cliente é.')
        self.assertIn('guest_type', str(r.data))

    def test_a_conta_nasce_ligada_a_caixa_aberta(self):
        """Uma conta sem caixa é dinheiro que nunca entra em fecho nenhum."""
        conta = self.abrir_conta(cash_session=None)
        self.assertEqual(POSTicket.objects.get(pk=conta).cash_session_id, self.caixa.id,
                         'A conta nasceu fora da caixa aberta — o fecho não a vê.')

    def test_abrir_conta_para_o_quarto_poe_o_pedido_em_entrega(self):
        """Serviço de quartos: o destino não é uma mesa, é o 101 — e alguém tem
        de LEVAR lá. Por isso entra no fluxo de entregas, não no mapa de sala."""
        quarto, _folio, _h = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        r = self.client.post(f'/api/pos/tickets/{conta}/set_destination/',
                             {'dest_kind': 'ROOM', 'dest_ref': quarto.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['dest_label'], f'Quarto {quarto.number}',
                         'O pedido não diz para que quarto vai — ia parar ao quarto errado.')
        self.assertEqual(r.data['delivery_status'], 'PENDING',
                         'Um pedido para o quarto não entrou na lista de entregas.')
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'FREE',
                         'A conta mudou para o quarto e a mesa ficou ocupada à mesma.')

    def test_abrir_conta_na_piscina_usa_os_destinos_da_casa(self):
        """A piscina não tem mesas numeradas, mas o pedido tem de saber onde é."""
        piscina = ServiceDestination.objects.create(code='PISC', name='Piscina', dtype='POOL',
                                                   outlet=self.outlet)
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/set_destination/',
                             {'dest_kind': 'DESTINATION', 'dest_ref': piscina.id},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['dest_label'], 'Piscina')

    def test_destino_inventado_e_recusado(self):
        """Um id de destino que não existe deixava a conta com destino em branco —
        o pedido saía da cozinha e ninguém sabia para onde o levar."""
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/set_destination/',
                             {'dest_kind': 'DESTINATION', 'dest_ref': 999999}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])

    def test_associar_o_cliente_a_mesa_poe_o_nome_na_conta(self):
        """O NIF pergunta-se à mesa, não na hora de pagar: uma fatura já emitida
        como "Consumidor Final" não se corrige — anula-se por nota de crédito."""
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/set_customer/',
                             {'customer_name': 'Empresa X, Lda.', 'customer_tax_id': '5417000000',
                              'adults': 2, 'children': 1}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['customer_name'], 'Empresa X, Lda.')
        self.assertEqual(r.data['customer_tax_id'], '5417000000')
        self.assertEqual(r.data['guests'], 3, 'Dois adultos e uma criança são três pessoas.')

    def test_a_historia_da_conta_fica_toda_registada(self):
        """"Quem anulou este prato?" tem de ter resposta no próprio terminal."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.get(f'/api/pos/tickets/{conta}/audit/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        eventos = [e['event_type'] for e in r.data]
        self.assertIn('TICKET_OPEN', eventos, 'A abertura da conta não ficou registada.')
        self.assertIn('LINE_ADD', eventos, 'O lançamento do artigo não ficou registado.')


# ══════════════════════════════════════════════════════════════════════════════
# 3 · AS LINHAS DA CONTA
# ══════════════════════════════════════════════════════════════════════════════

class LinhasDaContaTests(CasaDoTerminal):
    """LANÇAR O QUE O CLIENTE PEDIU — e só isso, ao preço da casa."""

    def test_lancar_artigo_usa_o_preco_do_servidor(self):
        conta = self.abrir_conta()
        d = self.pedir(conta, self.bife, 2)
        linha = d['lines'][0]
        self.assertEqual(Decimal(linha['unit_price']), Decimal('8500.00'))
        self.assertEqual(Decimal(d['grand_total']), Decimal('17000.00'),
                         '2 bifes a 8500 são 17000.')

    def test_preco_enviado_pelo_terminal_e_ignorado(self):
        """A porta das traseiras: bastava um pedido forjado para vender o whisky
        a 1 Kz — e a fatura saía ASSINADA com esse valor."""
        conta = self.abrir_conta()
        d = self.pedir(conta, self.bife, 1, unit_price='1.00')
        self.assertEqual(Decimal(d['lines'][0]['unit_price']), Decimal('8500.00'),
                         'O terminal conseguiu escolher o preço de venda.')

    def test_artigo_de_preco_manual_pergunta_o_preco(self):
        """O peixe ao quilo e o vinho a copo do dia não têm preço de tabela."""
        peixe = self.artigo('A010', 'Peixe do dia', '0', manual_price=True)
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': peixe.id, 'quantity': 1}, format='json')
        self.assertEqual(r.status_code, 400, 'Lançou um artigo de preço manual sem preço.')
        self.assertTrue(r.data.get('requires_price'))
        d = self.pedir(conta, peixe, 1, unit_price='6500')
        self.assertEqual(Decimal(d['lines'][0]['unit_price']), Decimal('6500'))

    def test_artigo_inativo_nao_se_vende(self):
        """É assim que se risca um prato do menu sem apagar o histórico dele."""
        self.bife.is_active = False
        self.bife.save(update_fields=['is_active'])
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.bife.id, 'quantity': 1}, format='json')
        self.assertEqual(r.status_code, 400, 'Vendeu um artigo desativado.')
        self.assertTrue(r.data.get('inactive_item'))

    def test_artigo_esgotado_hoje_e_recusado_com_explicacao(self):
        """"Acabou o bife" é a conversa mais comum de uma sala. O terminal tem de
        a saber, senão o empregado vende e a cozinha é que dá a má notícia."""
        cfg = POSProductConfig.objects.get(outlet=self.outlet, item=self.bife)
        cfg.is_available = False
        cfg.save(update_fields=['is_available'])
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.bife.id, 'quantity': 1}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('unavailable'))

    def test_cerveja_e_meia_nao_existe(self):
        """Uma quantidade partida num artigo que não permite fração é sempre um
        dedo no sítio errado do teclado."""
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.cerveja.id, 'quantity': '1.5'}, format='json')
        self.assertEqual(r.status_code, 400, 'Vendeu 1,5 cervejas.')
        self.assertTrue(r.data.get('no_fraction'))

    def test_artigo_ao_peso_aceita_quantidade_fracionada(self):
        """A picanha pesa-se: 0,350 kg é uma quantidade legítima."""
        picanha = self.artigo('A011', 'Picanha (kg)', '12000', allow_fraction=True)
        conta = self.abrir_conta()
        d = self.pedir(conta, picanha, '0.350')
        self.assertEqual(Decimal(d['lines'][0]['quantity']), Decimal('0.350'))

    def test_artigo_de_texto_livre_exige_o_que_se_esta_a_vender(self):
        """Uma fatura a dizer "Diversos" não diz ao cliente o que ele pagou."""
        diversos = self.artigo('A012', 'Diversos', '1000', free_text=True)
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': diversos.id, 'quantity': 1}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('requires_description'))
        d = self.pedir(conta, diversos, 1, description='Bolo de aniversário')
        self.assertEqual(d['lines'][0]['description'], 'Bolo de aniversário',
                         'O que o empregado escreveu não chegou à conta.')

    def test_extras_pagos_somam_ao_preco_da_linha(self):
        """O "extra queijo" paga-se. Enfiado numa nota de texto, nunca chegava à
        conta — a cozinha fazia e a casa não cobrava."""
        conta = self.abrir_conta()
        d = self.pedir(conta, self.bife, 1,
                       modifiers=[{'name': 'Extra queijo', 'price_delta': '500'},
                                  {'name': 'Sem cebola', 'price_delta': '0'}])
        self.assertEqual(Decimal(d['lines'][0]['unit_price']), Decimal('9000.00'),
                         '8500 + 500 de extra queijo = 9000.')
        self.assertEqual(len(d['lines'][0]['modifiers']), 2,
                         'As duas mensagens não ficaram na linha.')

    def test_as_mensagens_da_linha_substituem_se_por_inteiro(self):
        """"SEM GELO" e "PITAYA" são duas mensagens, uma por linha na comanda.
        Num só campo de texto, a cozinha recebia "SEM GELO PITAYA" tudo junto."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.cerveja, 1)['lines'][0]['id']
        r = self.client.post(f'/api/pos/ticket-lines/{linha_id}/messages/',
                             {'texts': ['SEM GELO', 'EM COPO ALTO']}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual([m['name'] for m in r.data['modifiers']], ['SEM GELO', 'EM COPO ALTO'])
        # Enviar a lista nova substitui — é assim que se TIRA uma mensagem.
        r = self.client.post(f'/api/pos/ticket-lines/{linha_id}/messages/',
                             {'texts': ['SEM GELO']}, format='json')
        self.assertEqual([m['name'] for m in r.data['modifiers']], ['SEM GELO'],
                         'Tirar uma mensagem não a tirou.')

    def test_a_nota_do_cliente_vai_na_comanda_para_a_cozinha(self):
        """"Bem passado" dito ao empregado e não escrito é um prato devolvido."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1, note='Bem passado')
        self.enviar(conta)
        comanda = PrintJob.objects.get(job_type='KITCHEN')
        self.assertIn('Bem passado', comanda.content,
                      'A nota do cliente não chegou à cozinha.')

    def test_mudar_a_quantidade_recalcula_a_conta(self):
        """O cliente pediu mais um. Mudar a linha e deixar o total antigo era
        cobrar ao cliente o que o ecrã dizia — e não o que ele consumiu."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.cerveja, 1)['lines'][0]['id']
        r = self.client.patch(f'/api/pos/ticket-lines/{linha_id}/',
                              {'quantity': '3'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(self.total(conta), Decimal('3600.00'),
                         '3 cervejas a 1200 são 3600 — o total não acompanhou a linha.')

    def test_baixar_o_preco_de_uma_linha_a_mao_e_recusado(self):
        """Para baixar o valor usa-se um DESCONTO, que fica registado e tem quem
        o autorizou. Um preço alterado à mão não deixa rasto nenhum."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.bife, 1)['lines'][0]['id']
        r = self.client.patch(f'/api/pos/ticket-lines/{linha_id}/',
                              {'unit_price': '1.00'}, format='json')
        self.assertEqual(r.status_code, 400, 'Um PATCH pôs o bife a 1 Kz.')

    def test_remover_uma_linha_ainda_nao_enviada_baixa_a_conta(self):
        """Lançou a cerveja errada antes de enviar: tira-se e pronto."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        d = self.pedir(conta, self.cerveja, 1)
        linha_id = [l for l in d['lines'] if l['item'] == self.cerveja.id][0]['id']
        r = self.client.delete(f'/api/pos/ticket-lines/{linha_id}/')
        self.assertIn(r.status_code, (200, 204), r.content[:300])
        self.assertEqual(self.total(conta), Decimal('8500.00'),
                         'Removeu a linha e o total não baixou.')

    def test_lancar_numa_conta_ja_paga_e_recusado(self):
        """Depois de o cliente pagar e sair, a conta está fechada. Lançar lá um
        artigo era vender a quem já foi embora — e a quem já tem fatura."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.cerveja.id, 'quantity': 1}, format='json')
        self.assertEqual(r.status_code, 400, 'Lançou um artigo numa conta já paga.')

    def test_lancar_pela_porta_das_linhas_passa_pelo_mesmo_motor_de_precos(self):
        """Há dois caminhos no terminal para lançar um artigo. Se um deles não
        passar pelo motor de preços, é por esse que se vende o whisky a 1 Kz."""
        conta = self.abrir_conta()
        r = self.client.post('/api/pos/ticket-lines/',
                             {'ticket': conta, 'item': self.bife.id, 'quantity': 1,
                              'unit_price': '1.00'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(self.total(conta), Decimal('8500.00'),
                         'Pela porta das linhas, o preço do terminal passou.')


class CombosTests(CasaDoTerminal):
    """O COMBO É UM PREÇO, não uma soma de preços.

    O cartaz diz "Menu do dia 9000". Se a conta cobrar a soma dos componentes
    (bife 8500 + cerveja 1200 = 9700), o cliente paga 700 a mais do que o que
    está escrito à porta do restaurante — e é com o cartaz na mão que ele
    discute. É a discussão que o empregado não tem como ganhar.
    """

    def _combo_do_dia(self, preco='9000'):
        from commercial.models import Combo, ComboItem
        combo = Combo.objects.create(name='Menu do dia', price=Decimal(preco), is_active=True)
        ComboItem.objects.create(combo=combo, item=self.bife, quantity=1)
        ComboItem.objects.create(combo=combo, item=self.cerveja, quantity=1)
        return combo

    def test_o_combo_cobra_o_preco_do_combo(self):
        combo = self._combo_do_dia('9000')
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_combo/',
                             {'combo': combo.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(self.total(conta), Decimal('9000.00'),
                         'O combo cobrou a soma dos componentes em vez do preço do cartaz.')

    def test_os_componentes_do_combo_vao_cada_um_a_sua_estacao(self):
        """O menu é um preço só, mas o bife faz-se na cozinha e a cerveja tira-se
        no bar. Uma comanda única obrigava cada estação a ler o que não é dela."""
        combo = self._combo_do_dia()
        conta = self.abrir_conta()
        self.client.post(f'/api/pos/tickets/{conta}/add_combo/', {'combo': combo.id},
                         format='json')
        self.enviar(conta)
        comandas = {j.job_type: j for j in PrintJob.objects.all()}
        self.assertIn('KITCHEN', comandas, 'O bife do menu não gerou comanda de cozinha.')
        self.assertIn('BAR', comandas, 'A cerveja do menu não gerou comanda de bar.')


# ══════════════════════════════════════════════════════════════════════════════
# 4 · A PRODUÇÃO (COZINHA E BAR)
# ══════════════════════════════════════════════════════════════════════════════

class ProducaoTests(CasaDoTerminal):
    """ENVIAR PARA A COZINHA — e saber onde está cada prato."""

    def test_enviar_marca_as_linhas_e_poe_as_seguintes_na_fila(self):
        """O serviço faz-se em rondas: entradas primeiro, pratos depois. A
        segunda ronda não pode reenviar a primeira."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.enviar(conta)
        self.assertEqual(PrintJob.objects.filter(job_type='KITCHEN').count(), 1)

        self.pedir(conta, self.cerveja, 1)
        self.enviar(conta)
        self.assertEqual(PrintJob.objects.filter(job_type='KITCHEN').count(), 1,
                         'A segunda ronda reimprimiu a comanda da primeira.')
        self.assertEqual(PrintJob.objects.filter(job_type='BAR').count(), 1)

    def test_o_sino_do_empregado_mostra_o_que_esta_pronto_a_levantar(self):
        """A cozinha tem o KDS; o empregado tem ISTO. Sem o sino, ele vai ao
        passe de dez em dez minutos — e o prato esfria à espera dele."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.enviar(conta)
        linha = self.client.get('/api/pos/kds/?station=KITCHEN').data[0]
        # a preparar → pronto
        self.client.post(f"/api/pos/kds/{linha['id']}/advance/", {}, format='json')
        self.client.post(f"/api/pos/kds/{linha['id']}/advance/", {}, format='json')

        sino = self.client.get('/api/pos/kds/monitor/').data
        pronto = [l for l in sino if l['kds_status'] == 'READY']
        self.assertTrue(pronto, 'O prato está pronto no passe e o sino do empregado não toca.')
        self.assertEqual(pronto[0]['description'], 'Bife à Casa')

    def test_o_que_nao_se_prepara_nao_aparece_no_sino(self):
        """Um maço de tabaco não tem passe nenhum à espera dele."""
        conta = self.abrir_conta()
        self.pedir(conta, self.tabaco, 1)
        self.enviar(conta)
        self.assertEqual(self.client.get('/api/pos/kds/monitor/').data, [],
                         'Um artigo sem produção apareceu no monitor da sala.')

    def test_anular_depois_de_enviado_exige_motivo(self):
        """Deitar comida fora sem registo é como deixar a porta da arca aberta."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.bife, 1)['lines'][0]['id']
        self.enviar(conta)
        r = self.client.delete(f'/api/pos/ticket-lines/{linha_id}/')
        self.assertEqual(r.status_code, 400, 'Anulou um prato em produção sem dizer porquê.')
        self.assertTrue(r.data.get('requires_reason'))
        self.assertIn('reasons', r.data,
                      'Pediu o motivo e não ofereceu a lista de motivos da casa.')

    def test_anular_com_motivo_avisa_a_estacao_e_fica_no_registo(self):
        """Anular um prato já na cozinha TEM de lá chegar — senão continua a
        fazer-se, e sai um prato que ninguém pediu e ninguém paga."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.bife, 1)['lines'][0]['id']
        self.enviar(conta)
        r = self.client.delete(f'/api/pos/ticket-lines/{linha_id}/?reason=Cliente desistiu')
        self.assertIn(r.status_code, (200, 204), r.content[:300])

        anulacao = PrintJob.objects.filter(title__startswith='ANULAÇÃO').first()
        self.assertIsNotNone(anulacao, 'A anulação não gerou papel para a estação.')
        self.assertIn('NÃO PREPARAR', anulacao.content)
        self.assertIn('Cliente desistiu', anulacao.content, 'O papel não leva o motivo.')

        linha = POSTicketLine.objects.get(pk=linha_id)
        self.assertTrue(linha.is_void, 'A linha anulada continua a somar à conta.')
        self.assertEqual(linha.void_reason, 'Cliente desistiu')
        self.assertEqual(self.total(conta), Decimal('0.00'),
                         'Anulou o único prato e a conta continua a pedir dinheiro.')

    def test_a_estacao_confirma_que_viu_a_anulacao(self):
        """Até a cozinha confirmar, a anulação fica a vermelho no ecrã dela: é a
        única garantia de que alguém a leu."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.bife, 1)['lines'][0]['id']
        self.enviar(conta)
        self.client.delete(f'/api/pos/ticket-lines/{linha_id}/?reason=Erro de lançamento')

        fila = self.client.get('/api/pos/kds/?station=KITCHEN').data
        self.assertTrue(any(l['kds_status'] == 'CANCELLED' for l in fila),
                        'A anulação não apareceu no ecrã da cozinha.')
        self.client.post(f'/api/pos/kds/{linha_id}/advance/', {}, format='json')
        fila = self.client.get('/api/pos/kds/?station=KITCHEN').data
        self.assertEqual(fila, [], 'A cozinha confirmou a anulação e ela não saiu da fila.')

    def test_comandas_falhadas_voltam_a_fila_marcadas_como_reenvio(self):
        """Uma comanda falhada é um pedido que a cozinha NUNCA viu. E um reenvio
        igual ao original fazia a cozinha preparar duas vezes."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.enviar(conta)
        job = PrintJob.objects.get(job_type='KITCHEN')
        job.status = 'FAILED'
        job.error = 'Impressora sem papel'
        job.save(update_fields=['status', 'error'])

        r = self.client.post('/api/pos/print-jobs/retry_failed/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        job.refresh_from_db()
        self.assertEqual(job.status, 'QUEUED', 'A comanda falhada não voltou para a fila.')
        self.assertIn('REENVIO', job.content,
                      'O reenvio saiu igual a um pedido novo — cozinha a fazer a dobrar.')


# ══════════════════════════════════════════════════════════════════════════════
# 5 · MESAS: TRANSFERIR, JUNTAR, DIVIDIR
# ══════════════════════════════════════════════════════════════════════════════

class MesasTests(CasaDoTerminal):
    """O QUE ACONTECE QUANDO AS PESSOAS SE MEXEM.

    Metade do trabalho de uma sala é isto: o grupo muda de mesa, juntam-se duas
    mesas, cada um paga o que comeu. Com as contas de cabeça no guardanapo,
    cobra-se a mais a um e a menos a outro — e o fecho de caixa nunca bate.
    """

    def test_transferir_a_conta_muda_de_mesa_com_tudo(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.enviar(conta)

        r = self.client.post(f'/api/pos/tickets/{conta}/transfer_table/',
                             {'table': self.mesa2.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['dest_label'], 'Mesa 13',
                         'A conta mudou de mesa e a comanda/fatura continuam a dizer a antiga.')
        self.mesa.refresh_from_db(); self.mesa2.refresh_from_db()
        self.assertEqual(self.mesa.status, 'FREE', 'A mesa antiga ficou ocupada sem ninguém.')
        self.assertEqual(self.mesa2.status, 'OCCUPIED')
        # A comida já ia a caminho da mesa antiga: a estação tem de saber.
        self.assertTrue(PrintJob.objects.filter(title__startswith='Mudança de mesa').exists(),
                        'Ninguém avisou a cozinha de que o cliente mudou de sítio.')

    def test_nao_se_transfere_para_uma_mesa_que_ja_tem_conta(self):
        """Duas contas na mesma mesa e o empregado cobra a errada."""
        conta = self.abrir_conta()
        self.abrir_conta(table=self.mesa2.id)
        r = self.client.post(f'/api/pos/tickets/{conta}/transfer_table/',
                             {'table': self.mesa2.id}, format='json')
        self.assertEqual(r.status_code, 409, r.content[:300])
        self.assertTrue(r.data.get('table_busy'))
        self.assertIn('junte as contas', str(r.data).lower(),
                      'Recusou sem dizer o que o empregado deve fazer em vez disso.')

    def test_juntar_duas_contas_passa_tudo_para_uma(self):
        """Dois casais que se juntam à mesma mesa e pedem uma conta só."""
        conta_a = self.abrir_conta()
        self.pedir(conta_a, self.bife, 1)
        conta_b = self.abrir_conta(table=self.mesa2.id)
        self.pedir(conta_b, self.cerveja, 2)

        r = self.client.post(f'/api/pos/tickets/{conta_a}/merge/',
                             {'source': conta_b}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(self.total(conta_a), Decimal('10900.00'),
                         '8500 + 2×1200 = 10900 — a junção perdeu consumo pelo caminho.')
        self.assertEqual(POSTicket.objects.get(pk=conta_b).status, 'VOID',
                         'A conta de origem continua aberta — ficam duas contas para um grupo.')
        self.mesa2.refresh_from_db()
        self.assertEqual(self.mesa2.status, 'FREE', 'A mesa de onde saíram ficou ocupada.')

    def test_dividir_a_conta_move_quantidades_e_as_duas_somam_o_mesmo(self):
        """Quatro amigos, três cervejas: um leva uma, os outros ficam com duas.

        Divide-se a QUANTIDADE, não a linha — metade de uma garrafa de vinho vai
        para uma conta e metade para a outra.
        """
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        linha_cerveja = self.pedir(conta, self.cerveja, 3)['lines'][-1]['id']

        r = self.client.post(f'/api/pos/tickets/{conta}/split/',
                             {'lines': [{'line': linha_cerveja, 'quantity': 1}]},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        nova = r.data['target']['id']
        self.assertEqual(Decimal(r.data['target']['grand_total']), Decimal('1200.00'),
                         'A subconta não ficou só com a cerveja que lhe passou.')
        self.assertEqual(self.total(conta), Decimal('8500.00') + Decimal('2400.00'),
                         'A conta de origem não desceu o que passou para a outra.')
        # A subconta nasce na MESMA mesa: continua a ser a mesma mesa a ser servida.
        self.assertEqual(POSTicket.objects.get(pk=nova).table_id, self.mesa.id)

    def test_as_subcontas_da_mesa_veem_se_umas_as_outras(self):
        """O empregado tem de ver que aquela mesa tem três contas abertas — senão
        cobra uma e deixa duas por cobrar quando o grupo sai."""
        conta = self.abrir_conta()
        linha = self.pedir(conta, self.cerveja, 2)['lines'][0]['id']
        self.client.post(f'/api/pos/tickets/{conta}/split/',
                         {'lines': [{'line': linha, 'quantity': 1}]}, format='json')
        r = self.client.get(f'/api/pos/tickets/{conta}/siblings/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(len(r.data), 1, 'A mesa tem duas contas e o terminal só vê uma.')

    def test_mover_linhas_para_a_mesa_do_lado(self):
        """O cliente mudou-se para a mesa do amigo e levou a cerveja com ele."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        linha = self.pedir(conta, self.cerveja, 1)['lines'][-1]['id']
        r = self.client.post(f'/api/pos/tickets/{conta}/transfer_lines/',
                             {'line_ids': [linha], 'table': self.mesa2.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(Decimal(r.data['target']['grand_total']), Decimal('1200.00'))
        self.assertEqual(Decimal(r.data['source']['grand_total']), Decimal('8500.00'))
        self.mesa2.refresh_from_db()
        self.assertEqual(self.mesa2.status, 'OCCUPIED',
                         'As linhas foram para a mesa 13 e ela ficou livre no mapa.')

    def test_suspender_a_conta_mantem_a_mesa_ocupada(self):
        """O grupo saiu para fumar e volta: a conta fica de lado, a mesa é deles.
        Libertar a mesa aqui era vendê-la a outro cliente com a conta aberta."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/suspend/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'OCCUPIED', 'A mesa suspensa ficou livre no mapa.')

        r = self.client.post(f'/api/pos/tickets/{conta}/reopen/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'OPEN')

    def test_mesa_presa_em_ocupada_sem_conta_liberta_se_ao_ler_o_mapa(self):
        """Uma mesa OCUPADA sem nenhuma conta aberta é sempre um valor a mais.
        Ficava vermelha para sempre e ninguém conseguia sentar lá ninguém."""
        self.mesa.status = 'OCCUPIED'
        self.mesa.save(update_fields=['status'])
        self.client.get(f'/api/pos/tables/?outlet={self.outlet.id}')
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'FREE',
                         'A mesa ficou presa em "ocupada" sem conta nenhuma.')

    def test_juntar_mesas_abre_uma_conta_so_para_as_duas(self):
        """A mesa de 10 pessoas é feita de duas mesas de 4 e uma de 2."""
        r = self.client.post('/api/pos/table-groups/',
                             {'table_ids': [self.mesa.id, self.mesa2.id]}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertTrue(r.data.get('ticket_id'), 'Juntou as mesas e não abriu conta nenhuma.')
        self.mesa.refresh_from_db(); self.mesa2.refresh_from_db()
        self.assertEqual([self.mesa.status, self.mesa2.status], ['OCCUPIED', 'OCCUPIED'])

        r2 = self.client.post(f'/api/pos/table-groups/{r.data["id"]}/ungroup/', {}, format='json')
        self.assertEqual(r2.status_code, 200, r2.content[:300])
        self.mesa2.refresh_from_db()
        self.assertEqual(self.mesa2.status, 'FREE',
                         'Separou as mesas e a secundária ficou ocupada sem conta.')

    def test_uma_mesa_so_se_junta_a_um_grupo(self):
        """Uma mesa em dois grupos ao mesmo tempo é uma conta a ser servida por
        dois empregados que não falam um com o outro."""
        self.client.post('/api/pos/table-groups/',
                         {'table_ids': [self.mesa.id, self.mesa2.id]}, format='json')
        mesa3 = POSTable.objects.create(outlet=self.outlet, table_number='14')
        r = self.client.post('/api/pos/table-groups/',
                             {'table_ids': [self.mesa.id, mesa3.id]}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])


class ReservasDeMesaTests(CasaDoTerminal):
    """RESERVAS — a mesa das 20h não se vende às 19h45."""

    def _reserva(self, **extra):
        dados = {'outlet': self.outlet.id, 'table': self.mesa.id, 'guest_name': 'Sr. Mateus',
                 'party_size': 4, 'reserved_for': timezone.now().isoformat()}
        dados.update(extra)
        r = self.client.post('/api/pos/reservations/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        return r.data['id']

    def test_reservar_marca_a_mesa_como_reservada_no_mapa(self):
        self._reserva()
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'RESERVED',
                         'A mesa reservada aparece livre — vende-se duas vezes.')

    def test_sentar_a_reserva_abre_a_conta_com_as_pessoas_certas(self):
        """Sentar é o momento em que a reserva passa a ser uma conta a servir."""
        res = self._reserva()
        self.client.post(f'/api/pos/reservations/{res}/arrive/', {}, format='json')
        r = self.client.post(f'/api/pos/reservations/{res}/seat/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        conta_id = r.data.get('ticket_id')
        self.assertTrue(conta_id, 'Sentou a reserva e não abriu conta — o empregado abre à mão.')
        conta = POSTicket.objects.get(pk=conta_id)
        self.assertEqual(conta.guests, 4, 'A conta não sabe quantas pessoas se sentaram.')
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'OCCUPIED')

    def test_sentar_numa_mesa_que_ja_tem_conta_reaproveita_a_conta(self):
        """Nunca duas contas na mesma mesa por causa de uma reserva."""
        conta = self.abrir_conta()
        res = self._reserva()
        r = self.client.post(f'/api/pos/reservations/{res}/seat/', {}, format='json')
        self.assertEqual(r.data.get('ticket_id'), conta,
                         'Sentar a reserva criou uma segunda conta na mesma mesa.')

    def test_o_nao_comparecimento_liberta_a_mesa(self):
        """Uma mesa reservada por quem não aparece é dinheiro parado à porta."""
        res = self._reserva()
        r = self.client.post(f'/api/pos/reservations/{res}/cancel/',
                             {'no_show': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.data['status'], 'NO_SHOW')
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'FREE', 'O no-show deixou a mesa reservada.')


# ══════════════════════════════════════════════════════════════════════════════
# 6 · CONSULTA, DESCONTOS E GRATIFICAÇÕES
# ══════════════════════════════════════════════════════════════════════════════

class ConsultaDescontosEGorjetasTests(CasaDoTerminal):
    """ANTES DE PAGAR — o papel que o cliente pede, e o que se lhe tira ou dá."""

    def test_a_consulta_de_mesa_mostra_o_que_sai_no_papel_e_nao_fecha_a_conta(self):
        """O talão que o cliente pede antes de pagar. O que ele vê no ecrã tem de
        ser EXATAMENTE o papel que sai da térmica — senão discute-se o total."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.pedir(conta, self.cerveja, 2)
        r = self.client.post(f'/api/pos/tickets/{conta}/consult/', {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        self.assertTrue(r.data.get('invoice_no'), 'A consulta saiu sem número.')
        self.assertIn('Bife à Casa', r.data.get('content') or '',
                      'O talão de conferência não mostra o que o cliente consumiu.')
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'OPEN',
                         'A consulta de mesa fechou a conta.')
        job = PrintJob.objects.get(pk=r.data['print_job'])
        self.assertFalse(job.opens_drawer,
                         'A consulta abriu a gaveta do dinheiro sem ninguém pagar nada.')

    def test_nao_se_consulta_uma_mesa_sem_consumo(self):
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/consult/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'Emitiu um talão de conferência em branco.')

    def test_desconto_pequeno_passa_e_baixa_a_conta(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                             {'percent': '10'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(self.total(conta), Decimal('7650.00'),
                         '10% de 8500 são 850 — a conta devia ficar em 7650.')

    def test_desconto_grande_exige_supervisor(self):
        """(8620) Um desconto de 50% dado por quem está ao balcão, sem ninguém
        autorizar, é a forma mais discreta de oferecer o jantar a um amigo."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                             {'percent': '50'}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.assertTrue(r.data.get('requires_supervisor'))
        # Com a autorização do supervisor, passa — e fica escrito QUEM autorizou.
        r = self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                             {'percent': '50', 'authorized_by': 'Chefe de sala'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['discount_authorized_by'], 'Chefe de sala',
                         'Um desconto sem nome em cima não se consegue justificar depois.')

    def test_desconto_impossivel_e_recusado(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        for pct in ('-5', '120'):
            r = self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                                 {'percent': pct, 'authorized_by': 'Chefe'}, format='json')
            self.assertEqual(r.status_code, 400, f'Aceitou um desconto de {pct}%.')

    def test_artigo_protegido_nao_leva_o_desconto_do_gerente(self):
        """O tabaco e as garrafas de marca não levam os 10% da casa: a margem
        deles não dá. Descontá-los é vender a perder sem ninguém decidir isso."""
        self.tabaco.no_discount = True
        self.tabaco.save(update_fields=['no_discount'])
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)       # 8500 — desconta
        self.pedir(conta, self.tabaco, 1)     # 3000 — protegido
        self.client.post(f'/api/pos/tickets/{conta}/set_discount/',
                         {'percent': '10'}, format='json')
        self.assertEqual(self.total(conta), Decimal('11500.00') - Decimal('850.00'),
                         'O desconto caiu também sobre o artigo protegido.')

    def test_fique_com_o_troco_sai_da_gaveta_com_quem_o_recebeu(self):
        """A gorjeta é dinheiro que sai da gaveta para o empregado, não para a
        casa. Contá-la como receita dava SEMPRE falta no fecho — e a suspeita
        caía em quem estava ao balcão."""
        gorjeta = PaymentMethod.objects.create(code='DIN2', name='Dinheiro (c/ gorjeta)',
                                               method_type='CASH', for_pos=True,
                                               tip_from_change=True, opens_drawer=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=gorjeta)
        conta = self.abrir_conta()
        self.pedir(conta, self.cerveja, 1)      # 1200
        r = self.cobrar(conta, gorjeta, valor='2000', tip_change=True)
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(Decimal(r.data['tip']), Decimal('800'),
                         'O "fique com o troco" não foi registado como gratificação.')
        self.assertEqual(Decimal(r.data['change_returned']), Decimal('0'))
        caixa = CashSession.objects.get(pk=self.caixa.pk)
        self.assertEqual(caixa.expected_cash, Decimal('10000') + Decimal('1200'),
                         'A gorjeta ficou a contar como dinheiro da casa no fecho.')


# ══════════════════════════════════════════════════════════════════════════════
# 7 · COBRAR
# ══════════════════════════════════════════════════════════════════════════════

class PagamentosTests(CasaDoTerminal):
    """O BOTÃO DE COBRAR — o momento em que tudo o que está errado dá prejuízo."""

    def test_dinheiro_calcula_o_troco_e_abre_a_gaveta(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)         # 8500
        r = self.cobrar(conta, valor='10000')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(Decimal(r.data['change_returned']), Decimal('1500'),
                         '10000 por 8500 dá 1500 de troco.')
        self.assertTrue(r.data.get('open_drawer'), 'Entrou dinheiro e a gaveta não abriu.')
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'PAID')
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'FREE', 'A conta foi paga e a mesa ficou ocupada.')

    def test_o_cartao_nao_da_troco(self):
        """"Devolver" troco de um pagamento por cartão deixava a gaveta sempre
        em falta — pelo valor exacto do troco que não existia."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, self.tpa, valor='10000')
        self.assertEqual(r.status_code, 400, 'Deu troco de um pagamento por cartão.')
        self.assertTrue(r.data.get('no_change_allowed'))

    def test_o_que_se_paga_por_cartao_nao_entra_na_gaveta(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta, self.tpa)
        self.assertEqual(CashSession.objects.get(pk=self.caixa.pk).expected_cash,
                         Decimal('10000'), 'O cartão foi contado como dinheiro na gaveta.')

    def test_pagamento_misto_metade_em_dinheiro_metade_no_cartao(self):
        """O grupo em que um paga em dinheiro e o outro no multibanco. Sem isto,
        o empregado cobrava tudo num meio e a reconciliação do banco não fechava."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)         # 8500
        r = self.cobrar(conta, self.dinheiro, valor='4000')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'OPEN',
                         'Metade do dinheiro fechou a conta inteira.')
        self.assertEqual(Decimal(r.data['balance_due']), Decimal('4500'))

        r = self.cobrar(conta, self.tpa, valor='4500')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'PAID')
        # Só o dinheiro entra na gaveta; o cartão vai ao banco.
        self.assertEqual(CashSession.objects.get(pk=self.caixa.pk).expected_cash,
                         Decimal('14000'))

    def test_metodo_nao_autorizado_nesta_sala_e_recusado(self):
        """O backoffice autoriza por sala. Um quiosque só-dinheiro não cobra por
        um meio que a tesouraria daquele ponto de venda não reconhece."""
        cheque = PaymentMethod.objects.create(code='CHQ', name='Cheque', method_type='OTHER',
                                              for_pos=True)
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, cheque)
        self.assertEqual(r.status_code, 403, r.content[:300])

    def test_metodo_desativado_nao_cobra(self):
        """O TPA avariou: desliga-se a caixa e ele sai do terminal, sem apagar o
        histórico das vendas por cartão que já lá estão."""
        self.tpa.is_active = False
        self.tpa.save(update_fields=['is_active'])
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, self.tpa)
        self.assertEqual(r.status_code, 400, r.content[:300])

    def test_o_tpa_exige_o_codigo_de_autorizacao_do_banco(self):
        """Sem o código, não há prova de que o banco aceitou: o cliente sai, o
        pagamento é recusado à noite, e a casa perdeu a refeição."""
        tpa_real = PaymentMethod.objects.create(code='TPA2', name='TPA Caixa', method_type='CARD',
                                                for_pos=True, allows_change=False,
                                                external_interface=True, external_device='Ingenico')
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=tpa_real)
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, tpa_real)
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('requires_auth_code'))
        r = self.cobrar(conta, tpa_real, auth_code='A12345')
        self.assertEqual(r.status_code, 200, r.content[:400])

    def test_cheque_e_transferencia_exigem_o_numero_do_documento(self):
        """Uma transferência sem referência é dinheiro que entra no banco e
        ninguém sabe de que venda é."""
        trf = PaymentMethod.objects.create(code='TRF', name='Transferência', method_type='OTHER',
                                           for_pos=True, allows_change=False,
                                           ask_document_number=True, bank_transfer=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=trf)
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, trf)
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('requires_document_number'))
        r = self.cobrar(conta, trf, document_number='TRF-998', bank_reference='BFA-2026-1')
        self.assertEqual(r.status_code, 200, r.content[:400])

    def test_meio_que_nao_aceita_parcial_tem_de_saldar_a_conta(self):
        """Um vale de refeição não paga metade de um jantar: o emissor não
        reembolsa metades, e o resto ficava pendurado."""
        vale = PaymentMethod.objects.create(code='VAL', name='Vale de refeição',
                                            method_type='VOUCHER', for_pos=True,
                                            allows_change=False, allows_partial=False)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=vale)
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, vale, valor='4000')
        self.assertEqual(r.status_code, 400, r.content[:300])

    def test_conta_corrente_exige_entidade_e_respeita_o_limite_de_credito(self):
        """O fiado tem nome e tem teto. Sem entidade é uma dívida de ninguém;
        sem teto é emprestar dinheiro sem decidir emprestar."""
        from mdm.models import Customer
        cc = PaymentMethod.objects.create(code='CC', name='Conta Corrente', method_type='CREDIT',
                                          for_pos=True, allows_change=False, current_account=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=cc)
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, cc)
        self.assertEqual(r.status_code, 400, 'Lançou fiado sem dizer a quem.')
        self.assertTrue(r.data.get('requires_entity'))

        pequeno = Customer.objects.create(code='C900', name='Empresa Pequena',
                                          credit_limit=Decimal('1000'))
        r = self.cobrar(conta, cc, customer=pequeno.id)
        self.assertEqual(r.status_code, 400, 'Passou do limite de crédito da entidade.')
        self.assertTrue(r.data.get('credit_limit_exceeded'))

        bloqueada = Customer.objects.create(code='C901', name='Empresa Bloqueada',
                                            is_blocked=True, block_reason='Cheque devolvido')
        r = self.cobrar(conta, cc, customer=bloqueada.id)
        self.assertEqual(r.status_code, 400, 'Vendeu a crédito a uma entidade bloqueada.')
        self.assertTrue(r.data.get('entity_blocked'))

        boa = Customer.objects.create(code='C902', name='Empresa Boa, Lda.', tax_id='5417000000')
        r = self.cobrar(conta, cc, customer=boa.id)
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).customer_name, 'Empresa Boa, Lda.',
                         'A conta ficou fiada e sem o nome de quem deve.')
        # Fiado não é dinheiro na gaveta.
        self.assertEqual(CashSession.objects.get(pk=self.caixa.pk).expected_cash,
                         Decimal('10000'), 'Uma venda a crédito entrou como dinheiro.')

    def test_gift_card_paga_o_que_tem_e_desconta_do_saldo(self):
        """O cartão-presente é dinheiro já pago na casa: o que ele cobre não
        volta a entrar na gaveta."""
        PaymentMethod.objects.create(code='GIFT', name='Gift Card', method_type='GIFTCARD',
                                     for_pos=True, allows_change=False)
        card = GiftCard.objects.create(code='GC-001', initial_balance=Decimal('5000'),
                                       balance=Decimal('5000'))
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)         # 8500
        r = self.client.post(f'/api/pos/tickets/{conta}/redeem_gift/',
                             {'code': 'GC-001'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        card.refresh_from_db()
        self.assertEqual(card.balance, Decimal('0'), 'O gift card pagou e não gastou saldo.')
        self.assertEqual(Decimal(r.data['balance_due']), Decimal('3500'),
                         'Faltam 3500 depois dos 5000 do cartão.')
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'OPEN')

        # O resto paga-se em dinheiro — e só ESSE resto entra na gaveta.
        self.cobrar(conta, self.dinheiro, valor='3500')
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'PAID')
        self.assertEqual(CashSession.objects.get(pk=self.caixa.pk).expected_cash,
                         Decimal('13500'),
                         'O gift card foi contado como dinheiro na gaveta — sobra fantasma '
                         'no fecho, pelo valor do cartão.')

    def test_gift_card_sem_saldo_ou_inventado_e_recusado(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/redeem_gift/',
                             {'code': 'NAO-EXISTE'}, format='json')
        self.assertEqual(r.status_code, 404, r.content[:300])
        GiftCard.objects.create(code='GC-VAZIO', initial_balance=Decimal('0'),
                                balance=Decimal('0'))
        r = self.client.post(f'/api/pos/tickets/{conta}/redeem_gift/',
                             {'code': 'GC-VAZIO'}, format='json')
        self.assertEqual(r.status_code, 409, r.content[:300])

    def test_a_mesma_conta_nao_se_paga_duas_vezes(self):
        """Duplo toque, ou o ecrã a reenviar por não ter tido resposta: o cliente
        pagava a dobrar e a caixa fechava com uma sobra inexplicável."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.assertEqual(self.cobrar(conta).status_code, 200)
        r = self.cobrar(conta, valor='8500')
        self.assertEqual(r.status_code, 400, 'A mesma conta foi cobrada duas vezes.')

    def test_cobrar_fora_de_uma_caixa_aberta_e_recusado(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.caixa.status = 'CLOSED'
        self.caixa.save(update_fields=['status'])
        r = self.cobrar(conta)
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('cash_session_closed'))

    def test_a_fatura_sai_com_o_troco(self):
        """O empregado não tem um segundo botão a dizer "agora fatura": o papel
        sai ao cobrar. Sem isto havia vendas cobradas e por faturar."""
        from fiscal.models import FiscalDocument
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)
        doc = FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta)).first()
        self.assertIsNotNone(doc, 'A conta foi cobrada e não saiu documento fiscal.')
        self.assertTrue(PrintJob.objects.filter(job_type='INVOICE').exists(),
                        'O documento foi emitido e nunca foi mandado imprimir.')

    def test_reimprimir_mantem_o_numero_da_fatura(self):
        """Falhou a impressora: o empregado carrega outra vez em "faturar" e saem
        duas faturas da mesma venda. A 2ª via existe para isso não acontecer."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)
        from fiscal.models import FiscalDocument
        doc = FiscalDocument.objects.get(source_module='pos', source_ref=str(conta))
        r = self.client.post(f'/api/pos/tickets/{conta}/reprint/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['invoice_no'], doc.invoice_no,
                         'A reimpressão saiu com outro número — duas faturas da mesma venda.')
        self.assertEqual(FiscalDocument.objects.filter(source_module='pos',
                                                       source_ref=str(conta)).count(), 1)


# ══════════════════════════════════════════════════════════════════════════════
# 8 · A PERGUNTA DO DONO: OS HÓSPEDES APARECEM NO TERMINAL?
# ══════════════════════════════════════════════════════════════════════════════

class HospedesDoHotelNoTerminalTests(CasaDoTerminal):
    """OS HÓSPEDES DO HOTEL, VISTOS DO BALCÃO DO RESTAURANTE.

    É a pergunta do dono, e tem três partes:
      1. o empregado consegue PROCURAR o hóspede no terminal (nome ou quarto),
         em vez de escrever o número que o cliente lhe disser de cor;
      2. o consumo cai no FOLIO do quarto certo — e inteiro;
      3. esse dinheiro NÃO entra na gaveta (ninguém pagou nada ainda) e NÃO é
         faturado aqui (a fatura sai no check-out, pelo folio).

    O que falha quando isto falha: o jantar do 302 vai parar à conta do 203 (e
    discute-se no check-out, com o cliente já de malas feitas), ou não vai parar
    a nenhum e o hotel oferece o jantar sem saber.
    """

    def test_o_terminal_mostra_quem_esta_em_casa_agora(self):
        quarto, folio, hospede = self.hospede_instalado('Ana Silva', '101')
        r = self.client.get('/api/pos/terminal/guests/')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertTrue(r.data.get('available'),
                        f'O terminal diz que não há informação de hóspedes: {r.data.get("detail")}')
        linhas = r.data['rows']
        self.assertEqual(len(linhas), 1, f'Esperava 1 hóspede em casa; vieram {len(linhas)}.')
        linha = linhas[0]
        self.assertEqual(linha['guest'], 'Ana Silva',
                         'O empregado não vê o NOME de quem está no quarto.')
        self.assertEqual(linha['room'], '101')
        self.assertEqual(linha['folio'], folio.id,
                         'A linha do hóspede não traz a conta (folio) onde lançar o consumo.')
        self.assertIn('board', linha,
                       'O terminal não sabe o REGIME — servia um almoço incluído e cobrava-o.')

    def test_quem_ja_fez_check_out_desaparece_do_terminal(self):
        """Lançar um jantar no quarto de quem já foi embora é dívida que não se
        cobra a ninguém."""
        quarto, folio, _ = self.hospede_instalado('Ana Silva', '101')
        reserva = folio.reservation
        reserva.status = 'CHECKED_OUT'
        reserva.save(update_fields=['status'])
        r = self.client.get('/api/pos/terminal/guests/')
        self.assertEqual(r.data['rows'], [],
                         'Um hóspede que já saiu continua a aparecer no terminal.')

    def test_procurar_o_hospede_pelo_nome_e_pelo_quarto(self):
        """Num hotel de 200 quartos, a lista inteira não serve de nada: o
        empregado escreve "Ana" ou "203" e quer uma linha."""
        self.hospede_instalado('Ana Silva', '101', 'C001')
        self.hospede_instalado('Bruno Costa', '203', 'C002')

        por_nome = self.client.get('/api/pos/terminal/guests/?q=Bruno').data['rows']
        self.assertEqual([l['guest'] for l in por_nome], ['Bruno Costa'],
                         'A pesquisa por nome não encontra o hóspede.')
        por_quarto = self.client.get('/api/pos/terminal/guests/?q=101').data['rows']
        self.assertEqual([l['room'] for l in por_quarto], ['101'],
                         'A pesquisa pelo número do quarto não encontra o hóspede.')

    def test_o_saldo_do_folio_aparece_no_terminal_e_acompanha_o_consumo(self):
        """O empregado tem de ver quanto é que aquele quarto já deve — é a única
        travagem que existe antes de servir mais uma garrafa."""
        quarto, folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, self.quarto, room=quarto.number)
        self.assertEqual(r.status_code, 200, r.content[:400])

        linha = self.client.get('/api/pos/terminal/guests/').data['rows'][0]
        self.assertEqual(Decimal(linha['balance']), Decimal('8500.00'),
                         'O jantar não aparece no saldo do quarto no terminal.')

    def test_o_jantar_do_hospede_cai_no_folio_do_quarto_certo(self):
        """Dois quartos ocupados: o consumo tem de cair no que o empregado
        escolheu, e no outro não pode cair nada."""
        q101, folio101, _ = self.hospede_instalado('Ana Silva', '101', 'C001')
        q203, folio203, _ = self.hospede_instalado('Bruno Costa', '203', 'C002')

        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        self.pedir(conta, self.cerveja, 2)
        self.enviar(conta)
        total = self.total(conta)

        r = self.cobrar(conta, self.quarto, room='203')
        self.assertEqual(r.status_code, 200, r.content[:400])

        encargos203 = list(folio203.charges.filter(is_void=False))
        self.assertEqual(len(encargos203), 1,
                         'O consumo não chegou ao folio — o hóspede saía sem o pagar.')
        self.assertEqual(encargos203[0].amount, total,
                         'A conta do restaurante não chegou INTEIRA ao quarto.')
        self.assertEqual(encargos203[0].charge_type, 'FNB')
        self.assertIn(POSTicket.objects.get(pk=conta).ticket_number,
                      encargos203[0].source_reference or '',
                      'O encargo no folio não diz de que conta do POS veio — na recepção '
                      'ninguém consegue explicar o valor ao hóspede.')
        self.assertEqual(folio101.charges.count(), 0,
                         'O jantar do 203 também caiu no quarto do vizinho.')

    def test_o_consumo_no_quarto_nao_entra_na_gaveta_do_dinheiro(self):
        """Ninguém pagou nada: quem paga é o hóspede no check-out. Contado como
        dinheiro, o fecho acusava uma sobra que não existe."""
        quarto, folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta, self.quarto, room=quarto.number)
        self.assertEqual(CashSession.objects.get(pk=self.caixa.pk).expected_cash,
                         Decimal('10000'),
                         'A conta quarto foi contada como dinheiro na gaveta.')

    def test_o_consumo_no_quarto_nao_e_faturado_no_pos(self):
        """O defeito mais caro deste percurso: o POS faturava ao lançar no quarto
        e o PMS faturava outra vez no check-out. O MESMO jantar declarado DUAS
        VEZES à AGT — IVA a dobrar e receita que nunca existiu no SAF-T."""
        from fiscal.models import FiscalDocument
        quarto, folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta, self.quarto, room=quarto.number)
        self.assertFalse(
            FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta)).exists(),
            'O POS faturou um consumo que vai ser faturado outra vez no check-out.')
        self.assertEqual(sum(c.amount for c in folio.charges.filter(is_void=False)),
                         Decimal('8500.00'), 'Não faturou — e também não lançou no quarto.')

    def test_passante_nao_lanca_no_quarto(self):
        """Um cliente de rua não tem quarto onde a conta caia. Deixá-lo "pagar no
        quarto" criava dívida num quarto que não é dele."""
        quarto, _folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='PASSANTE')
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, self.quarto, room=quarto.number)
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertIn('hóspedes', str(r.data).lower(),
                      'Recusou sem explicar que aquele meio é só para hóspedes.')

    def test_quarto_sem_conta_aberta_recusa_e_explica(self):
        """Quarto vazio, ou hóspede que já fez check-out: não há onde lançar."""
        from pms.models import Room, RoomType
        tipo = RoomType.objects.create(hotel=self.hotel, code='SUP', name='Superior',
                                       base_rate=Decimal('30000'))
        Room.objects.create(hotel=self.hotel, room_type=tipo, number='404')
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, self.quarto, room='404')
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertIn('folio', str(r.data).lower(),
                      'Recusou sem dizer que o problema é não haver conta aberta nesse quarto.')

    def test_conta_quarto_sem_dizer_o_quarto_pergunta_qual(self):
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        r = self.cobrar(conta, self.quarto)
        self.assertEqual(r.status_code, 400, r.content[:300])
        self.assertTrue(r.data.get('requires_room'))

    def test_a_conta_aberta_para_o_quarto_nao_obriga_a_escrever_o_quarto_outra_vez(self):
        """SERVIÇO DE QUARTOS. A conta JÁ nasceu com destino "Quarto 101" — foi o
        empregado que o escolheu na lista de hóspedes. Obrigá-lo a escrever o
        número outra vez na hora de cobrar é a porta por onde entra o erro de
        dedo que manda o jantar para o quarto errado.

        O terminal aceita a cobrança (o destino identifica o quarto) e depois
        procurava o folio de um quarto vazio — recusando com um aviso que fala
        de um quarto "" que o empregado nunca escreveu.
        """
        quarto, folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.client.post(f'/api/pos/tickets/{conta}/set_destination/',
                         {'dest_kind': 'ROOM', 'dest_ref': quarto.id}, format='json')
        self.pedir(conta, self.bife, 1)

        r = self.cobrar(conta, self.quarto)   # sem repetir o quarto
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(sum(c.amount for c in folio.charges.filter(is_void=False)),
                         Decimal('8500.00'),
                         'O consumo do serviço de quartos não chegou ao folio do quarto.')

    def test_lancar_no_quarto_pelo_botao_proprio_fecha_a_conta_sem_faturar(self):
        """O outro caminho para o mesmo: o botão "lançar no quarto" do terminal.
        Tem de dar o MESMO resultado que cobrar com "Conta Quarto" — senão o
        hotel declara duas vezes consoante o botão em que se toca."""
        from fiscal.models import FiscalDocument
        quarto, folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/charge_to_room/',
                             {'room': quarto.number}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'PAID')
        self.assertEqual(sum(c.amount for c in folio.charges.all()), Decimal('8500.00'))
        self.assertFalse(
            FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta)).exists(),
            'O botão de lançar no quarto faturou — e o check-out factura outra vez.')

    def test_o_mapa_de_refeicoes_diz_o_que_o_regime_ja_paga(self):
        """Servir um almoço a quem só tem dormida-e-pequeno-almoço e não o cobrar
        é oferecer o almoço — e ninguém dá por isso, porque "é do hotel"."""
        self.hospede_instalado('Ana Silva', '101')
        r = self.client.get('/api/pos/terminal/meals/')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertTrue(r.data.get('available'),
                        f'O mapa de refeições diz que não está disponível: {r.data.get("detail")}')
        self.assertEqual(len(r.data['rows']), 1,
                         'O hóspede em casa não aparece no mapa de refeições.')
        linha = r.data['rows'][0]
        self.assertIn('meals', linha)
        self.assertIn('board', linha, 'A linha não diz o regime do hóspede.')

    def test_desligar_a_interface_pms_esconde_os_hospedes(self):
        """(8035/8064) Há casas que alugam o restaurante a terceiros: o operador
        da sala não pode ver quem está hospedado nem lançar nos quartos."""
        from pos.models import PosParameter
        self.hospede_instalado()
        PosParameter.objects.update_or_create(
            number=8035, defaults={'name': 'Interface com PMS', 'value': 'false',
                                   'kind': 'BOOL', 'scope': 'GLOBAL'})
        invalidate()      # o motor de parâmetros tem cache de 30s
        r = self.client.get('/api/pos/terminal/guests/')
        self.assertFalse(r.data.get('available'),
                         'A interface com o PMS está desligada e o terminal mostra hóspedes.')
        self.assertEqual(r.data['rows'], [])


# ══════════════════════════════════════════════════════════════════════════════
# 9 · ANULAR, ESTORNAR, ENTREGAR
# ══════════════════════════════════════════════════════════════════════════════

class AnularEEstornarTests(CasaDoTerminal):
    """DESFAZER — e deixar rasto de tudo o que se desfez."""

    def test_anular_uma_conta_aberta_liberta_a_mesa_e_avisa_a_producao(self):
        """O grupo foi-se embora sem consumir: a conta anula-se e a cozinha tem
        de saber, senão continua a fazer e o prato vai para o lixo."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.enviar(conta)
        r = self.client.post(f'/api/pos/tickets/{conta}/void/',
                             {'reason': 'Cliente foi-se embora'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'VOID')
        self.mesa.refresh_from_db()
        self.assertEqual(self.mesa.status, 'FREE', 'A conta anulada deixou a mesa ocupada.')
        self.assertTrue(PrintJob.objects.filter(title__startswith='ANULAÇÃO').exists(),
                        'A anulação da conta não chegou à produção.')

    def test_anular_uma_venda_ja_faturada_emite_nota_de_credito(self):
        """(8128) Apagar uma fatura já comunicada é o que a AGT não perdoa. A
        anulação de uma venda faturada passa SEMPRE pela nota de crédito."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)
        r = self.client.post(f'/api/pos/tickets/{conta}/void/',
                             {'reason': 'Erro de cobrança'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertTrue(r.data.get('credit_note'),
                        'Anulou uma venda faturada sem emitir nota de crédito.')
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'VOID')

    def test_estornar_uma_venda_paga_emite_a_nota_de_credito_assinada(self):
        """O cliente devolveu: a devolução é um documento fiscal a sério —
        numerado, assinado e no SAF-T — não um acerto de gaveta."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)
        r = self.client.post(f'/api/pos/tickets/{conta}/refund/',
                             {'reason': 'Prato devolvido'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertTrue(r.data.get('invoice_no'), 'A nota de crédito saiu sem número.')
        self.assertTrue(r.data.get('hash'), 'A nota de crédito saiu sem assinatura.')
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'REFUNDED')

    def test_nao_se_estorna_a_mesma_venda_duas_vezes(self):
        """Duas notas de crédito da mesma venda devolvem o dinheiro a dobrar."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)
        self.client.post(f'/api/pos/tickets/{conta}/refund/', {}, format='json')
        r = self.client.post(f'/api/pos/tickets/{conta}/refund/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'A mesma venda foi estornada duas vezes.')

    def test_nao_se_estorna_o_que_nunca_foi_cobrado(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/refund/', {}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])


class EntregasTests(CasaDoTerminal):
    """ENTREGAS — o pedido que sai da sala tem de chegar e ser confirmado."""

    def test_o_pedido_para_o_quarto_percorre_por_despachar_a_caminho_entregue(self):
        """Sem este rasto, "o cliente diz que não recebeu" não tem resposta."""
        quarto, _folio, _ = self.hospede_instalado()
        conta = self.abrir_conta(guest_type='HOTEL')
        self.client.post(f'/api/pos/tickets/{conta}/set_destination/',
                         {'dest_kind': 'ROOM', 'dest_ref': quarto.id}, format='json')
        self.pedir(conta, self.bife, 1)

        pendentes = self.client.get('/api/pos/tickets/?delivery=PENDING').data
        pendentes = pendentes.get('results', pendentes) if isinstance(pendentes, dict) else pendentes
        self.assertEqual(len(pendentes), 1, 'O pedido para o quarto não está na lista de entregas.')

        r = self.client.post(f'/api/pos/tickets/{conta}/dispatch_order/', {}, format='json')
        self.assertEqual(r.data['delivery_status'], 'DISPATCHED')
        r = self.client.post(f'/api/pos/tickets/{conta}/deliver/',
                             {'delivered_by': 'Empregado 2', 'note': 'Entregue à porta'},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['delivery_status'], 'DELIVERED')
        self.assertEqual(r.data['delivered_by'], 'Empregado 2',
                         'A entrega ficou sem o nome de quem a fez.')
        self.assertTrue(POSTicket.objects.get(pk=conta).delivered_at,
                        'A entrega ficou sem hora.')


class ResumoDoTurnoTests(CasaDoTerminal):
    """O QUE O TERMINAL MOSTRA A QUEM FECHA O TURNO."""

    def test_o_resumo_do_dia_conta_as_vendas_e_as_mesas_ocupadas(self):
        conta_paga = self.abrir_conta()
        self.pedir(conta_paga, self.bife, 1)
        self.cobrar(conta_paga)

        conta_aberta = self.abrir_conta(table=self.mesa2.id)
        self.pedir(conta_aberta, self.cerveja, 2)

        r = self.client.get(f'/api/pos/tickets/summary/?outlet={self.outlet.id}')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.data['sales_count'], 1)
        self.assertEqual(Decimal(str(r.data['sales_total'])), Decimal('8500.00'))
        self.assertEqual(r.data['open_tickets'], 1,
                         'O resumo não mostra a conta que ainda está por cobrar.')
        self.assertEqual(r.data['occupied_tables'], 1)
        self.assertTrue(r.data['cash_open'], 'O resumo não vê a caixa aberta.')
        nomes = [p['name'] for p in r.data['top_products']]
        self.assertIn('Bife à Casa', nomes,
                      'O artigo vendido não aparece nos mais vendidos do dia.')


# ══════════════════════════════════════════════════════════════════════════════
# 10 · OFERTAS, CONSUMO INTERNO E CLIENTE VIP
# ══════════════════════════════════════════════════════════════════════════════

class OfertasEConsumoInternoTests(CasaDoTerminal):
    """O QUE SAI DA COZINHA E NINGUÉM PAGA — mas tem de ficar escrito.

    Uma oferta e um consumo do pessoal não são vendas: são custo da casa. Se
    entrarem na receita, o dono vê um restaurante a "vender" 30% mais do que
    factura — e nunca percebe para onde vai a comida.
    """

    def test_oferecer_um_prato_marca_a_linha_como_oferta(self):
        """(8177) O prato veio mal, ou o cliente esperou 40 minutos: oferece-se.
        100% de desconto na linha não é "uma venda a zero" — é uma OFERTA, e sem
        esta marca o relatório de ofertas do fecho do dia nunca tinha nada."""
        conta = self.abrir_conta()
        linha_id = self.pedir(conta, self.bife, 1)['lines'][0]['id']
        r = self.client.patch(f'/api/pos/ticket-lines/{linha_id}/',
                              {'discount_percent': '100'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        linha = POSTicketLine.objects.get(pk=linha_id)
        self.assertTrue(linha.is_gift, 'Um prato oferecido não ficou marcado como oferta.')
        self.assertEqual(linha.line_total, Decimal('0.00'))
        self.assertEqual(self.total(conta), Decimal('0.00'),
                         'Ofereceu o prato e a conta continua a pedir dinheiro.')

    def test_quem_nao_esta_autorizado_nao_lanca_consumo_interno(self):
        """A caixa "Consumo interno" está na ficha do operador. Sem ela, o jantar
        do pessoal não se lança — senão o custo da casa é decidido por quem está
        ao balcão, e não por quem paga as contas."""
        sem_direito = PosUser.objects.create(code='EMP9', first_name='Novato',
                                             internal_consumption=False)
        conta = self.abrir_conta(guest_type='INTERNO')
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.bife.id, 'quantity': 1,
                              'operator': sem_direito.id}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.assertTrue(r.data.get('requires_supervisor'))

    def test_quem_esta_autorizado_lanca_consumo_interno(self):
        com_direito = PosUser.objects.create(code='EMP8', first_name='Chefe',
                                             internal_consumption=True)
        conta = self.abrir_conta(guest_type='INTERNO')
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.bife.id, 'quantity': 1,
                              'operator': com_direito.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])

    def test_o_operador_que_vende_ao_custo_lanca_ao_custo(self):
        """(Ficha do operador) "Usa preço de custo" — o consumo do pessoal lança-se
        ao CUSTO médio, não ao preço de venda. Senão o custo da casa aparece
        inflacionado com a margem que ninguém cobrou."""
        self.bife.current_average_cost = Decimal('3000')
        self.bife.save(update_fields=['current_average_cost'])
        ao_custo = PosUser.objects.create(code='EMP7', first_name='Staff',
                                          use_cost_price=True, internal_consumption=True)
        conta = self.abrir_conta(guest_type='INTERNO')
        r = self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                             {'item': self.bife.id, 'quantity': 1, 'operator': ao_custo.id},
                             format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(Decimal(r.data['lines'][0]['unit_price']), Decimal('3000.00'),
                         'O consumo interno foi lançado ao preço de venda.')

    def test_cliente_vip_traz_o_seu_desconto_quando_se_senta(self):
        """O desconto do cliente está na ficha dele. Obrigar o empregado a
        lembrar-se de o aplicar é garantir que metade das vezes não se aplica —
        e o cliente que sabe que o tem reclama à frente dos outros."""
        from mdm.models import Customer
        vip = Customer.objects.create(code='C500', name='Sr. Importante', is_vip=True,
                                      vip_discount_percent=Decimal('15'))
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/set_customer/',
                             {'customer_name': vip.name, 'customer_id': vip.id},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertTrue(r.data['vip']['is_vip'], 'O terminal não ficou a saber que é VIP.')
        self.assertEqual(self.total(conta), Decimal('7225.00'),
                         '15% de 8500 são 1275 — o desconto VIP não foi aplicado.')

    def test_o_aviso_da_ficha_do_cliente_aparece_antes_de_fechar_a_conta(self):
        """(8196) "Cheque devolvido em 2025", "não aceitar cartão". O operador tem
        de VER o aviso enquanto o cliente está à mesa — depois de cobrar é tarde."""
        from mdm.models import Customer
        marcado = Customer.objects.create(code='C501', name='Sr. Problema',
                                          has_warnings=True,
                                          warning_text='Cheque devolvido em 2025')
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/set_customer/',
                             {'customer_name': marcado.name, 'entity': marcado.id},
                             format='json')
        self.assertEqual(r.data['vip']['customer_warning'], 'Cheque devolvido em 2025',
                         'O aviso da ficha do cliente não chegou ao ecrã do empregado.')


# ══════════════════════════════════════════════════════════════════════════════
# 11 · FATURAR À MÃO, E O TERMINAL OFFLINE
# ══════════════════════════════════════════════════════════════════════════════

class FaturarNoTerminalTests(CasaDoTerminal):
    """O BOTÃO DE FATURAR — para quando o papel tem de sair com outro tipo."""

    def test_fatura_recibo_exige_que_o_dinheiro_tenha_entrado(self):
        """Uma FR diz à AGT que se recebeu. Emiti-la por cobrar é declarar falso —
        e a conta fica paga no papel e aberta na caixa."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FR'}, format='json')
        self.assertEqual(r.status_code, 400, 'Emitiu fatura-recibo de uma conta por cobrar.')
        self.assertTrue(r.data.get('requires_payment'))

    def test_quem_paga_depois_leva_fatura_e_nao_fatura_recibo(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FT'}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(r.data['doc_type'], 'FT')

    def test_duas_emissoes_da_mesma_venda_dao_o_mesmo_documento(self):
        """Carregar duas vezes em "Faturar" não pode duplicar receita na AGT."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        a = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FT'}, format='json')
        b = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FT'}, format='json')
        self.assertEqual(a.data['invoice_no'], b.data['invoice_no'],
                         'A segunda emissão criou um documento fiscal novo da mesma venda.')
        self.assertTrue(b.data.get('reissued'))

    def test_serie_de_outro_tipo_de_documento_e_recusada(self):
        """O ecrã deixa escolher a série (há casas com uma por estabelecimento).
        Escolher a série das faturas para emitir outro tipo punha dois tipos de
        documento a numerar na mesma série — e a AGT lê a série, não a intenção."""
        from fiscal.models import FiscalSeries
        serie_ft = FiscalSeries.objects.get(doc_type__code='FT')
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'CM', 'series': serie_ft.id}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])

    def test_conta_sem_artigos_nao_se_fatura(self):
        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FT'}, format='json')
        self.assertEqual(r.status_code, 400, 'Emitiu um documento fiscal sem uma única linha.')


class TerminalOfflineTests(CasaDoTerminal):
    """QUANDO A REDE CAI — e volta.

    O terminal continua a vender com a rede em baixo e sincroniza depois. O que
    não pode acontecer é a mesma venda entrar duas vezes quando a ligação volta
    (e volta sempre a meio de um envio): seria receita a dobrar na contabilidade
    e na AGT, por causa de uma falha de rede.
    """

    def test_as_vendas_feitas_offline_entram_quando_a_rede_volta(self):
        lote = {'tickets': [{
            'client_uuid': 'OFF-0001', 'outlet': self.outlet.id,
            'operator_name': 'Empregado 1',
            'lines': [{'item': self.bife.id, 'quantity': 1}],
            'payments': [{'payment_method': self.dinheiro.id, 'amount': '8500.00'}],
        }]}
        r = self.client.post('/api/pos/tickets/sync/', lote, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(r.data['synced'][0]['status'], 'created',
                         f"A venda offline não entrou: {r.data['synced'][0]}")
        conta = POSTicket.objects.get(pk=r.data['synced'][0]['id'])
        self.assertEqual(conta.status, 'PAID', 'A venda offline entrou sem ficar paga.')
        self.assertEqual(conta.grand_total, Decimal('8500.00'))

    def test_a_mesma_venda_offline_nao_entra_duas_vezes(self):
        lote = {'tickets': [{
            'client_uuid': 'OFF-0002', 'outlet': self.outlet.id,
            'operator_name': 'Empregado 1',
            'lines': [{'item': self.cerveja.id, 'quantity': 2}],
        }]}
        primeiro = self.client.post('/api/pos/tickets/sync/', lote, format='json')
        segundo = self.client.post('/api/pos/tickets/sync/', lote, format='json')
        self.assertEqual(segundo.data['synced'][0]['status'], 'exists',
                         'A mesma venda offline foi gravada outra vez.')
        self.assertEqual(segundo.data['synced'][0]['id'], primeiro.data['synced'][0]['id'])
        self.assertEqual(POSTicket.objects.filter(client_uuid='OFF-0002').count(), 1)


class FechoNoTerminalTests(CasaDoTerminal):
    """FIM DO TURNO — contar a gaveta no próprio terminal."""

    def test_contar_a_gaveta_fecha_a_caixa_e_grava_a_diferenca(self):
        """É a única altura do dia em que o sistema e a gaveta são postos lado a
        lado. Um "esperado" errado não aparece como erro: aparece como uma falta,
        e alguém fica com a suspeita em cima."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        self.cobrar(conta)

        r = self.client.post(f'/api/pos/cash-sessions/{self.caixa.id}/close/',
                             {'counted_amount': '18300', 'closed_by': 'Empregado 1'},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        sessao = CashSession.objects.get(pk=self.caixa.pk)
        self.assertEqual(sessao.expected_amount, Decimal('18500'),
                         '10000 de fundo + 8500 da venda = 18500.')
        self.assertEqual(sessao.difference, Decimal('-200'),
                         'Faltaram 200 na gaveta e a diferença não é negativa.')
        self.assertEqual(sessao.status, 'CLOSED')
        self.assertTrue(r.data.get('open_drawer'),
                        'A gaveta não abriu para o operador guardar a contagem.')

    def test_o_painel_do_fecho_do_dia_mostra_o_que_falta_cobrar(self):
        """Antes de fechar, quem está ao balcão tem de VER o que falta — e em que
        mesa. É esta lista que evita o "fechar à pressa"."""
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        d = self.client.get('/api/pos/ops/day-close/').data
        self.assertEqual(len(d['open_tickets']), 1,
                         'A conta por cobrar não aparece no painel do fecho.')
        self.assertEqual(d['open_tickets'][0]['where'], 'Mesa 12',
                         'O painel não diz EM QUE MESA está a conta por cobrar.')

    def test_nao_se_fecha_o_dia_com_comida_servida_e_por_cobrar(self):
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post('/api/pos/ops/day-close/', {}, format='json')
        self.assertEqual(r.status_code, 409, r.content[:300])
        self.assertEqual(r.data['open_tickets'], 1)


class CombosCentimosTests(CasaDoTerminal):
    """O PREÇO DO COMBO AO CÊNTIMO — inclusive quando a divisão não é redonda."""

    def test_o_combo_com_varias_unidades_bate_ao_centimo(self):
        """Menu de família: 2 bifes + 3 cervejas por 15000. A soma dos
        componentes (2×8500 + 3×1200 = 20600) não se divide por 15000 em valores
        redondos — e um cêntimo a mais ou a menos é o género de diferença que
        ninguém explica ao cliente, e que a AGT vê na fatura.
        """
        from commercial.models import Combo, ComboItem
        combo = Combo.objects.create(name='Menu família', price=Decimal('15000'),
                                     is_active=True)
        ComboItem.objects.create(combo=combo, item=self.bife, quantity=2)
        ComboItem.objects.create(combo=combo, item=self.cerveja, quantity=3)

        conta = self.abrir_conta()
        r = self.client.post(f'/api/pos/tickets/{conta}/add_combo/',
                             {'combo': combo.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content[:400])
        self.assertEqual(self.total(conta), Decimal('15000.00'),
                         'O menu de família não cobra o preço do cartaz ao cêntimo.')

    def test_um_combo_mais_caro_que_os_componentes_nao_e_recusado_em_silencio(self):
        """Há menus que são um UPGRADE (o mesmo prato com acompanhamento melhor):
        o preço do combo pode ser mais alto. O que vale é sempre o preço do
        combo — não se pode cobrar um e anunciar outro."""
        from commercial.models import Combo, ComboItem
        combo = Combo.objects.create(name='Menu premium', price=Decimal('12000'),
                                     is_active=True)
        ComboItem.objects.create(combo=combo, item=self.cerveja, quantity=1)
        conta = self.abrir_conta()
        self.client.post(f'/api/pos/tickets/{conta}/add_combo/', {'combo': combo.id},
                         format='json')
        self.assertEqual(self.total(conta), Decimal('12000.00'),
                         'O combo não cobrou o preço do combo.')


class GiftCardSemMeioConfiguradoTests(CasaDoTerminal):
    """O CARTÃO-PRESENTE TEM DE TER O SEU MEIO DE PAGAMENTO.

    A casa deste cenário NÃO criou o modo de pagamento "Gift Card" — é o estado
    de uma instalação nova. O que não pode acontecer é o terminal escolher um
    meio qualquer: registado como DINHEIRO, o valor do cartão entra no esperado
    do fecho e a gaveta acusa uma sobra que ninguém sabe explicar.
    """

    def test_sem_meio_de_gift_card_o_terminal_recusa_e_diz_o_que_falta(self):
        card = GiftCard.objects.create(code='GC-900', initial_balance=Decimal('5000'),
                                       balance=Decimal('5000'))
        conta = self.abrir_conta()
        self.pedir(conta, self.bife, 1)
        r = self.client.post(f'/api/pos/tickets/{conta}/redeem_gift/',
                             {'code': 'GC-900'}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:400])
        self.assertTrue(r.data.get('requires_payment_method'),
                        'Aceitou o cartão por um meio de pagamento qualquer.')
        card.refresh_from_db()
        self.assertEqual(card.balance, Decimal('5000'),
                         'Recusou e gastou o saldo do cartão à mesma.')
        self.assertEqual(CashSession.objects.get(pk=self.caixa.pk).expected_cash,
                         Decimal('10000'),
                         'O cartão-presente entrou no fecho de caixa como dinheiro na '
                         'gaveta — sobra fantasma, e a suspeita cai em quem está ao balcão.')


# ══════════════════════════════════════════════════════════════════════════════
# 12 · O STOCK NUNCA TRAVA O BALCÃO
# ══════════════════════════════════════════════════════════════════════════════

class StockNaVendaTests(CasaDoTerminal):
    """VENDER COM O CLIENTE À FRENTE — e o armazém com o saldo errado.

    O motor de stock RECUSA saídas que deixem o saldo negativo, e tem razão: o
    custo médio é recalculado contra a quantidade total, e com saldo negativo a
    compra seguinte pondera contra uma quantidade que não existe — a margem de
    cada prato passa a ser uma invenção.

    Mas o balcão é a exceção, e é uma exceção de ofício: ninguém pode ficar sem
    conseguir vender uma cerveja porque a entrega de ontem não foi registada, com
    o cliente à frente e a fila a crescer. Aqui o saldo vai a negativo de
    propósito, o ecrã de existências marca-o a vermelho, e alguém corrige depois
    — sem o serviço parar.
    """

    def setUp(self):
        super().setUp()
        from inventory.models import Warehouse
        self.armazem = Warehouse.objects.create(name='Economato', code='ARM',
                                                hotel=self.hotel, is_main=True)
        self.outlet.warehouse = self.armazem
        self.outlet.save(update_fields=['warehouse'])

    def _saldo(self, item):
        from inventory.models import StockLevel
        lvl = StockLevel.objects.filter(warehouse=self.armazem, item=item).first()
        return lvl.quantity_on_hand if lvl else Decimal('0')

    def test_a_venda_da_saida_de_stock_no_armazem_do_ponto_de_venda(self):
        """Fecha-se o ciclo: comprar → ter → vender → consumir. Sem esta saída, o
        stock do economato nunca baixava e as encomendas eram feitas a olho."""
        from inventory import stock as motor
        motor.move_in(self.armazem, self.cerveja, Decimal('10'), unit_cost=Decimal('800'),
                      reference='ENTRADA', note='teste')
        conta = self.abrir_conta()
        self.pedir(conta, self.cerveja, 3)
        self.cobrar(conta)
        self.assertEqual(self._saldo(self.cerveja), Decimal('7.000'),
                         'Vendeu 3 cervejas de 10 e o armazém não desceu para 7.')

    def test_vender_sem_stock_nao_trava_a_venda(self):
        """O armazém diz zero (a entrega não foi lançada) e o cliente está à
        frente a pagar. A venda faz-se; o saldo fica negativo, a assinalar que
        falta lançar a entrada. Travar aqui era perder a venda por um erro de
        escritório."""
        conta = self.abrir_conta()
        self.pedir(conta, self.cerveja, 2)
        r = self.cobrar(conta)
        self.assertEqual(r.status_code, 200, r.content[:400])
        self.assertEqual(POSTicket.objects.get(pk=conta).status, 'PAID',
                         'A falta de stock no armazém travou uma venda já paga.')
        self.assertEqual(self._saldo(self.cerveja), Decimal('-2.000'),
                         'A venda passou mas não deixou rasto no stock — a falta deixa '
                         'de aparecer a vermelho e ninguém a vai corrigir.')

    def test_o_stock_so_sai_uma_vez_por_conta(self):
        """A segunda passagem (reimpressão, sincronização, duplo toque) não pode
        abater o stock outra vez — era inventário a desaparecer sem venda."""
        from inventory import stock as motor
        motor.move_in(self.armazem, self.cerveja, Decimal('10'), unit_cost=Decimal('800'),
                      reference='ENTRADA', note='teste')
        conta = self.abrir_conta()
        self.pedir(conta, self.cerveja, 1)
        self.cobrar(conta)
        from pos.consumption import consume_ticket_stock
        consume_ticket_stock(POSTicket.objects.get(pk=conta))
        self.assertEqual(self._saldo(self.cerveja), Decimal('9.000'),
                         'O stock foi abatido duas vezes pela mesma venda.')

    def test_artigo_sem_existencia_fisica_nao_mexe_no_stock(self):
        """Couvert, taxa de serviço, "Diversos": vendem-se e não têm existência.
        Sem esta caixa na ficha, o stock deles ficava negativo para sempre."""
        taxa = self.artigo('A020', 'Taxa de serviço', '500', no_stock_movement=True)
        conta = self.abrir_conta()
        self.pedir(conta, taxa, 1)
        self.cobrar(conta)
        self.assertEqual(self._saldo(taxa), Decimal('0'),
                         'Uma taxa de serviço mexeu no stock do economato.')
