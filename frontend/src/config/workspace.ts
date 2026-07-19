/**
 * Workspace Empresarial — o POS, que é autossuficiente e se vende sozinho.
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
    key: 'pos', name: 'POS',
    color: '#1f7a34', colorDark: '#0f4a1f', accent: '#3fb058', glow: '#6ee08a',
    wallpaper: wp('#1f7a34', '#0a2a14'),
    licenseModule: 'posfront',
    icons: [
      // O POS é UM ecrã. Clicar aqui entra logo nele (ocupa a janela toda, com o
      // seu próprio menu lateral) — sem shell, sem árvore, sem ribbon por cima.
      { label: 'POS', icon: 'gear', screen: 'posc_config', quick: true },
      { label: 'Abrir Terminal POS', icon: 'terminal', launch: '/pos', quick: true },   // frontoffice, janela separada
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
  // O POS é autossuficiente — não há módulos de PMS nem de Restauração.
  srm: ['pos'], procurement: ['pos'], warehouse: ['pos'],
  // POS (venda)
  posfront: ['pos'],
  // Partilhados
  posmgmt: ['pos'], commercial: ['pos'],
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


  pos: [
    // O MÓDULO POS É A CONFIGURAÇÃO POS — e mais nada.
    // Não há árvore, não há pastas, não há ecrãs soltos: entrar no POS é entrar
    // já no ecrã (que ocupa a janela toda e tem o seu próprio menu lateral).
    { key: 'pos_config', title: 'POS', items: ['posc_config'] },
  ],
};
