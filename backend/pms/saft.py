"""
SAF-T DO ALOJAMENTO — as facturas do PMS, no ficheiro que a AGT espera.

Só existia o SAF-T do POS. Um hotel que vende alojamento e restaurante emitia
facturas por dois caminhos (`emit_for_pms_folio` e o terminal) e só conseguia
exportar metade: as facturas das estadias — que num hotel são a maior parte da
receita — não tinham por onde sair. Numa inspecção, isso é o ficheiro que falta.

Não há motor novo aqui. O gerador do SAF-T (`fiscal/saft.py::generate_saft`) já
nasceu com um filtro por origem, precisamente para isto; o que faltava era
alguém chamá-lo com `module='pms'` e um ecrã por onde o pedir. Este módulo é
essa ponta — a mesma mecânica do POS (contagem, período, registo da exportação
com o resultado da validação), aplicada ao alojamento.
"""
import datetime
import hashlib
import xml.etree.ElementTree as ET

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fiscal.models import FiscalConfig, FiscalDocument, SaftExport
from fiscal.saft import generate_saft

MODULO = 'pms'


def _periodo(ano, mes):
    if mes:
        mes = int(mes)
        inicio = datetime.date(ano, mes, 1)
        fim = datetime.date(ano + (mes == 12), (mes % 12) + 1, 1) - datetime.timedelta(days=1)
        return inicio, fim
    return datetime.date(ano, 1, 1), datetime.date(ano, 12, 31)


class PmsSaftView(APIView):
    """SAF-T do alojamento — só os documentos emitidos pelo PMS.

    GET  devolve o resumo (quantos documentos há, de quando a quando), para o
         ecrã poder dizer o que vai sair antes de se gerar fosse o que fosse.
    POST gera o ficheiro e devolve-o para download.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = FiscalConfig.get()
        docs = FiscalDocument.objects.filter(source_module=MODULO)
        return Response({
            'version': '1.01_01',
            'company': cfg.company_name,
            'tax_id': cfg.company_nif,
            'application': 'PMS',
            'documents': docs.count(),
            'first': docs.order_by('doc_date').values_list('doc_date', flat=True).first(),
            'last': docs.order_by('-doc_date').values_list('doc_date', flat=True).first(),
        })

    def post(self, request):
        """Gera o ficheiro. Sem documentos no período, não se inventa um vazio.

        Um SAF-T sem documentos é um ficheiro válido em XML e inútil em
        substância: entregue à AGT, declara que o hotel não facturou nada
        naquele mês. Vale mais recusar e dizer porquê.
        """
        ano = int(request.data.get('year') or datetime.date.today().year)
        inicio, fim = _periodo(ano, request.data.get('month'))

        quantos = FiscalDocument.objects.filter(
            source_module=MODULO, doc_date__gte=inicio, doc_date__lte=fim).count()
        if not quantos:
            return Response({'detail': f'Não há facturas do alojamento entre {inicio} e {fim}. '
                                       f'Um SAF-T vazio não se entrega.'}, status=400)

        xml = generate_saft(inicio, fim, module=MODULO)

        mes = request.data.get('month')
        nome = f'SAFT_PMS_{ano}{f"{int(mes):02d}" if mes else ""}.xml'

        # O REGISTO da exportação fica guardado com o resultado da validação — é
        # o histórico do que saiu para a AGT, e a marca "válido" é ESCRITA pelo
        # validador, nunca à mão. Mesmo livro do POS: as exportações dos dois
        # módulos aparecem na mesma lista, que é como se audita um hotel.
        try:
            valido = True
            try:
                ET.fromstring(xml)
            except ET.ParseError:
                valido = False
            SaftExport.objects.create(
                profile='faturacao', start_date=inicio, end_date=fim, filename=nome,
                size_bytes=len(xml.encode('utf-8')),
                sha256=hashlib.sha256(xml.encode('utf-8')).hexdigest(),
                is_valid=valido,
                problems=None if valido else 'XML mal formado — não entregar.',
                created_by=(request.user.username if request.user.is_authenticated else ''),
            )
        except Exception:
            pass   # o registo nunca pode impedir a entrega do ficheiro

        resposta = HttpResponse(xml, content_type='application/xml')
        resposta['Content-Disposition'] = f'attachment; filename="{nome}"'
        return resposta
