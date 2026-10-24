# -*- coding: utf-8 -*-
"""IMPORTAR DE OUTRO SISTEMA — o cadastro de uma casa que já existe.

Um hotel que muda de sistema não começa vazio: já tem os artigos, os clientes e
as mesas, muitas vezes há anos. Este sistema sabia EXPORTAR qualquer grelha e
não sabia importar nada — e escrever mil artigos à mão não é uma tarefa, é um
motivo para não mudar de sistema.

O que estes testes garantem é o que torna uma importação utilizável por uma
pessoa que não é informática:

  · vê-se ANTES de gravar, e o que se vê é o que acontece;
  · o ficheiro vem como vier — ponto e vírgula ou vírgula, UTF-8 ou Windows,
    "1.234,56" ou "1234.56" — e o preço não muda por mil por causa disso;
  · uma linha má não trava as outras, mas fica dita com o NÚMERO DA LINHA;
  · correr o mesmo ficheiro outra vez não duplica nada.

Este último é o que separa uma importação de um acidente: ninguém acerta no
ficheiro à primeira. Corrige-se e repete-se — e um sistema que duplicasse a cada
tentativa era pior do que não ter importação nenhuma.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from core.importacao import ErroDeImportacao, importar, simular
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, UnitOfMeasure
from mdm.models import Customer
from pos.models import Outlet, POSTable


class CasaQueVemDeOutroSistema(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('importador', '', 'x')
        self.client.force_authenticate(self.user)
        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.',
                                         tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        ItemCategory.objects.create(name='Geral')
        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Restaurante', code='RST')


class ArtigosDeOutroSistemaTests(CasaQueVemDeOutroSistema):

    CSV = ('Codigo;Descricao;Preco;IVA;Ativo\n'
           'A001;Bife à Casa;8.500,00;14;Sim\n'
           'A002;Cerveja Cuca;1.200,00;14;Sim\n'
           'A003;Água 50cl;600,00;14;Nao\n')

    def test_primeiro_ve_se_o_que_ia_acontecer_e_nada_se_grava(self):
        """O passo que quem importa um cadastro a sério precisa de ter."""
        r = simular('artigos', self.CSV)
        self.assertEqual(r['criar'], 3)
        self.assertEqual(r['actualizar'], 0)
        self.assertEqual(r['recusadas'], [])
        self.assertEqual(Item.objects.count(), 0,
                         'A simulação gravou artigos — deixou de ser simulação.')

    def test_as_colunas_adivinham_se_pelos_nomes_que_os_sistemas_usam(self):
        """"Codigo", "Descricao", "Preco" — ninguém devia ter de explicar isto ao
        sistema. A pessoa confirma o palpite no ecrã; o que não pode é começar
        com tudo por mapear."""
        r = simular('artigos', self.CSV)
        self.assertEqual(r['colunas']['code'], 'Codigo')
        self.assertEqual(r['colunas']['name'], 'Descricao')
        self.assertEqual(r['colunas']['sale_price'], 'Preco')
        self.assertEqual(r['colunas']['tax_percentage'], 'IVA')

    def test_o_preco_portugues_nao_fica_mil_vezes_maior(self):
        """"8.500,00" são oito mil e quinhentos, não oito e meio. Ler o ponto como
        decimal (ou ignorá-lo) é vender o bife a 8,50 Kz a noite inteira."""
        importar('artigos', self.CSV)
        self.assertEqual(Item.objects.get(code='A001').sale_price, Decimal('8500.00'))

    def test_o_preco_ingles_tambem_se_le(self):
        r = importar('artigos', 'Codigo,Descricao,Preco\nX1,Gin Tónico,2500.50\n')
        self.assertEqual(r['criar'], 1)
        self.assertEqual(Item.objects.get(code='X1').sale_price, Decimal('2500.50'))

    def test_o_ficheiro_entra_e_os_artigos_ficam_utilizaveis(self):
        importar('artigos', self.CSV)
        self.assertEqual(Item.objects.count(), 3)
        bife = Item.objects.get(code='A001')
        self.assertEqual(bife.name, 'Bife à Casa')
        self.assertEqual(bife.tax_percentage, Decimal('14'))
        self.assertTrue(bife.is_active)
        self.assertFalse(Item.objects.get(code='A003').is_active, '"Nao" foi lido como ativo.')
        # A UNIDADE DE MEDIDA: o ficheiro de origem não a traz e o artigo não
        # existe sem ela. Sem isto, a importação rebentava no primeiro artigo.
        self.assertEqual(bife.base_uom_id, self.un.id)

    def test_importar_o_mesmo_ficheiro_outra_vez_nao_duplica(self):
        """Ninguém acerta no ficheiro à primeira. Corrige-se e repete-se."""
        importar('artigos', self.CSV)
        r = importar('artigos', self.CSV)
        self.assertEqual(Item.objects.count(), 3,
                         'A segunda importação duplicou o cadastro.')
        self.assertEqual(r['criar'], 0)
        self.assertEqual(r['actualizar'], 3)

    def test_a_segunda_importacao_actualiza_o_que_mudou(self):
        importar('artigos', self.CSV)
        importar('artigos', 'Codigo;Descricao;Preco\nA001;Bife à Casa;9.000,00\n')
        self.assertEqual(Item.objects.get(code='A001').sale_price, Decimal('9000.00'))

    def test_uma_linha_ma_nao_trava_as_outras_e_fica_dita_com_o_numero(self):
        """Num ficheiro de mil artigos há sempre vinte com um erro. Recusar tudo
        obriga a limpar às cegas; importar em silêncio esconde-os."""
        r = importar('artigos',
                     'Codigo;Descricao;Preco\n'
                     'B001;Vinho da Casa;2500\n'
                     ';Sem código nenhum;1000\n'
                     'B003;Gin;isto não é um preço\n')
        self.assertEqual(r['criar'], 1)
        self.assertEqual(len(r['recusadas']), 2)
        linhas = {x['linha'] for x in r['recusadas']}
        self.assertEqual(linhas, {3, 4},
                         f'Os números de linha não são os do ficheiro: {r["recusadas"]}')
        motivos = ' '.join(x['motivo'] for x in r['recusadas'])
        self.assertIn('Código', motivos)
        self.assertIn('Preço de venda', motivos)
        self.assertEqual(Item.objects.count(), 1, 'Uma linha má levou as boas atrás.')

    def test_o_mesmo_codigo_duas_vezes_no_ficheiro_e_recusado(self):
        """Uma das duas ia silenciosamente por cima da outra, e o cadastro ficava
        com o preço da linha que calhasse ser a última."""
        r = importar('artigos',
                     'Codigo;Descricao;Preco\nC1;Café;200\nC1;Café duplo;350\n')
        self.assertEqual(r['criar'], 1)
        self.assertEqual(len(r['recusadas']), 1)
        self.assertIn('mais do que uma vez', r['recusadas'][0]['motivo'])
        self.assertEqual(Item.objects.get(code='C1').sale_price, Decimal('200'))

    def test_um_ficheiro_vazio_explica_se(self):
        with self.assertRaises(ErroDeImportacao) as e:
            simular('artigos', 'Codigo;Descricao\n')
        self.assertIn('nenhuma linha', str(e.exception))

    def test_um_ficheiro_em_windows_1252_le_se(self):
        """O Excel em português exporta assim, e é o que a maior parte das casas tem."""
        bruto = 'Codigo;Descricao;Preco\nD1;Café com leite;350\n'.encode('cp1252')
        r = importar('artigos', bruto)
        self.assertEqual(r['criar'], 1)
        self.assertEqual(Item.objects.get(code='D1').name, 'Café com leite')


class EntidadesEMesasTests(CasaQueVemDeOutroSistema):

    def test_os_clientes_entram_com_o_nif(self):
        """Sem NIF não há factura a empresa — e é o campo que mais interessa
        trazer de um sistema antigo."""
        r = importar('entidades',
                     'Codigo;Nome;NIF;Telefone\n'
                     'E001;Sonangol EP;5417000000;923000000\n'
                     'E002;Ana Silva;5401234567;\n')
        self.assertEqual(r['criar'], 2)
        self.assertEqual(Customer.objects.get(code='E001').tax_id, '5417000000')

    def test_as_mesas_entram_no_ponto_de_venda(self):
        """Uma mesa tem de pertencer a um ponto de venda — é ele que decide onde
        ela serve."""
        r = importar('mesas', 'Mesa;Lugares\n1;4\n2;2\n3;6\n')
        self.assertEqual(r['criar'], 3)
        self.assertEqual(POSTable.objects.filter(outlet=self.outlet).count(), 3)
        self.assertEqual(POSTable.objects.get(table_number='3').seats, 6)

    def test_sem_ponto_de_venda_a_importacao_de_mesas_recusa_e_diz_onde_criar(self):
        POSTable.objects.all().delete()
        Outlet.objects.all().delete()
        with self.assertRaises(ErroDeImportacao) as e:
            importar('mesas', 'Mesa;Lugares\n1;4\n')
        self.assertIn('Pontos de Venda', str(e.exception))


class ImportarPelaApiTests(CasaQueVemDeOutroSistema):
    """O mesmo motor, pela porta que o ecrã usa."""

    def test_o_sistema_diz_o_que_se_pode_importar(self):
        r = self.client.get('/api/data/import/targets/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        chaves = {d['key'] for d in r.data}
        self.assertEqual(chaves, {'artigos', 'entidades', 'mesas'})
        artigos = [d for d in r.data if d['key'] == 'artigos'][0]
        obrig = {f['key'] for f in artigos['fields'] if f['required']}
        self.assertEqual(obrig, {'code', 'name'})

    def test_por_omissao_a_api_simula_e_nao_grava(self):
        r = self.client.post('/api/data/import/', {
            'target': 'artigos',
            'content': 'Codigo;Descricao;Preco\nZ1;Teste;100\n'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.data['criar'], 1)
        self.assertEqual(Item.objects.count(), 0,
                         'A API gravou sem ninguém ter mandado aplicar.')

    def test_com_apply_grava(self):
        r = self.client.post('/api/data/import/', {
            'target': 'artigos', 'apply': '1',
            'content': 'Codigo;Descricao;Preco\nZ1;Teste;100\n'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(Item.objects.count(), 1)

    def test_um_destino_que_nao_existe_explica_se(self):
        r = self.client.post('/api/data/import/', {
            'target': 'astronautas', 'content': 'a;b\n1;2\n'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('astronautas', str(r.data['detail']))

    def test_sem_ficheiro_pede_o_ficheiro(self):
        r = self.client.post('/api/data/import/', {'target': 'artigos'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ficheiro', str(r.data['detail']).lower())
