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
      { label: 'Mapa de Mesas', icon: 'table', screen: 'posc_map', quick: true },
      { label: 'Cozinha (KDS)', icon: 'kitchen', screen: 'hoc_kds', quick: true },
      { label: 'Bar', icon: 'cocktail', screen: 'hoc_bar_display', quick: true },
      { label: 'Delivery', icon: 'delivery', screen: 'posc_destinations', quick: true },
      { label: 'Menus / Cartas', icon: 'book', screen: 'hoc_menus', quick: true },
      { label: 'Stock', icon: 'box', screen: 'wh_stock', quick: true },
      { label: 'Mesas', icon: 'table', screen: 'posc_rooms' },
      { label: 'Outlets / Salões', icon: 'folder', screen: 'posc_outlets' },
      { label: 'Room Service', icon: 'bell', screen: 'hoc_roomservice' },
      { label: 'Receitas', icon: 'note', screen: 'hoc_recipes' },
      { label: 'Dashboard F&B', icon: 'chart', screen: 'hoc_dashboard' },
      { label: 'Relatórios', icon: 'report', screen: 'rep_fnb' },
      { label: 'Configuração', icon: 'gear', screen: 'posc_engine' },
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
      { label: 'Caixas', icon: 'cashbox', screen: 'posc_cash', quick: true },
      { label: 'Clientes', icon: 'user', screen: 'md_customers', quick: true },
      { label: 'Produtos', icon: 'product', screen: 'posc_product', quick: true },
      { label: 'Supervisão', icon: 'chart', screen: 'posc_dashboard', quick: true },
      { label: 'Pagamentos', icon: 'card', screen: 'posc_payments' },
      { label: 'Operadores', icon: 'people', screen: 'posc_operators' },
      { label: 'Terminais', icon: 'terminal', screen: 'posc_terminals' },
      { label: 'Relatórios', icon: 'report', screen: 'rep_pos' },
      { label: 'Configuração', icon: 'gear', screen: 'posc_engine' },
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
