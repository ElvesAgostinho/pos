# 07 · POS Management (BackOffice)

> Configura o POS. **NÃO vende.** Consome entidades do Master Data (Artigos, Métodos de Pagamento);
> nunca as recria. A venda ocorre no **08 · POS FrontOffice**.

## Hierarquia de configuração (obrigatória)
`Global → Empresa → Hotel → Outlet → Sala → Terminal → Caixa → Operador` — o nível inferior
pode substituir o superior quando autorizado.

## Entidades (estado atual)

| Entidade | App/Modelo | Estado | Dono / Fonte |
|----------|-----------|--------|--------------|
| **PaymentMethod** | `mdm.PaymentMethod` | ✅ | **Master Data** (fonte única) |
| **Outlet** | `pos.Outlet` | ✅ | POS Management |
| **POSProductConfig** | `pos.POSProductConfig` | ✅ | POS Management (consome `inventory.Item`) |
| **OutletPaymentMethod** | `pos.OutletPaymentMethod` | ✅ | POS Management (consome `mdm.PaymentMethod`) |
| Terminais, Salas, Mesas, Layouts, KDS Routing, Impressoras | — | roadmap | POS Management |

### Regras aplicadas
- **Produtos POS**: o artigo vive no Master Data; o POS só define disponibilidade, **preço
  específico (override opcional)**, categoria POS e ordem por **outlet**. `effective_price =
  pos_price ?? item.sale_price`.
- **Métodos de Pagamento**: criados no Master Data; o POS apenas **autoriza** quais ficam
  disponíveis por outlet (`OutletPaymentMethod`). O FrontOffice mostra só os autorizados no contexto.

## APIs
- Master Data: `GET/POST /api/mdm/payment-methods/`
- POS: `/api/pos/outlets/`, `/api/pos/product-configs/?outlet=`, `/api/pos/outlet-payment-methods/?outlet=`

## Frontend (módulo 9 · POS Configuration Center)
- `Outlets` → `posmgmt/OutletsView`
- `POS Product Config` → `posmgmt/POSProductConfigView` (consome artigos do Master Data)
- `Métodos de Pagamento` (por outlet) → `posmgmt/OutletPaymentsView`
- Master Data → `Métodos de Pagamento` → `masterdata/PaymentMethodsView`

## Roadmap deste módulo
Terminais (config completa), Salas/Mesas/Mapas, Layout/Keyboard Designer, Combos/Modificadores/Extras,
Kitchen/Bar Routing + KDS, Caixa (sessões/turnos/fundos/fechos), Config. Fiscal (séries/documentos),
Promoções/Happy Hour, canais (Delivery/TakeAway/QR/Self-Ordering). Depois: **08 · POS FrontOffice** (venda).
