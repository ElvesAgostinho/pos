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
        # A estadia começa ONTEM de propósito: a Auditoria da Noite fecha
        # noites que já terminaram (correr-lhe uma data futura é recusado, ver
        # PmsAuditoriaDaNoiteTests), por isso a "noite seguinte" que se quer
        # ver aqui a ser lançada pela auditoria tem de ser uma noite passada.
        ontem = self.hoje - timedelta(days=1)
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(ontem),
            'check_out': str(self.hoje + timedelta(days=1)), 'adults': 2}, format='json')
        res_id = r.data['id']
        self.assertIn(self.client.post(f'/api/pms/reservations/{res_id}/check_in/', {},
                                       format='json').status_code, (200, 201))
        folio = Reservation.objects.get(id=res_id).folio

        r = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(self.hoje)}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(r.data.get('rooms_charged'), 0, 'relançou a diária que o check-in já lançou')
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('30000'))

        r = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
        self.assertEqual(r.data.get('rooms_charged'), 1)
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('60000'))

        # A mesma data duas vezes tem de ser recusada.
        r = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
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
    def test_campos_personalizados_separam_se_por_onde_aparecem(self):
        """Um campo definido para a Conta POS não é um campo da ficha do
        cliente. Quem pergunta pelos campos de um sítio não pode receber os
        do outro — era assim que um "Mesa preferida" ia parar à ficha de uma
        empresa."""
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'num_voo', 'name': 'No do voo', 'location': 'ENTITY',
            'field_type': 'TEXT', 'show_in_search': True, 'is_active': True}, format='json')
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'mesa_pref', 'name': 'Mesa preferida', 'location': 'TICKET',
            'field_type': 'TEXT', 'is_active': True}, format='json')

        entidade = self.client.get('/api/pos/config/custom-fields/', {'location': 'ENTITY'})
        self.assertEqual(entidade.status_code, 200, entidade.content)
        self.assertEqual([c['code'] for c in entidade.data], ['num_voo'])
        self.assertEqual([c['code'] for c in self.client.get(
            '/api/pos/config/custom-fields/', {'location': 'TICKET'}).data], ['mesa_pref'])

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


class PmsCanaisEDepositosTests(PmsBase):
    """As três peças que faltavam: mapear categorias nas OTAs, cobrar o
    depósito de uma reserva online, e os campos personalizados da ficha."""

    # ------------------------------------------------- MAPEAMENTO NOS CANAIS
    def _canal(self, nome='Booking Teste', com_credenciais=True):
        dados = {'hotel': self.hotel.id, 'name': nome, 'provider': 'BOOKING',
                 'commission_percent': '15'}
        if com_credenciais:
            dados.update({'property_id': '123456', 'api_key': 'chave-de-teste'})
        r = self.client.post('/api/pms/channels/', dados, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data['id']

    def test_canal_novo_nao_tem_categorias_mapeadas(self):
        canal = self._canal()
        self.assertEqual(self.client.get(f'/api/pms/channels/{canal}/').data['mapped_rooms'], 0)

    def test_mapear_uma_categoria_conta_no_ecra(self):
        canal = self._canal()
        r = self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': self.rt, 'ota_room_id': 'BK-77001',
            'max_rooms': 2}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(r.data['room_type_name'], 'Standard')
        self.assertEqual(r.data['rooms_available'], 3, 'não contou os quartos reais da categoria')

        self.assertEqual(self.client.get(f'/api/pms/channels/{canal}/').data['mapped_rooms'], 1)
        self.assertEqual(len(self.client.get('/api/pms/channel-room-maps/',
                                             {'channel': canal}).data), 1)

    def test_a_mesma_categoria_nao_vai_duas_vezes_ao_mesmo_canal(self):
        """Seriam duas disponibilidades contraditórias para o mesmo quarto."""
        canal = self._canal()
        self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': self.rt, 'ota_room_id': 'BK-77001'}, format='json')
        r = self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': self.rt, 'ota_room_id': 'BK-99999'}, format='json')
        self.assertEqual(r.status_code, 400, 'aceitou a mesma categoria duas vezes no canal')

    def test_dois_quartos_nossos_nao_apontam_ao_mesmo_quarto_da_ota(self):
        """Somaria o inventário de categorias diferentes no mesmo anúncio."""
        canal = self._canal()
        outra = self.client.post('/api/pms/room-types/', {
            'hotel': self.hotel.id, 'code': 'SUITE', 'name': 'Suite',
            'base_rate': '70000', 'capacity_adults': 2}, format='json')
        self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': self.rt, 'ota_room_id': 'BK-77001'}, format='json')
        r = self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': outra.data['id'], 'ota_room_id': 'BK-77001'}, format='json')
        self.assertEqual(r.status_code, 400, 'duas categorias nossas no mesmo quarto da OTA')

    def test_canal_de_um_hotel_nao_mapeia_categoria_de_outro(self):
        """Publicaria na OTA de uma propriedade o inventário de outra."""
        from pms.models import RoomType
        outro_grupo = EnterpriseGroup.objects.create(name='Grupo B')
        outra_empresa = Company.objects.create(group=outro_grupo, name='Empresa B', tax_id='5000000001')
        outro_hotel = Hotel.objects.create(company=outra_empresa, name='Hotel B')
        # Criada pelo ORM de propósito: ao criar pela API, o isolamento por
        # propriedade (HotelScopedMixin) força o hotel activo e a categoria
        # nasceria neste hotel — o caso que se quer testar nunca existiria.
        rt_b = RoomType.objects.create(hotel=outro_hotel, code='B1', name='Quarto B',
                                       base_rate=10000)

        canal = self._canal()
        r = self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': rt_b.id, 'ota_room_id': 'X-1'}, format='json')
        self.assertEqual(r.status_code, 400, 'mapeou a categoria de outro hotel')
        self.assertIn('propriedade', str(r.data).lower())

    def test_tarifa_mapeada_tem_de_ser_da_mesma_categoria(self):
        canal = self._canal()
        outra = self.client.post('/api/pms/room-types/', {
            'hotel': self.hotel.id, 'code': 'SUITE', 'name': 'Suite',
            'base_rate': '70000'}, format='json')
        plano_suite = self.client.post('/api/pms/rate-plans/', {
            'hotel': self.hotel.id, 'room_type': outra.data['id'], 'code': 'SUI',
            'name': 'Tarifa Suite', 'price_per_night': '70000'}, format='json')
        r = self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': self.rt, 'ota_room_id': 'BK-1',
            'rate_plan': plano_suite.data['id']}, format='json')
        self.assertEqual(r.status_code, 400, 'ligou a tarifa da Suite à categoria Standard')

    def test_sincronizar_sem_mapeamento_e_recusado_e_explica_porque(self):
        """Era o buraco: sincronizava-se um canal que não sabia traduzir
        categoria nenhuma, e a mensagem só falava de credenciais."""
        canal = self._canal()
        r = self.client.post(f'/api/pms/channels/{canal}/sync_availability/', {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(r.data['status'], 'SKIPPED')
        self.assertIn('mapeada', r.data['summary'])

    def test_com_mapeamento_a_queixa_passa_a_ser_das_credenciais(self):
        canal = self._canal(com_credenciais=False)
        self.client.post('/api/pms/channel-room-maps/', {
            'channel': canal, 'room_type': self.rt, 'ota_room_id': 'BK-1'}, format='json')
        r = self.client.post(f'/api/pms/channels/{canal}/sync_availability/', {}, format='json')
        self.assertEqual(r.data['status'], 'SKIPPED')
        self.assertIn('credenciais', r.data['summary'].lower())

    def test_mapeamento_automatico_nao_repete_o_que_ja_existe(self):
        canal = self._canal()
        self.client.post('/api/pms/room-types/', {
            'hotel': self.hotel.id, 'code': 'SUITE', 'name': 'Suite',
            'base_rate': '70000'}, format='json')

        r = self.client.post('/api/pms/channel-room-maps/auto-map/', {'channel': canal}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['created'], 2)
        self.assertEqual(sorted(m['ota_room_id'] for m in r.data['results']), ['STD', 'SUITE'])

        repetido = self.client.post('/api/pms/channel-room-maps/auto-map/',
                                    {'channel': canal}, format='json')
        self.assertEqual(repetido.data['created'], 0, 'o automático duplicou mapeamentos')
        self.assertEqual(self.client.get(f'/api/pms/channels/{canal}/').data['mapped_rooms'], 2)

    # -------------------------------------------- DEPÓSITO DA RESERVA ONLINE
    def _motor_de_reservas(self, deposito='30', provedor='SIMULATED'):
        r = self.client.post('/api/pms/booking-settings/', {
            'hotel': self.hotel.id, 'slug': 'hotel-teste', 'enabled': True,
            'deposit_percent': deposito, 'payment_enabled': True,
            'payment_provider': provedor, 'currency': 'AOA'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data

    def _reservar_no_site(self):
        entrada = self.hoje + timedelta(days=10)
        r = self.client.post('/api/pms/booking/reserve/', {
            'slug': 'hotel-teste', 'room_type': self.rt,
            'check_in': str(entrada), 'check_out': str(entrada + timedelta(days=2)),
            'adults': 2, 'guest': {'name': 'Hospede Web', 'email': 'web@teste.ao',
                                   'phone': '+244900111222'}}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data

    def test_reserva_online_deixa_o_deposito_registado(self):
        """Antes o valor era calculado, mandado para o ecrã e esquecido."""
        self._motor_de_reservas(deposito='30')
        res = self._reservar_no_site()
        # 2 noites x 30000 = 60000; 30% = 18000
        self.assertEqual(res['total'], '60000.00')
        self.assertEqual(res['deposit_due'], '18000.00')
        self.assertIsNotNone(res['payment_id'], 'o depósito não ficou registado em lado nenhum')
        self.assertEqual(res['payment_status'], 'PENDING')

        pend = self.client.get('/api/pms/booking-payments/', {'status': 'PENDING'})
        self.assertEqual(len(pend.data), 1, 'a recepção não vê o depósito por receber')
        self.assertEqual(pend.data[0]['confirmation'], res['confirmation'])
        self.assertEqual(pend.data[0]['guest_name'], 'Hospede Web')

    def test_sem_percentagem_de_deposito_nao_se_inventa_pagamento(self):
        self._motor_de_reservas(deposito='0')
        res = self._reservar_no_site()
        self.assertEqual(res['deposit_due'], '0.00')
        self.assertIsNone(res['payment_id'])
        self.assertEqual(len(self.client.get('/api/pms/booking-payments/').data), 0)

    def test_pagar_no_site_e_o_deposito_entra_na_conta_no_check_in(self):
        """O percurso inteiro do dinheiro: site → registo → conta do hóspede."""
        self._motor_de_reservas(deposito='30')
        res = self._reservar_no_site()

        pago = self.client.post('/api/pms/booking/pay/', {
            'slug': 'hotel-teste', 'confirmation': res['confirmation']}, format='json')
        self.assertEqual(pago.status_code, 200, pago.content)
        self.assertEqual(pago.data['status'], 'PAID')
        self.assertTrue(pago.data['reference'])

        reserva = Reservation.objects.get(confirmation=res['confirmation'])
        rc = self.client.post(f'/api/pms/reservations/{reserva.id}/check_in/',
                              {'room': self.quartos[0]}, format='json')
        self.assertIn(rc.status_code, (200, 201), rc.content)
        self.assertEqual(rc.data.get('deposits_posted'), 1,
                         'o que o hóspede pagou online não entrou na conta')

        folio = Folio.objects.get(reservation=reserva)
        self.assertEqual(folio.payments_total, Decimal('18000'))
        # Diária de 30000 lançada no check-in, menos os 18000 já pagos.
        self.assertEqual(folio.balance, Decimal('12000'))

    def test_o_deposito_nao_entra_duas_vezes_na_conta(self):
        self._motor_de_reservas(deposito='50')
        res = self._reservar_no_site()
        self.client.post('/api/pms/booking/pay/', {
            'slug': 'hotel-teste', 'confirmation': res['confirmation']}, format='json')
        reserva = Reservation.objects.get(confirmation=res['confirmation'])
        self.client.post(f'/api/pms/reservations/{reserva.id}/check_in/',
                         {'room': self.quartos[0]}, format='json')
        folio = Folio.objects.get(reservation=reserva)
        antes = folio.payments_total

        from pms.views import lancar_depositos_no_folio
        self.assertEqual(lancar_depositos_no_folio(reserva, folio), 0)
        folio.refresh_from_db()
        self.assertEqual(folio.payments_total, antes, 'lançou o mesmo depósito outra vez')

    def test_deposito_por_pagar_nao_entra_na_conta(self):
        """Um pedido de pagamento pendente não é dinheiro."""
        self._motor_de_reservas(deposito='30')
        res = self._reservar_no_site()
        reserva = Reservation.objects.get(confirmation=res['confirmation'])
        rc = self.client.post(f'/api/pms/reservations/{reserva.id}/check_in/',
                              {'room': self.quartos[0]}, format='json')
        self.assertNotIn('deposits_posted', rc.data)
        self.assertEqual(Folio.objects.get(reservation=reserva).payments_total, Decimal('0'))

    def test_provedor_real_nao_se_dá_por_pago_porque_o_cliente_disse(self):
        """Multicaixa/EMIS/Stripe: quem confirma é o gateway, não o browser."""
        self._motor_de_reservas(deposito='30', provedor='MULTICAIXA')
        res = self._reservar_no_site()
        r = self.client.post('/api/pms/booking/pay/', {
            'slug': 'hotel-teste', 'confirmation': res['confirmation'],
            'reference': 'MCX-999'}, format='json')
        self.assertEqual(r.status_code, 202, r.content)
        self.assertEqual(r.data['status'], 'PENDING')

        pagamento = self.client.get('/api/pms/booking-payments/').data[0]
        self.assertEqual(pagamento['status'], 'PENDING')
        self.assertIn('não está credenciado', pagamento['message'])

    def test_recepcao_confirma_a_transferencia_e_fica_registado_quem_foi(self):
        self._motor_de_reservas(deposito='30', provedor='MULTICAIXA')
        res = self._reservar_no_site()
        pagamento = self.client.get('/api/pms/booking-payments/').data[0]

        r = self.client.post(f"/api/pms/booking-payments/{pagamento['id']}/mark-paid/", {
            'method': 'TRANSFER', 'reference': 'BAI-00012'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['status'], 'PAID')
        self.assertEqual(r.data['confirmed_by'], 'pms_test')
        self.assertEqual(r.data['reference'], 'BAI-00012')
        # Ainda não há conta aberta — entra no check-in.
        self.assertEqual(r.data['posted_now'], 0)

        repetido = self.client.post(f"/api/pms/booking-payments/{pagamento['id']}/mark-paid/",
                                    {}, format='json')
        self.assertEqual(repetido.status_code, 409, 'confirmou o mesmo depósito duas vezes')

    def test_confirmar_com_o_hospede_ja_dentro_lanca_logo_na_conta(self):
        self._motor_de_reservas(deposito='30', provedor='MULTICAIXA')
        res = self._reservar_no_site()
        reserva = Reservation.objects.get(confirmation=res['confirmation'])
        self.client.post(f'/api/pms/reservations/{reserva.id}/check_in/',
                         {'room': self.quartos[0]}, format='json')

        pagamento = self.client.get('/api/pms/booking-payments/').data[0]
        r = self.client.post(f"/api/pms/booking-payments/{pagamento['id']}/mark-paid/",
                             {'method': 'CASH'}, format='json')
        self.assertEqual(r.data['posted_now'], 1)
        self.assertEqual(Folio.objects.get(reservation=reserva).payments_total, Decimal('18000'))

    def test_pagar_uma_reserva_que_nao_deve_nada(self):
        self._motor_de_reservas(deposito='30')
        res = self._reservar_no_site()
        self.client.post('/api/pms/booking/pay/', {
            'slug': 'hotel-teste', 'confirmation': res['confirmation']}, format='json')
        outra_vez = self.client.post('/api/pms/booking/pay/', {
            'slug': 'hotel-teste', 'confirmation': res['confirmation']}, format='json')
        self.assertEqual(outra_vez.status_code, 400)
        self.assertIn('já está paga', outra_vez.data['detail'])

    # ------------------------------------------------- CAMPOS PERSONALIZADOS
    def _definir_campo(self, **kw):
        dados = {'code': 'num_voo', 'name': 'No do voo', 'location': 'ENTITY',
                 'field_type': 'TEXT', 'show_in_search': True, 'is_active': True}
        dados.update(kw)
        r = self.client.post('/api/pos/config/custom-fields/', dados, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data

    def test_campo_personalizado_grava_e_le_se_na_ficha(self):
        """A metade que faltava: definir o campo já dava, escrever o valor não."""
        self._definir_campo()
        r = self.client.patch(f'/api/pos/marketing/entities/{self.guest.id}/', {
            'custom_fields': {'num_voo': 'TAAG DT651'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['custom_fields'], {'num_voo': 'TAAG DT651'})

        relido = self.client.get(f'/api/pos/marketing/entities/{self.guest.id}/')
        self.assertEqual(relido.data['custom_fields']['num_voo'], 'TAAG DT651')

    def test_o_valor_aparece_na_pesquisa_de_entidades(self):
        self._definir_campo()
        self.client.patch(f'/api/pos/marketing/entities/{self.guest.id}/', {
            'custom_fields': {'num_voo': 'TAAG DT651'}}, format='json')

        lista = self.client.get('/api/pos/marketing/entities/')
        self.assertEqual(lista.status_code, 200, lista.content)
        linhas = lista.data if isinstance(lista.data, list) else lista.data.get('results', [])
        self.assertEqual(linhas[0]['custom_fields'], {'num_voo': 'TAAG DT651'})

        # As colunas a desenhar vêm da configuração — fonte única.
        colunas = self.client.get('/api/pos/config/custom-fields/', {'location': 'ENTITY'}).data
        self.assertEqual([c['code'] for c in colunas if c['show_in_search']], ['num_voo'])

    def test_apagar_o_valor_limpa_a_ficha(self):
        self._definir_campo()
        alvo = f'/api/pos/marketing/entities/{self.guest.id}/'
        self.client.patch(alvo, {'custom_fields': {'num_voo': 'TAAG DT651'}}, format='json')
        r = self.client.patch(alvo, {'custom_fields': {'num_voo': ''}}, format='json')
        self.assertEqual(r.data['custom_fields'], {})

    def test_campo_inexistente_e_recusado_em_vez_de_ignorado(self):
        self._definir_campo()
        r = self.client.patch(f'/api/pos/marketing/entities/{self.guest.id}/', {
            'custom_fields': {'num_vo': 'erro de escrita'}}, format='json')
        self.assertEqual(r.status_code, 400, 'gravou em silêncio um campo que não existe')

    def test_campo_de_numero_recusa_letras(self):
        self._definir_campo(code='taxa_tur', name='Taxa turistica', field_type='NUMBER')
        alvo = f'/api/pos/marketing/entities/{self.guest.id}/'
        mau = self.client.patch(alvo, {'custom_fields': {'taxa_tur': 'muito'}}, format='json')
        self.assertEqual(mau.status_code, 400, mau.content)
        bom = self.client.patch(alvo, {'custom_fields': {'taxa_tur': '1500'}}, format='json')
        self.assertEqual(bom.status_code, 200, bom.content)

    def test_campo_de_lista_so_aceita_as_opcoes_definidas(self):
        self._definir_campo(code='motivo', name='Motivo da estadia', is_list=True,
                            list_values=['Lazer', 'Trabalho', 'Evento'])
        alvo = f'/api/pos/marketing/entities/{self.guest.id}/'
        self.assertEqual(self.client.patch(alvo, {
            'custom_fields': {'motivo': 'Pesca'}}, format='json').status_code, 400)
        ok = self.client.patch(alvo, {'custom_fields': {'motivo': 'Trabalho'}}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.data['custom_fields']['motivo'], 'Trabalho')

    def test_campo_de_data_e_de_simnao_sao_validados(self):
        self._definir_campo(code='chegada_voo', name='Data do voo', field_type='DATE')
        self._definir_campo(code='vegetariano', name='Vegetariano', field_type='BOOL')
        alvo = f'/api/pos/marketing/entities/{self.guest.id}/'
        self.assertEqual(self.client.patch(alvo, {
            'custom_fields': {'chegada_voo': '31/02/2026'}}, format='json').status_code, 400)
        r = self.client.patch(alvo, {'custom_fields': {
            'chegada_voo': '2026-11-20', 'vegetariano': 'Sim'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['custom_fields']['vegetariano'], 'true')

    def test_um_campo_tem_um_so_valor_por_ficha(self):
        from pos.models import CustomFieldValue
        self._definir_campo()
        alvo = f'/api/pos/marketing/entities/{self.guest.id}/'
        self.client.patch(alvo, {'custom_fields': {'num_voo': 'A'}}, format='json')
        self.client.patch(alvo, {'custom_fields': {'num_voo': 'B'}}, format='json')
        self.assertEqual(CustomFieldValue.objects.filter(object_id=self.guest.id).count(), 1)
        self.assertEqual(CustomFieldValue.objects.get(object_id=self.guest.id).value, 'B')

    def test_campo_de_outra_localizacao_nao_entra_na_ficha_do_cliente(self):
        """Um campo definido para a Conta POS não é um campo da entidade."""
        self._definir_campo(code='mesa_pref', name='Mesa preferida', location='TICKET')
        r = self.client.patch(f'/api/pos/marketing/entities/{self.guest.id}/', {
            'custom_fields': {'mesa_pref': '12'}}, format='json')
        self.assertEqual(r.status_code, 400, r.content)


class PmsFichaDaReservaTests(PmsBase):
    """O que estava marcado como "ainda não construído" no detalhe da reserva:
    encargos fixos, campos personalizados, documentos, recriar conta, e-mail,
    e as características dos quartos."""

    # ------------------------------------------------------------ E-MAIL
    def test_email_da_reserva_usa_o_motor_do_pos(self):
        """Não há carteiro do PMS: é o `pos.mailer`, com registo no EmailOutbox."""
        from pos.models import EmailOutbox
        self.guest.email = 'hospede@teste.ao'
        self.guest.save(update_fields=['email'])
        res_id = self._reserva_em_checkin()

        r = self.client.post(f'/api/pms/reservations/{res_id}/send-email/',
                             {'kind': 'CONFIRMATION'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        # Sem SMTP configurado o envio é SIMULADO — e isso é dito, não escondido.
        self.assertEqual(r.data['status'], 'SIMULATED')
        self.assertIn('simulado', r.data['detail'].lower())

        registo = EmailOutbox.objects.get(id=r.data['id'])
        self.assertEqual(registo.to, 'hospede@teste.ao')
        self.assertIn('RES-', registo.subject + registo.context_ref)
        self.assertIn('Hospede Teste', registo.body)

    def test_email_sem_endereco_diz_o_que_falta(self):
        res_id = self._reserva_em_checkin()
        r = self.client.post(f'/api/pms/reservations/{res_id}/send-email/',
                             {'kind': 'MESSAGE'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('não tem e-mail', r.data['detail'])

    def test_email_aceita_destino_e_corpo_do_ecra(self):
        """A pró-forma manda o MESMO HTML que imprime — papel e e-mail não
        podem mostrar contas diferentes."""
        from pos.models import EmailOutbox
        res_id = self._reserva_em_checkin()
        r = self.client.post(f'/api/pms/reservations/{res_id}/send-email/', {
            'kind': 'PROFORMA', 'to': 'outro@teste.ao',
            'subject': 'A sua conta', 'body': '<p>TOTAL 30000</p>'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        reg = EmailOutbox.objects.get(id=r.data['id'])
        self.assertEqual(reg.to, 'outro@teste.ao')
        self.assertEqual(reg.subject, 'A sua conta')
        self.assertIn('TOTAL 30000', reg.body)

    def test_tipo_de_email_desconhecido_e_recusado(self):
        res_id = self._reserva_em_checkin()
        self.assertEqual(self.client.post(f'/api/pms/reservations/{res_id}/send-email/',
                                          {'kind': 'INVENTADO', 'to': 'a@b.ao'},
                                          format='json').status_code, 400)

    # --------------------------------------------------- ENCARGOS FIXOS
    def _reserva_simples(self):
        # Duas noites: a de ONTEM e a de HOJE. A estadia começa na véspera
        # porque a Auditoria da Noite só fecha noites que já terminaram (uma
        # data futura é recusada — ver PmsAuditoriaDaNoiteTests), e o que estes
        # testes querem ver é a auditoria a lançar a noite que o check-in não
        # lançou. As contas não mudam: 2 noites × 30.000.
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje - timedelta(days=1)),
            'check_out': str(self.hoje + timedelta(days=1)), 'adults': 2}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data['id']

    def test_encargo_por_noite_e_lancado_pela_auditoria_da_noite(self):
        """Esquecer de lançar o estacionamento numa noite é dinheiro perdido
        sem ninguém dar por falta — por isso quem o lança é a auditoria."""
        res_id = self._reserva_simples()
        r = self.client.post('/api/pms/fixed-charges/', {
            'reservation': res_id, 'description': 'Estacionamento',
            'charge_type': 'MISC', 'amount': '2000', 'per_night': True}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(r.data['total_estimado'], '4000.00', '2 noites × 2000')

        self.client.post(f'/api/pms/reservations/{res_id}/check_in/', {}, format='json')
        folio = Reservation.objects.get(id=res_id).folio
        # O check-in lança só a diária: o "por noite" é da auditoria.
        self.assertEqual(folio.charges_total, Decimal('30000'))

        ontem = self.hoje - timedelta(days=1)
        aud = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
        self.assertIn(aud.status_code, (200, 201), aud.content)
        self.assertEqual(aud.data['rooms_charged'], 1)
        self.assertEqual(aud.data['extras_charged'], 1, 'o encargo fixo não foi lançado')
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('62000'), '30000 + 30000 + 2000')

    def test_encargo_de_uma_vez_entra_no_check_in(self):
        res_id = self._reserva_simples()
        self.client.post('/api/pms/fixed-charges/', {
            'reservation': res_id, 'description': 'Taxa de limpeza final',
            'charge_type': 'MISC', 'amount': '5000', 'per_night': False}, format='json')
        self.client.post(f'/api/pms/reservations/{res_id}/check_in/', {}, format='json')
        folio = Reservation.objects.get(id=res_id).folio
        self.assertEqual(folio.charges_total, Decimal('35000'), '30000 da diária + 5000 da taxa')

        # E a auditoria não o volta a lançar (é "uma vez", não "por noite").
        ontem = self.hoje - timedelta(days=1)
        aud = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
        self.assertIn(aud.status_code, (200, 201), aud.content)
        self.assertEqual(aud.data['extras_charged'], 0)
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('65000'))

    def test_auditoria_repetida_nao_duplica_o_encargo_fixo(self):
        res_id = self._reserva_simples()
        self.client.post('/api/pms/fixed-charges/', {
            'reservation': res_id, 'description': 'Cama extra',
            'amount': '3000', 'per_night': True}, format='json')
        self.client.post(f'/api/pms/reservations/{res_id}/check_in/', {}, format='json')
        ontem = self.hoje - timedelta(days=1)
        self.client.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
        folio = Reservation.objects.get(id=res_id).folio
        folio.refresh_from_db()
        antes = folio.charges_total
        # A trava da auditoria (uma data, uma corrida) protege também os extras.
        repetida = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(ontem)}, format='json')
        self.assertEqual(repetida.status_code, 409)
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, antes)

    # ------------------------------------------ CAMPOS PERSONALIZADOS
    def test_campos_personalizados_da_reserva(self):
        """Mesmo motor da ficha do cliente, filtrado por localização Reserva."""
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'transfer', 'name': 'Transfer do aeroporto', 'location': 'RESERVATION',
            'field_type': 'BOOL', 'is_active': True}, format='json')
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'num_voo_res', 'name': 'No do voo', 'location': 'RESERVATION',
            'field_type': 'TEXT', 'is_active': True}, format='json')
        # Um campo de ENTIDADE não é um campo da reserva.
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'so_ficha', 'name': 'So na ficha', 'location': 'ENTITY',
            'field_type': 'TEXT', 'is_active': True}, format='json')

        res_id = self._reserva_simples()
        r = self.client.get(f'/api/pms/reservations/{res_id}/custom-fields/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(c['code'] for c in r.data['fields']), ['num_voo_res', 'transfer'])

        g = self.client.post(f'/api/pms/reservations/{res_id}/custom-fields/', {
            'values': {'transfer': 'Sim', 'num_voo_res': 'DT651'}}, format='json')
        self.assertEqual(g.status_code, 200, g.content)
        valores = {c['code']: c['value'] for c in g.data['fields']}
        self.assertEqual(valores['transfer'], 'true')
        self.assertEqual(valores['num_voo_res'], 'DT651')

        # Relido do servidor, continua lá.
        relido = self.client.get(f'/api/pms/reservations/{res_id}/custom-fields/')
        self.assertEqual({c['code']: c['value'] for c in relido.data['fields']}['num_voo_res'], 'DT651')

        # Campo da ficha do cliente não se grava pela reserva.
        self.assertEqual(self.client.post(f'/api/pms/reservations/{res_id}/custom-fields/', {
            'values': {'so_ficha': 'x'}}, format='json').status_code, 400)

    def test_valor_de_reserva_e_de_cliente_nao_se_misturam(self):
        """As duas localizações partilham a tabela de valores — se o filtro por
        localização falhasse, o nº do voo do cliente nº 1 aparecia na reserva nº 1."""
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'campo_res', 'name': 'Da reserva', 'location': 'RESERVATION',
            'field_type': 'TEXT', 'is_active': True}, format='json')
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'campo_ent', 'name': 'Da ficha', 'location': 'ENTITY',
            'field_type': 'TEXT', 'is_active': True}, format='json')

        res_id = self._reserva_simples()
        self.client.post(f'/api/pms/reservations/{res_id}/custom-fields/',
                         {'values': {'campo_res': 'RESERVA'}}, format='json')
        self.client.patch(f'/api/pos/marketing/entities/{self.guest.id}/',
                          {'custom_fields': {'campo_ent': 'FICHA'}}, format='json')

        daReserva = self.client.get(f'/api/pms/reservations/{res_id}/custom-fields/').data['fields']
        self.assertEqual([c['code'] for c in daReserva], ['campo_res'])
        daFicha = self.client.get(f'/api/pos/marketing/entities/{self.guest.id}/').data['custom_fields']
        self.assertEqual(daFicha, {'campo_ent': 'FICHA'})

    # ----------------------------------------------------- DOCUMENTOS
    def test_documentos_da_reserva_juntam_facturas_e_ficha(self):
        from mdm.models import CustomerRecord
        CustomerRecord.objects.create(customer=self.guest, kind='DOC',
                                      data={'type': 'Passaporte', 'number': 'N0012345'})
        res_id = self._reserva_em_checkin()

        r = self.client.get(f'/api/pms/reservations/{res_id}/documents/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['invoices'], [], 'ainda não foi facturada')
        self.assertEqual(len(r.data['guest_documents']), 1)
        self.assertEqual(r.data['guest_documents'][0]['number'], 'N0012345')
        self.assertEqual(r.data['guest_documents'][0]['type_name'], 'Passaporte')

    def test_a_factura_emitida_aparece_nos_documentos(self):
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
        emit = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')
        self.assertIn(emit.status_code, (200, 201), emit.content)

        docs = self.client.get(f'/api/pms/reservations/{res_id}/documents/').data
        self.assertEqual(len(docs['invoices']), 1, 'a factura emitida não aparece na reserva')
        self.assertEqual(docs['invoices'][0]['number'], emit.data['invoice_number'])

    def test_a_factura_impressa_leva_logotipo_e_qr(self):
        """O papel que o hóspede leva: QR como imagem (nenhum telemóvel lê a
        string de dados em texto) e o logótipo que o cliente carregou."""
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif, cfg.environment = 'Hotel Teste Lda', '5000000000', 'TEST'
        cfg.logo_url = 'https://exemplo.ao/logo.png'
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        tipo = FiscalDocType.objects.create(code='FR', name='Factura-Recibo', signable=True)
        FiscalSeries.objects.create(code='T', doc_type=tipo, year=self.hoje.year,
                                    certified=True, is_active=True, environment='TEST')

        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio
        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        emit = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')

        from fiscal.models import FiscalDocument
        doc = FiscalDocument.objects.get(invoice_no=emit.data['invoice_number'])
        p = self.client.get(f'/api/fiscal/documents/{doc.id}/printout/')
        self.assertEqual(p.status_code, 200, p.content)
        self.assertEqual(p.data['company']['logo_url'], 'https://exemplo.ao/logo.png')
        self.assertTrue(p.data['qr_png'], 'a factura saiu sem imagem de QR')
        self.assertTrue(p.data['qr_png'].startswith('data:image/png;base64,'))
        self.assertTrue(p.data['print_mention'], 'falta a menção do programa validado')

    # -------------------------------------------------- RECRIAR CONTA
    def test_recriar_conta_so_com_as_outras_fechadas(self):
        res_id = self._reserva_em_checkin()
        aberta = self.client.post(f'/api/pms/reservations/{res_id}/recreate-folio/', {}, format='json')
        self.assertEqual(aberta.status_code, 409, 'abriu uma segunda conta com uma já aberta')

        folio = Reservation.objects.get(id=res_id).folio
        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        folio.status = 'CLOSED'
        folio.save(update_fields=['status'])

        nova = self.client.post(f'/api/pms/reservations/{res_id}/recreate-folio/', {}, format='json')
        self.assertEqual(nova.status_code, 201, nova.content)
        self.assertEqual(Reservation.objects.get(id=res_id).folios.count(), 2)
        # A conta antiga fica exactamente como estava (as facturas emitidas vivem lá).
        folio.refresh_from_db()
        self.assertEqual(folio.status, 'CLOSED')

    # ------------------------------------------ CARACTERÍSTICAS DO QUARTO
    def test_procurar_quarto_por_caracteristicas(self):
        """"Um com varanda E vista mar" devolve os que têm AS DUAS coisas."""
        from pms.models import Room
        a1 = self.client.post('/api/pms/room-attributes/', {
            'hotel': self.hotel.id, 'code': 'MAR', 'name': 'Vista mar'}, format='json')
        a2 = self.client.post('/api/pms/room-attributes/', {
            'hotel': self.hotel.id, 'code': 'VAR', 'name': 'Varanda'}, format='json')
        self.assertIn(a1.status_code, (200, 201), a1.content)

        Room.objects.get(id=self.quartos[0]).attributes.set([a1.data['id'], a2.data['id']])
        Room.objects.get(id=self.quartos[1]).attributes.set([a1.data['id']])

        def livres(attrs=None):
            p = {'date_from': str(self.hoje), 'date_to': str(self.hoje + timedelta(days=1))}
            if attrs:
                p['attributes'] = ','.join(str(a) for a in attrs)
            r = self.client.get('/api/pms/rooms/free/', p)
            self.assertEqual(r.status_code, 200, r.content)
            return sorted(x['number'] for x in r.data)

        self.assertEqual(livres(), ['101', '102', '103'])
        self.assertEqual(livres([a1.data['id']]), ['101', '102'])
        # As DUAS características: só o 101.
        self.assertEqual(livres([a1.data['id'], a2.data['id']]), ['101'])

    def test_caracteristicas_saem_na_lista_de_quartos_livres(self):
        from pms.models import Room
        a = self.client.post('/api/pms/room-attributes/', {
            'hotel': self.hotel.id, 'code': 'ADAP', 'name': 'Mobilidade reduzida'}, format='json')
        Room.objects.get(id=self.quartos[2]).attributes.set([a.data['id']])

        r = self.client.get('/api/pms/rooms/free/', {
            'date_from': str(self.hoje), 'date_to': str(self.hoje + timedelta(days=1))})
        linha = [x for x in r.data if x['number'] == '103'][0]
        self.assertEqual(linha['attributes'], ['Mobilidade reduzida'])
        self.assertEqual([x for x in r.data if x['number'] == '101'][0]['attributes'], [])

    def test_codigo_de_caracteristica_nao_se_repete_no_hotel(self):
        self.client.post('/api/pms/room-attributes/', {
            'hotel': self.hotel.id, 'code': 'MAR', 'name': 'Vista mar'}, format='json')
        r = self.client.post('/api/pms/room-attributes/', {
            'hotel': self.hotel.id, 'code': 'MAR', 'name': 'Vista para o mar'}, format='json')
        self.assertEqual(r.status_code, 400, 'aceitou duas características com o mesmo código')


class PmsFichaCompletaDoClienteTests(PmsBase):
    """Uma ficha de cliente com TUDO preenchido, aba a aba, e a prova de que
    cada campo lá fica.

    É o teste que o dono pediu por palavras dele: criar um cliente com todas as
    informações para ver se tudo funciona. Um campo que o ecrã mostra mas que o
    servidor deita fora na gravação é a avaria mais silenciosa que há — o
    utilizador escreve, carrega em Gravar, não vê erro nenhum, e o dado
    desaparece. Isto apanha isso campo a campo.
    """

    # Os campos de cada aba do "Nova entidade", pela ordem do ecrã.
    PERFIL = {
        'code': 'CLI-TOTAL', 'internal_id': 'INT-9910', 'title': 'Sr.',
        'long_title': 'Senhor Doutor', 'short_title': 'Dr.', 'prefix': 'Dr',
        'name': 'Joaquim Mateus Andrade', 'last_name': 'Andrade',
        'other_names': 'Joca', 'language': 'pt-PT', 'mailing_language': 'pt-PT',
        'is_supplier': True, 'sync_enabled': True, 'is_active': True,
        'online_checkin_pct': 80, 'stat_aggregator': 'CORP-AO',
        'planning_color': '#1F9D55',
    }
    MORADA = {
        'address': 'Rua Rainha Ginga, nº 14', 'address2': '3º andar', 'address3': 'Porta B',
        'postal_code': '1000-LAD', 'city': 'Luanda', 'region': 'Luanda',
        'district': 'Ingombota', 'country': 'Angola', 'phone_prefix': '+244',
        'billing_address': 'Rua Rainha Ginga, nº 14', 'billing_address2': 'Dept. Financeiro',
        'billing_postal': '1000-LAD', 'billing_city': 'Luanda', 'billing_country': 'Angola',
    }
    IDENTIFICACAO = {
        'tax_id': '5417829301', 'doc_type': 'Passaporte', 'id_number': 'N0123456',
        'doc_issue_date': '2023-05-10', 'doc_valid_until': '2033-05-09',
        'doc_issue_place': 'Luanda', 'doc_issued_by': 'SME',
        'nationality': 'Angolana', 'birth_date': '1984-03-22',
        'birth_place': 'Benguela', 'gender': 'M', 'other_number': 'OUT-771',
    }
    CONTACTOS = {
        'phone': '+244222300400', 'phone2': '+244222300401', 'mobile': '+244923111222',
        'mobile2': '+244912333444', 'email': 'joaquim.andrade@exemplo.ao',
        'email2': 'financeiro@exemplo.ao', 'fax': '+244222300499', 'fax2': '+244222300498',
        'site': 'https://exemplo.ao', 'site2': 'https://loja.exemplo.ao',
        'position': 'Director Financeiro',
    }
    RESERVA = {
        'pref_complex': 'Edifício Principal', 'pref_category': 'Standard',
        'pref_room': '101', 'pref_meals': 'BB', 'pref_meal_type': 'Pequeno-almoço',
        'pref_price_list': 'Tarifa Corporate', 'pref_package': 'Fim-de-semana',
        'pref_pos_price': 2, 'pref_rest_table': 'Mesa 7',
        'pref_discount': '10', 'pref_discount_rule': 'Sobre alojamento',
        'plate': 'LD-45-78-AB', 'brand': 'Toyota',
        'pay_tv': 'Incluída', 'video': 'Sem acesso', 'minibar': 'Reposição diária',
        'suggest_on_reservation': True, 'suggestion_text': 'Prefere andar alto, longe do elevador.',
        'has_warnings': True, 'warning_text': 'Alérgico a amendoim — avisar a cozinha.',
    }
    MARKETING = {
        'include_mailings': True, 'mailing_general': True, 'mailing_events': True,
        'mailing_birthday': True, 'distinction_program': True, 'vip_code': 'OURO',
        'is_vip': True, 'vip_discount_percent': '12.50',
    }
    COMISSOES = {'commission_code': 'AG-15', 'commission_pct': '15.00'}
    PAGAMENTOS = {
        'account_number': 'CC-000771', 'financial_number': 'FIN-771',
        'credit_limit': '750000.00', 'credit_limit_mode': 'Bloquear acima do limite',
        'credit_limit_pos_enabled': True, 'credit_limit_pos': '50000.00',
        'credit_days': 30, 'only_cash': False, 'allow_cc_checkout': True,
        'cc_by': 'Direcção Financeira', 'einvoice_mode': 'Email',
        'withholding_tax': '6.5', 'portal_password': 'portal-2026',
    }
    OUTROS = {
        'notes': 'Cliente de longa data. Factura sempre em nome da empresa.',
        'is_blocked': False, 'internal_status': 'Activo',
        'signature_url': 'https://exemplo.ao/assinaturas/771.png',
        'photo_url': 'https://exemplo.ao/fotos/771.jpg',
    }

    def _todos_os_campos(self):
        campos = {}
        for bloco in (self.PERFIL, self.MORADA, self.IDENTIFICACAO, self.CONTACTOS,
                      self.RESERVA, self.MARKETING, self.COMISSOES, self.PAGAMENTOS, self.OUTROS):
            campos.update(bloco)
        return campos

    def test_criar_cliente_com_todas_as_abas_preenchidas(self):
        """Grava TUDO e confere campo a campo o que voltou do servidor."""
        payload = self._todos_os_campos()
        r = self.client.post('/api/pos/marketing/entities/', payload, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        eid = r.data['id']

        relido = self.client.get(f'/api/pos/marketing/entities/{eid}/')
        self.assertEqual(relido.status_code, 200, relido.content)
        guardado = relido.data

        perdidos = []
        for campo, esperado in payload.items():
            if campo not in guardado:
                perdidos.append(f'{campo}: não existe na resposta')
                continue
            obtido = guardado[campo]
            if isinstance(esperado, bool):
                ok = bool(obtido) == esperado
            elif isinstance(esperado, int):
                ok = int(obtido or 0) == esperado
            else:
                ok = str(obtido or '') == str(esperado)
            if not ok:
                perdidos.append(f'{campo}: gravei {esperado!r}, voltou {obtido!r}')
        self.assertEqual(perdidos, [], 'Campos que o servidor não guardou:\n  ' + '\n  '.join(perdidos))

    def test_cada_aba_grava_e_relê_sozinha(self):
        """Gravar uma aba de cada vez (é o que o utilizador faz) não pode apagar
        o que foi gravado nas outras."""
        r = self.client.post('/api/pos/marketing/entities/',
                             {'code': 'CLI-ABAS', 'name': 'Cliente Abas'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        eid = r.data['id']

        abas = [('Perfil', self.PERFIL), ('Morada', self.MORADA),
                ('Identificação', self.IDENTIFICACAO), ('Contactos', self.CONTACTOS),
                ('Reserva', self.RESERVA), ('Sales & Marketing', self.MARKETING),
                ('Comissões', self.COMISSOES), ('Pagamentos', self.PAGAMENTOS),
                ('Outros', self.OUTROS)]
        for nome, campos in abas:
            dados = {k: v for k, v in campos.items() if k != 'code'}
            resp = self.client.patch(f'/api/pos/marketing/entities/{eid}/', dados, format='json')
            self.assertEqual(resp.status_code, 200, f'{nome}: {resp.content}')

        # No fim, TUDO o que se gravou aba a aba continua lá.
        final = self.client.get(f'/api/pos/marketing/entities/{eid}/').data
        self.assertEqual(final['name'], 'Joaquim Mateus Andrade')
        self.assertEqual(final['tax_id'], '5417829301')
        self.assertEqual(final['city'], 'Luanda')
        self.assertEqual(final['mobile'], '+244923111222')
        self.assertEqual(final['pref_room'], '101')
        self.assertTrue(final['is_vip'])
        self.assertEqual(str(final['commission_pct']), '15.00')
        self.assertEqual(str(final['credit_limit']), '750000.00')
        self.assertIn('amendoim', final['warning_text'])

    def test_os_sateliltes_de_cada_aba(self):
        """As grelhas das abas (notas, documentos, acordos, comissões, RGPD…)
        são todas o mesmo motor — `mdm.CustomerRecord` com um tipo. Se o tipo
        deixar de ser respeitado, a nota de uma aba aparece noutra."""
        r = self.client.post('/api/pos/marketing/entities/',
                             {'code': 'CLI-SAT', 'name': 'Cliente Satelites'}, format='json')
        eid = r.data['id']

        satelites = {
            'NOTE': {'text': 'Prefere quarto longe do elevador.'},
            'SOCIAL': {'network': 'LinkedIn', 'handle': 'joaquim-andrade'},
            'DOC': {'type': 'Passaporte', 'number': 'N0123456', 'valid_until': '2033-05-09'},
            'LINK': {'relation': 'Cônjuge', 'name': 'Maria Andrade'},
            'AGREEMENT': {'name': 'Acordo Corporate 2026', 'discount': '12'},
            'BILLING': {'instruction': 'Faturar à empresa, envio por e-mail.'},
            'COMMISSION': {'agency': 'Agência Sol', 'pct': '15'},
            'CONSENT': {'kind': 'Marketing', 'given': True, 'date': '2026-01-15'},
            'CHILD': {'name': 'Tomás', 'birth_date': '2018-07-03'},
        }
        for tipo, dados in satelites.items():
            resp = self.client.post(f'/api/pos/marketing/entities/{eid}/records/',
                                    {'kind': tipo, 'data': dados}, format='json')
            self.assertEqual(resp.status_code, 201, f'{tipo}: {resp.content}')

        # Cada aba só vê os seus.
        for tipo, dados in satelites.items():
            lista = self.client.get(f'/api/pos/marketing/entities/{eid}/records/', {'kind': tipo})
            self.assertEqual(lista.status_code, 200, lista.content)
            self.assertEqual(len(lista.data), 1, f'{tipo}: a aba trouxe {len(lista.data)} linhas')
            self.assertEqual(lista.data[0]['data'], dados)

        # E sem filtro vêm todos.
        self.assertEqual(len(self.client.get(f'/api/pos/marketing/entities/{eid}/records/').data),
                         len(satelites))

    def test_campos_personalizados_na_ficha_completa(self):
        """A aba que faltava construir: o campo do hotel, na ficha, com valor."""
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'num_voo', 'name': 'No do voo', 'location': 'ENTITY',
            'field_type': 'TEXT', 'show_in_search': True, 'is_active': True}, format='json')
        self.client.post('/api/pos/config/custom-fields/', {
            'code': 'motivo', 'name': 'Motivo', 'location': 'ENTITY', 'is_list': True,
            'list_values': ['Lazer', 'Trabalho'], 'is_active': True}, format='json')

        payload = dict(self._todos_os_campos())
        payload['code'] = 'CLI-CF'
        payload['custom_fields'] = {'num_voo': 'DT651', 'motivo': 'Trabalho'}
        r = self.client.post('/api/pos/marketing/entities/', payload, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(r.data['custom_fields'], {'num_voo': 'DT651', 'motivo': 'Trabalho'})

        # E aparecem na pesquisa, ao lado dos outros dados da ficha.
        lista = self.client.get('/api/pos/marketing/entities/')
        linha = [e for e in (lista.data if isinstance(lista.data, list) else lista.data['results'])
                 if e['code'] == 'CLI-CF'][0]
        self.assertEqual(linha['custom_fields']['num_voo'], 'DT651')

    def test_a_ficha_completa_serve_para_reservar_e_facturar(self):
        """Prova que não é um cadastro paralelo: o cliente criado aqui é o que
        reserva, o que entra no quarto e o que sai no NIF da factura."""
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif, cfg.environment = 'Hotel Teste Lda', '5000000000', 'TEST'
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        tipo = FiscalDocType.objects.create(code='FR', name='Factura-Recibo', signable=True)
        FiscalSeries.objects.create(code='T', doc_type=tipo, year=self.hoje.year,
                                    certified=True, is_active=True, environment='TEST')

        payload = dict(self._todos_os_campos())
        payload['code'] = 'CLI-FACT'
        cliente = self.client.post('/api/pos/marketing/entities/', payload, format='json')
        self.assertIn(cliente.status_code, (200, 201), cliente.content)

        reserva = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': cliente.data['id'], 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=1)), 'adults': 1}, format='json')
        self.assertIn(reserva.status_code, (200, 201), reserva.content)
        self.assertEqual(reserva.data['guest_name'], 'Joaquim Mateus Andrade')
        self.assertEqual(reserva.data['guest_tax_id'], '5417829301')
        self.assertEqual(reserva.data['guest_email'], 'joaquim.andrade@exemplo.ao')

        self.client.post(f"/api/pms/reservations/{reserva.data['id']}/check_in/", {}, format='json')
        folio = Reservation.objects.get(id=reserva.data['id']).folio
        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        fact = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')
        self.assertIn(fact.status_code, (200, 201), fact.content)

        from fiscal.models import FiscalDocument
        doc = FiscalDocument.objects.get(invoice_no=fact.data['invoice_number'])
        self.assertEqual(doc.customer_name, 'Joaquim Mateus Andrade')
        self.assertEqual(doc.customer_tax_id, '5417829301',
                         'a factura saiu com outro NIF que não o da ficha')

    def test_a_factura_leva_o_logotipo_da_empresa_dona_do_hotel(self):
        """O logótipo é carregado em Administração → Empresa (Hotel.logo_url) e
        a factura olhava só para a configuração fiscal — saía sem ele."""
        self.hotel.logo_url = 'https://exemplo.ao/logo-hotel.png'
        self.hotel.save(update_fields=['logo_url'])
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif, cfg.environment = '', '5000000000', 'TEST'
        cfg.logo_url = ''
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        tipo = FiscalDocType.objects.create(code='FR', name='Factura-Recibo', signable=True)
        FiscalSeries.objects.create(code='T', doc_type=tipo, year=self.hoje.year,
                                    certified=True, is_active=True, environment='TEST')

        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio
        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        emit = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')

        from fiscal.models import FiscalDocument
        doc = FiscalDocument.objects.get(invoice_no=emit.data['invoice_number'])
        p = self.client.get(f'/api/fiscal/documents/{doc.id}/printout/')
        self.assertEqual(p.data['company']['logo_url'], 'https://exemplo.ao/logo-hotel.png',
                         'a factura saiu sem o logótipo da empresa')
        # E sem nome na configuração fiscal, vale o nome legal da empresa.
        self.assertEqual(p.data['company']['name'], 'Empresa Teste')
        self.assertEqual(p.data['company']['nif'], '5000000000')


class PmsWhatsAppTests(PmsBase):
    """Ligar o WhatsApp pelas duas vias — e nunca dar por ligada uma sessão que
    o outro lado não confirmou."""

    def _config(self, **kw):
        dados = {'hotel': self.hotel.id, 'welcome_message': 'Bem-vindo!'}
        dados.update(kw)
        r = self.client.post('/api/pms/chatbot-settings/', dados, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data

    def test_api_oficial_exige_as_credenciais_da_meta(self):
        cfg = self._config(connection_mode='OFFICIAL')
        r = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/connect/", {}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Access Token', r.data['detail'])

        self.client.patch(f"/api/pms/chatbot-settings/{cfg['id']}/", {
            'whatsapp_phone_number': '+244923000111',
            'whatsapp_business_account_id': '123456789',
            'access_token': 'EAA-token'}, format='json')
        ok = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/connect/", {}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.data['session_status'], 'CONNECTED')
        self.assertEqual(ok.data['connected_number'], '+244923000111')

    def test_api_nao_oficial_sem_ponte_diz_o_que_falta(self):
        """Não se finge uma ligação: sem serviço de ponte, diz-se porquê."""
        cfg = self._config(connection_mode='BRIDGE', pairing_method='QR')
        r = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/connect/", {}, format='json')
        self.assertEqual(r.status_code, 502, r.content)
        self.assertIn('ponte', r.data['detail'].lower())

        estado = self.client.get(f"/api/pms/chatbot-settings/{cfg['id']}/").data
        self.assertEqual(estado['session_status'], 'ERROR')
        self.assertNotEqual(estado['session_status'], 'CONNECTED')

    def test_emparelhar_por_telefone_exige_o_numero(self):
        cfg = self._config(connection_mode='BRIDGE', pairing_method='PHONE',
                           bridge_url='https://ponte.exemplo.ao')
        r = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/connect/", {}, format='json')
        self.assertEqual(r.status_code, 502, r.content)
        self.assertIn('número de telemóvel', r.data['detail'])

    def test_qr_da_ponte_chega_ao_ecra_como_imagem(self):
        """A ponte devolve o TEXTO do QR; ninguém aponta a câmara a um texto."""
        from pms.models import ChatbotSettings
        cfg = self._config(connection_mode='BRIDGE', pairing_method='QR',
                           bridge_url='https://ponte.exemplo.ao')
        obj = ChatbotSettings.objects.get(id=cfg['id'])
        obj.session_status, obj.qr_payload = 'PAIRING', '2@abc123DEF456,xyz/789=='
        obj.save()

        r = self.client.get(f"/api/pms/chatbot-settings/{cfg['id']}/")
        self.assertEqual(r.data['session_status'], 'PAIRING')
        self.assertTrue(r.data['qr_png'], 'o QR não veio como imagem')
        self.assertTrue(r.data['qr_png'].startswith('data:image/png;base64,'))

        # Ligado, já não há QR nenhum para mostrar.
        obj.session_status, obj.qr_payload = 'CONNECTED', None
        obj.save()
        self.assertIsNone(self.client.get(f"/api/pms/chatbot-settings/{cfg['id']}/").data['qr_png'])

    def test_desligar_limpa_a_sessao(self):
        from pms.models import ChatbotSettings
        cfg = self._config(connection_mode='BRIDGE', bridge_url='')
        obj = ChatbotSettings.objects.get(id=cfg['id'])
        obj.session_status, obj.connected_number = 'CONNECTED', '+244923000111'
        obj.save()

        r = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/disconnect/", {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['session_status'], 'DISCONNECTED')
        self.assertIsNone(r.data['connected_number'])

    def test_mensagem_de_teste_so_com_a_sessao_ligada(self):
        cfg = self._config(connection_mode='BRIDGE', bridge_url='https://ponte.exemplo.ao')
        r = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/send-test/",
                             {'to': '+244923000111'}, format='json')
        self.assertEqual(r.status_code, 409, r.content)

        semDestino = self.client.post(f"/api/pms/chatbot-settings/{cfg['id']}/send-test/",
                                      {}, format='json')
        self.assertEqual(semDestino.status_code, 400)

    def test_o_simulador_continua_a_funcionar_sem_ligacao(self):
        """A simulação é o que deixa testar o assistente antes de ligar o
        WhatsApp — não pode depender da sessão."""
        self._config(connection_mode='BRIDGE')
        r = self.client.post('/api/pms/chatbot/simulate/', {'message': 'Ola'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['intent'], 'greeting')


class GestaoDeUtilizadoresPartilhadaTests(PmsBase):
    """Gestão de Utilizadores partilhada entre o POS e o PMS.

    Os módulos vendem-se separados, mas quem usa o sistema é a mesma pessoa. O
    que se prova aqui: há UM cadastro, uma pessoa tem UMA identidade, e os
    ecrãs respondem mesmo a quem só comprou um dos módulos.
    """

    def _criar(self, **kw):
        dados = {'code': 'ANA', 'first_name': 'Ana', 'last_name': 'Silva', 'number': 1}
        dados.update(kw)
        r = self.client.post('/api/pos/config/users/', dados, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data

    def test_criar_um_utilizador_cria_a_identidade_de_login(self):
        """Era a origem do cadastro duplicado: sem senha, não se criava a
        identidade, a pessoa não entrava em lado nenhum, e o hotel criava-a
        outra vez em Segurança → Utilizadores."""
        from django.contrib.auth.models import User
        from pos.models import PosUser

        u = self._criar()
        posuser = PosUser.objects.get(id=u['id'])
        self.assertIsNotNone(posuser.auth_user_id, 'o utilizador ficou sem identidade de login')
        self.assertEqual(posuser.auth_user.username, 'ANA')
        self.assertEqual(User.objects.filter(username='ANA').count(), 1)

        # Sem senha ainda não entra — e a grelha di-lo em vez de o esconder.
        self.assertFalse(u['has_login'])
        self.assertFalse(posuser.auth_user.has_usable_password())

    def test_dar_senha_deixa_a_pessoa_entrar(self):
        from pos.models import PosUser
        u = self._criar(code='BRUNO', first_name='Bruno')
        r = self.client.patch(f"/api/pos/config/users/{u['id']}/",
                              {'password': 'Senha#2026'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['has_login'])
        self.assertEqual(r.data['login_username'], 'BRUNO')

        auth = PosUser.objects.get(id=u['id']).auth_user
        self.assertTrue(auth.check_password('Senha#2026'),
                        'a senha não ficou na identidade do sistema')

    def test_nao_se_cria_uma_segunda_conta_para_a_mesma_pessoa(self):
        """Se já existe uma conta com aquele código, aproveita-se."""
        from django.contrib.auth.models import User
        from pos.models import PosUser
        existente = User.objects.create_user('CARLA', password='x')

        u = self._criar(code='CARLA', first_name='Carla')
        self.assertEqual(User.objects.filter(username='CARLA').count(), 1)
        self.assertEqual(PosUser.objects.get(id=u['id']).auth_user_id, existente.id)

    def test_bloquear_no_pos_bloqueia_no_sistema_todo(self):
        """Um empregado despedido não pode continuar a entrar pelo PMS só
        porque foi bloqueado "no POS"."""
        from pos.models import PosUser
        u = self._criar(code='DORA', first_name='Dora')
        self.client.patch(f"/api/pos/config/users/{u['id']}/", {'password': 'Senha#2026'}, format='json')
        self.assertTrue(PosUser.objects.get(id=u['id']).auth_user.is_active)

        self.client.patch(f"/api/pos/config/users/{u['id']}/", {'is_blocked': True}, format='json')
        self.assertFalse(PosUser.objects.get(id=u['id']).auth_user.is_active,
                         'bloqueado no POS mas ainda entra no sistema')

        self.client.patch(f"/api/pos/config/users/{u['id']}/", {'is_blocked': False}, format='json')
        self.assertTrue(PosUser.objects.get(id=u['id']).auth_user.is_active)

    def test_os_quatro_ecras_respondem_a_quem_so_tem_um_modulo(self):
        """Independência dos módulos: a gestão de utilizadores não pode exigir
        licença do POS — senão um cliente que compre só o PMS fica sem forma de
        criar os seus empregados."""
        for caminho in ('user-groups', 'users', 'hr-types', 'human-resources'):
            r = self.client.get(f'/api/pos/config/{caminho}/')
            self.assertEqual(r.status_code, 200, f'{caminho}: {r.content}')

    def test_grupo_de_utilizadores_e_tipo_rh_sao_o_mesmo_cadastro_nos_dois(self):
        """O que se cria num módulo aparece no outro — é a mesma tabela, não
        duas listas parecidas."""
        g = self.client.post('/api/pos/config/user-groups/', {
            'code': 'FO', 'name': 'Front Office', 'is_active': True}, format='json')
        self.assertIn(g.status_code, (200, 201), g.content)

        t = self.client.post('/api/pos/config/hr-types/', {
            'code': 'GOV', 'name': 'Governanta', 'is_active': True}, format='json')
        self.assertIn(t.status_code, (200, 201), t.content)

        pessoa = self.client.post('/api/pos/config/human-resources/', {
            'code': 'HR-1', 'first_name': 'Elsa', 'last_name': 'Mendes',
            'hr_type': t.data['id'], 'is_active': True}, format='json')
        self.assertIn(pessoa.status_code, (200, 201), pessoa.content)

        u = self._criar(code='ELSA', first_name='Elsa', group=g.data['id'])
        self.assertEqual(u['group_name'], 'Front Office')

        # O tipo passa a contar a pessoa — e não se apaga com gente lá dentro.
        tipos = self.client.get('/api/pos/config/hr-types/').data
        linha = [x for x in (tipos if isinstance(tipos, list) else tipos['results'])
                 if x['code'] == 'GOV'][0]
        self.assertEqual(linha['resources_count'], 1)

    def test_a_pessoa_que_opera_o_pos_e_a_que_entra_no_pms(self):
        """A prova de que não são dois sistemas: o utilizador criado pela gestão
        partilhada autentica-se e usa o PMS com a mesma credencial."""
        from pos.models import PosUser
        u = self._criar(code='FILIPE', first_name='Filipe')
        self.client.patch(f"/api/pos/config/users/{u['id']}/",
                          {'password': 'Senha#2026'}, format='json')
        auth = PosUser.objects.get(id=u['id']).auth_user

        outro = self.client_class()
        outro.force_authenticate(auth)
        r = outro.get('/api/pms/rooms/')
        self.assertEqual(r.status_code, 200, 'quem opera o POS não consegue usar o PMS')


class ModulosVendidosSeparadamenteTests(PmsBase):
    """Um cliente que compra só o PMS não pode ver o POS — nem ao contrário.

    O risco concreto: `pos`, `inventory` e `commercial` entram SEMPRE no
    `INSTALLED_APPS` porque `mdm` tem campos que apontam para as tabelas deles e
    sem elas o `migrate` rebenta. Quem olhasse só para o que está instalado
    concluía que o POS está activo em toda a parte — e o PMS mostrava o Terminal
    POS, o Fecho do Dia e o Diagnóstico dos terminais a quem não os comprou.
    """

    def _licenca(self, modulos):
        """A licença da instalação, que é quem manda. Fica no `clm.License`, que
        tem precedência sobre o `license.key` do disco (ver `_real_license`) —
        por isso dá para escrever aqui o cenário de cada cliente."""
        from clm.models import License, Client
        cliente = Client.objects.create(commercial_name='Hotel Teste')
        return License.objects.create(
            client=cliente, license_number=f'LIC-{len(modulos)}', modules=modulos,
            valid_until=date.today() + timedelta(days=365))

    def test_so_pms_nao_liga_o_pos_apesar_de_instalado(self):
        from licensing.views import _active_modules
        from django.conf import settings

        # As tabelas existem (têm de existir)…
        self.assertIn('pos', settings.INSTALLED_APPS)
        self.assertIn('inventory', settings.INSTALLED_APPS)

        self._licenca(['pms'])
        activos = _active_modules()
        self.assertNotIn('pos', activos,
                         'o POS está a ser dado como activo só por estar instalado')
        self.assertNotIn('inventory', activos)
        self.assertNotIn('commercial', activos)
        self.assertIn('pms', activos)

    def test_so_pos_nao_liga_o_pms(self):
        from licensing.views import _active_modules
        self._licenca(['pos'])
        activos = _active_modules()
        self.assertIn('pos', activos)
        self.assertNotIn('pms', activos)

    def test_a_licenca_e_quem_liga_o_pos(self):
        from licensing.views import _active_modules
        self._licenca(['pos', 'pms'])
        activos = _active_modules()
        self.assertIn('pos', activos, 'a licença lista o POS e ele não ficou activo')
        self.assertIn('pms', activos)

    def test_o_motor_fiscal_esta_sempre_activo(self):
        """A facturação e a AGT não são um módulo opcional: um hotel em Angola
        emite facturas certificadas tenha ou não restaurante."""
        from licensing.views import _active_modules
        self._licenca(['pms'])
        self.assertIn('fiscal', _active_modules())

    def test_o_endpoint_diz_ao_ecra_o_que_mostrar(self):
        self._licenca(['pms'])
        r = self.client.get('/api/licensing/active-modules/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('active', r.data)
        self.assertNotIn('pos', r.data['active'],
                         'o ecrã ia mostrar o POS a quem só comprou o PMS')
        self.assertIn('pms', r.data['active'])

    def test_o_que_os_dois_modulos_partilham_continua_a_responder(self):
        """O que fica de pé sem POS, porque é obrigação do hotel e não do
        produto POS: facturação/AGT, clientes, utilizadores e descontos.

        Se algum destes passar a exigir licença do POS, um cliente só-PMS fica
        sem emitir facturas ou sem criar os seus empregados — e este teste
        falha antes de isso chegar a um hotel."""
        self._licenca(['pms'])
        obrigatorios = [
            ('/api/fiscal/config/', 'configuração fiscal (AGT)'),
            ('/api/fiscal/documents/', 'documentos fiscais'),
            ('/api/fiscal/tax-rates/', 'taxas de IVA'),
            ('/api/mdm/customers/', 'ficha de clientes'),
            ('/api/pos/config/users/', 'utilizadores'),
            ('/api/pos/config/user-groups/', 'grupos de utilizadores'),
            ('/api/pos/config/hr-types/', 'tipos de R.H.'),
            ('/api/pos/config/human-resources/', 'recursos humanos'),
            ('/api/pos/config/discounts/', 'descontos'),
        ]
        falhas = []
        for caminho, nome in obrigatorios:
            r = self.client.get(caminho)
            if r.status_code != 200:
                falhas.append(f'{nome} ({caminho}): {r.status_code}')
        self.assertEqual(falhas, [], 'Partilhados que deixaram de responder:\n  '
                         + '\n  '.join(falhas))

    def test_a_factura_do_pms_nao_precisa_do_pos(self):
        """A prova de ponta a ponta: com o POS desligado na licença, o PMS emite
        uma factura certificada na mesma."""
        from licensing.views import _active_modules
        self._licenca(['pms'])
        self.assertNotIn('pos', _active_modules())

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
        self.assertTrue(r.data['invoice_number'])


class RelatoriosDoPmsTests(PmsBase):
    """Os relatórios do alojamento no MESMO ecrã dos do POS.

    O dono abria "Relatórios", via as vendas do restaurante, o IVA e a caixa, e
    nem uma linha sobre quartos — tendo o PMS os dados todos. Estas pastas
    acrescentam-se ao catálogo existente em vez de montar um segundo motor.
    """

    def _catalogo(self):
        r = self.client.get('/api/pos/reports/catalog/')
        self.assertEqual(r.status_code, 200, r.content)
        return {f['code']: f for f in (r.data.get('folders') or [])}

    def _correr(self, code, params=None):
        # "Incluir detalhes? Sim" — a pergunta que o motor faz a TODOS os
        # relatórios antes de os abrir. Sem ela, devolve só o resumo (nº de
        # registos + totais), que é uma vista legítima mas não a que se quer
        # conferir aqui; há um teste próprio para o resumo mais abaixo.
        p = dict(params or {})
        p.setdefault('detailed', 'S')
        r = self.client.post('/api/pos/reports/run/',
                             {'code': code, 'params': p}, format='json')
        self.assertEqual(r.status_code, 200, f'{code}: {r.content}')
        return r.data

    def test_as_pastas_do_pms_estao_no_mesmo_catalogo(self):
        pastas = self._catalogo()
        for code, nome in (('PM', 'Alojamento'), ('PO', 'Ocupação'), ('PC', 'Contas')):
            self.assertIn(code, pastas, f'a pasta {nome} não aparece nos Relatórios')
            self.assertGreater(pastas[code]['count'], 0)
        # E as do POS continuam lá — não se substituiu nada.
        self.assertIn('06', pastas, 'as pastas do POS desapareceram')

    def test_relatorio_de_reservas_traz_a_reserva_que_existe(self):
        self._reserva_em_checkin()      # 2 noites × 30000, quarto 101
        p = {'from': str(self.hoje), 'to': str(self.hoje + timedelta(days=1))}
        d = self._correr('pms_reservas', p)

        self.assertEqual(len(d['rows']), 1)
        linha = d['rows'][0]
        self.assertEqual(linha['guest'], 'Hospede Teste')
        self.assertEqual(linha['room'], '101')
        self.assertEqual(linha['nights'], 2)
        self.assertEqual(linha['rate'], 30000.0)
        self.assertEqual(linha['total'], 60000.0)
        self.assertEqual(d['totals']['total'], 60000.0)
        # O cabeçalho da empresa vem do motor, como nos relatórios do POS.
        self.assertIn('company', d)

    def test_ocupacao_com_adr_e_revpar(self):
        """3 quartos no hotel, 1 vendido a 30000: ocupação 33,3%, ADR 30000,
        RevPAR 10000 — é esta conta que diz se o hotel está cheio a perder."""
        self._reserva_em_checkin()
        d = self._correr('pms_ocupacao', {'from': str(self.hoje), 'to': str(self.hoje)})
        linha = d['rows'][0]
        self.assertEqual(linha['rooms'], 3)
        self.assertEqual(linha['occupied'], 1)
        self.assertEqual(linha['free'], 2)
        self.assertEqual(linha['occupancy'], 33.3)
        self.assertEqual(linha['adr'], 30000.0)
        self.assertEqual(linha['revpar'], 10000.0)

    def test_entradas_e_saidas_por_dia(self):
        self._reserva_em_checkin()      # entra hoje, sai daqui a 2 dias
        d = self._correr('pms_entradas_saidas',
                         {'from': str(self.hoje), 'to': str(self.hoje + timedelta(days=2))})
        self.assertEqual(d['rows'][0]['arrivals'], 1)
        self.assertEqual(d['rows'][1]['stayovers'], 1, 'o hóspede que fica não é contado')
        self.assertEqual(d['rows'][2]['departures'], 1)
        self.assertEqual(d['totals']['arrivals'], 1)

    def test_receita_por_categoria_e_por_origem(self):
        self._reserva_em_checkin()
        p = {'from': str(self.hoje), 'to': str(self.hoje + timedelta(days=1))}

        cat = self._correr('pms_receita_categoria', p)
        self.assertEqual(cat['rows'][0]['category'], 'Standard')
        self.assertEqual(cat['rows'][0]['nights'], 2)
        self.assertEqual(cat['rows'][0]['revenue'], 60000.0)
        self.assertEqual(cat['rows'][0]['share'], 100.0)

        orig = self._correr('pms_origem', p)
        self.assertEqual(orig['rows'][0]['source'], 'Direto (receção)')
        self.assertEqual(orig['rows'][0]['reservations'], 1)

    def test_contas_em_aberto_e_consumos(self):
        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio
        self.client.post(f'/api/pms/folios/{folio.id}/post_charge/', {
            'charge_type': 'FNB', 'description': 'Jantar', 'amount': '6000'}, format='json')

        abertas = self._correr('pms_contas_abertas')
        self.assertEqual(len(abertas['rows']), 1)
        self.assertEqual(abertas['rows'][0]['guest'], 'Hospede Teste')
        self.assertEqual(abertas['rows'][0]['balance'], 36000.0)
        self.assertEqual(abertas['totals']['balance'], 36000.0)

        consumos = self._correr('pms_consumos', {'from': str(self.hoje), 'to': str(self.hoje)})
        porTipo = {l['kind']: l['amount'] for l in consumos['rows']}
        self.assertEqual(porTipo['Alojamento'], 30000.0)
        self.assertEqual(porTipo['F&B (POS)'], 6000.0)
        self.assertEqual(consumos['totals']['amount'], 36000.0)

    def test_governanta_e_previsao(self):
        self._reserva_em_checkin()

        gov = self._correr('pms_governanta')
        self.assertEqual(len(gov['rows']), 3, 'faltam quartos no mapa da governanta')
        ocupado = [l for l in gov['rows'] if l['room'] == '101'][0]
        self.assertEqual(ocupado['status'], 'Ocupado')

        prev = self._correr('pms_previsao', {'days': 3})
        self.assertEqual(len(prev['rows']), 3)
        self.assertEqual(prev['rows'][0]['sold'], 1)
        self.assertEqual(prev['rows'][0]['free'], 2)

    def test_depositos_no_relatorio(self):
        self.client.post('/api/pms/booking-settings/', {
            'hotel': self.hotel.id, 'slug': 'hotel-teste', 'enabled': True,
            'deposit_percent': '50', 'payment_enabled': True,
            'payment_provider': 'SIMULATED'}, format='json')
        entrada = self.hoje + timedelta(days=10)
        self.client.post('/api/pms/booking/reserve/', {
            'slug': 'hotel-teste', 'room_type': self.rt,
            'check_in': str(entrada), 'check_out': str(entrada + timedelta(days=2)),
            'adults': 2, 'guest': {'name': 'Hospede Web', 'email': 'web@teste.ao'}}, format='json')

        d = self._correr('pms_depositos', {'from': str(self.hoje), 'to': str(self.hoje)})
        self.assertEqual(len(d['rows']), 1)
        self.assertEqual(d['rows'][0]['guest'], 'Hospede Web')
        self.assertEqual(d['rows'][0]['amount'], 30000.0)   # 50% de 60000
        self.assertEqual(d['rows'][0]['status'], 'Pendente')
        self.assertEqual(d['rows'][0]['posted'], 'Não')

    def test_o_resumo_mostra_os_totais_em_dinheiro(self):
        """"Incluir detalhes? Não" tem de dar o total, não uma linha vazia.

        O motor resume usando as colunas marcadas como dinheiro; um relatório
        que não as marque resume-se a "Registos: 1" e o dono fica sem saber
        quanto foi — que é precisamente o que ele queria saber ao pedir o
        resumo."""
        self._reserva_em_checkin()
        r = self.client.post('/api/pos/reports/run/', {
            'code': 'pms_reservas',
            'params': {'from': str(self.hoje), 'to': str(self.hoje + timedelta(days=1)),
                       'detailed': 'N'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        colunas = [c[0] for c in r.data['columns']]
        self.assertIn('total', colunas, 'o resumo não traz o total em dinheiro')
        self.assertEqual(r.data['rows'][0]['n'], 1)
        self.assertEqual(float(r.data['rows'][0]['total']), 60000.0)

    def test_um_relatorio_do_pms_sem_dados_nao_rebenta(self):
        """Um hotel acabado de montar abre os Relatórios e não pode ver um erro."""
        for code in ('pms_reservas', 'pms_ocupacao', 'pms_entradas_saidas',
                     'pms_receita_categoria', 'pms_origem', 'pms_contas_abertas',
                     'pms_consumos', 'pms_governanta', 'pms_depositos', 'pms_previsao'):
            d = self._correr(code, {'from': str(self.hoje), 'to': str(self.hoje)})
            self.assertIn('columns', d, f'{code} não devolveu colunas')
            self.assertIn('rows', d)


class SaftDoAlojamentoTests(PmsBase):
    """O SAF-T das facturas do PMS.

    Só existia o do POS. Um hotel emite facturas por dois caminhos — o terminal
    e as contas das estadias — e só conseguia exportar metade; as facturas do
    alojamento, que num hotel são a maior parte da receita, não tinham por onde
    sair. Numa inspecção, é o ficheiro que falta.
    """

    def _fiscal(self):
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif, cfg.environment = 'Hotel Teste Lda', '5000000000', 'TEST'
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        tipo = FiscalDocType.objects.create(code='FR', name='Factura-Recibo', signable=True)
        FiscalSeries.objects.create(code='T', doc_type=tipo, year=self.hoje.year,
                                    certified=True, is_active=True, environment='TEST')

    def _facturar(self):
        res_id = self._reserva_em_checkin()
        folio = Reservation.objects.get(id=res_id).folio
        self.client.post(f'/api/pms/folios/{folio.id}/settle/', {}, format='json')
        r = self.client.post(f'/api/pms/folios/{folio.id}/generate-invoice/', {}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.data['invoice_number']

    def test_resumo_diz_o_que_vai_sair(self):
        self._fiscal()
        vazio = self.client.get('/api/pms/saft/')
        self.assertEqual(vazio.status_code, 200, vazio.content)
        self.assertEqual(vazio.data['documents'], 0)
        self.assertEqual(vazio.data['application'], 'PMS')

        self._facturar()
        cheio = self.client.get('/api/pms/saft/')
        self.assertEqual(cheio.data['documents'], 1)
        self.assertEqual(cheio.data['company'], 'Hotel Teste Lda')
        self.assertEqual(cheio.data['tax_id'], '5000000000')
        self.assertIsNotNone(cheio.data['first'])

    def test_sem_documentos_nao_se_entrega_um_ficheiro_vazio(self):
        """Um SAF-T sem documentos é XML válido e substância nenhuma: entregue à
        AGT, declara que o hotel não facturou nada naquele mês."""
        self._fiscal()
        r = self.client.post('/api/pms/saft/', {'year': self.hoje.year, 'month': 1}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('vazio não se entrega', r.data['detail'])

    def test_o_ficheiro_sai_com_a_factura_do_alojamento(self):
        self._fiscal()
        numero = self._facturar()

        r = self.client.post('/api/pms/saft/',
                             {'year': self.hoje.year, 'month': self.hoje.month}, format='json')
        self.assertEqual(r.status_code, 200, getattr(r, 'data', r.content))
        self.assertEqual(r['Content-Type'], 'application/xml')
        self.assertIn('SAFT_PMS_', r['Content-Disposition'])

        xml = r.content.decode('utf-8')
        import xml.etree.ElementTree as ET
        ET.fromstring(xml)                      # tem de ser XML bem formado
        self.assertIn('5000000000', xml, 'o NIF da empresa não saiu no ficheiro')
        self.assertIn(numero, xml, 'a factura do alojamento não saiu no ficheiro')

    def test_o_ficheiro_do_alojamento_nao_leva_as_facturas_do_pos(self):
        """As duas origens são ficheiros separados de propósito: um restaurante
        que só comunica o POS não pode mandar no mesmo ficheiro as facturas do
        alojamento, e vice-versa."""
        from fiscal.models import FiscalDocument
        self._fiscal()
        numero_pms = self._facturar()

        # Uma factura do POS, do mesmo dia, no mesmo arquivo fiscal.
        doc = FiscalDocument.objects.get(invoice_no=numero_pms)
        doc.pk, doc.id = None, None
        doc.invoice_no = 'FR A/999'
        # O NÚMERO TAMBÉM MUDA, e tem de mudar: a série passou a ter uma
        # constraint de unicidade em (série, número) — duas facturas com o mesmo
        # número na mesma série é precisamente o que nunca pode existir, e é a
        # primeira coisa que uma inspecção da AGT olha. Este teste clonava um
        # documento para simular "uma factura do POS no mesmo arquivo" e deixava
        # o número do original: deixou de ser um cenário possível.
        doc.number = (doc.number or 0) + 999
        doc.source_module, doc.source_ref = 'pos', '1'
        doc.save()

        r = self.client.post('/api/pms/saft/',
                             {'year': self.hoje.year, 'month': self.hoje.month}, format='json')
        xml = r.content.decode('utf-8')
        self.assertIn(numero_pms, xml)
        self.assertNotIn('FR A/999', xml, 'o SAF-T do alojamento levou uma factura do POS')

    def test_a_exportacao_fica_registada_no_mesmo_livro_do_pos(self):
        """É o histórico do que saiu para a AGT — e a marca "válido" é escrita
        pelo validador, nunca à mão."""
        from fiscal.models import SaftExport
        self._fiscal()
        self._facturar()
        self.client.post('/api/pms/saft/',
                         {'year': self.hoje.year, 'month': self.hoje.month}, format='json')

        registo = SaftExport.objects.order_by('-id').first()
        self.assertIsNotNone(registo, 'a exportação não ficou registada')
        self.assertTrue(registo.filename.startswith('SAFT_PMS_'))
        self.assertTrue(registo.is_valid)
        self.assertEqual(len(registo.sha256), 64)
        self.assertGreater(registo.size_bytes, 0)

    def test_ano_inteiro_sem_mes(self):
        self._fiscal()
        self._facturar()
        r = self.client.post('/api/pms/saft/', {'year': self.hoje.year}, format='json')
        self.assertEqual(r.status_code, 200, getattr(r, 'data', r.content))
        self.assertIn(f'SAFT_PMS_{self.hoje.year}.xml', r['Content-Disposition'])


# ==========================================================================
# AUDITORIA DE PONTA A PONTA — "regra de ouro: não pulas nenhum"
#
# As classes a seguir foram escritas a percorrer as rotas de `urls.py` uma a
# uma, a perguntar em cada paragem o que o recepcionista sofre quando a regra
# está errada: datas impossíveis aceitas, quartos que ficam ocupados para
# sempre, dinheiro lançado em contas fechadas, diárias cobradas a dobrar.
# ==========================================================================

class PmsEstadosDaReservaTests(PmsBase):
    """As regras de estado/datas da reserva — onde um engano de teclado se
    transforma num quarto que ninguém pode vender."""

    def _reserva(self, **extra):
        dados = {'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
                 'check_in': str(self.hoje), 'check_out': str(self.hoje + timedelta(days=2)),
                 'adults': 2}
        dados.update(extra)
        return self.client.post('/api/pms/reservations/', dados, format='json')

    def test_saida_antes_da_entrada_e_recusada(self):
        """Datas invertidas (engano de teclado na receção) tinham de ser
        recusadas na hora. Antes eram aceitas e nascia uma reserva fantasma:
        as noites davam 0, não aparecia na disponibilidade, não travava o
        quarto e nunca era cobrada — até o hóspede chegar e não haver quarto."""
        r = self._reserva(check_in=str(self.hoje + timedelta(days=3)),
                          check_out=str(self.hoje + timedelta(days=1)))
        self.assertEqual(r.status_code, 400,
                         'uma reserva que sai antes de entrar não pode ser gravada')

    def test_reserva_de_zero_noites_e_recusada(self):
        """Entrada e saída no mesmo dia não é uma estadia — é um engano. E uma
        estadia de 0 noites não cobra nada a ninguém."""
        r = self._reserva(check_out=str(self.hoje))
        self.assertEqual(r.status_code, 400, 'entrada e saída no mesmo dia não é uma estadia')

    def test_encurtar_a_estadia_abaixo_de_uma_noite_e_recusado(self):
        """A mesma regra ao ALTERAR: o PATCH não pode deixar passar o que o
        POST recusa (era por aí que a reserva fantasma entrava)."""
        res = self._reserva()
        self.assertEqual(res.status_code, 201, res.content)
        r = self.client.patch('/api/pms/reservations/%s/' % res.data['id'],
                              {'check_out': str(self.hoje)}, format='json')
        self.assertEqual(r.status_code, 400, 'alterar para 0 noites tinha de ser recusado')

    def test_cancelar_uma_reserva_em_check_in_e_recusado(self):
        """O hóspede está dentro do quarto: cancelar não o põe na rua.

        Antes o cancelamento passava e deixava o estrago todo: o quarto ficava
        OCUPADO para sempre (ninguém o conseguia vender outra vez), a conta
        ficava aberta com os consumos dele e o check-out já não era possível
        porque a reserva deixara de estar em check-in. Para sair de lá só
        mexendo na base de dados."""
        res_id = self._reserva_em_checkin()
        r = self.client.post('/api/pms/reservations/%s/cancel/' % res_id, {}, format='json')
        self.assertEqual(r.status_code, 409,
                         'cancelar um hóspede que está dentro do hotel tinha de ser recusado')
        res = Reservation.objects.get(pk=res_id)
        self.assertEqual(res.status, 'CHECKED_IN')
        self.assertEqual(Room.objects.get(pk=self.quartos[0]).status, 'OCCUPIED')

    def test_cancelar_uma_reserva_ainda_nao_chegada_continua_a_funcionar(self):
        """A trava acima não pode fechar o caso normal: uma reserva por chegar
        cancela-se sempre."""
        res = self._reserva(check_in=str(self.hoje + timedelta(days=5)),
                            check_out=str(self.hoje + timedelta(days=7)))
        r = self.client.post('/api/pms/reservations/%s/cancel/' % res.data['id'], {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['status'], 'CANCELLED')

    def test_reserva_travada_nao_e_mudada_de_quarto(self):
        """"Não Mudar Qrt" era uma promessa só do ecrã.

        O campo existe para o quarto prometido a um hóspede (o 101 da lua de
        mel, o adaptado de quem anda de cadeira de rodas) não ser arrastado por
        uma mudança em massa. O ecrã respeitava-o; a API não — e quem chamasse
        a Mudança de Quarto pelo seletor de quartos movia a reserva travada
        como qualquer outra."""
        res = self._reserva(room=self.quartos[0], lock_room=True)
        self.assertEqual(res.status_code, 201, res.content)
        r = self.client.post('/api/pms/reservations/change-room/',
                             {'reservation': res.data['id'], 'room': self.quartos[1]}, format='json')
        self.assertEqual(r.status_code, 409,
                         'uma reserva marcada "Não Mudar Qrt" não se move pela API')
        self.assertEqual(Reservation.objects.get(pk=res.data['id']).room_id, self.quartos[0])

    def test_mudar_de_quarto_sem_trava_continua_a_funcionar(self):
        res = self._reserva(room=self.quartos[0])
        r = self.client.post('/api/pms/reservations/change-room/',
                             {'reservation': res.data['id'], 'room': self.quartos[1]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Reservation.objects.get(pk=res.data['id']).room_id, self.quartos[1])

    def test_mudar_para_quarto_de_outra_categoria_e_recusado(self):
        """A disponibilidade conta por CATEGORIA, a partir da reserva.

        Pôr o hóspede de um Standard numa Suite sem mais nada deixava a Suite a
        aparecer livre na disponibilidade (a reserva continua a contar no
        Standard) — a receção vendia-a e só descobria o engano no check-in, com
        um "Quarto já está ocupado" na cara do segundo hóspede. A Atribuição
        Rápida já recusava isto; a Mudança de Quarto não."""
        r2 = self.client.post('/api/pms/room-types/', {
            'hotel': self.hotel.id, 'code': 'SUI', 'name': 'Suite',
            'base_rate': '90000', 'capacity_adults': 2}, format='json')
        suite = self.client.post('/api/pms/rooms/', {
            'hotel': self.hotel.id, 'room_type': r2.data['id'], 'number': '201',
            'status': 'VACANT_CLEAN'}, format='json')
        res = self._reserva(room=self.quartos[0])
        r = self.client.post('/api/pms/reservations/change-room/',
                             {'reservation': res.data['id'], 'room': suite.data['id']}, format='json')
        self.assertEqual(r.status_code, 400,
                         'mudar para outra categoria desalinha a disponibilidade')

    def test_atribuicao_rapida_nao_rouba_o_quarto_a_outra_reserva(self):
        """Duas reservas, o mesmo quarto, datas que se cruzam: a segunda
        atribuição tem de bater com um 409 e não com um overbooking."""
        a = self._reserva(room=self.quartos[0])
        b = self._reserva(check_in=str(self.hoje + timedelta(days=1)),
                          check_out=str(self.hoje + timedelta(days=3)))
        r = self.client.post('/api/pms/reservations/quick-assign/',
                             {'reservation': b.data['id'], 'room': self.quartos[0]}, format='json')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIsNone(Reservation.objects.get(pk=b.data['id']).room_id)
        self.assertEqual(Reservation.objects.get(pk=a.data['id']).room_id, self.quartos[0])

    def test_trancar_registos_nunca_fica_fora_de_uma_transacao(self):
        """O select_for_update() solto é um erro que o SQLite esconde.

        A Atribuição Rápida e a Mudança de Quarto trancam a reserva e o quarto
        para duas pessoas não atribuírem o mesmo quarto ao mesmo tempo. Só que
        o faziam FORA de uma transação: no SQLite do desenvolvimento a tranca é
        ignorada em silêncio e tudo parece bem, e no PostgreSQL do cliente o
        Django levanta TransactionManagementError — os dois ecrãs rebentavam
        com "erro interno" no hotel a sério e em nenhum teste aqui. Daí esta
        verificação ser sobre o código e não sobre uma resposta HTTP: é a única
        maneira de a apanhar numa base SQLite."""
        import ast
        import inspect
        from pathlib import Path
        from pms import views as pms_views, booking_engine, night_audit as pms_night_audit

        faltam = []
        for modulo in (pms_views, booking_engine, pms_night_audit):
            caminho = Path(inspect.getfile(modulo))
            arvore = ast.parse(caminho.read_text(encoding='utf-8'))
            for no in ast.walk(arvore):
                if not isinstance(no, ast.FunctionDef):
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
                        faltam.append('%s:%s (em %s)' % (caminho.name, linha, no.name))
        self.assertEqual(faltam, [],
                         'há select_for_update() fora de uma transação — rebenta em '
                         'PostgreSQL: ' + ', '.join(faltam))


class PmsContaDoHospedeTests(PmsBase):
    """O folio — onde o dinheiro tem de bater ao cêntimo."""

    def setUp(self):
        super().setUp()
        self.res_id = self._reserva_em_checkin()
        self.folio = Folio.objects.get(reservation_id=self.res_id)

    def test_pagamento_num_valor_que_nao_e_numero_nao_rebenta(self):
        """"Registar Pagamento" com lixo no valor dava erro interno (500): a
        receção via "Ocorreu um erro interno" e não sabia que o problema era o
        que ela própria escreveu."""
        r = self.client.post('/api/pms/folios/%s/settle/' % self.folio.id,
                             {'amount': 'trinta mil'}, format='json')
        self.assertEqual(r.status_code, 400, 'um valor que não é número explica-se, não rebenta')

    def test_pagamento_negativo_e_recusado(self):
        """Um "pagamento" de valor negativo AUMENTA a dívida sem deixar rasto —
        é uma cobrança disfarçada de recibo. O lançamento de encargos já
        recusava valores negativos; o pagamento não."""
        antes = self.folio.balance
        r = self.client.post('/api/pms/folios/%s/settle/' % self.folio.id,
                             {'amount': '-5000'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Folio.objects.get(pk=self.folio.id).balance, antes,
                         'o saldo da conta não podia ter mexido')

    def test_pagamento_numa_conta_fechada_e_recusado(self):
        """Depois do check-out a conta está fechada (e muitas vezes facturada).

        Lançar lá um pagamento punha dinheiro numa conta que já ninguém volta a
        ver: não entra em factura nenhuma, aparece no relatório de pagamentos e
        o saldo da conta fica negativo sem explicação. O lançamento de encargos
        já verificava a conta fechada; o pagamento não verificava nada."""
        self.client.post('/api/pms/folios/%s/settle/' % self.folio.id,
                         {'amount': str(self.folio.balance)}, format='json')
        r = self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        r = self.client.post('/api/pms/folios/%s/settle/' % self.folio.id,
                             {'amount': '1000'}, format='json')
        self.assertEqual(r.status_code, 400, 'não se lança dinheiro numa conta fechada')

    def test_pagamento_sem_saldo_nao_cria_uma_linha_a_zero(self):
        """O botão do ecrã manda "pagar o saldo" sem valor. Com a conta já
        liquidada, isso criava um recibo de 0,00 — ruído no extrato do hóspede
        e no relatório de pagamentos."""
        self.client.post('/api/pms/folios/%s/settle/' % self.folio.id,
                         {'amount': str(self.folio.balance)}, format='json')
        linhas_antes = self.folio.charges.count()
        r = self.client.post('/api/pms/folios/%s/settle/' % self.folio.id, {}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Folio.objects.get(pk=self.folio.id).charges.count(), linhas_antes,
                         'não devia ter sido criada nenhuma linha nova')

    def test_apagar_uma_conta_com_movimentos_e_recusado(self):
        """Apagar o folio levava atrás (em cascata) todos os lançamentos — e o
        número da factura fiscal que lá estava gravado. Um estorno deixa rasto;
        um DELETE não deixa nada, e é a conta inteira do hóspede."""
        r = self.client.delete('/api/pms/folios/%s/' % self.folio.id)
        self.assertIn(r.status_code, (400, 409),
                      'uma conta com lançamentos não se apaga — estorna-se')
        self.assertTrue(Folio.objects.filter(pk=self.folio.id).exists())

    def test_transferir_lancamento_entre_contas_da_mesma_reserva(self):
        """A empresa paga o alojamento, o hóspede paga os extras: o lançamento
        muda de conta e o dinheiro total da reserva não pode mexer."""
        nova = self.client.post('/api/pms/folios/%s/split/' % self.folio.id,
                                {'label': 'B · Extras', 'payer_type': 'COMPANY'}, format='json')
        self.assertEqual(nova.status_code, 201, nova.content)
        enc = self.client.post('/api/pms/folios/%s/post_charge/' % self.folio.id,
                               {'amount': '4500', 'charge_type': 'MINIBAR',
                                'description': 'Minibar'}, format='json')
        total_antes = (Folio.objects.get(pk=self.folio.id).balance
                       + Folio.objects.get(pk=nova.data['id']).balance)
        r = self.client.post('/api/pms/folios/%s/transfer-charge/' % self.folio.id,
                             {'charge': enc.data['id'], 'target_folio': nova.data['id']},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content)
        total_depois = (Folio.objects.get(pk=self.folio.id).balance
                        + Folio.objects.get(pk=nova.data['id']).balance)
        self.assertEqual(total_antes, total_depois, 'a transferência inventou/perdeu dinheiro')
        self.assertEqual(Decimal(str(Folio.objects.get(pk=nova.data['id']).balance)),
                         Decimal('4500'))

    def test_transferir_para_a_conta_de_outra_reserva_e_recusado(self):
        """Senão o consumo de um hóspede ia para a conta de outro."""
        outro = Customer.objects.create(code='PMS-T9', name='Outro Hospede')
        r2 = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': outro.id, 'room_type': self.rt,
            'room': self.quartos[1], 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=1))}, format='json')
        self.client.post('/api/pms/reservations/%s/check_in/' % r2.data['id'], {}, format='json')
        alheia = Folio.objects.get(reservation_id=r2.data['id'])
        linha = self.folio.charges.first()
        r = self.client.post('/api/pms/folios/%s/transfer-charge/' % self.folio.id,
                             {'charge': linha.id, 'target_folio': alheia.id}, format='json')
        self.assertEqual(r.status_code, 400, 'um consumo não passa para a conta de outro hóspede')

    def test_estorno_nao_conta_duas_vezes_na_conta(self):
        """Um lançamento estornado e a linha de estorno anulam-se: a conta tem
        de ficar com o que o hóspede realmente consumiu."""
        enc = self.client.post('/api/pms/folios/%s/post_charge/' % self.folio.id,
                               {'amount': '7000', 'description': 'Lavandaria',
                                'charge_type': 'LAUNDRY'}, format='json')
        self.client.post('/api/pms/folios/%s/reverse-charge/' % self.folio.id,
                         {'charge': enc.data['id'], 'reason': 'Lançado no quarto errado'},
                         format='json')
        folio = Folio.objects.get(pk=self.folio.id)
        self.assertEqual(folio.charges_total, Decimal('30000'),
                         'o estorno tinha de deixar a conta como estava antes do engano')
        self.assertEqual(folio.charges.count(), 3,
                         'o original e o estorno ficam os dois no histórico')


class PmsAuditoriaDaNoiteTests(PmsBase):
    """A Auditoria da Noite — a peça que lança o dinheiro das noites. Cada
    engano aqui é uma diária a mais ou a menos na conta do hóspede."""

    def _reserva(self, dias_ate_entrada=0, noites=2, quarto=0):
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[quarto],
            'check_in': str(self.hoje + timedelta(days=dias_ate_entrada)),
            'check_out': str(self.hoje + timedelta(days=dias_ate_entrada + noites))}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def test_check_in_antecipado_lanca_a_noite_da_estadia_e_nao_a_de_hoje(self):
        """Primo do defeito da factura em duplicado — mas em diárias.

        O check-in lançava a 1ª diária com a data de HOJE, fosse hoje o dia da
        entrada ou não. No check-in adiantado (o hóspede chega na véspera, o
        turno adianta-se) isso é uma diária de uma noite que NÃO é da estadia —
        e as noites verdadeiras entram depois pela Auditoria da Noite, cada uma
        com a sua referência. Resultado: três diárias numa estadia de duas.

        A referência do lançamento (`ROOM-<data>`) é exactamente a trava que a
        auditoria usa para não repetir a noite; por isso é ela que se verifica
        aqui."""
        res_id = self._reserva(dias_ate_entrada=3, noites=2)
        r = self.client.post('/api/pms/reservations/%s/check_in/' % res_id, {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        diarias = list(Folio.objects.get(reservation_id=res_id)
                       .charges.filter(charge_type='ROOM', is_void=False))
        self.assertEqual(len(diarias), 1, 'o check-in lança uma diária, a da 1ª noite')
        primeira_noite = self.hoje + timedelta(days=3)
        self.assertEqual(diarias[0].source_reference, 'ROOM-%s' % primeira_noite.isoformat(),
                         'a diária do check-in tem de ser da 1ª noite da estadia (%s), não da '
                         'noite de hoje — senão a auditoria dessa noite lança outra' % primeira_noite)

    def test_estadia_registada_depois_de_terminada_nao_inventa_uma_noite(self):
        """O mesmo defeito visto pelo dinheiro, com a estadia toda no passado
        (um grupo cujo check-in só foi lançado no sistema depois de sair).

        Duas noites a 30.000 são 60.000 — não 90.000. Antes, o check-in
        acrescentava uma diária com a data de hoje, que não é noite nenhuma
        desta estadia, e a conta do grupo saía com uma noite a mais."""
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje - timedelta(days=3)),
            'check_out': str(self.hoje - timedelta(days=1))}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        res_id = r.data['id']
        self.assertEqual(self.client.post('/api/pms/reservations/%s/check_in/' % res_id, {},
                                          format='json').status_code, 200)
        for i in (3, 2):
            self.client.post('/api/pms/night-audit/run/',
                             {'audit_date': str(self.hoje - timedelta(days=i))}, format='json')
        diarias = Folio.objects.get(reservation_id=res_id).charges.filter(
            charge_type='ROOM', is_void=False)
        self.assertEqual(diarias.count(), 2,
                         'uma estadia de 2 noites tem de ter 2 diárias, tem %s: %s'
                         % (diarias.count(), [c.source_reference for c in diarias]))
        self.assertEqual(sum(c.amount for c in diarias), Decimal('60000'),
                         'o dinheiro das diárias não bate com 2 noites a 30.000')
        self.assertNotIn('ROOM-%s' % self.hoje.isoformat(),
                         [c.source_reference for c in diarias],
                         'foi lançada uma noite que não pertence à estadia')

    def test_auditoria_de_uma_data_futura_e_recusada(self):
        """Correr a auditoria com a data errada (um engano no calendário)
        queimava essa data: a trava não deixa correr duas vezes a mesma data,
        por isso quando o dia chegasse a sério a auditoria era recusada — e as
        diárias dessa noite nunca entravam na conta."""
        self.client.post('/api/pms/reservations/%s/check_in/' % self._reserva(quarto=1), {},
                         format='json')
        r = self.client.post('/api/pms/night-audit/run/',
                             {'audit_date': str(self.hoje + timedelta(days=3))}, format='json')
        self.assertEqual(r.status_code, 400,
                         'a auditoria da noite fecha dias que já aconteceram, não o futuro')

    def test_auditoria_avisa_quando_a_conta_esta_fechada(self):
        """Uma conta fechada a meio da estadia (a empresa pediu a factura ao 2º
        dia) deixa de receber diárias — a auditoria salta a reserva em silêncio
        e o hotel perde as noites seguintes sem ninguém dar por nada. A
        auditoria tem de DIZER quais saltou."""
        res_id = self._reserva(noites=4)
        self.client.post('/api/pms/reservations/%s/check_in/' % res_id, {}, format='json')
        folio = Folio.objects.get(reservation_id=res_id)
        folio.status = 'CLOSED'
        folio.save(update_fields=['status'])
        r = self.client.post('/api/pms/night-audit/run/', {}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data.get('rooms_charged'), 0)
        saltadas = r.data.get('skipped_no_folio') or []
        self.assertTrue(saltadas, 'a auditoria tinha de avisar que saltou esta reserva')
        self.assertIn(Reservation.objects.get(pk=res_id).confirmation,
                      [s.get('confirmation') for s in saltadas])

    def test_auditoria_nao_lanca_nada_sem_hospedes_dentro(self):
        """Hotel vazio: a auditoria corre, não lança nada e não rebenta."""
        r = self.client.post('/api/pms/night-audit/run/', {}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['rooms_charged'], 0)
        self.assertEqual(Decimal(str(r.data['total_posted'])), Decimal('0'))

    def test_a_mesma_data_nao_corre_duas_vezes(self):
        """A trava contra o duplo-clique: duas diárias da mesma noite é dinheiro
        cobrado a dobrar."""
        self.client.post('/api/pms/night-audit/run/', {}, format='json')
        r = self.client.post('/api/pms/night-audit/run/', {}, format='json')
        self.assertEqual(r.status_code, 409, r.content)

    def test_historico_da_auditoria_e_so_de_leitura(self):
        """O histórico não se escreve à mão — senão inventava-se uma auditoria
        que nunca correu."""
        self.client.post('/api/pms/night-audit/run/', {}, format='json')
        lista = self.client.get('/api/pms/night-audit-runs/')
        self.assertEqual(lista.status_code, 200)
        r = self.client.post('/api/pms/night-audit-runs/',
                             {'hotel': self.hotel.id, 'audit_date': str(self.hoje)}, format='json')
        self.assertIn(r.status_code, (403, 405))


class PmsDisponibilidadeTests(PmsBase):
    """O gráfico de disponibilidade — a pergunta que a receção faz antes de
    aceitar qualquer reserva. Se este número mente, vende-se o que não existe."""

    def _reserva(self, dias=0, noites=1, estado='BOOKED', quarto=None, bloco=None):
        dados = {'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
                 'check_in': str(self.hoje + timedelta(days=dias)),
                 'check_out': str(self.hoje + timedelta(days=dias + noites)),
                 'status': estado}
        if quarto is not None:
            dados['room'] = self.quartos[quarto]
        if bloco is not None:
            dados['block'] = bloco
        r = self.client.post('/api/pms/reservations/', dados, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def test_hotel_sem_reservas_tem_tudo_livre(self):
        """O caso "sem dados": três quartos, nenhuma reserva — e o gráfico tem
        de dizer três livres, não zero nem um erro."""
        r = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                       'date_to': str(self.hoje + timedelta(days=2))})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.data['total']), 3, 'três dias pedidos, três dias devolvidos')
        for dia in r.data['total']:
            self.assertEqual(dia['total'], 3)
            self.assertEqual(dia['free'], 3, 'sem reservas, estão livres os três quartos')
            self.assertEqual(dia['overbook'], 0)

    def test_datas_ao_contrario_nao_devolvem_uma_lista_vazia(self):
        """Quem escreve as datas trocadas no filtro não merece um ecrã em
        branco — o período endireita-se."""
        r = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje + timedelta(days=3)),
                                                       'date_to': str(self.hoje)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['date_from'], self.hoje.isoformat())
        self.assertEqual(len(r.data['total']), 4)

    def test_opcao_e_lista_de_espera_contam_de_maneira_diferente(self):
        """Uma OPÇÃO retém o quarto (pode confirmar-se amanhã); uma LISTA DE
        ESPERA não — é um pedido além da capacidade. Misturá-las esconde
        quartos que estão à venda."""
        self._reserva(estado='OPTION')
        self._reserva(estado='WAITLIST')
        r = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                       'date_to': str(self.hoje)})
        dia = r.data['total'][0]
        self.assertEqual(dia['option'], 1)
        self.assertEqual(dia['waitlist'], 1)

    def test_vender_acima_do_inventario_aparece_como_overbooking(self):
        """Quatro reservas para três quartos: o gráfico tem de gritar
        overbooking 1 e livres 0, não livres -1 nem livres 0 calado."""
        for _ in range(4):
            self._reserva()
        r = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                       'date_to': str(self.hoje)})
        dia = r.data['total'][0]
        self.assertEqual(dia['reserved'], 4)
        self.assertEqual(dia['free'], 0, 'não há quartos livres com 4 reservas em 3 quartos')
        self.assertEqual(dia['overbook'], 1, 'faltou avisar que está vendido um quarto a mais')

    def test_a_noite_da_saida_volta_a_estar_a_venda(self):
        """A reserva ocupa as noites de entrada até à véspera da saída: no dia
        em que o hóspede sai, o quarto vende-se outra vez. Era aqui que um
        "<=" a mais fazia o hotel perder uma noite de venda por estadia."""
        self._reserva(dias=0, noites=2)
        r = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                       'date_to': str(self.hoje + timedelta(days=2))})
        dias = r.data['total']
        self.assertEqual(dias[0]['reserved'], 1, 'noite da entrada: ocupado')
        self.assertEqual(dias[1]['reserved'], 1, 'noite do meio: ocupado')
        self.assertEqual(dias[2]['reserved'], 0, 'dia da saída: o quarto volta a estar à venda')

    def test_quartos_retidos_por_um_bloco_so_contam_com_allotment(self):
        """Os quartos que um grupo tem retidos (allotment) não são reservas: só
        aparecem quando se pede `include_allotment`. E à medida que o grupo faz
        as reservas (pickup), a retenção desce — senão o mesmo quarto era
        contado duas vezes e o hotel aparecia cheio com quartos vazios."""
        bloco = self.client.post('/api/pms/blocks/', {
            'hotel': self.hotel.id, 'code': 'GRP1', 'description': 'Grupo Teste',
            'valid_from': str(self.hoje), 'valid_to': str(self.hoje + timedelta(days=2)),
            'is_guaranteed': True}, format='json')
        self.assertEqual(bloco.status_code, 201, bloco.content)
        g = self.client.post('/api/pms/blocks/%s/room-types/' % bloco.data['id'], {
            'room_type': self.rt, 'date': str(self.hoje), 'rooms_blocked': 2}, format='json')
        self.assertEqual(g.status_code, 201, g.content)

        sem = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                         'date_to': str(self.hoje)})
        self.assertEqual(sem.data['total'][0]['free'], 3,
                         'sem pedir allotment, a retenção do grupo não pode tirar quartos')
        com = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                         'date_to': str(self.hoje),
                                                         'include_allotment': '1'})
        self.assertEqual(com.data['total'][0]['allotment'], 2)
        self.assertEqual(com.data['total'][0]['free'], 1, 'dois quartos estão retidos pelo grupo')

        self._reserva(bloco=bloco.data['id'])
        depois = self.client.get('/api/pms/availability/', {'date_from': str(self.hoje),
                                                            'date_to': str(self.hoje),
                                                            'include_allotment': '1'})
        self.assertEqual(depois.data['total'][0]['allotment'], 1,
                         'a reserva do grupo gasta uma das retenções, não se soma a elas')
        self.assertEqual(depois.data['total'][0]['free'], 1,
                         'o mesmo quarto não pode ser contado como retido E como reservado')

    def test_pickup_do_bloco_lista_as_reservas_do_grupo(self):
        bloco = self.client.post('/api/pms/blocks/', {
            'hotel': self.hotel.id, 'code': 'GRP2', 'description': 'Grupo Dois',
            'valid_from': str(self.hoje), 'valid_to': str(self.hoje + timedelta(days=3))},
            format='json')
        self._reserva(bloco=bloco.data['id'])
        r = self.client.get('/api/pms/blocks/%s/pickup/' % bloco.data['id'])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_bloco_que_acaba_antes_de_comecar_e_recusado(self):
        """O mesmo engano de teclado da reserva, no bloco: um período que acaba
        antes de começar dá um bloco de 0 noites que nunca retém nada e que o
        grupo não entende por que não funciona."""
        r = self.client.post('/api/pms/blocks/', {
            'hotel': self.hotel.id, 'code': 'GRP3', 'description': 'Grupo ao contrário',
            'valid_from': str(self.hoje + timedelta(days=5)),
            'valid_to': str(self.hoje)}, format='json')
        self.assertEqual(r.status_code, 400, 'um bloco não pode acabar antes de começar')

    def test_mapa_de_quartos_livres_responde_sem_datas(self):
        """O ecrã abre antes de alguém escolher datas — e não pode rebentar."""
        r = self.client.get('/api/pms/rooms/free/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.data), 3)
        self.assertTrue(all(q['is_free'] for q in r.data),
                        'sem datas não há conflito possível, logo nenhum quarto está "ocupado"')

    def test_estado_hotel_conta_chegadas_saidas_e_ocupacao(self):
        """O painel do dia da receção: chegadas de hoje, saídas de hoje e a
        percentagem de ocupação a bater com os quartos realmente ocupados."""
        self._reserva_em_checkin()
        r = self.client.get('/api/pms/frontdesk/hotel-status/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['arrivals_count'], 1)
        self.assertTrue(r.data['arrivals'][0]['arrived'])
        self.assertEqual(r.data['occupancy']['occupied'], 1)
        self.assertEqual(r.data['occupancy']['total'], 3)
        self.assertEqual(r.data['occupancy']['pct'], 33.3)
        ocupado = [q for q in r.data['rooms'] if q['status'] == 'OCCUPIED']
        self.assertEqual(len(ocupado), 1)
        self.assertEqual(ocupado[0]['reservation']['guest_name'], self.guest.name)


class PmsMotorDeReservasOnlineTests(PmsBase):
    """O motor de reservas do site — o único sítio do PMS onde quem escreve é
    um estranho, sem login. Tudo o que entra aqui tem de ser desconfiado."""

    def setUp(self):
        super().setUp()
        from .models import BookingSettings
        self.cfg = BookingSettings.objects.create(hotel=self.hotel, slug='hotel-teste',
                                                  deposit_percent=Decimal('30'))
        self.client.logout()
        self.client.force_authenticate(None)

    def _disp(self, dias=7, noites=2, **extra):
        p = {'slug': self.cfg.slug, 'check_in': str(self.hoje + timedelta(days=dias)),
             'check_out': str(self.hoje + timedelta(days=dias + noites))}
        p.update(extra)
        return self.client.get('/api/pms/booking/availability/', p)

    def _reservar(self, dias=7, noites=2, **extra):
        d = {'slug': self.cfg.slug, 'room_type': self.rt,
             'check_in': str(self.hoje + timedelta(days=dias)),
             'check_out': str(self.hoje + timedelta(days=dias + noites)),
             'guest': {'name': 'Cliente do Site', 'email': 'site@exemplo.ao'}}
        d.update(extra)
        return self.client.post('/api/pms/booking/reserve/', d, format='json')

    def test_motor_desligado_nao_atende_ninguem(self):
        self.cfg.is_active = False
        self.cfg.save(update_fields=['is_active'])
        self.assertEqual(self.client.get('/api/pms/booking/config/',
                                         {'slug': self.cfg.slug}).status_code, 404)
        self.assertEqual(self._disp().status_code, 404)
        self.assertEqual(self._reservar().status_code, 404)

    def test_slug_que_nao_existe_nao_revela_nada(self):
        r = self.client.get('/api/pms/booking/config/', {'slug': 'hotel-que-nao-existe'})
        self.assertEqual(r.status_code, 404)
        self.assertNotIn('Hotel Teste', str(r.data))

    def test_datas_invalidas_sao_recusadas_antes_de_tudo(self):
        self.assertEqual(self._disp(noites=0).status_code, 400)
        self.assertEqual(self._reservar(noites=0).status_code, 400)
        self.assertEqual(self.client.get('/api/pms/booking/availability/',
                                         {'slug': self.cfg.slug, 'check_in': 'ontem',
                                          'check_out': 'amanhã'}).status_code, 400)

    def test_nao_se_reserva_para_uma_data_que_ja_passou(self):
        """Um pedido com datas no passado só pode ser engano (ou um robô) — e
        criava uma reserva a sério, que aparecia na lista da receção como se
        alguém fosse chegar num dia que já foi."""
        r = self._reservar(dias=-5)
        self.assertEqual(r.status_code, 400,
                         'não se aceita uma reserva online para uma noite que já passou')

    def test_tarifa_vale_ate_a_ULTIMA_NOITE_e_nao_ate_a_data_de_saida(self):
        """O que se vende são NOITES.

        Uma tarifa válida de 1 a 10 cobre a noite de 10 (quem entra a 10 sai a
        11). A validade era comparada com a data de SAÍDA, por isso a estadia
        10→11 caía fora da tarifa e o site mostrava a tarifa base da categoria:
        o hóspede via 30.000 em vez de 10.000 na última noite do período
        promocional, e o hotel perdia a venda sem saber porquê."""
        self.client.force_authenticate(self.user)
        plano = self.client.post('/api/pms/rate-plans/', {
            'hotel': self.hotel.id, 'room_type': self.rt, 'code': 'PROMO',
            'name': 'Promoção', 'price_per_night': '10000',
            'valid_from': str(self.hoje), 'valid_to': str(self.hoje + timedelta(days=7))},
            format='json')
        self.client.logout()
        self.client.force_authenticate(None)
        r = self._disp(dias=7, noites=1)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(plano.status_code, 201, plano.content)
        self.assertEqual(len(r.data["rooms"]), 1, r.data)
        self.assertEqual(Decimal(r.data['rooms'][0]['price_per_night']), Decimal('10000'),
                         'a última noite do período da tarifa tem de ser vendida a essa tarifa')

    def test_sem_quartos_livres_o_site_nao_mostra_a_categoria(self):
        """Três quartos, três reservas: a categoria desaparece do site em vez
        de deixar alguém pagar por um quarto que não existe."""
        self.client.force_authenticate(self.user)
        for q in range(3):
            self.client.post('/api/pms/reservations/', {
                'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
                'room': self.quartos[q], 'check_in': str(self.hoje + timedelta(days=7)),
                'check_out': str(self.hoje + timedelta(days=9))}, format='json')
        self.client.logout()
        self.client.force_authenticate(None)
        self.assertEqual(self._disp().data['rooms'], [])
        self.assertEqual(self._reservar().status_code, 409,
                         'reservar sem disponibilidade tinha de ser recusado')

    def test_antecedencia_minima_e_maxima_sao_respeitadas(self):
        self.cfg.min_advance_days = 3
        self.cfg.max_advance_days = 30
        self.cfg.save(update_fields=['min_advance_days', 'max_advance_days'])
        self.assertEqual(self._reservar(dias=1).status_code, 400)
        self.assertEqual(self._reservar(dias=60).status_code, 400)
        self.assertEqual(self._reservar(dias=10).status_code, 201)

    def test_hospede_sem_nome_ou_email_nao_reserva(self):
        self.assertEqual(self._reservar(guest={'name': '', 'email': 'a@b.ao'}).status_code, 400)
        self.assertEqual(self._reservar(guest={'name': 'Alguém', 'email': ''}).status_code, 400)

    def test_o_mesmo_email_nao_cria_uma_segunda_ficha_de_cliente(self):
        """Senão o histórico do hóspede ficava partido em várias fichas e o
        hotel nunca sabia que era um cliente repetido."""
        from mdm.models import Customer as C
        self.assertEqual(self._reservar(dias=7).status_code, 201)
        self.assertEqual(self._reservar(dias=20).status_code, 201)
        self.assertEqual(C.objects.filter(email__iexact='site@exemplo.ao').count(), 1)

    def test_deposito_e_arredondado_aos_centimos(self):
        """30% de 2 noites a 30.000 são 18.000,00 — e nunca "18000.0000 Kz",
        que é um valor que ninguém escreve num site."""
        self.cfg.deposit_percent = Decimal('33.33')
        self.cfg.save(update_fields=['deposit_percent'])
        r = self._reservar()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['deposit_due'], '19998.00')
        self.assertEqual(Decimal(r.data['total']), Decimal('60000'))

    def test_pagar_duas_vezes_no_site_nao_cria_dois_depositos_pagos(self):
        """O hóspede carrega duas vezes em "Já paguei" (a ligação dele é má):
        o segundo pedido não pode criar um segundo depósito pago nem lançar
        dinheiro duas vezes."""
        from .models import BookingPayment
        conf = self._reservar().data['confirmation']
        p1 = self.client.post('/api/pms/booking/pay/',
                              {'slug': self.cfg.slug, 'confirmation': conf}, format='json')
        self.assertEqual(p1.status_code, 200, p1.content)
        p2 = self.client.post('/api/pms/booking/pay/',
                              {'slug': self.cfg.slug, 'confirmation': conf}, format='json')
        self.assertEqual(p2.status_code, 400)
        self.assertEqual(BookingPayment.objects.filter(status='PAID').count(), 1)

    def test_pagar_uma_reserva_de_outro_hotel_nao_funciona(self):
        """A confirmação é procurada dentro do hotel do slug — senão, com uma
        confirmação adivinhada, marcava-se como pago o depósito de outra
        propriedade."""
        conf = self._reservar().data['confirmation']
        from identity.models import Hotel
        outro = Hotel.objects.create(company=self.hotel.company, name='Hotel Vizinho')
        from .models import BookingSettings
        vizinho = BookingSettings.objects.create(hotel=outro, slug='hotel-vizinho')
        r = self.client.post('/api/pms/booking/pay/',
                             {'slug': vizinho.slug, 'confirmation': conf}, format='json')
        self.assertEqual(r.status_code, 404)


class PmsMapaDeRefeicoesTests(PmsBase):
    """O Mapa de Refeições — o que a cozinha usa para saber quantas pessoas
    senta a cada refeição."""

    def setUp(self):
        super().setUp()
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje), 'check_out': str(self.hoje + timedelta(days=3)),
            'adults': 2, 'children': 1}, format='json')
        self.res_id = r.data['id']

    def test_aplicar_a_um_periodo_grava_um_dia_de_cada_vez(self):
        r = self.client.post('/api/pms/meal-plan-entries/apply-range/', {
            'reservation': self.res_id, 'meal_code': 'BREAKFAST',
            'date_from': str(self.hoje), 'date_to': str(self.hoje + timedelta(days=2)),
            'adults': 2, 'children_1': 1}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.data['ids']), 3, 'três dias pedidos, três linhas')
        lista = self.client.get('/api/pms/meal-plan-entries/', {'reservation': self.res_id})
        self.assertEqual(len(lista.data), 3)

    def test_aplicar_duas_vezes_nao_duplica_as_refeicoes(self):
        """Senão a cozinha preparava o dobro dos pequenos-almoços (e o mapa
        contava o dobro das pessoas) só porque alguém gravou duas vezes."""
        payload = {'reservation': self.res_id, 'meal_code': 'DINNER',
                   'date_from': str(self.hoje), 'date_to': str(self.hoje + timedelta(days=2)),
                   'adults': 2}
        self.client.post('/api/pms/meal-plan-entries/apply-range/', payload, format='json')
        self.client.post('/api/pms/meal-plan-entries/apply-range/', payload, format='json')
        lista = self.client.get('/api/pms/meal-plan-entries/', {'reservation': self.res_id})
        self.assertEqual(len(lista.data), 3, 'a segunda gravação atualiza, não acrescenta')

    def test_refeicao_desconhecida_e_recusada(self):
        r = self.client.post('/api/pms/meal-plan-entries/apply-range/', {
            'reservation': self.res_id, 'meal_code': 'BRUNCH',
            'date_from': str(self.hoje), 'date_to': str(self.hoje)}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_sem_datas_explica_se_em_vez_de_rebentar(self):
        """Faltar uma data no pedido dava erro interno (500) — o utilizador via
        "Ocorreu um erro interno" e ficava sem saber o que tinha feito mal."""
        r = self.client.post('/api/pms/meal-plan-entries/apply-range/', {
            'reservation': self.res_id, 'meal_code': 'LUNCH'}, format='json')
        self.assertEqual(r.status_code, 400, 'faltar a data explica-se, não rebenta')
        r = self.client.post('/api/pms/meal-plan-entries/apply-range/', {
            'reservation': self.res_id, 'meal_code': 'LUNCH',
            'date_from': 'segunda', 'date_to': 'terça'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_refeicoes_fora_da_estadia_sao_recusadas(self):
        """Marcar jantares para dias em que o hóspede já saiu é comida pedida
        para uma mesa que ninguém se senta — e, se houver pensão, dinheiro
        cobrado por refeições que não existiram."""
        r = self.client.post('/api/pms/meal-plan-entries/apply-range/', {
            'reservation': self.res_id, 'meal_code': 'DINNER',
            'date_from': str(self.hoje + timedelta(days=5)),
            'date_to': str(self.hoje + timedelta(days=6)), 'adults': 2}, format='json')
        self.assertEqual(r.status_code, 400,
                         'não se marcam refeições para fora das datas da estadia')

    def test_o_mapa_de_um_hotel_nao_mostra_as_refeicoes_do_outro(self):
        """Isolamento por propriedade: o mapa de refeições era a única lista do
        PMS que não filtrava por hotel — a cozinha do Hotel A via (e podia
        apagar) as refeições do Hotel B."""
        from identity.models import Hotel, UserHotelAccess
        from django.contrib.auth.models import User as U
        self.client.post('/api/pms/meal-plan-entries/apply-range/', {
            'reservation': self.res_id, 'meal_code': 'BREAKFAST',
            'date_from': str(self.hoje), 'date_to': str(self.hoje), 'adults': 2}, format='json')

        outro = Hotel.objects.create(company=self.hotel.company, name='Hotel Vizinho')
        vizinho = U.objects.create_user('recepcao_vizinha', 'v@v.ao', 'x')
        UserHotelAccess.objects.create(user=vizinho, hotel=outro)
        self.client.force_authenticate(vizinho)
        r = self.client.get('/api/pms/meal-plan-entries/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(list(r.data), [],
                         'a receção de um hotel não pode ver as refeições do outro')


class PmsInventarioETarifasTests(PmsBase):
    """Categorias, quartos, características e tarifas — a tabela de preços do
    hotel. Um engano aqui vende um quarto ao preço de outro."""

    def test_categoria_e_quarto_nao_se_repetem_no_hotel(self):
        r = self.client.post('/api/pms/room-types/', {
            'hotel': self.hotel.id, 'code': 'STD', 'name': 'Outro Standard'}, format='json')
        self.assertEqual(r.status_code, 400, 'duas categorias com o mesmo código confundem tudo')
        r = self.client.post('/api/pms/rooms/', {
            'hotel': self.hotel.id, 'room_type': self.rt, 'number': '101'}, format='json')
        self.assertEqual(r.status_code, 400, 'dois quartos 101 no mesmo hotel')

    def test_estado_do_quarto_so_aceita_estados_que_existem(self):
        r = self.client.post('/api/pms/rooms/%s/set_status/' % self.quartos[0],
                             {'status': 'LIMPINHO'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/api/pms/rooms/%s/set_status/' % self.quartos[0],
                             {'status': 'OOO'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Room.objects.get(pk=self.quartos[0]).status, 'OOO')

    def test_quarto_fora_de_servico_nao_recebe_check_in(self):
        """Um quarto em obras não se vende — e o check-in é a última porta
        antes de o hóspede ficar com a chave de um quarto sem água."""
        self.client.post('/api/pms/rooms/%s/set_status/' % self.quartos[0],
                         {'status': 'OOO'}, format='json')
        res = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje), 'check_out': str(self.hoje + timedelta(days=1))},
            format='json')
        r = self.client.post('/api/pms/reservations/%s/check_in/' % res.data['id'],
                             {'room': self.quartos[0]}, format='json')
        self.assertEqual(r.status_code, 409, r.content)

    def test_quarto_por_limpar_exige_confirmacao_expressa(self):
        """Dar um quarto sujo a um hóspede acontece (está cheio, a governanta
        vai a seguir), mas tem de ser uma decisão tomada, não um descuido."""
        self.client.post('/api/pms/rooms/%s/set_status/' % self.quartos[0],
                         {'status': 'VACANT_DIRTY'}, format='json')
        res = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje), 'check_out': str(self.hoje + timedelta(days=1))},
            format='json')
        url = '/api/pms/reservations/%s/check_in/' % res.data['id']
        self.assertEqual(self.client.post(url, {'room': self.quartos[0]},
                                          format='json').status_code, 409)
        self.assertEqual(self.client.post(url, {'room': self.quartos[0], 'allow_dirty': True},
                                          format='json').status_code, 200)

    def test_calendario_de_tarifas_so_mexe_nos_dias_da_semana_escolhidos(self):
        """"Sexta e sábado mais caros": a atualização em massa não pode tocar
        nos outros dias — era assim que uma promoção de fim de semana baixava
        o preço da semana toda."""
        plano = self.client.post('/api/pms/rate-plans/', {
            'hotel': self.hotel.id, 'room_type': self.rt, 'code': 'BAR',
            'name': 'Tarifa Balcão', 'price_per_night': '30000'}, format='json')
        inicio = self.hoje + timedelta(days=(4 - self.hoje.weekday()) % 7)   # próxima sexta
        r = self.client.post('/api/pms/rate-plans/bulk_update/', {
            'rate_plan_ids': [plano.data['id']], 'date_from': str(inicio),
            'date_to': str(inicio + timedelta(days=6)), 'weekdays': [4, 5],
            'update_price': True, 'base_price': '45000'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['days_touched'], 2, 'só a sexta e o sábado do período')
        linhas = self.client.get('/api/pms/rate-overrides/',
                                 {'rate_plan': plano.data['id']}).data
        self.assertEqual(len(linhas), 2)
        self.assertEqual({l['date'] for l in linhas},
                         {inicio.isoformat(), (inicio + timedelta(days=1)).isoformat()})

    def test_periodo_demasiado_longo_na_atualizacao_em_massa_e_recusado(self):
        """Dez anos de dias × vinte tarifas é um pedido que fica a pensar e
        enche a base de dados de linhas que ninguém pediu."""
        plano = self.client.post('/api/pms/rate-plans/', {
            'hotel': self.hotel.id, 'room_type': self.rt, 'code': 'BAR2',
            'name': 'Balcão 2', 'price_per_night': '30000'}, format='json')
        r = self.client.post('/api/pms/rate-plans/bulk_update/', {
            'rate_plan_ids': [plano.data['id']], 'date_from': str(self.hoje),
            'date_to': str(self.hoje + timedelta(days=4000)),
            'update_price': True, 'base_price': '1'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_atualizacao_em_massa_sem_tarifas_ou_sem_datas_e_recusada(self):
        self.assertEqual(self.client.post('/api/pms/rate-plans/bulk_update/', {},
                                          format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/pms/rate-plans/bulk_update/',
                                          {'rate_plan_ids': [1], 'date_from': str(self.hoje),
                                           'date_to': str(self.hoje - timedelta(days=5))},
                                          format='json').status_code, 400)

    def test_a_tarifa_da_reserva_manda_sobre_a_do_plano_e_a_da_categoria(self):
        """A cadeia de preços tem de ser uma só em todo o sistema: tarifa
        escrita na reserva > preço do plano > tarifa base da categoria. Era um
        `if` copiado em três ficheiros — e o relatório deixava de bater com o
        que o check-in lançava."""
        plano = self.client.post('/api/pms/rate-plans/', {
            'hotel': self.hotel.id, 'room_type': self.rt, 'code': 'COR',
            'name': 'Corporate', 'price_per_night': '22000'}, format='json')
        base = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje), 'check_out': str(self.hoje + timedelta(days=1))},
            format='json')
        self.assertEqual(Reservation.objects.get(pk=base.data['id']).effective_rate,
                         Decimal('30000'), 'sem plano nem tarifa, vale a base da categoria')
        comPlano = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'rate_plan': plano.data['id'], 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=1))}, format='json')
        self.assertEqual(Reservation.objects.get(pk=comPlano.data['id']).effective_rate,
                         Decimal('22000'))
        negociada = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'rate_plan': plano.data['id'], 'rate': '15000', 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=1))}, format='json')
        self.assertEqual(Reservation.objects.get(pk=negociada.data['id']).effective_rate,
                         Decimal('15000'), 'a tarifa negociada na reserva manda sobre tudo')

    def test_encargo_fixo_mostra_o_que_vai_somar_a_estadia(self):
        """Quem lança o estacionamento por noite tem de ver logo o que isso
        soma na estadia inteira, e não só o valor da noite."""
        res = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje), 'check_out': str(self.hoje + timedelta(days=3))},
            format='json')
        r = self.client.post('/api/pms/fixed-charges/', {
            'reservation': res.data['id'], 'description': 'Estacionamento',
            'charge_type': 'MISC', 'amount': '2500', 'per_night': True}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['total_estimado'], '7500.00')


class PmsFrontDeskRestanteTests(PmsBase):
    """Governanta, perdidos e achados, lista telefónica e eventos — as abas
    pequenas, que ninguém testa e que o pessoal da receção usa todos os dias."""

    def test_perdidos_e_achados_percorre_os_tres_estados(self):
        r = self.client.post('/api/pms/lost-found-items/', {
            'hotel': self.hotel.id, 'description': 'Óculos de sol',
            'found_location': 'Piscina', 'found_date': str(self.hoje),
            'room': self.quartos[0]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        item = r.data['id']
        self.assertEqual(r.data['status'], 'FOUND')
        self.client.patch('/api/pms/lost-found-items/%s/' % item,
                          {'status': 'CLAIMED', 'claimed_by': 'Hospede Teste'}, format='json')
        achados = self.client.get('/api/pms/lost-found-items/', {'status': 'CLAIMED'})
        self.assertEqual(len(achados.data), 1)
        self.assertEqual(self.client.get('/api/pms/lost-found-items/',
                                         {'status': 'FOUND'}).data, [])
        pesquisa = self.client.get('/api/pms/lost-found-items/', {'q': 'piscina'})
        self.assertEqual(len(pesquisa.data), 1, 'a pesquisa tem de ignorar maiúsculas')

    def test_tarefa_concluida_duas_vezes_nao_estraga_o_estado_do_quarto(self):
        """Dar a mesma limpeza por concluída outra vez (duplo-clique) não pode
        marcar como limpo um quarto que já voltou a estar ocupado."""
        tarefa = self.client.post('/api/pms/tasks/', {
            'hotel': self.hotel.id, 'title': 'Limpar 101', 'task_type': 'CLEANING',
            'room': self.quartos[0]}, format='json')
        self.client.post('/api/pms/rooms/%s/set_status/' % self.quartos[0],
                         {'status': 'VACANT_DIRTY'}, format='json')
        r1 = self.client.post('/api/pms/tasks/%s/mark-done/' % tarefa.data['id'], {}, format='json')
        self.assertEqual(r1.data['room_released'], '101')
        self.client.post('/api/pms/rooms/%s/set_status/' % self.quartos[0],
                         {'status': 'OCCUPIED'}, format='json')
        r2 = self.client.post('/api/pms/tasks/%s/mark-done/' % tarefa.data['id'], {}, format='json')
        self.assertIsNone(r2.data['room_released'])
        self.assertEqual(Room.objects.get(pk=self.quartos[0]).status, 'OCCUPIED',
                         'a tarefa repetida não pode roubar o quarto ao hóspede que lá está')

    def test_lista_telefonica_pesquisa_por_nome_departamento_e_ramal(self):
        self.client.post('/api/pms/phone-directory/', {
            'hotel': self.hotel.id, 'name': 'Governanta', 'department': 'Andares',
            'extension': '210'}, format='json')
        for termo in ('governanta', 'andares', '210'):
            r = self.client.get('/api/pms/phone-directory/', {'q': termo})
            self.assertEqual(len(r.data), 1, 'não encontrou pesquisando por "%s"' % termo)

    def test_evento_cancelado_sai_da_previsao_de_receita(self):
        """A previsão de receita de eventos soma os CONFIRMADOS. Um evento
        cancelado que continuasse a somar prometia ao dono dinheiro que já
        tinha desaparecido."""
        ev = self.client.post('/api/pms/events/', {
            'hotel': self.hotel.id, 'name': 'Casamento', 'event_date': str(self.hoje),
            'status': 'CONFIRMED', 'estimated_revenue': '1500000'}, format='json')
        self.assertEqual(ev.status_code, 201, ev.content)
        d = self.client.get('/api/pms/events/forecast/', {'months': 1})
        self.assertEqual(d.data['total'], 1500000.0)
        self.client.patch('/api/pms/events/%s/' % ev.data['id'],
                          {'status': 'CANCELLED'}, format='json')
        d = self.client.get('/api/pms/events/forecast/', {'months': 1})
        self.assertEqual(d.data['total'], 0.0, 'um evento cancelado não é receita prevista')

    def test_previsao_de_eventos_com_parametros_absurdos_nao_rebenta(self):
        for valor in ('abc', '-5', '0', '999'):
            r = self.client.get('/api/pms/events/forecast/', {'months': valor})
            self.assertEqual(r.status_code, 200, 'months=%s rebentou' % valor)
            self.assertGreaterEqual(len(r.data['rows']), 1)
            self.assertLessEqual(len(r.data['rows']), 24)


class PmsRelatoriosQueTemDeBaterTests(PmsBase):
    """Os relatórios vistos pelo dinheiro: o que eles somam tem de ser o que o
    hotel vendeu — nem mais (receita que não existe) nem a dobrar."""

    def _correr(self, code, params=None):
        p = dict(params or {})
        p.setdefault('detailed', 'S')
        r = self.client.post('/api/pos/reports/run/', {'code': code, 'params': p}, format='json')
        self.assertEqual(r.status_code, 200, '%s: %s' % (code, r.content))
        return r.data

    def _reserva(self, dias=0, noites=1, estado='BOOKED', origem='DIRECT'):
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje + timedelta(days=dias)),
            'check_out': str(self.hoje + timedelta(days=dias + noites)),
            'status': estado, 'source': origem}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def test_lista_de_espera_nao_e_receita_nem_ocupacao(self):
        """A lista de espera é um pedido ALÉM da capacidade — está à espera de
        que alguém desista. A disponibilidade sempre a tratou assim, mas estes
        relatórios contavam-na como estadia: com 3 quartos e 2 pessoas em
        espera dava ocupação acima de 100% e receita de noites nunca vendidas."""
        self._reserva()
        self._reserva(estado='WAITLIST')
        self._reserva(estado='WAITLIST')
        d = self.client.get('/api/pms/reports/performance/',
                            {'date_from': str(self.hoje), 'date_to': str(self.hoje)}).data
        self.assertEqual(d['revenue'], 30000.0,
                         'só a reserva verdadeira é receita (%s)' % d['revenue'])
        self.assertEqual(d['occupancy_pct'], 33.3,
                         'ocupação com lista de espera a contar: %s%%' % d['occupancy_pct'])

    def test_canceladas_aparecem_na_lista_mas_nao_no_total_em_dinheiro(self):
        """Ver o que se perdeu é útil; somá-lo à receita não. O total deste
        relatório não batia com nenhum outro num mês com cancelamentos."""
        self._reserva()
        cancelada = self._reserva()
        self.client.post('/api/pms/reservations/%s/cancel/' % cancelada, {}, format='json')
        d = self._correr('pms_reservas', {'from': str(self.hoje), 'to': str(self.hoje)})
        self.assertEqual(len(d['rows']), 2, 'as duas aparecem na lista')
        self.assertEqual(d['totals']['total'], 30000.0,
                         'o total somou a reserva cancelada (%s)' % d['totals']['total'])
        self.assertEqual(d['totals']['nights'], 1)

    def test_estadia_entre_dois_meses_nao_conta_inteira_nos_dois(self):
        """O relatório "de onde vem o negócio" somava as noites TODAS da
        estadia em cada período que ela tocasse: uma estadia de 6 noites a
        cavalo de dois meses rendia 6 noites em Janeiro e outras 6 em
        Fevereiro. A mesma receita contada duas vezes — a soma dos meses nunca
        dava o ano."""
        self._reserva(dias=-2, noites=4, origem='ONLINE')     # 2 noites antes, 2 a partir de hoje
        anterior = self._correr('pms_origem', {'from': str(self.hoje - timedelta(days=2)),
                                               'to': str(self.hoje - timedelta(days=1))})
        atual = self._correr('pms_origem', {'from': str(self.hoje),
                                            'to': str(self.hoje + timedelta(days=1))})
        self.assertEqual(anterior['totals']['revenue'], 60000.0, anterior['rows'])
        self.assertEqual(atual['totals']['revenue'], 60000.0, atual['rows'])
        self.assertEqual(anterior['totals']['revenue'] + atual['totals']['revenue'],
                         120000.0, 'as duas metades têm de somar a estadia, não o dobro dela')

    def test_relatorios_de_um_hotel_vazio_respondem_a_zero(self):
        """O primeiro dia de um cliente novo: nenhum relatório pode rebentar
        nem mostrar "NaN" só porque ainda não há reservas."""
        for rota in ('performance', 'occupancy', 'revenue', 'payments', 'charges', 'housekeeping'):
            r = self.client.get('/api/pms/reports/%s/' % rota)
            self.assertEqual(r.status_code, 200, '%s rebentou sem dados' % rota)
        d = self.client.get('/api/pms/reports/performance/').data
        self.assertEqual((d['revenue'], d['adr'], d['revpar'], d['occupancy_pct']), (0, 0, 0, 0))

    def test_pagamentos_e_consumos_nao_contam_lancamentos_estornados(self):
        """Um estorno não é dinheiro recebido nem consumo feito: contar as duas
        linhas (original e estorno) inflava os dois relatórios."""
        res_id = self._reserva_em_checkin()
        folio = Folio.objects.get(reservation_id=res_id)
        enc = self.client.post('/api/pms/folios/%s/post_charge/' % folio.id,
                               {'amount': '5000', 'charge_type': 'MINIBAR',
                                'description': 'Minibar'}, format='json')
        self.client.post('/api/pms/folios/%s/settle/' % folio.id,
                         {'amount': '10000'}, format='json')
        self.client.post('/api/pms/folios/%s/reverse-charge/' % folio.id,
                         {'charge': enc.data['id'], 'reason': 'Engano'}, format='json')
        enc_rep = self.client.get('/api/pms/reports/charges/',
                                  {'date_from': str(self.hoje), 'date_to': str(self.hoje)}).data
        self.assertEqual(enc_rep['total'], 0.0,
                         'o consumo estornado continuou a contar: %s' % enc_rep['rows'])
        pag = self.client.get('/api/pms/reports/payments/',
                              {'date_from': str(self.hoje), 'date_to': str(self.hoje)}).data
        self.assertEqual(pag['total'], 10000.0)


class PmsSaftEntradasMalFormadasTests(PmsBase):
    """O SAF-T do alojamento é o ficheiro que se entrega à AGT. O que ele
    recusa tem de ser recusado com uma explicação, não com um erro interno."""

    def test_ano_ou_mes_impossiveis_explicam_se(self):
        for dados in ({'year': '2026a'}, {'year': self.hoje.year, 'month': 13},
                      {'year': self.hoje.year, 'month': 'Janeiro'}, {'year': 12}):
            r = self.client.post('/api/pms/saft/', dados, format='json')
            self.assertEqual(r.status_code, 400, 'pedido %s não foi explicado' % dados)
            self.assertIn('detail', r.data)

    def test_resumo_de_um_hotel_que_ainda_nao_facturou(self):
        r = self.client.get('/api/pms/saft/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['documents'], 0)
        self.assertIsNone(r.data['first'])


class PmsTodasAsRotasRespondemTests(PmsBase):
    """A REGRA DE OURO: nenhuma rota do PMS pode rebentar num hotel acabado de
    montar, sem uma única reserva. É o primeiro ecrã que um cliente novo vê, e
    um 500 aqui parece um sistema avariado."""

    LISTAS = [
        'room-types', 'rooms', 'room-attributes', 'rate-plans', 'rate-overrides', 'blocks',
        'reservations', 'folios', 'fixed-charges', 'meal-plan-entries', 'night-audit-runs',
        'lost-found-items', 'tasks', 'phone-directory', 'booking-settings', 'channels',
        'channel-sync-logs', 'channel-room-maps', 'booking-payments', 'chatbot-settings',
        'events',
    ]
    VISTAS = [
        'availability/', 'reports/performance/', 'reports/occupancy/', 'reports/revenue/',
        'reports/payments/', 'reports/charges/', 'reports/housekeeping/',
        'frontdesk/hotel-status/', 'events/forecast/', 'saft/', 'rooms/free/',
    ]

    def test_todas_as_listas_respondem_vazias(self):
        for rota in self.LISTAS:
            r = self.client.get('/api/pms/%s/' % rota)
            self.assertEqual(r.status_code, 200, '/api/pms/%s/ devolveu %s' % (rota, r.status_code))
            linhas = r.data if isinstance(r.data, list) else r.data.get('results', [])
            self.assertIsInstance(linhas, list, '/api/pms/%s/ não devolveu uma lista' % rota)

    def test_todas_as_vistas_de_leitura_respondem(self):
        for rota in self.VISTAS:
            r = self.client.get('/api/pms/%s' % rota)
            self.assertEqual(r.status_code, 200, '/api/pms/%s devolveu %s' % (rota, r.status_code))

    def test_os_filtros_das_listas_aceitam_lixo_sem_rebentar(self):
        """Um filtro guardado no ecrã (ou um link antigo) manda valores que já
        não existem — e isso não pode dar erro interno."""
        pedidos = [
            ('reservations', {'status': 'XPTO', 'room_type': '999', 'check_in_from': 'ontem'}),
            ('blocks', {'min_rooms': '2', 'room_type': '999'}),
            ('rooms', {'room_type': '999'}),
            ('tasks', {'status': 'XPTO', 'room': '999'}),
            ('lost-found-items', {'status': 'XPTO'}),
            ('booking-payments', {'status': 'XPTO', 'reservation': '999'}),
            ('channel-room-maps', {'channel': '999'}),
            ('meal-plan-entries', {'reservation': '999'}),
        ]
        for rota, params in pedidos:
            r = self.client.get('/api/pms/%s/' % rota, params)
            self.assertIn(r.status_code, (200, 400),
                          '/api/pms/%s/ com %s devolveu %s' % (rota, params, r.status_code))

    def test_pedir_uma_reserva_que_nao_existe_da_404_e_nao_500(self):
        for rota in ('reservations/99999/', 'folios/99999/', 'blocks/99999/',
                     'reservations/99999/documents/', 'reservations/99999/custom-fields/'):
            r = self.client.get('/api/pms/%s' % rota)
            self.assertEqual(r.status_code, 404, '/api/pms/%s devolveu %s' % (rota, r.status_code))

    def test_accoes_de_escrita_sem_dados_explicam_o_que_falta(self):
        """Carregar no botão sem escolher nada devolve uma explicação, não um
        erro interno — é o engano mais comum de todos."""
        pedidos = [
            ('reservations/quick-assign/', {}),
            ('reservations/change-room/', {}),
            ('meal-plan-entries/apply-range/', {}),
            ('rate-plans/bulk_update/', {}),
            ('channel-room-maps/auto-map/', {}),
            ('chatbot/simulate/', {}),
        ]
        for rota, dados in pedidos:
            r = self.client.post('/api/pms/%s' % rota, dados, format='json')
            self.assertIn(r.status_code, (400, 404),
                          '/api/pms/%s devolveu %s' % (rota, r.status_code))
            self.assertIn('detail', r.data, '/api/pms/%s não disse o que faltava' % rota)


class PmsFechoDaEstadiaTests(PmsBase):
    """O check-out — o momento em que o dinheiro tem de estar todo recebido e
    o quarto tem de voltar ao circuito. É a última porta antes de o hóspede
    desaparecer com uma conta em aberto."""

    def setUp(self):
        super().setUp()
        self.res_id = self._reserva_em_checkin()
        self.folio = Folio.objects.get(reservation_id=self.res_id)

    def _liquidar(self, folio):
        saldo = Folio.objects.get(pk=folio.id).balance
        if saldo > 0:
            self.client.post('/api/pms/folios/%s/settle/' % folio.id,
                             {'amount': str(saldo)}, format='json')

    def test_segunda_conta_em_aberto_trava_o_check_out(self):
        """A conta principal paga e a dos extras esquecida: o check-out tem de
        travar nas DUAS. Era assim que um hóspede saía sem pagar o minibar."""
        extras = self.client.post('/api/pms/folios/%s/split/' % self.folio.id,
                                  {'label': 'B · Extras'}, format='json')
        self.client.post('/api/pms/folios/%s/post_charge/' % extras.data['id'],
                         {'amount': '3000', 'charge_type': 'MINIBAR',
                          'description': 'Águas'}, format='json')
        self._liquidar(self.folio)
        r = self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        self.assertEqual(r.status_code, 409, 'saiu com a conta dos extras em aberto')
        self.assertIn('Extras', r.data['detail'])
        self._liquidar(Folio.objects.get(pk=extras.data['id']))
        r = self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Folio.objects.filter(reservation_id=self.res_id,
                                              status='OPEN').count(), 0,
                         'o check-out tem de fechar TODAS as contas')

    def test_conta_com_saldo_a_favor_do_hospede_tambem_trava(self):
        """Saldo negativo é dinheiro do hóspede que ficou na casa (pagou a
        mais, ou um depósito que não chegou a ser consumido). Deixá-lo sair
        assim é ficar com dinheiro dele sem ninguém decidir nada."""
        self._liquidar(self.folio)
        self.folio.refresh_from_db()
        FolioCharge = self.folio.charges.model
        FolioCharge.objects.create(folio=self.folio, charge_type='PAYMENT',
                                   description='Pagamento a mais', amount=Decimal('5000'))
        r = self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        self.assertEqual(r.status_code, 409, 'saldo a favor do hóspede não pode passar calado')

    def test_check_out_devolve_o_quarto_ao_circuito_por_limpar(self):
        """Depois da saída o quarto fica "Por limpar" — nunca "Limpo" (a
        receção vendia-o sujo) nem "Ocupado" (ficava preso para sempre)."""
        self._liquidar(self.folio)
        self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        self.assertEqual(Room.objects.get(pk=self.quartos[0]).status, 'VACANT_DIRTY')

    def test_check_out_duas_vezes_nao_passa(self):
        """Duplo-clique no botão de saída: a segunda vez explica-se em vez de
        voltar a mexer nas contas já fechadas."""
        self._liquidar(self.folio)
        self.assertEqual(self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id,
                                          {}, format='json').status_code, 200)
        r = self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_check_in_duas_vezes_nao_abre_uma_segunda_conta(self):
        """Repetir o check-in abria outro folio e lançava outra diária — a
        mesma noite cobrada duas vezes, em duas contas diferentes."""
        r = self.client.post('/api/pms/reservations/%s/check_in/' % self.res_id, {}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Folio.objects.filter(reservation_id=self.res_id).count(), 1)

    def test_recriar_conta_depois_de_facturar_nao_repete_o_deposito(self):
        """O depósito pago online entra na conta UMA vez. Abrir uma conta nova
        (porque a primeira foi facturada) não pode lançá-lo outra vez — era
        dinheiro inventado a favor do hóspede."""
        from .models import BookingPayment
        pag = BookingPayment.objects.create(
            reservation_id=self.res_id, amount=Decimal('10000'), status='PAID',
            method='TRANSFER', provider='SIMULATED')
        # Entra na conta ao confirmar (o hóspede já está dentro).
        r = self.client.post('/api/pms/booking-payments/%s/mark-paid/' % pag.id, {}, format='json')
        self.assertEqual(r.status_code, 409, 'já estava PAGO — não se confirma duas vezes')
        from .views import lancar_depositos_no_folio
        self.assertEqual(lancar_depositos_no_folio(
            Reservation.objects.get(pk=self.res_id), self.folio), 1)
        self.assertEqual(lancar_depositos_no_folio(
            Reservation.objects.get(pk=self.res_id), self.folio), 0,
            'o depósito foi lançado duas vezes na conta')
        self._liquidar(self.folio)
        self.client.post('/api/pms/reservations/%s/check_out/' % self.res_id, {}, format='json')
        nova = self.client.post('/api/pms/reservations/%s/recreate-folio/' % self.res_id, {},
                                format='json')
        self.assertEqual(nova.status_code, 201, nova.content)
        self.assertEqual(nova.data['deposits_posted'], 0,
                         'a conta nova lançou outra vez um depósito já lançado')

    def test_conta_sem_consumos_nao_gera_factura(self):
        """Uma factura de 0,00 assinada e comunicada à AGT é um documento que
        não se pode anular sem nota de crédito."""
        vazia = self.client.post('/api/pms/folios/%s/split/' % self.folio.id,
                                 {'label': 'C · Vazia'}, format='json')
        r = self.client.post('/api/pms/folios/%s/generate-invoice/' % vazia.data['id'], {},
                             format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('detail', r.data)


# ==========================================================================
# GRUPOS HOTELEIROS — os relatórios de uma unidade só contam essa unidade
# ==========================================================================
from datetime import datetime                                   # noqa: E402
from django.utils import timezone as _tz                         # noqa: E402

from identity.models import UserHotelAccess                      # noqa: E402
from .models import RoomType, FolioCharge, BookingPayment         # noqa: E402


class RelatoriosDeUmGrupoHoteleiroTests(PmsBase):
    """O relatório do Hotel A não pode trazer uma única noite do Hotel B.

    Este sistema vende-se a GRUPOS com várias propriedades, e as funções de
    relatório do alojamento recebiam só `params` — sem hotel — e consultavam
    `Reservation.objects` / `Folio.objects` / `FolioCharge.objects` sem filtro
    de propriedade. Com dois hotéis na mesma instalação, o director do Hotel A
    abria "Ocupação por dia" e via as noites do Hotel B; a ocupação dividia as
    noites das duas casas pelos quartos de uma (e passava dos 100%); e quando a
    sede somava as unidades para ter o grupo, contava tudo duas vezes.

    O cenário abaixo é propositadamente assimétrico (3 quartos a 30.000 contra
    2 quartos a 50.000) para que NENHUM total do Hotel A seja igual ao do Hotel
    B nem a metade do consolidado: se o filtro falhar, falha com um número
    visivelmente errado e não por coincidência aritmética.

        Hotel A "Hotel Teste"  3 quartos · 30.000/noite
            A1  quarto 101  hoje -> hoje+2   2 noites   60.000
            A2  quarto 102  hoje -> hoje+2   2 noites   60.000
            conta FA-001 (A1): Alojamento 30.000 + F&B 5.000 = 35.000
            depósito online: 10.000 pendente
        Hotel B "Hotel Praia"  2 quartos · 50.000/noite
            B1  quarto 201  hoje -> hoje+2   2 noites  100.000
            conta FB-001 (B1): Alojamento 50.000 + Minibar 2.000 = 52.000
            depósito online: 20.000 pendente

    Período de todos os relatórios: [hoje, hoje+1] — 2 dias.
    """

    def setUp(self):
        super().setUp()                       # Hotel A: 3 quartos, STD 30.000

        # SEGUNDA PROPRIEDADE DO MESMO GRUPO (mesma empresa, mesma instalação).
        # Cria-se pelo ORM e não pela API de propósito: ao criar um quarto, o
        # `HotelScopedMixin` força o hotel com `default_hotel_id`, que sem
        # cabeçalho X-Hotel-Id devolve o PRIMEIRO hotel do sistema — os quartos
        # do Hotel B nasceriam no Hotel A e o cenário do teste era falso.
        self.hotel_b = Hotel.objects.create(company=self.hotel.company, name='Hotel Praia')
        self.rt_b = RoomType.objects.create(
            hotel=self.hotel_b, code='SUP', name='Superior',
            base_rate=Decimal('50000'), capacity_adults=2)
        self.quartos_b = [Room.objects.create(
            hotel=self.hotel_b, room_type=self.rt_b, number=n, status='VACANT_CLEAN')
            for n in ('201', '202')]

        self.rt_a = RoomType.objects.get(pk=self.rt)
        self.a1 = self._reserva(self.hotel, self.rt_a, self.quartos[0], 'GRP-A1', '30000')
        self.a2 = self._reserva(self.hotel, self.rt_a, self.quartos[1], 'GRP-A2', '30000')
        self.b1 = self._reserva(self.hotel_b, self.rt_b, self.quartos_b[0].id, 'GRP-B1', '50000')

        self.fa = self._conta(self.a1, 'FA-001', [('ROOM', 'Diaria', '30000'),
                                                  ('FNB', 'Jantar', '5000')])
        self.fb = self._conta(self.b1, 'FB-001', [('ROOM', 'Diaria', '50000'),
                                                  ('MINIBAR', 'Agua', '2000')])
        BookingPayment.objects.create(reservation=self.a1, amount=Decimal('10000'))
        BookingPayment.objects.create(reservation=self.b1, amount=Decimal('20000'))

        self.p = {'from': str(self.hoje), 'to': str(self.hoje + timedelta(days=1))}

    # ------------------------------------------------------------ utilitários
    def _reserva(self, hotel, room_type, quarto_id, confirmacao, tarifa,
                 dias=0, noites=2, estado='BOOKED'):
        return Reservation.objects.create(
            hotel=hotel, confirmation=confirmacao, guest=self.guest,
            room_type=room_type, room_id=quarto_id,
            check_in=self.hoje + timedelta(days=dias),
            check_out=self.hoje + timedelta(days=dias + noites),
            adults=2, rate=Decimal(tarifa), status=estado)

    def _conta(self, reserva, numero, lancamentos):
        folio = Folio.objects.create(reservation=reserva, number=numero)
        for tipo, descricao, valor in lancamentos:
            FolioCharge.objects.create(folio=folio, charge_type=tipo,
                                       description=descricao, amount=Decimal(valor))
        return folio

    def _correr(self, code, unidade='OMITIR', **extra):
        """Corre um relatório do catálogo partilhado, como o ecrã o corre.

        `unidade` omitida = o formulário não escolheu nenhuma (consolidado);
        um id = o relatório daquela casa; None explícito = 'all' (consolidado
        pedido de propósito, mesmo havendo hotel activo no ecrã).
        """
        p = dict(self.p, detailed='S')
        if unidade != 'OMITIR':
            p['hotel'] = 'all' if unidade is None else unidade
        r = self.client.post('/api/pos/reports/run/',
                             {'code': code, 'params': p}, format='json', **extra)
        self.assertEqual(r.status_code, 200, '%s: %s' % (code, r.content))
        return r.data

    # ------------------------------------------------------------------ provas
    def test_as_reservas_do_hotel_a_nao_incluem_nenhuma_reserva_do_hotel_b(self):
        a = self._correr('pms_reservas', self.hotel.id)
        b = self._correr('pms_reservas', self.hotel_b.id)

        self.assertEqual(sorted(l['confirmation'] for l in a['rows']), ['GRP-A1', 'GRP-A2'],
                         'o relatório do Hotel A trouxe reservas que não são dele: %s'
                         % [l['confirmation'] for l in a['rows']])
        self.assertEqual([l['confirmation'] for l in b['rows']], ['GRP-B1'],
                         'o relatório do Hotel B trouxe reservas que não são dele: %s'
                         % [l['confirmation'] for l in b['rows']])
        # 2 reservas x 2 noites x 30.000 = 120.000 (e NÃO 220.000, que é o grupo).
        self.assertEqual(a['totals']['total'], 120000.0,
                         'receita do Hotel A: esperado 120.000 (2x2 noites x30.000), '
                         'veio %s — 220.000 significa que somou as 2 noites a 50.000 do Hotel B'
                         % a['totals']['total'])
        self.assertEqual(a['totals']['nights'], 4,
                         'noites do Hotel A: esperado 4 (2 reservas x 2 noites), veio %s — '
                         '6 significa que contou também as 2 noites do Hotel B'
                         % a['totals']['nights'])
        self.assertEqual(b['totals']['total'], 100000.0,
                         'receita do Hotel B: esperado 100.000 (2 noites x 50.000), veio %s'
                         % b['totals']['total'])
        self.assertEqual(b['totals']['nights'], 2,
                         'noites do Hotel B: esperado 2, veio %s' % b['totals']['nights'])

    def test_a_ocupacao_do_hotel_b_usa_os_dois_quartos_do_hotel_b_e_nao_passa_dos_100(self):
        """6 noites vendidas no grupo em 2 quartos do Hotel B dariam 150%.

        É o sintoma mais visível do defeito: a ocupação contava as noites das
        duas casas e dividia-as pelos quartos de uma só. Uma ocupação acima dos
        100% não é um arredondamento — é o relatório a dizer que se venderam
        mais quartos do que o hotel tem.
        """
        b = self._correr('pms_ocupacao', self.hotel_b.id)
        for linha in b['rows']:
            self.assertEqual(linha['rooms'], 2,
                             'o dia %s do Hotel B diz %s quartos; o Hotel B tem 2 (o grupo '
                             'tem 5)' % (linha['day'], linha['rooms']))
            self.assertEqual(linha['occupied'], 1,
                             'o dia %s do Hotel B diz %s quartos ocupados; só a reserva B1 '
                             'lá está — 3 é o grupo inteiro' % (linha['day'], linha['occupied']))
            self.assertEqual(linha['occupancy'], 50.0,
                             'ocupação do Hotel B em %s: esperado 50,0%% (1 de 2 quartos), '
                             'veio %s%% — 150%% é o grupo (3 noites) sobre 2 quartos'
                             % (linha['day'], linha['occupancy']))
            self.assertLessEqual(linha['occupancy'], 100.0,
                                 'ocupação de %s%% no Hotel B: vendeu-se mais quartos do que '
                                 'o hotel tem' % linha['occupancy'])

        a = self._correr('pms_ocupacao', self.hotel.id)
        for linha in a['rows']:
            self.assertEqual(linha['rooms'], 3,
                             'o dia %s do Hotel A diz %s quartos; o Hotel A tem 3'
                             % (linha['day'], linha['rooms']))
            self.assertEqual(linha['occupancy'], 66.7,
                             'ocupação do Hotel A em %s: esperado 66,7%% (2 de 3 quartos), '
                             'veio %s%% — 60,0%% é o grupo (3 de 5)'
                             % (linha['day'], linha['occupancy']))

    def test_o_adr_e_o_revpar_de_cada_unidade_sao_os_dessa_unidade(self):
        """ADR e RevPAR são as duas medidas por que um hotel se julga.

        Hotel A: 120.000 em 4 noites vendidas = ADR 30.000; em 6 noites-quarto
        disponíveis (3 quartos x 2 dias) = RevPAR 20.000.
        Hotel B: 100.000 em 2 noites = ADR 50.000; em 4 disponíveis = RevPAR
        25.000. Misturados, dariam ADR 36.666,67 e RevPAR 22.000 — que não é o
        ADR de nenhuma das duas casas e por isso não serve para decidir nada
        em nenhuma delas.
        """
        a = self._correr('pms_ocupacao', self.hotel.id)['totals']
        b = self._correr('pms_ocupacao', self.hotel_b.id)['totals']

        self.assertEqual(a['adr'], 30000.0,
                         'ADR do Hotel A: esperado 30.000 (120.000 / 4 noites), veio %s — '
                         '36.666,67 é o ADR do grupo' % a['adr'])
        self.assertEqual(a['revpar'], 20000.0,
                         'RevPAR do Hotel A: esperado 20.000 (120.000 / 3 quartos x 2 dias), '
                         'veio %s — 22.000 é o do grupo' % a['revpar'])
        self.assertEqual(b['adr'], 50000.0,
                         'ADR do Hotel B: esperado 50.000 (100.000 / 2 noites), veio %s'
                         % b['adr'])
        self.assertEqual(b['revpar'], 25000.0,
                         'RevPAR do Hotel B: esperado 25.000 (100.000 / 2 quartos x 2 dias), '
                         'veio %s' % b['revpar'])
        self.assertNotEqual(a['adr'], b['adr'],
                            'as duas casas vendem a preços diferentes; se o ADR é igual, '
                            'os dois relatórios estão a ler os mesmos dados')

    def test_o_consolidado_do_grupo_e_exactamente_a_soma_das_duas_unidades(self):
        """O filtro não pode esconder nada: A + B tem de dar o grupo.

        Um filtro mal feito resolve-se a si mesmo deixando linhas de fora —
        e aí o dono do grupo deixa de ver receita que existe. Esta é a metade
        que falta à prova do isolamento.
        """
        a = self._correr('pms_reservas', self.hotel.id)['totals']
        b = self._correr('pms_reservas', self.hotel_b.id)['totals']
        grupo = self._correr('pms_reservas', None)

        self.assertEqual(grupo['totals']['total'], a['total'] + b['total'],
                         'consolidado %s != Hotel A %s + Hotel B %s — o filtro por '
                         'propriedade perdeu receita pelo caminho'
                         % (grupo['totals']['total'], a['total'], b['total']))
        self.assertEqual(grupo['totals']['total'], 220000.0,
                         'consolidado do grupo: esperado 220.000 (120.000 + 100.000), veio %s'
                         % grupo['totals']['total'])
        self.assertEqual(grupo['totals']['nights'], 6,
                         'noites do grupo: esperado 6 (4 do Hotel A + 2 do Hotel B), veio %s'
                         % grupo['totals']['nights'])
        self.assertEqual(len(grupo['rows']), 3,
                         'o grupo tem 3 reservas (2+1) e o relatório trouxe %s'
                         % len(grupo['rows']))

        oa = self._correr('pms_ocupacao', self.hotel.id)['totals']
        ob = self._correr('pms_ocupacao', self.hotel_b.id)['totals']
        og = self._correr('pms_ocupacao', None)['totals']
        self.assertEqual(og['occupied'], oa['occupied'] + ob['occupied'],
                         'noites ocupadas do grupo %s != %s + %s'
                         % (og['occupied'], oa['occupied'], ob['occupied']))
        self.assertEqual(og['revenue'], oa['revenue'] + ob['revenue'],
                         'receita do grupo %s != %s + %s'
                         % (og['revenue'], oa['revenue'], ob['revenue']))
        self.assertEqual(og['revenue'], 220000.0, 'receita do grupo: veio %s' % og['revenue'])

        ca = self._correr('pms_consumos', self.hotel.id)['totals']
        cb = self._correr('pms_consumos', self.hotel_b.id)['totals']
        cg = self._correr('pms_consumos', None)['totals']
        self.assertEqual(cg['amount'], ca['amount'] + cb['amount'],
                         'consumos do grupo %s != %s + %s'
                         % (cg['amount'], ca['amount'], cb['amount']))
        self.assertEqual(cg['amount'], 87000.0,
                         'consumos do grupo: esperado 87.000 (35.000 + 52.000), veio %s'
                         % cg['amount'])

    def test_as_contas_e_os_consumos_de_uma_unidade_sao_so_dessa_unidade(self):
        """A conta do hóspede não tem hotel — tem-no a reserva dela.

        É o sítio onde o filtro é mais fácil de esquecer: `Folio.objects` e
        `FolioCharge.objects` não têm campo `hotel` nenhum, e por isso ficaram
        sem filtro mais tempo do que as reservas. O chefe de recepção do Hotel
        A levava para o turno da noite uma lista com as dívidas do Hotel B.
        """
        a = self._correr('pms_contas_abertas', self.hotel.id)
        b = self._correr('pms_contas_abertas', self.hotel_b.id)

        self.assertEqual([l['folio'] for l in a['rows']], ['FA-001'],
                         'contas em aberto do Hotel A: esperado só FA-001, veio %s'
                         % [l['folio'] for l in a['rows']])
        self.assertEqual(a['totals']['balance'], 35000.0,
                         'saldo em aberto do Hotel A: esperado 35.000 (30.000 + 5.000), '
                         'veio %s — 87.000 é o grupo' % a['totals']['balance'])
        self.assertEqual([l['folio'] for l in b['rows']], ['FB-001'],
                         'contas em aberto do Hotel B: esperado só FB-001, veio %s'
                         % [l['folio'] for l in b['rows']])
        self.assertEqual(b['totals']['balance'], 52000.0,
                         'saldo em aberto do Hotel B: esperado 52.000 (50.000 + 2.000), veio %s'
                         % b['totals']['balance'])

        ca = self._correr('pms_consumos', self.hotel.id)
        self.assertEqual(ca['totals']['amount'], 35000.0,
                         'consumos do Hotel A: esperado 35.000, veio %s' % ca['totals']['amount'])
        self.assertEqual(ca['totals']['count'], 2,
                         'o Hotel A tem 2 lançamentos; vieram %s (4 é o grupo)'
                         % ca['totals']['count'])
        self.assertNotIn('Minibar', [l['kind'] for l in ca['rows']],
                         'a água do minibar foi lançada na conta de um hóspede do Hotel B '
                         'e apareceu nos consumos do Hotel A')

    def test_a_lista_da_recepcao_a_governanta_a_previsao_e_os_depositos_sao_por_unidade(self):
        """Os restantes relatórios da pasta, pela mesma régua.

        Não é zelo a mais: cada um destes consultava um modelo diferente
        (`Reservation`, `Room`, `BookingPayment`) e bastava um ficar de fora
        para o ecrã de Relatórios continuar a misturar as casas num sítio.
        """
        hoje = self.hoje.strftime('%d/%m/%Y')

        ea = self._correr('pms_entradas_saidas', self.hotel.id)['rows']
        eb = self._correr('pms_entradas_saidas', self.hotel_b.id)['rows']
        self.assertEqual([l['arrivals'] for l in ea if l['day'] == hoje], [2],
                         'entradas de hoje no Hotel A: esperado 2 (A1 e A2), veio %s'
                         % [l['arrivals'] for l in ea if l['day'] == hoje])
        self.assertEqual([l['arrivals'] for l in eb if l['day'] == hoje], [1],
                         'entradas de hoje no Hotel B: esperado 1 (B1), veio %s — 3 é o grupo'
                         % [l['arrivals'] for l in eb if l['day'] == hoje])

        ga = self._correr('pms_governanta', self.hotel.id)['rows']
        gb = self._correr('pms_governanta', self.hotel_b.id)['rows']
        self.assertEqual([l['room'] for l in ga], ['101', '102', '103'],
                         'a governanta do Hotel A recebeu os quartos %s — 201/202 são do '
                         'Hotel B, noutra cidade' % [l['room'] for l in ga])
        self.assertEqual([l['room'] for l in gb], ['201', '202'],
                         'a governanta do Hotel B recebeu os quartos %s'
                         % [l['room'] for l in gb])

        pa = self._correr('pms_previsao', self.hotel.id)['rows'][0]
        pb = self._correr('pms_previsao', self.hotel_b.id)['rows'][0]
        self.assertEqual((pa['sold'], pa['free']), (2, 1),
                         'previsão de hoje no Hotel A: esperado 2 vendidos e 1 por vender '
                         '(3 quartos), veio %s vendidos e %s por vender'
                         % (pa['sold'], pa['free']))
        self.assertEqual((pb['sold'], pb['free']), (1, 1),
                         'previsão de hoje no Hotel B: esperado 1 vendido e 1 por vender '
                         '(2 quartos), veio %s e %s' % (pb['sold'], pb['free']))

        da = self._correr('pms_depositos', self.hotel.id)['totals']
        db = self._correr('pms_depositos', self.hotel_b.id)['totals']
        self.assertEqual(da['amount'], 10000.0,
                         'depósitos do Hotel A: esperado 10.000, veio %s (30.000 é o grupo)'
                         % da['amount'])
        self.assertEqual(db['amount'], 20000.0,
                         'depósitos do Hotel B: esperado 20.000, veio %s' % db['amount'])

    def test_o_relatorio_diz_de_que_casa_sao_os_numeros(self):
        """Um relatório de grupo e um relatório de uma casa saíam da impressora
        iguais: quem o lesse três meses depois não tinha como saber qual era
        qual — e um total de grupo lido como total de uma unidade é uma decisão
        tomada com o dobro da receita."""
        a = self._correr('pms_reservas', self.hotel.id)
        self.assertEqual(a['hotel'], self.hotel.id)
        self.assertEqual(a['hotel_scope'], 'Hotel Teste',
                         'o relatório de uma unidade tem de a identificar; veio "%s"'
                         % a['hotel_scope'])

        grupo = self._correr('pms_reservas', None)
        self.assertIsNone(grupo['hotel'])
        self.assertIn('Consolidado', grupo['hotel_scope'],
                      'o consolidado do grupo tem de se anunciar como tal; veio "%s"'
                      % grupo['hotel_scope'])
        self.assertIn('2 unidades', grupo['hotel_scope'],
                      'o consolidado devia dizer quantas casas somou; veio "%s"'
                      % grupo['hotel_scope'])

    def test_sem_unidade_no_formulario_vale_o_hotel_aberto_no_ecra(self):
        """A rede de segurança: o ecrã do Hotel B nunca mostra o Hotel A.

        O formulário de um relatório pode não repetir a unidade (há relatórios
        sem parâmetros nenhuns), e nesse caso a escolha certa não é "o grupo
        todo" — é a casa onde o utilizador está. É o mesmo X-Hotel-Id que o
        `core.tenancy` usa em todos os outros ecrãs.
        """
        d = self._correr('pms_reservas', HTTP_X_HOTEL_ID=str(self.hotel_b.id))
        self.assertEqual([l['confirmation'] for l in d['rows']], ['GRP-B1'],
                         'com o Hotel B aberto no ecrã, o relatório trouxe %s'
                         % [l['confirmation'] for l in d['rows']])
        self.assertEqual(d['hotel'], self.hotel_b.id)

        # E o consolidado continua a ser pedível de propósito, mesmo lá dentro.
        g = self._correr('pms_reservas', None, HTTP_X_HOTEL_ID=str(self.hotel_b.id))
        self.assertEqual(len(g['rows']), 3,
                         'pedir "todas as unidades" com o Hotel B aberto devia dar as 3 '
                         'reservas do grupo; deu %s' % len(g['rows']))

    def test_quem_so_tem_acesso_a_uma_unidade_nao_consolida_o_grupo_inteiro(self):
        """Um director de unidade não tem o grupo para consolidar.

        Sem isto, bastava não escolher unidade nenhuma para o relatório passar
        a mostrar as casas que essa pessoa não pode ver — a mesma fuga que o
        `core.tenancy` já fechara nos viewsets, aberta outra vez pelo caminho
        dos relatórios.
        """
        from rest_framework_simplejwt.tokens import RefreshToken
        director = User.objects.create_user('dir_hotel_a', 'dir@teste.ao', 'x')
        UserHotelAccess.objects.create(user=director, hotel=self.hotel, is_default=True)

        # Token verdadeiro: é a autenticação que o middleware resolve, e sem ela
        # o pedido não tem autor nenhum a quem aplicar os acessos.
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer %s' % (
            RefreshToken.for_user(director).access_token,))

        d = self._correr('pms_reservas')
        self.assertEqual(sorted(l['confirmation'] for l in d['rows']), ['GRP-A1', 'GRP-A2'],
                         'o director do Hotel A consolidou e viu %s — GRP-B1 é de uma casa '
                         'a que ele não tem acesso' % [l['confirmation'] for l in d['rows']])
        self.assertEqual(d['totals']['total'], 120000.0,
                         'consolidado de quem só tem o Hotel A: esperado 120.000, veio %s'
                         % d['totals']['total'])

        negado = self.client.post('/api/pos/reports/run/', {
            'code': 'pms_reservas',
            'params': dict(self.p, detailed='S', hotel=self.hotel_b.id)}, format='json')
        self.assertEqual(negado.status_code, 403,
                         'pedir o relatório de um hotel sem acesso devia dar 403 e deu %s'
                         % negado.status_code)


class RevenueRecortadoAoPeriodoTests(PmsBase):
    """A coluna "Consumos" do relatório de receita só conta o período pedido.

    `reports/revenue/` somava, na linha de cada reserva, os lançamentos TODOS
    da conta — a conta inteira da estadia. Numa estadia que atravessa o mês
    (28/01 a 03/02, que é o caso normal de quem passa o Ano Novo no hotel), o
    relatório de Janeiro trazia na coluna "Consumos" as diárias e os extras de
    Fevereiro: dinheiro que em Janeiro ainda não tinha sido lançado. Janeiro
    mais Fevereiro davam mais do que o ano, e a coluna nunca batia com o
    relatório de Encargos do mesmo período, que sempre recortou pela data do
    lançamento.

    Usam-se datas de 2020 de propósito: ficam longe de `hoje` e por isso o
    teste dá o mesmo resultado em qualquer dia do ano em que corra.
    """

    JAN = {'date_from': '2020-01-01', 'date_to': '2020-01-31'}
    FEV = {'date_from': '2020-02-01', 'date_to': '2020-02-29'}

    def setUp(self):
        super().setUp()
        self.hotel_b = Hotel.objects.create(company=self.hotel.company, name='Hotel Praia')
        rt_b = RoomType.objects.create(hotel=self.hotel_b, code='SUP', name='Superior',
                                       base_rate=Decimal('50000'), capacity_adults=2)

        # A estadia que atravessa o mês, no Hotel A: 6 noites a 40.000.
        self.estadia = Reservation.objects.create(
            hotel=self.hotel, confirmation='ANO-NOVO', guest=self.guest,
            room_type=RoomType.objects.get(pk=self.rt), room_id=self.quartos[2],
            check_in=date(2020, 1, 28), check_out=date(2020, 2, 3),
            adults=2, rate=Decimal('40000'), status='CHECKED_OUT')
        folio = Folio.objects.create(reservation=self.estadia, number='ANO-NOVO-A')
        self._lancar(folio, 'ROOM', 'Diarias de Janeiro', '100000', date(2020, 1, 30))
        self._lancar(folio, 'ROOM', 'Diarias de Fevereiro', '70000', date(2020, 2, 2))

        # E uma estadia do Hotel B no mesmo Janeiro, com um valor impossível de
        # confundir: se aparecer no relatório do Hotel A, vê-se logo.
        outra = Reservation.objects.create(
            hotel=self.hotel_b, confirmation='PRAIA-JAN', guest=self.guest,
            room_type=rt_b, check_in=date(2020, 1, 29), check_out=date(2020, 1, 31),
            adults=2, rate=Decimal('50000'), status='CHECKED_OUT')
        self._lancar(Folio.objects.create(reservation=outra, number='PRAIA-JAN-A'),
                     'ROOM', 'Diarias', '999999', date(2020, 1, 30))

    @staticmethod
    def _lancar(folio, tipo, descricao, valor, dia):
        """`created_at` é auto_now_add: a data do lançamento só se acerta depois,
        pelo queryset (o `save()` voltaria a pôr a de hoje)."""
        c = FolioCharge.objects.create(folio=folio, charge_type=tipo,
                                       description=descricao, amount=Decimal(valor))
        FolioCharge.objects.filter(pk=c.pk).update(
            created_at=_tz.make_aware(datetime(dia.year, dia.month, dia.day, 12, 0)))
        return c

    def _revenue(self, periodo):
        r = self.client.get('/api/pms/reports/revenue/',
                            dict(periodo, hotel=self.hotel.id))
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def test_a_coluna_consumos_de_janeiro_nao_traz_lancamentos_de_fevereiro(self):
        d = self._revenue(self.JAN)
        linha = next(l for l in d['rows'] if l['reservation'] == 'ANO-NOVO')
        self.assertEqual(linha['room_charges'], 100000.0,
                         'Consumos de Janeiro da estadia ANO-NOVO: esperado 100.000 (o que '
                         'foi lançado em 30/01), veio %s — 170.000 significa que trouxe '
                         'também os 70.000 lançados em 02/02' % linha['room_charges'])
        self.assertEqual(d['grand_total']['room_charges'], 100000.0,
                         'total de Consumos de Janeiro no Hotel A: esperado 100.000, veio %s '
                         '(170.000 = Fevereiro a entrar; 1.099.999 = o Hotel B a entrar)'
                         % d['grand_total']['room_charges'])

    def test_a_coluna_consumos_de_fevereiro_nao_traz_lancamentos_de_janeiro(self):
        d = self._revenue(self.FEV)
        linha = next(l for l in d['rows'] if l['reservation'] == 'ANO-NOVO')
        self.assertEqual(linha['room_charges'], 70000.0,
                         'Consumos de Fevereiro da estadia ANO-NOVO: esperado 70.000 (o '
                         'lançamento de 02/02), veio %s' % linha['room_charges'])

    def test_janeiro_mais_fevereiro_dao_a_conta_inteira_e_nao_mais(self):
        """O recorte não pode perder lançamentos: a soma dos dois meses tem de
        dar os 170.000 que estão na conta, uma vez cada."""
        jan = self._revenue(self.JAN)['grand_total']['room_charges']
        fev = self._revenue(self.FEV)['grand_total']['room_charges']
        self.assertEqual(jan + fev, 170000.0,
                         'Janeiro (%s) + Fevereiro (%s) = %s; a conta da estadia tem '
                         '170.000 — a mais é duplicação, a menos é um lançamento perdido'
                         % (jan, fev, jan + fev))

    def test_a_receita_de_janeiro_do_hotel_a_nao_tem_nada_do_hotel_b(self):
        d = self._revenue(self.JAN)
        self.assertEqual([l['reservation'] for l in d['rows']], ['ANO-NOVO'],
                         'a receita de Janeiro do Hotel A trouxe %s'
                         % [l['reservation'] for l in d['rows']])
        # 4 noites de Janeiro (28, 29, 30, 31) x 40.000 — e não as 6 da estadia.
        self.assertEqual(d['grand_total']['revenue'], 160000.0,
                         'receita de alojamento de Janeiro: esperado 160.000 (4 noites x '
                         '40.000), veio %s' % d['grand_total']['revenue'])
