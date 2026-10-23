# -*- coding: utf-8 -*-
"""TODOS OS ECRÃS RESPONDEM — a varredura que não pula nenhum.

Os outros testes percorrem caminhos escolhidos: uma venda, um check-in, um
fecho. Este não escolhe nada. Enumera TODAS as rotas de listagem da API — são
mais de trezentas — e abre uma a uma, como quem clica em cada item da árvore do
backoffice de cima a baixo.

O que procura é uma coisa só, e é a que o dono vê: **um ecrã que rebenta**. Um
500 significa que quem lá chegar encontra "Ocorreu um erro interno" em vez do
conteúdo — e, numa instalação ACABADA DE MONTAR, é precisamente o que acontece
quando um ecrã assume que já existe um hotel, um artigo ou uma série fiscal.

Dois cenários, de propósito:
  · INSTALAÇÃO VAZIA — nada configurado. É o que o cliente vê no primeiro dia.
  · CASA MONTADA — com hotel, artigos e vendas. É o que ele vê todos os outros.

Um ecrã pode legitimamente responder 400 (falta um parâmetro), 403 (sem
permissão) ou 404 (não existe). Só o 500 é defeito: é o sistema a desistir.
"""
import re

from django.contrib.auth.models import User
from django.urls import get_resolver
from rest_framework.test import APITestCase


# Rotas que NÃO se abrem numa varredura, e porquê. Cada exclusão é uma decisão,
# não um esquecimento — por isso cada uma tem a razão escrita ao lado.
NAO_ABRIR = {
    # Saem da máquina: contactam o PCC, a AGT ou um servidor de e-mail. Numa
    # varredura isso é esperar 20 segundos por um tempo-limite, vezes N.
    'licensing/sync', 'licensing/activate-remote', 'licensing/apply-update',
    'clm/licenses/latest', 'clm/licenses/activate', 'clm/licenses/verify-reset-code',
    'fiscal/agt/', 'integration/channels', 'pms/chatbot/qr',
    # Descarregam ficheiros grandes ou geram-nos na hora (SAF-T, cópias).
    'saft/export', 'support/logs', 'backup',
}


def _rotas_de_listagem():
    """Todas as rotas de API sem parâmetros — as que a árvore do backoffice abre."""
    def caminhar(res, prefixo=''):
        for p in res.url_patterns:
            if hasattr(p, 'url_patterns'):
                yield from caminhar(p, prefixo + str(p.pattern))
            else:
                yield prefixo + str(p.pattern)

    vistas = []
    for r in caminhar(get_resolver()):
        if not r.startswith('api/'):
            continue
        if '<' in r or '(?P<' in r:          # precisa de um id: não é listagem
            continue
        r = r.replace('\\.', '.').rstrip('$')
        if r.endswith('.(?P<format>[a-z0-9]+)/?'):
            continue
        if any(x in r for x in NAO_ABRIR):
            continue
        vistas.append('/' + r)
    return sorted(set(vistas))


class TodosOsEcransRespondemTests(APITestCase):
    """Abre todos os ecrãs de uma instalação VAZIA — o primeiro dia do cliente."""

    def setUp(self):
        self.user = User.objects.create_superuser('dono_teste', '', 'x')
        self.client.force_authenticate(self.user)

    def _varrer(self):
        rebentados = []
        for rota in _rotas_de_listagem():
            try:
                r = self.client.get(rota)
                estado = r.status_code
            except Exception as e:
                rebentados.append((rota, f'exceção: {type(e).__name__}: {e}'))
                continue
            if estado >= 500:
                corpo = ''
                try:
                    corpo = str(r.data)[:160]
                except Exception:
                    corpo = str(r.content[:160])
                rebentados.append((rota, f'{estado} · {corpo}'))
        return rebentados

    def test_nenhum_ecra_rebenta_numa_instalacao_vazia(self):
        """O PRIMEIRO DIA. Sem hotel, sem artigos, sem vendas — e nenhum ecrã
        pode responder "erro interno". Pode dizer "não há nada ainda"; não pode
        desistir."""
        rebentados = self._varrer()
        if rebentados:
            relato = '\n'.join(f'  {rota}\n      {erro}' for rota, erro in rebentados)
            self.fail(f'{len(rebentados)} ecrã(s) rebentam numa instalação '
                      f'acabada de montar:\n{relato}')

    def test_a_varredura_abre_mesmo_todos_os_ecras(self):
        """A varredura só vale se estiver mesmo a abrir o sistema todo — senão
        passa por estar vazia e não por estar tudo bem."""
        rotas = _rotas_de_listagem()
        self.assertGreater(len(rotas), 250,
                           f'A varredura só encontrou {len(rotas)} ecrãs — '
                           f'alguma coisa a está a filtrar a mais.')


class TodosOsEcransComDadosTests(TodosOsEcransRespondemTests):
    """A MESMA varredura, mas com a casa a trabalhar.

    Uma instalação vazia esconde metade dos caminhos: um ecrã que rebenta a
    formatar uma data, a dividir por um total, ou a ler o artigo de uma linha,
    só rebenta quando há linhas. Este monta um dia inteiro — hotel, artigos,
    venda paga, documento fiscal, hóspede com folio, caixa fechada — e volta a
    abrir tudo.
    """

    def setUp(self):
        super().setUp()
        self._montar_a_casa()

    def _montar_a_casa(self):
        from datetime import timedelta
        from decimal import Decimal

        from django.utils import timezone
        from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries, TaxRate
        from identity.models import Company, EnterpriseGroup, Hotel
        from inventory.models import Item, ItemCategory, Printer, UnitOfMeasure
        from mdm.models import Customer, PaymentMethod
        from pms.models import Folio, Reservation, Room, RoomType
        from pos.models import (CashSession, Outlet, OutletPaymentMethod,
                                POSProductConfig, POSTable, PosHardware)

        g = EnterpriseGroup.objects.create(name='Grupo Principal')
        emp = Company.objects.create(group=g, name='Mwana Lodge, Lda.', tax_id='5000000000')
        hotel = Hotel.objects.create(company=emp, name='Mwana Lodge', is_master=True)

        outlet = Outlet.objects.create(hotel=hotel, name='Restaurante', code='RST')
        POSTable.objects.create(outlet=outlet, table_number='12', seats=4)
        maq = PosHardware.objects.create(code='HW-COZ', name='Impressora Cozinha')
        Printer.objects.create(code='P-COZ', name='Cozinha', station='KITCHEN',
                               outlet=outlet, device=maq)

        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Restauração')
        item = Item.objects.create(code='A001', name='Bife à Casa', item_type='Manufactured',
                                   category=cat, base_uom=un, sale_price=Decimal('8500'),
                                   tax_percentage=Decimal('14'))
        POSProductConfig.objects.create(outlet=outlet, item=item, kds_station='KITCHEN')

        dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                method_type='CASH', for_pos=True)
        OutletPaymentMethod.objects.create(outlet=outlet, payment_method=dinheiro)

        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        ano = timezone.localdate().year
        tipo = FiscalDocType.objects.create(code='FR', name='Fatura-Recibo', invoice_type='FR')
        FiscalSeries.objects.create(code='A', doc_type=tipo, year=ano, prefix='FR', certified=True)

        caixa = CashSession.objects.create(outlet=outlet, opening_float=Decimal('10000'),
                                           opened_by='dono_teste', operator_name='Empregado 1',
                                           status='OPEN')

        # Uma venda a sério — para os ecrãs terem linhas que formatar.
        r = self.client.post('/api/pos/tickets/', {
            'outlet': outlet.id, 'guest_type': 'PASSANTE', 'cash_session': caixa.id,
            'operator_name': 'Empregado 1'}, format='json')
        ticket = r.data['id']
        self.client.post(f'/api/pos/tickets/{ticket}/add_line/',
                         {'item': item.id, 'quantity': 1}, format='json')
        self.client.post(f'/api/pos/tickets/{ticket}/fire_kitchen/', {}, format='json')
        self.client.post(f'/api/pos/tickets/{ticket}/pay/',
                         {'payment_method': dinheiro.id, 'amount': '8500.00'}, format='json')

        # Um hóspede instalado, com folio aberto.
        tipo_q = RoomType.objects.create(hotel=hotel, code='STD', name='Standard',
                                         base_rate=Decimal('25000'))
        quarto = Room.objects.create(hotel=hotel, room_type=tipo_q, number='101')
        hospede = Customer.objects.create(code='C001', name='Ana Silva')
        hoje = timezone.localdate()
        reserva = Reservation.objects.create(
            hotel=hotel, confirmation='RES0001', guest=hospede, room=quarto, room_type=tipo_q,
            check_in=hoje, check_out=hoje + timedelta(days=2), status='CHECKED_IN', adults=1)
        Folio.objects.create(reservation=reserva, number='F0001', status='OPEN')

        # E uma caixa já fechada, para os ecrãs de fecho terem histórico.
        CashSession.objects.create(outlet=outlet, opening_float=Decimal('10000'),
                                   opened_by='dono_teste', operator_name='Empregado 0',
                                   status='CLOSED', counted_amount=Decimal('10000'),
                                   expected_amount=Decimal('10000'), difference=Decimal('0'),
                                   closed_at=timezone.now(), closed_by='dono_teste')

    def test_nenhum_ecra_rebenta_numa_instalacao_vazia(self):
        """Herdado mas sem sentido aqui — a casa já não está vazia."""
        self.skipTest('esta classe corre a varredura com a casa montada')

    def test_nenhum_ecra_rebenta_com_a_casa_a_trabalhar(self):
        rebentados = self._varrer()
        if rebentados:
            relato = '\n'.join(f'  {rota}\n      {erro}' for rota, erro in rebentados)
            self.fail(f'{len(rebentados)} ecrã(s) rebentam com dados reais:\n{relato}')
