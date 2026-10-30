# -*- coding: utf-8 -*-
"""AS RESTRIÇÕES PARCIAIS TÊM DE VALER NOS TRÊS MOTORES.

O sistema instala-se em SQLite (a maioria das casas), PostgreSQL ou SQL Server
— o instalador oferece os três. O mesmo código, a mesma base de dados lógica, e
as mesmas garantias.

O que motivou estes testes: uma restrição única PARCIAL (`UniqueConstraint` com
`condition=`) escrita com `~Q(...)` vira `NOT ([coluna] = 'valor')`. O
PostgreSQL e o SQLite aceitam; **o SQL Server recusa `NOT` no predicado de um
índice filtrado**, e recusa-o no parser — a migração nem chega a correr. Ou
seja: a mesma regra instalava-se em dois motores e no terceiro a instalação
parava a meio.

A correcção foi reescrever as condições na forma que os três aceitam (`<>` via
`__ne`, e `> ''` em vez de "não é nulo E não é vazio"). Estes testes provam as
duas coisas que importam:

  1. **A REGRA CONTINUA A VALER.** Reescrever uma condição é fácil de fazer mal:
     um `> ''` a mais ou a menos e a restrição deixa de travar o que travava, ou
     passa a travar o que não devia. Aqui tenta-se mesmo gravar o duplicado.
  2. **NENHUMA CONDIÇÃO VOLTA A USAR `NOT`.** A varredura percorre as
     restrições de TODOS os modelos: uma nova escrita com `~Q(...)` torna este
     teste vermelho aqui, e não na instalação do cliente.

Correm em qualquer motor — é o motor configurado que os executa. Em SQLite
provam a regra; apontados a um SQL Server provam que ela lá está também.
"""
from django.apps import apps
from django.db import IntegrityError, connection, transaction
from django.db.models import Q
from django.test import TestCase


def _tem_not(q):
    """Esta condição escreve `NOT (...)` em SQL?"""
    if not isinstance(q, Q):
        return False
    if getattr(q, 'negated', False):
        return True
    return any(_tem_not(filho) for filho in q.children)


class NenhumaCondicaoUsaNotTests(TestCase):
    """A varredura — apanha a próxima antes de ela chegar a um cliente."""

    def test_nenhuma_restricao_parcial_do_sistema_usa_NOT(self):
        culpadas = []
        for modelo in apps.get_models():
            for r in (modelo._meta.constraints or []):
                cond = getattr(r, 'condition', None)
                if cond is not None and _tem_not(cond):
                    culpadas.append(f'{modelo._meta.label}.{r.name}')
        self.assertEqual(culpadas, [],
                         f'Estas restrições usam `~Q(...)`, que vira `NOT (...)` no '
                         f'filtro do índice — o SQL Server recusa-o e a instalação pára '
                         f'a meio: {culpadas}. Escreva `__ne` (dá `<>`) ou `__gt=""` '
                         f'(dá `> ""`), que os três motores aceitam. Ver core/lookups.py.')

    def test_o_lookup_ne_esta_registado(self):
        """Sem ele, `charge_type__ne='FNB'` rebenta com FieldError na migração."""
        from django.db.models import CharField
        self.assertIn('ne', CharField.get_lookups(),
                      'O lookup `__ne` não está registado — ver core/apps.py (ready).')

    def test_o_ne_escreve_diferente_e_nao_uma_negacao(self):
        """A razão de existir: a forma do SQL. Se voltar a sair `NOT`, o SQL
        Server volta a recusar."""
        from pms.models import FolioCharge
        sql = str(FolioCharge.objects.filter(charge_type__ne='FNB').query)
        self.assertIn('<>', sql, f'O `__ne` deixou de escrever `<>`: {sql[-160:]}')
        self.assertNotIn('NOT (', sql.upper().replace('NOT NULL', ''),
                         'O `__ne` voltou a escrever uma negação.')


class AsRegrasContinuamAValerTests(TestCase):
    """Reescrever a condição não pode ter mudado o que ela trava."""

    def _doc(self, serie, numero):
        from pos.models import StockDoc
        import datetime
        return StockDoc.objects.create(series=serie, number=numero,
                                       warehouse=self.armazem,
                                       doc_date=datetime.date.today())

    def setUp(self):
        from identity.models import Company, EnterpriseGroup, Hotel
        from inventory.models import Warehouse
        from pos.models import StockDocSeries
        grupo = EnterpriseGroup.objects.create(name='Grupo Mwana')
        empresa = Company.objects.create(group=grupo, name='Mwana, Lda.',
                                         tax_id='5000000000')
        hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=hotel, code='ARM',
                                                name='Armazém', is_main=True)
        self.serie = StockDocSeries.objects.create(code='CMP', name='Compras',
                                                   kind='STOCK', nature='PAYABLE')

    def test_dois_documentos_com_o_mesmo_numero_na_serie_sao_recusados(self):
        """A regra: o número é único DENTRO da série. É o que impede duas
        compras com o mesmo número — e duas entradas do mesmo stock."""
        self._doc(self.serie, 'FT-100')
        with self.assertRaises(IntegrityError,
                               msg='A série aceitou dois documentos com o número FT-100.'):
            with transaction.atomic():
                self._doc(self.serie, 'FT-100')

    def test_a_restricao_e_PARCIAL_e_nao_trava_um_numero_vazio(self):
        """A OUTRA METADE, e a razão de a restrição ser parcial.

        `WHERE number > ''` deixa de fora as linhas sem número. Se a condição
        tivesse sido mal reescrita — se o `> ''` tivesse ficado a abranger
        tudo — dois documentos sem número passavam a colidir entre si.

        Grava-se por baixo do modelo (`QuerySet.update`), e é de propósito: o
        `save()` do StockDoc ATRIBUI um número quando ele vem vazio (é ele que
        tranca a série e numera), por isso um documento sem número não se
        consegue criar pela porta da frente. O que se está a provar aqui é a
        condição do ÍNDICE, não o caminho da aplicação — e é no índice que os
        três motores divergiam.
        """
        from pos.models import StockDoc
        a = self._doc(self.serie, 'FT-200')
        b = self._doc(self.serie, 'FT-201')
        StockDoc.objects.filter(pk__in=[a.pk, b.pk]).update(number='')
        self.assertEqual(StockDoc.objects.filter(series=self.serie, number='').count(), 2,
                         'A restrição recusou duas linhas SEM número — e devia ignorá-las, '
                         'que é o que a torna parcial.')

    def test_o_numero_e_atribuido_pela_serie_e_nao_fica_vazio(self):
        """E por isso é que a metade de cima quase nunca se vê na prática: quem
        numera é a série, dentro de uma transação, e o documento nasce sempre
        com número. A restrição é a rede para a corrida — duas gravações em
        paralelo a lerem o mesmo `current_number`."""
        d = self._doc(self.serie, '')
        self.assertTrue(d.number, 'O documento ficou sem número.')
        self.assertTrue(d.number.startswith(self.serie.code),
                        f'O número "{d.number}" não vem da série "{self.serie.code}".')

    def test_o_indice_parcial_existe_mesmo_na_base(self):
        """Prova que a restrição chegou à base de dados — e não ficou só no
        modelo. É aqui que a diferença entre motores aparecia."""
        from pos.models import StockDoc
        with connection.cursor() as cursor:
            nomes = connection.introspection.get_constraints(
                cursor, StockDoc._meta.db_table)
        indices = [n for n, d in nomes.items()
                   if d.get('unique') and 'stockdoc_numero_unico' in n]
        self.assertTrue(indices,
                        f'A restrição `stockdoc_numero_unico_na_serie` não está na base '
                        f'({connection.vendor}). As que lá estão: {sorted(nomes)[:12]}')
