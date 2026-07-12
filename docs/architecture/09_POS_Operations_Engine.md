# 09 · POS Enterprise Operations Engine — os 10 Motores

> Especificação que reúne todos os motores do POS. O POS **só é considerado concluído** quando
> os 10 motores estiverem implementados e integrados (nível Simphony/Aloha/Agilysys/Shiji/Primavera).

| # | Motor | Âmbito | Estado |
|---|-------|--------|--------|
| 1 | **Login & Segurança** | Login (PIN/RFID/credenciais/biometria), sessão, permissões, licenciamento, auditoria | 🟡 Parcial (PIN + credenciais + licença + permissões ✅; RFID/biometria roadmap) |
| 2 | **Gestão de Caixa** | Abertura, fecho, sangrias, reforços, entradas/saídas, reconciliação, auditoria | ✅ Implementado (`pos.CashSession`, `pos.CashMovement`) |
| 3 | **Gestão de Mesas** | Mapa, salas, mesas, juntar/separar/transferir, reservas, lista de espera, estados | 🟢 Avançado (`pos.POSTable` + gestão por outlet ✅; **transferir mesa** (`transfer_table`), **juntar mesas/tickets** (`merge`), **reservas de mesa** `pos.POSReservation` (reservar/sentar/cancelar/no-show) ✅; mapa gráfico drag-and-drop roadmap) |
| 4 | **Gestão de Pedidos** | Criar/alterar/cancelar/suspender/reabrir, dividir conta, modificadores, extras, observações | 🟢 Avançado (`pos.POSTicket` — abrir/linhas/anular ✅; **modificadores/extras** `pos.POSLineModifier` (delta soma ao preço), **suspender/reabrir**, **dividir conta** (`split` move linhas p/ novo ticket) ✅) |
| 5 | **Motor de Produção** | KDS, Bar Display, fila, prioridades, tempos, estados, chamada, reimpressão, produção por curso, ordem de saída | 🟡 Parcial (**KDS por estação** Cozinha/Bar/Pastelaria, routing por produto, enviar p/ cozinha, estados NEW→FIRED→PREPARING→READY→SERVED, tempo decorrido ✅; produção por curso/reimpressão/consolidação roadmap) |
| 6 | **Motor Financeiro** | Misto/parcial, divisão pessoas/itens, troco, estornos, reembolsos, conta quarto/empresa, gift card/voucher/crédito, gorjetas, taxas, pré-autorização, fecho | 🟢 Avançado (pagamento **autorizado por outlet**, **misto/parcial**, **troco**, fecho ✅; **estorno/nota de crédito** (`refund`), **conta-quarto** (`charge_to_room` → lança FolioCharge no PMS), **gift card** `pos.GiftCard` (`redeem_gift`) ✅; gorjetas/pré-autorização roadmap) |
| 7 | **Motor de Documentos** | Pré-conta, fatura, fatura simplificada, nota de crédito, recibo, 2ª via, reimpressão, anulação, assinatura digital, séries, numeração | 🟡 Parcial (**séries no Master Data** + **numeração sequencial atómica**, emissão pré-conta/fatura a partir do ticket, cliente/NIF, 2ª via, anulação ✅; assinatura digital/impressão/nota de crédito com origem roadmap) |
| 8 | **Motor de Comunicação** | Integração tempo real: PMS, Warehouse, Financeiro, KDS, impressoras, gavetas, PIN pad, balanças, scanner, display cliente | 🟡 Parcial (**spooler de impressão** `pos.PrintJob` — comandas por estação, talão/fatura, agente local (mark_printed/reimprimir) ✅; **integração PMS em tempo real** via `charge_to_room` (o POS lança no folio do quarto) ✅; integração física de hardware — gaveta/PIN pad/balança — exige equipamento) |
| 9 | **Motor Offline** | Vender sem servidor, guardar pedidos/pagamentos/movimentos localmente, sincronizar, resolver conflitos, registar falhas | 🟡 Parcial (**store-and-forward**: outbox local + `client_uuid` idempotente + endpoint `tickets/sync` que insere em lote **sem duplicar** ✅; deteção de rede e UI offline completa ficam para o FrontOffice) |
| 10 | **Motor de Auditoria** | Registar TUDO (login/logout, caixa, pedidos, transferências, descontos, pagamentos, estornos, impressões, alterações de preço, mudança de operador) com data/hora/hotel/outlet/terminal/operador/IP/dispositivo/justificação/valor anterior/novo | ✅ Implementado (`pos.POSAuditLog` — regista automaticamente abrir/linha/enviar/pagar/documento/anular ticket + abrir/movimento/fechar caixa, com operador, **user, IP, referência, valor-antes/depois**; view com filtros). Login já em `auth_engine.AuthEventLog` |

## Cenários de Hotelaria (parte do "concluído")
- **Room Service**: estado do quarto, hora de entrega, piso, elevador, bandeja, taxa de serviço, cobrança no quarto.
- **Minibar**: consumo, reposição, housekeeping, inventário, cobrança automática.
- **Banquetes**: menu contratado, nº convidados, produção em massa, consumo/cobrança por evento.
- **Buffet**: pulseiras, controlo de acessos, preço fixo/por peso, consumos incluídos.

## Critério de conclusão
O POS considera-se concluído quando: os 10 motores estão implementados e integrados, e os cenários
de hotelaria acima funcionam ponta-a-ponta, consumindo dados do ERP central **sem duplicação** e
respeitando licenciamento, permissões e auditoria. A partir daí, o foco passa para **integrações**
entre módulos (PMS, Finance, Warehouse, Operations) em vez de expandir o POS.
