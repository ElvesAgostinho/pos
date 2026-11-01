# -*- coding: utf-8 -*-
"""A AUDITORIA DA NOITE FECHA O DIA — e fechar inclui o que correu mal.

A auditoria já lançava as diárias e os encargos fixos. O que não fazia era
arrumar o que o dia deixou por resolver, e isso custa dinheiro todos os dias:

 · uma reserva de ontem que nunca chegou a check-in ficava "Reservada" para
   sempre — aparecia nas chegadas de hoje, de amanhã e do mês seguinte, contava
   na ocupação, e o quarto ficava preso a alguém que não veio;

 · se essa reserva era GARANTIDA, ninguém a cobrava. Foi esse o acordo: o
   hóspede deu garantia para o quarto ficar à espera dele e o hotel deixou de o
   vender. Não cobrar é oferecer a noite a quem não apareceu;

 · um hóspede com saída marcada para ontem e ainda em check-in ou ficou mais
   uma noite (falta a diária) ou saiu sem check-out (o quarto está por vender).
   Nos dois casos há dinheiro ou um quarto parado, e ninguém o via.

O que a auditoria NÃO faz, e é deliberado: não decide qual dos dois casos é a
saída em atraso. Só a recepção sabe. A auditoria põe-nos à frente de alguém em
vez de os deixar a envelhecer no mapa de quartos.
"""
from datetime import timedelta
from decimal import Decimal

from pms.models import FolioCharge, NightAuditRun, Reservation
from pms.tests import PmsBase


class AAuditoriaApuraOQueODiaDeixou(PmsBase):

    def _reserva(self, status, dias_atras, garantida=False, com_conta=True):
        r = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'check_in': str(self.hoje - timedelta(days=dias_atras)),
            'check_out': str(self.hoje + timedelta(days=1)),
            'adults': 1, 'rate': '30000', 'is_guaranteed': garantida}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content)
        res = Reservation.objects.get(pk=r.data['id'])
        if res.status != status:
            res.status = status
            res.save(update_fields=['status'])
        if not com_conta:
            res.folios.all().delete()
        return res

    def _correr(self, dias_atras=0):
        return self.client.post('/api/pms/night-audit/run/',
                                {'audit_date': str(self.hoje - timedelta(days=dias_atras))},
                                format='json')

    # ------------------------------------------------------------------
    def test_uma_reserva_que_nunca_chegou_fica_no_show(self):
        res = self._reserva('BOOKED', dias_atras=1)

        r = self._correr()
        self.assertEqual(r.status_code, 201, r.content)

        res.refresh_from_db()
        self.assertEqual(res.status, 'NO_SHOW',
                         'a reserva continuaria a aparecer nas chegadas de todos os dias')
        self.assertEqual(len(r.data['no_shows']), 1)
        self.assertEqual(r.data['no_shows'][0]['confirmation'], res.confirmation)

    def test_um_no_show_garantido_e_cobrado(self):
        """Foi esse o acordo: o quarto ficou à espera e não se vendeu."""
        res = self._reserva('BOOKED', dias_atras=1, garantida=True)

        r = self._correr()

        cobranca = FolioCharge.objects.filter(source_reference=f'NOSHOW-{res.id}')
        self.assertEqual(cobranca.count(), 1, 'o no-show garantido não foi cobrado')
        self.assertEqual(cobranca.first().amount, Decimal('30000'))
        self.assertEqual(r.data['no_shows'][0]['charged'], '30000.00')

    def test_um_no_show_nao_garantido_nao_se_cobra(self):
        """Sem garantia não houve compromisso — cobrar seria inventar uma dívida."""
        res = self._reserva('BOOKED', dias_atras=1, garantida=False)

        self._correr()

        self.assertFalse(FolioCharge.objects.filter(source_reference=f'NOSHOW-{res.id}').exists())

    def test_um_garantido_abre_conta_para_poder_ser_cobrado(self):
        """O folio nasce no check-in, e um no-show nunca entrou.

        Sem abrir conta, um no-show garantido nunca poderia ser cobrado — e a
        garantia não valeria nada. É a única vez em que a auditoria abre uma.
        """
        res = self._reserva('BOOKED', dias_atras=1, garantida=True, com_conta=False)
        self.assertEqual(res.folios.count(), 0)

        r = self._correr()

        res.refresh_from_db()
        self.assertEqual(res.folios.count(), 1, 'não abriu conta para cobrar o no-show')
        self.assertEqual(r.data['no_shows'][0]['charged'], '30000.00')

    def test_um_garantido_sem_tarifa_e_denunciado_com_o_motivo_certo(self):
        """Dizer o motivo errado manda quem lê procurar no sítio errado — e a
        noite continua por cobrar enquanto ele procura."""
        res = self._reserva('BOOKED', dias_atras=1, garantida=True)
        res.rate = 0
        res.rate_plan = None
        res.save(update_fields=['rate', 'rate_plan'])
        res.room_type.base_rate = 0
        res.room_type.save(update_fields=['base_rate'])

        r = self._correr()

        linha = r.data['no_shows'][0]
        self.assertIsNone(linha['charged'])
        self.assertIn('sem tarifa', linha['reason'])
        self.assertIn('GARANTIDO', r.data['detail'])

    def test_uma_saida_que_nao_aconteceu_e_posta_a_frente_de_alguem(self):
        r0 = self.client.post('/api/pms/reservations/', {
            'hotel': self.hotel.id, 'guest': self.guest.id, 'room_type': self.rt,
            'room': self.quartos[0], 'check_in': str(self.hoje - timedelta(days=3)),
            'check_out': str(self.hoje - timedelta(days=1)), 'adults': 1,
            'rate': '30000'}, format='json')
        res = Reservation.objects.get(pk=r0.data['id'])
        res.status = 'CHECKED_IN'
        res.save(update_fields=['status'])

        r = self._correr()

        self.assertEqual(len(r.data['late_departures']), 1)
        self.assertEqual(r.data['late_departures'][0]['confirmation'], res.confirmation)
        self.assertIn('ainda em check-in', r.data['detail'])
        # E NÃO se decide por ela: continua em check-in, para a recepção resolver.
        res.refresh_from_db()
        self.assertEqual(res.status, 'CHECKED_IN')

    def test_correr_a_auditoria_duas_vezes_nao_cobra_o_no_show_duas_vezes(self):
        res = self._reserva('BOOKED', dias_atras=1, garantida=True)
        self._correr()

        # A segunda passagem é recusada pela trava do dia — e é isso que se
        # exige: nem a data se gasta, nem a cobrança se repete.
        segunda = self._correr()
        self.assertEqual(segunda.status_code, 409)
        self.assertEqual(
            FolioCharge.objects.filter(source_reference=f'NOSHOW-{res.id}').count(), 1)
        self.assertEqual(NightAuditRun.objects.count(), 1)
