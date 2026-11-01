# -*- coding: utf-8 -*-
"""UM DIA NA CASA — quatro pessoas, do princípio ao fim.

─── PORQUE É QUE ESTE TESTE EXISTE ────────────────────────────────────────
O dono vai gerar um instalador para vender e perguntou se está tudo a
funcionar. A suite tem mais de mil testes, e cada um prova uma peça: que o
IVA soma, que a tesouraria não duplica, que a auditoria marca o no-show. O
que nenhum provava é o que o cliente vai mesmo fazer no primeiro dia —
criar as pessoas da casa e pôr o sistema a trabalhar com elas.

É nesse encontro que as coisas partem. As peças estavam todas verdes e o PCC
esteve em baixo três horas por causa de uma chave estrangeira que só não
existia num modo que nenhum teste corria. Um teste de peças não apanha isso.

─── AS QUATRO PESSOAS ─────────────────────────────────────────────────────
 · O CONTABILISTA — não vende nem recebe ninguém. Entra para ver se as contas
   batem. O que se exige dele é que VEJA o razão e o balancete, e que o que
   vê corresponda ao que se vendeu.

 · O BARMAN — não entra no backoffice. Entra no terminal com um PIN, abre
   contas, lança bebidas e cobra. É o utilizador mais comum da casa e o que
   mais depressa dá por um defeito.

 · DOIS HÓSPEDES — dormem, consomem ao bar com a conta no quarto, e no
   check-out levam uma factura. São dois e não um de propósito: com um só,
   um erro que misture contas passa despercebido.

 · UM PASSANTE — não dorme na casa. Bebe ao balcão e paga na hora. É quem
   mostra que o POS funciona sem o PMS, que é como metade dos clientes o vai
   comprar.

─── O QUE SE EXIGE NO FIM ─────────────────────────────────────────────────
Que o dinheiro do passante esteja na tesouraria, que a conta de cada hóspede
tenha o que ELE consumiu e não o do outro, que as facturas saiam com número
de série e assinatura, e que a contabilidade tenha os lançamentos — com o
débito igual ao crédito, que é a única coisa que uma inspecção da AGT não
perdoa.
"""
from datetime import timedelta
from decimal import Decimal as D

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.utils import timezone

from accounting.models import JournalEntry
from finance.models import Receipt
from mdm.models import Customer
from pms.models import Folio, FolioCharge, Reservation, Room, RoomType
from identity.models import Collaborator, PosOperator
from pos.models import POSTicket
from pos.tests_integracao_auditoria import TresModulosMontados


class UmDiaNaCasa(TresModulosMontados):

    def setUp(self):
        super().setUp()
        # A CAIXA DA CASA, como o instalador a cria (seed_tesouraria). Sem ela
        # não há onde lançar o dinheiro — e foi a correr este teste que se
        # descobriu que uma instalação nova não tinha nenhuma.
        from django.core.management import call_command
        call_command('seed_tesouraria', verbosity=0)

    # ── AS PESSOAS ───────────────────────────────────────────────────────
    def criar_contabilista(self):
        """Entra no backoffice para ver contas, e não para vender."""
        u = User.objects.create_user('contabilista', 'contabilista@exemplo.ao', 'Conta#2026')
        u.is_staff = True
        u.save()
        return u

    def criar_barman(self, pin='7788'):
        """O barman trabalha no TERMINAL, com PIN — não com utilizador e senha.

        É a diferença que mais confunde quem instala o sistema pela primeira
        vez: o barman não precisa de conta de backoffice nenhuma, e dar-lhe
        uma seria dar-lhe acesso a sítios onde ele não tem nada que fazer.

        O PIN GUARDA-SE CIFRADO, como qualquer senha. Um PIN de quatro dígitos
        em claro na base é um PIN que qualquer pessoa com acesso de leitura à
        base usa para vender em nome de outro — e é o nome do operador que fica
        na factura.
        """
        pessoa = Collaborator.objects.create(
            code='FUNC-BAR', name='Joaquim Mendes', hotel=self.hotel,
            job_title='Barman')
        return PosOperator.objects.create(
            collaborator=pessoa, name='Joaquim (barman)',
            pin_code=make_password(pin), is_active=True)

    def criar_hospede(self, numero, nome):
        """Um hóspede a sério: ficha, reserva, quarto e conta aberta."""
        tipo = RoomType.objects.filter(hotel=self.hotel).first() or RoomType.objects.create(
            hotel=self.hotel, code='STD', name='Standard', base_rate=D('25000'))
        quarto = Room.objects.create(hotel=self.hotel, room_type=tipo, number=numero,
                                     status='OCCUPIED')
        ficha = Customer.objects.create(code=f'H{numero}', name=nome)
        hoje = timezone.localdate()
        reserva = Reservation.objects.create(
            hotel=self.hotel, confirmation=f'RES-{numero}', guest=ficha, room=quarto,
            room_type=tipo, check_in=hoje, check_out=hoje + timedelta(days=1),
            status='CHECKED_IN', adults=1, rate=D('25000'))
        folio = Folio.objects.create(reservation=reserva, number=f'FOL-{numero}', status='OPEN')
        return {'quarto': quarto, 'ficha': ficha, 'reserva': reserva, 'folio': folio}

    # ── O DIA ────────────────────────────────────────────────────────────
    def test_o_barman_entra_no_terminal_com_o_seu_pin(self):
        """Sem isto, o terminal não abre e o dia não começa.

        E não se verifica que "o campo do PIN está preenchido": verifica-se que
        ELE ENTRA. O PIN está cifrado, e um teste ao campo passaria mesmo que a
        comparação do lado do servidor estivesse partida.
        """
        self.criar_barman(pin='7788')
        self.client.force_authenticate(None)

        r = self.client.post('/api/auth/pos-login/', {'pin': '7788'}, format='json')

        self.assertEqual(r.status_code, 200,
                         f'o barman não consegue entrar no terminal: {r.content[:250]}')

    def test_um_pin_errado_nao_abre_o_terminal(self):
        """O contrário também tem de ser verdade — senão qualquer PIN serve."""
        self.criar_barman(pin='7788')
        self.client.force_authenticate(None)

        r = self.client.post('/api/auth/pos-login/', {'pin': '0000'}, format='json')

        self.assertNotEqual(r.status_code, 200,
                            'o terminal aceitou um PIN que não é de ninguém')

    def test_o_passante_bebe_paga_e_o_dinheiro_fica_na_caixa(self):
        """O POS tem de funcionar sem o PMS — metade dos clientes compra-o assim."""
        self.criar_barman()

        conta = self.abrir(tipo='PASSANTE')
        self.pedir(conta, qtd=2)
        total = self.total(conta)
        self.assertEqual(total, D('17000.00'), 'dois bifes a 8500')

        r = self.cobrar(conta)
        self.assertEqual(r.status_code, 200, r.content[:300])

        t = POSTicket.objects.get(pk=conta)
        self.assertEqual(t.status, 'PAID')
        self.assertEqual(t.grand_total, D('17000.00'))

    def test_cada_hospede_leva_a_sua_conta_e_nao_a_do_outro(self):
        """Dois hóspedes, duas contas. É aqui que um erro de mistura aparece."""
        self.criar_barman()
        a = self.criar_hospede('201', 'Hóspede A')
        b = self.criar_hospede('202', 'Hóspede B')

        # O A bebe um; o B bebe três.
        for quarto, quantas in ((a['quarto'], 1), (b['quarto'], 3)):
            conta = self.abrir(tipo='HOTEL')
            self.pedir(conta, qtd=quantas)
            r = self.cobrar(conta, pm=self.quarto_pm, room=quarto.number)
            self.assertEqual(r.status_code, 200, r.content[:300])

        conta_a = FolioCharge.objects.filter(folio=a['folio'])
        conta_b = FolioCharge.objects.filter(folio=b['folio'])

        self.assertEqual(sum(c.amount for c in conta_a), D('8500.00'),
                         'o hóspede A ficou com consumo que não é dele')
        self.assertEqual(sum(c.amount for c in conta_b), D('25500.00'),
                         'o hóspede B ficou com consumo que não é dele')

    def test_a_venda_ao_passante_tem_documento_fiscal(self):
        """Sem número de série e assinatura não é uma venda — é um papel."""
        self.criar_barman()
        conta = self.abrir(tipo='PASSANTE')
        self.pedir(conta)
        self.cobrar(conta)

        from fiscal.models import FiscalDocument
        doc = FiscalDocument.objects.filter(source_module='pos', source_ref=str(conta)).first()
        self.assertIsNotNone(doc, 'a venda foi cobrada sem emitir documento fiscal')
        self.assertTrue(doc.invoice_no, 'documento fiscal sem número')
        self.assertTrue(doc.doc_hash, 'documento fiscal sem assinatura — inválido para a AGT')

    def test_a_contabilidade_fecha_com_o_que_se_vendeu(self):
        """O que uma inspecção vê. Débito igual a crédito, sem excepção."""
        self.criar_barman()
        conta = self.abrir(tipo='PASSANTE')
        self.pedir(conta, qtd=2)
        self.cobrar(conta)

        from accounting.posting import run_autopost
        run_autopost(sources=['pos'])

        lancamentos = JournalEntry.objects.all()
        self.assertTrue(lancamentos.exists(),
                        'vendeu-se e a contabilidade não tem lançamento nenhum')
        for le in lancamentos:
            debito = sum(l.debit for l in le.lines.all())
            credito = sum(l.credit for l in le.lines.all())
            self.assertEqual(debito, credito,
                             f'o lançamento {le.id} não fecha: {debito} a débito, {credito} a crédito')

    def test_o_contabilista_entra_e_ve_as_contas(self):
        """De nada serve a contabilidade estar certa se ele não lhe chega."""
        self.criar_barman()
        conta = self.abrir(tipo='PASSANTE')
        self.pedir(conta)
        self.cobrar(conta)
        from accounting.posting import run_autopost
        run_autopost(sources=['pos'])

        contabilista = self.criar_contabilista()
        self.client.force_authenticate(contabilista)

        r = self.client.get('/api/accounting/trial-balance/')
        self.assertEqual(r.status_code, 200,
                         f'o contabilista não consegue abrir o balancete: {r.content[:200]}')

    def test_o_dia_inteiro_de_uma_vez(self):
        """As quatro pessoas, pela ordem em que a casa as vê.

        Separado dos outros de propósito: cada um acima prova uma coisa, este
        prova que elas funcionam JUNTAS. Foi sempre no encontro das peças que
        os defeitos desta semana apareceram.
        """
        self.criar_contabilista()
        self.criar_barman()
        a = self.criar_hospede('301', 'Família Nunes')
        b = self.criar_hospede('302', 'Sr. Kiala')

        # manhã: o passante toma o pequeno-almoço e paga
        passante = self.abrir(tipo='PASSANTE')
        self.pedir(passante)
        self.assertEqual(self.cobrar(passante).status_code, 200)

        # tarde: os dois hóspedes consomem ao bar, com conta no quarto
        for h in (a, b):
            conta = self.abrir(tipo='HOTEL')
            self.pedir(conta, qtd=2)
            r = self.cobrar(conta, pm=self.quarto_pm, room=h['quarto'].number)
            self.assertEqual(r.status_code, 200, r.content[:300])

        # noite: fecha-se a caixa e lança-se na contabilidade
        r = self.client.post('/api/pos/ops/day-close/', {'outlet': self.outlet.id}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])

        from accounting.posting import run_autopost
        run_autopost(sources=['pos', 'treasury'])

        # ── o que tem de estar verdadeiro no fim do dia ──
        self.assertEqual(POSTicket.objects.filter(status='PAID').count(), 3,
                         'três contas foram cobradas, e o sistema não tem três')

        for h, quanto in ((a, D('17000.00')), (b, D('17000.00'))):
            total = sum(c.amount for c in FolioCharge.objects.filter(folio=h['folio']))
            self.assertEqual(total, quanto,
                             f"a conta do quarto {h['quarto'].number} não bate")

        self.assertTrue(Receipt.objects.exists(),
                        'fechou-se a caixa e não entrou dinheiro nenhum na tesouraria')

        for le in JournalEntry.objects.all():
            debito = sum(l.debit for l in le.lines.all())
            credito = sum(l.credit for l in le.lines.all())
            self.assertEqual(debito, credito, f'o lançamento {le.id} não fecha')
