# ITE Submódulo 05: Inventários (Contagens Físicas e Cíclicas)

Este documento especifica a mecânica rigorosa com que o ERP faz as validações físicas do inventário. O objetivo é aproximar a contagem real ao stock teórico através de acertos de stock escrupulosamente justificados.

## 1. Objetivo
Permitir reconciliações físicas garantindo que a base de dados do ITE reflete com exatidão os artigos presentes nos armazéns, bares e restaurantes. Suporta inventários mensais totais ou contagens rotativas (cíclicas) contínuas sem paralisar a operação do hotel.

## 2. Fluxo de Negócio
Criar Plano de Inventário ➔ Bloquear Secção (Opcional) ➔ Operadores contam às cegas (1ª Contagem) ➔ Gestor revê discrepâncias ➔ Se houver furos graves, pedir 2ª Contagem ➔ Aprovação Financeira ➔ ITE gera movimentos de Ajuste (Positivo ou Negativo) ➔ Stock atualizado.

## 3. Casos de Uso
- **Inventário de Fim de Mês F&B:** O F&B Manager fecha todos os restaurantes no dia 31 às 02h00. Todas as garrafas e comida são pesadas e contadas.
- **Inventário Cíclico Diário:** A cada dia, o sistema seleciona aleatoriamente 5 artigos da Curva A (Alto Valor) para o fiel de armazém contar, garantindo que os erros são apanhados imediatamente (Ex: Contar Lagosta à 3ª feira, Caviar à 5ª feira).
- **Inventário Cego:** O barman entra a quantidade de garrafas de Gin, sem saber quantas o sistema diz que lá deveriam estar.

## 4. Wireframe Textual
```text
[ ITE - CONTAGEM DE INVENTÁRIO FÍSICO ]
=========================================================
Local: [Bar da Piscina] | Estado: [Aberto para Contagem]
Data/Hora: [31-10-2026 01:00]
---------------------------------------------------------
Artigo               | Qtd Sistema | Qtd Contada | Desvio
Garrafa Gin X (1L)   |  ( Oculto ) | [   4.5   ] | + / - ?
Garrafa Rum Y (0.7L) |  ( Oculto ) | [   2.0   ] | + / - ?
Latas Sumo Laranja   |  ( Oculto ) | [  24.0   ] | + / - ?
=========================================================
[ Concluir 1ª Contagem e Submeter ]
```

## 5. Interface Completa
App Mobile (Scanner Mode) focada apenas em `Bip -> Inserir Quantidade`. Interface Web para o Controller analisar num Grid gigante a coluna "Qtd Sistema" vs "Qtd Real", ordenando pelos maiores desvios financeiros.

## 6. Estrutura do Menu
`Inventário > Controlo Físico`
  ┣ `Planeador de Inventários (Cíclicos/Anuais)`
  ┣ `Folhas de Contagem Abertas`
  ┣ `Reconciliação & Ajustes Pendentes`
  ┗ `Histórico de Reconciliações`

## 7. Formulários
- **Criação de Documento de Inventário:** Filtros de seleção (Apenas bebidas? Apenas secção de Limpeza? Apenas Artigos da Curva A?).
- **Pesagem de Garrafas:** Interface especializada em que o utilizador insere "700 gramas" e o ITE converte em Litros consumidos com base no peso líquido pré-parametrizado da garrafa vazia.

## 8. Separadores (Folha de Reconciliação)
- Contagens Pendentes
- Desvios Toleráveis (Discrepâncias menores que 5€ ou 1%)
- Desvios Críticos (Exigem 2ª contagem)
- Resumo Financeiro (Impacto total do acerto no P&L do mês).

## 9. Todos os Campos
**`ite_inventory_sheets`**: `SheetID`, `LocationID`, `Type` (Annual, Cyclic, Spot), `Status`, `PlannedDate`, `TotalVarianceValue`.
**`ite_inventory_lines`**: `LineID`, `SheetID`, `ArticleID`, `LotNumber`, `SystemQty`, `CountedQty`, `VarianceQty`, `VarianceCost`, `ReasonCode`.

## 10. Validações
- Não permitir iniciar o inventário físico de um Bar se o POS desse Bar ainda estiver com mesas abertas (Gera quebras de concorrência).
- Valores fracionários (0.4 de garrafa) apenas permitidos se o artigo tiver UoM fracionável (Litros/Kgs) associado à unidade mestre (Un).

## 11. Regras de Negócio
- **Freezing (Congelamento):** Ao iniciar o documento de inventário, o sistema tira um "Snapshot" fotográfico do stock daquele instante exato. Qualquer venda efetuada durante a contagem tem que ser matematicamente compensada no ajuste final.
- **Gestão de Perdas Fiscais:** Acertos negativos (furtos, perdas) requerem motivos classificados fiscalmente se afetarem o apuramento de lucro tributável num ERP certificado.

## 12. Estados do Inventário
`Planned` (Agendado), `Counting` (Pessoal no terreno com tablets), `Review` (Contagem fechada, aguarda o Gestor), `Recount` (Exigida nova verificação), `Posted` (Fechado, ledger atualizado).

## 13. Base de Dados
A aprovação do Inventário gera N linhas de `ite_transactions` do tipo `Inventory-Adjustment-In` ou `Inventory-Adjustment-Out`.

## 14. Relacionamentos
`ite_inventory_sheets` 1-N `ite_inventory_lines`.

## 15. APIs
- `POST /api/ite/inventory/sheets/{id}/lines` (Gravar contagens via Tablet offline/online).
- `POST /api/ite/inventory/sheets/{id}/post` (Apurar desvios e criar transações).

## 16. Serviços
- `SnapshotService`: Tira a "fotografia" estática aos saldos.
- `ReconciliationEngine`: Analisa as contagens submetidas e identifica o GAP face ao Snapshot.

## 17. Eventos
- `InventoryStartedEvent`
- `VarianceExceededEvent` (Ex: Falta de Custo > 1000€ despoleta email urgente ao Diretor-Geral).

## 18. Auditoria
Cada linha de contagem regista quem a contou (`CountedByUserID`), em que dispositivo e a que horas exatas. Impede manipulações (Ex: O Barman ajustou a contagem após ver o Snapshot).

## 19. Logs
Log específico de sincronização mobile (Para garantir que zonas de adega sem WiFi conseguem fazer push do ficheiro JSON completo da contagem sem corromper).

## 20. Permissões
- `CAN_VIEW_SYSTEM_QTY` (Esconde o stock teórico de forma a obrigar contagem cega).
- `CAN_POST_INVENTORY_ADJUSTMENTS`.

## 21. Dashboards
- Ranking de Departamentos com Maior Taxa de Desvios de Inventário.
- Valor Financeiro Total "Afundado" em Furos de Stock este ano.

## 22. Relatórios
- **Folha Cega de Contagem (PDF):** Para locais sem cobertura digital.
- **Mapa de Discrepâncias:** "Antes vs. Depois vs. Custo do Desvio". Obrigatório para reuniões de fecho de contas (F&B Controller).

## 23. Configurações
- Tolerância financeira automática (Aprovação sem intervenção humana de desvios abaixo de 0.50€ num artigo de baixo valor).

## 24. Automatizações
- **Criador de Inventário Cíclico:** Agendador (CronJob) que todas as segundas-feiras gera folha de contagem automática para os 10 artigos que tiveram mais movimentos na semana anterior.

## 25. Performance
O `SnapshotService` não pode bloquear tabelas num ERP 24/7 (Hotéis nunca fecham). Deve ser feito lendo os eventos da Event Sourcing arquitetados ou através de queries read-only otimizadas.

## 26. Segurança
A aprovação de desvios negativos acionada pelo Responsável do Armazém (O próprio suspeito de fraude) obriga a aprovação de hierarquia superior. (Segregation of Duties).

## 27. Escalabilidade
Tratamento offline. Se um resort na ilha perde a internet no momento da contagem, a Progressive Web App (PWA) no tablet guarda 15.000 contagens na base de dados IndexedDB e empurra para a cloud quando o sinal voltar.

## 28. Integrações
Balanças Bluetooh. O tablet liga por BT à balança que pesa o Barril de Cerveja e preenche o Excel/Grid do sistema em décimas de litro de forma instantânea.

## 29. Feature Flags
`enable_blind_counting`, `force_double_counting_on_discrepancy`.

## 30. Licenciamento
Funcionalidade Base Obrigatória ("Core Inventory module").

## 31. Checklist Funcional
- [ ] Posso contar um armazém enquanto o restaurante vende? O Snapshot acomoda isso?
- [ ] Artigos com Múltiplos Lotes expiram? O tablet obriga a preencher as validades durante a contagem rotineira?

## 32. Checklist Técnico
- [ ] As 1500 linhas contadas entram através de um Transaction Block no SQL Server para evitar "Parcial Posts"?

## 33. Checklist UX
- [ ] A app do tablet tem botões gigantes para dedos rápidos (Numpad Virtual gigante).

## 34. Checklist QA
- [ ] Contar no tablet. Entrar na BD e apagar o stock físico à força. Aprovar. Bate certo?

## 35. Melhorias Futuras
- Uso de Drones com Câmaras / RFID para fazer inventário dos Pallets gigantes no armazém central F&B enquanto os operadores descansam.
