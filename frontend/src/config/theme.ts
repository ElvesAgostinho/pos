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
  get accent() { return getAppearance('barColor') || '#336699'; },
  // Dourado — SÓ para o logótipo "ML" e realces de marca; nunca para texto/fundo.
  gold: '#c9a400',
  goldDark: '#8a6f00',

  // Neutros — a base de tudo (barras, fundos, linhas).
  bar: '#2b2b2b',            // barra de menus / título de janela (escuro sempre, claro ou escuro)
  barSoft: '#3c3c3c',        // barra secundária (título da secção, um tom mais claro que `bar`)
  canvas: '#f0f0f0',         // fundo da área de trabalho
  surface: '#ffffff',        // fundo dos formulários/grelhas
  toolbarBg: '#f4f4f4',      // fundo da barra de ferramentas (Toolbar do kit.tsx)
  border: '#8a95a3',         // contorno de campos de formulário (inputCls do kit.tsx)
  line: '#c0c0c0',           // divisórias/linhas finas entre áreas
  lineSoft: '#d5d5d5',       // divisórias mais subtis (dentro de grelhas)

  // Texto
  textOnDark: '#e6e6e6',
  textOnLight: '#1a2433',
  textMuted: '#666666',

  // Seleção / destaque (linha escolhida numa grelha, item ativo numa árvore).
  selectedBg: '#dbe7f3',
  selectedText: '#1a4f8a',
  hover: '#f5f9ff',

  // Semântica — sempre as mesmas em todo o sistema, nunca variações locais.
  success: '#1f7a34',        // Gravar / confirmar
  danger: '#c0392b',         // Apagar / cancelar
  dangerSoft: '#a01818',     // texto de erro sobre fundo claro
  warning: '#e0a020',
  warningBg: '#fff8e1',
  warningBorder: '#e0c080',
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
// mesma receita) — para não se escrever "linear-gradient(...#1e3f66...)" fixo
// em cada ecrã: assim a personalização (Aparência → Cor da barra) chega a todo
// o lado que usar isto, não só ao ecrã onde alguém se lembrou de a aplicar.
export function accentGradient(accent: string = TOKENS.accent): string {
  return `linear-gradient(to bottom, ${shade(accent, 24)} 0%, ${accent} 55%, ${shade(accent, -30)} 100%)`;
}

// Tema "clássico pesado" (light) — barras com relevo/gradiente, linhas fortes.
// Reutilizado pelo DesktopShell (moldura do backoffice) e por qualquer ecrã que
// precise da MESMA moldura (Configuração POS, Diagnóstico, etc.).
export function classicTheme(dark: boolean) {
  return dark
    ? {
        bar: '#2b2b2b', barText: TOKENS.textOnDark, ribbon: '#333333', tree: '#252525',
        treeText: '#dcdcdc', line: '#3a3a3a', body: '#1e1e1e', status: '#1b1b1b',
        hover: '#3a3a3a', accent: '#4a9edb',
      }
    : {
        bar: 'linear-gradient(to bottom, #fbfcfd 0%, #eceff2 55%, #dfe3e8 100%)',
        barText: TOKENS.textOnLight,
        ribbon: 'linear-gradient(to bottom, #f6f8fa 0%, #e6eaee 60%, #d7dce2 100%)',
        tree: TOKENS.surface, treeText: TOKENS.textOnLight, line: TOKENS.border,
        body: '#dfe3e8', status: TOKENS.accent, hover: TOKENS.selectedBg,
        accent: TOKENS.accent,
      };
}
