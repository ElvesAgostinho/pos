# EDC Submódulo 03: Auditoria, Retenção & Compliance

Este submódulo garante a imutabilidade, a retenção temporal legal e a conformidade (Compliance) de toda a documentação corporativa. É o pilar que protege a cadeia hoteleira durante fiscalizações legais, tributárias e laborais.

## 1. Objetivo
Garantir que os documentos obedecem ao seu tempo de vida fiscal e jurídico (Data Retention Policies), evitar manipulação ilícita de informações (Imutabilidade) e registar um diário inquestionável de quem acedeu ou alterou o quê.

## 2. Fluxo de Negócio
Documento Inserido ➔ Validação de Categoria Legal (Ex: RH/Contratos = 50 Anos; Faturação = 10 Anos) ➔ Inserção de "Lock" temporal ➔ Motor Noturno varre sistema ➔ Se Retention Date expirou ➔ Arquiva em Cold Storage ou Elimina Permanente (Shredding) c/ log da eliminação.

## 3. Casos de Uso
- **Auditoria Fiscal (AT/Tax Authorities):** O inspetor entra no sistema. Ele quer ver o histórico de alterações da Fatura F-2026/01. O EDC mostra a "Trilha de Auditoria" comprovando que a fatura nunca foi apagada e substituída.
- **Limpeza Automática (GDPR/RGPD):** Fichas de registo de Hóspedes (Folios de Check-out com cópias de Passaporte) devem ser destruídas 5 anos após a estadia. O sistema apaga fisicamente os JPEGs para cumprir a lei da proteção de dados, mas mantém o registo anónimo do consumo.

## 4. Wireframe Textual
```text
[ EDC - PAINEL DE RETENÇÃO E COMPLIANCE ]
=========================================================
[ Configuração de Regras de Retenção ]
---------------------------------------------------------
Tipo de Documento | Período Legal | Ação Final
Contratos Laborais| 50 Anos       | Arquivo Frio (Glacier)
Faturas Clientes  | 10 Anos       | Eliminação Física
Logs de Receção   | 1 Ano         | Eliminação Física
=========================================================
[ Painel de Auditoria Global (Log Viewer) ]
```

## 5. Interface Completa
Ecrã minimalista e restrito, geralmente apenas acessível ao *Data Protection Officer* (DPO) e Administração. Relatórios densos em formato Tabela. Não permite edições, sendo interfaces do tipo "Read-Only Viewer".

## 6. Estrutura do Menu
`EDC > Compliance & Governance`
  ┣ `Políticas de Retenção`
  ┣ `Log de Auditoria e Acessos`
  ┣ `Centro de Privacidade (GDPR)`
  ┗ `Auditoria de Assinaturas (PKI)`

## 7. Estrutura de Pastas
Criação conceptual da pasta `/Lixeira_Legal/` e `/Arquivo_Morto/`.

## 8. Formulários
- **Criação de Política de Retenção:** Selecionar `Categoria Documental`, `Anos de Retenção`, e `Ação` (Delete/Archive).

## 9. Todos os Campos
**`edc_retention_policies`**: `PolicyID`, `DocType`, `YearsToKeep`, `ActionOnExpire`, `IsActive`.
**`edc_audit_log`**: `LogID`, `DocID`, `Action` (View/Edit/Download/Delete), `UserID`, `IPAddress`, `Timestamp`, `DeviceInfo`.

## 10. Validações
- Um Documento "Legal Hold" (Sob investigação judicial) nunca pode ser eliminado, sobrepondo-se às regras de retenção automática.

## 11. Regras de Negócio
- **Shredding (Destruição Segura):** Quando um documento expira, o S3 apaga o ficheiro binário e a base de dados elimina os metadados sensíveis, mas regista o evento "O Documento ID X foi destruído fisicamente devido à Regra Y".
- **Legal Hold:** Bloqueio jurídico que pausa qualquer delegação ou arquivamento de um contrato em disputa de tribunal.

## 12. Estados
- Do lado da conformidade: `Compliant`, `Under Legal Hold`, `Pending Shredding`.

## 13. Base de Dados
A tabela `edc_audit_log` deve ser configurada numa base de dados com `Append-Only` (ex: AWS QLDB ou configuração PostgreSQL restrita sem privilégios de `UPDATE/DELETE`).

## 14. Relacionamentos
`edc_documents` 1-N `edc_audit_log`.

## 15. APIs
- `GET /api/edc/compliance/audit?doc_id=123`
- `POST /api/edc/compliance/legal-hold/{id}`

## 16. Serviços
- `RetentionEngineService`: CronJob Noturno (Batch Processing) que procura milhões de documentos expirados e os elimina ou move.

## 17. Eventos
- `DocumentExpiredEvent`
- `LegalHoldPlacedEvent`
- `FileShreddedEvent`

## 18. Auditoria
É o próprio core deste módulo. O nível de rastreabilidade cobre IP, Navegador, Sistema Operativo e Geolocalização do utilizador na altura de um download massivo (tentativa de roubo de dados).

## 19. Logs
O log da tabela de logs (Syslog) para garantir que um Administrador mal intencionado não apagou os registos de auditoria.

## 20. Permissões
- `CAN_MANAGE_RETENTION_POLICIES` (Exclusivo DPO / CFO).
- `CAN_PLACE_LEGAL_HOLD`.

## 21. Dashboards
- "Documentos Prestes a Expirar este Mês" (Para revisão manual caso existam exceções necessárias).

## 22. Relatórios
- **Certificado de Destruição:** Relatório com lista dos hashes criptográficos de ficheiros destruídos este mês (exigido pelo RGPD).

## 23. Configurações
- Envio de alertas semanais para a Administração antes de se destruírem documentos vitais automaticamente.

## 24. Automatizações
- **Deslocalização (Tiering):** Ficheiros com mais de 3 anos sem acessos são movidos do `Amazon S3 Standard` para o `Amazon S3 Glacier` (Custo de armazenamento drasticamente mais barato), mas o Registo SQL mantém-se ativo no ERP.

## 25. Performance
A tabela de `Audit Log` pode crescer bilhões de linhas em 5 anos. Exige particionamento por Mês/Ano na BD (`Table Partitioning`) para manter consultas rápidas.

## 26. Segurança
Acesso ao Painel Audit bloqueado em conexões HTTP. Requer VPN Corporativa / IP de Intranet.

## 27. Escalabilidade
Arquitetura *Event-Sourced*. O Log Engine consome de uma fila Kafka para não atrasar a velocidade da plataforma primária do ERP durante os cliques de navegação diária.

## 28. Integrações
- AWS KMS (Key Management Service) / Azure Key Vault para a gestão das chaves de encriptação dos documentos e a sua destruição.

## 29. Feature Flags
`enable_auto_shredding`, `enable_strict_audit_logging`.

## 30. Licenciamento
Módulo "Compliance & Governance Enterprise".

## 31. Política de Retenção
Gere e orquestra a si mesma.

## 32. Versionamento
O Log de Auditoria não tem versões. É puramente cronológico (Time-Series Data).

## 33. IA e Pesquisa Inteligente
- Algoritmo de deteção de PII (Personally Identifiable Information). A IA analisa ficheiros arquivados e emite alertas de conformidade: "Aviso: A cópia do passaporte X está exposta na pasta Geral do Departamento A."

## 34. Checklist Funcional
- [ ] Documento em "Legal Hold" recusa a ação "Eliminar"?
- [ ] Regras retroativas afetam documentos antigos no script noturno?

## 35. Checklist Técnico
- [ ] Tabela de Auditoria está devidamente particionada por data?

## 36. Checklist UX
- [ ] Feedback visual de Cor Roxa / Ícones de Cadeado para evidenciar ficheiros bloqueados juridicamente?

## 37. Checklist QA
- [ ] Verificar se "Shredding" elimina efetivamente do Bucket S3 e não só do disco local de Cache.

## 38. Melhorias Futuras
Integração com infraestrutura de *Blockchain* privada corporativa (Ex: Hyperledger Fabric) onde o *Hash* dos contratos assinados fica matematicamente enraizado num bloco indestrutível para prova máxima num tribunal.
