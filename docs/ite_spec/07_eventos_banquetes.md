# ITE Submódulo 07: Eventos & Banquetes (Catering Logistics)

Este documento especifica a mecânica do ITE dedicada a eventos de grande escala. Diferente do consumo imediato de um Bar, um Evento exige planeamento, cativação de stock com meses de antecedência e gestão de excedentes e devoluções no final da operação.

## 1. Objetivo
Garantir que a logística de eventos (Casamentos, Conferências) corre sem falhas, cativando stock futuro (Hard Allocation) e gerindo os movimentos temporários de material (Ex: Transferir 500 pratos do armazém para a tenda do evento e devolver 490 após quebras).

## 2. Fluxo de Negócio
Assinatura do Contrato de Evento no PMS/CRM ➔ ITE gera BEO (Banquet Event Order) ➔ Explosão de Receitas para N Convidados ➔ Cativação de Stock (Reserva Antecipada) ➔ Transferência para a "Location" do Evento no dia anterior ➔ Consumo ➔ Devolução de Sobras ➔ Registo de Quebras (Copos Partidos) ➔ Apuramento do Food Cost do Evento.

## 3. Casos de Uso
- **Casamento de 300 Pessoas:** Planeado para daqui a 6 meses. O ITE reserva imediatamente 300 garrafas de Vinho X. Se o Diretor F&B tentar vender esse Vinho no restaurante e o saldo livre chegar a zero, o ITE bloqueia a venda para proteger o Casamento.
- **Coffee Break Diário:** Produção massiva de 50 litros de café e 300 pastéis. O ITE desconta os ingredientes numa única transação agregada, diluindo os custos pelo centro de custo "Eventos Correntes".
- **Devolução de Material:** O evento levou 10 garrafas de Whisky. Foram abertas 4. As 6 seladas são devolvidas ao Armazém de Bebidas (Reverse Transfer).

## 4. Wireframe Textual
```text
[ ITE - GESTÃO DE STOCK PARA EVENTOS (BEO) ]
=========================================================
Evento: [Casamento Silva] | Data: [15-08-2027] | Convidados: 300
Status ITE: [Stock Parcialmente Cativado - Faltam Compras]
---------------------------------------------------------
Artigo            | Qtd Necessária | Em Stock | Estado Reserva
Vinho Tinto X     | 150 gf         | 200 gf   | [ Cativado ]
Lombo de Boi      | 90 kg          | 10 kg    | [ Pend. Compra ]
Flutes Champanhe  | 350 un         | 300 un   | [ Alerta Quebra]
=========================================================
[ Gerar Encomenda a Fornecedores ] [ Emitir Guia de Separação ]
```

## 5. Interface Completa
Ecrã focado em gestão de tempo (Gantt Charts) para visualização de cativações de stock no futuro. Alertas a vermelho para materiais que estão cativados para 2 eventos no mesmo dia (Ex: O Hotel só tem 1 Projetor de Vídeo e há 2 conferências).

## 6. Estrutura do Menu
`Inventário > Operações de Banquetes`
  ┣ `Calendário de Eventos (BEOs)`
  ┣ `Planeamento de Materiais`
  ┣ `Guias de Separação (Picking do Evento)`
  ┗ `Devoluções e Apuramento de Quebras`

## 7. Formulários
- **Conversão de BEO:** Wizard que pega num PDF/Registo do sistema de Vendas e o traduz em linhas de ITE (Artigos, Quantidades, Datas).
- **Auto de Fim de Evento:** Formulário onde o Chefe de Sala (Maitre) regista as devoluções de bebidas não abertas e aponta as loiças partidas.

## 8. Separadores (Página do Evento)
- Resumo Financeiro (Receita vs Custo dos Ingredientes).
- F&B (Comida e Bebida)
- Equipamentos (Mesas, Cadeiras, Loiça, Audiovisuais)
- Ocorrências.

## 9. Todos os Campos
**`ite_events`**: `EventID`, `PMSBookingID`, `Date`, `GuestCount`, `Status`.
**`ite_event_allocations`**: `AllocationID`, `EventID`, `ArticleID`, `RequiredQty`, `AllocatedQty`, `AllocationDate`.
**`ite_event_returns`**: `ReturnID`, `EventID`, `ArticleID`, `ConsumedQty`, `ReturnedQty`, `BrokenQty`.

## 10. Validações
- O sistema bloqueia a "Devolução" de uma quantidade superior à que foi inicialmente transferida para o evento.
- Validação temporal: Uma cadeira não pode estar reservada para dois eventos no mesmo minuto.

## 11. Regras de Negócio
- **Overbooking de Material Descartável:** O ITE pode aceitar overbooking temporário de palitos, mas nunca de equipamento audiovisual sem gerar ordem de aluguer externo.
- **Regra de Cativação:** "Soft Allocation" ocorre quando o evento é Tentativo. "Hard Allocation" ocorre quando o cliente paga o sinal (Sinalização).

## 12. Estados da Cativação
`Planned`, `Soft Allocated`, `Hard Allocated`, `Picked`, `In-Use`, `Returned/Closed`.

## 13. Base de Dados
O evento em si é um Centro de Custo no Ledger (`CostCenterID`). Todas as transações apontam para ele para fecho contabilístico posterior.

## 14. Relacionamentos
`ite_events` 1-N `ite_event_allocations`.

## 15. APIs
- `POST /api/ite/events/{id}/allocate` (Despoleta o algoritmo que varre o armazém à procura de disponibilidade).
- `POST /api/ite/events/{id}/close` (Calcula os consumos reais e abate do inventário).

## 16. Serviços
- `FutureAvailabilityService`: Motor que calcula se terei stock de um artigo no dia 15 do próximo mês, sabendo as compras já agendadas e os consumos médios diários até lá.

## 17. Eventos
- `EventStockShortageEvent` (A 7 dias do evento avisa o F&B Manager que faltam ingredientes).
- `EventClosedEvent`.

## 18. Auditoria
Alterações ao número de convidados a menos de 48h (Guaranteed Number) que resultem em desperdício de comida pré-cativada ficam registadas com a justificação do Gestor de Vendas.

## 19. Logs
Monitorização do tempo de preparação do material (Para justificar horas extraordinárias do pessoal de armazém).

## 20. Permissões
- `CAN_OVERRIDE_HARD_ALLOCATION` (O Diretor retira vinho do Casamento A para dar à Conferência VIP B).

## 21. Dashboards
- "Material Necessário para a Próxima Semana vs Em Stock".
- "Margem de Lucro Bruto por Evento".

## 22. Relatórios
- **Lista de Cargas (Load List):** Para o pessoal transportar o material.
- **Relatório de Quebras de Loiça:** Histórico de quantos copos partem por mês em eventos.

## 23. Configurações
- Margem de Segurança: Produzir sempre +5% de comida relativamente ao número de convidados.

## 24. Automatizações
- Geração automática de `Purchase Requisition` (Requisição de Compra) para todos os ingredientes que estão em falta para os eventos dos próximos 15 dias.

## 25. Performance
A explosão de receitas para um casamento com menu de 5 pratos para 500 pessoas exige queries Bulk Insert na tabela de `ite_event_allocations`.

## 26. Segurança
A conta de um evento só pode ser fechada e faturada se o "Auto de Fim de Evento" do ITE estiver assinado (Garantir que as sobras não são roubadas pelo staff).

## 27. Escalabilidade
Sincronização assíncrona entre o ITE e o software de CRM (ex: Oracle Opera Sales & Catering) sem bloquear o UI do comercial de vendas.

## 28. Integrações
- CRM & Catering Software.
- F&B POS (Para faturar bebidas extra não incluídas no pacote do casamento).

## 29. Feature Flags
`enable_ai_stock_forecasting_for_events`.

## 30. Licenciamento
Módulo "Banqueting & Event Inventory".

## 31. Checklist Funcional
- [ ] Se o número de convidados baixa 1 dia antes, o stock é devolvido ao armazém central logicamente?
- [ ] O custo final reflete perfeitamente os copos partidos?

## 32. Checklist Técnico
- [ ] A tabela de saldos cativados reflete a data futura, sem alterar o stock disponível de hoje?

## 33. Checklist UX
- [ ] Calendário visual claro a indicar choques de alocação de equipamentos.

## 34. Checklist QA
- [ ] Fazer 2 eventos no mesmo dia com 20 Projetores requeridos. O hotel só tem 10. Validar alerta do sistema.

## 35. Melhorias Futuras
- Machine Learning para prever quantas pessoas vão faltar (No-shows) e cortar automaticamente 3% da produção alimentar para evitar o lixo biológico.
