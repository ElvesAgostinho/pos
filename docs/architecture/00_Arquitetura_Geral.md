# Hospitality ERP Enterprise — Master Architecture

> Documento de referência **obrigatório** para todo o desenvolvimento do ERP (POS + BackOffice).
> Inspirado em Oracle Hospitality OPERA/Simphony, NCR Aloha, Agilysys, Infor HMS e Primavera ERP.
> Qualquer agente/dev deve receber **este documento + o do módulo específico** antes de desenvolver.

## Princípios OBRIGATÓRIOS

1. **Single Source of Truth** — cada entidade existe uma só vez. Cadastros **apenas no Master Data**.
2. **Separação Cadastro vs Operação** — os módulos operacionais *consultam*, nunca recadastram.
3. **Arquitetura Modular** — cada módulo ativável/desativável por **licença** (gating).
4. **Configuração Hierárquica** — `Global → Empresa → Hotel → Outlet → Sala → Terminal → Caixa → Operador`.
5. **Auditoria Completa**, **Permissões Granulares (RBAC/ABAC)**, **Workflows configuráveis**.
6. **Multi**: empresa, hotel, outlet, terminal, idioma, moeda.
7. **PCC ≠ BackOffice** — licenciamento e provisionamento vivem **só** no Platform Control Center
   (consola do fornecedor, `frontend_pcc/` + app `clm`). O BackOffice do ERP **apenas valida/consome**
   a sua licença (`licensing.offline_validator`), nunca a gere.
8. **POS**: o BackOffice **configura**, nunca vende; o FrontOffice **vende**, nunca configura.
   O POS é *consumidor* dos dados do BackOffice.

Nenhum módulo pode duplicar dados de outro. Toda a comunicação é por serviços internos.

## Fluxo geral dos módulos

```
Platform Foundation → Master Data → SRM → Supply Chain & Procurement → Warehouse Enterprise
→ Hospitality Operations → POS Management → POS FrontOffice → PMS → Finance → Reporting
```

## Os 12 módulos (donos e responsabilidades)

| # | Módulo | Responsabilidade | Dono de (entidades) |
|---|--------|------------------|---------------------|
| 1 | Platform Foundation | Infra: config global, auditoria, logs, API, docs, monitorização | — |
| 2 | **Master Data** | **Único** local de cadastro | Empresas, Hotéis, Deptos, Áreas, Armazéns, Fornecedores, Clientes, Artigos, Famílias, Categorias, Marcas, Unidades, Impostos, Moedas, Métodos de Pagamento, Bancos, Países… |
| 3 | Supplier Relationship (SRM) | Relação com fornecedores (não cadastra) | Contratos, Acordos, Performance, Avaliações |
| 4 | Supply Chain & Procurement | Compras | Requisições, RFQ, **Ordens de Compra**, **GRN**, Devoluções, Faturas |
| 5 | Warehouse Enterprise | Gestão física do inventário | Stock, Movimentos, Transferências, Lotes/Validades, Inventários, Custeio |
| 6 | Hospitality Operations | Produção | Receitas, Semiacabados, Ordens de Produção, KDS, HACCP, Yield, Desperdícios |
| 7 | POS Management (BackOffice) | Configura o POS (não vende) | Outlets, Mesas, Terminais, Layouts, Produtos POS, Routing, Config. Fiscal |
| 8 | POS FrontOffice | Operação de venda (não configura) | Venda, Pedidos, Pagamentos, Caixa, Turno |
| 9 | PMS | Gestão hoteleira | Reservas, Check-in/out, Quartos, Housekeeping, Night Audit |
| 10 | Finance | Financeiro | Caixas, Tesouraria, Faturação, Centros de Custo |
| 11 | Security Center | Segurança | RBAC, Permissões, ABAC, Sessões, Tokens |
| 12 | Workforce Administration | Pessoas | Colaboradores, Operadores POS, Turnos |

## Regra do Fornecedor (exemplo do princípio)

O **Fornecedor** é criado **apenas** no Master Data. O SRM gere o *relacionamento*
(contratos/performance), o Supply Chain cria *ordens de compra*, o Warehouse *recebe*,
o Finance *paga*. Todos referenciam o mesmo registo `esm.Supplier`. **Nunca há segundo cadastro.**

## Como funciona uma venda (POS)

```
Login → valida Licença → valida Permissões → carrega Hotel/Outlet/Terminal/Layout
→ carrega Produtos permitidos → consulta Warehouse/Operations/PMS → apresenta POS
Venda: Produto → Receita → Stock → Reserva → Kitchen Routing → Pedido → Impostos
→ Promoções/Descontos → Pagamento (métodos permitidos) → Movimento Financeiro
→ atualiza Caixa/Warehouse/Auditoria
```

## Estado de implementação (fonte da verdade: o código)

- **Reais:** Master Data (Artigos, Categorias, Unidades, Impostos, Marcas, Fornecedores),
  Workforce (Colaboradores/Operadores/Turnos), Security (RBAC/Permissões/ABAC),
  SRM (Dashboard/Performance + motor de scoring), Hospitality Operations (Receitas/Estações + custeio),
  **Supply Chain (Ordens de Compra + Receção GRN)**, Autenticação (login credenciais + PIN).
- **Roadmap:** Warehouse Enterprise, PMS, Finance, POS Management/FrontOffice completos,
  e a maioria dos submenus de Platform Foundation.

## Ficheiros-chave

- Navegação (12 módulos, data-driven): `frontend/src/config/navigation.tsx`
- Registo canónico de módulos + gating: `backend/core/modules.py`, `backend/erp_server/settings.py`
- Licenciamento assimétrico (RSA): `backend/licensing/engine/crypto.py`
- Consola do fornecedor (PCC): `frontend_pcc/` + `backend/clm/`
