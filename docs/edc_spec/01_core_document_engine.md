# EDC Submódulo 01: Core Document Engine & Indexing

Este documento especifica a base fundamental do **Enterprise Document Center (EDC)**, atuando como repositório mestre, indexador e visualizador de todo o ecossistema ERP (semelhante ao núcleo do SharePoint ou M-Files).

## 1. Objetivo
Criar o "Data Lake Documental" do ERP. Indexar, armazenar e servir rapidamente qualquer ficheiro ou relatório gerado por qualquer módulo, impedindo a fragmentação da informação e assegurando que não existem ficheiros perdidos nos computadores dos utilizadores.

## 2. Fluxo de Negócio
Módulo ERP (Ex: POS/ITE) gera/recebe ficheiro ➔ Envia para API do EDC ➔ EDC extrai Metadados ➔ EDC corre OCR e Indexação ➔ EDC arruma na Estrutura de Pastas correta ➔ EDC define Permissões Herdadas ➔ Ficheiro disponível para Pesquisa e Visualização Global.

## 3. Casos de Uso
- **Receção de Fatura:** O ITE recebe um PDF do Fornecedor. Envia ao EDC. O EDC deteta tratar-se do Fornecedor "Makro", lê a Data e o Valor, e arruma em `Compras/Faturas`.
- **Relatório de Fecho Diário:** Às 03h00 o PMS gera o *Night Audit Report* (PDF). O EDC guarda-o automaticamente em `PMS/Relatórios/2026/10/`.
- **Pesquisa Global:** O Auditor entra no EDC, escreve "Contrato Limpeza", e o sistema devolve o PDF, a Fatura associada e a Adjudicação da Administração.

## 4. Wireframe Textual
```text
[ ENTERPRISE DOCUMENT CENTER ]
=========================================================
[ Pesquisa Inteligente: "Faturas Vencidas Makro"        🔍]
---------------------------------------------------------
[ Menu Lateral ]          | Ficheiros (Pasta: /Compras/Receções)
📁 Administração          | [PDF] Fatura_1023.pdf  (V2)
📁 Financeiro             |   Autor: ITE System | Data: 12-Out
📁 Compras                |   Tags: #Fatura #A_Pagar
  📂 Requisições          | [IMG] Guia_Assinada.jpg (V1)
  📂 Receções             |   Autor: Manuel (Cais)
📁 Stock                  | [DOC] Avaliação_Makro.docx (V3)
=========================================================
[ Pre-visualizar ] [ Novo Upload ] [ Partilhar ]
```

## 5. Interface Completa
Grid densa estilo "Windows File Explorer" mas alojada num ERP. *Tree-view* lateral de navegação (Empresa > Hotel > Dept). Painel Central com detalhes em colunas personalizáveis (Nome, Estado, Versão). Painel Direito retrátil com "Preview" nativo de PDFs/Imagens e Metadados. Zero elementos de design modernos; foco brutal em densidade informacional.

## 6. Estrutura do Menu
`Enterprise Document Center`
  ┣ `Explorador de Arquivo (Árvore Principal)`
  ┣ `Pesquisa Global & Filtros`
  ┣ `Dashboard de Metadados`
  ┗ `Configurações de Taxonomia`

## 7. Estrutura de Pastas (Dynamic Routing)
Gerada automaticamente pela *Entity Hierarchy*:
`{Empresa} / {Hotel} / {Departamento} / {Modulo} / {Submodulo} / {Ano} / {Mês}`.
Ninguém cria pastas à mão. O sistema arruma pela taxonomia.

## 8. Formulários
- **Edição de Propriedades (Metadados):** Formulário dinâmico que exibe campos diferentes consoante o `DocType` (Se for "Contrato" pede Data Fim; se for "Fatura" pede NIF).
- **Upload Manual:** Drag-and-Drop, onde o utilizador é forçado a associar uma Categoria e um Departamento.

## 9. Todos os Campos
**`edc_documents`**: `DocID`, `Title`, `DocType`, `MimeType`, `FileSize`, `LocationPath`, `Version`, `Status`, `AuthorID`, `CreatedAt`, `Tags`, `IsArchived`, `RetentionDate`.
**`edc_metadata`**: `MetaID`, `DocID`, `Key`, `Value` (Armazenamento NoSQL/JSON para campos dinâmicos).

## 10. Validações
- Upload bloqueado se o ficheiro estiver infetado com Malware (Scanning na API de entrada).
- MimeType Validation (Impedir upload de `.exe` ou `.sh` disfarçados).

## 11. Regras de Negócio
- **Single Source of Truth:** Nenhum ficheiro é apagado pelo utilizador, apenas movido para a Lixeira e, posteriormente, para "Soft Delete".
- **Herdabilidade:** Um documento colocado na pasta "Direção Financeira" herda imediatamente a restrição de "Acesso Apenas a Diretores".

## 12. Estados
`Draft`, `Active`, `Locked` (Em edição por alguém), `Archived`, `Trashed`, `Deleted`.

## 13. Base de Dados
Combinação Híbrida:
- **SQL (PostgreSQL):** Relações de documentos e metadados.
- **S3 / Blob Storage:** Armazenamento binário físico dos PDFs, Imagens, Vídeos.
- **ElasticSearch:** Índices invertidos para o motor de busca *Full-Text*.

## 14. Relacionamentos
`edc_documents` N-N `Empresas/Hotéis` (Via `edc_document_acl`).
Polimorfismo: `TargetEntityID` + `TargetEntityType` permite ligar o Documento 123 à Venda POS 456 ou ao Artigo ITE 789.

## 15. APIs
- `POST /api/edc/documents/upload`
- `GET /api/edc/documents/{id}/preview`
- `GET /api/edc/search?q=Contrato`

## 16. Serviços
- `IndexingService`: Lê o conteúdo do PDF/Word e cospe o texto bruto para o ElasticSearch.
- `ThumbnailService`: Cria as miniaturas das primeiras páginas dos documentos.

## 17. Eventos
- `DocumentUploadedEvent`
- `DocumentMetadataUpdatedEvent`
- `DocumentAccessedEvent`

## 18. Auditoria
Registo brutal (Read-Log). Saber quem abriu, fez download, ou visualizou um contrato confidencial. Tabela `edc_access_logs`: `Timestamp`, `UserID`, `IP`, `Action (View/Download/Edit)`.

## 19. Logs
Monitorização do *Storage Growth* (Crescimento de Disco) e alertas de limites de espaço no Blob Storage AWS S3/Azure.

## 20. Permissões
Matriz RBAC (Role-Based Access Control) + ABAC (Attribute-Based Access Control).
- Ex: O utilizador pode ver "Faturas", mas apenas as que o atributo `Departamento == "F&B"`.

## 21. Dashboards
- Crescimento do Repositório (GB usados).
- Top 10 Utilizadores com mais Downloads (Análise de comportamento de risco/fuga de informação).
- Distribuição de Documentos por Departamento (Pie Chart).

## 22. Relatórios
- **Mapa Documental Legal:** Exportação em Excel de todos os contratos ativos com os fornecedores.
- **Auditoria de Acessos:** Listagem legal das interações com a pasta de "Recursos Humanos".

## 23. Configurações
- Definição do peso máximo de Upload (Max 100MB por anexo).
- Configuração de credenciais do Bucket AWS S3.

## 24. Automatizações
- Geração automática de estrutura de pastas sempre que um Hotel novo é adicionado ao ERP.

## 25. Performance
Para 10 milhões de documentos, queries SQL com `LIKE %texto%` morreriam. O EDC exige integração obrigatória com um motor de indexação invertida (ElasticSearch / Apache Solr).

## 26. Segurança
Encriptação At-Rest (AES-256) dos ficheiros no disco. Watermarking automático (Marca de água no PDF com o IP de quem o visualiza, para prevenir *leaks* no telemóvel).

## 27. Escalabilidade
Uso de CDN (Content Delivery Network) ou S3 com aceleração caso hotéis em continentes diferentes necessitem de aceder a manuais operacionais (SOPs) muito pesados (Vídeos de formação).

## 28. Integrações
- Extensões do Office 365 (O utilizador no Word pode gravar diretamente para o "ERP EDC Plugin").
- Scanner/Multifunções do Hotel (Upload direto via protocolo SMB/FTP para a Watch Folder do EDC).

## 29. Feature Flags
`enable_auto_ocr`, `enable_watermarking_on_preview`.

## 30. Licenciamento
Módulo Base de Custos Variáveis (Paga-se Tiering por Terabytes de armazenamento).

## 31. Política de Retenção
O Motor expurga (limpa) periodicamente. Logs do POS e Fechos de Caixa diários de 2015 são eliminados hoje se a regra ditar `Retenção = 10 Anos`.

## 32. Versionamento
Ao fazer upload do `Fatura.pdf` para o mesmo DocID, o sistema não sobrepõe. Cria a `v2`. A `v1` fica inalterada em *Cold Storage*. Possibilidade de fazer Roll-Back.

## 33. IA e Pesquisa Inteligente
- **Auto-Tagging:** O motor NLP extrai nomes de entidades (ex: Lê o PDF e descobre que o cliente "Hilton" é mencionado, adicionando a Tag `#Hilton` automaticamente).

## 34. Checklist Funcional
- [ ] Upload de 50 documentos em *bulk* funciona sem rebentar a memória do navegador?
- [ ] A pré-visualização de Word/Excel abre no ERP sem requerer instalação do Office local?

## 35. Checklist Técnico
- [ ] O ElasticSearch sincroniza instantaneamente após a Inserção do Metadata na Base de Dados?

## 36. Checklist UX
- [ ] Duplo clique no Explorador abre o Preview? Botão direito tem *Context Menu* de "Nova Versão"?

## 37. Checklist QA
- [ ] Injetar código malicioso num `.pdf` falso e submeter para testar o sistema de proteção de entrada.

## 38. Melhorias Futuras
Integração de LLMs locais privados (como o Llama 3) para ler toda a documentação de SOPs do Hotel e agir como um ChatGPT interno para os novos funcionários perguntarem "Como se limpa o quarto Standard?".
