# -*- coding: utf-8 -*-
"""QUAL O MODELO COM QUE ESTE DOCUMENTO SE IMPRIME.

─── PORQUE É QUE ISTO É UMA FUNÇÃO E NÃO UMA LINHA EM CADA SÍTIO ──────────
Havia um sítio a escolher o modelo (`pos/views.py`, para o talão térmico) e
nenhum para o A4 — a fatura A4 ignorava os modelos por completo. Quando o A4
passasse a usá-los, passariam a existir duas regras de escolha, e a primeira
vez que uma mudasse (acrescentar o hotel, respeitar o "activo", preferir o
marcado como predefinido) a outra ficava para trás. Então o talão e a fatura
da MESMA casa sairiam com rodapés diferentes, e ninguém saberia porquê.

A regra, por ordem, e o motivo de cada degrau:

 1. O modelo ACTIVO deste tipo de documento E deste hotel. É o mais
    específico: num grupo de três hotéis, cada um tem o seu papel.
 2. O modelo ACTIVO deste tipo sem hotel atribuído — o modelo da instalação,
    que é o que uma casa só quer e o que as fichas antigas passam a ser.
 3. Nada. E "nada" é uma resposta legítima: sem modelo, o documento sai com
    o desenho de fábrica, que é completo e legal. NÃO se inventa um modelo
    nem se grava um na primeira impressão — gravar sozinho fichas que o dono
    não criou enche-lhe a lista de coisas que ele não reconhece.

Dentro de cada degrau, o marcado como PREDEFINIDO ganha; a seguir, o mais
antigo, para a escolha ser sempre a mesma em vez de depender da ordem com que
a base devolve as linhas.
"""
from django.db.models import Q


def modelo_para(doc_type, hotel_id=None):
    """Devolve o DocumentTemplate deste tipo de documento, ou None."""
    from .models import DocumentTemplate
    if not doc_type:
        return None
    qs = DocumentTemplate.objects.filter(doc_type=doc_type, is_active=True)
    if hotel_id:
        especifico = qs.filter(hotel_id=hotel_id).order_by('-is_default', 'id').first()
        if especifico:
            return especifico
    return qs.filter(hotel__isnull=True).order_by('-is_default', 'id').first()


# AS CAIXAS QUE O PAPEL RESPEITA, com o que vale quando não há modelo.
#
# O valor de fallback é o que o desenho de fábrica já fazia — para quem nunca
# criar um modelo nada mudar. Um sistema que muda de aspecto só porque ganhou
# uma funcionalidade nova obriga toda a gente a voltar a configurar.
PADRAO = {
    'accent_color': '#1F3A5F',
    'logo_height_mm': 16,
    'show_logo': True,
    'show_qr': True,
    'show_payments': True,
    'show_signature_line': False,
    'show_bank_details': False,
    'show_page_numbers': True,
    'header': '',
    'footer': '',
    'bank_details': '',
    'payment_terms': '',
    'legal_notes': '',
    'signature_label': '',
}


def modelo_em_dicionario(modelo):
    """O modelo pronto para ir no JSON da impressão.

    Devolve SEMPRE todas as chaves, com os valores de fábrica quando não há
    modelo. Quem desenha o papel não tem de saber se existe ficha ou não — e
    não fica cheio de `if modelo and modelo.x`, que é onde se esquece um.
    """
    if modelo is None:
        return dict(PADRAO)
    d = dict(PADRAO)
    for chave in PADRAO:
        valor = getattr(modelo, chave, None)
        if valor is not None:
            d[chave] = valor
    d['id'] = modelo.id
    d['name'] = modelo.name
    d['page_format'] = modelo.page_format
    return d
