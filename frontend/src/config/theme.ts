/**
 * PALETA OFICIAL — fonte única de cor para todo o sistema (exceto o POS Front
 * Office, que tem identidade própria, tátil, e não deve mudar por causa disto).
 *
 * Antes disto, cada ecrã escrevia o seu próprio hex (#1e3f66 aqui, #1a4f8a ali,
 * #8a95a3 acolá) — quase sempre a MESMA cor, escrita de memória, ligeiramente
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
  // Institucional — a cor de marca desta instalação (Aparência → Cor da barra).
  // O vermelho de erro é a única cor fora da família petróleo/cinza, e só onde
  // a cor É o aviso — sempre com ícone e texto, nunca sozinha.
  get accent() { return getAppearance('barColor') || '#062F35'; },
  // Mantido com o nome "gold" por compatibilidade (dezenas de ecrãs já leem
  // TOKENS.gold) — mas já não é dourado: é o azul-petróleo institucional.
  gold: '#062F35',
  goldDark: '#0A4148',

  // ── Navegação ─────────────────────────────────────────────────────────────
  // O petróleo escuro é RESERVADO: cabeçalhos, navegação e acções importantes.
  // Espalhá-lo por tudo tira-lhe o peso e deixa o ecrã pesado — a regra é usá-lo
  // onde se quer que o olho pare.
  bar: '#062F35',            // barra principal / cabeçalho
  barSoft: '#0A4148',        // barra secundária, item de menu seleccionado
  active: '#4B858E',         // elementos activos, gráficos, realces secundários

  // ── Superfícies ───────────────────────────────────────────────────────────
  canvas: '#F4F6F7',         // fundo da área de trabalho (alivia o peso visual)
  surface: '#FFFFFF',        // formulários e grelhas
  toolbarBg: '#F4F6F7',      // barra de ferramentas

  // ── Linhas ────────────────────────────────────────────────────────────────
  // Finas e rectangulares. `line` é o contorno a sério (campos, caixas);
  // `lineSoft` é a divisória de dentro de uma grelha, que não deve competir.
  border: '#C8D2D5',
  line: '#C8D2D5',
  lineSoft: '#E4E9EB',

  // ── Texto ─────────────────────────────────────────────────────────────────
  textOnDark: '#FFFFFF',
  textOnLight: '#1F292C',    // texto principal e valores numéricos
  textMuted: '#657377',      // etiquetas, eixos de gráficos, texto secundário

  // ── Selecção ──────────────────────────────────────────────────────────────
  selectedBg: '#DCE6E8',     // linha escolhida numa grelha
  selectedText: '#1F292C',
  hover: '#EDF1F2',

  // ── Estados ───────────────────────────────────────────────────────────────
  // Estes três são os únicos sítios onde a cor carrega significado próprio.
  success: '#2E8B57',        // gravar, confirmar, finalizar pagamento
  danger: '#C94A4A',         // apagar, cancelar, erro
  dangerSoft: '#A83A3A',     // texto de erro sobre fundo claro
  warning: '#D99A24',        // atenção
  warningBg: '#FBF3E3',
  warningBorder: '#E6C98A',
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
// mesma receita) — para não se escrever "linear-gradient(...#062F35...)" fixo
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
        bar: TOKENS.bar, barText: TOKENS.textOnDark, ribbon: '#0B3E48', tree: '#062F35',
        treeText: '#E4E9EB', line: '#1A5762', body: '#062F35', status: '#052128',
        hover: '#12505C', accent: TOKENS.gold,
      }
    : {
        bar: 'linear-gradient(to bottom, #F4F6F7 0%, #E4E9EB 55%, #E4E9EB 100%)',
        barText: TOKENS.textOnLight,
        ribbon: 'linear-gradient(to bottom, #F4F6F7 0%, #E4E9EB 60%, #E4E9EB 100%)',
        tree: TOKENS.surface, treeText: TOKENS.textOnLight, line: TOKENS.border,
        body: '#E4E9EB', status: TOKENS.accent, hover: TOKENS.selectedBg,
        accent: TOKENS.accent,
      };
}
