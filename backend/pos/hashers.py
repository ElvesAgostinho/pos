from django.contrib.auth.hashers import PBKDF2PasswordHasher


class PosPinHasher(PBKDF2PasswordHasher):
    """Hash do PIN do terminal (4-6 dígitos) — verificado por VARRIMENTO.

    O login por PIN não sabe de quem é: percorre TODOS os operadores ativos e
    testa o PIN contra cada um (é a única forma de comparar um PIN contra um
    hash, sem guardar o PIN em claro). Com o hasher por omissão do Django
    (~600 mil iterações, pensado para a password de uma conta só) isto ficava
    em SEGUNDOS por operador — cada troca de turno esperava vários segundos,
    e a demora só cresce com o número de operadores.

    Um PIN tem no máximo 6 dígitos (1 milhão de hipóteses); o que o protege de
    força bruta é o bloqueio ao fim de 5 tentativas (auth_engine/views.py),
    não o custo do hash. Menos iterações aqui não abre nenhuma porta.
    """
    algorithm = 'pbkdf2_pos_pin'   # nome próprio — não pode colidir com o pbkdf2_sha256 normal
    iterations = 4000
