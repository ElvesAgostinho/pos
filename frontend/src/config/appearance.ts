// Aparência personalizável (por terminal, guardada em localStorage).
// Permite a cada cliente usar a sua identidade sem alterar o código.

export const APPEARANCE_KEYS = {
  logo: 'ui_login_logo',
  wallpaper: 'ui_wallpaper',
  loginBg: 'ui_login_bg',
  companyName: 'ui_company_name',
  erpName: 'ui_erp_name',
  welcome: 'ui_welcome_text',
  barColor: 'ui_bar_color',
} as const;

const DEFAULTS: Record<string, string> = {
  ui_company_name: 'System Mwana Lodge',
  ui_erp_name: 'System Mwana Lodge',
  ui_welcome_text: 'Bem-vindo. Inicie sessão para continuar.',
  ui_bar_color: '#B08D3C',
};

// Cores da barra que já foram o valor por omissão do código antes da paleta
// preto+branco+dourado (primeiro azul-marinho #1e3f66, depois azul-aço
// #336699) — um terminal que nunca mexeu em Aparência mas visitou o ecrã de
// Personalização podia acabar com uma destas gravada no localStorage sem
// ninguém ter escolhido nada, e isso continuava a ganhar ao novo valor por
// omissão para sempre. Uma cor destas encontrada aqui é lixo de versões
// antigas, não uma escolha do cliente — limpa-se sozinha da primeira vez
// que se lê.
const STALE_BAR_COLORS = ['#1e3f66', '#336699'];

export function getAppearance(key: keyof typeof APPEARANCE_KEYS): string {
  const k = APPEARANCE_KEYS[key];
  if (typeof localStorage === 'undefined') return DEFAULTS[k] || '';
  const stored = localStorage.getItem(k);
  if (k === 'ui_bar_color' && stored && STALE_BAR_COLORS.includes(stored.toLowerCase())) {
    localStorage.removeItem(k);
    return DEFAULTS[k] || '';
  }
  return stored || DEFAULTS[k] || '';
}

export function setAppearance(key: keyof typeof APPEARANCE_KEYS, value: string) {
  const k = APPEARANCE_KEYS[key];
  if (value) localStorage.setItem(k, value); else localStorage.removeItem(k);
}
