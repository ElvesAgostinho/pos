# EDC Submódulo 02: Workflow & Approval Engine

Este submódulo rege o ciclo de vida dos documentos dentro do Enterprise Document Center (EDC). Nenhum documento crítico é executado sem aprovação, e o EDC gere a caixa de entrada (Inbox) de cada Gestor.

## 1. Objetivo
Garantir que documentos como Contratos, Faturas de alto valor e Ordens de Compra transitam por um funil hierárquico estrito, forçando assinaturas e revisões antes da publicação oficial.

## 2. Fluxo de Negócio
Documento Inserido ➔ Validação de Regra de Workflow (Ex: Valor > 10.000€) ➔ Roteamento para Caixa de Entrada do Diretor Financeiro ➔ Revisão / Anotação ➔ Aprovação (com Assinatura) ➔ Estado transita para `Approved` ➔ Notificação ao Criador.

## 3. Casos de Uso
- **Aprovação de Requisição:** O cozinheiro faz requisição de F&B no ITE. O ITE envia um PDF da Requisição para o EDC. O Chef Executivo recebe-o no Inbox do EDC, abre, assina digitalmente e aprova.
- **Rejeição com Anotação:** A contabilidade anexa uma nota de despesas. O CFO rejeita, adicionando um Post-It (Anotação Layer no PDF) dizendo "Falta NIF nesta fatura".
- **Assinatura Múltipla:** Um grande contrato de fornecimento F&B exige aprovação sequencial: Legal -> CFO -> CEO.

## 4. Wireframe Textual
```text
[ EDC - CAIXA DE ENTRADA (MY APPROVALS) ]
=========================================================
Filtros: [Pendentes] [Urgentes] [Por Departamento]
---------------------------------------------------------
Remetente  | Tipo         | Documento           | Ação
João F&B   | Ordem Compra | PO-123_Makro.pdf    | [✅] [❌] [👁️]
Dep. Legal | Contrato     | Lavandaria_V2.docx  | [✅] [❌] [👁️]
=========================================================
[ Detalhes do Workflow selecionado: PO-123 ]
Progresso: [Criado] -> [F&B Mgr ✅] -> [CFO ⏳]
```

## 5. Interface Completa
Split-screen visual: Lado Esquerdo com a lista de tarefas (Task Inbox). Lado Direito exibe imediatamente a Renderização Visual do Documento (PDF Reader nativo). Ferramentas de anotação na barra de topo (Sublinhador, Caixas de Texto, Carimbo de Assinatura).

## 6. Estrutura do Menu
`EDC > Workflows`
  ┣ `Minhas Tarefas (Inbox)`
  ┣ `Documentos que Enviei (Outbox)`
  ┣ `Monitorização de Fluxos (Administração)`
  ┗ `Gestor de Modelos de Workflow`

## 7. Estrutura de Pastas
Embora o documento físico resida na sua pasta departamental correta, os Workflows criam Links Simbólicos (Symlinks) nas "Pastas de Trabalho" (Caixas de Entrada e Saída) sem duplicar o ficheiro.

## 8. Formulários
- **Desenhador de Workflow (BPMN Lite):** Formulário Drag-and-Drop onde os Admins dizem "Se Departamento == HR, enviar para Diretor HR".
- **Justificação de Rejeição:** Formulário modal obrigatório quando se clica em Rejeitar.

## 9. Todos os Campos
**`edc_workflows`**: `WorkflowID`, `DocID`, `DefinitionID`, `Status`, `CurrentNode`, `StartedAt`, `CompletedAt`.
**`edc_workflow_tasks`**: `TaskID`, `WorkflowID`, `AssignedToUserID`, `ActionTaken`, `Comments`, `CompletedAt`.

## 10. Validações
- Um Documento no estado "Locked" num Workflow não pode ser apagado nem substituído por uma nova versão pelo autor original até o Workflow ser cancelado.
- Prevenção de Loop de Aprovação (Gestor A aprova e manda para B, B manda para A).

## 11. Regras de Negócio
- **Delegação:** Se um Diretor vai de férias, deve definir um "Proxy" no EDC para herdar as suas tarefas de aprovação durante 15 dias.
- **Escalabilidade por Tempo (Escalation):** Uma Fatura pendente de aprovação há mais de 48h é redirecionada automaticamente para a hierarquia superior para evitar juros de mora.

## 12. Estados
- Do Documento: `In-Approval`.
- Do Workflow: `Running`, `Suspended`, `Completed`, `Cancelled`.

## 13. Base de Dados
Sistema puramente Relacional associado a Grafo para transições dinâmicas de estados de Workflow.

## 14. Relacionamentos
`edc_documents` 1-1 `edc_workflows` 1-N `edc_workflow_tasks` N-1 `mdm_users`.

## 15. APIs
- `GET /api/edc/inbox` (Listar pendentes do utilizador autenticado).
- `POST /api/edc/tasks/{id}/approve` (Aceitar e avançar o estado do fluxo).

## 16. Serviços
- `WorkflowRoutingEngine`: O motor de regras que decide quem é o próximo aprovador com base no organograma da Empresa (`mdm_departments` hierarchy).

## 17. Eventos
- `TaskAssignedEvent` (Envia um Email ou Push Notification mobile ao Gestor).
- `WorkflowCompletedEvent`.

## 18. Auditoria
As assinaturas (Aprovações) guardam o Hash Criptográfico (SHA-256) do documento naquele exato milissegundo. Impede o "Eu não aprovei este ficheiro, alteraram-no depois de mim".

## 19. Logs
Monitorização do "Bottleneck". Logs temporais mostram que o "Departamento Legal" é a entidade que demora mais dias em média a dar andamento aos contratos.

## 20. Permissões
- `CAN_OVERRIDE_WORKFLOW` (O Administrador de Sistemas pode forçar a quebra do fluxo se o gestor ficar impossibilitado fisicamente de aprovar).
- `CAN_DESIGN_WORKFLOWS`.

## 21. Dashboards
- Tempo Médio de Aprovação (Por Departamento / Por Utilizador).
- Volume de Documentos Parados (SLA Violado).

## 22. Relatórios
- **Mapa de Pendências (Aging Report):** Lista de faturas presas nos inboxes de toda a empresa organizadas por dias de atraso.

## 23. Configurações
- Definição do limite de dias úteis antes de disparar `Escalation Event`.

## 24. Automatizações
- **Auto-Aprovação:** Documentos Internos não-críticos abaixo de X valor passam pelo fluxo automaticamente sem intervenção manual.

## 25. Performance
A query de "Minhas Tarefas" tem de ser imensamente rápida (Cache com Redis), já que é o primeiro ecrã que cada Gestor de Hotel vai ver de manhã.

## 26. Segurança
Ações de aprovação crítica de contratos exigem Re-Autenticação (MFA / Inserção de PIN no momento do "Approve").

## 27. Escalabilidade
Arquitetura *Stateless* onde qualquer nó do servidor aplicacional consegue transitar o Workflow na Base de dados de forma atómica.

## 28. Integrações
- Slack / Microsoft Teams Bot: Integração onde o Diretor recebe a tarefa de aprovação num Chat e clica "Aprovar" sem sequer entrar no ERP.

## 29. Feature Flags
`enable_slack_approvals`, `require_pin_for_signature`.

## 30. Licenciamento
Módulo "Enterprise Workflows".

## 31. Política de Retenção
Logs detalhados de Workflow de facturas obedecem à mesma lei fiscal do documento (Não podem ser limpos por 10 anos em Portugal).

## 32. Versionamento
O fluxo de aprovação é sempre indexado à Versão. Se o utilizador submeter a `v2` (correção solicitada pelo Chefe), o Workflow reinicia na `v2`.

## 33. IA e Pesquisa Inteligente
- Sugestões da IA baseadas em aprovações históricas. "Caro Gestor, historicamente este tipo de Faturações de Táxis costumam requerer o NIF da frota, algo que falta neste documento. Tem a certeza que aprova?".

## 34. Checklist Funcional
- [ ] Delegar função transfere corretamente tarefas da mesma Categoria?
- [ ] Rejeitar tarefa pede motivo obrigatório?

## 35. Checklist Técnico
- [ ] Hashes do documento são validados contra ataques *Man in the Middle* antes do `Status` mudar para Aprovado?

## 36. Checklist UX
- [ ] A ferramenta de anotação de PDFs funciona fluentemente em ecrãs touch de Tablets iPad/Android (para Diretores itinerantes)?

## 37. Checklist QA
- [ ] Suspender temporariamente a conta de um Gestor e verificar se a *Escalation* transfere os documentos pendentes ao CEO automaticamente.

## 38. Melhorias Futuras
Motor de RPA (Robotic Process Automation) que assina documentos de forma autónoma caso os KPIs e a leitura do OCR comprovem que a fatura tem todas as formalidades perfeitas e valor abaixo de 100€.
