# 10 · PMS & Financeiro — Módulos Enterprise

Dois módulos opcionais (gated por licença: `pms`, `finance`) que fecham o ciclo hoteleiro e
financeiro. Consomem o Master Data (Hotel, PaymentMethod) — nunca recriam organização.

## PMS — Property Management System (`api/pms/`)

| Entidade | Papel |
|----------|-------|
| `Guest` | Hóspede — fonte única do cliente-hóspede. |
| `RoomType` | Tipologia (capacidade, tarifa base). |
| `Room` | Quarto físico + estado housekeeping (`VACANT_CLEAN`/`VACANT_DIRTY`/`OCCUPIED`/`OOO`). |
| `Reservation` | Reserva com estados `BOOKED→CHECKED_IN→CHECKED_OUT` (+`CANCELLED`/`NO_SHOW`). |
| `Folio` | Conta do hóspede (charges + pagamentos, saldo calculado). |
| `FolioCharge` | Movimento do folio (`ROOM`/`FNB`/`TAX`/`MISC`/`PAYMENT`). |

**Fluxo verificado:** `check_in` (atribui quarto livre → `OCCUPIED`, abre folio, lança a diária ×
noites) → cobranças (incl. **F&B vindo do POS**) → `settle` → `check_out` (exige saldo 0, quarto →
`VACANT_DIRTY`, folio `CLOSED`). Endpoints: `reservations/{id}/check_in|check_out|cancel`,
`folios/{id}/post_charge|settle`, `rooms/{id}/set_status`.

## Financeiro & Tesouraria (`api/finance/`)

| Entidade | Papel |
|----------|-------|
| `FinanceAccount` | Conta de tesouraria (caixa/banco). **Saldo = abertura + recebimentos confirmados − pagamentos confirmados.** |
| `Receipt` | Recebimento (AR) — `DRAFT→CONFIRMED`. |
| `PaymentVoucher` | Pagamento (AP) — valida saldo ao confirmar. |
| `Invoice` + `InvoiceLine` | Faturação (AR) com IVA por linha — `DRAFT→ISSUED→PAID`. |
| `CostCenter` | Centro de custo (imputação). |

**Verificado:** recebimento confirmado credita a conta; pagamento confirmado debita (bloqueia se
saldo insuficiente); fatura recalcula base+IVA e emite. Endpoints: `receipts/{id}/confirm|cancel`,
`payments/{id}/confirm|cancel`, `invoices/{id}/issue|mark_paid|cancel`.

## Integração POS ↔ PMS (Motor 6/8)

A ação `pos/tickets/{id}/charge_to_room` procura um **folio aberto** do quarto e lança uma
`FolioCharge` do tipo `FNB` (referência = nº do ticket), marcando o ticket como pago. É a cobrança
no quarto ponta-a-ponta, testada no smoke test (`folio.charges_total` sobe com o consumo do POS).

> Nota de honestidade: ambos os módulos entregam o **núcleo transacional real e verificado**. Ficam
> como roadmap as extensões enterprise: night audit automático, channel manager/tarifários dinâmicos
> (PMS) e conciliação bancária, IVA/SAF-T e razão geral completo (Finance).
