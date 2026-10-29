# -*- coding: utf-8 -*-
"""TRAVÃO DE FORÇA BRUTA NO `/admin/login/` DO DJANGO.

A API tem travão desde sempre (`auth_engine/views.py`: 5 tentativas, 15 minutos
de bloqueio por IP e por identidade). O `/admin/login/` do Django **não** — é
outra porta, com outra vista, e o throttle do DRF não lhe chega porque não é uma
vista do DRF.

No PCC isso importa mais do que numa instalação de cliente. O PCC está num
domínio público, o `/admin/` responde a toda a internet, e o nome do
superutilizador vem de uma variável de ambiente que costuma ser previsível
(`dono-pcc`). Ou seja: tentativas de password sem limite nenhum, contra uma
conta cujo nome se adivinha, na consola que guarda as licenças de todos os
clientes.

Este travão é o MESMO de `auth_engine` — a mesma chave de cache, o mesmo limite,
o mesmo tempo. Não se reimplementa a contagem: importa-se, para que mudar o
limite num sítio o mude nos dois.

Conta por IP **e** por utilizador tentado:
  · por IP travа quem varre a lista de passwords de um sítio só;
  · por utilizador travа quem distribui as tentativas por muitos IPs, que é
    como se faz quando se quer passar ao lado de um limite por IP.

Em caso de bloqueio responde 429 com o tempo de espera — e não 403, porque 429 é
o que diz "estás a bater demasiado", e é o que um proxy ou um WAF à frente sabe
interpretar.
"""
from django.http import HttpResponse

from auth_engine.views import (LOCK_SECONDS, MAX_ATTEMPTS, _client_ip,
                               _is_locked, _register_failure, _clear_failures)

# Os caminhos a proteger. Só os de LOGIN: o resto do /admin/ já exige sessão, e
# travar navegação normal era bloquear quem está a trabalhar.
CAMINHOS = ('/admin/login/',)


def _chaves(request):
    """As duas identidades a contar: o IP e o utilizador que está a ser tentado."""
    ip = _client_ip(request) or 'sem-ip'
    quem = (request.POST.get('username') or '').strip().lower()[:150]
    chaves = [('adminip', ip)]
    if quem:
        chaves.append(('adminuser', quem))
    return chaves


class AdminBruteForceMiddleware:
    """Conta as tentativas falhadas de login no /admin/ e bloqueia-as a tempo."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        protegido = request.method == 'POST' and request.path in CAMINHOS
        if not protegido:
            return self.get_response(request)

        chaves = _chaves(request)
        for tipo, ident in chaves:
            if _is_locked(tipo, ident):
                minutos = max(1, LOCK_SECONDS // 60)
                return HttpResponse(
                    f'Demasiadas tentativas falhadas. Tente novamente dentro de '
                    f'{minutos} minutos.',
                    status=429, content_type='text/plain; charset=utf-8')

        resposta = self.get_response(request)

        # COMO SE SABE SE FALHOU: o Django responde 302 (para o admin) quando o
        # login passa, e 200 (volta a desenhar o formulário com o erro) quando
        # não. É o único sinal que a vista dá sem se lhe tocar por dentro.
        if resposta.status_code == 302:
            for tipo, ident in chaves:
                _clear_failures(tipo, ident)
        else:
            for tipo, ident in chaves:
                usadas = _register_failure(tipo, ident)
                if usadas >= MAX_ATTEMPTS:
                    # Fica no registo de autenticação, para aparecer no
                    # relatório de acessos (sy_acessos) como o resto.
                    try:
                        from auth_engine.models import AuthEventLog
                        AuthEventLog.objects.create(
                            event_type='LOGIN_FAILED_PASSWORD',
                            identity_attempt=f'{ident} (admin, bloqueado)',
                            ip_address=_client_ip(request),
                            details=f'{usadas} tentativas falhadas em /admin/login/')
                    except Exception:
                        pass
        return resposta
