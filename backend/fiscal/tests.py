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


# ══════════════════════════════════════════════════════════════════════════════
#  O MOTOR FISCAL, ELEMENTO A ELEMENTO
#
#  Em Angola, um erro aqui não é um bug: é uma inspecção. Cada teste abaixo diz,
#  no nome e no comentário, o que a AGT veria se o defeito voltasse — receita
#  declarada a mais ou a menos, IVA errado, numeração com buracos, documentos
#  que não batem com o dinheiro.
# ══════════════════════════════════════════════════════════════════════════════
import io

from datetime import date, timedelta
from xml.etree import ElementTree as ET

from django.core.management import call_command
from django.test import TestCase

from fiscal import commercial, integration, saft, saft_profiles, services, tax_engine
from fiscal.models import (FiscalAuditLog, FiscalDocument, SubmissionQueue,
                           TaxExemptionReason, TaxRateVersion)
from fiscal.services import FiscalValidationError

NS = {'s': saft.NS}


class BaseMotorFiscal(TestCase):
    """Catálogo AGT completo (12 tipos de documento, taxas, isenções, séries A/2026)."""

    @classmethod
    def setUpTestData(cls):
        # Os comandos escrevem direto no stdout: desviado para não sujar os testes.
        call_command('seed_fiscal', verbosity=0, stdout=io.StringIO())
        call_command('seed_exemptions', verbosity=0, stdout=io.StringIO())

    def setUp(self):
        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.certificate_number = '147/AGT/2026'
        cfg.environment = 'TEST'      # nunca PROD nos testes: ver signing.ensure_keys
        cfg.save()
        signing.ensure_keys()

    # ── utilitários ──────────────────────────────────────────────────────────
    def serie(self, codigo='FR'):
        return FiscalSeries.objects.get(doc_type__code=codigo, code='A', year=2026)

    def emitir(self, tipo='FR', linhas=None, **kw):
        linhas = linhas if linhas is not None else [
            {'description': 'Jantar', 'quantity': 1, 'unit_price': Decimal('11400'),
             'tax_percentage': Decimal('14')}]
        return services.issue_document(self.serie(tipo).id, lines=linhas, **kw)


# ──────────────────────────────────────────────────────────────────────────────
# 1. TIPOS DE DOCUMENTO E SÉRIES
# ──────────────────────────────────────────────────────────────────────────────
class TiposDeDocumentoESeriesTests(BaseMotorFiscal):

    def test_o_catalogo_tem_todos_os_tipos_que_a_agt_exige(self):
        """Falta um tipo e o documento correspondente não se consegue emitir —
        a casa fica sem como facturar aquela operação (ou fá-lo "por fora")."""
        for codigo in ('FT', 'FR', 'FS', 'NC', 'ND', 'GR', 'GT', 'RC', 'PF', 'CM'):
            self.assertTrue(FiscalDocType.objects.filter(code=codigo, is_active=True).exists(),
                            f'O tipo de documento {codigo} não está no catálogo.')

    def test_cada_tipo_tem_serie_pronta_a_numerar(self):
        for codigo in ('FT', 'FR', 'FS', 'NC', 'ND', 'GR', 'GT', 'RC', 'PF', 'CM'):
            self.assertTrue(FiscalSeries.objects.filter(doc_type__code=codigo, is_active=True,
                                                        certified=True, is_closed=False).exists(),
                            f'Não há série activa e certificada para {codigo}.')

    def test_a_numeracao_e_sequencial_e_sem_buracos(self):
        """Um número que falta na sequência é a primeira coisa que a AGT procura:
        presume-se que o documento que faltava foi emitido e escondido."""
        numeros = [self.emitir().number for _ in range(5)]
        self.assertEqual(numeros, [1, 2, 3, 4, 5],
                         f'A numeração saltou números: {numeros}')
        self.assertEqual(self.serie('FR').current_number, 5)

    def test_uma_emissao_recusada_nao_queima_um_numero(self):
        """Se o número fosse reservado antes de validar, cada tentativa falhada
        deixava um buraco na sequência — e a sequência é o que se tem de explicar."""
        self.emitir()
        with self.assertRaises(FiscalValidationError):
            self.emitir(linhas=[])            # documento sem linhas
        doc = self.emitir()
        self.assertEqual(doc.number, 2, 'A tentativa falhada queimou um número.')

    def test_series_de_tipos_diferentes_numeram_independentemente(self):
        """FR A/1 e FT A/1 são documentos diferentes, cada um com a sua sequência."""
        self.assertEqual(self.emitir('FR').number, 1)
        self.assertEqual(self.emitir('FT', customer_name='Sonangol EP',
                                     customer_tax_id='5417000000').number, 1)

    def test_serie_fechada_nao_volta_a_numerar(self):
        """É assim que se muda de exercício sem partir a sequência: abre-se uma
        série nova e fecha-se a velha. Se a fechada continuasse a numerar, o ano
        novo começava a emitir com números do ano anterior."""
        s = self.serie('FR')
        s.is_closed = True
        s.save(update_fields=['is_closed'])
        with self.assertRaises(FiscalValidationError) as ctx:
            self.emitir()
        self.assertIn('FECHADA', str(ctx.exception).upper())

    def test_serie_nao_certificada_nao_emite(self):
        """Emitir numa série que a AGT não certificou é emitir um documento sem
        valor fiscal — o cliente leva um papel que não é factura."""
        s = self.serie('FR')
        s.certified = False
        s.save(update_fields=['certified'])
        with self.assertRaises(FiscalValidationError):
            self.emitir()

    def test_serie_inativa_nao_emite(self):
        s = self.serie('FR')
        s.is_active = False
        s.save(update_fields=['is_active'])
        with self.assertRaises(FiscalValidationError):
            self.emitir()

    def test_o_resolvedor_de_series_nunca_escolhe_uma_serie_fechada_ou_por_certificar(self):
        """O resolvedor é quem escolhe a série na emissão AUTOMÁTICA (a que dispara
        ao cobrar no POS). Se escolhesse uma série fechada ou não certificada, o
        erro só aparecia dentro da emissão, a meio de uma venda."""
        boa = self.serie('FR')
        boa.is_closed = True
        boa.save(update_fields=['is_closed'])
        self.assertIsNone(integration._resolve_series('FR'),
                          'O resolvedor escolheu a única série, que está fechada.')

        nova = FiscalSeries.objects.create(code='B', doc_type=boa.doc_type, year=2026,
                                           certified=True, is_active=True)
        self.assertEqual(integration._resolve_series('FR').id, nova.id)

    def test_o_resolvedor_prefere_a_serie_do_exercicio_mais_recente(self):
        """Uma série de 2025 deixada activa não pode roubar a numeração de 2026:
        o documento saía com o ano errado no número."""
        antiga = FiscalSeries.objects.create(code='A', doc_type=self.serie('FR').doc_type,
                                             year=2025, certified=True, is_active=True)
        escolhida = integration._resolve_series('FR')
        self.assertEqual(escolhida.year, 2026,
                         f'Escolheu a série de {escolhida.year} em vez da de 2026.')
        self.assertNotEqual(escolhida.id, antiga.id)

    def test_tipo_de_documento_inativo_nao_emite(self):
        t = FiscalDocType.objects.get(code='FR')
        t.is_active = False
        t.save(update_fields=['is_active'])
        with self.assertRaises(FiscalValidationError):
            self.emitir()


# ──────────────────────────────────────────────────────────────────────────────
# 2. EMISSÃO: ASSINATURA, ENCADEAMENTO, MENÇÃO E QR
# ──────────────────────────────────────────────────────────────────────────────
class AssinaturaEEncadeamentoTests(BaseMotorFiscal):

    def test_cada_documento_encadeia_no_anterior(self):
        """O hash de cada documento assina também o hash do anterior. É isto que
        impede apagar uma factura do meio: a cadeia parte-se e vê-se."""
        a, b, c = self.emitir(), self.emitir(), self.emitir()
        self.assertEqual(a.previous_hash, '', 'O primeiro documento da série já vem encadeado.')
        self.assertEqual(b.previous_hash, a.doc_hash)
        self.assertEqual(c.previous_hash, b.doc_hash)

    def test_a_cadeia_inteira_verifica(self):
        for _ in range(4):
            self.emitir()
        r = services.verify_chain(self.serie('FR').id)
        self.assertTrue(r['all_ok'], f"A cadeia da série não verifica: {r['documents']}")
        self.assertEqual(r['count'], 4)

    def test_mexer_no_total_de_um_documento_estraga_a_assinatura(self):
        """A assinatura cobre o total. Alguém que vá à base de dados baixar o valor
        de uma factura já emitida é apanhado aqui — e é para isto que a cadeia serve."""
        doc = self.emitir()
        FiscalDocument.objects.filter(pk=doc.pk).update(gross_total=Decimal('1.00'))
        r = services.verify_chain(self.serie('FR').id)
        self.assertFalse(r['all_ok'], 'Mudou-se o total e a assinatura continuou válida.')
        self.assertFalse(r['documents'][0]['signature_ok'])

    def test_apagar_um_documento_do_meio_parte_a_cadeia(self):
        """Se a cadeia não desse por isso, apagar uma venda da base de dados era
        um apagão silencioso de receita."""
        self.emitir()
        b = self.emitir()
        self.emitir()
        FiscalDocument.objects.filter(pk=b.pk).delete()
        r = services.verify_chain(self.serie('FR').id)
        self.assertFalse(r['all_ok'], 'Apagou-se um documento e a cadeia não deu por isso.')

    def test_a_mencao_impressa_leva_os_quatro_caracteres_do_hash(self):
        """A AGT exige, no pé do documento, 4 caracteres do hash nas posições
        1, 11, 21 e 31 — é o resumo que um fiscal confere à mão."""
        doc = self.emitir()
        esperado = '-'.join(doc.doc_hash[p] for p in (0, 10, 20, 30))
        self.assertTrue(doc.print_mention.startswith(esperado),
                        f'Menção errada: {doc.print_mention}')
        self.assertIn('147/AGT/2026', doc.print_mention)

    def test_o_qr_declara_exactamente_os_totais_do_documento(self):
        """O QR é lido por quem fiscaliza. Se declarar um total diferente do que
        está impresso, o documento contradiz-se a si próprio."""
        doc = self.emitir()
        qr = dict(p.split(':', 1) for p in doc.qr_data.split('|'))
        self.assertEqual(qr['H'], str(doc.net_total), 'Base tributável do QR errada.')
        self.assertEqual(qr['I'], str(doc.tax_total), 'Imposto do QR errado.')
        self.assertEqual(qr['N'], str(doc.gross_total), 'Total do QR errado.')
        self.assertEqual(qr['A'], '5000000000')
        self.assertEqual(qr['E'], 'N')

    def test_documento_sem_nif_do_cliente_leva_o_nif_generico_no_qr(self):
        """Consumidor final não tem NIF, mas o QR tem de levar um — o genérico."""
        doc = self.emitir()
        self.assertIn('B:999999999', doc.qr_data)
        self.assertEqual(doc.customer_name, 'Consumidor Final')

    def test_recibo_nao_e_assinado_e_a_mencao_di_lo(self):
        """O Recibo (RC) não é documento assinável no catálogo. Fingir uma
        assinatura num documento que a AGT não manda assinar é declarar uma
        conformidade que não existe."""
        doc = self.emitir('RC')
        self.assertEqual(doc.doc_hash, '0')
        self.assertIsNone(doc.qr_data)
        self.assertIn('Emitido por programa validado', doc.print_mention)

    def test_o_valor_por_extenso_acompanha_o_documento(self):
        """A AGT exige o valor por extenso. Em branco, é uma factura incompleta."""
        doc = self.emitir()
        self.assertTrue(doc.amount_in_words, 'O valor por extenso saiu vazio.')
        self.assertIn('kwanza', doc.amount_in_words.lower())

    def test_a_data_de_gravacao_fica_registada_e_nao_e_a_data_do_documento(self):
        """`system_entry_date` é a hora a sério da gravação e entra na assinatura:
        é o que impede antedatar uma factura sem deixar rasto."""
        ontem = date.today() - timedelta(days=1)
        doc = self.emitir(doc_date=ontem)
        self.assertEqual(doc.doc_date, ontem)
        self.assertEqual(doc.system_entry_date.date(), date.today())


# ──────────────────────────────────────────────────────────────────────────────
# 3. IVA, ISENÇÕES E MOTIVOS
# ──────────────────────────────────────────────────────────────────────────────
class IvaEIsencoesTests(BaseMotorFiscal):

    def test_preco_com_iva_incluido_nao_leva_iva_por_cima(self):
        """Na hotelaria angolana o preço de menu JÁ inclui IVA. Somá-lo por cima
        cobrava ao cliente 14% a mais do que o preço anunciado na carta."""
        doc = self.emitir()
        self.assertEqual(doc.gross_total, Decimal('11400.00'))
        self.assertEqual(doc.net_total, Decimal('10000.00'))
        self.assertEqual(doc.tax_total, Decimal('1400.00'))

    def test_preco_sem_iva_incluido_soma_o_imposto(self):
        doc = self.emitir(tax_inclusive=False, linhas=[
            {'description': 'Serviço', 'quantity': 1, 'unit_price': Decimal('10000'),
             'tax_percentage': Decimal('14')}])
        self.assertEqual(doc.net_total, Decimal('10000.00'))
        self.assertEqual(doc.tax_total, Decimal('1400.00'))
        self.assertEqual(doc.gross_total, Decimal('11400.00'))

    def test_o_iva_calcula_se_sobre_o_total_de_cada_taxa_e_nao_linha_a_linha(self):
        """REGRA DE ARREDONDAMENTO DA AGT: a incidência e o imposto saem do total
        agrupado por taxa, com UM arredondamento. Somar arredondamentos linha a
        linha dá cêntimos de diferença — e um total que não bate com o resumo de
        IVA impresso no próprio documento."""
        linhas = [{'description': f'Item {i}', 'quantity': 1,
                   'unit_price': Decimal('333.33'), 'tax_percentage': Decimal('14')}
                  for i in range(3)]
        doc = self.emitir(linhas=linhas)
        self.assertEqual(doc.gross_total, Decimal('999.99'))
        self.assertEqual(doc.net_total + doc.tax_total, doc.gross_total,
                         'Base + imposto não dá o total do documento.')

    def test_duas_taxas_no_mesmo_documento_somam_certo(self):
        doc = self.emitir(linhas=[
            {'description': 'Alojamento', 'quantity': 1, 'unit_price': Decimal('10500'),
             'tax_percentage': Decimal('5')},
            {'description': 'Bar', 'quantity': 1, 'unit_price': Decimal('11400'),
             'tax_percentage': Decimal('14')}])
        self.assertEqual(doc.net_total, Decimal('20000.00'))
        self.assertEqual(doc.tax_total, Decimal('1900.00'))
        self.assertEqual(doc.gross_total, Decimal('21900.00'))

    def test_uma_taxa_de_iva_impossivel_e_recusada(self):
        """120% de IVA não existe. Deixar passar era declarar imposto inventado."""
        with self.assertRaises(FiscalValidationError):
            self.emitir(linhas=[{'description': 'X', 'quantity': 1, 'unit_price': 100,
                                 'tax_percentage': 120}])

    def test_quantidade_e_preco_negativos_sao_recusados_numa_factura(self):
        """Uma linha negativa numa factura é uma nota de crédito disfarçada —
        reduz a receita declarada sem deixar o documento rectificativo que a lei
        exige para o fazer."""
        with self.assertRaises(FiscalValidationError):
            self.emitir(linhas=[{'description': 'X', 'quantity': -1, 'unit_price': 100,
                                 'tax_percentage': 14}])
        with self.assertRaises(FiscalValidationError):
            self.emitir(linhas=[{'description': 'X', 'quantity': 1, 'unit_price': -100,
                                 'tax_percentage': 14}])

    def test_linha_sem_descricao_e_recusada(self):
        with self.assertRaises(FiscalValidationError):
            self.emitir(linhas=[{'quantity': 1, 'unit_price': 100, 'tax_percentage': 14}])

    def test_uma_linha_isenta_leva_sempre_um_motivo(self):
        """Uma linha a 0% sem motivo de isenção é uma factura inválida: a AGT
        quer saber ao abrigo de que norma é que não se liquidou imposto."""
        doc = self.emitir(linhas=[{'description': 'Serviço isento', 'quantity': 1,
                                   'unit_price': Decimal('5000'), 'tax_percentage': 0}])
        linha = doc.lines.first()
        self.assertEqual(linha.tax_percentage, Decimal('0'))
        self.assertTrue(linha.exemption_reason, 'Linha isenta sem motivo de isenção.')

    def test_o_motivo_impresso_e_a_mencao_legal_e_nao_a_nota_interna(self):
        """A ficha da isenção tem DOIS textos: a menção legal que sai na factura
        (`text`) e a norma completa para consulta interna (`description`).
        Imprimia-se a nota interna: a factura do cliente — e o SAF-T — levavam um
        texto que não é o que a lei manda. E como a norma pode ter 400 caracteres
        num campo de 120, em PostgreSQL (produção) a emissão rebentava a meio;
        em SQLite passava em silêncio, por isso nunca se via a vir."""
        cfg = FiscalConfig.get()
        cfg.default_exemption_code = 'M09'
        cfg.save(update_fields=['default_exemption_code'])
        motivo = TaxExemptionReason.objects.get(code='M09')
        self.assertNotEqual(motivo.text, motivo.description,
                            'Este teste precisa de uma isenção com texto e norma diferentes.')

        doc = self.emitir(linhas=[{'description': 'Isento', 'quantity': 1,
                                   'unit_price': Decimal('1000'), 'tax_percentage': 0}])
        saiu = doc.lines.first().exemption_reason
        self.assertEqual(saiu, motivo.text,
                         f'Saiu na factura "{saiu}" em vez da menção legal "{motivo.text}".')
        self.assertLessEqual(len(saiu), 120,
                             'O motivo não cabe no campo — em produção isto não grava.')

    def test_o_motivo_indicado_na_linha_prevalece(self):
        doc = self.emitir(linhas=[{'description': 'Exportação', 'quantity': 1,
                                   'unit_price': 1000, 'tax_percentage': 0,
                                   'exemption_reason': 'Isento Artigo 13.º do CIVA'}])
        self.assertEqual(doc.lines.first().exemption_reason, 'Isento Artigo 13.º do CIVA')

    def test_a_taxa_de_marco_continua_a_ser_a_de_marco(self):
        """O IVA muda por lei. Uma factura de Março tem de continuar a recalcular-se
        com a taxa de Março — senão recalcular um documento antigo dava um imposto
        diferente do que foi liquidado e declarado."""
        taxa = TaxRate.objects.get(code='IVA14')
        TaxRateVersion.objects.create(tax_rate=taxa, valid_from=date(2024, 1, 1),
                                      valid_to=date(2026, 3, 31), percentage=Decimal('14'))
        TaxRateVersion.objects.create(tax_rate=taxa, valid_from=date(2026, 4, 1),
                                      percentage=Decimal('10'))
        self.assertEqual(taxa.rate_on(date(2026, 3, 15)), Decimal('14'))
        self.assertEqual(taxa.rate_on(date(2026, 5, 15)), Decimal('10'),
                         'A taxa nova não entrou em vigor na data certa.')

    def test_uma_taxa_isenta_do_catalogo_traz_o_motivo_consigo(self):
        pct, motivo = tax_engine.resolve({'tax_code': 'ISE'})
        self.assertEqual(pct, Decimal('0'))
        self.assertTrue(motivo, 'A taxa ISE resolveu sem motivo de isenção.')

    def test_linha_sem_taxa_indicada_usa_a_taxa_por_defeito(self):
        pct, motivo = tax_engine.resolve({'description': 'X'})
        self.assertEqual(pct, Decimal('14'), 'A taxa por defeito não é a taxa normal.')
        self.assertIsNone(motivo)


# ──────────────────────────────────────────────────────────────────────────────
# 4. NOTAS DE CRÉDITO E ANULAÇÕES — o que acontece ao total declarado
# ──────────────────────────────────────────────────────────────────────────────
class NotasDeCreditoEAnulacoesTests(BaseMotorFiscal):

    def _total_declarado(self):
        """(crédito − débito) das somas de controlo do SAF-T = o que a casa
        declara ter vendido no período."""
        xml = saft.generate_saft(date.today() - timedelta(days=1),
                                 date.today() + timedelta(days=1))
        sec = ET.fromstring(xml).find('.//s:SalesInvoices', NS)
        if sec is None:
            return Decimal('0')
        return (Decimal(sec.find('s:TotalCredit', NS).text)
                - Decimal(sec.find('s:TotalDebit', NS).text))

    def test_uma_factura_declara_a_sua_base_tributavel(self):
        self.emitir()
        self.assertEqual(self._total_declarado(), Decimal('10000.00'),
                         'O total declarado não é a base tributável da factura.')

    def test_um_documento_anulado_nao_conta_como_receita(self):
        """DEFEITO DA FAMÍLIA "receita declarada A MAIS".

        Um documento anulado fica no ficheiro (é o que prova que o número foi
        usado e não saltado) mas com <DocumentStatus>A</DocumentStatus> — e as
        somas de controlo deixam-no de fora. Antes somava como qualquer outro:
        um mês com anulações declarava à AGT mais vendas do que a casa fez, e
        pagava-se imposto sobre dinheiro que nunca entrou.
        """
        doc = self.emitir()
        services.void_document(doc.id, reason='Erro de lançamento')
        self.assertEqual(self._total_declarado(), Decimal('0'),
                         'Um documento anulado continua a contar como venda declarada.')
        # Mas continua no ficheiro — senão o número desaparecia da sequência.
        xml = saft.generate_saft(date.today() - timedelta(days=1),
                                 date.today() + timedelta(days=1))
        self.assertIn(doc.invoice_no, xml,
                      'O documento anulado desapareceu do SAF-T — a numeração '
                      'passa a ter um buraco.')

    def test_uma_nota_de_credito_anula_a_receita_da_factura_uma_vez_so(self):
        """DEFEITO DA FAMÍLIA "receita declarada A MENOS" — é o primo directo do
        consumo do hóspede declarado a dobrar, só ao contrário.

        Anular é dizer que o documento não teve efeito; creditar é emitir um
        documento novo que o reverte. FAZER AS DUAS COISAS reduzia a venda duas
        vezes: o original saía das somas (anulado) e a NC entrava a débito. A
        casa declarava menos vendas do que fez.
        """
        factura = self.emitir()
        nc = services.create_credit_note(factura.id, reason='Cliente devolveu')

        self.assertEqual(nc.doc_type.code, 'NC')
        self.assertEqual(nc.reference_doc, factura.invoice_no,
                         'A NC não diz que documento é que rectifica.')
        factura.refresh_from_db()
        self.assertEqual(factura.status, 'N',
                         'A factura ficou ANULADA e creditada — a venda é '
                         'descontada duas vezes.')
        self.assertTrue(factura.credited, 'Não ficou registado que a factura foi creditada.')
        self.assertEqual(self._total_declarado(), Decimal('0'),
                         'Factura + nota de crédito não deu zero no total declarado.')

    def test_a_factura_creditada_aparece_como_anulada_a_quem_olha_para_o_ecra(self):
        """No ficheiro para a AGT a factura continua NORMAL (teve efeito e foi
        rectificada). No ecrã, para o empregado, está anulada — na prática é a
        mesma coisa: já não se cobra."""
        factura = self.emitir()
        services.create_credit_note(factura.id)
        factura.refresh_from_db()
        self.assertEqual(factura.lifecycle_state, 'VOID')

    def test_nao_se_emitem_duas_notas_de_credito_para_a_mesma_factura(self):
        """Duas NC para a mesma factura descontam a venda duas vezes e deixam o
        cliente com um saldo a favor que nunca existiu."""
        factura = self.emitir()
        services.create_credit_note(factura.id)
        with self.assertRaises(ValueError):
            services.create_credit_note(factura.id)

    def test_a_nota_de_credito_chega_a_conta_corrente_do_cliente(self):
        """A conta corrente soma os documentos pelo CLIENTE: a dívida pelas
        facturas, o crédito pelas NC. Sem a ligação ao cliente, a NC nunca
        chegava lá — o cliente continuava a dever uma factura já anulada, e o
        limite de crédito dele ficava preso num valor que já não devia."""
        from mdm.models import Customer
        cliente = Customer.objects.create(name='Sonangol EP', tax_id='5417000000')
        factura = self.emitir('FT', customer=cliente, customer_name='Sonangol EP',
                              customer_tax_id='5417000000')
        self.assertFalse(factura.settled, 'Uma Factura (FT) nasce POR RECEBER.')
        nc = services.create_credit_note(factura.id)
        self.assertEqual(nc.customer_id, cliente.id,
                         'A nota de crédito não está ligada ao cliente — a conta '
                         'corrente dele fica a dever a factura anulada.')
        docs = list(FiscalDocument.objects.filter(customer=cliente).select_related('doc_type'))
        devido = sum((d.gross_total for d in docs
                      if not d.doc_type.is_rectifying and not d.settled), Decimal('0'))
        credito = sum((d.gross_total for d in docs if d.doc_type.is_rectifying), Decimal('0'))
        self.assertEqual(devido - credito, Decimal('0'),
                         'A conta corrente do cliente não ficou saldada depois da NC.')

    def test_a_nota_de_credito_copia_as_linhas_e_os_totais_do_original(self):
        """Uma NC que credite um valor diferente do facturado é dinheiro que
        aparece (ou desaparece) sem documento que o explique."""
        factura = self.emitir(linhas=[
            {'description': 'Alojamento', 'quantity': 2, 'unit_price': Decimal('10500'),
             'tax_percentage': Decimal('5')},
            {'description': 'Bar', 'quantity': 1, 'unit_price': Decimal('11400'),
             'tax_percentage': Decimal('14')}])
        nc = services.create_credit_note(factura.id)
        self.assertEqual(nc.gross_total, factura.gross_total)
        self.assertEqual(nc.net_total, factura.net_total)
        self.assertEqual(nc.tax_total, factura.tax_total)
        self.assertEqual(nc.lines.count(), factura.lines.count())

    def test_a_nota_de_credito_e_assinada_e_encadeada_como_qualquer_outra(self):
        nc = services.create_credit_note(self.emitir().id)
        self.assertTrue(nc.doc_hash and nc.doc_hash != '0', 'A NC saiu sem assinatura.')
        self.assertTrue(services.verify_chain(nc.series_id)['all_ok'])

    def test_uma_nota_de_credito_nao_se_anula_com_outra(self):
        nc = services.create_credit_note(self.emitir().id)
        with self.assertRaises(ValueError):
            services.create_credit_note(nc.id)

    def test_nao_se_credita_um_documento_ja_anulado(self):
        doc = self.emitir()
        services.void_document(doc.id)
        with self.assertRaises(ValueError):
            services.create_credit_note(doc.id)

    def test_anular_duas_vezes_nao_muda_nada(self):
        doc = self.emitir()
        services.void_document(doc.id, reason='primeira')
        services.void_document(doc.id, reason='segunda')
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'A')

    def test_anular_nao_apaga_nem_reescreve_o_documento(self):
        """Um documento fiscal não se apaga nem se edita: muda de estado. A
        assinatura e o encadeamento ficam intactos — é o que prova o que lá estava."""
        doc = self.emitir()
        hash_original, total_original = doc.doc_hash, doc.gross_total
        services.void_document(doc.id)
        doc.refresh_from_db()
        self.assertEqual(doc.doc_hash, hash_original)
        self.assertEqual(doc.gross_total, total_original)
        self.assertTrue(services.verify_chain(doc.series_id)['all_ok'],
                        'A anulação partiu a cadeia de hash.')

    def test_depois_de_uma_nc_a_venda_pode_voltar_a_ser_facturada(self):
        """Corrigir uma factura é NC + factura nova. Se a origem continuasse
        "já facturada", a correcção ficava impossível e a venda sem documento."""
        doc = self.emitir(source_module='pos', source_ref='555')
        self.assertEqual(integration.existing_for('pos', '555').id, doc.id)
        services.create_credit_note(doc.id)
        self.assertIsNone(integration.existing_for('pos', '555'),
                          'A venda corrigida por NC continua a contar como já facturada.')

    def test_uma_nota_de_debito_aumenta_o_que_se_declara(self):
        """A Nota de Débito é o contrário da de crédito: cobra o que faltou
        cobrar. Se fosse tratada como a NC, descontava a receita em vez de a somar."""
        self.emitir()
        services.issue_document(self.serie('ND').id, customer_name='Sonangol EP',
                                customer_tax_id='5417000000',
                                lines=[{'description': 'Acerto', 'quantity': 1,
                                        'unit_price': Decimal('1140'),
                                        'tax_percentage': Decimal('14')}])
        self.assertEqual(self._total_declarado(), Decimal('11000.00'),
                         'A nota de débito não somou ao total declarado.')

    def test_um_documento_rectificativo_exige_cliente_identificado(self):
        """Uma NC/ND anónima não se pode ligar a ninguém — nem à factura que
        corrige, nem à conta corrente de quem recebe o crédito."""
        with self.assertRaises(FiscalValidationError):
            services.issue_document(self.serie('NC').id, lines=[
                {'description': 'X', 'quantity': 1, 'unit_price': 100, 'tax_percentage': 14}])


# ──────────────────────────────────────────────────────────────────────────────
# 5. SAF-T — perfis, validação, conteúdo
# ──────────────────────────────────────────────────────────────────────────────
class SaftTests(BaseMotorFiscal):

    def setUp(self):
        super().setUp()
        self.factura = self.emitir(linhas=[
            {'description': 'Alojamento', 'quantity': 1, 'unit_price': Decimal('10500'),
             'tax_percentage': Decimal('5')},
            {'description': 'Bar', 'quantity': 2, 'unit_price': Decimal('5700'),
             'tax_percentage': Decimal('14')}])
        self.inicio = date.today() - timedelta(days=1)
        self.fim = date.today() + timedelta(days=1)
        self.xml = saft.generate_saft(self.inicio, self.fim)
        self.raiz = ET.fromstring(self.xml)

    def test_o_ficheiro_e_xml_valido_e_passa_a_validacao(self):
        r = saft_profiles.validate_xml(self.xml)
        self.assertTrue(r['valid'], f"SAF-T inválido: {r['problems']}")

    def test_o_cabecalho_identifica_a_empresa_e_o_certificado(self):
        """Um SAF-T sem NIF ou sem nº de certificado é recusado à entrada."""
        h = self.raiz.find('s:Header', NS)
        self.assertEqual(h.find('s:CompanyID', NS).text, '5000000000')
        self.assertEqual(h.find('s:SoftwareCertificateNumber', NS).text, '147/AGT/2026')

    def test_a_validacao_avisa_quando_o_certificado_ainda_e_0000(self):
        """0000 é "ainda não certificado". Um ficheiro assim não é aceite em
        produção — e é melhor sabê-lo antes de o entregar."""
        cfg = FiscalConfig.get()
        cfg.certificate_number = '0000'
        cfg.save(update_fields=['certificate_number'])
        r = saft_profiles.validate_xml(saft.generate_saft(self.inicio, self.fim))
        self.assertTrue(any('certificado' in p.lower() for p in r['problems']),
                        'O ficheiro saiu com certificado 0000 sem um único aviso.')

    def test_as_somas_de_controlo_batem_com_as_linhas_do_proprio_ficheiro(self):
        """DEFEITO: as somas de controlo declaravam o total COM IVA, enquanto as
        linhas levam o montante SEM imposto. O ficheiro contradizia-se a si
        próprio — a soma anunciada não existia lá dentro — e inflacionava as
        vendas do período pelo valor do próprio imposto."""
        sec = self.raiz.find('.//s:SalesInvoices', NS)
        declarado = Decimal(sec.find('s:TotalCredit', NS).text)
        soma_linhas = sum((Decimal(e.text) for e in sec.iter()
                           if e.tag.endswith('}CreditAmount')), Decimal('0'))
        self.assertEqual(declarado, soma_linhas,
                         f'TotalCredit {declarado} ≠ soma das linhas {soma_linhas}.')
        self.assertEqual(declarado, self.factura.net_total)

    def test_a_nota_de_credito_sai_a_debito_nas_linhas(self):
        """A soma de controlo <TotalDebit> é a soma dos <DebitAmount> das linhas.
        Com as linhas da NC em CreditAmount, o TotalDebit não correspondia a
        nenhum valor do ficheiro e o validador da AGT rejeita-o."""
        services.create_credit_note(self.factura.id)
        raiz = ET.fromstring(saft.generate_saft(self.inicio, self.fim))
        sec = raiz.find('.//s:SalesInvoices', NS)
        total_debito = Decimal(sec.find('s:TotalDebit', NS).text)
        soma_debitos = sum((Decimal(e.text) for e in sec.iter()
                            if e.tag.endswith('}DebitAmount')), Decimal('0'))
        self.assertEqual(total_debito, soma_debitos,
                         f'TotalDebit {total_debito} ≠ soma dos DebitAmount {soma_debitos}.')
        self.assertEqual(total_debito, self.factura.net_total)

    def test_o_ficheiro_leva_os_clientes_os_produtos_e_a_tabela_de_impostos(self):
        """Sem estas secções o ficheiro é recusado: a AGT quer ligar cada linha
        de factura a um produto do catálogo e a uma taxa declarada."""
        self.assertIsNotNone(self.raiz.find('.//s:Customer', NS), 'Falta a lista de clientes.')
        self.assertIsNotNone(self.raiz.find('.//s:Product', NS), 'Falta a lista de produtos.')
        tabela = self.raiz.find('.//s:TaxTable', NS)
        self.assertIsNotNone(tabela, 'Falta a <TaxTable> — a AGT rejeita o ficheiro.')
        taxas = {e.text for e in tabela.iter() if e.tag.endswith('}TaxPercentage')}
        self.assertEqual(taxas, {'5.00', '14.00'},
                         f'A tabela de impostos não declara as taxas usadas: {taxas}')

    def test_cada_taxa_usada_nas_linhas_esta_declarada_na_tabela(self):
        declaradas = {e.text for e in self.raiz.find('.//s:TaxTable', NS).iter()
                      if e.tag.endswith('}TaxPercentage')}
        nas_linhas = {e.text for e in self.raiz.findall('.//s:Line/s:Tax/s:TaxPercentage', NS)}
        self.assertTrue(nas_linhas <= declaradas,
                        f'Taxas usadas e não declaradas: {nas_linhas - declaradas}')

    def test_a_consulta_de_mesa_vai_para_documentos_de_conferencia(self):
        """A Consulta de Mesa (CM) não é factura: é um documento de conferência.
        Se fosse para SalesInvoices, cada "quanto é que vai a conta?" somava uma
        venda ao total declarado."""
        self.emitir('CM', linhas=[{'description': 'Conferência', 'quantity': 1,
                                   'unit_price': Decimal('1140'), 'tax_percentage': 14}])
        raiz = ET.fromstring(saft.generate_saft(self.inicio, self.fim))
        self.assertIsNotNone(raiz.find('.//s:WorkingDocuments', NS),
                             'A consulta de mesa não aparece como documento de conferência.')
        vendas = raiz.find('.//s:SalesInvoices', NS)
        self.assertEqual(Decimal(vendas.find('s:TotalCredit', NS).text),
                         self.factura.net_total,
                         'A consulta de mesa somou ao total de vendas declarado.')

    def test_o_ficheiro_so_leva_os_documentos_do_periodo_pedido(self):
        """Um SAF-T de Janeiro com facturas de Fevereiro declara receita em
        duplicado — a mesma venda vai nos dois ficheiros."""
        antiga = self.emitir(doc_date=date.today() - timedelta(days=60))
        xml = saft.generate_saft(self.inicio, self.fim)
        self.assertNotIn(antiga.invoice_no, xml,
                         'Entrou no ficheiro um documento fora do período.')

    def test_o_ficheiro_pode_restringir_se_a_um_modulo(self):
        """Um restaurante que só comunica o POS não pode mandar no mesmo ficheiro
        as facturas do alojamento."""
        pms = self.emitir(source_module='pms')
        pos = self.emitir(source_module='pos')
        xml = saft.generate_saft(self.inicio, self.fim, module='pos')
        self.assertIn(pos.invoice_no, xml)
        self.assertNotIn(pms.invoice_no, xml)

    def test_o_arquivo_de_um_so_documento_tambem_bate(self):
        raiz = ET.fromstring(saft.document_xml(self.factura))
        self.assertEqual(Decimal(raiz.find('.//s:TotalCredit', NS).text),
                         self.factura.net_total)

    def test_o_arquivo_de_um_documento_anulado_declara_zero(self):
        services.void_document(self.factura.id)
        self.factura.refresh_from_db()
        raiz = ET.fromstring(saft.document_xml(self.factura))
        self.assertEqual(Decimal(raiz.find('.//s:TotalCredit', NS).text), Decimal('0'),
                         'O arquivo de um documento anulado declara-o como venda.')

    def test_os_perfis_obrigatorios_estao_registados(self):
        self.assertIn('faturacao', saft_profiles.PROFILES)
        self.assertTrue(saft_profiles.PROFILES['faturacao']['required'],
                        'O perfil de faturação não está marcado como obrigatório.')
        for p in ('contabilidade', 'inventario', 'ativos'):
            self.assertIn(p, saft_profiles.PROFILES)

    def test_um_perfil_desconhecido_falha_de_forma_limpa(self):
        with self.assertRaises(ValueError):
            saft_profiles.generate('inventado', self.inicio, self.fim)

    def test_xml_mal_formado_e_apanhado_pela_validacao(self):
        r = saft_profiles.validate_xml('<AuditFile><Header>')
        self.assertFalse(r['valid'])
        self.assertTrue(any('mal formado' in p for p in r['problems']))

    def test_o_saft_de_contabilidade_sai_equilibrado(self):
        """As somas de controlo do ficheiro de contabilidade são o total a débito
        e a crédito dos lançamentos. Se não forem iguais, o ficheiro declara uma
        contabilidade que não salda."""
        from accounting.models import Account, Journal, JournalEntry, JournalEntryLine
        call_command('seed_accounting', verbosity=0, stdout=io.StringIO())
        e = JournalEntry.objects.create(
            number='SAFT01', journal=Journal.objects.get(code='VD'),
            entry_date=date.today(), description='Venda', source='POS', reference='T-1')
        JournalEntryLine.objects.create(entry=e, account=Account.objects.get(code='112'),
                                        debit=Decimal('11400'), credit=0)
        JournalEntryLine.objects.create(entry=e, account=Account.objects.get(code='622'),
                                        debit=0, credit=Decimal('10000'))
        JournalEntryLine.objects.create(entry=e, account=Account.objects.get(code='2431'),
                                        debit=0, credit=Decimal('1400'))
        e.post()

        raiz = ET.fromstring(saft_profiles.generate('contabilidade', self.inicio, self.fim))
        sec = raiz.find('.//s:GeneralLedgerEntries', NS)
        self.assertEqual(Decimal(sec.find('s:TotalDebit', NS).text),
                         Decimal(sec.find('s:TotalCredit', NS).text),
                         'O SAF-T de contabilidade não salda.')
        self.assertIsNotNone(raiz.find('.//s:GeneralLedgerAccounts', NS),
                             'O ficheiro vai sem plano de contas.')


# ──────────────────────────────────────────────────────────────────────────────
# 6. DOCUMENTOS COMERCIAIS E A CONVERSÃO EM FACTURA
# ──────────────────────────────────────────────────────────────────────────────
class DocumentosComerciaisTests(BaseMotorFiscal):

    def _criar(self, kind='PROFORMA'):
        return commercial.create_document(
            kind=kind, customer_name='Sonangol EP', customer_tax_id='5417000000',
            lines=[{'description': 'Alojamento 3 noites', 'quantity': 3,
                    'unit_price': Decimal('10500'), 'tax_percentage': Decimal('5')}],
            user='recepcao')

    def test_um_orcamento_nao_e_documento_fiscal(self):
        """Um orçamento não é uma venda: não se assina, não entra no SAF-T de
        faturação e não conta para a receita declarada. Se contasse, cada
        proposta que o cliente recusou era imposto a pagar."""
        doc = self._criar('BUDGET')
        self.assertEqual(doc.state, 'DRAFT')
        self.assertTrue(doc.number.startswith('ORC '))
        self.assertFalse(FiscalDocument.objects.exists(),
                         'Criar um orçamento emitiu um documento fiscal.')

    def test_a_numeracao_dos_comerciais_e_sequencial_por_tipo_e_ano(self):
        a, b = self._criar('PROFORMA'), self._criar('PROFORMA')
        c = self._criar('BUDGET')
        self.assertEqual((a.seq, b.seq), (1, 2))
        self.assertEqual(c.seq, 1, 'O orçamento herdou a numeração das proformas.')

    def test_os_totais_da_proforma_batem_com_a_factura_em_que_se_converte(self):
        """O cliente aprovou um valor. A factura tem de cobrar esse valor — se a
        conversão recalculasse por outro caminho, o cliente recebia uma factura
        diferente do que aceitou."""
        pf = self._criar()
        self.assertEqual(pf.gross_total, Decimal('31500.00'))
        factura = commercial.convert_to_invoice(pf.id, doc_type_code='FT', user='recepcao')
        self.assertEqual(factura.gross_total, pf.gross_total)
        self.assertEqual(factura.net_total, pf.net_total)
        self.assertEqual(factura.tax_total, pf.tax_total)

    def test_a_factura_da_conversao_e_assinada_e_aponta_para_a_origem(self):
        pf = self._criar()
        factura = commercial.convert_to_invoice(pf.id, doc_type_code='FT')
        self.assertTrue(factura.doc_hash and factura.doc_hash != '0')
        self.assertEqual(factura.source_module, 'commercial')
        self.assertEqual(factura.source_ref, pf.number)
        pf.refresh_from_db()
        self.assertEqual(pf.state, 'CONVERTED')
        self.assertEqual(pf.converted_to_id, factura.id)

    def test_converter_duas_vezes_nao_emite_duas_facturas(self):
        """DEFEITO DA FAMÍLIA "receita a mais": dois cliques em "Facturar" e a
        mesma proforma dava duas facturas reais, assinadas e irreversíveis — a
        mesma venda declarada duas vezes à AGT."""
        pf = self._criar()
        primeira = commercial.convert_to_invoice(pf.id, doc_type_code='FT')
        segunda = commercial.convert_to_invoice(pf.id, doc_type_code='FT')
        self.assertEqual(primeira.id, segunda.id,
                         'A segunda conversão emitiu uma factura nova.')
        self.assertEqual(FiscalDocument.objects.filter(doc_type__code='FT').count(), 1)

    def test_duplicar_um_comercial_da_um_numero_novo_e_nao_toca_no_original(self):
        pf = self._criar()
        copia = commercial.duplicate(pf.id, user='recepcao')
        self.assertNotEqual(copia.number, pf.number)
        self.assertEqual(copia.source_ref, pf.number)
        self.assertEqual(copia.gross_total, pf.gross_total)
        self.assertEqual(copia.state, 'DRAFT')

    def test_as_transicoes_de_estado_invalidas_sao_recusadas(self):
        """Um orçamento não salta de rascunho para "aceite pelo cliente" sem ter
        sido enviado: o histórico do documento deixava de fazer sentido."""
        pf = self._criar()
        with self.assertRaises(ValueError):
            commercial.transition(pf, 'ACCEPTED')
        commercial.transition(pf, 'SENT')
        commercial.transition(pf, 'ACCEPTED')
        self.assertEqual(pf.state, 'ACCEPTED')

    def test_um_comercial_so_se_edita_enquanto_e_rascunho(self):
        pf = self._criar()
        self.assertTrue(pf.editable)
        commercial.transition(pf, 'SENT')
        self.assertFalse(pf.editable, 'Um documento já enviado ao cliente ficou editável.')


# ──────────────────────────────────────────────────────────────────────────────
# 7. LIGAÇÃO À AGT (fila de submissão / factura electrónica)
# ──────────────────────────────────────────────────────────────────────────────
class LigacaoAgtTests(BaseMotorFiscal):

    def test_um_documento_de_serie_electronica_entra_na_fila_da_agt(self):
        """A venda nunca espera pela AGT: o documento é emitido e fica em fila
        (store-and-forward). Se não entrasse na fila, nunca era comunicado."""
        s = self.serie('FR')
        s.einvoice = True
        s.save(update_fields=['einvoice'])
        doc = self.emitir()
        self.assertTrue(SubmissionQueue.objects.filter(document=doc).exists(),
                        'O documento não entrou na fila de comunicação à AGT.')

    def test_uma_serie_sem_factura_electronica_nao_comunica_nada(self):
        """Uma série de testes ou de rascunhos não pode comunicar nada ao Estado."""
        s = self.serie('FR')
        s.einvoice = False
        s.save(update_fields=['einvoice'])
        doc = self.emitir()
        self.assertFalse(SubmissionQueue.objects.filter(document=doc).exists(),
                         'Uma série não electrónica comunicou o documento à AGT.')

    def test_a_falha_da_agt_nunca_impede_a_emissao(self):
        """Se a linha cair a meio de uma venda, a venda tem de sair. O documento
        fica em fila; o que não pode é o cliente ficar à porta sem factura."""
        from unittest import mock
        s = self.serie('FR')
        s.einvoice = True
        s.save(update_fields=['einvoice'])
        with mock.patch('fiscal.agt_client.enqueue', side_effect=RuntimeError('sem linha')):
            doc = self.emitir()
        self.assertIsNotNone(doc.id, 'A emissão falhou por causa da AGT.')
        self.assertTrue(FiscalAuditLog.objects.filter(event='AGT_ENQUEUE_FAIL').exists(),
                        'A falha de comunicação não ficou registada em lado nenhum.')

    def test_em_producao_sem_chave_certificada_nao_se_emite(self):
        """Auto-assinar em produção era declarar à AGT uma conformidade que não
        existe: a factura sairia assinada com uma chave que a AGT não conhece."""
        import shutil
        guardado = signing.ENGINE_DIR.parent / 'chaves-guardadas-teste'
        if guardado.exists():
            shutil.rmtree(guardado)
        shutil.move(str(signing.ENGINE_DIR), str(guardado))
        try:
            cfg = FiscalConfig.get()
            cfg.environment = 'PROD'
            cfg.save(update_fields=['environment'])
            with self.assertRaises(signing.ChaveFiscalEmFalta):
                self.emitir()
        finally:
            if signing.ENGINE_DIR.exists():
                shutil.rmtree(str(signing.ENGINE_DIR))
            shutil.move(str(guardado), str(signing.ENGINE_DIR))


# ──────────────────────────────────────────────────────────────────────────────
# 8. LIQUIDAÇÃO — vender não é receber
# ──────────────────────────────────────────────────────────────────────────────
class LiquidacaoTests(BaseMotorFiscal):

    def test_uma_factura_recibo_nasce_paga_e_uma_factura_nasce_por_receber(self):
        """É esta a diferença entre vender e receber — e é a conta corrente
        inteira. Uma Factura (FT) marcada como paga diz à AGT que se recebeu
        dinheiro que ainda não entrou, e deixa a conta corrente do cliente a
        zero quando ele ainda deve tudo."""
        fr = self.emitir('FR')
        self.assertTrue(fr.settled, 'A Factura-Recibo nasceu por receber.')
        self.assertIsNotNone(fr.settled_at)

        ft = self.emitir('FT', customer_name='Sonangol EP', customer_tax_id='5417000000')
        self.assertFalse(ft.settled, 'A Factura (FT) nasceu paga sem ninguém ter pago.')
        self.assertIsNone(ft.settled_at)

    def test_a_nota_de_credito_de_uma_factura_por_receber_nao_devolve_dinheiro(self):
        """Creditar uma factura que o cliente nunca pagou anula uma DÍVIDA; não
        devolve dinheiro nenhum. Marcá-la como liquidada era registar uma
        devolução de dinheiro que nunca saiu da caixa."""
        ft = self.emitir('FT', customer_name='Sonangol EP', customer_tax_id='5417000000')
        nc = services.create_credit_note(ft.id)
        self.assertFalse(nc.settled,
                         'A NC de uma factura por receber ficou marcada como paga — '
                         'é uma devolução de dinheiro que nunca saiu da caixa.')


# ──────────────────────────────────────────────────────────────────────────────
# 9. RENOVAÇÃO DA CHAVE DE ASSINATURA
# ──────────────────────────────────────────────────────────────────────────────
class RenovacaoDeChaveTests(BaseMotorFiscal):
    """O par de assinatura muda (certificação nova, chave comprometida) — e as
    facturas antigas continuam assinadas com a chave antiga."""

    def setUp(self):
        # As chaves vivem em DISCO, fora da base de dados: não voltam atrás no fim
        # de cada teste como as tabelas. Cada teste desta classe troca de chave, por
        # isso trabalha na sua própria pasta — senão um teste assinava com a chave
        # que o anterior deixou e a falha aparecia no teste errado.
        import tempfile
        from pathlib import Path
        self._pasta = tempfile.mkdtemp(prefix='chaves-teste-')
        self._original = (signing.ENGINE_DIR, signing.PRIVATE_KEY_PATH, signing.PUBLIC_KEY_PATH)
        signing.ENGINE_DIR = Path(self._pasta)
        signing.PRIVATE_KEY_PATH = signing.ENGINE_DIR / 'private.pem'
        signing.PUBLIC_KEY_PATH = signing.ENGINE_DIR / 'public.pem'
        super().setUp()

    def tearDown(self):
        import shutil
        signing.ENGINE_DIR, signing.PRIVATE_KEY_PATH, signing.PUBLIC_KEY_PATH = self._original
        shutil.rmtree(self._pasta, ignore_errors=True)
        super().tearDown()

    @staticmethod
    def _par_novo():
        from cryptography.hazmat.primitives import serialization as ser
        from cryptography.hazmat.primitives.asymmetric import rsa
        k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        priv = k.private_bytes(encoding=ser.Encoding.PEM,
                               format=ser.PrivateFormat.TraditionalOpenSSL,
                               encryption_algorithm=ser.NoEncryption()).decode()
        pub = k.public_key().public_bytes(
            encoding=ser.Encoding.PEM,
            format=ser.PublicFormat.SubjectPublicKeyInfo).decode()
        return priv, pub

    def test_as_facturas_antigas_continuam_a_verificar_depois_de_trocar_a_chave(self):
        """DEFEITO: a verificação usava SEMPRE a chave actual.

        Bastava o fabricante renovar o par de assinatura para a auditoria da
        cadeia passar a dar "assinatura inválida" em TODAS as facturas
        anteriores. Numa inspecção, uma assinatura inválida lê-se como documento
        adulterado — o sistema acusava-se a si próprio de uma falsificação que
        nunca houve, e não havia como provar o contrário (a chave antiga tinha
        sido escrita por cima).
        """
        antiga = self.emitir()
        self.assertTrue(services.verify_chain(self.serie('FR').id)['all_ok'])
        versao_antiga = antiga.key_version

        priv, pub = self._par_novo()
        apply_certification(cert='147/AGT/2026', private_key=priv, public_key=pub)
        self.assertEqual(FiscalConfig.get().key_version, versao_antiga + 1,
                         'A versão da chave não subiu com a renovação.')

        r = services.verify_chain(self.serie('FR').id)
        self.assertTrue(r['all_ok'],
                        f'Depois de renovar a chave, a factura antiga passou a '
                        f'aparecer como adulterada: {r["documents"]}')

    def test_a_chave_publica_de_cada_versao_fica_arquivada(self):
        """Sem o arquivo não há como verificar o que foi assinado antes — e um
        arquivo fiscal que não se pode verificar não serve de prova."""
        self.emitir()
        priv, pub = self._par_novo()
        apply_certification(private_key=priv, public_key=pub)
        self.assertTrue(signing.public_key_path(1).exists(),
                        'A chave pública da versão 1 não ficou arquivada.')

    def test_as_facturas_novas_assinam_com_a_chave_nova(self):
        priv, pub = self._par_novo()
        apply_certification(private_key=priv, public_key=pub)
        nova = self.emitir()
        self.assertEqual(nova.key_version, FiscalConfig.get().key_version)
        self.assertTrue(services.verify_chain(self.serie('FR').id)['all_ok'])
