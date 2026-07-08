# ITE Submódulo 02: Produção & Receitas Técnicas (F&B / Assemblagem)

Este documento descreve a especificação do motor de transformação e produção do ITE, focando no desdobramento de Receitas Técnicas (BOM - Bill of Materials) e impacto direto no inventário e custeio.

## 1. Objetivo
Gerir a transformação de matérias-primas (ingredientes) em produtos acabados ou semi-acabados (sub-receitas), assegurando o cálculo exato do custo do prato (Food Cost), registo de desperdícios e abate correto e atómico de inventário através do ITE.

## 2. Fluxo de Negócio
Definição de Receita Técnica (com quebras/rendimentos) ➔ Ordem de Produção (Eventos/Banquete) ou Consumo Direto (POS) ➔ Explicação do ITE ➔ Abate dos Ingredientes no Armazém Origem ➔ Entrada do Produto Acabado no Armazém Destino (se aplicável) ➔ Custeio Final do Produto.

## 3. Casos de Uso
- **Venda de Prato (POS):** POS vende "Bife à Portuguesa". O ITE recebe o evento, consulta a Receita, e dá baixa de 250g de Carne, 150g de Batata e 50ml de Azeite.
- **Preparação de Banquetes:** O Chefe Executivo ordena a produção de 50 litros de "Sopa de Legumes". O ITE dá baixa de caixas inteiras de vegetais e cria 50L de Sopa no armazém "Cozinha Central", ajustando o Food Cost com base na quebra de descasque.
- **Transformação em Talho:** Compra de "Vaca Inteira", desmancha em "Bifes", "Carne Picada" e "Ossos (Desperdício)".

## 4. Wireframe Textual
```text
[ ITE - RECEITA TÉCNICA E PRODUÇÃO ]
=========================================================
Produto Final: [Hamburguer Premium] | Rendimento: 1 Un
Custo Atual Calculado: 2.45€ | Margem Desejada: 75%
---------------------------------------------------------
Ingrediente       | Qtd Bruta | % Quebra | Qtd Líquida | Custo
Pão Brioche       | 1 un      | 0%       | 1 un        | 0.40€
Carne Picada      | 220g      | 10%      | 200g        | 1.80€
Queijo Cheddar    | 2 fatias  | 0%       | 2 fatias    | 0.25€
---------------------------------------------------------
[ Simular Produção ] [ Ordem de Fabrico ]
```

## 5. Interface Completa
Grid interativa (Master-Detail). O Master é o Produto Final (Prato/Receita). O Detail é a listagem de ingredientes (Matérias-Primas ou Sub-Receitas). Suporta drag-and-drop de ingredientes do catálogo e cálculo de custos dinâmico (live-update).

## 6. Estrutura do Menu
`Inventário > Produção`
  ┣ `Receitas Técnicas (Fichas Técnicas)`
  ┣ `Ordens de Produção (Banquetes/Preparação)`
  ┗ `Painel de Food Cost / Engenharia de Menus`

## 7. Formulários
- **Criação de Receita:** Produto Final, Categoria, Armazém Default, Fator de Rendimento, Modo de Preparação.
- **Ordem de Produção:** Formulário onde o Chefe diz "Vou produzir 100 doses da Receita X. Abater do Armazém Y".

## 8. Separadores (Receita Técnica)
- Ingredientes
- Custos (Despesas adicionais, como Mão-de-Obra ou Eletricidade se aplicável ao Standard Costing)
- Preparação (Texto HACCP / Imagens)
- Alergénios (Calculados automaticamente através dos ingredientes)

## 9. Todos os Campos (Tabelas Base)
**`ite_recipes`**: `RecipeID`, `FinalArticleID`, `TargetYieldQty`, `UoM`, `PreparationTime`, `TotalCost`.
**`ite_recipe_lines`**: `LineID`, `RecipeID`, `IngredientArticleID`, `GrossQty`, `WastePercentage`, `NetQty`, `UoM`.
**`ite_production_orders`**: `OrderID`, `RecipeID`, `PlannedQty`, `ProducedQty`, `SourceLocationID`, `DestLocationID`, `Status`.

## 10. Validações
- Prevenir Loop Infinito (Ingrediente A tem Receita B que usa Ingrediente A).
- Impossível criar ordem de produção se `AllowNegativeStock == false` e faltar ingrediente crítico.

## 11. Regras de Negócio
- **Cálculo de Food Cost em Tempo Real:** O Custo do Prato varia sempre que o fornecedor sobe o preço da batata (se método de custeio for CMP ou Last Price).
- **Auto-Produção (Phantom BOM):** Se o Hotel vende uma "Tábua de Queijos", o ITE nunca armazena a "Tábua", desconta instantaneamente os 5 queijos ao invés de fabricar a Tábua e vender depois.

## 12. Estados da Produção
`Draft` (Planeamento), `Released` (Autorizada para a Cozinha), `In-Progress` (Stock dos ingredientes Cativado), `Completed` (Custo apurado, Stock Abatido), `Cancelled`.

## 13. Base de Dados
- As ordens geram linhas em `ite_transactions` do tipo `Transformation/Production`.

## 14. Relacionamentos
`mdm_articles` (Prato) 1-1 `ite_recipes` 1-N `ite_recipe_lines` N-1 `mdm_articles` (Ingrediente).

## 15. APIs
- `GET /api/ite/recipes/{id}/cost-simulation` (Retorna o custo atual do prato baseado no CMP dos ingredientes).
- `POST /api/ite/production/execute` (O ITE processa a baixa em massa).

## 16. Serviços
- `BOMExplosionService`: Algoritmo complexo que desdobra Receitas que chamam Sub-Receitas que chamam Sub-Sub-Receitas (Ex: Menu -> Prato -> Molho -> Base de Carne).

## 17. Eventos
- `ProductionCompletedEvent`
- `CostVarianceAlertEvent` (Disparado quando a margem do prato cai abaixo de X%).

## 18. Auditoria
O ITE regista sempre a versão exata da receita utilizada no momento da produção. Se o Chef mudar a receita amanhã, o custo produzido hoje não sofre alterações retrospectivas.

## 19. Logs
Log específico de perdas no processo produtivo (Waste Log).

## 20. Permissões
- `CAN_CREATE_RECIPE` (Chef Executivo, Controller F&B).
- `CAN_EXECUTE_PRODUCTION` (Cozinheiros).

## 21. Dashboards
- Matriz de Engenharia de Menus (Estrelas, Cavalos de Batalha, Quebra-Cabeças, Cães). Cruzamento entre Volume de Vendas vs Margem de Lucro (Food Cost).

## 22. Relatórios
- **Relatório de Desperdícios (Yield Report):** % de quebra teórica vs quebra real reportada pela cozinha.
- **Lista de Preparação:** Agregação de ingredientes necessários para 5 Banquetes amanhã.

## 23. Configurações
- Inclusão automática de X% de custo de embalagem nos pratos marcados para "Take-Away/Room Service".

## 24. Automatizações
- Atualização em massa de preços de ementas baseada na inflação do Custo dos Ingredientes.

## 25. Performance
A "BOM Explosion" para um resort com 50 restaurantes e 3000 receitas requer cache estrutural (Redis Graph) para evitar queries pesadas ao desdobrar um Buffet inteiro a cada transação do POS.

## 26. Segurança
Alterações de Rendimentos (%) da Receita obrigam a aprovação dupla (Controller Financeiro + Chef).

## 27. Escalabilidade
Desacoplar a `BOMExplosionService` como um worker assíncrono para picos no Verão, não bloqueando o UI do POS enquanto a cozinha desconta 200 pratos do Banquete.

## 28. Integrações
Balanças inteligentes de cozinha (Integração IoT) que transmitem o desperdício real (cascas) diretamente para o motor do ITE.

## 29. Feature Flags
`enable_yield_variance_tracking`, `allow_pos_auto_production`.

## 30. Licenciamento
Módulo "F&B Production & Cost Control".

## 31. Checklist Funcional
- [ ] O sistema desconta a sub-receita e os seus próprios ingredientes recursivamente?
- [ ] O custo contabiliza desperdícios brutos (Peso Bruto vs Líquido)?

## 32. Checklist Técnico
- [ ] Limite de recursividade de Receitas definido (ex: Max Depth = 5) para prevenir stack overflows?

## 33. Checklist UX
- [ ] O Chef tem um simulador visual de impacto no preço ao arrastar um ingrediente premium para o prato?

## 34. Checklist QA
- [ ] Testar produção de 0.0001 Litros de um ingrediente (Problemas de arredondamento em SQL e Javascript).

## 35. Melhorias Futuras
- Inteligência Artificial para gerar Receitas Técnicas otimizando ingredientes com prazo de validade a terminar (Menu Engineering "Prato do Dia").
