"""
Certificação AGT — geração de credenciais NO PCC (lado fornecedor).

O fornecedor (dono do software) gera o par de chaves RSA e regista o nº de
certificado atribuído pela AGT. Estas credenciais são entregues ao cliente e
aplicadas no motor fiscal — o cliente NUNCA gera as suas próprias chaves.
"""
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from .models import License


def _generate_keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode('ascii')
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')
    return private_pem, public_pem


class AgtGenerateView(APIView):
    """
    POST /api/clm/agt/generate/  {license_id?, certificate_number}
    Gera um par de chaves RSA-2048 e associa o nº de certificado AGT.
    Se license_id for indicado, guarda as credenciais nessa licença.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cert = (request.data.get('certificate_number') or '').strip()
        if not cert:
            return Response({'detail': 'Indique o nº de certificado atribuído pela AGT.'}, status=400)
        private_pem, public_pem = _generate_keypair()

        lic = None
        lic_id = request.data.get('license_id')
        if lic_id:
            lic = License.objects.filter(id=lic_id).first()
            if not lic:
                return Response({'detail': 'Licença não encontrada.'}, status=404)
            lic.agt_certificate_number = cert
            lic.agt_public_key = public_pem
            lic.agt_private_key = private_pem
            lic.agt_issued_at = timezone.now()
            lic.save(update_fields=['agt_certificate_number', 'agt_public_key', 'agt_private_key', 'agt_issued_at'])

        return Response({
            'detail': 'Credenciais AGT geradas.',
            'certificate_number': cert,
            'private_key': private_pem,   # entregar ao motor fiscal do cliente
            'public_key': public_pem,
            'license': lic.license_number if lic else None,
            'note': 'Entregue estas credenciais ao cliente (Fiscal → Certificação AGT). O cliente não gera chaves.',
        })


class AgtLicenseCredentialsView(APIView):
    """GET /api/clm/agt/credentials/?license_id= — credenciais AGT guardadas de uma licença."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        lic = License.objects.filter(id=request.query_params.get('license_id')).first()
        if not lic:
            return Response({'detail': 'Licença não encontrada.'}, status=404)
        return Response({
            'license': lic.license_number,
            'certificate_number': lic.agt_certificate_number,
            'public_key': lic.agt_public_key,
            'private_key': lic.agt_private_key,
            'issued_at': lic.agt_issued_at,
            'certified': bool(lic.agt_certificate_number and lic.agt_certificate_number not in ('0000', '')),
        })


class AgtConnectionView(APIView):
    """PCC › AGT — a LIGAÇÃO da fatura eletrónica de um cliente (endpoints/credenciais).

    POST /api/clm/agt/connection/  {license_id, url_auth, url_submit, url_health,
                                    client_id, client_secret, environment}
    É o fornecedor que preenche isto quando a AGT emitir as credenciais do
    contribuinte; segue para o cliente na sincronização seguinte.

    GET ?license_id= — o que está guardado (o secret nunca volta em claro).
    """
    permission_classes = [IsAuthenticated]

    CAMPOS = ('url_auth', 'url_submit', 'url_query', 'url_cancel', 'url_download',
              'url_saft', 'url_health', 'client_id', 'client_secret', 'environment')

    def get(self, request):
        lic = License.objects.filter(id=request.query_params.get('license_id')).first()
        if not lic:
            return Response({'detail': 'Licença não encontrada.'}, status=404)
        con = dict(lic.agt_connection or {})
        tem_secret = bool(con.pop('client_secret', None))
        return Response({
            'license': lic.license_number,
            'connection': con,
            'has_secret': tem_secret,
            'configured': bool(con or tem_secret),
            'certificate_number': lic.agt_certificate_number,
            'has_keys': bool(lic.agt_private_key),
        })

    def post(self, request):
        lic = License.objects.filter(id=request.data.get('license_id')).first()
        if not lic:
            return Response({'detail': 'Licença não encontrada.'}, status=404)
        novo = {k: request.data.get(k) for k in self.CAMPOS if request.data.get(k)}
        # editar sem redigitar o secret: campo vazio mantém o que já está guardado
        if 'client_secret' not in novo and (lic.agt_connection or {}).get('client_secret'):
            novo['client_secret'] = lic.agt_connection['client_secret']
        lic.agt_connection = novo
        lic.save(update_fields=['agt_connection'])
        return Response({'detail': 'Ligação AGT guardada — o cliente recebe-a na próxima sincronização.',
                         'connection': {k: ('•••' if k == 'client_secret' else v)
                                        for k, v in lic.agt_connection.items()}})


class AgtDossierView(APIView):
    """PCC › AGT — o DOSSIER TÉCNICO de certificação, gerado com evidências REAIS.

    GET /api/clm/agt/dossier/ — devolve o documento (HTML imprimível) que acompanha
    o pedido de validação à AGT: mecanismo de assinatura, cadeia de hashes com uma
    amostra real, menção impressa, catálogo de documentos/séries, SAF-T e medidas
    de inviolabilidade. O fornecedor imprime/PDF e entrega.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import HttpResponse
        from django.utils import timezone
        from fiscal.models import FiscalDocument, FiscalDocType, FiscalSeries, FiscalConfig

        cfg = FiscalConfig.get()
        docs = FiscalDocument.objects.exclude(doc_hash__in=('', '0')).order_by('id')
        primeiro, ultimo = docs.first(), docs.last()
        tipos = FiscalDocType.objects.all().order_by('code')
        series = FiscalSeries.objects.filter(is_active=True).select_related('doc_type')

        def linha_doc(d):
            if not d:
                return '<i>(sem documentos emitidos)</i>'
            h = d.doc_hash or ''
            return (f'<code>{d.invoice_no}</code> · {d.doc_date} · hash '
                    f'<code>{h[:24]}…</code> (4 car.: <b>{"".join(h[i] for i in (0,10,20,30) if len(h)>i)}</b>)')

        html = f'''<!doctype html><html lang="pt"><meta charset="utf-8">
<title>Dossier Técnico — Certificação AGT</title>
<style>body{{font-family:Segoe UI,Arial,sans-serif;max-width:860px;margin:24px auto;color:#222;line-height:1.5}}
h1{{border-bottom:3px solid #222}} h2{{border-bottom:1px solid #ccc;margin-top:28px}}
table{{border-collapse:collapse;width:100%;font-size:13px}} td,th{{border:1px solid #ccc;padding:4px 8px;text-align:left}}
code{{background:#f4f4f4;padding:1px 4px}}</style>
<h1>Dossier Técnico de Certificação — System Mwana Lodge (POS)</h1>
<p>Gerado automaticamente pelo PCC em {timezone.localtime():%d/%m/%Y %H:%M}. Acompanha o pedido de
validação de software de faturação junto da AGT (Decreto Presidencial n.º 312/18).</p>

<h2>1. Identificação do software</h2>
<table>
<tr><th>Produto</th><td>System Mwana Lodge — módulo POS (faturação certificável)</td></tr>
<tr><th>N.º de certificado (atual)</th><td>{cfg.certificate_number}</td></tr>
<tr><th>Versão da chave de assinatura</th><td>v{cfg.key_version}</td></tr>
<tr><th>Ambiente</th><td>{cfg.environment}</td></tr>
</table>

<h2>2. Assinatura digital e cadeia de hashes</h2>
<p>Cada documento fiscal é assinado com <b>RSA-SHA1</b> (chave privada do fabricante,
provisionada pelo PCC; o cliente nunca a gera). A mensagem assinada inclui o hash do
<b>documento anterior da mesma série</b> — a cadeia: alterar um documento antigo invalida
todos os seguintes.</p>
<table>
<tr><th>Primeiro documento da cadeia</th><td>{linha_doc(primeiro)}</td></tr>
<tr><th>Último documento da cadeia</th><td>{linha_doc(ultimo)}</td></tr>
<tr><th>Total de documentos assinados</th><td>{docs.count()}</td></tr>
</table>

<h2>3. Menção impressa</h2>
<p>Todos os documentos impressos levam os 4 caracteres da assinatura (posições 1, 11, 21, 31)
e a menção: <code>XXXX-Processado por programa validado n.º {cfg.certificate_number}</code>.
As vias (Original, Duplicado, …) são configuráveis por série e impressas em cada cópia.</p>

<h2>4. Catálogo de documentos e séries</h2>
<table><tr><th>Código</th><th>Nome</th><th>SAF-T</th><th>Assinado</th><th>Retificativo</th></tr>
{''.join(f"<tr><td>{t.code}</td><td>{t.name}</td><td>{t.saft_type}</td><td>{'Sim' if t.signable else 'Não'}</td><td>{'Sim' if t.is_rectifying else 'Não'}</td></tr>" for t in tipos)}
</table>
<p>Séries ativas: {', '.join(f'{s.doc_type.code} {s.code}' for s in series)}.</p>

<h2>5. Inviolabilidade e auditoria</h2>
<ul>
<li>Documentos fiscais <b>nunca são apagados</b>: a anulação emite Nota de Crédito assinada.</li>
<li>Auditoria completa (operador, utilizador, IP, data/hora) em todas as operações.</li>
<li>Preços calculados exclusivamente no servidor; descontos acima do limite exigem supervisor.</li>
<li>Numeração sequencial por série, sem lacunas; valor por extenso; resumo de IVA por taxa.</li>
</ul>

<h2>6. SAF-T (AO) e Comunicação de Inventário</h2>
<p>Exportação SAF-T AO 1.01_01 com MasterFiles (Clientes, Produtos, Tabela de Impostos),
SalesInvoices, WorkingDocuments (incl. Consulta de Mesa) e assinatura por documento.
Comunicação anual de inventário (StockFile) gerada a partir das existências valorizadas.</p>

<h2>7. Fatura eletrónica (transmissão à AGT)</h2>
<p>Fila store-and-forward com reenvio automático: sem internet, os documentos acumulam e
seguem quando a linha volta. Estados aceite/rejeitado/reenviar auditados. Os endpoints e
credenciais do contribuinte são provisionados pelo PCC (nunca editáveis pelo cliente).</p>
</html>'''
        resp = HttpResponse(html, content_type='text/html; charset=utf-8')
        if request.query_params.get('download'):
            resp['Content-Disposition'] = 'attachment; filename="dossier_agt.html"'
        return resp
