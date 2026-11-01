import { lazy, type ComponentType } from 'react';

// ---- Views REAIS já implementadas ----
const DashboardMDMView = lazy(() => import('../components/views/DashboardMDMView'));
const ItemsView = lazy(() => import('../components/masterdata/ItemsView'));
const CategoriesView = lazy(() => import('../components/masterdata/CategoriesView'));
const UomsView = lazy(() => import('../components/masterdata/UomsView'));
const TaxesView = lazy(() => import('../components/masterdata/TaxesView'));
const BrandsView = lazy(() => import('../components/masterdata/BrandsView'));
const PaymentMethodsView = lazy(() => import('../components/masterdata/PaymentMethodsView'));
const SupplierListView = lazy(() => import('../components/esm/SupplierListView'));
const EsmDashboardView = lazy(() => import('../components/esm/EsmDashboardView'));
const PurchaseOrdersView = lazy(() => import('../components/procurement/PurchaseOrdersView'));
const GoodsReceiptsView = lazy(() => import('../components/procurement/GoodsReceiptsView'));
const CollaboratorsList = lazy(() => import('../pages/backoffice/workforce/CollaboratorsList'));
const RolesView = lazy(() => import('../components/views/auth/RolesView'));
const PermissionsMatrixView = lazy(() => import('../components/views/auth/PermissionsMatrixView'));
const ContextRulesView = lazy(() => import('../components/views/auth/ContextRulesView'));
const OutletsView = lazy(() => import('../components/posmgmt/OutletsView'));
const SalesView = lazy(() => import('../components/posmgmt/SalesView'));
const KDSView = lazy(() => import('../components/posmgmt/KDSView'));
const AuditView = lazy(() => import('../components/posmgmt/AuditView'));
const EdcInboxView = lazy(() => import('../components/views/EdcInboxView'));
const GiftCardsView = lazy(() => import('../components/posmgmt/GiftCardsView'));
const DesktopWallpaperView = lazy(() => import('../components/admin/DesktopWallpaperView'));
const FeatureFlagsView = lazy(() => import('../components/admin/FeatureFlagsView'));
const CompaniesView = lazy(() => import('../components/org/OrgViews').then((m) => ({ default: m.CompaniesView })));
const HotelsView = lazy(() => import('../components/org/OrgViews').then((m) => ({ default: m.HotelsView })));
const DepartmentsOrgView = lazy(() => import('../components/org/OrgViews').then((m) => ({ default: m.DepartmentsOrgView })));
const AreasView = lazy(() => import('../components/org/OrgViews').then((m) => ({ default: m.AreasView })));
const CurrenciesView = lazy(() => import('../components/masterdata/CadastrosViews').then((m) => ({ default: m.CurrenciesView })));
const CountriesView = lazy(() => import('../components/masterdata/CadastrosViews').then((m) => ({ default: m.CountriesView })));
const BanksView = lazy(() => import('../components/masterdata/CadastrosViews').then((m) => ({ default: m.BanksView })));
const LanguagesView = lazy(() => import('../components/masterdata/CadastrosViews').then((m) => ({ default: m.LanguagesView })));
const CustomersView = lazy(() => import('../components/masterdata/CadastrosViews').then((m) => ({ default: m.CustomersView })));
const UsersView = lazy(() => import('../components/security/SecurityViews').then((m) => ({ default: m.UsersView })));
const SessionsView = lazy(() => import('../components/security/SecurityViews').then((m) => ({ default: m.SessionsView })));
const LoginHistoryView = lazy(() => import('../components/security/SecurityViews').then((m) => ({ default: m.LoginHistoryView })));
const PriceListsView = lazy(() => import('../components/commercial/PriceListsView'));
const ItemAdvancedView = lazy(() => import('../components/masterdata/ItemAdvancedView'));
const InvWarehousesView = lazy(() => import('../components/warehouse/WarehouseViews').then((m) => ({ default: m.WarehousesView })));
const InvStockLevelsView = lazy(() => import('../components/warehouse/WarehouseViews').then((m) => ({ default: m.StockLevelsView })));
const InvStockMovementsView = lazy(() => import('../components/warehouse/WarehouseViews').then((m) => ({ default: m.StockMovementsView })));
const RequisitionsView = lazy(() => import('../components/procurement/ProcurementFlowViews').then((m) => ({ default: m.RequisitionsView })));
const RfqComparisonView = lazy(() => import('../components/procurement/ProcurementFlowViews').then((m) => ({ default: m.RfqComparisonView })));
const AccountsPayableView = lazy(() => import('../components/finance/AccountsPayableView'));
const AccountsReceivableView = lazy(() => import('../components/finance/AccountsReceivableView'));
const OperationsCenterView = lazy(() => import('../components/ops/OperationsCenterViews').then((m) => ({ default: m.OperationsCenterView })));
const LiveTablesMonitor = lazy(() => import('../components/ops/OperationsCenterViews').then((m) => ({ default: m.LiveTablesMonitor })));
const DocumentCenterView = lazy(() => import('../components/documents/DocumentCenterView'));
const BookingEngineView = lazy(() => import('../components/integration/BookingEngineView'));
const SupportCenterView = lazy(() => import('../components/system/SupportCenterView'));
const ChannelManagerView = lazy(() => import('../components/integration/ChannelManagerView'));
const ManagementDashboard = lazy(() => import('../components/reporting/ManagementDashboard'));
const AccountsView = lazy(() => import('../components/finance/AccountsView'));
const ReceiptsView = lazy(() => import('../components/finance/ReceiptsView'));
const PaymentsView = lazy(() => import('../components/finance/PaymentsView'));
const InvoicesView = lazy(() => import('../components/finance/InvoicesView'));
const PromotionsView = lazy(() => import('../components/commercial/PromotionsView'));
const CombosView = lazy(() => import('../components/commercial/CombosView'));
const FiscalDashboardView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.FiscalDashboardView })));
const FiscalSeriesView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.FiscalSeriesView })));
const FiscalDocumentsView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.FiscalDocumentsView })));
const CommercialDocumentsView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.CommercialDocumentsView })));
const TaxEngineView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.TaxEngineView })));
const FiscalConnectivityView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.FiscalConnectivityView })));
const FiscalAuditView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.FiscalAuditView })));
const FiscalArchiveView = lazy(() => import('../components/fiscal/FiscalCenterViews').then((m) => ({ default: m.FiscalArchiveView })));
const AgtTransmitView = lazy(() => import('../components/fiscal/AgtTransmitView'));
const HotelProfileView = lazy(() => import('../components/org/HotelProfileView'));
const AuditTrailView = lazy(() => import('../components/system/AuditTrailView'));
const PosConfigView = lazy(() => import('../components/posconfig/PosConfigView'));
const AgtCertificationView = lazy(() => import('../components/fiscal/AgtCertificationView'));
const SaftCenterViewNew = lazy(() => import('../components/fiscal/SaftCenterView'));
const ProfileAccessView = lazy(() => import('../components/security/ProfileAccessView'));
// PMS — Property Management System (Centro 11)
const PmsShell = lazy(() => import('../components/pms/PmsShell'));
// F&B Operations Center (Centro 10)
// Warehouse Center (Centro 09)
const WhDashboardView = lazy(() => import('../components/warehouse/wh/WhDashboardView'));
const WhLocationsView = lazy(() => import('../components/warehouse/wh/WhLocationsView'));
const WhLotsView = lazy(() => import('../components/warehouse/wh/WhLotsView'));
const WhTransfersView = lazy(() => import('../components/warehouse/wh/WhTransfersView'));
const WhInventoryView = lazy(() => import('../components/warehouse/wh/WhInventoryView'));
const WhCostingView = lazy(() => import('../components/warehouse/wh/WhCostingView'));
const WhProductionView = lazy(() => import('../components/warehouse/wh/WhProductionView'));
const ImportarDadosView = lazy(() => import('../components/masterdata/ImportarDadosView'));
// SRM — Supplier Relationship (Centro 07)
const SrmContractsView = lazy(() => import('../components/esm/SrmViews').then((m) => ({ default: m.SrmContractsView })));
const SrmDocumentsView = lazy(() => import('../components/esm/SrmViews').then((m) => ({ default: m.SrmDocumentsView })));
const SrmCertificatesView = lazy(() => import('../components/esm/SrmViews').then((m) => ({ default: m.SrmCertificatesView })));
const SrmSlaView = lazy(() => import('../components/esm/SrmViews').then((m) => ({ default: m.SrmSlaView })));
const SrmEvaluationView = lazy(() => import('../components/esm/SrmViews').then((m) => ({ default: m.SrmEvaluationView })));
// Hotel Management (Centro 04)
const HmcDashboardView = lazy(() => import('../components/org/HmcViews').then((m) => ({ default: m.HmcDashboardView })));
const HmcBuildingsView = lazy(() => import('../components/org/HmcViews').then((m) => ({ default: m.HmcBuildingsView })));
const HmcFloorsView = lazy(() => import('../components/org/HmcViews').then((m) => ({ default: m.HmcFloorsView })));
const HmcProfitCentersView = lazy(() => import('../components/org/HmcViews').then((m) => ({ default: m.HmcProfitCentersView })));
const HmcCostCentersView = lazy(() => import('../components/org/HmcViews').then((m) => ({ default: m.HmcCostCentersView })));
const HmcResourcesView = lazy(() => import('../components/org/HmcViews').then((m) => ({ default: m.HmcResourcesView })));
// Configuração transversal — Integração (20), Notificações (06), Documentos (18), Sistema (21)
const IntLocksView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.IntLocksView })));
const IntBankPosView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.IntBankPosView })));
const IntScalesView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.IntScalesView })));
const IntPrintersView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.IntPrintersView })));
const IntApisView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.IntApisView })));
const NtfEmailsView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.NtfEmailsView })));
const NtfSmsView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.NtfSmsView })));
const NtfPushView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.NtfPushView })));
const NtfAlertsView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.NtfAlertsView })));
const DocTemplatesView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.DocTemplatesView })));
const DocPdfView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.DocPdfView })));
const DocSignaturesView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.DocSignaturesView })));
const SysSchedulerView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.SysSchedulerView })));
const SysLogsView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.SysLogsView })));
const SysUpdatesView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.SysUpdatesView })));
const SysCacheView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.SysCacheView })));
const SysBackupsView = lazy(() => import('../components/system/PlatformViews').then((m) => ({ default: m.SysBackupsView })));
// Tanda final — Workflow(19), Compras(08), Comercial(06), Finanças(14), Admin(01), Segurança(03)
const WfcDashboardView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.WfcDashboardView })));
const WfcFlowsView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.WfcFlowsView })));
const WfcTasksView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.WfcTasksView })));
const ProcDashboardView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.ProcDashboardView })));
const ProcReturnsView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.ProcReturnsView })));
const ProcPlanningView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.ProcPlanningView })));
const ComDashboardView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.ComDashboardView })));
const ComLoyaltyView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.ComLoyaltyView })));
const FinReconciliationView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.FinReconciliationView })));
const AdmGroupsView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.AdmGroupsView })));
const AdmModuleStatusView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.AdmModuleStatusView })));
const AdmVersionsView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.AdmVersionsView })));
const SecDashboardView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.SecDashboardView })));
const SecPinView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.SecPinView })));
const SecMfaView = lazy(() => import('../components/final/FinalViews').then((m) => ({ default: m.SecMfaView })));
// Contabilidade Geral (Centro 22 · PGC-AO)
const AccDashboardView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccDashboardView })));
const AccChartView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccChartView })));
const AccEntriesView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccEntriesView })));
const AccJournalsView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccJournalsView })));
const AccLedgerView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccLedgerView })));
const AccTrialBalanceView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccTrialBalanceView })));
const AccStatementsView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccStatementsView })));
const AccIntegrationView = lazy(() => import('../components/accounting/AccountingViews').then((m) => ({ default: m.AccIntegrationView })));

export interface NavItem { id: string; name: string; }
export interface NavModule { key: string; title: string; items: NavItem[]; }

// Wrappers (mesmo componente, contexto próprio)
const EdcInbox = () => <EdcInboxView onClose={() => {}} />;
// Displays por estação — a cozinha/bar/pastelaria NUNCA veem o POS (sem preços/clientes/pagamentos).
export const KitchenDisplay = () => <KDSView fixedStation="KITCHEN" title="Kitchen Display — Cozinha" />;
export const BarDisplay = () => <KDSView fixedStation="BAR" title="Bar / Beverage Display" />;
export const PastryDisplay = () => <KDSView fixedStation="PASTRY" title="Pastry Display — Pastelaria" />;
export const BuffetDisplay = () => <KDSView fixedStation="BUFFET" title="Buffet Display" />;
// Lançador do Terminal POS (o FrontOffice tátil abre em ecrã cheio, fora do backoffice).
const PosTerminalLauncher = () => (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
    <div className="text-lg font-bold text-[#111827]">Terminal POS (FrontOffice)</div>
    <p className="text-sm text-gray-600 max-w-md">O terminal de venda tátil abre em ecrã cheio, com sessão própria do operador. Clique para abrir.</p>
    <a href="/pos" className="px-6 py-3 bg-[#FFFFFF] border-b border-[#E6E8EC] text-[#111827] rounded-lg font-bold hover:bg-[#FFFFFF] border-b border-[#E6E8EC]">Abrir Terminal POS →</a>
  </div>
);

// Registry: id -> componente REAL. Ids sem entrada aqui são placeholders honestos.
export const VIEW_REGISTRY: Record<string, ComponentType<any>> = {
  // 01 · Administration
  adm_dashboard: DashboardMDMView,
  adm_audit: AuditView,
  adm_documents: EdcInbox,
  adm_appearance: DesktopWallpaperView,
  adm_features: FeatureFlagsView,

  // 03 · Security
  sec_users: UsersView,
  sec_rbac: RolesView,
  sec_permissions: PermissionsMatrixView,
  sec_access: ProfileAccessView,
  sec_abac: ContextRulesView,
  sec_sessions: SessionsView,
  sec_login_history: LoginHistoryView,

  // 04 · Hotel Management
  hmc_dashboard: HmcDashboardView,
  hmc_hotels: HotelsView,
  org_profile: HotelProfileView,   // Ficha do Hotel — dados da propriedade + fiscais
  sys_trail: AuditTrailView,       // Repositório & Pesquisa Global (regista tudo)
  posc_config: PosConfigView,      // CONFIGURAÇÃO POS — artigos, grupos, famílias, teclados…
  hmc_buildings: HmcBuildingsView,
  hmc_floors: HmcFloorsView,
  hmc_areas: AreasView,
  hmc_outlets: OutletsView,
  hmc_departments: DepartmentsOrgView,
  hmc_profit_centers: HmcProfitCentersView,
  hmc_cost_centers: HmcCostCentersView,
  hmc_resources: HmcResourcesView,
  md_warehouses: InvWarehousesView,

  // 05 · Master Data
  md_items: ItemsView,
  md_categories: CategoriesView,
  md_subcategories: CategoriesView,
  md_uoms: UomsView,
  md_taxes: TaxesView,
  md_brands: BrandsView,
  md_payment_methods: PaymentMethodsView,
  md_suppliers: SupplierListView,
  md_employees: CollaboratorsList,
  md_companies: CompaniesView,
  md_hotels: HotelsView,
  md_departments: DepartmentsOrgView,
  md_areas: AreasView,
  md_conversions: ItemAdvancedView,
  md_customers: CustomersView,
  md_currencies: CurrenciesView,
  md_countries: CountriesView,
  md_banks: BanksView,
  md_languages: LanguagesView,

  // 06 · Commercial
  com_pricing: PriceListsView,
  com_promotions: PromotionsView,
  com_happyhour: PromotionsView,
  com_combos: CombosView,
  com_giftcards: GiftCardsView,

  // 07 · Supplier Relationship
  srm_dashboard: EsmDashboardView,
  srm_performance: EsmDashboardView,

  // 08 · Procurement
  proc_requests: RequisitionsView,
  proc_approvals: RequisitionsView,
  proc_rfq: RfqComparisonView,
  proc_comparison: RfqComparisonView,
  proc_po: PurchaseOrdersView,
  proc_grn: GoodsReceiptsView,

  // 09 · Warehouse (motor de stock real)
  wh_dashboard: WhDashboardView,
  wh_warehouses: InvWarehousesView,
  wh_locations: WhLocationsView,
  wh_stock: InvStockLevelsView,
  wh_movements: InvStockMovementsView,
  wh_transfers: WhTransfersView,
  wh_inventory: WhInventoryView,
  wh_lots: WhLotsView,
  wh_costing: WhCostingView,
  wh_production: WhProductionView,
  md_import: ImportarDadosView,

  // 10 · F&B Operations Center — cérebro da restauração

  // 11 · Front Office (PMS) — ecrã inteiro, cabeçalho próprio, ver PmsShell.tsx.
  // NUNCA registar os ecrãs pms_* individuais aqui — isso reabre a árvore
  // clássica (Ficheiro/Editar/Ribbon) por cima do PMS, que é exatamente o que
  // NÃO se quer (o PMS tem de manter SEMPRE o mesmo cabeçalho próprio).
  pms_home: PmsShell,

  // 12 · POS Management Center (mais pequeno)

  // 13 · POS FrontOffice (interface de venda; terminal tátil em /pos/terminal)
  pfo_sales: SalesView,

  // 14 · Financial
  fin_cash: AccountsView,
  fin_receipts: ReceiptsView,
  fin_payments: PaymentsView,
  fin_invoicing: InvoicesView,
  fin_ledger: AccountsPayableView,
  fin_receivables: AccountsReceivableView,

  // 16 · Centro de Operações (torre de controlo)
  ops_dashboard: OperationsCenterView,
  ops_tables: LiveTablesMonitor,
  ops_kitchen: KDSView,
  ops_sales: ManagementDashboard,

  // 17 · Reporting — ANÁLISE/KPIs (o repositório de documentos vive no Document Center)
  rep_admin: ManagementDashboard,
  rep_finance: ManagementDashboard,
  rep_pos: ManagementDashboard,
  rep_fnb: ManagementDashboard,
  rep_warehouse: ManagementDashboard,
  rep_hotel: ManagementDashboard,
  rep_kitchen: ManagementDashboard,
  rep_pms: ManagementDashboard,
  rep_procurement: ManagementDashboard,
  rep_fiscal: ManagementDashboard,

  // 15 · Angola Tax & Fiscal Compliance Center
  fis_dashboard: FiscalDashboardView,
  fis_series: FiscalSeriesView,
  fis_commercial: CommercialDocumentsView,
  fis_einvoice: FiscalDocumentsView,
  fis_tax: TaxEngineView,
  fis_saft: SaftCenterViewNew,
  fis_archive: FiscalArchiveView,
  fis_agt: FiscalConnectivityView,
  fis_transmit: AgtTransmitView,      // Centro de Transmissão AGT (faturação eletrónica)
  fis_certification: AgtCertificationView,
  fis_audit: FiscalAuditView,

  // 18 · Document Center
  doc_center: DocumentCenterView,
  doc_inbox: EdcInbox,

  // 20 · Integration Center
  int_booking: BookingEngineView,
  int_channel: ChannelManagerView,
  int_locks: IntLocksView,
  int_bank_pos: IntBankPosView,
  int_scales: IntScalesView,
  int_printers: IntPrintersView,
  int_apis: IntApisView,

  // 06 · Notificações
  ntf_emails: NtfEmailsView,
  ntf_sms: NtfSmsView,
  ntf_push: NtfPushView,
  ntf_alerts: NtfAlertsView,

  // 18 · Documentos
  doc_templates: DocTemplatesView,
  doc_pdf: DocPdfView,
  doc_signatures: DocSignaturesView,

  // 21 · System Center
  sys_diagnostics: SupportCenterView,
  sys_backups: SysBackupsView,
  sys_scheduler: SysSchedulerView,
  sys_logs: SysLogsView,
  sys_cache: SysCacheView,
  sys_updates: SysUpdatesView,

  // --- Reutilização: placeholders que são o MESMO ecrã de um componente já real ---
  adm_companies: CompaniesView,
  adm_hotels: HotelsView,
  adm_clients: CustomersView,
  adm_users: UsersView,
  adm_logs: AuditView,
  adm_monitor: OperationsCenterView,
  sec_audit: LoginHistoryView,
  sec_devices: SessionsView,
  com_menus: CombosView,   // "Menus Comerciais" = combos com preço próprio (o ecrã do Commercial)
  com_discounts: PromotionsView,
  com_campaigns: PromotionsView,
  com_vouchers: GiftCardsView,
  srm_suppliers: SupplierListView,
  srm_contracts: SrmContractsView,
  srm_sla: SrmSlaView,
  srm_evaluation: SrmEvaluationView,
  srm_certificates: SrmCertificatesView,
  srm_documents: SrmDocumentsView,
  proc_workflow: RequisitionsView,
  fin_dashboard: ManagementDashboard,

  // --- Tanda final: Workflow(19), Compras(08), Comercial(06), Finanças(14), Admin(01), Segurança(03) ---
  wfc_dashboard: WfcDashboardView,
  wfc_flows: WfcFlowsView,
  wfc_tasks: WfcTasksView,
  proc_dashboard: ProcDashboardView,
  proc_returns: ProcReturnsView,
  proc_planning: ProcPlanningView,
  com_dashboard: ComDashboardView,
  com_loyalty: ComLoyaltyView,
  fin_reconciliation: FinReconciliationView,
  adm_groups: AdmGroupsView,
  adm_module_status: AdmModuleStatusView,
  adm_versions: AdmVersionsView,
  sec_dashboard: SecDashboardView,
  sec_pin: SecPinView,
  sec_mfa: SecMfaView,

  // --- Últimos casos de fronteira ---
  md_families: CategoriesView,        // famílias de artigos = agrupamento de categorias
  md_doctypes: FiscalSeriesView,      // tipos de documento vivem no centro fiscal
  pfo_terminal: PosTerminalLauncher,  // lançador do terminal tátil

  // 22 · Contabilidade Geral (PGC-AO)
  acc_dashboard: AccDashboardView,
  acc_chart: AccChartView,
  acc_entries: AccEntriesView,
  acc_journals: AccJournalsView,
  acc_ledger: AccLedgerView,
  acc_trial_balance: AccTrialBalanceView,
  acc_statements: AccStatementsView,
  acc_integration: AccIntegrationView,
};

// ==========================================================================
// System Mwana Lodge — 21 Management Centers.
// Cada center é uma aplicação de negócio própria (menu/dashboard/permissões).
// NOTA: o Licensing Center (02) vive na consola PCC (fornecedor), NÃO no backoffice
// do ERP — regra "no backoffice não pode haver nada do PCC". Aqui só se consome/valida.
// ==========================================================================
export const MODULES: NavModule[] = [
  {
    key: 'admin', title: '01 · Administration Center', items: [
      { id: 'adm_dashboard', name: 'Dashboard Geral' },
      { id: 'adm_companies', name: 'Empresas' },
      { id: 'adm_groups', name: 'Grupos' },
      { id: 'adm_hotels', name: 'Hotéis' },
      { id: 'adm_clients', name: 'Clientes' },
      { id: 'adm_users', name: 'Utilizadores' },
      { id: 'adm_module_status', name: 'Estado dos Módulos' },
      { id: 'adm_features', name: 'Funcionalidades (Licença)' },
      { id: 'adm_versions', name: 'Versões' },
      { id: 'adm_monitor', name: 'Monitorização' },
      { id: 'adm_audit', name: 'Auditoria' },
      { id: 'adm_documents', name: 'Documentos' },
      { id: 'adm_appearance', name: 'Papel de Parede' },
      { id: 'adm_logs', name: 'Logs' },
    ],
  },
  {
    key: 'security', title: '03 · Security Center', items: [
      { id: 'sec_dashboard', name: 'Dashboard' },
      { id: 'sec_users', name: 'Utilizadores' },
      { id: 'sec_rbac', name: 'Perfis / Roles' },
      { id: 'sec_permissions', name: 'Permissões' },
      { id: 'sec_access', name: 'Acessos por Perfil' },
      { id: 'sec_abac', name: 'Regras ABAC' },
      { id: 'sec_pin', name: 'PIN & Cartões' },
      { id: 'sec_mfa', name: 'MFA' },
      { id: 'sec_sessions', name: 'Sessões' },
      { id: 'sec_devices', name: 'Dispositivos' },
      { id: 'sec_audit', name: 'Auditoria' },
    ],
  },
  {
    key: 'hotel', title: '04 · Hotel Management Center', items: [
      { id: 'hmc_dashboard', name: 'Dashboard' },
      { id: 'org_profile', name: 'Ficha do Hotel' },
      { id: 'hmc_hotels', name: 'Hotéis' },
      { id: 'hmc_buildings', name: 'Blocos / Torres / Edifícios' },
      { id: 'hmc_floors', name: 'Pisos & Alas' },
      { id: 'hmc_areas', name: 'Áreas' },
      { id: 'hmc_outlets', name: 'Outlets (F&B, Spa, Loja…)' },
      { id: 'hmc_departments', name: 'Departamentos' },
      { id: 'hmc_profit_centers', name: 'Centros de Lucro' },
      { id: 'hmc_cost_centers', name: 'Centros de Custo' },
      { id: 'hmc_resources', name: 'Recursos & Equipamentos' },
    ],
  },
  {
    key: 'masterdata', title: '05 · Master Data Center', items: [
      { id: 'md_items', name: 'Artigos' },
      { id: 'md_categories', name: 'Categorias' },
      { id: 'md_subcategories', name: 'Subcategorias' },
      { id: 'md_families', name: 'Famílias' },
      { id: 'md_brands', name: 'Marcas' },
      { id: 'md_uoms', name: 'Unidades' },
      { id: 'md_conversions', name: 'Conversões' },
      { id: 'md_taxes', name: 'Impostos' },
      { id: 'md_payment_methods', name: 'Métodos de Pagamento' },
      { id: 'md_customers', name: 'Clientes' },
      { id: 'md_suppliers', name: 'Fornecedores' },
      { id: 'md_employees', name: 'Funcionários' },
      { id: 'md_currencies', name: 'Moedas' },
      { id: 'md_countries', name: 'Países' },
      { id: 'md_languages', name: 'Idiomas' },
      { id: 'md_banks', name: 'Bancos' },
      { id: 'md_doctypes', name: 'Tipos de Documento' },
      { id: 'md_import', name: 'Importar de outro sistema' },
    ],
  },
  {
    key: 'commercial', title: '06 · Commercial Center', items: [
      { id: 'com_dashboard', name: 'Dashboard' },
      { id: 'com_pricing', name: 'Pricing Engine' },
      { id: 'com_campaigns', name: 'Campanhas' },
      { id: 'com_promotions', name: 'Promoções' },
      { id: 'com_happyhour', name: 'Happy Hour' },
      { id: 'com_combos', name: 'Combos' },
      { id: 'com_menus', name: 'Menus Comerciais' },
      { id: 'com_discounts', name: 'Descontos' },
      { id: 'com_giftcards', name: 'Gift Cards' },
      { id: 'com_vouchers', name: 'Vouchers' },
      { id: 'com_loyalty', name: 'Fidelização' },
    ],
  },
  {
    key: 'srm', title: '07 · Supplier Relationship Center', items: [
      { id: 'srm_dashboard', name: 'Dashboard' },
      { id: 'srm_suppliers', name: 'Fornecedores' },
      { id: 'srm_contracts', name: 'Contratos' },
      { id: 'srm_sla', name: 'SLA' },
      { id: 'srm_evaluation', name: 'Avaliações' },
      { id: 'srm_performance', name: 'Performance' },
      { id: 'srm_certificates', name: 'Certificados' },
      { id: 'srm_documents', name: 'Documentos' },
    ],
  },
  {
    key: 'procurement', title: '08 · Procurement Center', items: [
      { id: 'proc_dashboard', name: 'Dashboard' },
      { id: 'proc_requests', name: 'Requisições' },
      { id: 'proc_workflow', name: 'Workflow' },
      { id: 'proc_rfq', name: 'RFQ' },
      { id: 'proc_po', name: 'Ordens de Compra' },
      { id: 'proc_grn', name: 'Receção (GRN)' },
      { id: 'proc_returns', name: 'Devoluções' },
      { id: 'proc_planning', name: 'Planeamento' },
    ],
  },
  {
    key: 'warehouse', title: '09 · Warehouse Center', items: [
      { id: 'wh_dashboard', name: 'Dashboard' },
      { id: 'wh_warehouses', name: 'Armazéns' },
      { id: 'wh_locations', name: 'Localizações' },
      { id: 'wh_stock', name: 'Stocks' },
      { id: 'wh_movements', name: 'Movimentos' },
      { id: 'wh_transfers', name: 'Transferências' },
      { id: 'wh_inventory', name: 'Inventários' },
      { id: 'wh_lots', name: 'Lotes & Validades' },
      { id: 'wh_costing', name: 'FIFO / FEFO' },
      { id: 'wh_production', name: 'Ordens de Produção' },
    ],
  },
  {
    // PMS é ecrã inteiro (como a Configuração POS) — cabeçalho e menus PRÓPRIOS
    // dentro do PmsShell, NUNCA a árvore clássica. Uma entrada só, de propósito.
    key: 'pms', title: '11 · Front Office (PMS)', items: [
      { id: 'pms_home', name: 'PMS' },
    ],
  },
  {
    // O MÓDULO POS é a CONFIGURAÇÃO POS. Os antigos ecrãs soltos (Outlets, Terminais,
    // Operadores, Turnos, Impressoras, Product Config, Configuração Operacional…) foram
    // ELIMINADOS: tudo isso vive agora dentro deste ecrã, num só sítio, com CRUD real.
    key: 'posmgmt', title: '12 · POS', items: [
      { id: 'posc_config', name: 'Configuração POS' },
    ],
  },
  {
    key: 'posfront', title: '13 · POS FrontOffice', items: [
      { id: 'pfo_sales', name: 'Venda (Balcão)' },
      { id: 'pfo_terminal', name: 'Terminal Tátil (/pos/terminal)' },
    ],
  },
  {
    key: 'financial', title: '14 · Financial Center', items: [
      { id: 'fin_dashboard', name: 'Dashboard' },
      { id: 'fin_cash', name: 'Tesouraria & Contas' },
      { id: 'fin_receipts', name: 'Recebimentos' },
      { id: 'fin_payments', name: 'Pagamentos' },
      { id: 'fin_invoicing', name: 'Faturação' },
      { id: 'fin_receivables', name: 'Contas a Receber (Clientes)' },
      { id: 'fin_ledger', name: 'Contas a Pagar (Fornecedores)' },
      { id: 'fin_reconciliation', name: 'Conciliação' },
    ],
  },
  {
    key: 'fiscal', title: '15 · Angola Tax & Fiscal Compliance', items: [
      { id: 'fis_dashboard', name: 'Dashboard Fiscal' },
      { id: 'fis_series', name: 'Séries & Tipos de Documento' },
      { id: 'fis_commercial', name: 'Documentos Comerciais' },
      { id: 'fis_tax', name: 'Tax / IVA Engine' },
      { id: 'fis_einvoice', name: 'Faturação Eletrónica' },
      { id: 'fis_saft', name: 'SAF-T (AO)' },
      { id: 'fis_archive', name: 'Fiscal Archive' },
      { id: 'fis_agt', name: 'Fiscal Connectivity (AGT)' },
      { id: 'fis_transmit', name: 'Transmissão AGT (e-Fatura)' },
      { id: 'fis_certification', name: 'Certificação AGT' },
      { id: 'fis_audit', name: 'Auditoria Fiscal' },
    ],
  },
  {
    key: 'accounting', title: '22 · Contabilidade Geral (PGC-AO)', items: [
      { id: 'acc_dashboard', name: 'Dashboard' },
      { id: 'acc_chart', name: 'Plano de Contas' },
      { id: 'acc_entries', name: 'Lançamentos' },
      { id: 'acc_journals', name: 'Diários & Exercícios' },
      { id: 'acc_ledger', name: 'Razão' },
      { id: 'acc_trial_balance', name: 'Balancete' },
      { id: 'acc_statements', name: 'Demonstrações Financeiras' },
      { id: 'acc_integration', name: 'Integração (Auto-Posting)' },
    ],
  },
  {
    key: 'ops', title: '16 · Centro de Operações', items: [
      { id: 'ops_dashboard', name: 'Painel do Proprietário' },
      { id: 'ops_tables', name: 'Monitor de Mesas' },
      { id: 'ops_kitchen', name: 'Monitor da Cozinha (KDS)' },
      { id: 'ops_sales', name: 'Vendas em Tempo Real' },
    ],
  },
  {
    key: 'reporting', title: '17 · Reporting Center', items: [
      { id: 'rep_admin', name: 'Administração' },
      { id: 'rep_hotel', name: 'Hotel' },
      { id: 'rep_fnb', name: 'Restaurantes & Bar' },
      { id: 'rep_kitchen', name: 'Kitchen' },
      { id: 'rep_pms', name: 'PMS' },
      { id: 'rep_pos', name: 'POS' },
      { id: 'rep_warehouse', name: 'Warehouse' },
      { id: 'rep_procurement', name: 'Compras' },
      { id: 'rep_finance', name: 'Financeiro' },
      { id: 'rep_fiscal', name: 'Fiscal' },
    ],
  },
  {
    key: 'workflow', title: '17 · Workflow Center', items: [
      { id: 'wfc_dashboard', name: 'Dashboard' },
      { id: 'wfc_flows', name: 'Fluxos de Aprovação' },
      { id: 'wfc_tasks', name: 'Tarefas' },
    ],
  },
  {
    key: 'documents', title: '18 · Document Center', items: [
      { id: 'doc_center', name: 'Repositório & Pesquisa Global' },
      { id: 'doc_inbox', name: 'Inbox Documental' },
      { id: 'doc_templates', name: 'Templates' },
      { id: 'doc_pdf', name: 'PDF & Impressão' },
      { id: 'doc_signatures', name: 'Assinaturas & QR' },
    ],
  },
  {
    key: 'notifications', title: '19 · Notification Center', items: [
      { id: 'ntf_emails', name: 'Emails' },
      { id: 'ntf_sms', name: 'SMS' },
      { id: 'ntf_push', name: 'Push' },
      { id: 'ntf_alerts', name: 'Alertas' },
    ],
  },
  {
    key: 'integration', title: '20 · Integration Center', items: [
      { id: 'int_booking', name: 'Booking Engine' },
      { id: 'int_channel', name: 'Channel Manager' },
      { id: 'int_locks', name: 'Fechaduras' },
      { id: 'int_bank_pos', name: 'POS Bancários' },
      { id: 'int_scales', name: 'Balanças' },
      { id: 'int_printers', name: 'Impressoras' },
      { id: 'int_apis', name: 'APIs & Webhooks' },
    ],
  },
  {
    key: 'system', title: '21 · System Center', items: [
      { id: 'sys_backups', name: 'Backups' },
      { id: 'sys_scheduler', name: 'Scheduler' },
      { id: 'sys_logs', name: 'Logs' },
      { id: 'sys_cache', name: 'Cache' },
      { id: 'sys_updates', name: 'Atualizações' },
      { id: 'sys_diagnostics', name: 'Support Center / Diagnóstico' },
    ],
  },
];

// Mapa id -> nome (para títulos/breadcrumb e placeholders).
export const ITEM_TITLES: Record<string, string> = Object.fromEntries(
  MODULES.flatMap((m) => m.items.map((i) => [i.id, i.name]))
);
export const MODULE_OF: Record<string, string> = Object.fromEntries(
  MODULES.flatMap((m) => m.items.map((i) => [i.id, m.title]))
);
// id do item -> chave do módulo (para isolar cada módulo na sua própria janela).
export const ITEM_MODULE_KEY: Record<string, string> = Object.fromEntries(
  MODULES.flatMap((m) => m.items.map((i) => [i.id, m.key]))
);

// Licença: cada center depende (ou não) de um módulo backend. null = sempre ativo (núcleo).
// O dono ativa/desativa via licença; o frontend só mostra os que estão ativos.
export const MODULE_LICENSE: Record<string, string | null> = {
  admin: null, licensing: null, security: null, hotel: null, masterdata: null,
  commercial: 'commercial', srm: 'esm', procurement: 'procurement', warehouse: 'wms',
  posmgmt: 'pos', posfront: 'pos', pms: 'pms',
  financial: 'finance', fiscal: null, accounting: null, ops: null, reporting: null, workflow: null,
  documents: null, notifications: null, integration: null, system: null,
};

export function moduleEnabled(key: string, active: string[]): boolean {
  const req = MODULE_LICENSE[key];
  return !req || active.includes(req);
}

// ==========================================================================
// SUITES (produtos) — a mesma plataforma vendida/organizada em módulos operacionais
// que PARTILHAM o mesmo motor (produtos, stock, faturação, pagamentos, permissões).
// Um center pode pertencer a várias suites. `modules: []` = todos (Backoffice completo).
// ==========================================================================
export interface Suite { key: string; name: string; modules: string[]; }
export const SUITES: Suite[] = [
  { key: 'all', name: 'Plataforma', modules: [] },
  { key: 'backoffice', name: 'Backoffice', modules: ['admin', 'security', 'hotel', 'masterdata', 'commercial', 'srm', 'procurement', 'warehouse', 'financial', 'fiscal', 'accounting', 'reporting', 'documents', 'notifications', 'integration', 'system', 'licensing'] },
  { key: 'pos', name: 'POS', modules: ['posmgmt'] },
  { key: 'ops', name: 'Centro de Operações', modules: ['ops', 'reporting'] },
];
export const suiteIncludes = (suiteKey: string, moduleKey: string): boolean => {
  const s = SUITES.find((x) => x.key === suiteKey);
  if (!s || s.modules.length === 0) return true;
  return s.modules.includes(moduleKey);
};

// Licenciamento por FUNCIONALIDADE: ecrã (id) -> chave de feature. Um ecrã só aparece
// se a feature estiver ativa (licença + override do admin). Espelha core/modules.FEATURES.
export const FEATURE_OF: Record<string, string> = {
  com_loyalty: 'commercial.loyalty', com_menus: 'commercial.combos',
  fis_commercial: 'fiscal.commercial_docs',
  ops_dashboard: 'ops.center',
  int_channel: 'integration.channel_manager', int_booking: 'integration.booking_engine',
};
// Se activeFeatures === null (licença não carregada) mostra tudo (fail-open, como os módulos).
export function featureAllowed(itemId: string, activeFeatures: string[] | null): boolean {
  const feat = FEATURE_OF[itemId];
  if (!feat || activeFeatures == null) return true;
  return activeFeatures.includes(feat);
}

// Agrupamento dos submódulos em dropdowns por área (barra de topo do ambiente do módulo).
// Módulos sem entrada aqui mostram os itens como botões diretos.
export interface MenuGroup { label: string; items: string[]; }
export const MODULE_MENUS: Record<string, MenuGroup[]> = {
  warehouse: [
    { label: 'Stock', items: ['wh_warehouses', 'wh_locations', 'wh_stock', 'wh_movements'] },
    { label: 'Operações', items: ['wh_transfers', 'wh_inventory', 'wh_lots', 'wh_costing', 'wh_production'] },
    { label: 'Painel', items: ['wh_dashboard'] },
  ],
  procurement: [
    { label: 'Compras', items: ['proc_requests', 'proc_rfq', 'proc_po'] },
    { label: 'Receção', items: ['proc_grn', 'proc_returns'] },
    { label: 'Gestão', items: ['proc_dashboard', 'proc_workflow', 'proc_planning'] },
  ],
  masterdata: [
    { label: 'Artigos', items: ['md_items', 'md_categories', 'md_subcategories', 'md_families', 'md_brands', 'md_uoms', 'md_conversions'] },
    { label: 'Entidades', items: ['md_customers', 'md_suppliers', 'md_employees'] },
    { label: 'Financeiro', items: ['md_taxes', 'md_payment_methods', 'md_currencies', 'md_banks'] },
    { label: 'Geografia', items: ['md_countries', 'md_languages', 'md_doctypes'] },
  ],
  financial: [
    { label: 'Tesouraria', items: ['fin_cash', 'fin_receipts', 'fin_payments'] },
    { label: 'Faturação', items: ['fin_invoicing', 'fin_ledger'] },
    { label: 'Conciliação', items: ['fin_reconciliation', 'fin_dashboard'] },
  ],
  commercial: [
    { label: 'Preços', items: ['com_pricing', 'com_promotions', 'com_happyhour', 'com_discounts'] },
    { label: 'Ofertas', items: ['com_combos', 'com_menus', 'com_giftcards', 'com_vouchers'] },
    { label: 'Fidelização', items: ['com_loyalty', 'com_campaigns', 'com_dashboard'] },
  ],
  security: [
    { label: 'Identidade', items: ['sec_users', 'sec_pin', 'sec_mfa'] },
    { label: 'Acessos', items: ['sec_rbac', 'sec_permissions', 'sec_access', 'sec_abac'] },
    { label: 'Monitorização', items: ['sec_sessions', 'sec_devices', 'sec_audit', 'sec_dashboard'] },
  ],
};
// Resolve a chave de módulo a partir da view ativa (item id ou "home:<key>").
export function moduleKeyOf(activeView: string): string {
  if (activeView.startsWith('home:')) return activeView.slice(5);
  return ITEM_MODULE_KEY[activeView] || 'admin';
}
