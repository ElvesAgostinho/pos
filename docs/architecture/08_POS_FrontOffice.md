# 08 · POS FrontOffice (POS Enterprise Operations)

> O programa do **operador**. **Vende.** Não altera configurações (essas vêm do 07 · POS Management).
> Consome dados do BackOffice (Master Data, Warehouse, PMS, Finance) sem duplicar.

## Ciclo operacional completo (nível Oracle Simphony / NCR Aloha / Primavera POS)

```
Login do Operador → Valida Licença → Valida Permissões → Seleção Hotel/Outlet/Terminal
→ Abertura de Caixa → Início da Sessão → Mapa de Mesas → Registo de Pedidos
→ Envio para Cozinha/Bar (KDS/Impressão) → Produção → Pedido Pronto → Fecho da Conta
→ Pagamento → Atualiza Stock → Atualiza Financeiro → Movimentos de Caixa → Fecho de Caixa
→ Relatórios → Logout
```

## 1. Login do Operador
PIN · Cartão RFID/NFC · Utilizador+password · Biometria (opc.) · Seleção Hotel/Outlet/Terminal ·
Validação de Licença, Permissões, Turno e Sessão.
> **Estado:** login por PIN e por credenciais implementados (`auth_engine`). Cartão/biometria: roadmap.

## 2. Abertura de Caixa (OBRIGATÓRIO)
Selecionar caixa · verificar disponibilidade/sessão aberta · operador autorizado · **fundo inicial**
(contagem de notas/moedas/cheques/vouchers, float por moeda) · hora/operador/supervisor · comprovativo · auditoria.
**Validações:** caixa já aberta, fundo abaixo do mínimo/acima do permitido, terminal bloqueado, licença inválida, turno encerrado, sem permissão.
> **Estado:** ✅ Motor de Caixa implementado (`pos.CashSession`).

## 3. Sessão de Trabalho
Estado da caixa · tempo de sessão · operador · terminal · total vendido · contas abertas · pedidos pendentes.

## 4. Operação de Venda
Mesas · pedidos (criar/alterar) · modificadores · combos · menus · observações p/ cozinha ·
transferir/unir/separar mesas · dividir contas · suspender/reabrir · cancelamentos · estornos autorizados ·
pré-conta · fecho da conta.

## 5. Movimentos de Caixa
**Sangria** (valor/motivo/destino/aprovação/comprovativo) · **Reforço** · **Entrada manual** · **Saída manual** · Correções autorizadas.
> **Estado:** ✅ implementado (`pos.CashMovement`).

## 6. Pagamentos
Dinheiro · Cartão · Conta Quarto · Conta Empresa · Voucher · Gift Card · misto · parcial ·
divisão por pessoas/itens · troco · estorno · reembolso.
> Consome os **métodos autorizados por outlet** (07). Fluxo de venda: roadmap.

## 7. Fecho de Caixa
Contagem física (notas/moedas/cheques/vouchers/gift cards) · **Reconciliação** (esperado vs contado, diferença, justificação, aprovação supervisor) ·
Relatórios (vendas/descontos/estornos/cancelamentos/sangrias/reforços/formas de pagamento/produtos/operador/caixa/terminal) ·
Encerramento (fechar sessão/caixa, bloquear vendas, atualizar Financeiro/Auditoria/Relatórios).
> **Estado:** ✅ fecho + reconciliação implementados.

## 8. Avançado
Reservas/lista de espera · mudança/divisão/união de mesas · transferência entre operadores/caixas ·
pedidos em espera · reimpressão · gestão de clientes · descontos autorizados · gorjetas ·
consulta KDS/bar/stock (informativo)/estado de quartos/crédito de cliente/saldo de gift card.

## Cenários específicos de Hotelaria (obrigatórios)
- Transferir conta para **quarto** (integração PMS).
- Dividir conta entre **hóspede e empresa**.
- Lançar consumos no **minibar**.
- Cobrar **spa/banquetes** na conta do quarto.
- Mesas ocupadas + reservas em simultâneo.

Ver **[09_POS_Operations_Engine.md](09_POS_Operations_Engine.md)** para o detalhe dos 10 motores.
