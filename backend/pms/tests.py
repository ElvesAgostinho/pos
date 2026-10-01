"""
Percurso de ponta a ponta do PMS, aba a aba, com dados reais.

Corre com `python manage.py test pms` — base de dados própria e isolada, sem
precisar de servidor nem de tocar nos dados do hotel.

Cobre o caminho que o recepcionista faz todos os dias: categoria → quarto →
hóspede → reserva → disponibilidade → check-in → consumos → estorno →
pagamento → factura AGT → check-out → o quarto volta a ficar vendável. É a
rede de segurança para as ligações que já partiram uma vez (limpeza que não
libertava o quarto, factura que rebentava por falta de chave, auditoria da
noite a duplicar a diária do check-in).
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from identity.models import EnterpriseGroup, Company, Hotel
from mdm.models import Customer
from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries, TaxRate
from .models import Room, Reservation, Folio, HousekeepingTask


class PmsBase(APITestCase):
    """Hotel montado do zero: uma categoria, três quartos, um hóspede."""

    def setUp(self):
        self.user = User.objects.create_superuser('pms_test', 'pms@test.ao', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Teste')
        empresa = Company.objects.create(group=grupo, name='Empresa Teste', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Hotel Teste')

        self.hoje = date.today()
        self.guest = Customer.objects.create(code='PMS-T1', name='Hospede Teste', tax_id='500100200')

        # Categoria + 3 quartos
        r = self.client.post('/api/pms/room-types/', {
            'hotel': self.hotel.id, 'code': 'STD', 'name': 'Standard',
            'base_rate': '30000', 'capacity_adults': 2}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.rt = r.data['id']
        self.quartos = []
        for n in ('101', '102', '103'):
            rq = self.client.post('/api/pms/rooms/', {
                'hotel': self.hotel.id, 'room_type': self.rt, 'number': n,
                'status': 'VACANT_CLEAN'}, format='json')
            self.assertIn(rq.status_code, (200, 201), rq.content)
            self.quartos.append(rq.data['id'])

    def _reserva_em_checkin(self):
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=2)), 'adults': 2}, format='json')
        res_id = r.data['id']
        rc = self.client.post(f'/api/pms/reservations/{res_id}/check_in/', {}, format='json')
        self.assertIn(rc.status_code, (200, 201), rc.content)
        return res_id


class PmsPercursoCompletoTests(PmsBase):
    """Reserva → Front Desk → Contas, pela ordem das abas do PMS."""

    # ---------------------------------------------------------------- RESERVA
    def test_disponibilidade_desce_ao_reservar(self):
        """Reservar tira mesmo um quarto da disponibilidade (anti-overbooking)."""
        def livres():
            r = self.client.get('/api/pms/availability/', {
                'date_from': str(self.hoje), 'date_to': str(self.hoje)})
            self.assertEqual(r.status_code, 200, r.content)
            return (r.data.get('total') or [{}])[0].get('free')

        self.assertEqual(livres(), 3)
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=2)), 'adults': 2}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertTrue(r.data.get('confirmation'), 'reserva saiu sem número de confirmação')
        self.assertEqual(livres(), 2)

    def test_bloco_de_grupo_e_pickup(self):
        """Um bloco bloqueia quartos POR NOITE e mostra as reservas que lhe pertencem."""
        r = self.client.post('/api/pms/blocks/', {
            'hotel': self.hotel.id, 'code': 'GRUPO-A', 'description': 'Excursao',
            'valid_from': str(self.hoje), 'valid_to': str(self.hoje + timedelta(days=5))}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        bloco = r.data['id']

        for i in range(3):
            rb = self.client.post(f'/api/pms/blocks/{bloco}/room-types/', {
                'room_type': self.rt, 'date': str(self.hoje + timedelta(days=i)),
                'rooms_blocked': 2}, format='json')
            self.assertIn(rb.status_code, (200, 201), rb.content)

        self.assertEqual(len(self.client.get(f'/api/pms/blocks/{bloco}/pickup/').data), 0)
        self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'block': bloco, 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=1)), 'adults': 1}, format='json')
        self.assertEqual(len(self.client.get(f'/api/pms/blocks/{bloco}/pickup/').data), 1)

    # ------------------------------------------------------------- FRONT DESK

    def test_check_in_ocupa_quarto_e_lanca_primeira_diaria(self):
        res_id = self._reserva_em_checkin()
        self.assertEqual(Room.objects.get(id=self.quartos[0]).status, 'OCCUPIED')
        folio = Reservation.objects.get(id=res_id).folio
        self.assertIsNotNone(folio, 'check-in não abriu conta')
        self.assertEqual(folio.charges_total, Decimal('30000'))

    def test_limpeza_concluida_liberta_o_quarto(self):
        """A ligação que faltava: marcar a limpeza feita devolve o quarto a vendável."""
        quarto = Room.objects.get(id=self.quartos[1])
        quarto.status = 'VACANT_DIRTY'
        quarto.save(update_fields=['status'])

        r = self.client.post('/api/pms/tasks/', {
            'hotel': self.hotel.id, 'title': 'Limpar 102', 'room': quarto.id,
            'task_type': 'CLEANING'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        rd = self.client.post(f"/api/pms/tasks/{r.data['id']}/mark-done/", {}, format='json')

        quarto.refresh_from_db()
        self.assertEqual(quarto.status, 'VACANT_CLEAN')
        self.assertEqual(rd.data.get('room_released'), '102')

    def test_manutencao_concluida_nao_marca_quarto_como_limpo(self):
        """Reparar o chuveiro não é limpar: o quarto continua por limpar."""
        quarto = Room.objects.get(id=self.quartos[1])
        quarto.status = 'VACANT_DIRTY'
        quarto.save(update_fields=['status'])

        r = self.client.post('/api/pms/tasks/', {
            'hotel': self.hotel.id, 'title': 'Reparar chuveiro', 'room': quarto.id,
            'task_type': 'MAINTENANCE'}, format='json')
        self.client.post(f"/api/pms/tasks/{r.data['id']}/mark-done/", {}, format='json')

        quarto.refresh_from_db()
        self.assertEqual(quarto.status, 'VACANT_DIRTY')

    def test_limpeza_com_hospede_dentro_nao_desocupa(self):
        self._reserva_em_checkin()
        quarto = Room.objects.get(id=self.quartos[0])
        self.assertEqual(quarto.status, 'OCCUPIED')

        r = self.client.post('/api/pms/tasks/', {
            'hotel': self.hotel.id, 'title': 'Limpeza diaria', 'room': quarto.id,
            'task_type': 'CLEANING'}, format='json')
        self.client.post(f"/api/pms/tasks/{r.data['id']}/mark-done/", {}, format='json')

        quarto.refresh_from_db()
        self.assertEqual(quarto.status, 'OCCUPIED', 'limpeza desocupou um quarto com hóspede lá dentro')

    def test_perdidos_achados_e_lista_telefonica(self):
        r = self.client.post('/api/pms/lost-found-items/', {
            'hotel': self.hotel.id, 'description': 'Oculos', 'found_location': 'Piscina',
            'found_date': str(self.hoje), 'status': 'FOUND'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        rp = self.client.patch(f"/api/pms/lost-found-items/{r.data['id']}/", {
            'status': 'CLAIMED', 'claimed_by': 'Hospede Teste'}, format='json')
        self.assertEqual(rp.data['status'], 'CLAIMED')

        self.client.post('/api/pms/phone-directory/', {
            'hotel': self.hotel.id, 'name': 'Receção', 'department': 'Front Office',
            'extension': '100'}, format='json')
        achados = self.client.get('/api/pms/phone-directory/', {'q': 'Rece'}).data
        self.assertEqual(len(achados), 1)

    # ----------------------------------------------------------------- CONTAS
    def test_conta_lancamento_estorno_e_pagamento(self):
        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio

        self.client.post(f'/api/pms/folios/{folio.id}/post_charge/', {
            'charge_type': 'FNB', 'description': 'Almoço', 'amount': '6000'}, format='json')
        folio.refresh_from_db()
        self.assertEqual(folio.balance, Decimal('36000'))

        errado = self.client.post(f'/api/pms/folios/{folio.id}/post_charge/', {
            'charge_type': 'MISC', 'description': 'Engano', 'amount': '5000'}, format='json')
        self.client.post(f'/api/pms/folios/{folio.id}/reverse-charge/', {
            'charge': errado.data['id'], 'reason': 'Lançado por engano'}, format='json')
        folio.refresh_from_db()
        self.assertEqual(folio.balance, Decimal('36000'), 'o estorno não repôs o saldo')

        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        folio.refresh_from_db()
        self.assertEqual(folio.balance, Decimal('0'))

    def test_check_out_bloqueado_com_conta_por_liquidar(self):
        res_id = self._reserva_em_checkin()
        r = self.client.post(f'/api/pms/reservations/{res_id}/check_out/', {}, format='json')
        self.assertEqual(r.status_code, 409, 'deixou sair sem pagar')

    def test_ciclo_fecha_com_factura_e_quarto_volta_a_ficar_vendavel(self):
        """O ciclo inteiro: factura AGT assinada, check-out, quarto por limpar."""
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif, cfg.environment = 'Hotel Teste Lda', '5000000000', 'TEST'
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        tipo = FiscalDocType.objects.create(code='FR', name='Factura-Recibo', signable=True)
        FiscalSeries.objects.create(code='T', doc_type=tipo, year=self.hoje.year,
                                    certified=True, is_active=True, environment='TEST')

        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio
        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')

        r = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertTrue(r.data.get('invoice_number'), 'factura saiu sem número')
        self.assertEqual(str(r.data['total']), '30000.00')

        # Facturar a MESMA conta outra vez tem de ser recusado.
        r2 = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')
        self.assertEqual(r2.status_code, 400, 'deixou facturar a mesma conta duas vezes')

        rc = self.client.post(f'/api/pms/reservations/{res_id}/check_out/', {}, format='json')
        self.assertIn(rc.status_code, (200, 201), rc.content)
        self.assertEqual(Room.objects.get(id=self.quartos[0]).status, 'VACANT_DIRTY')
        folio.refresh_from_db()
        self.assertEqual(folio.status, 'CLOSED')

    # --------------------------------------------------- AUDITORIA DA NOITE
    def test_auditoria_da_noite_nao_duplica_a_diaria_do_check_in(self):
        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio

        r = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(self.hoje)}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(r.data.get('rooms_charged'), 0, 'relançou a diária que o check-in já lançou')
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('30000'))

        amanha = self.hoje + timedelta(days=1)
        r = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(amanha)}, format='json')
        self.assertEqual(r.data.get('rooms_charged'), 1)
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('60000'))

        # A mesma data duas vezes tem de ser recusada.
        r = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(amanha)}, format='json')
        self.assertEqual(r.status_code, 409)
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('60000'))


class PmsMenusRestantesTests(PmsBase):
    """Os menus que o percurso do recepcionista não atravessa: Gestão de
    Canais, Marketing, Reporting, Utilitários e EMS. Vários destes ecrãs não
    têm motor próprio — reutilizam o do POS (pontos de fidelização, relatórios,
    fecho do dia, SAF-T) ou o do Financeiro. Testá-los é testar essa ligação:
    se o PMS deixar de falar com o motor do outro módulo, o ecrã fica vazio sem
    dar erro, que é a avaria mais difícil de ver.
    """

    # -------------------------------------------------------- GESTÃO DE CANAIS
    def _rate_plan(self, price='30000'):
        r = self.client.post('/api/pms/rate-plans/', {
            'hotel': self.hotel.id, 'room_type': self.rt, 'code': 'BAR',
            'name': 'Melhor tarifa', 'price_per_night': price, 'board': 'BB'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data['id']

    def test_calendario_de_tarifas_mexe_na_excecao_nao_no_preco_base(self):
        """Encarecer um sábado não pode mudar a tarifa de todos os outros dias."""
        plano = self._rate_plan()
        sabado = self.hoje + timedelta(days=3)
        r = self.client.post('/api/pms/rate-overrides/', {
            'rate_plan': plano, 'date': str(sabado), 'price_per_night': '45000'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)

        base = self.client.get(f'/api/pms/rate-plans/{plano}/').data
        self.assertEqual(str(base['price_per_night']), '30000.00', 'a excepção mexeu no preço base')

        linhas = self.client.get('/api/pms/rate-overrides/', {'rate_plan': plano}).data
        self.assertEqual(len(linhas), 1)

        # Duas excepções para o mesmo dia seriam dois preços para o mesmo dia.
        r2 = self.client.post('/api/pms/rate-overrides/', {
            'rate_plan': plano, 'date': str(sabado), 'price_per_night': '50000'}, format='json')
        self.assertEqual(r2.status_code, 400, 'aceitou dois preços para o mesmo dia')

        # Remover a excepção devolve o dia à tarifa base, sem tocar no plano.
        self.client.delete(f"/api/pms/rate-overrides/{linhas[0]['id']}/")
        self.assertEqual(len(self.client.get('/api/pms/rate-overrides/').data), 0)
        self.assertEqual(
            str(self.client.get(f'/api/pms/rate-plans/{plano}/').data['price_per_night']), '30000.00')

    def test_fechar_um_dia_a_reservas_nao_apaga_a_tarifa(self):
        plano = self._rate_plan()
        dia = self.hoje + timedelta(days=5)
        r = self.client.post('/api/pms/rate-overrides/', {
            'rate_plan': plano, 'date': str(dia), 'is_bookable': False}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertFalse(r.data['is_bookable'])
        self.assertIsNone(r.data['price_per_night'], 'fechar o dia inventou um preço')

    def test_chatbot_responde_com_o_inventario_real(self):
        self._rate_plan()
        r = self.client.post('/api/pms/chatbot-settings/', {
            'hotel': self.hotel.id, 'whatsapp_phone_number': '+244900000000',
            'welcome_message': 'Bem-vindo ao Hotel Teste!', 'is_active': True}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)

        saud = self.client.post('/api/pms/chatbot/simulate/', {'message': 'Ola'}, format='json')
        self.assertEqual(saud.data['intent'], 'greeting')
        self.assertEqual(saud.data['reply'], 'Bem-vindo ao Hotel Teste!',
                         'o robô não usa a mensagem configurada')

        disp = self.client.post('/api/pms/chatbot/simulate/', {
            'message': 'tem quartos disponiveis?'}, format='json')
        self.assertEqual(disp.data['intent'], 'availability')
        self.assertIn('Standard', disp.data['reply'], 'não leu as categorias reais')
        self.assertIn('3 disponível', disp.data['reply'], 'não leu o número real de quartos livres')

        # 'oi' dentro de "c-oi-sa" não é um cumprimento.
        self.assertEqual(self.client.post('/api/pms/chatbot/simulate/', {
            'message': 'qualquer coisa'}, format='json').data['intent'], 'fallback')
        # Nem dentro de "n-oi-te" — e quem pergunta o preço quer o preço.
        self.assertEqual(self.client.post('/api/pms/chatbot/simulate/', {
            'message': 'Quanto custa uma noite?'}, format='json').data['intent'], 'availability')
        # Cumprimento + pergunta na mesma mensagem: responde-se à pergunta.
        self.assertEqual(self.client.post('/api/pms/chatbot/simulate/', {
            'message': 'Boa noite, tem quartos livres?'}, format='json').data['intent'],
            'availability')
        self.assertEqual(self.client.post('/api/pms/chatbot/simulate/', {
            'message': '  '}, format='json').status_code, 400)

    # ------------------------------------------------------------------ CONTAS
    def test_financeiro_numera_recibos_e_pagamentos_sozinho(self):
        conta = self.client.post('/api/finance/accounts/', {
            'hotel': self.hotel.id, 'code': 'CX', 'name': 'Caixa',
            'account_type': 'CASH'}, format='json')
        self.assertIn(conta.status_code, (200, 201), conta.content)
        centro = self.client.post('/api/finance/cost-centers/', {
            'hotel': self.hotel.id, 'code': 'AL', 'name': 'Alojamento'}, format='json')
        self.assertIn(centro.status_code, (200, 201), centro.content)

        rec = self.client.post('/api/finance/receipts/', {
            'account': conta.data['id'], 'cost_center': centro.data['id'],
            'party_name': 'Hospede Teste', 'description': 'Sinal de reserva',
            'amount': '15000', 'date': str(self.hoje)}, format='json')
        self.assertIn(rec.status_code, (200, 201), rec.content)
        self.assertTrue(rec.data['number'].startswith('REC'), rec.data['number'])

        pag = self.client.post('/api/finance/payments/', {
            'account': conta.data['id'], 'party_name': 'Fornecedor Teste',
            'description': 'Lavandaria', 'amount': '8000', 'date': str(self.hoje)}, format='json')
        self.assertIn(pag.status_code, (200, 201), pag.content)
        self.assertTrue(pag.data['number'].startswith('PAG'), pag.data['number'])

        self.assertEqual(len(self.client.get('/api/finance/receipts/').data), 1)
        self.assertEqual(len(self.client.get('/api/finance/payments/').data), 1)

    # --------------------------------------------------------------- MARKETING
    def test_campos_personalizados_definem_se_mas_ainda_nao_se_preenchem(self):
        """Trava a meia-funcionalidade onde ela está, em vez de a deixar
        parecer pronta: a DEFINIÇÃO do campo tem endpoint e responde; o VALOR
        por entidade não tem onde ser guardado (nenhum modelo o guarda), por
        isso "Mostrar na pesquisa" ainda não pode desenhar coluna nenhuma.
        No dia em que o armazém de valores existir, este teste falha — e é
        isso que se quer: obriga a vir aqui acabar a história."""
        from pos.models import CustomFieldDef
        r = self.client.post('/api/pos/config/custom-fields/', {
            'code': 'num_voo', 'name': 'No do voo', 'location': 'ENTITY',
            'field_type': 'TEXT', 'show_in_search': True, 'is_active': True}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)

        porLocal = self.client.get('/api/pos/config/custom-fields/', {'location': 'ENTITY'})
        self.assertEqual(porLocal.status_code, 200, porLocal.content)
        self.assertEqual([c['code'] for c in porLocal.data], ['num_voo'])
        self.assertEqual(len(self.client.get('/api/pos/config/custom-fields/',
                                             {'location': 'TICKET'}).data), 0)

        # Nada no sistema guarda o VALOR de um campo personalizado.
        nomes = {f.name for f in CustomFieldDef._meta.get_fields()}
        self.assertNotIn('values', nomes,
                         'já existe armazém de valores — acabar a ligação à pesquisa '
                         'de entidades e actualizar este teste')

        # A lista de entidades responde e mantém a forma esperada pelo ecrã.
        lista = self.client.get('/api/pos/marketing/entities/')
        self.assertEqual(lista.status_code, 200, lista.content)
        linhas = lista.data if isinstance(lista.data, list) else lista.data.get('results', [])
        self.assertEqual([e['code'] for e in linhas], ['PMS-T1'])

    def test_gestao_de_pontos_usa_o_motor_do_pos(self):
        """Não há motor de pontos no PMS: é o cartão de membro do POS."""
        r = self.client.post('/api/pos/config/member-cards/', {
            'code': 'OURO', 'name': 'Cartao Ouro', 'has_points': True,
            'is_active': True}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        lista = self.client.get('/api/pos/config/member-cards/')
        self.assertEqual(lista.status_code, 200, lista.content)
        linhas = lista.data if isinstance(lista.data, list) else lista.data.get('results', [])
        self.assertEqual([c['code'] for c in linhas], ['OURO'])

    # --------------------------------------------------------------- REPORTING
    def test_relatorios_do_pms_contam_a_reserva_que_existe(self):
        self._reserva_em_checkin()      # 2 noites, 30000/noite, 3 quartos no hotel
        p = {'date_from': str(self.hoje), 'date_to': str(self.hoje + timedelta(days=1))}

        perf = self.client.get('/api/pms/reports/performance/', p)
        self.assertEqual(perf.status_code, 200, perf.content)
        self.assertEqual(perf.data['reservations'], 1)
        self.assertEqual(perf.data['revenue'], 60000.0, 'receita de 2 noites mal somada')
        self.assertEqual(perf.data['adr'], 30000.0)
        # 2 noites vendidas em 6 noites-quarto disponíveis (3 quartos x 2 dias)
        self.assertEqual(perf.data['occupancy_pct'], 33.3)

        ocup = self.client.get('/api/pms/reports/occupancy/', p)
        self.assertEqual(ocup.status_code, 200, ocup.content)
        self.assertEqual([l['rooms_occupied'] for l in ocup.data['rows']], [1, 1])
        self.assertEqual(ocup.data['total_revenue'], 60000.0)
        self.assertEqual(sum(l['check_ins'] for l in ocup.data['rows']), 1)

        for nome in ('revenue', 'payments', 'charges', 'housekeeping'):
            r = self.client.get(f'/api/pms/reports/{nome}/', p)
            self.assertEqual(r.status_code, 200, f'{nome}: {r.content}')

    def test_relatorios_e_informacao_online_do_pos(self):
        cat = self.client.get('/api/pos/reports/catalog/')
        self.assertEqual(cat.status_code, 200, cat.content)
        codigos = self._codigos_do_catalogo(cat.data)
        self.assertTrue(codigos, 'catálogo de relatórios vazio')

        corrido = self.client.post('/api/pos/reports/run/', {
            'code': codigos[0], 'params': {}}, format='json')
        self.assertEqual(corrido.status_code, 200, corrido.content)
        self.assertIn('columns', corrido.data)

        self.assertEqual(self.client.post('/api/pos/reports/run/', {
            'code': 'nao_existe', 'params': {}}, format='json').status_code, 404)

        self.assertEqual(self.client.get('/api/pos/reports/online/').status_code, 200)

    @staticmethod
    def _codigos_do_catalogo(data):
        """O catálogo vem em pastas: {'folders': [{reports: [...]}], 'filters': …}."""
        return [r['code'] for pasta in (data.get('folders') or []) for r in (pasta.get('reports') or [])]

    # -------------------------------------------------------------- UTILITÁRIOS
    def test_utilitarios_fecho_do_dia_saft_e_diagnostico_respondem(self):
        for caminho in ('day-close', 'saft', 'diagnostics'):
            r = self.client.get(f'/api/pos/ops/{caminho}/')
            self.assertEqual(r.status_code, 200, f'{caminho}: {r.content}')

    def test_utilizadores_do_pms_vem_dos_perfis_de_acesso(self):
        r = self.client.get('/api/eae/profiles/')
        self.assertEqual(r.status_code, 200, r.content)

    # ---------------------------------------------------------------- PLANNING
    def test_planning_cruza_quartos_com_reservas(self):
        res_id = self._reserva_em_checkin()
        quartos = self.client.get('/api/pms/rooms/')
        self.assertEqual(quartos.status_code, 200, quartos.content)
        self.assertEqual(len(quartos.data), 3)

        reservas = self.client.get('/api/pms/reservations/', {
            'date_from': str(self.hoje), 'date_to': str(self.hoje + timedelta(days=2))})
        self.assertEqual(reservas.status_code, 200, reservas.content)
        linha = [r for r in reservas.data if r['id'] == res_id]
        self.assertEqual(len(linha), 1, 'a reserva não aparece no planning')
        self.assertEqual(linha[0]['room'], self.quartos[0],
                         'o planning não sabe em que quarto está o hóspede')

    # --------------------------------------------------------------------- EMS
    def test_ems_evento_filtros_e_previsao(self):
        confirmado = self.client.post('/api/pms/events/', {
            'hotel': self.hotel.id, 'name': 'Casamento Teste',
            'event_date': str(self.hoje + timedelta(days=20)), 'venue': 'Jardim',
            'client': self.guest.id, 'expected_guests': 120,
            'status': 'CONFIRMED', 'estimated_revenue': '900000'}, format='json')
        self.assertIn(confirmado.status_code, (200, 201), confirmado.content)
        pedido = self.client.post('/api/pms/events/', {
            'hotel': self.hotel.id, 'name': 'Conferencia Teste',
            'event_date': str(self.hoje + timedelta(days=25)), 'venue': 'Sala A',
            'status': 'INQUIRY', 'estimated_revenue': '400000'}, format='json')
        self.assertIn(pedido.status_code, (200, 201), pedido.content)

        self.assertEqual(len(self.client.get('/api/pms/events/').data), 2)
        self.assertEqual(len(self.client.get('/api/pms/events/', {'status': 'CONFIRMED'}).data), 1)
        self.assertEqual(len(self.client.get('/api/pms/events/', {'q': 'Jardim'}).data), 1)
        self.assertEqual(len(self.client.get('/api/pms/events/', {'q': 'Hospede'}).data), 1,
                         'não encontra o evento pelo nome do cliente')

        prev = self.client.get('/api/pms/events/forecast/', {'months': 3})
        self.assertEqual(prev.status_code, 200, prev.content)
        self.assertEqual(prev.data['total'], 900000.0,
                         'a previsão contou um evento que ainda é só um pedido')

        # Confirmar o pedido faz a previsão subir — é o funil a funcionar.
        self.client.patch(f"/api/pms/events/{pedido.data['id']}/",
                          {'status': 'CONFIRMED'}, format='json')
        self.assertEqual(self.client.get('/api/pms/events/forecast/', {'months': 3}).data['total'],
                         1300000.0)

    def test_previsao_ems_ignora_eventos_fora_da_janela(self):
        self.client.post('/api/pms/events/', {
            'hotel': self.hotel.id, 'name': 'Evento daqui a dois anos',
            'event_date': str(self.hoje + timedelta(days=730)), 'status': 'CONFIRMED',
            'estimated_revenue': '1000000'}, format='json')
        prev = self.client.get('/api/pms/events/forecast/', {'months': 3})
        self.assertEqual(prev.data['total'], 0.0)
        self.assertEqual(len(prev.data['rows']), 3)

    # ------------------------------------------------- LEITOR DE DOCUMENTOS
    def test_leitor_de_documentos_grava_na_ficha_do_hospede(self):
        """O leitor não tem ficheiro próprio: escreve na ficha do cliente
        (mdm.Customer), a mesma que o POS e a facturação usam."""
        r = self.client.patch(f'/api/mdm/customers/{self.guest.id}/', {
            'id_number': 'N0012345', 'nationality': 'Angolana'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.guest.refresh_from_db()
        self.assertEqual(self.guest.id_number, 'N0012345')
        self.assertEqual(self.guest.nationality, 'Angolana')
