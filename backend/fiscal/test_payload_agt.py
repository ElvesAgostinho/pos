# -*- coding: utf-8 -*-
"""O QUE SE ENVIA À AGT — o conteúdo, não só o circuito.

A transmissão de facturas electrónicas corre em SIMULAÇÃO enquanto a AGT não
emitir as credenciais ao contribuinte: sem `url_submit` configurado, o
transmissor dá aceite a si próprio e marca a submissão como simulada. Isso é
certo — permite validar o circuito (emissão → fila → transmissão → aceite) antes
de haver credenciais.

Mas tem um preço, e foi o que deixou passar um defeito grave: **o caminho
simulado não olha para o payload**. Dá aceite a qualquer coisa. O dia em que as
credenciais chegassem, o que fosse mal construído passaria a ser rejeitado pela
AGT a sério — e aí já é com o contribuinte a comunicar faturas.

Estes testes olham para o payload. Correm sem credenciais, sem rede e sem AGT:
constroem o dicionário que seria enviado e verificam o que tem dentro.

O defeito que os motivou: `reference_document` saía SEMPRE vazio. O código fazia
`doc.reference_doc.invoice_no if getattr(doc, 'reference_doc_id', None)`, e
`reference_doc` é um CharField — o Django só cria `<campo>_id` para chaves
estrangeiras, por isso a condição nunca era verdadeira. Toda a nota de crédito
ia para a AGT sem dizer que factura anula, que é precisamente o dado obrigatório
num documento retificativo.
"""
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase


class OPayloadDaAgtTests(TestCase):

    def setUp(self):
        call_command('seed_fiscal', verbosity=0)
        from fiscal.models import FiscalConfig
        cfg = FiscalConfig.get()
        cfg.company_name = 'Mwana Lodge, Lda.'
        cfg.company_nif = '5000000000'
        cfg.certificate_number = '147/AGT/2026'
        cfg.save()
        self.cfg = cfg

    def _emitir(self, codigo, valor, **kw):
        from fiscal import services
        from fiscal.models import FiscalSeries
        serie = FiscalSeries.objects.filter(doc_type__code=codigo, is_active=True).first()
        return services.issue_document(
            serie.id, lines=[{'description': 'Consumo', 'quantity': 1,
                              'unit_price': Decimal(valor),
                              'tax_percentage': Decimal('14')}],
            tax_inclusive=False, source_module='pos', user='ana', **kw)

    def test_uma_nota_de_credito_diz_a_AGT_que_factura_anula(self):
        """O defeito. Sem esta referência, a AGT recebe uma nota de crédito que
        não aponta para nada — e uma nota de crédito que não identifica o
        documento retificado é um documento inválido."""
        from fiscal import services
        from fiscal.agt_client import build_payload
        factura = self._emitir('FR', '10000')
        nc = services.create_credit_note(factura.id, reason='Devolução', user='ana')

        p = build_payload(nc)
        self.assertEqual(p['document']['reference_document'], factura.invoice_no,
                         f"A nota de crédito ia para a AGT com "
                         f"reference_document={p['document']['reference_document']!r} "
                         f"em vez de {factura.invoice_no!r}.")

    def test_uma_factura_normal_nao_leva_referencia_nenhuma(self):
        """O outro lado: uma venda normal não retifica nada, e inventar aí uma
        referência era pior do que não a ter."""
        p = build = None
        from fiscal.agt_client import build_payload
        p = build_payload(self._emitir('FR', '5000'))
        self.assertIsNone(p['document']['reference_document'])

    def test_o_payload_identifica_o_emitente_e_o_certificado(self):
        """É por isto que a AGT sabe de quem é a comunicação. Um certificado em
        falta faz a submissão ser recusada sem explicação útil."""
        from fiscal.agt_client import build_payload
        p = build_payload(self._emitir('FR', '5000'))
        self.assertEqual(p['emitter']['tax_id'], '5000000000')
        self.assertEqual(p['emitter']['name'], 'Mwana Lodge, Lda.')
        self.assertEqual(p['emitter']['certificate_number'], '147/AGT/2026')

    def test_o_payload_leva_a_assinatura_e_o_encadeamento(self):
        """O hash do documento e o do anterior são o que prova que a série não
        foi mexida. Sem eles, a comunicação não vale como prova."""
        from fiscal.agt_client import build_payload
        d1 = self._emitir('FR', '1000')
        d2 = self._emitir('FR', '2000')
        p = build_payload(d2)
        self.assertTrue(p['document']['hash'], 'O documento foi enviado sem assinatura.')
        self.assertEqual(p['document']['previous_hash'], d1.doc_hash,
                         'O encadeamento não foi enviado: a AGT não consegue verificar '
                         'que não falta um documento na série.')

    def test_as_linhas_vao_com_a_taxa_e_o_imposto_de_cada_uma(self):
        from fiscal.agt_client import build_payload
        p = build_payload(self._emitir('FR', '10000'))
        linhas = p['document']['lines']
        self.assertEqual(len(linhas), 1)
        self.assertEqual(linhas[0]['tax_rate'], '14.00')
        self.assertEqual(Decimal(linhas[0]['tax_amount']), Decimal('1400.00'))
        self.assertEqual(Decimal(linhas[0]['line_total']), Decimal('10000.00'))
        self.assertEqual(linhas[0]['number'], 1, 'As linhas numeram-se a partir de 1.')

    def test_um_documento_anulado_vai_com_o_estado_anulado(self):
        """A AGT tem de saber que o documento foi anulado — não se apaga, declara-se."""
        from fiscal import services
        from fiscal.agt_client import build_payload
        d = self._emitir('FR', '3000')
        services.void_document(d.id, reason='Erro do operador', user='ana')
        d.refresh_from_db()
        self.assertEqual(build_payload(d)['document']['status'], 'A')

    def test_a_chave_de_idempotencia_e_estavel_e_distingue_documentos(self):
        """É com ela que a AGT não duplica um reenvio. Tem de ser a MESMA para o
        mesmo documento e DIFERENTE entre documentos."""
        from fiscal.agt_client import idempotency_key
        a = self._emitir('FR', '1000')
        b = self._emitir('FR', '1000')
        self.assertEqual(idempotency_key(a), idempotency_key(a),
                         'A mesma submissão gerou chaves diferentes — um reenvio ia '
                         'duplicar a factura na AGT.')
        self.assertNotEqual(idempotency_key(a), idempotency_key(b),
                            'Duas facturas do mesmo valor partilham a chave — a segunda '
                            'seria descartada pela AGT como repetida.')

    def test_sem_ligacao_configurada_o_aceite_diz_que_e_simulado(self):
        """Nunca se pode fazer passar uma simulação por comunicação real: é o
        que separa "validei o circuito" de "comuniquei à AGT"."""
        from fiscal.agt_client import enqueue, send
        d = self._emitir('FR', '4000')
        sub = send(enqueue(d))
        self.assertEqual(sub.status, 'ACK')
        self.assertTrue(sub.agt_reference.startswith('SIM-'),
                        'Uma submissão simulada tem de se identificar como tal.')
        self.assertIn('SIMULAÇÃO', sub.response)
