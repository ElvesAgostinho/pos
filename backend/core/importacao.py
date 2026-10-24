# -*- coding: utf-8 -*-
"""IMPORTAR DE OUTRO SISTEMA — o primeiro dia de quem vem de outro lado.

Um hotel que muda de sistema não começa com uma casa vazia: já tem os artigos,
os clientes e as mesas, muitas vezes há anos. Escrever mil artigos à mão não é
uma tarefa, é um motivo para não mudar — e era o que este sistema pedia, porque
sabia EXPORTAR (qualquer grelha dá CSV e Excel pelo ribbon) e não sabia IMPORTAR
nada.

Isto é o motor dessa importação. Três decisões explicam tudo o resto:

**PRIMEIRO VÊ-SE, SÓ DEPOIS SE GRAVA.** Toda a importação começa por uma
simulação completa (`simular`), que corre as mesmas validações da gravação e
devolve, linha a linha, o que ia acontecer: quantos criam, quantos actualizam,
quais ficam de fora e PORQUÊ. Quem está a importar o cadastro de um hotel a
sério precisa de ver isso antes de carregar no botão — e precisa de poder
corrigir o ficheiro e repetir.

**A LINHA MÁ NÃO TRAVA O FICHEIRO, MAS FICA DITA.** Num ficheiro de mil artigos
há sempre vinte com uma vírgula a mais ou um preço vazio. Recusar o ficheiro
todo por causa deles obriga a limpar às cegas; importar em silêncio esconde-os.
Importa-se o que está bom, e devolve-se a lista do que ficou de fora, com o
NÚMERO DA LINHA do ficheiro original — que é por onde a pessoa procura.

**IMPORTAR DUAS VEZES NÃO DUPLICA.** A chave é o CÓDIGO do registo. Correr o
mesmo ficheiro outra vez actualiza o que mudou e cria o que falta. Quem importa
um cadastro grande fá-lo sempre mais do que uma vez — corrige o ficheiro e
repete — e um sistema que duplicasse a cada tentativa seria pior do que nenhum.

Os nomes das colunas não se adivinham: cada sistema chama-lhes o que quer. Por
isso há um MAPA (`colunas`) que diz qual coluna do ficheiro alimenta qual campo,
e um palpite automático para os nomes mais comuns (`adivinhar_colunas`), que a
pessoa confirma ou corrige no ecrã.
"""
import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction

# ──────────────────────────────────────────────────────────────────────────
# O QUE SE PODE IMPORTAR
# ──────────────────────────────────────────────────────────────────────────
# Cada destino diz: o modelo, a chave que identifica o registo, os campos que
# aceita, quais são obrigatórios, e como se converte cada um. Acrescentar um
# destino novo é acrescentar uma entrada aqui — não é mexer no motor.


def _texto(v):
    return (str(v).strip() if v is not None else '')


def _decimal(v):
    t = _texto(v).replace(' ', '').replace('\xa0', '')
    if not t:
        return None
    # "1.234,56" (português) e "1234.56" (inglês) são ambos legítimos num
    # ficheiro exportado por outro sistema — e confundi-los muda o preço por mil.
    if ',' in t and '.' in t:
        t = t.replace('.', '').replace(',', '.') if t.rindex(',') > t.rindex('.') \
            else t.replace(',', '')
    elif ',' in t:
        t = t.replace(',', '.')
    try:
        return Decimal(t)
    except InvalidOperation:
        raise ValueError(f'"{v}" não é um número')


def _inteiro(v):
    d = _decimal(v)
    return int(d) if d is not None else None


def _booleano(v):
    t = _texto(v).lower()
    if t in ('1', 'sim', 's', 'true', 'verdadeiro', 'yes', 'y', 'x', 'ativo', 'activo'):
        return True
    if t in ('0', 'nao', 'não', 'n', 'false', 'falso', 'no', 'inativo', 'inactivo'):
        return False
    return None


DESTINOS = {
    'artigos': {
        'nome': 'Artigos',
        'modelo': ('inventory.models', 'Item'),
        'chave': 'code',
        'obrigatorios': ['code', 'name'],
        'campos': {
            'code': ('Código', _texto),
            'name': ('Descrição', _texto),
            'sale_price': ('Preço de venda', _decimal),
            'purchase_price': ('Preço de compra', _decimal),
            'tax_percentage': ('IVA (%)', _decimal),
            'barcode': ('Código de barras', _texto),
            'item_type': ('Tipo de artigo', _texto),
            'is_active': ('Ativo', _booleano),
            'shelf_life_days': ('Validade (dias)', _inteiro),
        },
        # O artigo exige uma unidade de medida que o ficheiro de outro sistema
        # quase nunca traz. Usa-se a que estiver marcada por omissão na casa; sem
        # nenhuma cadastrada, a importação recusa-se e diz onde se cria.
        'preencher': 'artigo_preenche',
    },
    'entidades': {
        'nome': 'Clientes e Fornecedores',
        'modelo': ('mdm.models', 'Customer'),
        'chave': 'code',
        'obrigatorios': ['code', 'name'],
        'campos': {
            'code': ('Código', _texto),
            'name': ('Nome', _texto),
            'tax_id': ('NIF', _texto),
            'email': ('Email', _texto),
            'phone': ('Telefone', _texto),
            'address': ('Morada', _texto),
            'credit_limit': ('Limite de crédito', _decimal),
            'is_active': ('Ativo', _booleano),
        },
    },
    'mesas': {
        'nome': 'Mesas',
        'modelo': ('pos.models', 'POSTable'),
        'chave': 'table_number',
        'obrigatorios': ['table_number'],
        'campos': {
            'table_number': ('Número da mesa', _texto),
            'seats': ('Lugares', _inteiro),
        },
        'preencher': 'mesa_preenche',
    },
}

# Nomes de coluna que os sistemas de onde se vem costumam usar. Serve para o
# palpite automático; o que manda é sempre o que a pessoa confirmar no ecrã.
SINONIMOS = {
    'code': ['codigo', 'código', 'code', 'ref', 'referencia', 'referência', 'artigo', 'cod'],
    'name': ['descricao', 'descrição', 'nome', 'name', 'designacao', 'designação', 'description'],
    'sale_price': ['preco', 'preço', 'pvp', 'preco venda', 'preço de venda', 'price', 'sale price'],
    'purchase_price': ['custo', 'preco compra', 'preço de compra', 'cost'],
    'tax_percentage': ['iva', 'taxa', 'tax', 'vat', 'iva %', 'taxa iva'],
    'barcode': ['ean', 'barras', 'codigo de barras', 'código de barras', 'barcode'],
    'is_active': ['ativo', 'activo', 'active', 'estado'],
    'tax_id': ['nif', 'contribuinte', 'vat', 'tax id'],
    'email': ['email', 'e-mail', 'correio'],
    'phone': ['telefone', 'telemovel', 'telemóvel', 'contacto', 'phone', 'tel'],
    'address': ['morada', 'endereco', 'endereço', 'address'],
    'table_number': ['mesa', 'numero', 'número', 'table', 'nº mesa', 'n mesa'],
    'seats': ['lugares', 'pessoas', 'seats', 'capacidade'],
    'credit_limit': ['limite', 'limite de credito', 'limite de crédito', 'credit limit'],
    'shelf_life_days': ['validade', 'validade (dias)', 'dias', 'shelf life'],
    'item_type': ['tipo', 'tipo de artigo', 'type'],
}


class ErroDeImportacao(Exception):
    """A importação não pode sequer começar — e a mensagem diz o que falta."""


def _modelo(destino):
    import importlib
    caminho, classe = DESTINOS[destino]['modelo']
    return getattr(importlib.import_module(caminho), classe)


def artigo_preenche(dados, extras):
    """A unidade de medida do artigo, que o ficheiro de origem raramente traz."""
    from inventory.models import UnitOfMeasure
    un = (UnitOfMeasure.objects.filter(code__iexact='UN').first()
          or UnitOfMeasure.objects.first())
    if un is None:
        raise ErroDeImportacao(
            'Não há nenhuma unidade de medida cadastrada, e um artigo não pode '
            'existir sem uma. Crie-a em Configuração POS › Outros › Unidades de '
            'Stock antes de importar.')
    dados.setdefault('base_uom', un)
    dados.setdefault('item_type', 'Retail')
    return dados


def mesa_preenche(dados, extras):
    """A mesa pertence a um ponto de venda — e é ele que decide onde ela serve."""
    from pos.models import Outlet
    outlet = (Outlet.objects.filter(pk=extras.get('outlet')).first() if extras.get('outlet')
              else Outlet.objects.filter(is_active=True).first())
    if outlet is None:
        raise ErroDeImportacao(
            'Não há nenhum ponto de venda criado, e uma mesa tem de pertencer a um. '
            'Crie-o em Configuração POS › Parâmetros do Sistema › Pontos de Venda.')
    dados.setdefault('outlet', outlet)
    return dados


def ler_csv(conteudo):
    """O ficheiro, lido como vem — com o separador e a codificação que tiver.

    Um CSV exportado por um sistema português vem quase sempre com ponto e
    vírgula (é o que o Excel em português usa) e em cp1252; um exportado por uma
    ferramenta moderna vem com vírgula e em UTF-8. Adivinhar errado dá uma única
    coluna gigante com tudo lá dentro, e a pessoa não percebe porquê.
    """
    if isinstance(conteudo, bytes):
        for codificacao in ('utf-8-sig', 'utf-8', 'cp1252', 'latin-1'):
            try:
                conteudo = conteudo.decode(codificacao)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ErroDeImportacao('Não consegui ler o ficheiro: a codificação não é '
                                   'nenhuma das conhecidas (UTF-8, Windows-1252).')
    amostra = conteudo[:4096]
    try:
        dialeto = csv.Sniffer().sniff(amostra, delimiters=';,\t|')
        separador = dialeto.delimiter
    except csv.Error:
        separador = ';' if amostra.count(';') > amostra.count(',') else ','
    linhas = list(csv.DictReader(io.StringIO(conteudo), delimiter=separador))
    if not linhas:
        raise ErroDeImportacao('O ficheiro não tem nenhuma linha de dados (só o cabeçalho, '
                               'ou está vazio).')
    cabecalho = [c for c in (linhas[0].keys() if linhas else []) if c]
    return cabecalho, linhas


def adivinhar_colunas(destino, cabecalho):
    """O palpite: que coluna do ficheiro alimenta que campo. A pessoa confirma."""
    campos = DESTINOS[destino]['campos']
    mapa = {}
    usadas = set()
    for campo in campos:
        alvos = [campo.lower()] + SINONIMOS.get(campo, [])
        for coluna in cabecalho:
            limpo = _texto(coluna).lower().strip()
            if coluna in usadas:
                continue
            if limpo in alvos or limpo.replace('_', ' ') in alvos:
                mapa[campo] = coluna
                usadas.add(coluna)
                break
    return mapa


def _preparar(destino, linha, colunas):
    """Converte uma linha do ficheiro nos campos do modelo. Levanta ValueError."""
    campos = DESTINOS[destino]['campos']
    dados, problemas = {}, []
    for campo, coluna in colunas.items():
        if campo not in campos or not coluna:
            continue
        etiqueta, converter = campos[campo]
        bruto = linha.get(coluna)
        try:
            valor = converter(bruto)
        except ValueError as e:
            problemas.append(f'{etiqueta}: {e}')
            continue
        if valor is not None and valor != '':
            dados[campo] = valor
    for campo in DESTINOS[destino]['obrigatorios']:
        if not dados.get(campo):
            etiqueta = campos[campo][0]
            problemas.append(f'{etiqueta} em falta')
    if problemas:
        raise ValueError('; '.join(problemas))
    return dados


def _correr(destino, linhas, colunas, extras=None, gravar=False):
    cfg = DESTINOS[destino]
    Modelo = _modelo(destino)
    chave = cfg['chave']
    preencher = globals().get(cfg.get('preencher') or '', None)
    extras = extras or {}

    criados, actualizados, recusados = 0, 0, []
    vistos = set()
    detalhe = []

    for i, linha in enumerate(linhas, start=2):      # 1 é o cabeçalho, no ficheiro
        try:
            dados = _preparar(destino, linha, colunas)
        except ValueError as e:
            recusados.append({'linha': i, 'motivo': str(e),
                              'valor': _texto(linha.get(colunas.get(chave, ''), ''))})
            continue

        valor_chave = dados[chave]
        if valor_chave in vistos:
            # O MESMO CÓDIGO DUAS VEZES NO MESMO FICHEIRO não é um pormenor: uma
            # das duas linhas ia silenciosamente por cima da outra, e o cadastro
            # ficava com o preço da linha que calhasse ser a última.
            recusados.append({'linha': i, 'valor': valor_chave,
                              'motivo': f'O código "{valor_chave}" aparece mais do que uma '
                                        f'vez neste ficheiro'})
            continue
        vistos.add(valor_chave)

        if preencher:
            dados = preencher(dados, extras)

        existente = Modelo.objects.filter(**{chave: valor_chave}).first()
        if existente:
            actualizados += 1
            accao = 'actualiza'
        else:
            criados += 1
            accao = 'cria'
        if len(detalhe) < 50:
            detalhe.append({'linha': i, 'valor': valor_chave, 'accao': accao,
                            'nome': dados.get('name') or dados.get('table_number') or ''})

        if gravar:
            if existente:
                for campo, valor in dados.items():
                    setattr(existente, campo, valor)
                existente.save()
            else:
                Modelo.objects.create(**dados)

    return {'destino': destino, 'nome': cfg['nome'],
            'total': len(linhas), 'criar': criados, 'actualizar': actualizados,
            'recusadas': recusados, 'amostra': detalhe}


def simular(destino, conteudo, colunas=None, extras=None):
    """O QUE IA ACONTECER, sem gravar nada."""
    cabecalho, linhas = ler_csv(conteudo)
    colunas = colunas or adivinhar_colunas(destino, cabecalho)
    r = _correr(destino, linhas, colunas, extras, gravar=False)
    r['colunas'] = colunas
    r['cabecalho'] = cabecalho
    return r


@transaction.atomic
def importar(destino, conteudo, colunas=None, extras=None):
    """Grava — e ou entra tudo o que é bom, ou não entra nada.

    O `atomic` é sobre as linhas BOAS: se a meio da gravação alguma coisa
    rebentar por uma razão que a simulação não apanhou (uma regra do modelo, uma
    constraint), não se fica com meio cadastro importado e sem saber onde é que
    parou.
    """
    cabecalho, linhas = ler_csv(conteudo)
    colunas = colunas or adivinhar_colunas(destino, cabecalho)
    r = _correr(destino, linhas, colunas, extras, gravar=True)
    r['colunas'] = colunas
    return r
