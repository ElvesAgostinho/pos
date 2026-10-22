# -*- coding: utf-8 -*-
"""Traduzir os erros da BASE DE DADOS para português antes de chegarem ao ecrã.

"Ocorreu um erro interno ao processar o pedido" é o que o utilizador vê sempre
que a base de dados recusa uma gravação — e a base de dados recusa gravações por
razões que não têm nada de interno: um código repetido, um campo obrigatório em
branco, uma escolha que entretanto foi apagada. São erros DELE, com solução
imediata, apresentados como avaria do sistema.

O efeito prático é pior do que a feiura: quem vê "erro interno" fecha a caixa,
tenta outra vez, vê o mesmo, e telefona. Quem vê "já existe uma conta com o
código CX01" muda o código e segue.

Isto não é um remendo por ecrã. Qualquer gravação, em qualquer dos módulos,
passa por aqui — e são para cima de 300 ecrãs. A alternativa seria declarar o
validador certo em cada serializador, um a um, e continuar a falhar nos casos em
que o campo em conflito nem sequer vai no formulário (o `hotel`, por exemplo, é
preenchido no servidor: a DRF não tem como o validar sozinha).

O erro original vai para o registo, inteiro: ninguém perde capacidade de
diagnóstico por a mensagem ficar legível.
"""
import logging
import re

from django.apps import apps
from django.db.utils import DataError, IntegrityError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

log = logging.getLogger(__name__)

# SQLite (desenvolvimento) e PostgreSQL (produção) dizem a mesma coisa de maneiras
# diferentes. As duas interessam: o que o cliente corre é PostgreSQL.
_UNIQUE_SQLITE = re.compile(r'UNIQUE constraint failed: (.+)')
_UNIQUE_PG = re.compile(r'Key \(([^)]+)\)=\([^)]*\) already exists', re.I)
_NOTNULL_SQLITE = re.compile(r'NOT NULL constraint failed: (\S+)')
_NOTNULL_PG = re.compile(r'null value in column "([^"]+)"', re.I)


# O sistema fala português; as colunas da base de dados estão em inglês, e a
# maioria dos modelos não declara `verbose_name` (nem tem de declarar: nunca
# foram feitos para aparecer ao utilizador). Sem isto, a mensagem saía "Já existe
# um registo com este code" — meio traduzida, que é pior do que não traduzida.
# Só os nomes que REALMENTE aparecem em conflitos; o resto cai no nome limpo.
_PALAVRAS = {
    'code': 'Código', 'name': 'Nome', 'number': 'Número', 'reference': 'Referência',
    'email': 'E-mail', 'phone': 'Telefone', 'username': 'Utilizador',
    'tax_id': 'NIF', 'nif': 'NIF', 'barcode': 'Código de barras',
    'slug': 'Endereço', 'full_number': 'Número do documento',
    'invoice_no': 'Número da fatura', 'confirmation': 'Nº de confirmação',
    'room': 'Quarto', 'table_number': 'Mesa', 'ticket_number': 'Nº da conta',
    'api_key': 'Chave da API', 'description': 'Descrição', 'title': 'Título',
    'year': 'Ano', 'date': 'Data', 'serial': 'Nº de série', 'pin': 'PIN',
}


def _etiqueta(tabela, coluna):
    """O nome que o campo tem NO ECRÃ, não na base de dados.

    `fin_account.code` não diz nada a quem está à frente do formulário; "Código"
    diz. Procura-se o modelo pela tabela e pergunta-se-lhe o nome do campo. Se
    não se encontrar, devolve-se a coluna limpa — melhor do que nada, e nunca
    rebenta por causa disto.
    """
    nome = (coluna or '').strip()
    if nome.endswith('_id'):
        nome = nome[:-3]
    try:
        for modelo in apps.get_models():
            if modelo._meta.db_table != tabela:
                continue
            campo = modelo._meta.get_field(nome)
            verbose = str(getattr(campo, 'verbose_name', '') or '').strip()
            # A DRF inventa um `verbose_name` a partir do nome do campo quando
            # nenhum foi declarado ("code" → "code"): isso não é uma tradução,
            # é a coluna outra vez. Só vale se alguém o escreveu de propósito.
            if verbose and verbose.lower() != nome.replace('_', ' ').lower():
                return verbose.capitalize()
            break
    except Exception:
        pass
    return _PALAVRAS.get(nome, nome.replace('_', ' ').capitalize())


def _campos_unique(texto):
    """Os campos em conflito, já com nome de gente. Vazio se não se perceber."""
    m = _UNIQUE_SQLITE.search(texto)
    if m:
        etiquetas, tabela = [], None
        for parte in m.group(1).split(','):
            parte = parte.strip()
            tabela, _, coluna = parte.rpartition('.')
            etiquetas.append(_etiqueta(tabela, coluna))
        # O `hotel` entra em quase todas as chaves (um código é único POR hotel)
        # e nomeá-lo só confunde: quem está a gravar está dentro do seu hotel e
        # não escolheu nenhum. O que lhe interessa é o campo que ele escreveu.
        uteis = [e for e in etiquetas if e.lower() not in ('hotel', 'empresa', 'company')]
        return uteis or etiquetas
    m = _UNIQUE_PG.search(texto)
    if m:
        return [c.strip().replace('_id', '').replace('_', ' ').capitalize()
                for c in m.group(1).split(',')]
    return []


def _traduzir_integridade(exc):
    """A mensagem a mostrar, ou None se não se souber traduzir com honestidade."""
    texto = str(exc)

    campos = _campos_unique(texto)
    if campos:
        quais = ', '.join(campos)
        if len(campos) == 1:
            return (f'Já existe um registo com este {quais.lower()}. '
                    f'O {quais.lower()} tem de ser único — escolha outro.')
        return (f'Já existe um registo com esta combinação de {quais.lower()}. '
                f'Altere um destes campos.')

    m = _NOTNULL_SQLITE.search(texto)
    if m:
        tabela, _, coluna = m.group(1).rpartition('.')
        return f'Falta preencher: {_etiqueta(tabela, coluna)}.'
    m = _NOTNULL_PG.search(texto)
    if m:
        return (f'Falta preencher: '
                f'{m.group(1).replace("_id", "").replace("_", " ").capitalize()}.')

    if 'FOREIGN KEY constraint failed' in texto or 'violates foreign key constraint' in texto:
        return ('Um dos registos que escolheu já não existe — pode ter sido apagado '
                'entretanto. Volte a abrir o ecrã e escolha outra vez.')

    return None


def handler(exc, context):
    """Tratamento de exceções da API (REST_FRAMEWORK['EXCEPTION_HANDLER'])."""
    resposta = drf_exception_handler(exc, context)
    if resposta is not None:
        return resposta        # erro já tratado pela DRF (400/403/404…): nada a fazer

    if isinstance(exc, (IntegrityError, DataError)):
        detalhe = _traduzir_integridade(exc)
        # O erro técnico fica SEMPRE no registo, inteiro — a mensagem legível é
        # para o ecrã, não substitui o diagnóstico.
        log.warning('Gravação recusada pela base de dados em %s: %s',
                    getattr(context.get('request'), 'path', '?'), exc)
        if detalhe:
            return Response({'detail': detalhe}, status=400)
        return Response({'detail': 'A base de dados recusou esta gravação. '
                                   'Verifique os campos obrigatórios e os códigos repetidos.'},
                        status=400)

    return None                # qualquer outra coisa é mesmo um erro do sistema
