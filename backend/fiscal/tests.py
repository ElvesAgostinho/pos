# -*- coding: utf-8 -*-
"""A CERTIFICAÇÃO AGT — e aparecer em TODO O SÍTIO onde tem de aparecer.

Um sistema não certificado imprime "Processado por programa validado n.º 0000".
Quando o fornecedor entrega a certificação, esse número muda — e tem de mudar
em todos os sítios ao mesmo tempo: na menção impressa em cada fatura nova, no
código QR, no ficheiro SAF-T que vai para a AGT, nos ecrãs de estado, e no
diagnóstico que o suporte lê à distância.

O risco não é o número não entrar: é entrar num sítio e não noutro. Um SAF-T
que declara 0000 enquanto as faturas impressas dizem 1234 é um sistema que se
contradiz perante a AGT, e ninguém dá por isso até à inspeção.

Um ponto que estes testes fixam de propósito: os documentos JÁ EMITIDOS ficam
com a menção que tinham. Uma fatura impressa é um papel que existe no mundo —
o sistema não pode reescrever o que lá foi.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from fiscal import signing
from fiscal.certification import apply_certification
from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries, TaxRate


class CertificacaoAgtTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('dono_teste', '', 'x')
        self.client.force_authenticate(self.user)

        # A ficha do hotel precisa de um hotel: é um dos ecrãs onde o número
        # de certificação tem de aparecer, e sem propriedade responde 404.
        from identity.models import Company, EnterpriseGroup, Hotel
        g = EnterpriseGroup.objects.create(name='Grupo Principal')
        emp = Company.objects.create(group=g, name='Mwana Lodge, Lda.', tax_id='5000000000')
        Hotel.objects.create(company=emp, name='Mwana Lodge', is_master=True)

        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.certificate_number = '0000'          # instalação por certificar
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        self.tipo = FiscalDocType.objects.create(code='FT', name='Fatura', invoice_type='FT')
        self.serie = FiscalSeries.objects.create(code='A', doc_type=self.tipo, year=2026,
                                                 prefix='FT', certified=True)

    def _emitir(self):
        from fiscal.services import issue_document
        return issue_document(self.serie.id, customer_name='Consumidor Final',
                              lines=[{'description': 'Jantar', 'quantity': 1,
                                      'unit_price': Decimal('10000'),
                                      'tax_percentage': Decimal('14')}],
                              user='dono_teste', source_module='teste', source_ref='1')

    # ── antes ───────────────────────────────────────────────────────────────

    def test_sem_certificacao_o_sistema_diz_que_nao_esta_certificado(self):
        r = self.client.get('/api/fiscal/certification/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertFalse(r.data['certified'],
                         'Diz-se certificado com o número 0000 — é o contrário.')

    # ── depois ──────────────────────────────────────────────────────────────

    def test_o_numero_entra_e_aparece_em_todos_os_sitios(self):
        apply_certification(cert='1234')

        # 1) O ECRÃ DA CERTIFICAÇÃO (Centro Fiscal).
        d = self.client.get('/api/fiscal/certification/').data
        self.assertTrue(d['certified'], 'Aplicou-se a certificação e o ecrã diz que não.')
        self.assertEqual(d['certificate_number'], '1234')

        # 2) A FICHA DO HOTEL — o dono vê-o aqui sem ir ao Centro Fiscal.
        d = self.client.get('/api/org/hotel-profile/').data
        self.assertEqual(d['certification']['certificate_number'], '1234')
        self.assertTrue(d['certification']['certified'])

        # 3) O CENTRO SAF-T, de onde sai o ficheiro para a AGT.
        d = self.client.get('/api/fiscal/saft/profiles/').data
        self.assertEqual(d['fiscal']['certificate_number'], '1234')
        self.assertTrue(d['fiscal']['certified'])

        # 4) O DIAGNÓSTICO que o suporte lê à distância, sem ir ao local.
        d = self.client.get('/api/support/diagnostics/').data
        self.assertIn('1234', str(d), 'O diagnóstico remoto não mostra a certificação.')

    def test_a_mencao_impressa_passa_a_levar_o_numero(self):
        """"Processado por programa validado n.º ____" — é esta a frase que a
        AGT exige no pé de cada documento."""
        antes = self._emitir()
        self.assertIn('0000', antes.print_mention,
                      'Sem certificação, a menção devia dizer 0000.')

        apply_certification(cert='1234')
        depois = self._emitir()
        self.assertIn('1234', depois.print_mention,
                      'A fatura nova continua a declarar o número antigo.')

    def test_o_codigo_qr_leva_o_mesmo_numero_que_o_papel(self):
        """O QR e a menção impressa são lidos por quem fiscaliza. Se
        discordarem, o documento contradiz-se a si próprio."""
        apply_certification(cert='1234')
        doc = self._emitir()
        qr = signing.build_qr_data(FiscalConfig.get(), doc)
        self.assertIn('P:1234', qr,
                      f'O QR não declara o mesmo número que o papel: {qr[:120]}')

    def test_o_que_ja_foi_impresso_nao_se_reescreve(self):
        """Uma fatura impressa é um papel que existe no mundo. O sistema pode
        mudar o que imprime a seguir; não o que já saiu."""
        antiga = self._emitir()
        mencao_original = antiga.print_mention

        apply_certification(cert='1234')
        antiga.refresh_from_db()
        self.assertEqual(antiga.print_mention, mencao_original,
                         'A certificação reescreveu a menção de um documento já emitido.')

    def test_certificar_passa_o_sistema_para_producao(self):
        """0000 é ambiente de testes por definição. Um número a sério significa
        que os documentos contam — e o ambiente tem de o dizer."""
        self.assertEqual(FiscalConfig.get().environment, 'TEST')
        apply_certification(cert='1234')
        self.assertEqual(FiscalConfig.get().environment, 'PROD')

    def test_um_par_de_chaves_mau_nao_destroi_o_que_estava_a_trabalhar(self):
        """ISTO ERA UM DEFEITO A SÉRIO, e foi este teste que o encontrou.

        As chaves novas eram gravadas em disco e SÓ DEPOIS testadas. Um par
        trocado, uma transferência truncada ou um copiar-colar que perdeu uma
        linha bastavam para escrever por cima das chaves boas — que não existiam
        em lado nenhum para repor. A partir daí o hotel não emitia uma única
        factura, e o erro tinha saído como um aviso de passagem no fim de uma
        sincronização com o PCC, quando ninguém olha para o lado fiscal.

        Agora o par é provado numa pasta à parte: se não assinar, nada muda.
        """
        signing.ensure_keys()
        boas = signing.PRIVATE_KEY_PATH.read_text()

        with self.assertRaises(ValueError):
            apply_certification(cert='1234',
                                private_key='-----BEGIN PRIVATE KEY-----\nlixo\n-----END PRIVATE KEY-----',
                                public_key='-----BEGIN PUBLIC KEY-----\nlixo\n-----END PUBLIC KEY-----')

        self.assertEqual(signing.PRIVATE_KEY_PATH.read_text(), boas,
                         'As chaves boas foram destruídas por um par que nem sequer assina.')
        # E o sistema continua a emitir — que é o que isto tudo protege.
        doc = self._emitir()
        self.assertTrue(doc.doc_hash and doc.doc_hash != '0',
                        'Ficou sem conseguir assinar documentos.')
