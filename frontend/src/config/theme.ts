/**
 * PALETA OFICIAL — fonte única de cor para todo o sistema (exceto o POS Front
 * Office, que tem identidade própria, tátil, e não deve mudar por causa disto).
 *
 * Antes disto, cada ecrã escrevia o seu próprio hex (#2563EB aqui, #2563EB ali,
 * #6B7280 acolá) — quase sempre a MESMA cor, escrita de memória, ligeiramente
 * diferente de ficheiro para ficheiro. Um sistema "a sério" (Primavera, SAP GUI,
 * Office clássico) repete SEMPRE as mesmas cores, sem variação — é isso que dá
 * o ar de desenhado, não de remendado. Este ficheiro fixa essas cores, uma vez,
 * para se importarem em vez de se escreverem à mão outra vez.
 *
 * Duas variantes: LIGHT (o normal, "clássico pesado" — barras com relevo/
 * gradiente) e DARK (tema escuro, opcional, por utilizador). O `barColor`
 * continua a poder ser personalizado por instalação (Administração → Aparência)
 * — TOKENS.accent lê essa personalização; o resto da paleta não muda com ela.
 */
import { getAppearance } from './appearance';

export const TOKENS = {
  // ── A COR DE MARCA ────────────────────────────────────────────────────────
  // Azul, a cor das acções. Num SaaS moderno a cor não pinta superfícies — pinta
  // o que se pode FAZER: o botão que avança, a linha escolhida, o separador
  // activo. Tudo o resto é branco e cinzento muito claro. É essa economia que dá
  // o ar leve; encher ecrãs de cor é o que faz um sistema parecer pesado.
  get accent() { return getAppearance('barColor') || '#2563EB'; },
  gold: '#2563EB',           // nome antigo, dezenas de ecrãs ainda o leem
  goldDark: '#1D4ED8',

  brand: '#2563EB',          // acção principal
  brandDeep: '#1D4ED8',      // a mesma, carregada (hover/activo)
  brandSoft: '#EFF6FF',      // fundo de realce muito leve
  brandTint: '#DBEAFE',      // selecção

  // ── A MOLDURA ─────────────────────────────────────────────────────────────
  // Ardósia azulada, não preto: é escura o suficiente para ancorar o ecrã e
  // suave o suficiente para não competir com o conteúdo.
  bar: '#2563EB',            // barra principal / navegação — a cor da marca
  barDeep: '#1D4ED8',        // a mesma, carregada (rodapé, estados premidos)
  barSoft: '#2563EB',        // item seleccionado na navegação
  active: '#3B82F6',         // elementos activos, gráficos

  // ── SUPERFÍCIES ───────────────────────────────────────────────────────────
  canvas: '#EEF1F5',         // fundo da página — cinzento a sério, para os cartões brancos se verem
  surface: '#FFFFFF',        // cartões, painéis, grelhas
  toolbarBg: '#FFFFFF',
  hover: '#EEF1F5',

  // ── LINHAS ────────────────────────────────────────────────────────────────
  // Usadas com parcimónia: o que separa áreas é o ESPAÇO e uma sombra leve, não
  // uma caixa à volta de tudo. As linhas ficam para dentro das tabelas.
  border: '#E6E8EC',
  line: '#E6E8EC',
  lineSoft: '#F1F2F4',

  // ── TEXTO ─────────────────────────────────────────────────────────────────
  textOnDark: '#FFFFFF',
  textOnLight: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',

  // ── SELECÇÃO ──────────────────────────────────────────────────────────────
  selectedBg: '#DBEAFE',
  selectedText: '#111827',

  // ── ESTADOS ───────────────────────────────────────────────────────────────
  success: '#16A34A',
  successBg: '#F0FDF4',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  danger: '#DC2626',
  dangerSoft: '#B91C1C',
  dangerBg: '#FEF2F2',
} as const;

// Aclara/escurece um hex por `pct` (±255) — usado para montar o gradiente de uma
// barra a partir de UMA cor só (ex.: TOKENS.accent, que muda por instalação).
export function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + pct));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + pct));
  const b = Math.max(0, Math.min(255, (n & 255) + pct));
  return `rgb(${r},${g},${b})`;
}

// Gradiente de barra de título a partir da cor institucional (3 tons, sempre a
// mesma receita) — para não se escrever "linear-gradient(...#2563EB...)" fixo
// em cada ecrã: assim a personalização (Aparência → Cor da barra) chega a todo
// o lado que usar isto, não só ao ecrã onde alguém se lembrou de a aplicar.
export function accentGradient(accent: string = TOKENS.accent): string {
  // JÁ NÃO É UM GRADIENTE. O nome fica porque cinco ecrãs o chamam, mas o que
  // devolve é a cor lisa: um gradiente vertical numa barra é um dos sinais mais
  // datados que uma interface pode ter — foi a maneira de desenhar relevo
  // quando não havia sombras, e hoje lê como um botão de 2008. A profundidade
  // passa a vir da sombra (SHADOW), que é o que a dá sem fingir volume.
  return accent;
}

// Escala de FORMA (raio de canto + sombra) — ao lado da escala de COR acima.
// Antes cada ecrã escrevia o seu próprio "rounded-[8px]" ou "border: 4px groove"
// (relevo entalhado estilo Windows 98) à mão; isto dava um sistema com cantos
// quase quadrados e relevos 3D, muito mais antigo do que o Ambiente de Trabalho
// (EnterpriseDesktop.tsx), que já usa cantos suaves e sombras leves. Esta escala
// fixa esses valores UMA vez para o resto do backoffice clássico (DesktopShell,
// Sidebar, kit.tsx, ClassicWindow, ClassicGrid) se aproximar do mesmo visual sem
// imitar janelas do sistema operativo nem cair no extremo oposto (cartão SaaS
// pastel/whitespace exagerado). A cor não muda — só a forma.
export const RADIUS = {
  // Cantos generosos. É o sinal mais imediato de "software desta década" — e o
  // que mais distingue isto do registo anterior, onde quase tudo era rectângulo
  // de canto vivo. A escala é curta de propósito: três valores e a pílula.
  sm: '8px',     // inputs, botões, células, etiquetas
  md: '12px',    // cartões, painéis, caixas de diálogo pequenas
  lg: '16px',    // janelas, diálogos grandes
  pill: '999px', // botões de acção, estados, filtros
} as const;

export const SHADOW = {
  // A SOMBRA SUBSTITUI A BORDA. Era o contrário: tudo tinha um contorno, e o
  // ecrã lia-se como uma grelha de caixas encaixadas. Aqui um cartão separa-se
  // do fundo por estar ligeiramente acima dele — mais perto de papel pousado do
  // que de uma moldura desenhada. Todas muito abertas e pouco opacas: uma
  // sombra que se nota já é sombra a mais.
  xs: '0 1px 2px rgba(16,24,40,0.04)',
  soft: '0 1px 2px rgba(16,24,40,0.04), 0 2px 6px rgba(16,24,40,0.05)',
  panel: '0 2px 6px rgba(16,24,40,0.06), 0 12px 32px rgba(16,24,40,0.10)',
  pop: '0 8px 16px rgba(16,24,40,0.08), 0 24px 48px rgba(16,24,40,0.14)',
  ring: '0 0 0 3px rgba(37,99,235,0.15)',   // foco — anel azul, não borda dura
} as const;

// ESPAÇO e TIPOGRAFIA — a outra metade do "suave". Cantos redondos num ecrã
// apertado continuam a ler como ERP antigo com cantos redondos; o que dá a
// respiração é o espaço entre as coisas e o texto um ponto maior.
export const SPACE = {
  tight: '8px',    // dentro de um controlo
  card: '16px',    // dentro de um cartão
  gap: '12px',     // entre controlos irmãos
  section: '24px', // entre blocos de conteúdo
} as const;

export const TYPE = {
  label: '12px',   // etiquetas de campo
  body: '13.5px',  // texto corrente e grelhas (era 11-12px)
  title: '15px',   // títulos de cartão
  head: '19px',    // título de ecrã
} as const;

// Tema "clássico pesado" (light) — barras com relevo/gradiente, linhas fortes.
// Reutilizado pelo DesktopShell (moldura do backoffice) e por qualquer ecrã que
// precise da MESMA moldura (Configuração POS, Diagnóstico, etc.).
export function classicTheme(dark: boolean) {
  return dark
    ? {
        bar: TOKENS.bar, barText: TOKENS.textOnDark, ribbon: '#2563EB', tree: '#2563EB',
        treeText: '#F1F2F4', line: '#2563EB', body: '#2563EB', status: '#16203A',
        hover: '#2563EB', accent: TOKENS.gold,
      }
    : {
        bar: 'linear-gradient(to bottom, #EEF1F5 0%, #F1F2F4 55%, #F1F2F4 100%)',
        barText: TOKENS.textOnLight,
        ribbon: 'linear-gradient(to bottom, #EEF1F5 0%, #F1F2F4 60%, #F1F2F4 100%)',
        tree: TOKENS.surface, treeText: TOKENS.textOnLight, line: TOKENS.border,
        body: '#F1F2F4', status: TOKENS.accent, hover: TOKENS.selectedBg,
        accent: TOKENS.accent,
      };
}
