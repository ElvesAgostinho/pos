import type { ComponentType } from 'react';

// ---- Views REAIS já implementadas ----
import DashboardMDMView from '../components/views/DashboardMDMView';
import ItemsView from '../components/masterdata/ItemsView';
import CategoriesView from '../components/masterdata/CategoriesView';
import UomsView from '../components/masterdata/UomsView';
import TaxesView from '../components/masterdata/TaxesView';
import BrandsView from '../components/masterdata/BrandsView';
import PaymentMethodsView from '../components/masterdata/PaymentMethodsView';
import SupplierListView from '../components/esm/SupplierListView';
import EsmDashboardView from '../components/esm/EsmDashboardView';
import RecipesView from '../components/production/RecipesView';
import ProductionAreasView from '../components/production/ProductionAreasView';
import PurchaseOrdersView from '../components/procurement/PurchaseOrdersView';
import GoodsReceiptsView from '../components/procurement/GoodsReceiptsView';
import CollaboratorsList from '../pages/backoffice/workforce/CollaboratorsList';
import POSOperatorsView from '../pages/backoffice/workforce/POSOperatorsView';
import ShiftsView from '../pages/backoffice/workforce/ShiftsView';
import RolesView from '../components/views/auth/RolesView';
import PermissionsMatrixView from '../components/views/auth/PermissionsMatrixView';
import ContextRulesView from '../components/views/auth/ContextRulesView';
import OutletsView from '../components/posmgmt/OutletsView';
import POSProductConfigView from '../components/posmgmt/POSProductConfigView';
import OutletPaymentsView from '../components/posmgmt/OutletPaymentsView';
import CashSessionsView from '../components/posmgmt/CashSessionsView';
import TablesView from '../components/posmgmt/TablesView';
import DeliveryDestinationCenter from '../components/posmgmt/DeliveryDestinationCenter';
import SalesView from '../components/posmgmt/SalesView';
import KDSView from '../components/posmgmt/KDSView';
import AuditView from '../components/posmgmt/AuditView';
import PrintSpoolerView from '../components/posmgmt/PrintSpoolerView';
import OfflineSyncView from '../components/posmgmt/OfflineSyncView';
import OperationConfigView from '../components/pos/OperationConfigView';
import TerminalsConfig from '../pages/backoffice/TerminalsConfig';
import EdcInboxView from '../components/views/EdcInboxView';
import POSReservationsView from '../components/posmgmt/POSReservationsView';
import GiftCardsView from '../components/posmgmt/GiftCardsView';
import TableMapView from '../components/posmgmt/TableMapView';
import PosSupervisionView from '../components/posmgmt/PosSupervisionView';
import AppearanceView from '../components/admin/AppearanceView';
import FeatureFlagsView from '../components/admin/FeatureFlagsView';
import { CompaniesView, HotelsView, DepartmentsOrgView, AreasView } from '../components/org/OrgViews';
import { CurrenciesView, CountriesView, BanksView, LanguagesView, CustomersView } from '../components/masterdata/CadastrosViews';
import { UsersView, SessionsView, LoginHistoryView } from '../components/security/SecurityViews';
import PriceListsView from '../components/commercial/PriceListsView';
import ItemAdvancedView from '../components/masterdata/ItemAdvancedView';
import { WarehousesView as InvWarehousesView, StockLevelsView as InvStockLevelsView, StockMovementsView as InvStockMovementsView } from '../components/warehouse/WarehouseViews';
import { RequisitionsView, RfqComparisonView } from '../components/procurement/ProcurementFlowViews';
import AccountsPayableView from '../components/finance/AccountsPayableView';
import AccountsReceivableView from '../components/finance/AccountsReceivableView';
import FoliosView from '../components/pms/FoliosView';
import { HousekeepingView, MaintenanceView, RatePlansView } from '../components/pms/HotelOpsViews';
import { LaundryView, MinibarView, SpaView } from '../components/pms/HotelServiceViews';
import { PmsDashboardView, NightAuditView, AgenciesView } from '../components/pms/PmsAdminViews';
import { OperationsCenterView, LiveTablesMonitor } from '../components/ops/OperationsCenterViews';
import DocumentCenterView from '../components/documents/DocumentCenterView';
import BookingEngineView from '../components/integration/BookingEngineView';
import SupportCenterView from '../components/system/SupportCenterView';
import ChannelManagerView from '../components/integration/ChannelManagerView';
import ManagementDashboard from '../components/reporting/ManagementDashboard';
import ReservationsView from '../components/pms/ReservationsView';
import FrontDeskView from '../components/pms/FrontDeskView';
import RoomsView from '../components/pms/RoomsView';
import GuestsView from '../components/pms/GuestsView';
import AccountsView from '../components/finance/AccountsView';
import ReceiptsView from '../components/finance/ReceiptsView';
import PaymentsView from '../components/finance/PaymentsView';
import InvoicesView from '../components/finance/InvoicesView';
import PromotionsView from '../components/commercial/PromotionsView';
import CombosView from '../components/commercial/CombosView';
import { FiscalDashboardView, FiscalSeriesView, FiscalDocumentsView, CommercialDocumentsView, TaxEngineView, FiscalConnectivityView, FiscalAuditView, FiscalArchiveView } from '../components/fiscal/FiscalCenterViews';
import AgtTransmitView from '../components/fiscal/AgtTransmitView';
import HotelProfileView from '../components/org/HotelProfileView';
import AuditTrailView from '../components/system/AuditTrailView';
import PosConfigView from '../components/posconfig/PosConfigView';
import AgtCertificationView from '../components/fiscal/AgtCertificationView';
import SaftCenterViewNew from '../components/fiscal/SaftCenterView';
import ProfileAccessView from '../components/security/ProfileAccessView';
import AllergensView from '../components/production/AllergensView';
import PosKeyboardDesigner from '../components/posmgmt/PosKeyboardDesigner';
// F&B Operations Center (Centro 10)
import FnbDashboardView from '../components/production/fnb/FnbDashboardView';
import FnbOutletsView from '../components/production/fnb/FnbOutletsView';
import FnbMenusView from '../components/production/fnb/FnbMenusView';
import FnbEventsView from '../components/production/fnb/FnbEventsView';
import FnbIngredientsView from '../components/production/fnb/FnbIngredientsView';
import FnbHaccpView from '../components/production/fnb/FnbHaccpView';
import FnbWasteView from '../components/production/fnb/FnbWasteView';
import FnbQualityView from '../components/production/fnb/FnbQualityView';
import FnbTimingView from '../components/production/fnb/FnbTimingView';
import FnbReportsView from '../components/production/fnb/FnbReportsView';
// Warehouse Center (Centro 09)
import WhDashboardView from '../components/warehouse/wh/WhDashboardView';
import WhLocationsView from '../components/warehouse/wh/WhLocationsView';
import WhLotsView from '../components/warehouse/wh/WhLotsView';
import WhTransfersView from '../components/warehouse/wh/WhTransfersView';
import WhInventoryView from '../components/warehouse/wh/WhInventoryView';
import WhCostingView from '../components/warehouse/wh/WhCostingView';
// SRM — Supplier Relationship (Centro 07)
import { SrmContractsView, SrmDocumentsView, SrmCertificatesView, SrmSlaView, SrmEvaluationView } from '../components/esm/SrmViews';
// Hotel Management (Centro 04)
import { HmcDashboardView, HmcBuildingsView, HmcFloorsView, HmcProfitCentersView, HmcCostCentersView, HmcResourcesView } from '../components/org/HmcViews';
// Configuração transversal — Integração (20), Notificações (06), Documentos (18), Sistema (21)
import {
  IntLocksView, IntBankPosView, IntScalesView, IntPrintersView, IntApisView,
  NtfEmailsView, NtfSmsView, NtfPushView, NtfAlertsView,
  DocTemplatesView, DocPdfView, DocSignaturesView,
  SysSchedulerView, SysLogsView, SysUpdatesView, SysCacheView, SysBackupsView,
} from '../components/system/PlatformViews';
// Tanda final — Workflow(19), Compras(08), Comercial(06), Finanças(14), Admin(01), Segurança(03)
import {
  WfcDashboardView, WfcFlowsView, WfcTasksView,
  ProcDashboardView, ProcReturnsView, ProcPlanningView,
  ComDashboardView, ComLoyaltyView,
  FinReconciliationView, AdmGroupsView, AdmModuleStatusView, AdmVersionsView,
  SecDashboardView, SecPinView, SecMfaView,
} from '../components/final/FinalViews';
// Contabilidade Geral (Centro 22 · PGC-AO)
import {
  AccDashboardView, AccChartView, AccEntriesView, AccJournalsView,
  AccLedgerView, AccTrialBalanceView, AccStatementsView, AccIntegrationView,
} from '../components/accounting/AccountingViews';

export interface NavItem { id: string; name: string; }
export interface NavModule { key: string; title: string; items: NavItem[]; }

// Wrappers (mesmo componente, contexto próprio)
const EdcInbox = () => <EdcInboxView onClose={() => {}} />;
// Displays por estação — a cozinha/bar/pastelaria NUNCA veem o POS (sem preços/clientes/pagamentos).
const KitchenDisplay = () => <KDSView fixedStation="KITCHEN" title="Kitchen Display — Cozinha" />;
const BarDisplay = () => <KDSView fixedStation="BAR" title="Bar / Beverage Display" />;
const PastryDisplay = () => <KDSView fixedStation="PASTRY" title="Pastry Display — Pastelaria" />;
const BuffetDisplay = () => <KDSView fixedStation="BUFFET" title="Buffet Display" />;
// Outlets F&B por tipo (mesmo componente, tipo/título próprios).
const FnbRestaurants = () => <FnbOutletsView type="RESTAURANT" title="Restaurantes" />;
const FnbBars = () => <FnbOutletsView type="BAR" title="Bares" />;
const FnbCoffee = () => <FnbOutletsView type="COFFEE" title="Coffee Shops" />;
const FnbPoolBar = () => <FnbOutletsView type="POOL_BAR" title="Pool Bars / Rooftop" />;
const FnbRoomService = () => <FnbOutletsView type="ROOM_SERVICE" title="Room Service" />;
const FnbBuffets = () => <FnbOutletsView type="BANQUET" title="Buffets / Banquetes / Catering" />;
// Lançador do Terminal POS (o FrontOffice tátil abre em ecrã cheio, fora do backoffice).
const PosTerminalLauncher = () => (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
    <div className="text-lg font-bold text-[#1e3f66]">Terminal POS (FrontOffice)</div>
    <p className="text-sm text-gray-600 max-w-md">O terminal de venda tátil abre em ecrã cheio, com sessão própria do operador. Clique para abrir.</p>
    <a href="/pos" className="px-6 py-3 bg-[#1e3f66] text-white rounded-lg font-bold hover:bg-[#2a5488]">Abrir Terminal POS →</a>
  </div>
);

// Registry: id -> componente REAL. Ids sem entrada aqui são placeholders honestos.
export const VIEW_REGISTRY: Record<string, ComponentType<any>> = {
  // 01 · Administration
  adm_dashboard: DashboardMDMView,
  adm_audit: AuditView,
  adm_documents: EdcInbox,
  adm_appearance: AppearanceView,
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

  // 10 · F&B Operations Center — cérebro da restauração
  hoc_dashboard: FnbDashboardView,
  hoc_restaurants: FnbRestaurants,
  hoc_bars: FnbBars,
  hoc_coffee: FnbCoffee,
  hoc_poolbar: FnbPoolBar,
  hoc_roomservice: FnbRoomService,
  hoc_buffets: FnbBuffets,
  hoc_events: FnbEventsView,
  hoc_menus: FnbMenusView,
  hoc_recipes: RecipesView,
  hoc_ingredients: FnbIngredientsView,
  hoc_stations: ProductionAreasView,
  hoc_routing: KDSView,            // visão global do routing/produção (todas as estações)
  hoc_kds: KitchenDisplay,         // display dedicado da cozinha
  hoc_bar_display: BarDisplay,     // display dedicado do bar
  hoc_pastry_display: PastryDisplay, // display dedicado da pastelaria
  hoc_buffet_display: BuffetDisplay, // display dedicado do buffet
  hoc_haccp: FnbHaccpView,
  hoc_waste: FnbWasteView,
  hoc_quality: FnbQualityView,
  hoc_timing: FnbTimingView,
  hoc_reports: FnbReportsView,

  // 11 · Front Office (PMS)
  pms_reservations: ReservationsView,
  pms_checkin: FrontDeskView,   // balcão de receção (chegadas/em casa/saídas) — NÃO é a lista de reservas
  pms_rooms: RoomsView,
  pms_housekeeping: HousekeepingView,
  pms_maintenance: MaintenanceView,
  pms_laundry: LaundryView,
  pms_minibar: MinibarView,
  pms_spa: SpaView,
  pms_rates: RatePlansView,
  pms_dashboard: PmsDashboardView,
  pms_nightaudit: NightAuditView,
  pms_agencies: AgenciesView,
  pms_guests: GuestsView,
  pms_ledger: FoliosView,

  // 12 · POS Management Center (mais pequeno)
  posc_outlets: OutletsView,
  posc_rooms: TablesView,
  posc_destinations: DeliveryDestinationCenter,
  posc_dashboard: PosSupervisionView,
  posc_map: TableMapView,
  posc_reservations: POSReservationsView,
  posc_terminals: TerminalsConfig,
  posc_product: POSProductConfigView,
  posc_payments: OutletPaymentsView,
  posc_cash: CashSessionsView,
  posc_operators: POSOperatorsView,
  posc_shifts: ShiftsView,
  posc_printers: PrintSpoolerView,
  posc_offline: OfflineSyncView,
  posc_engine: OperationConfigView,
  posc_audit: AuditView,

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
  com_menus: FnbMenusView,
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
  posc_layouts: PosKeyboardDesigner,  // designer do teclado táctil do POS
  hoc_allergens: AllergensView,       // alergénios (catálogo + atribuição a artigos)
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
      { id: 'adm_appearance', name: 'Personalização' },
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
    ],
  },
  {
    // O cérebro da restauração — NÃO é o POS. A cozinha trabalha aqui, não no POS.
    key: 'hospitality', title: '10 · F&B Operations Center ⭐', items: [
      { id: 'hoc_dashboard', name: 'Dashboard F&B' },
      { id: 'hoc_restaurants', name: 'Restaurantes' },
      { id: 'hoc_bars', name: 'Bares' },
      { id: 'hoc_coffee', name: 'Coffee Shops' },
      { id: 'hoc_poolbar', name: 'Pool Bars / Rooftop' },
      { id: 'hoc_roomservice', name: 'Room Service / Minibar' },
      { id: 'hoc_buffets', name: 'Buffets / Banquetes / Catering' },
      { id: 'hoc_events', name: 'Eventos' },
      { id: 'hoc_menus', name: 'Menu Management' },
      { id: 'hoc_recipes', name: 'Receitas & Fichas Técnicas' },
      { id: 'hoc_ingredients', name: 'Gestão de Ingredientes' },
      { id: 'hoc_routing', name: 'Kitchen Routing (produção)' },
      { id: 'hoc_stations', name: 'Estações de Produção' },
      { id: 'hoc_kds', name: 'Kitchen Display (Cozinha)' },
      { id: 'hoc_bar_display', name: 'Bar / Beverage Display' },
      { id: 'hoc_pastry_display', name: 'Pastry Display' },
      { id: 'hoc_buffet_display', name: 'Buffet Display' },
      { id: 'hoc_allergens', name: 'Alergénios' },
      { id: 'hoc_haccp', name: 'HACCP' },
      { id: 'hoc_waste', name: 'Desperdícios & Quebras' },
      { id: 'hoc_quality', name: 'Controlo de Qualidade' },
      { id: 'hoc_timing', name: 'Service Timing' },
      { id: 'hoc_reports', name: 'Relatórios de Produção' },
    ],
  },
  {
    key: 'pms', title: '11 · Front Office (PMS)', items: [
      { id: 'pms_dashboard', name: 'Dashboard' },
      { id: 'pms_reservations', name: 'Reservas' },
      { id: 'pms_checkin', name: 'Check-in / Check-out' },
      { id: 'pms_rooms', name: 'Quartos' },
      { id: 'pms_housekeeping', name: 'Governanta / Housekeeping' },
      { id: 'pms_maintenance', name: 'Manutenção' },
      { id: 'pms_laundry', name: 'Lavandaria' },
      { id: 'pms_minibar', name: 'Minibar' },
      { id: 'pms_spa', name: 'Spa' },
      { id: 'pms_rates', name: 'Tarifas' },
      { id: 'pms_nightaudit', name: 'Night Audit' },
      { id: 'pms_agencies', name: 'Agências & Empresas' },
      { id: 'pms_ledger', name: 'Guest Ledger' },
      { id: 'pms_guests', name: 'Hóspedes' },
    ],
  },
  {
    key: 'posmgmt', title: '12 · POS Management Center', items: [
      { id: 'posc_config', name: 'Configuração POS' },
      { id: 'posc_dashboard', name: 'Dashboard' },
      { id: 'posc_outlets', name: 'Outlets' },
      { id: 'posc_rooms', name: 'Salas & Mesas' },
      { id: 'posc_map', name: 'Mapa de Mesas' },
      { id: 'posc_destinations', name: 'Destinos de Serviço (Delivery)' },
      { id: 'posc_reservations', name: 'Reservas de Mesa' },
      { id: 'posc_layouts', name: 'Layouts & Keyboard Designer' },
      { id: 'posc_product', name: 'POS Product Config' },
      { id: 'posc_payments', name: 'Métodos de Pagamento' },
      { id: 'posc_cash', name: 'Caixas & Sessões' },
      { id: 'posc_terminals', name: 'Terminais' },
      { id: 'posc_operators', name: 'Operadores' },
      { id: 'posc_shifts', name: 'Turnos' },
      { id: 'posc_printers', name: 'Impressoras / Printer Routing' },
      { id: 'posc_offline', name: 'Sincronização Offline' },
      { id: 'posc_engine', name: 'Configuração Operacional' },
      { id: 'posc_audit', name: 'Auditoria' },
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
  hospitality: 'production', pms: 'pms', posmgmt: 'pos', posfront: 'pos',
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
export interface Suite { key: string; name: string; emoji: string; modules: string[]; }
export const SUITES: Suite[] = [
  { key: 'all', name: 'Plataforma', emoji: '▦', modules: [] },
  { key: 'backoffice', name: 'Backoffice', emoji: '🗄️', modules: ['admin', 'security', 'hotel', 'masterdata', 'commercial', 'srm', 'procurement', 'warehouse', 'hospitality', 'financial', 'fiscal', 'accounting', 'reporting', 'documents', 'notifications', 'integration', 'system', 'licensing'] },
  { key: 'restauracao', name: 'Restauração', emoji: '🍽️', modules: ['posmgmt', 'commercial', 'hospitality'] },
  { key: 'pms', name: 'PMS (Hotel)', emoji: '🛎️', modules: ['pms'] },
  { key: 'pos', name: 'POS', emoji: '🛒', modules: ['posmgmt'] },
  { key: 'ops', name: 'Centro de Operações', emoji: '📡', modules: ['ops', 'reporting'] },
];
export const suiteIncludes = (suiteKey: string, moduleKey: string): boolean => {
  const s = SUITES.find((x) => x.key === suiteKey);
  if (!s || s.modules.length === 0) return true;
  return s.modules.includes(moduleKey);
};

// Licenciamento por FUNCIONALIDADE: ecrã (id) -> chave de feature. Um ecrã só aparece
// se a feature estiver ativa (licença + override do admin). Espelha core/modules.FEATURES.
export const FEATURE_OF: Record<string, string> = {
  posc_destinations: 'pos.delivery', posc_reservations: 'pos.table_reservations',
  posc_giftcards: 'pos.giftcards', posc_kds: 'pos.kds',
  com_loyalty: 'commercial.loyalty', com_menus: 'commercial.combos',
  fis_commercial: 'fiscal.commercial_docs',
  pms_spa: 'pms.spa', pms_minibar: 'pms.minibar', pms_laundry: 'pms.laundry',
  pms_agencies: 'pms.agencies', pms_nightaudit: 'pms.night_audit',
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
  posmgmt: [
    { label: 'Sala', items: ['posc_outlets', 'posc_rooms', 'posc_map', 'posc_reservations'] },
    { label: 'Venda', items: ['posc_product', 'posc_payments', 'posc_cash'] },
    { label: 'Configuração', items: ['posc_terminals', 'posc_operators', 'posc_shifts', 'posc_printers', 'posc_offline', 'posc_engine'] },
    { label: 'Painel', items: ['posc_dashboard', 'posc_audit'] },
  ],
  pms: [
    { label: 'Reservas', items: ['pms_reservations', 'pms_checkin'] },
    { label: 'Alojamento', items: ['pms_rooms', 'pms_housekeeping'] },
    { label: 'Hóspedes', items: ['pms_guests', 'pms_ledger'] },
    { label: 'Noite', items: ['pms_nightaudit', 'pms_dashboard'] },
  ],
  hospitality: [
    { label: 'Outlets', items: ['hoc_restaurants', 'hoc_bars', 'hoc_coffee', 'hoc_poolbar', 'hoc_roomservice', 'hoc_buffets', 'hoc_events'] },
    { label: 'Produção', items: ['hoc_menus', 'hoc_recipes', 'hoc_ingredients', 'hoc_routing', 'hoc_stations'] },
    { label: 'Displays', items: ['hoc_kds', 'hoc_bar_display', 'hoc_pastry_display', 'hoc_buffet_display'] },
    { label: 'Qualidade', items: ['hoc_haccp', 'hoc_waste', 'hoc_quality', 'hoc_timing'] },
    { label: 'Análise', items: ['hoc_dashboard', 'hoc_reports'] },
  ],
  warehouse: [
    { label: 'Stock', items: ['wh_warehouses', 'wh_locations', 'wh_stock', 'wh_movements'] },
    { label: 'Operações', items: ['wh_transfers', 'wh_inventory', 'wh_lots', 'wh_costing'] },
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
