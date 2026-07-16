# -*- coding: utf-8 -*-
"""
AGENTE DE IMPRESSÃO — a ponte entre a fila e o FERRO.

O sistema já tinha tudo menos isto: os artigos sabem em que postos imprimem, as vendas
e as comandas entram na fila (PrintJob), o Hardware guarda as portas e os baud rates —
mas ninguém ia buscar os papéis à fila. Este agente corre na máquina da casa (junto às
impressoras) e despacha:

  · rede  → porta 9100 (RAW/JetDirect): é como falam as térmicas EPSON/Bematech/POS-X;
  · série → COMx com os parâmetros da ficha do aparelho (baud, paridade, stop bits);
  · Windows → nome da impressora no spooler (impressoras USB instaladas no Windows).

ESC/POS: inicializa, imprime, corta o papel e — nos talões de venda — DÁ O PULSO NA
GAVETA (a gaveta liga-se à impressora; é o pulso que a abre).

Uso:
    python manage.py print_agent            (fica a correr; é o serviço da loja)
    python manage.py print_agent --once     (despacha o que está em fila e sai — testes)

Falhou a impressora? O job fica FAILED com o erro, o Diagnóstico mostra-o, e o botão
"Reimprimir" volta a pô-lo na fila. Papel nenhum se perde em silêncio.
"""
import socket
import time

from django.core.management.base import BaseCommand

# ESC/POS — os bytes do ofício
INIT = b'\x1b@'                    # reset
CUT = b'\n\n\x1dV\x00'             # corte total
DRAWER = b'\x1bp\x00\x19\xfa'      # pulso na gaveta (pino 2)


class Command(BaseCommand):
    help = 'Despacha a fila de impressão (PrintJob) para as impressoras físicas.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Processa a fila e sai.')
        parser.add_argument('--interval', type=int, default=2, help='Segundos entre voltas.')

    # ── resolver o aparelho de um job ─────────────────────────────────────
    def _device_for(self, job):
        """Que aparelho imprime ESTE job: o posto (Printer) da estação certa no outlet,
        e daí o hardware (PosHardware) com a porta. É a configuração do backoffice a
        decidir — o agente não escolhe nada."""
        from inventory.models import Printer
        station = {'KITCHEN': 'KITCHEN', 'BAR': 'BAR', 'PASTRY': 'PASTRY',
                   'RECEIPT': 'CASHIER', 'INVOICE': 'CASHIER', 'DRAWER': 'CASHIER'}.get(job.job_type, 'CASHIER')
        qs = Printer.objects.filter(station=station, is_active=True).select_related('device')
        if job.outlet_id:
            no_outlet = qs.filter(outlet=job.outlet).first()
            if no_outlet:
                return no_outlet.device
        p = qs.first()
        return p.device if p else None

    # ── enviar bytes para a porta configurada ─────────────────────────────
    def _send(self, device, payload):
        port = (device.port or '').strip()
        if not port:
            raise RuntimeError(f'O aparelho "{device.name}" não tem porta configurada (Hardware).')

        if ':' in port and not port.upper().startswith('COM'):
            # REDE — IP:porta (térmicas de rede falam RAW na 9100)
            host, _, p = port.partition(':')
            with socket.create_connection((host, int(p or 9100)), timeout=10) as s:
                s.sendall(payload)
            return

        if port.upper().startswith('COM'):
            # SÉRIE — com os parâmetros da ficha (é para isto que eles lá estão)
            try:
                import serial
            except ImportError:
                raise RuntimeError('pyserial não instalado (pip install pyserial) — preciso dele para portas COM.')
            par = {'NONE': 'N', 'EVEN': 'E', 'ODD': 'O'}.get(device.parity, 'N')
            with serial.Serial(port=port, baudrate=device.baud_rate, parity=par,
                               stopbits=device.stop_bits, bytesize=device.data_bits,
                               timeout=10) as com:
                com.write(payload)
            return

        # SPOOLER DO WINDOWS — o nome da impressora instalada (USB)
        try:
            import win32print
        except ImportError:
            raise RuntimeError('pywin32 não instalado (pip install pywin32) — preciso dele para o spooler.')
        h = win32print.OpenPrinter(port)
        try:
            win32print.StartDocPrinter(h, 1, ('POS', None, 'RAW'))
            win32print.StartPagePrinter(h)
            win32print.WritePrinter(h, payload)
            win32print.EndPagePrinter(h)
            win32print.EndDocPrinter(h)
        finally:
            win32print.ClosePrinter(h)

    def _despacha(self):
        from pos.models import PrintJob
        n = 0
        for job in PrintJob.objects.filter(status='QUEUED').order_by('created_at')[:50]:
            try:
                device = self._device_for(job)
                if not device:
                    raise RuntimeError('Nenhum posto de impressão ativo para esta estação '
                                       '(Configuração POS › Impressoras).')
                corpo = (job.content or job.title or '').encode('cp860', errors='replace')
                payload = INIT + corpo + CUT
                # o talão de VENDA abre a gaveta; a comanda da cozinha não
                if job.job_type in ('RECEIPT', 'INVOICE', 'DRAWER'):
                    payload += DRAWER
                for _ in range(max(1, job.copies or 1)):
                    self._send(device, payload)
                job.status = 'PRINTED'
                job.error = None
                job.save(update_fields=["status", "error"])
                n += 1
                self.stdout.write(f'IMPRESSO  {job.job_type}  {job.title}  -> {device.name} ({device.port})')
            except Exception as e:
                job.status = 'FAILED'
                job.error = str(e)[:200]
                job.save(update_fields=["status", "error"])
                self.stderr.write(f'FALHOU    {job.job_type}  {job.title}: {e}')
        return n

    def handle(self, *args, **o):
        if o['once']:
            n = self._despacha()
            self.stdout.write(f'{n} trabalho(s) despachados.')
            return
        self.stdout.write('Agente de impressão a correr (Ctrl+C para parar)…')
        while True:
            try:
                self._despacha()
            except Exception as e:      # a fila não pode matar o agente
                self.stderr.write(f'erro na volta: {e}')
            time.sleep(o['interval'])
