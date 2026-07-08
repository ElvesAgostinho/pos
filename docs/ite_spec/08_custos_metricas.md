# ITE Submódulo 08: Costing Engine & Métricas de Gestão

Este documento foca-se exclusivamente na vertente financeira e analítica do ITE. Um ERP Enterprise distingue-se pela capacidade de custear movimentações com precisão milimétrica, cumprindo normas contabilísticas globais (IFRS/GAAP).

## 1. Objetivo
Garantir a valorimetria do inventário (Quanto vale o meu stock?), assegurar o cálculo da Margem Bruta (Receitas - Custo das Mercadorias Vendidas / CMV) e fornecer inteligência de negócio baseada em Custos.

## 2. Fluxo de Negócio
Entrada de Mercadoria ➔ Costing Engine recálcula o custo unitário do artigo consoante a Política (ex: CMP) ➔ Consumo/Venda no POS ➔ Registo no Ledger com o Custo Unitário exato do momento do consumo ➔ Exportação mensal para a Contabilidade (SAFT/ERP Financeiro).

## 3. Casos de Uso
- **Compra com Variação de Preço:** Tinha 100 garrafas a 5€. Comprei 100 garrafas a 7€. O ITE altera o Custo Médio Ponderado (CMP) do artigo para 6€. A próxima venda já assume o custo de 6€ no P&L.
- **Quebra Financeira:** Uma palete de marisco (Valor de Custo: 1.500€) estraga-se. O ITE gera um evento financeiro para a conta de "Ganhos e Perdas - Quebras F&B".
- **Revisão de Fatura:** O fornecedor emitiu nota de crédito sobre uma compra antiga. O ITE recalcula o CMP retroativamente de forma contabilística sem adulterar o ledger.

## 4. Wireframe Textual
```text
[ ITE - VISÃO FINANCEIRA E CUSTEIO ]
=========================================================
Artigo: [Salmão Fresco] | Política: [Custo Médio Ponderado (CMP)]
Stock Atual: 50 kg | Valor Total do Stock: 750.00€
---------------------------------------------------------
Data       | Transação      | Qtd | Valor Unit | Saldo F.
01-10-2026 | Stock Inicial  | 10  | 10.00€     | 100.00€
15-10-2026 | Compra Makro   | 40  | 16.25€     | 750.00€
16-10-2026 | Consumo Cozinha| -5  | 15.00€     | 675.00€
=========================================================
[ Ver Análise ABC ] [ Exportar Ficha Kardex ]
```

## 5. Interface Completa
Ecrãs densos, orientados a Analistas Financeiros (F&B Controllers). Tabelas com formatação condicional de margens (Ex: Margens abaixo de 60% a vermelho). Possibilidade de fazer "drill-down" de um custo até à fatura de origem que causou a inflação.

## 6. Estrutura do Menu
`Inventário > Controlo Financeiro`
  ┣ `Análise de Custos (CMP / LIFO / FIFO)`
  ┣ `Controlo de Food & Beverage Cost`
  ┣ `Curvas de Rotação (ABC / XYZ)`
  ┗ `Fecho Mensal Contabilístico`

## 7. Formulários
- **Fecho de Período Financeiro:** Formulário que "congela" os custos até àquela data, impedindo edições retroativas que afetem relatórios de meses anteriores.
- **Acerto Manual de Custo (Revaluation):** Alteração forçada do valor patrimonial do stock por imposição contabilística.

## 8. Separadores (Artigo - Ficha Financeira)
- Preços de Fornecedor (Tabela de preços base).
- Histórico de Custeio (Gráfico de linha de inflação do produto).
- Centros de Custo Associados (Onde se consome mais este artigo).

## 9. Todos os Campos
**`ite_costing_ledger`**: `CostID`, `ArticleID`, `TransactionID`, `Qty`, `UnitCost`, `TotalValue`, `CalculationMethod`, `Timestamp`.
**`ite_financial_periods`**: `PeriodID`, `Month`, `Year`, `IsClosed`, `ClosedBy`.

## 10. Validações
- Transações após o `Period Close` são estritamente rejeitadas ou forçadas para o período fiscal seguinte aberto.
- Bloqueio de custos nulos. Um artigo não pode dar entrada a 0.00€ a menos que a Flag `IsFreeSample` seja ativada.

## 11. Regras de Negócio
- **Custo Padrão (Standard Costing):** Para Hotéis em Orçamento rígido, o custo não varia com as faturas. A variação (Purchase Price Variance) vai para uma conta própria para análise de ineficiência do departamento de compras.
- **PEPS (FIFO):** Obrigatório em certas jurisdições. O primeiro lote a entrar dita o custo da primeira unidade a sair.

## 12. Estados do Período Contabilístico
`Open`, `Soft Closed` (Apenas Administradores podem corrigir), `Hard Closed` (Auditoria Fiscal concluída).

## 13. Base de Dados
O `Costing Engine` preenche colunas vitais nas tabelas `ite_transactions` relativas a cêntimos exatos (com 4 a 6 casas decimais para minimizar erros de rounding).

## 14. Relacionamentos
1-1 entre `ite_transactions` e lançamentos gerados no ERP Contabilístico (Mapeamento de Planos de Contas).

## 15. APIs
- `GET /api/ite/financials/cost-variance` (Retorna a inflação do stock).
- `POST /api/ite/financials/periods/close` (Tranca o mês).

## 16. Serviços
- `CostingEngineService`: O "Cérebro" que ouve os eventos de entrada e atualiza o CMP assincronamente (Event-Driven).
- `AccountingExportService`: Agrega 10.000 consumos diários num único "Movimento Agregado de Gasto" para enviar ao SAP/Primavera via SAF-T ou API.

## 17. Eventos
- `CostVarianceSpikeEvent` (Alertar CFO se a Carne subir 20% de um dia para o outro).
- `FinancialPeriodClosedEvent`.

## 18. Auditoria
Qualquer tentativa de acerto forçado de custo é guardada. As autoridades tributárias inspecionam fortemente a manipulação arbitrária de custos (para esconder lucros).

## 19. Logs
Log rigoroso de arredondamentos matemáticos (Rounding Logs) onde "perdas de cêntimos" são empurradas para uma conta-corrente de acertos minúsculos.

## 20. Permissões
- `CAN_CLOSE_FINANCIAL_PERIOD` (Normalmente Diretor Financeiro).
- `CAN_FORCE_COST_UPDATE`.

## 21. Dashboards
- **COGS (Cost of Goods Sold):** O dashboard principal de qualquer gestor hoteleiro. Custo da Comida vendida hoje face ao Orçamento.
- **Curva ABC (Princípio de Pareto):** Os 20% de produtos que representam 80% do valor imobilizado nos armazéns.

## 22. Relatórios
- **Extrato de Kardex com Custo (Folha de Existências):** Requerido legalmente anualmente.
- **Relatório de Imobilização de Capital (Slow Movers):** Artigos que não rodam há 180 dias e estão a empatar capital na cave.

## 23. Configurações
- Modo de custeio base do Hotel (CMP, FIFO, Standard).
- Mapeamento de Planos Oficiais de Contas (SNC em Portugal).

## 24. Automatizações
- Re-cálculo noturno. Se uma fatura retroativa for lançada (esquecida numa gaveta), o sistema deve recalcular todo o CMP daí para a frente num "Night Audit Job".

## 25. Performance
Calcular o FIFO em tabelas com milhões de linhas requer stored procedures altamente otimizadas na Base de Dados.

## 26. Segurança
Acesso ao módulo financeiro severamente limitado. O staff operacional vê quantidades (Stock Atual = 10), mas não vê valores (Valor do Stock = Oculto).

## 27. Escalabilidade
O fecho do mês num grupo com 100 hotéis pode demorar horas. Deve ser um Job distribuído, executado na Cloud no primeiro dia do mês às 01:00 AM.

## 28. Integrações
- ERPs Financeiros Tradicionais (Sage, Primavera, SAP FI/CO, Oracle Netsuite).

## 29. Feature Flags
`strict_period_closing`, `enable_live_cogs_calculation`.

## 30. Licenciamento
Módulo "Enterprise Cost Control & BI".

## 31. Checklist Funcional
- [ ] O sistema processa devoluções de vendas anulando o custo original da transação e não o CMP atual?
- [ ] Lançar descontos comerciais ou rappels afeta corretamente a diluição do preço de aquisição?

## 32. Checklist Técnico
- [ ] O `CostingEngineService` mantém até à 6ª casa decimal durante as contas para evitar que `3.333 * 3 != 10.00`?

## 33. Checklist UX
- [ ] Relatórios financeiros exportáveis nativamente para Excel (`.xlsx`) sem perder formatação condicional?

## 34. Checklist QA
- [ ] Comprar a 10€, vender 1. Comprar a 20€. Qual é o custo da próxima venda (CMP)? Validar lógica matemática rigorosa.

## 35. Melhorias Futuras
- Integração de Modelos Preditivos AI para sugerir subidas de preços de ementa antes que a inflação das compras corroa a margem da empresa.
