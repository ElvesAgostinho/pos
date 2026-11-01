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
  ui_erp_name: 'ML',
  ui_welcome_text: 'Bem-vindo. Inicie sessão para continuar.',
  // Azul petróleo bem escuro — cor institucional única do sistema (era
  // dourado #D97706; passou por um azul-petróleo mais claro #2563EB antes
  // deste tom, pedido do dono por ser "mais carregado, quase preto").
  // AZUL-MARINHO — ver TOKENS em config/theme.ts para o porquê. É a mesma cor
  // do papel da factura: o hóspede vê-a no documento e o recepcionista no ecrã.
  ui_bar_color: '#1F3A5F',
};

// Cores da barra que já foram o valor por omissão do código em versões
// anteriores (azul-marinho #2563EB, azul-aço #3B82F6, o dourado #D97706 da
// paleta preto+branco+dourado, e o primeiro azul-petróleo #2563EB, mais
// claro do que o pedido) — um terminal que nunca mexeu em Aparência mas
// visitou o ecrã de Personalização podia acabar com uma destas gravada no
// localStorage sem ninguém ter escolhido nada, e isso continuava a ganhar
// ao novo valor por omissão para sempre. Uma cor destas encontrada aqui é
// lixo de versões antigas, não uma escolha do cliente — limpa-se sozinha da
// primeira vez que se lê. ESTES SÃO VALORES HISTÓRICOS DE DADOS (o que uma
// versão antiga gravava) — NUNCA se rebrandam para a paleta atual, senão o
// próprio mecanismo de limpeza deixa de reconhecer o lixo antigo.
//
// EM MINÚSCULAS, porque é assim que são comparados. Estavam escritos em
// maiúsculas e a comparação fazia `stored.toLowerCase()` contra eles: nunca
// casava com nada, e a limpeza NUNCA funcionou desde que foi escrita. Quem
// tinha a cor antiga gravada continuou a vê-la, versão após versão, e ninguém
// percebia porque é que mudar o valor por omissão não mudava nada.
const STALE_BAR_COLORS = ['#2563eb', '#3b82f6', '#d97706'];

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
  // A COR TEM DE CHEGAR AO CSS NO MESMO INSTANTE. Sem isto, mudar a cor da
  // barra na Aparência não dava diferença nenhuma até alguém recarregar a
  // página — e quem experimenta uma cor e não vê nada acontecer conclui que
  // a definição não funciona.
  if (k === 'ui_bar_color') {
    import('./theme').then((t) => t.aplicarCorDaMarca()).catch(() => {});
  }
}
