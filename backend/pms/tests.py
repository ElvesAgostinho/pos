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
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje),
            'check_out': str(self.hoje + timedelta(days=2)), 'adults': 2}, format='json')
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

        amanha = self.hoje + timedelta(days=1)
        aud = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(amanha)}, format='json')
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
        amanha = self.hoje + timedelta(days=1)
        aud = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(amanha)}, format='json')
        self.assertEqual(aud.data['extras_charged'], 0)
        folio.refresh_from_db()
        self.assertEqual(folio.charges_total, Decimal('65000'))

    def test_auditoria_repetida_nao_duplica_o_encargo_fixo(self):
        res_id = self._reserva_simples()
        self.client.post('/api/pms/fixed-charges/', {
            'reservation': res_id, 'description': 'Cama extra',
            'amount': '3000', 'per_night': True}, format='json')
        self.client.post(f'/api/pms/reservations/{res_id}/check_in/', {}, format='json')
        amanha = self.hoje + timedelta(days=1)
        self.client.post('/api/pms/night-audit/run/', {'audit_date': str(amanha)}, format='json')
        folio = Reservation.objects.get(id=res_id).folio
        folio.refresh_from_db()
        antes = folio.charges_total
        # A trava da auditoria (uma data, uma corrida) protege também os extras.
        repetida = self.client.post('/api/pms/night-audit/run/', {'audit_date': str(amanha)}, format='json')
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
