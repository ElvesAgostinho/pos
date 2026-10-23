# -*- coding: utf-8 -*-
"""OS FORNECEDORES — quem entrega, a que preço, e se cumpre.

O ESM é o lado do dinheiro que sai antes de entrar: o preço acordado que se usa
nas cotações, os documentos que não podem estar caducados (alvará, HACCP), e o
índice de desempenho com que se decide a quem comprar.

O índice de desempenho é o mais delicado: é um número de 0 a 100 que o dono olha
para escolher fornecedor. Se for calculado de duas maneiras diferentes — uma a
cada receção, outra quando se prime "Recalcular" — o mesmo fornecedor tem duas
notas, e a nota deixa de valer nada. É isso que estes testes prendem.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, UnitOfMeasure, Warehouse
from procurement.models import (GoodsReceipt, GoodsReceiptLine, PurchaseOrder,
                                PurchaseOrderLine)

from .models import (Supplier, SupplierCategory, SupplierContract,
                     SupplierDocument, SupplierPerformanceProfile,
                     SupplierProductCatalog, SupplierQualityControl)
from .services import compute_overall_score, recalculate_supplier_performance


class FornecedoresMontados(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('gestor_compras', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM', name='Armazém Central')

        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Bebidas')
        self.cerveja = Item.objects.create(code='B001', name='Cerveja Cuca', item_type='Retail',
                                           category=cat, base_uom=self.un)

        self.bebidas = SupplierCategory.objects.create(name='Bebidas')
        self.fornecedor = Supplier.objects.create(code='F001', commercial_name='Refriango, Lda.',
                                                  nif='5417000000', status='ACTIVE')
        self.hoje = timezone.localdate()

    # ---------------------------------------------------------------- utilidades
    def _encomenda(self, quantidade='100', entrega_prevista=0):
        """Encomenda com data de entrega prometida (dias a contar de hoje)."""
        po = PurchaseOrder.objects.create(
            po_number=f'OC-T{PurchaseOrder.objects.count() + 1:04d}', supplier=self.fornecedor,
            hotel=self.hotel, delivery_warehouse=self.armazem,
            expected_delivery_date=self.hoje + timedelta(days=entrega_prevista), status='Approved')
        PurchaseOrderLine.objects.create(purchase_order=po, item=self.cerveja,
                                         quantity_requested=Decimal(quantidade), uom=self.un,
                                         unit_price=Decimal('800.00'))
        return po

    def _receber(self, po, quantidade='100'):
        """Receção validada pela API (é a validação que mexe no desempenho)."""
        grn = GoodsReceipt.objects.create(
            receipt_number=f'GRN-T{GoodsReceipt.objects.count() + 1:04d}', purchase_order=po,
            supplier=self.fornecedor, delivery_warehouse=self.armazem)
        GoodsReceiptLine.objects.create(goods_receipt=grn, item=self.cerveja,
                                        quantity_received=Decimal(quantidade), uom=self.un,
                                        unit_cost=Decimal('800.00'),
                                        po_line=po.lines.first())
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/validate_receipt/', {},
                             format='json')
        self.assertEqual(r.status_code, 200, f'a validação falhou: {r.data}')
        grn.refresh_from_db()      # a validação mudou o estado na base de dados
        return grn

    def _perfil(self):
        p, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=self.fornecedor)
        p.refresh_from_db()
        return p


# ==========================================================================
# FICHA DO FORNECEDOR
# ==========================================================================
class FichaDoFornecedor(FornecedoresMontados):

    def test_criar_fornecedor_abre_logo_a_ficha_de_desempenho(self):
        """Sem perfil, o fornecedor não aparece nos quadros de desempenho — e um
        fornecedor que não se mede é um fornecedor que nunca se questiona."""
        novo = Supplier.objects.create(code='F999', commercial_name='Novo Fornecedor')
        self.assertTrue(SupplierPerformanceProfile.objects.filter(supplier=novo).exists(),
                        'O fornecedor novo ficou sem ficha de desempenho.')

    def test_fornecedor_novo_comeca_com_nota_maxima_e_em_avaliacao(self):
        """Começa-se por confiar (100) mas o estado diz "Em Avaliação": ainda não
        há histórico nenhum que justifique a nota."""
        novo = Supplier.objects.create(code='F998', commercial_name='Outro')
        self.assertEqual(novo.status, 'EVALUATION')
        self.assertEqual(novo.performance_profile.overall_score, 100)

    def test_nif_nao_se_repete_entre_fornecedores(self):
        """Dois fornecedores com o mesmo NIF são o mesmo fornecedor em duplicado —
        e a conta corrente passa a estar partida em dois."""
        r = self.client.post('/api/esm/suppliers/', {
            'code': 'F002', 'commercial_name': 'Cópia', 'nif': '5417000000'}, format='json')
        self.assertEqual(r.status_code, 400, 'Aceitou dois fornecedores com o mesmo NIF.')

    def test_codigo_nao_se_repete(self):
        r = self.client.post('/api/esm/suppliers/', {
            'code': 'F001', 'commercial_name': 'Outro qualquer'}, format='json')
        self.assertEqual(r.status_code, 400, 'Aceitou dois fornecedores com o mesmo código.')

    def test_pesquisa_encontra_pelo_nome_e_pelo_nif(self):
        """O ecrã de compras procura pelo nome que o comprador usa ao telefone."""
        r = self.client.get('/api/esm/suppliers/?search=Refriango')
        self.assertEqual(len(r.data), 1)
        r2 = self.client.get('/api/esm/suppliers/?search=5417000000')
        self.assertEqual(len(r2.data), 1, 'A pesquisa por NIF não encontrou o fornecedor.')

    def test_lista_filtra_por_estado(self):
        """Comprar a um fornecedor bloqueado é o que este filtro evita."""
        Supplier.objects.create(code='F003', commercial_name='Bloqueado', status='BLOCKED')
        r = self.client.get('/api/esm/suppliers/?status=BLOCKED')
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['commercial_name'], 'Bloqueado')


# ==========================================================================
# CATÁLOGO E PREÇOS ACORDADOS
# ==========================================================================
class CatalogoEPrecos(FornecedoresMontados):

    def test_preco_acordado_fica_guardado_por_fornecedor_e_artigo(self):
        """É este preço que as cotações usam. Se se perder, cada compra é negociada
        de novo e ninguém sabe se o preço subiu."""
        r = self.client.post('/api/esm/catalog/', {
            'supplier': self.fornecedor.id, 'item': self.cerveja.id,
            'supplier_item_code': 'RFG-CUCA-33', 'agreed_price': '750.0000',
            'vat_percentage': '14.00'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data['agreed_price']), Decimal('750.0000'))

    def test_o_mesmo_artigo_nao_pode_ter_dois_precos_no_mesmo_fornecedor(self):
        """Dois preços acordados para o mesmo artigo e a cotação escolhe um ao
        calhas — a diferença só se descobre na fatura."""
        SupplierProductCatalog.objects.create(supplier=self.fornecedor, item=self.cerveja,
                                              agreed_price=Decimal('750'))
        r = self.client.post('/api/esm/catalog/', {
            'supplier': self.fornecedor.id, 'item': self.cerveja.id,
            'agreed_price': '900.0000'}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Aceitou dois preços acordados para o mesmo artigo e fornecedor.')

    def test_catalogo_do_fornecedor_pode_ser_consultado_pela_ficha(self):
        SupplierProductCatalog.objects.create(supplier=self.fornecedor, item=self.cerveja,
                                              agreed_price=Decimal('750'))
        r = self.client.get(f'/api/esm/suppliers/{self.fornecedor.id}/catalog/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]['item_code'], 'B001')


# ==========================================================================
# DESEMPENHO DO FORNECEDOR — um só número, calculado de uma só maneira
# ==========================================================================
class DesempenhoDoFornecedor(FornecedoresMontados):

    def test_encomendar_conta_para_o_historico_do_fornecedor(self):
        self._encomenda()
        self.assertEqual(self._perfil().total_orders, 1,
                         'A encomenda não entrou no histórico do fornecedor.')

    def test_receber_conta_para_o_historico_do_fornecedor(self):
        po = self._encomenda()
        self._receber(po)
        self.assertEqual(self._perfil().total_grns, 1,
                         'A receção não entrou no histórico do fornecedor.')

    def test_entrega_a_tempo_mantem_a_pontualidade_no_maximo(self):
        po = self._encomenda(entrega_prevista=0)       # prometida para hoje
        self._receber(po)
        self.assertEqual(Decimal(self._perfil().punctuality_percentage), Decimal('100.00'),
                         'Uma entrega a tempo baixou a pontualidade do fornecedor.')

    def test_entrega_atrasada_baixa_a_pontualidade(self):
        """A entrega estava prometida para a semana passada e chegou hoje.

        Com uma única entrega, e essa atrasada, a pontualidade é 0% — é o que os
        factos dizem. O número tem de ser o mesmo quer venha do automático quer
        de premir "Recalcular" (ver o teste das duas contas, mais abaixo).
        """
        po = self._encomenda(entrega_prevista=-7)
        self._receber(po)
        self.assertEqual(Decimal(self._perfil().punctuality_percentage), Decimal('0.00'),
                         'Uma entrega com uma semana de atraso não baixou a pontualidade.')

    def test_entrega_incompleta_baixa_o_indice_de_completude(self):
        """Encomendaram-se 100 e entregaram 60: o fornecedor cumpriu 60%.
        É isto que distingue quem entrega tudo de quem entrega "o que tem"."""
        po = self._encomenda(quantidade='100')
        self._receber(po, quantidade='60')
        self.assertEqual(Decimal(self._perfil().completeness_percentage), Decimal('60.00'),
                         'A entrega incompleta não baixou o índice de completude.')

    def test_nota_global_pesa_pontualidade_e_completude_a_40_por_cento_cada(self):
        """A fórmula publicada: 40% pontualidade + 40% completude + 10% preço +
        10% devoluções. Um fornecedor pontual mas que entrega metade não pode ter
        a mesma nota de quem entrega tudo."""
        perfil = self._perfil()
        perfil.punctuality_percentage = Decimal('100')
        perfil.completeness_percentage = Decimal('50')
        perfil.price_variance_percentage = Decimal('0')
        perfil.return_rate_percentage = Decimal('0')
        self.assertEqual(compute_overall_score(perfil), 80,
                         'A nota global não respeita os pesos publicados.')

    def test_nota_global_nunca_sai_do_intervalo_de_zero_a_cem(self):
        """Uma nota de 112/100 (ou negativa) num quadro de fornecedores é um
        número que ninguém sabe ler."""
        perfil = self._perfil()
        perfil.punctuality_percentage = Decimal('100')
        perfil.completeness_percentage = Decimal('100')
        perfil.price_variance_percentage = Decimal('-200')   # dados estragados
        perfil.return_rate_percentage = Decimal('0')
        self.assertLessEqual(compute_overall_score(perfil), 100)
        perfil.punctuality_percentage = Decimal('-500')
        self.assertGreaterEqual(compute_overall_score(perfil), 0)

    def test_automatico_e_recalcular_dao_sempre_o_MESMO_numero(self):
        """O TESTE QUE IMPORTA NESTA APP.

        Havia DUAS contas diferentes para a mesma coisa: a automática (a cada
        receção) usava uma média alisada — uma entrega com uma semana de atraso
        baixava a pontualidade de 100 para 99 — e o botão "Recalcular" usava a
        proporção real, que para a mesma e única entrega atrasada dá 0.

        O mesmo fornecedor, com o mesmo histórico, tinha nota 97 no ecrã e 60
        depois de alguém premir "Recalcular". Com dois números para o mesmo facto,
        o índice de desempenho deixa de servir para decidir compras.
        """
        po = self._encomenda(quantidade='100', entrega_prevista=-7)
        self._receber(po, quantidade='60')
        automatico = self._perfil()
        antes = (Decimal(automatico.punctuality_percentage),
                 Decimal(automatico.completeness_percentage),
                 automatico.overall_score)

        recalculado = recalculate_supplier_performance(self.fornecedor)
        depois = (Decimal(recalculado.punctuality_percentage),
                  Decimal(recalculado.completeness_percentage),
                  recalculado.overall_score)
        self.assertEqual(antes, depois,
                         f'O desempenho automático {antes} não é o mesmo que o recalculado '
                         f'{depois} — o mesmo fornecedor tem duas notas diferentes.')

    def test_gravar_a_recepcao_outra_vez_nao_conta_a_entrega_a_dobrar(self):
        """Qualquer gravação da receção já validada (acrescentar o nº da fatura do
        fornecedor, por exemplo) voltava a somar +1 às receções do fornecedor.

        O histórico inflacionava-se sozinho: 3 receções a dizerem 7, e as médias
        calculadas sobre entregas que nunca existiram.
        """
        po = self._encomenda()
        grn = self._receber(po)
        self.assertEqual(self._perfil().total_grns, 1)
        grn.supplier_invoice_ref = 'FT 2026/4455'
        grn.save()
        self.assertEqual(self._perfil().total_grns, 1,
                         'Gravar a receção outra vez contou a entrega a dobrar.')

    def test_recepcao_anulada_deixa_de_contar_para_o_desempenho(self):
        """Uma entrega que não existiu não pode dar nem crédito nem castigo ao
        fornecedor — senão anular uma receção lançada por erro deixava a nota do
        fornecedor manchada para sempre."""
        po = self._encomenda(entrega_prevista=-7)       # entrega atrasada
        grn = self._receber(po)
        self.assertEqual(Decimal(self._perfil().punctuality_percentage), Decimal('0.00'))

        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        perfil = self._perfil()
        self.assertEqual(perfil.total_grns, 0,
                         'A receção anulada continua a contar no histórico do fornecedor.')
        self.assertEqual(Decimal(perfil.punctuality_percentage), Decimal('100.00'),
                         'A nota do fornecedor ficou manchada por uma receção anulada.')

    def test_recalcular_pela_api_devolve_o_perfil_actualizado(self):
        """É o botão "Recalcular" do backoffice."""
        po = self._encomenda(entrega_prevista=-3)
        self._receber(po)
        r = self.client.post(f'/api/esm/suppliers/{self.fornecedor.id}/performance/', {},
                             format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['total_grns'], 1)
        self.assertEqual(r.data['supplier_name'], 'Refriango, Lda.')

    def test_duas_entregas_uma_a_tempo_e_outra_atrasada_dao_cinquenta_por_cento(self):
        """Metade das entregas a horas = 50% de pontualidade. É a conta que uma
        pessoa faz de cabeça, e é a que o sistema tem de dar."""
        self._receber(self._encomenda(entrega_prevista=0))
        self._receber(self._encomenda(entrega_prevista=-5))
        self.assertEqual(Decimal(self._perfil().punctuality_percentage), Decimal('50.00'),
                         'Com uma entrega a horas e outra atrasada, a pontualidade não é 50%.')


# ==========================================================================
# DOCUMENTOS, CONTRATOS E QUALIDADE
# ==========================================================================
class DocumentosEContratos(FornecedoresMontados):

    def test_documento_caducado_e_contado_a_parte(self):
        """Comprar carne a um fornecedor com o HACCP caducado é um risco sanitário
        e legal. O painel tem de o dizer antes da próxima encomenda."""
        SupplierDocument.objects.create(supplier=self.fornecedor, document_type='CERTIFICATE',
                                        title='HACCP', expiration_date=self.hoje - timedelta(days=1))
        r = self.client.get('/api/esm/suppliers/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['expired_documents'], 1,
                         'Um certificado caducado não aparece no painel.')

    def test_documento_a_caducar_nos_proximos_30_dias_aparece_na_lista(self):
        """Avisar antes de caducar é o que permite pedir a renovação a tempo."""
        SupplierDocument.objects.create(supplier=self.fornecedor, document_type='PERMIT',
                                        title='Alvará', expiration_date=self.hoje + timedelta(days=10))
        r = self.client.get('/api/esm/suppliers/dashboard/')
        titulos = [d['title'] for d in r.data['expiring_documents']]
        self.assertIn('Alvará', titulos)

    def test_documento_com_validade_longe_nao_enche_o_painel(self):
        SupplierDocument.objects.create(supplier=self.fornecedor, document_type='LICENSE',
                                        title='Licença', expiration_date=self.hoje + timedelta(days=300))
        r = self.client.get('/api/esm/suppliers/dashboard/')
        self.assertEqual(r.data['expiring_documents'], [])
        self.assertEqual(r.data['expired_documents'], 0)

    def test_contrato_a_terminar_aparece_no_painel(self):
        """Um contrato que termina sem ninguém saber é uma renegociação perdida —
        e, até assinar, compra-se sem desconto."""
        SupplierContract.objects.create(supplier=self.fornecedor, reference='CT-2026/1',
                                        start_date=self.hoje - timedelta(days=300),
                                        end_date=self.hoje + timedelta(days=20),
                                        base_discount_percentage=Decimal('5.00'))
        r = self.client.get('/api/esm/suppliers/dashboard/')
        refs = [c['reference'] for c in r.data['expiring_contracts']]
        self.assertIn('CT-2026/1', refs)

    def test_painel_conta_fornecedores_por_estado_e_por_origem(self):
        Supplier.objects.create(code='F010', commercial_name='Bloqueado', status='BLOCKED')
        Supplier.objects.create(code='F011', commercial_name='Importador', country='Portugal')
        r = self.client.get('/api/esm/suppliers/dashboard/')
        self.assertEqual(r.data['total_suppliers'], 3)
        self.assertEqual(r.data['active'], 1)
        self.assertEqual(r.data['blocked'], 1)
        self.assertEqual(r.data['local'], 2, 'A contagem de fornecedores locais está errada.')
        self.assertEqual(r.data['international'], 1)

    def test_painel_mostra_os_melhores_fornecedores_por_nota(self):
        fraco = Supplier.objects.create(code='F020', commercial_name='Fraco')
        fraco.performance_profile.overall_score = 40
        fraco.performance_profile.save()
        r = self.client.get('/api/esm/suppliers/dashboard/')
        self.assertEqual(r.data['top_suppliers'][0]['commercial_name'], 'Refriango, Lda.',
                         'O quadro dos melhores fornecedores não está ordenado pela nota.')

    def test_exigencias_de_qualidade_ficam_registadas(self):
        """Cadeia de frio e HACCP não são notas soltas: decidem se se pode receber
        a mercadoria no cais."""
        cq = SupplierQualityControl.objects.create(supplier=self.fornecedor, requires_haccp=True,
                                                  requires_cold_chain=True,
                                                  required_temperature='-18°C')
        r = self.client.get(f'/api/esm/quality-controls/?supplier={self.fornecedor.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertTrue(r.data[0]['requires_cold_chain'])
        self.assertEqual(cq.required_temperature, '-18°C')
