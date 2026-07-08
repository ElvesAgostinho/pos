# ITE Submódulo 03: Transferências & Requisições Internas

Este documento descreve a especificação funcional e técnica do motor de movimentações internas (entre Armazéns, Hotéis, Departamentos, Bares e Restaurantes). Sendo o ITE o garante da rastreabilidade, este submódulo gere o fluxo completo desde a intenção (Requisição) até à concretização (Transferência e Receção).

## 1. Objetivo
Garantir o controlo e auditoria rigorosa de todas as deslocações de bens dentro da estrutura hoteleira, prevenindo furtos, extravios e garantindo que o custo do produto é alocado ao centro de custo correto (Ex: A garrafa saiu da Cave Central para o Bar da Piscina).

## 2. Fluxo de Negócio
Departamento solicita material (Requisição) ➔ Gestor aprova ➔ ITE cativa/reserva stock no Armazém Central ➔ Armazém Central separa a mercadoria (Picking) ➔ Material fica `In-Transit` (Transferência Expedida) ➔ Departamento confirma a receção ➔ ITE conclui Transferência (Move o stock e o custo contabilístico).

## 3. Casos de Uso
- **Reposição de Bar:** O Barman pede 10 garrafas de Vodka. O Armazém entrega apenas 8 porque não tem mais. O sistema regista o Backorder de 2.
- **Transferência Inter-Hotel:** O Hotel A (Algarve) transfere 100 lençóis para o Hotel B (Lisboa). Gera-se uma Guia de Transporte de circulação legal.
- **Housekeeping:** O Departamento de Andares levanta 50 rolos de papel higiénico. A despesa transita para o Centro de Custo "Limpeza Quartos".

## 4. Wireframe Textual
```text
[ ITE - REQUISIÇÕES INTERNAS ]
=========================================================
Origem: [Bar da Piscina] | Destino: [Armazém F&B Principal]
Estado: [A Aguardar Aprovação do F&B Manager]
---------------------------------------------------------
Artigo            | Qtd Pedida | Qtd Aprovada | Qtd Entregue
Vodka Absolut     | 5 gf       | 5 gf         | 0 gf
Limas Frescas     | 2 kg       | 2 kg         | 0 kg
Hortelã           | 5 mç       | 3 mç         | 0 mç (Stock Insuf.)
=========================================================
[ Aprovar Requisição ] [ Rejeitar ] [ Converter em Transferência ]
```

## 5. Interface Completa
Sistema de caixa de entrada (Inbox) para Diretores e Chefes de Armazém aprovarem pedidos em massa. Suporte a aplicação mobile em Tablets/Scanners para leitura de Códigos de Barras no Armazém durante o Picking, validando Lotes.

## 6. Estrutura do Menu
`Inventário > Logística Interna`
  ┣ `Nova Requisição`
  ┣ `Caixa de Entrada de Aprovações`
  ┣ `Picking & Expedição (Armazém)`
  ┣ `Receção de Transferências`
  ┗ `Histórico de Movimentos Internos`

## 7. Formulários
- **Criação de Requisição:** Catálogo simplificado com fotos para os colaboradores selecionarem o que precisam.
- **Folha de Separação (Picking Slip):** Formulário em modo quiosque/scanner focado em eficiência.

## 8. Separadores (Requisição)
- Linhas do Pedido
- Workflow (Quem pediu, Quem aprovou, Quem separou, Quem recebeu)
- Logística (Guia de Transporte associada, se aplicável).

## 9. Todos os Campos
**`ite_requisitions`**: `ReqID`, `SourceLocationID`, `DestLocationID`, `RequestedBy`, `ApprovedBy`, `Status`, `RequiredDate`.
**`ite_transfers`**: `TransferID`, `ReqID`, `ShipDate`, `ReceiveDate`, `Status` (Draft, In-Transit, Completed, Discrepancy).
Linhas detalham Qtd Requisitada vs Qtd Enviada vs Qtd Recebida.

## 10. Validações
- Não permitir expedir quantidades superiores às aprovadas na Requisição.
- Diferenças entre "Qtd Enviada" e "Qtd Recebida" bloqueiam a Transferência no estado "Discrepância", forçando auditoria.

## 11. Regras de Negócio
- **Responsabilidade Financeira:** Enquanto a mercadoria está "In-Transit", o valor financeiro pertence à conta-corrente do hotel enviador até que o recetor assine digitalmente a entrega.
- **Auto-Aprovação:** Artigos de consumo regular (água, papel) até 50€ geram transferência automática sem exigir Workflow gerencial.

## 12. Estados
- **Requisição:** `Draft`, `Submitted`, `Partially Approved`, `Approved`, `Rejected`, `Fulfilled`.
- **Transferência:** `Picking`, `In-Transit`, `Received`, `Disputed`.

## 13. Base de Dados
O ITE regista duas transações em espelho no ledger: `Stock Out` no Armazém Origem para "In-Transit", e `Stock In` do "In-Transit" para o Armazém Destino.

## 14. Relacionamentos
`ite_requisitions` 1-N `ite_transfers`.

## 15. APIs
- `POST /api/ite/requisitions` (Barman submete pedido).
- `PUT /api/ite/transfers/{id}/receive` (Confirmação física no destino).

## 16. Serviços
- `WorkflowEngineService`: Encaminha as requisições para a pessoa certa consoante a hierarquia e limites monetários.
- `TransitService`: Gere o cofre virtual de mercadoria a circular no meio da estrada.

## 17. Eventos
- `RequisitionRequiresApprovalEvent`
- `TransferDiscrepancyEvent` (Disparado quando quebram 2 garrafas no caminho).

## 18. Auditoria
Assinatura digital forte: `RequestedBy`, `ApprovedBy`, `PickedBy`, `ReceivedBy` são campos estritos e imutáveis com carimbo de tempo.

## 19. Logs
Monitorização do tempo decorrido entre a Requisição e a Entrega (SLA de Armazém).

## 20. Permissões
- `CAN_APPROVE_REQUISITIONS_UP_TO_1000`
- `CAN_ACCEPT_DISCREPANCIES`

## 21. Dashboards
- **Armazém Central:** "Pedidos Pendentes", "Pico de Picking às 10h".
- **Departamentos:** "Taxa de Quebras em Transferências".

## 22. Relatórios
- **Lead Time Interno:** Tempo médio que o armazém demora a suprir os bares.
- **Relatório de Discrepâncias:** Mapa de furtos e mercadoria perdida em trânsito.

## 23. Configurações
- Hierarquia de aprovação.
- Forçar preenchimento de Matrícula e Motorista para Transferências externas Inter-Hotel.

## 24. Automatizações
- **Par-Stock Requisitioning:** Às 04:00 AM, o ITE varre o stock atual do Bar. O stock ideal é 20, há 5. O sistema cria sozinho uma requisição de 15 unidades ao Armazém.

## 25. Performance
As transferências massivas num hotel (10.000 itens) não devem fazer table locking na tabela principal. Uso de filas de processamento assíncrono.

## 26. Segurança
Proteger endpoints de aprovação contra Forged Requests (Assegurar que o Token pertence mesmo ao F&B Manager).

## 27. Escalabilidade
Arquitetura permite que um Hotel Requisitante peça produtos que serão separados em múltiplos Armazéns distintos de forma simultânea (Roteamento de Pedidos).

## 28. Integrações
- Integração com a Autoridade Tributária (AT/SAF-T em Portugal) para emitir Documento de Transporte com Código de Barras e ATUD para as viaturas na estrada.

## 29. Feature Flags
`enable_auto_par_stock_replenishment`, `require_digital_signature_on_delivery`.

## 30. Licenciamento
Módulo "Advanced Logistics & Workflows".

## 31. Checklist Funcional
- [ ] Requisições com produtos de diferentes armazéns geram Transferências divididas corretamente?
- [ ] Guia de Transporte Global é emitida validamente?

## 32. Checklist Técnico
- [ ] O stock temporário na conta `In-Transit` é consistente em fechos diários?

## 33. Checklist UX
- [ ] A cor da requisição muda intuitivamente para que o colaborador do bar saiba se a Vodka já vem a caminho?

## 34. Checklist QA
- [ ] Simular um Bar a Receber quantidades maiores do que o Armazém Expediu. O ITE deve bloquear por segurança.

## 35. Melhorias Futuras
- Inteligência Artificial baseada em ocupação hoteleira para sugerir Requisições Preditivas aos Diretores (Evitar ruturas às sextas-feiras de lotação esgotada).
