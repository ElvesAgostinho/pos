"""
Limpa os DADOS DE TESTE da operação do POS, sem tocar no arquivo fiscal.

Porquê existe: durante o desenvolvimento e as demonstrações ficam contas abertas,
caixas por fechar e comandas na fila que nunca ninguém vai cobrar nem imprimir. No
Fecho do Dia isso aparece como 48 contas por receber; no Diagnóstico, como uma fila
de impressão parada. É lixo, e faz o sistema mentir sobre o seu próprio estado.

O QUE NÃO SE APAGA: os documentos fiscais. Estão assinados e encadeados por hash —
apagar um parte a cadeia e o SAF-T deixa de bater. Um documento fiscal só se anula
(nota de crédito), nunca se apaga. É por isso que este comando não lhes toca.

Uso:
    python manage.py clean_test_data --dry-run     (mostra sem apagar)
    python manage.py clean_test_data --yes
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone


class Command(BaseCommand):
    help = 'Limpa contas/caixas/comandas de teste do POS (não toca nos documentos fiscais).'

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Confirma a limpeza.')
        parser.add_argument('--dry-run', action='store_true', help='Só mostra o que apagaria.')
        parser.add_argument('--outlets', default='Smoke Outlet,Restaurante Teste',
                            help='Postos de venda de teste a remover (separados por vírgula).')

    def handle(self, *args, **o):
        from pos.models import (Outlet, POSTicket, POSTicketLine, POSTicketPayment,
                                CashSession, CashMovement, PrintJob, POSTable)
        from fiscal.models import FiscalDocument

        seco = o['dry_run']
        nomes = [n.strip() for n in o['outlets'].split(',') if n.strip()]

        # Um posto de teste que já emitiu documentos fiscais NÃO se apaga: os documentos
        # referem-no, e o arquivo fiscal é intocável. Nesses casos, só se limpa a operação.
        outlets = list(Outlet.objects.filter(name__in=nomes))
        com_fiscal, apagaveis = [], []
        for out in outlets:
            ids = [str(i) for i in POSTicket.objects.filter(outlet=out).values_list('id', flat=True)]
            if FiscalDocument.objects.filter(source_module='pos', source_ref__in=ids).exists():
                com_fiscal.append(out)
            else:
                apagaveis.append(out)

        abertas = POSTicket.objects.filter(status__in=['OPEN', 'SUSPENDED'])
        sessoes = CashSession.objects.filter(status='OPEN')
        fila = PrintJob.objects.filter(status__in=['QUEUED', 'FAILED'])

        self.stdout.write(self.style.WARNING('\n--- O QUE VAI SER LIMPO ---'))
        self.stdout.write(f'  contas abertas/suspensas ....... {abertas.count()}')
        self.stdout.write(f'  caixas por fechar .............. {sessoes.count()}')
        self.stdout.write(f'  comandas na fila / falhadas .... {fila.count()}')
        self.stdout.write(f'  postos de teste a apagar ....... {[x.name for x in apagaveis] or "nenhum"}')
        if com_fiscal:
            self.stdout.write(self.style.WARNING(
                f'  postos MANTIDOS (têm faturas emitidas, o arquivo fiscal é intocável): '
                f'{[x.name for x in com_fiscal]}'))
        self.stdout.write(self.style.SUCCESS(
            f'  documentos fiscais preservados .. {FiscalDocument.objects.count()} (nenhum apagado)'))

        if seco:
            self.stdout.write(self.style.WARNING('\n(dry-run: nada foi apagado)'))
            return
        if not o['yes']:
            self.stdout.write(self.style.ERROR('\nFalta --yes para confirmar.'))
            return

        with transaction.atomic():
            # As contas abertas nunca vão ser cobradas: anulam-se e libertam-se as mesas.
            ids = list(abertas.values_list('id', flat=True))
            POSTicketPayment.objects.filter(ticket_id__in=ids).delete()
            POSTicketLine.objects.filter(ticket_id__in=ids).delete()
            n_contas = POSTicket.objects.filter(id__in=ids).delete()[0]
            POSTable.objects.filter(status='OCCUPIED').update(status='FREE')

            # As caixas ficam FECHADAS (não se apagam: houve dinheiro lá dentro).
            n_caixas = sessoes.update(status='CLOSED', closed_at=timezone.now(), closed_by='limpeza')

            n_fila = fila.delete()[0]

            n_postos = 0
            for out in apagaveis:
                # As contas fechadas/anuladas deste posto também são de teste (não têm
                # documento fiscal — já foi verificado acima). Saem primeiro, senão o
                # Outlet está PROTECTED e a limpeza inteira falha.
                tids = list(POSTicket.objects.filter(outlet=out).values_list('id', flat=True))
                POSTicketPayment.objects.filter(ticket_id__in=tids).delete()
                POSTicketLine.objects.filter(ticket_id__in=tids).delete()
                PrintJob.objects.filter(outlet=out).delete()
                POSTicket.objects.filter(id__in=tids).delete()
                CashMovement.objects.filter(session__outlet=out).delete()
                CashSession.objects.filter(outlet=out).delete()
                POSTable.objects.filter(outlet=out).delete()
                out.delete()
                n_postos += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nLimpo: {n_contas} registos de contas, {n_caixas} caixas fechadas, '
            f'{n_fila} comandas, {n_postos} posto(s) de teste.'))
        self.stdout.write('O arquivo fiscal ficou intacto — a cadeia de hashes não foi tocada.')
