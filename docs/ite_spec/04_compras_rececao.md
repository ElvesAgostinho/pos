# ITE Submódulo 04: Compras & Receção de Mercadorias (Inbound Logistics)

Este documento descreve a especificação funcional do submódulo que atua como porta de entrada de stock para o Enterprise Inventory Transaction Engine (ITE). Todo o novo inventário gerado por entidades externas entra através deste fluxo.

## 1. Objetivo
Garantir o controlo cego e auditável das entradas de armazém, confrontando fisicamente o que é recebido no cais de descarga com o que foi encomendado (Purchase Order) e com a fatura do fornecedor, atualizando o custo de aquisição em tempo real.

## 2. Fluxo de Negócio
Departamento de Compras emite Encomenda (PO) ➔ Fornecedor entrega no Cais ➔ Operador de Armazém faz "Blind Receiving" (conta sem ver a fatura) ➔ Validação de Lotes, Séries e Validades ➔ Registo de Danos/Devoluções (se houver) ➔ Entrada Oficial no ITE ➔ Criação de Dívida no Módulo Financeiro.

## 3. Casos de Uso
- **Receção Conforme:** Encomendaram-se 1000 Cápsulas de Café; chegam 1000. O ITE atualiza o stock e o custo médio.
- **Receção com Quebra:** Encomendaram-se 50 Garrafas de Vinho. 2 chegaram partidas. O ITE dá entrada de 48 para consumo e 2 diretamente para a conta de "Devolução/Quebra à Receção".
- **Receção de Substituição:** O fornecedor não tem Coca-Cola e envia Pepsi. O sistema exige aprovação do Controller para aceitar o artigo alternativo e atualizar a Nota de Encomenda.

## 4. Wireframe Textual
```text
[ ITE - RECEÇÃO DE MERCADORIAS ]
=========================================================
Fornecedor: [Makro] | Doc: [Fatura-Recibo FS 102/33]
Ref. Encomenda (PO): [PO-2026-8812]
---------------------------------------------------------
Artigo        | Qtd Pedida | Qtd Recebida | Lote / Validade  
Lombo de Vaca | 50 kg      | [ 50 ] kg    | [ L-99X ] [ 2026-12 ]
Vinho Tinto X | 12 un      | [ 10 ] un    | [ L-11A ] [ NA ]
=========================================================
[ Registar Receção Parcial ] [ Confirmar Receção Total ]
```

## 5. Interface Completa
Interface baseada em ecrãs táteis (Tablet/Mobile) para cais de descarga. Suporte agressivo a Scanners de Códigos de Barras 2D (GS1-128) para preenchimento automático de Artigo + Lote + Validade com um único "bip".

## 6. Estrutura do Menu
`Inventário > Logística Inbound`
  ┣ `Aguardar Receção (Encomendas Pendentes)`
  ┣ `Receções Ativas`
  ┣ `Gestão de Devoluções a Fornecedor`
  ┗ `Histórico de Guias/Faturas de Entrada`

## 7. Formulários
- **Reconhecimento de Mercadoria:** Inserção do número da Guia de Remessa do fornecedor, foto do documento físico anexa.
- **Registo de Lote na Receção:** Captura rigorosa das datas de caducidade para produtos F&B obrigatórios.

## 8. Separadores (Receção)
- Encomenda Original
- Artigos Recebidos
- Ocorrências (Discrepâncias, Quebras, Notas de Crédito exigidas)
- Custos Adicionais (Transporte, Seguros, que afetam o CMP).

## 9. Todos os Campos
**`ite_goods_receipts`**: `ReceiptID`, `SupplierID`, `PurchaseOrderID`, `DocReference`, `DocDate`, `TotalValue`, `Status`.
**`ite_goods_receipt_lines`**: `LineID`, `ReceiptID`, `ArticleID`, `ReceivedQty`, `AcceptedQty`, `RejectedQty`, `UnitCost`, `LotNumber`.

## 10. Validações
- Bloqueio absoluto se a Data de Validade recebida for inferior à margem de aceitação (ex: Leite com menos de 3 meses de validade não entra).
- Alerta visual se o Custo Unitário na Guia for > 10% superior ao preço acordado na Encomenda (PO).

## 11. Regras de Negócio
- **Prorrateio de Custos:** Custos de portes de envio são diluídos e somados ao custo unitário de todos os itens daquela receção, garantindo o Custo Real de Aprovisionamento.
- **Blind Receiving:** O colaborador do cais não deve ver as quantidades encomendadas, forçando-o a contar fisicamente cada caixa.

## 12. Estados da Receção
`Expected` (PO emitida), `In-Receiving` (Camião no cais), `Quarantine` (Aguardar inspeção do Chefe), `Received` (Integrado no Stock), `Reverted`.

## 13. Base de Dados
A transação final insere no ITE Ledger registos do tipo `Supplier-Receipt`. Se houver devoluções simultâneas, gera uma transação `Supplier-Return`.

## 14. Relacionamentos
`pur_purchase_orders` 1-N `ite_goods_receipts`.
`ite_goods_receipts` 1-N `ite_transactions`.

## 15. APIs
- `GET /api/ite/receipts/expected` (Lista camiões agendados para hoje).
- `POST /api/ite/receipts/{id}/commit` (Efetiva a entrada no armazém).

## 16. Serviços
- `LandedCostService`: Calcula o custo efetivo após adicionar despesas alfandegárias/portes.
- `VendorRatingService`: Avalia automaticamente o fornecedor (atrasos, quebras, divergência de preços).

## 17. Eventos
- `GoodsReceivedEvent` (Despoleta pagamento no Financeiro).
- `SupplierDiscrepancyEvent`.

## 18. Auditoria
Se o Gestor forçar a entrada de uma mercadoria sem Encomenda (PO) aprovada, esse Over-Ride é reportado imediatamente no Log de Auditoria para o CFO da cadeia.

## 19. Logs
Registo de tempo decorrido desde o início da descarga até à assinatura do auto de receção (Eficiência do Cais).

## 20. Permissões
- `CAN_RECEIVE_WITHOUT_PO` (Receções "cegas" para amostras ou urgências extremas).
- `CAN_CHANGE_RECEPTION_COST`.

## 21. Dashboards
- **Avaliação de Fornecedores:** Taxa de devoluções, taxa de entregas a tempo e horas (OTIF - On Time In Full).
- **Receções Pendentes:** Carga de trabalho prevista para o Cais de Descarga hoje.

## 22. Relatórios
- **Mapa de Receções Mensal:** Total recebido por armazém e por família de artigos.
- **Relatório de Diferenças PO vs Fatura:** Divergências entre o que o Diretor F&B comprou e o que o Armazém validou.

## 23. Configurações
- Tolerância global de sobrefaturação/sobre-quantidade (Aceitar até +5% de quantidade se o fornecedor enviar a mais).

## 24. Automatizações
- Geração automática do draft da Fatura de Compra (Draft Invoice) no módulo Contabilístico para revisão pelo departamento financeiro.

## 25. Performance
Uso de Processamento em Lote (Batch Inserts) se a Guia do Fornecedor (ex: Makro) tiver 5.000 linhas de artigos variados.

## 26. Segurança
Bloqueio de inserção retroativa: Guias de Remessa de há 2 anos não podem ser lançadas no presente sem reabertura formal do período fiscal contabilístico.

## 27. Escalabilidade
Arquitetura preparada para EDI (Electronic Data Interchange), onde faturas eletrónicas dos grandes fornecedores dão entrada automática no ITE aguardando apenas validação visual.

## 28. Integrações
- Integração nativa com ERP de Contabilidade (Cria Conta de Fornecedor, Regista o IVA dedutível).

## 29. Feature Flags
`require_po_for_receipt`, `enable_blind_receiving`, `strict_expiry_check_at_dock`.

## 30. Licenciamento
Módulo "Purchasing & Receiving".

## 31. Checklist Funcional
- [ ] O custo médio foi atualizado se o fornecedor subiu o preço nesta guia?
- [ ] O sistema rejeita o ficheiro EDI se os EANs (códigos de barra) não existirem na BD?

## 32. Checklist Técnico
- [ ] O `LandedCostService` bloqueia arredondamentos falhados (Ex: Portes de 10.00€ para 3 artigos custa 3.33333€ cada)?

## 33. Checklist UX
- [ ] Botões grandes "Escanear Produto" visíveis à distância sob o sol no exterior do cais?

## 34. Checklist QA
- [ ] Testar cancelamento de uma Receção 5 minutos após ocorrer (Reverse Ledger Entry).

## 35. Melhorias Futuras
- OCR / Inteligência Artificial na câmara do telemóvel para ler os papéis sujos dos fornecedores e extrair imediatamente Lotes, Validades e Quantidades sem escrever nada.
