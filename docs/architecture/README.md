# Documentação de Arquitetura — Hospitality ERP Enterprise

Referência viva do ERP. **Regra:** cada agente/dev recebe sempre **[00_Arquitetura_Geral](00_Arquitetura_Geral.md)** + o documento do módulo em que vai trabalhar.

## Índice

| Doc | Módulo | Estado |
|-----|--------|--------|
| [00_Arquitetura_Geral.md](00_Arquitetura_Geral.md) | Princípios, 12 módulos, single-source, PCC≠backoffice, hierarquia POS | ✅ |
| 01_Platform_Foundation.md | Infra, config, auditoria, API, docs | a redigir |
| 02_Master_Data.md | Cadastros (fonte única) | a redigir |
| 03_Supplier_Relationship_Management.md | Relação com fornecedores | a redigir |
| 04_Supply_Chain.md | Compras (PO, GRN, RFQ) | a redigir |
| 05_Warehouse_Enterprise.md | Inventário físico, lotes, custeio | a redigir |
| 06_Hospitality_Operations.md | Produção, receitas, KDS, HACCP | a redigir |
| [07_POS_Management.md](07_POS_Management.md) | Configuração do POS (BackOffice) | ✅ |
| [08_POS_FrontOffice.md](08_POS_FrontOffice.md) | Operação de venda (ciclo do operador) | ✅ |
| [09_POS_Operations_Engine.md](09_POS_Operations_Engine.md) | Os 10 motores do POS + cenários hotelaria | ✅ |
| [10_PMS_Finance.md](10_PMS_Finance.md) | PMS (reservas/quartos/folios) + Financeiro (tesouraria/AR/AP) | ✅ |
| 11_Seguranca.md | RBAC/ABAC, sessões | a redigir |
| 12_Workflows.md | Aprovações, estados | a redigir |

> Os specs funcionais detalhados por submódulo continuam em `docs/ite_spec/` e `docs/edc_spec/`.
