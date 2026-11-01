# -*- coding: utf-8 -*-
"""LÊ O DOCKERFILE INTEIRO E DIZ SE O DOCKER O CONSEGUE LER.

─── PORQUE É QUE ISTO EXISTE ──────────────────────────────────────────────
Um script meu deixou dois caracteres CR perdidos dentro do Dockerfile. Isso
partiu duas linhas ao meio e deixou lixo no ficheiro:

    81| " no fim
    85| $//' /app/arrancar.sh && chmod +x /app/arrancar.sh

Depois verifiquei — e verifiquei MAL: procurei as duas linhas que me
interessavam, vi-as bem escritas, e dei o ficheiro por bom. As duas linhas
estragadas estavam logo ao lado e eu não olhei para elas.

O build falhou em 2,9 segundos com "dockerfile parse error on line 81". E
2,9 segundos é também o tempo que leva uma falha de rede — o que me levou a
concluir, com confiança e sem razão nenhuma, que a culpa não era minha.

Uma verificação que olha só para o que se mudou não é uma verificação. Esta
lê o ficheiro todo: cada linha que não é comentário, nem está em branco, nem
é continuação da anterior, TEM de começar por uma instrução do Docker.

Correr antes de enviar uma alteração ao Dockerfile:
    python deploy/pcc/verificar_dockerfile.py
"""
import io
import sys

INSTRUCOES = {
    'FROM', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT',
    'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK',
    'SHELL', 'MAINTAINER',
}
BARRA = chr(92)      # a barra invertida da continuação de linha
CR = chr(13)


def verificar(caminho):
    bruto = io.open(caminho, encoding='utf-8', newline='').read()
    problemas = []

    # 1. CARACTERES CR. Num ficheiro editado em Windows são normais no fim da
    #    linha; no MEIO de uma linha são sempre lixo — e são invisíveis no
    #    terminal, porque o CR manda o cursor para o princípio e o resto da
    #    linha fica escrito por cima do que já lá estava.
    for n, linha in enumerate(bruto.replace(CR + '\n', '\n').split('\n'), 1):
        if CR in linha:
            problemas.append((n, 'CR no meio da linha: ' + repr(linha[:60])))

    # 2. CADA LINHA TEM DE COMEÇAR POR UMA INSTRUÇÃO.
    continua = False
    for n, linha in enumerate(bruto.replace(CR, '').split('\n'), 1):
        corpo = linha.rstrip()
        if continua:
            continua = corpo.endswith(BARRA)
            continue
        if not corpo.strip() or corpo.lstrip().startswith('#'):
            continue
        primeiro = corpo.split(None, 1)[0].upper()
        if primeiro not in INSTRUCOES:
            problemas.append((n, 'não começa por uma instrução: ' + corpo[:60]))
        continua = corpo.endswith(BARRA)

    return problemas


if __name__ == '__main__':
    caminho = sys.argv[1] if len(sys.argv) > 1 else 'deploy/pcc/Dockerfile'
    maus = verificar(caminho)
    if maus:
        print('O DOCKER NÃO VAI CONSEGUIR LER %s:' % caminho)
        for n, porque in maus:
            print('  linha %d: %s' % (n, porque))
        raise SystemExit(1)
    print('%s: todas as linhas são legíveis pelo Docker.' % caminho)
