/**
 * Workspace Empresarial — os 3 ÚNICOS módulos comerciais (PMS, Restauração, POS).
 * Tudo o resto pertence internamente a um destes. Cada módulo tem cor, wallpaper e
 * ícones de desktop (estilo clássico) que abrem os ecrãs reais (VIEW_REGISTRY, por id).
 * O POS TEM a sua própria área (gestão); só o TERMINAL (frontoffice) abre em janela separada.
 */
export interface DeskIcon { label: string; icon: string; screen?: string; launch?: string; img?: string; quick?: boolean; }
export interface Workspace {
  key: string; name: string;
  color: string; colorDark: string; accent: string; glow: string;   // identidade de cor
  wallpaper: string;
  licenseModule: string;
  icons: DeskIcon[];
}

const wp = (c1: string, c2: string) =>
  `radial-gradient(130% 110% at 12% 0%, ${c1} 0%, ${c2} 72%), linear-gradient(155deg, ${c1}, ${c2})`;

export const WORKSPACES: Workspace[] = [
  {
    key: 'pms', name: 'PMS',
    color: '#1e3f66', colorDark: '#122942', accent: '#3f7fc0', glow: '#5fa8e6',
    wallpaper: wp('#22496f', '#0d1f34'),
    licenseModule: 'pms',
    icons: [
      { label: 'Reservas', icon: 'reservations', screen: 'pms_reservations', quick: true },
      { label: 'Mapa de Quartos', icon: 'bed', screen: 'pms_rooms', quick: true },
      { label: 'Check-In / Out', icon: 'key', screen: 'pms_checkin', quick: true },
      { label: 'Hóspedes', icon: 'people', screen: 'pms_guests', quick: true },
      { label: 'Housekeeping', icon: 'broom', screen: 'pms_housekeeping', quick: true },
      { label: 'Ocupação', icon: 'chart', screen: 'pms_dashboard', quick: true },
      { label: 'Quartos', icon: 'rooms', screen: 'pms_rooms' },
      { label: 'Auditoria Nocturna', icon: 'moon', screen: 'pms_nightaudit' },
      { label: 'Folios / Conta', icon: 'receipt', screen: 'pms_ledger' },
      { label: 'Tarifas', icon: 'money', screen: 'pms_rates' },
      { label: 'Booking Engine', icon: 'globe', screen: 'int_booking', quick: true },
      { label: 'Relatórios', icon: 'report', screen: 'rep_hotel' },
      { label: 'Documentos', icon: 'folder', screen: 'doc_center' },
      { label: 'Configuração', icon: 'gear', screen: 'hmc_dashboard' },
    ],
  },
  {
    key: 'restauracao', name: 'Restauração',
    color: '#a5551a', colorDark: '#5d3010', accent: '#dd8a2e', glow: '#f2a94e',
    wallpaper: wp('#a05518', '#33200e'),
    licenseModule: 'hospitality',
    icons: [
      { label: 'Cozinha (KDS)', icon: 'kitchen', screen: 'hoc_kds', quick: true },
      { label: 'Bar', icon: 'cocktail', screen: 'hoc_bar_display', quick: true },
      { label: 'Menus / Cartas', icon: 'book', screen: 'hoc_menus', quick: true },
      { label: 'Stock', icon: 'box', screen: 'wh_stock', quick: true },
      { label: 'Room Service', icon: 'bell', screen: 'hoc_roomservice' },
      { label: 'Receitas', icon: 'note', screen: 'hoc_recipes' },
      { label: 'Dashboard F&B', icon: 'chart', screen: 'hoc_dashboard' },
      { label: 'Relatórios', icon: 'report', screen: 'rep_fnb' },
    ],
  },
  {
    key: 'pos', name: 'POS',
    color: '#1f7a34', colorDark: '#0f4a1f', accent: '#3fb058', glow: '#6ee08a',
    wallpaper: wp('#1f7a34', '#0a2a14'),
    licenseModule: 'posfront',
    icons: [
      { label: 'Abrir Terminal POS', icon: 'terminal', launch: '/pos', quick: true },   // frontoffice em janela separada
      { label: 'Vendas', icon: 'cart', screen: 'pfo_sales', quick: true },
      { label: 'Clientes', icon: 'user', screen: 'md_customers', quick: true },
      { label: 'Relatórios', icon: 'report', screen: 'rep_pos' },
    ],
  },
];

export const workspaceByKey = (k: string) => WORKSPACES.find((w) => w.key === k);

/**
 * Que CENTROS do backoffice clássico pertencem a cada módulo comercial.
 * Os centros NÃO listados aqui são PARTILHADOS (infraestrutura: admin, segurança,
 * master data, financeiro, fiscal, contabilidade, documentos, relatórios, sistema…)
 * e aparecem em todos os módulos. Os listados só aparecem no(s) seu(s) módulo(s) —
 * os dos OUTROS módulos ficam ocultos, como se não existissem.
 */
export const CENTER_MODULES: Record<string, string[]> = {
  // PMS (hotelaria)
  pms: ['pms'], hotel: ['pms'],
  // Restauração (F&B)
  hospitality: ['restauracao'], srm: ['restauracao'], procurement: ['restauracao'], warehouse: ['restauracao'],
  // POS (venda)
  posfront: ['pos'],
  // Partilhados entre Restauração e POS
  posmgmt: ['restauracao', 'pos'], commercial: ['restauracao', 'pos'],
};

export const centerInModule = (centerKey: string, moduleKey?: string) => {
  if (!moduleKey) return true;
  const g = CENTER_MODULES[centerKey];
  return !g || g.includes(moduleKey);   // sem grupo = partilhado (todos os módulos)
};

/**
 * ÁRVORE POR TAREFA — as pastas que o utilizador vê dentro de cada módulo.
 * Substitui os "Centros" técnicos por pastas que qualquer pessoa percebe.
 *
 * COMPLETA: nada é eliminado — cada ecrã do sistema vive no(s) módulo(s) a que pertence.
 * A infraestrutura transversal (fiscal, contabilidade, tesouraria, segurança, sistema)
 * repete-se em cada módulo, porque é precisa em todos.
 */
export interface TreeFolder { key: string; title: string; items: string[]; }

// --- Blocos transversais (aparecem em todos os módulos) ---
const F_CONTAB = ['acc_dashboard', 'acc_chart', 'acc_entries', 'acc_journals', 'acc_ledger', 'acc_trial_balance', 'acc_statements', 'acc_integration'];
const F_FISCAL = ['fis_dashboard', 'fis_einvoice', 'fis_commercial', 'fis_series', 'fis_tax', 'fis_saft', 'fis_transmit', 'fis_archive', 'fis_agt', 'fis_certification', 'fis_audit'];
const F_TESOURARIA = ['fin_dashboard', 'fin_cash', 'fin_receipts', 'fin_payments', 'fin_invoicing', 'fin_receivables', 'fin_ledger', 'fin_reconciliation'];
const F_DOCS = ['doc_center', 'doc_inbox', 'doc_templates', 'doc_pdf', 'doc_signatures'];
const F_SEGURANCA = ['sec_dashboard', 'sec_users', 'adm_users', 'sec_rbac', 'sec_permissions', 'sec_access', 'sec_abac', 'sec_pin', 'sec_mfa', 'sec_sessions', 'sec_devices', 'sec_audit', 'sec_login_history'];
const F_SISTEMA = [
  'org_profile',      // aparece em todos os módulos (a dedup evita repetir)
  'adm_dashboard', 'adm_companies', 'adm_groups', 'adm_hotels', 'adm_clients', 'adm_appearance',
  'adm_module_status', 'adm_features', 'adm_versions', 'adm_monitor', 'adm_logs', 'adm_audit', 'adm_documents',
  'sys_backups', 'sys_scheduler', 'sys_logs', 'sys_cache', 'sys_updates', 'sys_diagnostics',
  'ntf_emails', 'ntf_sms', 'ntf_push', 'ntf_alerts',
  'wfc_dashboard', 'wfc_flows', 'wfc_tasks',
  'int_locks', 'int_bank_pos', 'int_scales', 'int_printers', 'int_apis',
];
const F_ESTRUTURA = [
  'org_profile',      // Ficha do Hotel — o primeiro sítio onde alguém deve ir
  'hmc_dashboard', 'hmc_hotels', 'hmc_buildings', 'hmc_floors', 'hmc_areas', 'hmc_outlets',
  'hmc_departments', 'hmc_profit_centers', 'hmc_cost_centers', 'hmc_resources',
  'md_companies', 'md_hotels', 'md_departments', 'md_areas', 'md_warehouses',
];

export const MODULE_TREE: Record<string, TreeFolder[]> = {
  pms: [
    { key: 'pms_recepcao', title: 'Receção', items: ['pms_dashboard', 'pms_reservations', 'pms_checkin', 'pms_guests', 'pms_ledger', 'pms_agencies'] },
    { key: 'pms_quartos', title: 'Quartos & Limpeza', items: ['pms_rooms', 'pms_housekeeping', 'pms_maintenance', 'pms_laundry', 'pms_minibar', 'pms_spa'] },
    { key: 'pms_online', title: 'Tarifas & Reservas Online', items: ['pms_rates', 'int_booking', 'int_channel'] },
    { key: 'pms_fecho', title: 'Fecho do Dia', items: ['pms_nightaudit', 'ops_dashboard'] },
    { key: 'pms_tesouraria', title: 'Tesouraria & Faturação', items: F_TESOURARIA },
    { key: 'pms_fiscal', title: 'Fiscal (AGT)', items: F_FISCAL },
    { key: 'pms_contab', title: 'Contabilidade', items: F_CONTAB },
    { key: 'pms_relatorios', title: 'Relatórios & Documentos', items: ['rep_hotel', 'rep_pms', 'rep_finance', 'rep_fiscal', 'rep_admin', ...F_DOCS] },
    { key: 'pms_dados', title: 'Dados Base', items: ['md_customers', 'md_employees', 'md_currencies', 'md_countries', 'md_languages', 'md_banks', 'md_taxes', 'md_payment_methods', 'md_doctypes'] },
    { key: 'pms_estrutura', title: 'Estrutura do Hotel', items: F_ESTRUTURA },
    { key: 'pms_seguranca', title: 'Utilizadores & Segurança', items: F_SEGURANCA },
    { key: 'pms_sistema', title: 'Sistema & Administração', items: F_SISTEMA },
  ],

  restauracao: [
    { key: 'res_sala', title: 'Sala & Mesas', items: ['ops_tables'] },
    { key: 'res_cozinha', title: 'Cozinha & Produção', items: ['hoc_dashboard', 'hoc_kds', 'hoc_bar_display', 'hoc_pastry_display', 'hoc_buffet_display', 'hoc_routing', 'hoc_stations', 'hoc_timing', 'ops_kitchen'] },
    { key: 'res_pontos', title: 'Restaurantes & Bares', items: ['hoc_restaurants', 'hoc_bars', 'hoc_coffee', 'hoc_poolbar', 'hoc_roomservice', 'hoc_buffets', 'hoc_events'] },
    { key: 'res_menus', title: 'Menus & Receitas', items: ['hoc_menus', 'hoc_recipes', 'hoc_ingredients'] },
    { key: 'res_qualidade', title: 'Qualidade & HACCP', items: ['hoc_haccp', 'hoc_waste', 'hoc_quality'] },
    { key: 'res_stock', title: 'Stock & Armazém', items: ['wh_dashboard', 'wh_warehouses', 'wh_locations', 'wh_stock', 'wh_movements', 'wh_transfers', 'wh_inventory', 'wh_lots', 'wh_costing'] },
    { key: 'res_compras', title: 'Compras & Fornecedores', items: ['proc_dashboard', 'proc_requests', 'proc_workflow', 'proc_approvals', 'proc_rfq', 'proc_comparison', 'proc_po', 'proc_grn', 'proc_returns', 'proc_planning', 'srm_dashboard', 'srm_suppliers', 'srm_contracts', 'srm_sla', 'srm_evaluation', 'srm_performance', 'srm_certificates', 'srm_documents'] },
    { key: 'res_comercial', title: 'Comercial & Promoções', items: ['com_dashboard', 'com_pricing', 'com_campaigns', 'com_promotions', 'com_happyhour', 'com_combos', 'com_menus', 'com_discounts', 'com_giftcards', 'com_vouchers', 'com_loyalty'] },
    { key: 'res_tesouraria', title: 'Tesouraria & Faturação', items: F_TESOURARIA },
    { key: 'res_fiscal', title: 'Fiscal (AGT)', items: F_FISCAL },
    { key: 'res_contab', title: 'Contabilidade', items: F_CONTAB },
    { key: 'res_relatorios', title: 'Relatórios & Documentos', items: ['rep_fnb', 'rep_kitchen', 'rep_warehouse', 'rep_procurement', 'hoc_reports', ...F_DOCS] },
    { key: 'res_dados', title: 'Dados Base', items: ['md_uoms', 'md_conversions', 'md_taxes', 'md_suppliers', 'md_payment_methods'] },
    { key: 'res_config', title: 'Configuração do Serviço', items: ['posc_config'] },
    { key: 'res_estrutura', title: 'Estrutura', items: F_ESTRUTURA },
    { key: 'res_seguranca', title: 'Utilizadores & Segurança', items: F_SEGURANCA },
    { key: 'res_sistema', title: 'Sistema & Administração', items: F_SISTEMA },
  ],

  pos: [
    // O MÓDULO POS É A CONFIGURAÇÃO POS. Os ecrãs soltos antigos (Outlets, Terminais,
    // Operadores, Turnos, Impressoras, Product Config…) foram ELIMINADOS: tudo isso
    // vive agora dentro da Configuração POS, num só sítio e com CRUD real.
    { key: 'pos_config', title: 'Configuração POS', items: ['posc_config'] },
    { key: 'pos_terminal', title: 'Terminal', items: ['pfo_terminal', 'pfo_sales'] },
    { key: 'pos_promo', title: 'Promoções & Fidelização', items: ['com_dashboard', 'com_promotions', 'com_happyhour', 'com_combos', 'com_menus', 'com_discounts', 'com_giftcards', 'com_vouchers', 'com_loyalty', 'com_campaigns'] },
    { key: 'pos_fiscal', title: 'Faturação & Fiscal', items: F_FISCAL },
    { key: 'pos_clientes', title: 'Clientes', items: ['md_customers'] },
    { key: 'pos_contab', title: 'Contabilidade', items: F_CONTAB },
    { key: 'pos_relatorios', title: 'Relatórios & Documentos', items: ['rep_pos', 'rep_finance', ...F_DOCS] },
    { key: 'pos_seguranca', title: 'Utilizadores & Segurança', items: F_SEGURANCA },
    { key: 'pos_sistema', title: 'Sistema & Administração', items: F_SISTEMA },
  ],
};
