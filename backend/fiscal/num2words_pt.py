"""
Conversão de valores monetários para extenso em português (Angola — Kwanzas).
Exigência AGT: a fatura deve apresentar o total em numérico E por extenso.
Suporta até centenas de milhões, com cêntimos.
"""
from decimal import Decimal, ROUND_HALF_UP

UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
         'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete',
         'dezoito', 'dezanove']
TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
            'seiscentos', 'setecentos', 'oitocentos', 'novecentos']


def _under_thousand(n):
    """0..999 por extenso."""
    if n == 0:
        return ''
    if n == 100:
        return 'cem'
    parts = []
    h, rest = divmod(n, 100)
    if h:
        parts.append(HUNDREDS[h])
    if rest:
        if rest < 20:
            parts.append(UNITS[rest])
        else:
            t, u = divmod(rest, 10)
            parts.append(TENS[t] if not u else f"{TENS[t]} e {UNITS[u]}")
    return ' e '.join(parts)


def _integer_to_words(n):
    if n == 0:
        return 'zero'
    groups = []  # (valor 0..999, escala)
    scales = [
        (1_000_000_000, 'mil milhões', 'mil milhões'),
        (1_000_000, 'milhão', 'milhões'),
        (1_000, 'mil', 'mil'),
        (1, '', ''),
    ]
    remaining = n
    for value, sing, plur in scales:
        q, remaining = divmod(remaining, value)
        if q:
            groups.append((q, value, sing, plur))

    words = []
    for i, (q, value, sing, plur) in enumerate(groups):
        if value == 1000 and q == 1:
            chunk = 'mil'
        elif value >= 1000:
            label = sing if q == 1 else plur
            chunk = f"{_under_thousand(q)} {label}".strip()
        else:
            chunk = _under_thousand(q)
        words.append(chunk)

    # Junção com "e": regra portuguesa entre o penúltimo e o último grupo
    # quando o último é < 100 ou múltiplo exato de 100.
    if len(words) == 1:
        return words[0]
    last_val = groups[-1][0] * groups[-1][1] if groups[-1][1] < 1000 else groups[-1][0]
    tail = groups[-1][0]
    join_e = groups[-1][1] == 1 and (tail < 100 or tail % 100 == 0)
    if join_e:
        return ' '.join(words[:-1]) + ' e ' + words[-1]
    return ', '.join(words[:-1]) + ' e ' + words[-1] if len(words) > 2 else ' '.join(words)


def amount_to_words(amount, currency='Kwanzas', cents_name='cêntimos'):
    amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    integer = int(amount)
    cents = int((amount - integer) * 100)
    cur = currency if integer != 1 else 'Kwanza'
    int_words = _integer_to_words(integer)
    # Regra pt: "milhão/milhões/mil milhões" ligam à moeda com "de".
    de = ' de ' if int_words.endswith(('milhão', 'milhões')) else ' '
    text = f"{int_words}{de}{cur}"
    if cents:
        cent_word = cents_name if cents != 1 else 'cêntimo'
        text += f" e {_integer_to_words(cents)} {cent_word}"
    return text.strip().capitalize()
