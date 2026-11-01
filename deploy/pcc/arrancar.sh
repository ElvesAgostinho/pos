#!/bin/sh
# ============================================================================
# ARRANQUE DO PCC — e, sobretudo, DEIXAR RASTO QUANDO CORRE MAL.
#
# ─── O QUE ACONTECEU, E PORQUE ISTO EXISTE ─────────────────────────────────
# O contentor arrancava com uma linha só:
#
#     migrate && collectstatic && (createsuperuser || true) && gunicorn
#
# Está certa na ordem e na intenção: se as migrações falham, NÃO se serve a
# aplicação — um servidor de licenças a responder com a base a meio é pior do
# que um servidor em baixo.
#
# O que está errado é o que sobra depois. Quando o `migrate` falhava, o
# processo morria, o Docker voltava a levantar o contentor, e repetia-se para
# sempre: 0 réplicas, 1 réplica, 0, 1, de doze em doze segundos. De fora
# viam-se 502 e mais nada. A mensagem de erro do Django ia para o stdout de um
# contentor que já não existe — e se o subsistema de registos do painel
# estiver em baixo (foi o caso), não há ABSOLUTAMENTE nada para ler. Ficou-se
# a adivinhar durante horas o que o Django tinha escrito em claro.
#
# A correcção não é tornar a falha silenciosa — é deixá-la ESCRITA num sítio
# que sobrevive à morte do contentor: o volume persistente (/app/dados), que é
# o mesmo que guarda a base e as chaves. O contentor continua a morrer quando
# tem de morrer; a diferença é que da próxima vez há o que ler.
#
# ─── PORQUE NÃO SE SERVE COM AS MIGRAÇÕES POR APLICAR ──────────────────────
# Seria fácil trocar o "&&" por ";" e o serviço ficava de pé. Ficava de pé a
# mentir: o PCC é o registo central das licenças e das chaves AGT de todos os
# clientes. Com uma tabela por migrar, umas chamadas respondem e outras dão
# 500 ao acaso, e alguém no terreno fica sem conseguir activar uma licença sem
# perceber porquê. Um erro claro à entrada vale mais do que meio sistema.
# ============================================================================
set -e

REGISTO=/app/dados/logs/arranque.log
mkdir -p /app/dados/logs

# O FICHEIRO NÃO PODE CRESCER PARA SEMPRE. Num ciclo de reinícios são dezenas
# de arranques por hora; sem isto, enche o volume — e encher o volume da base
# de dados por causa de um ficheiro de diagnóstico seria trocar um problema
# por outro pior. Fica a última meia dúzia de arranques.
if [ -f "$REGISTO" ] && [ "$(wc -l < "$REGISTO")" -gt 800 ]; then
  tail -n 400 "$REGISTO" > "$REGISTO.tmp" && mv "$REGISTO.tmp" "$REGISTO"
fi

anota() {
  echo "$(date -u '+%Y-%m-%d %H:%M:%SZ')  $*" >> "$REGISTO"
}

# Cada passo escreve para o ficheiro E para o stdout (o `tail` a seguir), para
# funcionar nos dois casos: com registos do painel a funcionar, lê-se lá; sem
# eles, lê-se no volume.
passo() {
  nome="$1"; shift
  anota "--- $nome ---"
  # O CÓDIGO DE SAÍDA CAPTURA-SE AQUI, e não depois de um "if ... fi".
  #
  # Depois do "fi", $? é o estado do PRÓPRIO if — que é 0 quando se cai no
  # ramo de falha. O guião escrevia "FALHOU (código 0)" e saía com 0, ou
  # seja: morria a dizer que tinha corrido bem. Num diagnóstico, uma mentira
  # dessas é pior do que não ter diagnóstico nenhum.
  #
  # "|| codigo=$?" também sobrevive ao "set -e": faz parte de uma lista "||",
  # e o shell não aborta nessas.
  codigo=0
  "$@" >> "$REGISTO" 2>&1 || codigo=$?
  if [ "$codigo" -eq 0 ]; then
    anota "$nome: OK"
    return 0
  fi
  anota "$nome: FALHOU (código $codigo)"
  echo "================================================================"
  echo " O ARRANQUE DO PCC PAROU EM: $nome"
  echo " O que o comando escreveu (últimas 60 linhas) está abaixo e fica"
  echo " guardado em $REGISTO, que sobrevive à morte do contentor."
  echo "================================================================"
  tail -n 60 "$REGISTO"
  exit "$codigo"
}

anota "=========== ARRANQUE ==========="
anota "modo=${SYSTEM_MODE:-?}  motor=${DB_ENGINE:-sqlite}  base=${DB_NAME:-?}  servidor=${DB_HOST:-?}"

passo "migrações da base de dados" python manage.py migrate --noinput
passo "ficheiros estáticos" python manage.py collectstatic --noinput

# O PRIMEIRO ADMINISTRADOR. Nos arranques seguintes já existe e o comando
# falha — por isso este passo não usa `passo`, que faria o contentor morrer.
# Não há consola interactiva num contentor: ou se cria assim, ou não se cria.
anota "--- primeiro administrador ---"
python manage.py createsuperuser --noinput >> "$REGISTO" 2>&1 \
  && anota "administrador: criado" \
  || anota "administrador: já existia (ou faltam as variáveis DJANGO_SUPERUSER_*)"

anota "a entregar o serviço ao gunicorn"
tail -n 25 "$REGISTO"

exec gunicorn erp_server.wsgi:application \
  --bind 0.0.0.0:8000 --workers 3 --timeout 60 \
  --access-logfile - --error-logfile -
