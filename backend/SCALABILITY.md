# Escalabilidade — arquitetura para muitos utilizadores (até ~1M)

> **Nota honesta:** 1 milhão de utilizadores *em simultâneo* é hiperescala (poucos sistemas
> no mundo precisam disso). 1 milhão de utilizadores *registados* com dezenas de milhares
> em simultâneo é perfeitamente atingível com a arquitetura abaixo. Um hotel isolado não
> precisa de nada disto — isto é para o modelo **multi-hotel (SaaS/EMC)** ou para um portal
> de reservas público com muito tráfego.

O código **já está preparado** para escalar (API stateless com JWT, paginação DRF,
BD por ambiente, cache/throttling por variável de ambiente). Falta a **infraestrutura**.

## Camadas (cada uma escala independentemente)

```
        Utilizadores / Browsers / OTAs
                     │
        [ CDN + WAF ]  Cloudflare / CloudFront        ← estáticos do React no edge (infinito)
                     │
        [ Load Balancer ]  Nginx / HAProxy / cloud LB  ← distribui e termina TLS
                     │
   ┌─────────────┬───┴─────────┬─────────────┐
[ App 1 ]     [ App 2 ]     [ App 3 ]  …N     ← Django+DRF STATELESS, autoscaling (K8s/Cloud Run)
   │             │             │               Gunicorn + workers Uvicorn (ASGI)
   └──────┬──────┴──────┬──────┘
     [ PgBouncer ]   [ Redis (cluster) ]        ← pool de ligações  |  cache/sessões/rate-limit
          │
   [ PostgreSQL primário ] ──► [ réplicas de leitura ]   ← escrita no primário, leituras nas réplicas
          │
   [ Celery workers ] ◄── fila (Redis/RabbitMQ)          ← SAF-T, relatórios, emails, sync OTA, posting
   [ Object Storage (S3) ] + [ OpenSearch ]              ← ficheiros/media  |  pesquisa global à escala
```

## Tecnologias e porquê
| Necessidade | Tecnologia | Já no projeto |
|---|---|---|
| Servir o frontend a milhões | **React build estático + CDN** (edge cache) | build pronto |
| API que escala em largura | **Django+DRF stateless (JWT)** atrás de LB, N réplicas | ✅ |
| Servidor de app rápido | **Gunicorn + Uvicorn workers** (ASGI) | requirements |
| Não esgotar ligações à BD | **PgBouncer** (pool) + `CONN_MAX_AGE`+health checks | settings ✅ |
| Base de dados robusta | **PostgreSQL** + **réplicas de leitura** (+ particionamento das tabelas gigantes: ledger, movimentos) | settings ✅ |
| Cache/sessões partilhados | **Redis** (via `REDIS_URL`) | settings ✅ |
| Trabalho pesado fora do pedido | **Celery + Redis** (SAF-T, relatórios, emails, OTAs) | requirements |
| Pesquisa global à escala | **OpenSearch/Elasticsearch** (em vez de LIKE na BD) | opcional |
| Proteção sob carga/abuso | **Rate limiting** (DRF throttling + WAF no edge) | settings ✅ |
| Isolar clientes (multi-hotel) | **Multi-tenant**: schema-por-tenant (`django-tenants`) ou `tenant_id`+RLS | a definir |
| Ver o que se passa | **Prometheus/Grafana + Sentry** + logs estruturados | opcional |
| Correr em qualquer escala | **Docker + Kubernetes** (autoscaling) ou gerido (ECS/Cloud Run) | a definir |

## Como ligar (variáveis de ambiente — sem tocar no código)
```bash
DJANGO_DEBUG=False
DB_ENGINE=postgresql  DB_HOST=...  DB_NAME=...  DB_USER=...  DB_PASSWORD=...
DB_CONN_MAX_AGE=120
REDIS_URL=redis://cache-host:6379/0        # ativa cache+sessões partilhadas
THROTTLE_ANON=120/min  THROTTLE_USER=2400/min
```
Arrancar com vários workers (exemplo Linux):
```bash
gunicorn erp_server.wsgi -k uvicorn.workers.UvicornWorker -w 8 -b 0.0.0.0:8000 --max-requests 2000
```
Escalar = adicionar mais instâncias atrás do load balancer (a app é stateless).

## Otimizações de código já feitas / a fazer
- ✅ Paginação DRF (`?page`), `select_related/prefetch_related` nos ViewSets críticos, JWT stateless.
- ✅ Em produção só JSONRenderer (mais rápido), throttling, ligações persistentes+health checks.
- ▢ Índices compostos nas tabelas mais consultadas (POSTicket, FiscalDocument, StockMovement, ledger) quando o volume o exigir.
- ▢ Mover SAF-T/relatórios/emails/sync OTA para Celery (tirar do request).
- ▢ Migrar a pesquisa global (Document Center) para OpenSearch quando os documentos forem muitos.

**Regra de ouro:** o gargalo a sério é sempre a **base de dados** — PgBouncer + réplicas de
leitura + índices + Redis resolvem 95% dos problemas de escala antes de precisar de mais nada.
