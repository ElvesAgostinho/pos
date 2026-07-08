# ITE Submódulo 06: Housekeeping & Minibar (Interação PMS)

Este documento detalha o braço do ITE mais em contacto com o hóspede. Housekeeping e Minibar exigem um volume brutal de transações de pequeno valor que devem ser registadas e integradas com o PMS (Property Management System) em tempo real para a emissão da conta do cliente (Folio).

## 1. Objetivo
Garantir que todos os champôs, toalhas, águas, chocolates e garrafinhas do minibar são abatidas do stock, repostas adequadamente (Carros de Limpeza = Pequenos Armazéns) e faturadas corretamente ao hóspede antes do Check-Out.

## 2. Fluxo de Negócio
Empregada de Andares limpa o quarto ➔ Faz o reabastecimento do Minibar e Amenites ➔ Regista os consumos na App (Mobile PMS/Housekeeping App) ➔ O consumo entra na folha do cliente (PMS) ➔ O ITE dá saída do inventário do Carro de Limpeza/Pantry ➔ Gera pedido de reposição (Transferência) ao Armazém Geral para encher o Pantry no dia seguinte.

## 3. Casos de Uso
- **Consumo Minibar Faturável:** Cliente no Quarto 101 bebeu 1 Cola e 1 Cerveja. A Empregada nota as faltas, regista na App. O PMS debita 10€ na conta; o ITE desconta o stock.
- **Housekeeping Expense (Custos do Hotel):** Substituição de 2 frascos de Gel de Banho, 3 Rolos de Papel Higiénico e toalhas no Quarto 102. Não se cobra ao cliente, mas o ITE regista transação de consumo direto (Despesa Departamental "Room Expenses").
- **Carro de Limpeza (Micro-Location):** A funcionária arranca o turno com 50 champôs no Carro. Faz 10 quartos e consome 20. O sistema sabe que o carro tem 30 e sugere uma reposição de 20 para o turno da tarde.

## 4. Wireframe Textual
```text
[ ITE/PMS - ROOM 101 - MINIBAR & AMENITIES ]
=========================================================
Hóspede: [John Doe] | Status: [Stayover] | Limpeza: [Em Progresso]
---------------------------------------------------------
Artigo (Minibar)    | Par Ideal | Quarto Tem | A Faturar/Repor
Coca-Cola           | 2         | 1          | [ 1 ] (+3.00€)
Água Lisa (Oferta)  | 2         | 0          | [ 2 ] ( 0.00€)
Chips Trufa         | 1         | 0          | [ 1 ] (+5.00€)
---------------------------------------------------------
Artigo (Housekeeping) | Consumo Diário Oculto
Sabonete Luxo       | [ 2 ]
Papel Higiénico     | [ 1 ]
=========================================================
[ Concluir Limpeza do Quarto & Atualizar ERP ]
```

## 5. Interface Completa
Aplicação puramente focada no mobile/tablet das Empregadas de Andares e do Supervisor. Botões enormes (Tap to increment `+`, Tap to decrement `-`). Sincronização em background transparente com o ITE e PMS simultaneamente.

## 6. Estrutura do Menu
`Inventário > Operações de Quartos`
  ┣ `Consumos de Minibar a Processar`
  ┣ `Painel de Pantries (Armazéns de Andar)`
  ┣ `Reposição de Carros de Limpeza`
  ┗ `Auditoria de Despesas de Quartos`

## 7. Formulários
- **Fecho de Turno do Carro:** Validação rápida onde a Empregada diz "Cheguei ao fim do dia com 5 garrafas no carro". Se o ITE calculava que ela devia ter 10, gera alerta de extravio para a governanta (Housekeeper Manager).
- **Lista de Reposição Automática:** Formulário onde o Fiel de Armazém "enche" a despensa do 3º Andar (Pantry 3).

## 8. Separadores (Pantry / Micro-Warehouse)
- Stock Atual do Carrinho/Despensa
- Consumos Hoje
- Desvios / Extravios.

## 9. Todos os Campos
**`ite_room_consumptions`**: `ConsumptionID`, `RoomNumber`, `ReservationID` (Link PMS), `LocationID` (Qual o carrinho usado), `ArticleID`, `Qty`, `IsChargeable`, `ChargeAmount`, `Status`, `LoggedBy`.

## 10. Validações
- Se um artigo for marcado como `IsChargeable = true`, o ITE não assume o consumo sozinho. Ele requer o "Ok" da API do PMS garantindo que a linha financeira no Quarto do cliente foi criada com sucesso.
- O ITE bloqueia se o PMS disser "O cliente já fez Check-Out há 5 minutos. Não pode faturar no quarto!".

## 11. Regras de Negócio
- **Consumo Virtual (Flush):** Dado o baixo custo unitário de champôs, em cadeias de 2.000 quartos, pode-se não obrigar a empregada a apontar "gastei 1 sabonete no 101". O ITE deduz estatisticamente: (Quartos Limpos Hoje) x (Par Ideal de Sabonete) = Consumo Automático gerado ao final do dia. Chama-se "Flush Inventory".

## 12. Estados da Operação
`Pending PMS Post`, `PMS Accepted`, `PMS Rejected` (Ex: Quarto Bloqueado), `Posted in ITE` (Baixa de Inventário efetivada).

## 13. Base de Dados
A transação do ITE assume Tipo `Minibar-Charge` ou `Housekeeping-Expense`.

## 14. Relacionamentos
Extremamente dependente do Sistema de Gestão Hoteleira (PMS). Há uma relação externa entre o ID da Transação do ERP e o `Folio/Routing ID` do PMS.

## 15. APIs
- `POST /api/ite/rooms/{roomNumber}/minibar/consume` (Webhook que a App de Andares chama).
- `GET /api/ite/pantries/{id}/replenish-list` (Armazém chama para gerar a requisição automática).

## 16. Serviços
- `PMSRoutingService`: O Tradutor. Assegura que o Artigo ID "1023" do ERP bate certo com o ItemCode "MN-COLA" exigido pela base de dados Oracle Opera (PMS), por exemplo.

## 17. Eventos
- `MinibarConsumedEvent`
- `PantryBelowMinimumStockEvent`

## 18. Auditoria
Crucial para os Hóspedes que disputam faturas na Receção ("Eu não bebi essa Cola!"). A auditoria do ITE prova: "Quarto 101, Data 15-Out-2026, 10h42, Reportado via Tablet pela funcionária Maria Silva."

## 19. Logs
Sincronização bidirecional do ERP -> PMS. Qualquer falha de timeout (Ex: PMS em atualização noturna às 03:00) resulta no ITE fazer re-try contínuo (Message Queue / Dead Letter Queue) para não perder faturação de consumos noturnos.

## 20. Permissões
- `CAN_WAIVE_MINIBAR_FEE` (A Governanta perdoa a bebida, mas a baixa de inventário ocorre na mesma como `Oferta/Loss`).
- `CAN_ADJUST_PANTRY_STOCK`.

## 21. Dashboards
- Receita Global de Minibar vs Custo Global Reposição (Lucro Real).
- Rácio Consumo/Ocupação (Quantas garrafas de champô são estatisticamente roubadas pelos hóspedes por cada check-out).

## 22. Relatórios
- **Folha de Reposição de Andares (Pantry List):** Impressa às 08h da manhã. Diz "Levar 50 Toalhas e 20 Colas para o 3º Andar".
- **Disputas de Hóspedes:** Relatório das reversões / "Late charges" abatidas depois da saída.

## 23. Configurações
- Definição do PAR STOCK por tipologia de quarto (Uma Suite Presidencial consome ginás e whisky, um Quarto Standard consome Cerveja e Cola).

## 24. Automatizações
- **Pre-Billing (Late Check-out):** Se o cliente faz late check-out e pede serviço de quarto, o POS envia consumo automático não só para faturar como o ITE bloqueia stock em tempo real do Pantry associado ao andar.

## 25. Performance
Tolerância altíssima a latência (Offline first). Operações em corredores blindados sem rede WiFi exigem que a transação ITE seja arquivada em Cache até o funcionário ir ao hall do elevador.

## 26. Segurança
Isolamento do token PMS e token ITE. Prevenção de double-billing (Clicar duas vezes rápidas no "Post" não pode criar 2 garrafas faturadas se só havia 1 garrafa na memória).

## 27. Escalabilidade
Tratamento massivo às 12h00 (Hora padrão de limpeza/check-out) onde centenas de funcionárias pressionam os tablets globalmente. Carga pesada delegada para o Message Broker do ITE.

## 28. Integrações
- Oracle Opera / MEWS / Protel (Os 3 grandes players globais de PMS). O ITE fala com as suas interfaces FIAS ou REST APIs.

## 29. Feature Flags
`enable_statistical_flush_for_housekeeping`, `strict_room_validation_with_pms`.

## 30. Licenciamento
Módulo "Rooms Management Interface (RMI) / Housekeeping".

## 31. Checklist Funcional
- [ ] Tentar cobrar consumos num quarto que está vazio ("Vacant Dirty"). O ITE devolve erro de lógica de negócio?
- [ ] O artigo de oferta (Água Cortesia) debita o inventário a custo de 0€ para o cliente mas custo "X" para Custo Departamental?

## 32. Checklist Técnico
- [ ] A arquitetura tolera a reinicialização noturna da base de dados do PMS retendo os eventos do ITE em memória?

## 33. Checklist UX
- [ ] A App mostra as fotos dos artigos? O staff de limpeza de diferentes nacionalidades identifica mais facilmente.

## 34. Checklist QA
- [ ] Disputa de conta: Inserir bebida -> PMS fatura -> Cliente recusa -> PMS anula -> O ITE recebe a anulação e re-poe a garrafa no stock teorico do quarto.

## 35. Melhorias Futuras
- Uso de Minibares Inteligentes (Balanzas/Sensores). Quando o hóspede levanta o chocolate durante 5 segundos, a placa RaspberryPi/IoT dentro do frígorifico dispara um Webhook ao ITE, que faturiza, abate a quantidade na base de dados, sem qualquer intervenção humana.
