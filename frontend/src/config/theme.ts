/**
 * PALETA OFICIAL — fonte única de cor para todo o sistema (exceto o POS Front
 * Office, que tem identidade própria, tátil, e não deve mudar por causa disto).
 *
 * Antes disto, cada ecrã escrevia o seu próprio hex (#17375E aqui, #1F4E79 ali,
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
  // Azul-marinho, reservado para a navegação e para as acções que importam.
  // A regra que faz um ERP parecer um ERP não é o tom do azul: é haver POUCA
  // cor. Quase toda a interface é cinzento neutro e branco; a cor só aparece
  // onde se quer que o olho pare. Quando tudo tem a mesma tinta — fundo azul
  // claro, bordas azul claro, texto azul acinzentado — o resultado lê como um
  // tema aplicado por cima, não como desenho.
  get accent() { return getAppearance('barColor') || '#17375E'; },
  gold: '#17375E',           // nome antigo, dezenas de ecrãs ainda o leem
  goldDark: '#0F2744',

  bar: '#17375E',            // cabeçalho / barra de menus
  barDeep: '#0F2744',        // rodapé e fundo do gradiente da barra
  barSoft: '#1F4E79',        // barra secundária, item de menu seleccionado
  active: '#2E75B6',         // elementos activos, gráficos, realces

  // ── SUPERFÍCIES — cinzento VERDADEIRO, sem tom ────────────────────────────
  canvas: '#F3F4F6',         // fundo da área de trabalho
  surface: '#FFFFFF',        // formulários e grelhas
  toolbarBg: '#F3F4F6',
  hover: '#F7F8F9',

  // ── LINHAS — finas, rectangulares, neutras ────────────────────────────────
  border: '#D7DBDF',         // contorno de campos e caixas
  line: '#D7DBDF',
  lineSoft: '#EBEEF0',       // divisória dentro de uma grelha, que não compete

  // ── TEXTO ─────────────────────────────────────────────────────────────────
  textOnDark: '#FFFFFF',
  textOnLight: '#1A1D21',    // texto principal e valores
  textMuted: '#6B7280',      // etiquetas, eixos, texto secundário

  // ── SELECÇÃO ──────────────────────────────────────────────────────────────
  selectedBg: '#DCE9F5',     // linha escolhida numa grelha
  selectedText: '#1A1D21',

  // ── ESTADOS — os únicos sítios onde a cor tem significado próprio ─────────
  success: '#1E7F4F',
  successBg: '#E8F4EE',
  warning: '#B45309',
  warningBg: '#FDF3E3',
  warningBorder: '#E6C98A',
  danger: '#B42318',
  dangerSoft: '#912018',
  dangerBg: '#FDECEA',
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
// mesma receita) — para não se escrever "linear-gradient(...#17375E...)" fixo
// em cada ecrã: assim a personalização (Aparência → Cor da barra) chega a todo
// o lado que usar isto, não só ao ecrã onde alguém se lembrou de a aplicar.
export function accentGradient(accent: string = TOKENS.accent): string {
  return `linear-gradient(to bottom, ${shade(accent, 24)} 0%, ${accent} 55%, ${shade(accent, -30)} 100%)`;
}

// Escala de FORMA (raio de canto + sombra) — ao lado da escala de COR acima.
// Antes cada ecrã escrevia o seu próprio "rounded-[2px]" ou "border: 4px groove"
// (relevo entalhado estilo Windows 98) à mão; isto dava um sistema com cantos
// quase quadrados e relevos 3D, muito mais antigo do que o Ambiente de Trabalho
// (EnterpriseDesktop.tsx), que já usa cantos suaves e sombras leves. Esta escala
// fixa esses valores UMA vez para o resto do backoffice clássico (DesktopShell,
// Sidebar, kit.tsx, ClassicWindow, ClassicGrid) se aproximar do mesmo visual sem
// imitar janelas do sistema operativo nem cair no extremo oposto (cartão SaaS
// pastel/whitespace exagerado). A cor não muda — só a forma.
export const RADIUS = {
  sm: '6px',   // inputs, botões pequenos, células
  md: '10px',  // caixas/painéis, linhas selecionadas
  lg: '16px',  // janelas, cartões grandes
} as const;

export const SHADOW = {
  // Elevação subtil (painéis, grelhas, caixas) — substitui o `groove`/`inset` rígido.
  soft: '0 1px 2px rgba(6,42,49,0.06), 0 2px 8px rgba(6,42,49,0.06)',
  // Elevação de janela/diálogo (mais presença, ainda sem ser um cartão SaaS pesado).
  panel: '0 2px 4px rgba(6,42,49,0.08), 0 8px 24px rgba(6,42,49,0.10)',
  // Anel de foco/hover discreto (substitui bordas rígidas a aparecer/desaparecer).
  ring: '0 0 0 1px rgba(92,136,145,0.35)',
} as const;

// Tema "clássico pesado" (light) — barras com relevo/gradiente, linhas fortes.
// Reutilizado pelo DesktopShell (moldura do backoffice) e por qualquer ecrã que
// precise da MESMA moldura (Configuração POS, Diagnóstico, etc.).
export function classicTheme(dark: boolean) {
  return dark
    ? {
        bar: TOKENS.bar, barText: TOKENS.textOnDark, ribbon: '#1F4E79', tree: '#17375E',
        treeText: '#EBEEF0', line: '#1F4E79', body: '#17375E', status: '#0F2744',
        hover: '#1F4E79', accent: TOKENS.gold,
      }
    : {
        bar: 'linear-gradient(to bottom, #F3F4F6 0%, #EBEEF0 55%, #EBEEF0 100%)',
        barText: TOKENS.textOnLight,
        ribbon: 'linear-gradient(to bottom, #F3F4F6 0%, #EBEEF0 60%, #EBEEF0 100%)',
        tree: TOKENS.surface, treeText: TOKENS.textOnLight, line: TOKENS.border,
        body: '#EBEEF0', status: TOKENS.accent, hover: TOKENS.selectedBg,
        accent: TOKENS.accent,
      };
}
