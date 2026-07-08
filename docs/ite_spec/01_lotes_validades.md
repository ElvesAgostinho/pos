# ITE Submódulo 01: Lotes e Validades (FEFO / FIFO)

Este documento descreve a especificação técnica e funcional do submódulo de Lotes e Validades do Enterprise Inventory Transaction Engine (ITE), otimizado para o setor da Hotelaria.

## 1. Objetivo
Garantir a rastreabilidade total de produtos perecíveis e de elevado valor, assegurando a rotação correta de stock (FEFO - First Expire, First Out e FIFO - First In, First Out) para mitigar desperdícios alimentares, garantir a segurança sanitária (HACCP) e respeitar a conformidade legal.

## 2. Fluxo de Negócio
Receção de Mercadoria ➔ Registo do Lote e Data de Validade ➔ Armazenamento ➔ Consumo/Venda/Transferência (Motor aloca automaticamente o lote mais antigo/próximo a expirar) ➔ Bloqueio automático de Lotes expirados ➔ Alerta de Validade Próxima.

## 3. Casos de Uso
- **Receção de F&B:** Chefe de Cozinha regista 50kg de Carne com Lote "L-9982" e Validade "30-10-2026".
- **Preparação/Consumo:** Cozinheiro consome 10kg de Carne; o ITE abate automaticamente os 10kg do Lote "L-9982" (FEFO).
- **Auditoria Sanitária:** Inspetor requer o histórico de um lote de Marisco servido num Banquete. O sistema rastreia do Prato servido até à Fatura do Fornecedor.

## 4. Wireframe Textual
```text
[ ITE - GESTÃO DE LOTES E VALIDADES ]
=========================================================
Filtros: [Artigo] [Armazém] [Estado do Lote]
---------------------------------------------------------
Lote     | Artigo        | Validade   | Qtd | Estado
L-1001   | Leite Magro   | 15-08-2026 | 50L | [Ativo]
L-1002   | Salmão Fresco | 08-07-2026 | 0kg | [Esgotado]
L-1003   | Ovos          | 01-07-2026 | 120 | [Expirado]
=========================================================
[ Bloquear Lote ] [ Ver Histórico do Lote ]
```

## 5. Interface Completa
A interface será baseada em Grids de alta densidade (DataTables) com formatação condicional (Amarelo para validade < 7 dias, Vermelho para Expirado). Painel lateral deslumbravel para visualizar a genealogia do lote (árvore de rastreabilidade).

## 6. Estrutura do Menu
`Inventário > Rastreabilidade > Lotes e Validades`
  ┣ `Painel de Lotes Ativos`
  ┣ `Monitor de Validades (Expiram Brevemente)`
  ┗ `Pesquisa de Genealogia (Recall)`

## 7. Formulários
- **Edição de Lote:** Atualização de Temperatura à receção, adição de Certificados HACCP anexos.
- **Divisão de Lote (Split):** Formulário para dividir um lote mestre em sub-lotes para distribuição por múltiplos hotéis.

## 8. Separadores
Na Ficha de Artigo:
- Aba Geral
- Aba Custeio
- **Aba Rastreabilidade** (Ativa checkbox: `Controlar Lote?`, `Controlar Validade?`, `Dias de Alerta Previsto`).

## 9. Todos os Campos (Tabela `ite_lots`)
`LotID`, `ArticleID`, `LotNumber`, `SupplierID`, `OriginCountry`, `ProductionDate`, `ReceptionDate`, `ExpiryDate`, `InitialQty`, `CurrentQty`, `Status`, `ResponsibleUserID`, `TemperatureControl`, `Notes`.

## 10. Validações
- Validade inserida não pode ser inferior à data atual na Receção.
- Não é possível dar saída de um Lote com Estado "Bloqueado" ou "Quarentena".
- Lotes não podem ter nomes duplicados para o mesmo Fornecedor e Artigo.

## 11. Regras de Negócio
- **Auto-FEFO:** O Motor, ao receber um pedido de saída sem Lote especificado (Ex: Consumo do Minibar), cativa as quantidades do lote com data de validade mais próxima.
- **Hard Block:** Venda de produto com Lote Expirado gera um `Hard Block` (Transação Rejeitada no POS/Motor).

## 12. Estados do Lote
`Ativo`, `Expirado`, `Bloqueado` (Revisão da Qualidade), `Quarentena` (Aguardar análises laboratoriais), `Esgotado`.

## 13. Base de Dados
- Tabela `ite_lots`
- Tabela `ite_lot_transactions` (Tabela pivô que cruza a tabela Ledger `ite_transactions` com as quantidades efetivamente consumidas de cada lote).

## 14. Relacionamentos
- `ite_transactions` 1-N `ite_lot_transactions`
- `ite_lots` 1-N `ite_lot_transactions`
- `ite_lots` N-1 `mdm_articles`

## 15. APIs
- `GET /api/ite/lots/expiring?days=7`
- `POST /api/ite/lots/{lotId}/block`
- `GET /api/ite/lots/traceability/{lotId}`

## 16. Serviços
- `LotAllocationService`: Decide de que Lotes abater o stock durante um consumo.
- `ExpiryMonitorService`: Cronjob que muda o Status para Expirado à meia-noite.

## 17. Eventos
- `LotExpiredEvent`
- `LotLowQtyEvent`
- `LotCreatedEvent`

## 18. Auditoria
Todas as mudanças de Estado do Lote (Ex: Passar de Ativo para Quarentena) registam na tabela genérica `ite_audit_logs` (UserID, Timestamp, LoteID, Motivo Obrigatório).

## 19. Logs
Logs detalhados de tentativas falhadas de vender produtos de Lotes bloqueados (crucial para investigações internas).

## 20. Permissões
- `CAN_BYPASS_EXPIRY_BLOCK` (Normalmente apenas Diretores F&B).
- `CAN_EDIT_LOT_EXPIRY`.

## 21. Dashboards
- Widget: "Top 10 Produtos a Expirar nesta Semana".
- Gráfico: Percentagem de Quebra vs Consumo por Produto Perecível.

## 22. Relatórios
- **Relatório de Validades:** Lista de artigos a expirar filtrada por Armazém (Restaurante, Bar Principal).
- **Relatório de Recall de Lote:** Onde estão (e onde foram consumidas) as garrafas do Vinho X Lote Y.

## 23. Configurações
- Política padrão de Rotação (Configurável por Categoria de Artigo: F&B = FEFO, Manutenção = FIFO).
- Ativação obrigatória de código de barras bidimensional (ex: GS1-128) para scannear lotes.

## 24. Automatizações
- Envio de Email/Notificação ao Chefe de Cozinha sempre que um lote de carne/peixe atinge 48h de validade.

## 25. Performance
Índices otimizados nas tabelas de saldos e lotes (`ArticleID`, `ExpiryDate`) para que o algoritmo de Auto-FEFO não crie latência na venda do POS.

## 26. Segurança
Impossibilidade absoluta de eliminar um Lote que já possua movimentos associados no Ledger (Apenas Arquivar/Esgotar).

## 27. Escalabilidade
Estrutura preparada para lidar com milhares de lotes gerados diariamente numa cadeia hoteleira (Room Service, Bares). Dados de lotes antigos (Esgotados + 5 anos) são arquivados para Data Lakes (Cold Storage).

## 28. Integrações
- PMS e F&B POS: Quando um hóspede pede uma refeição, o sistema de Cozinha (KDS) abate o lote via ITE.

## 29. Feature Flags
`enable_auto_fefo_allocation`, `strict_quarantine_mode`.

## 30. Licenciamento
Funcionalidade nativa da licença "Advanced F&B" do ERP.

## 31. Checklist Funcional
- [ ] O sistema aloca o lote de leite mais antigo no POS?
- [ ] O sistema bloqueia a venda se o lote expirar no próprio dia?

## 32. Checklist Técnico
- [ ] A trigger de `LotAllocationService` consegue dividir 1 transação por 2 lotes (ex: vendi 5 unidades, 3 do lote antigo, 2 do novo)?

## 33. Checklist UX
- [ ] A cor vermelha alerta de forma visível produtos perigosos para consumo?

## 34. Checklist QA
- [ ] Forçar venda num POS offline -> sincronizar -> verificar se o Lote já não estava esgotado no servidor.

## 35. Melhorias Futuras
- Integração de IoT (Sensores de Temperatura nas arcas). Se a arca quebrar a cadeia de frio, o ERP muda automaticamente o Lote para Quarentena baseado no sensor IoT.
