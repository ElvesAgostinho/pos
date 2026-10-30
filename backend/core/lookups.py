# -*- coding: utf-8 -*-
"""`__ne` — "é diferente de", escrito como `<>` e não como `NOT (... = ...)`.

Porque é que isto existe, e não é um enfeite:

Uma restrição única PARCIAL (`UniqueConstraint` com `condition=`) vira um índice
com um `WHERE` na base de dados. A regra "um lançamento por origem, excepto os do
F&B" escreve-se naturalmente em Django assim:

    condition=~models.Q(charge_type='FNB')

e o Django traduz isso para `WHERE NOT ([charge_type] = 'FNB')`.

O PostgreSQL e o SQLite aceitam. **O SQL Server não**: a gramática do predicado
de um índice filtrado não tem `NOT` — é recusada pelo próprio parser, antes de
qualquer verificação. Aceita `<>`, `>`, `IN`, `IS NOT NULL` e `AND` (confirmado
contra um SQL Server 2025 a correr), mas `NOT` não.

Ou seja: a mesma regra, escrita de duas maneiras equivalentes, instala-se num
motor e não no outro. Com `__ne`, escreve-se `<>` directamente e os três motores
aceitam-na.

**A semântica é a mesma nos três.** `NULL <> 'x'` é NULL, tal como
`NOT (NULL = 'x')` é NULL — em qualquer dos casos a linha fica de fora do índice
filtrado, que é o que já acontecia.

Registado em `core/apps.py` (ready), para estar disponível quando as migrações
compilam as restrições.
"""
from django.db.models import Field, Lookup


@Field.register_lookup
class Diferente(Lookup):
    """`campo__ne=valor`  →  `campo <> valor`."""

    lookup_name = 'ne'

    def as_sql(self, compiler, connection):
        esquerda, p_esq = self.process_lhs(compiler, connection)
        direita, p_dir = self.process_rhs(compiler, connection)
        return f'{esquerda} <> {direita}', list(p_esq) + list(p_dir)
