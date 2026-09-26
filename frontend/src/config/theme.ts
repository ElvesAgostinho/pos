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
  // Azul petróleo + branco: só duas cores em todo o sistema (pedido do dono).
  // O vermelho de "apagar/erro" (danger, abaixo) é a ÚNICA exceção — é o único
  // sítio onde a cor É o aviso, sempre acompanhada de ícone+texto, nunca sozinha.
  get accent() { return getAppearance('barColor') || '#062A31'; },
  // Mantido com o nome "gold" por compatibilidade (dezenas de ecrãs já leem
  // TOKENS.gold) — mas já não é dourado: é o mesmo azul petróleo institucional,
  // para o logótipo "ML" e realces de marca não destoarem do resto da paleta.
  gold: '#062A31',
  goldDark: '#041F24',

  // Neutros — a base de tudo (barras, fundos, linhas), agora dentro da família
  // azul-petróleo em vez de cinzento neutro: bordas/linhas/fundos claros usam
  // tons muito diluídos do mesmo azul, para lerem como a MESMA cor, não uma 3ª.
  bar: '#041F24',            // barra de menus / título de janela (petróleo escuro)
  barSoft: '#0B4F5C',        // barra secundária (título da secção, um tom mais claro que `bar`)
  canvas: '#EEF4F5',         // fundo da área de trabalho (petróleo muito diluído)
  surface: '#ffffff',        // fundo dos formulários/grelhas
  toolbarBg: '#F7FAFA',      // fundo da barra de ferramentas (Toolbar do kit.tsx)
  border: '#5C8891',         // contorno de campos de formulário (inputCls do kit.tsx)
  line: '#C3D8DB',           // divisórias/linhas finas entre áreas
  lineSoft: '#DCEAEC',       // divisórias mais subtis (dentro de grelhas)

  // Texto
  textOnDark: '#F2F7F8',
  textOnLight: '#0B2E36',
  textMuted: '#5C7A80',

  // Seleção / destaque (linha escolhida numa grelha, item ativo numa árvore).
  selectedBg: '#CFE3E6',
  selectedText: '#041F24',
  hover: '#E4F0F1',

  // Semântica — o vermelho é a ÚNICA cor fora da família azul-petróleo/branco,
  // e só para apagar/cancelar/erro (nunca decoração). "Sucesso"/"aviso" deixaram
  // de ter cor própria — usam a mesma família petróleo (sempre com ícone+texto).
  success: '#062A31',        // Gravar / confirmar
  danger: '#B0392B',         // Apagar / cancelar
  dangerSoft: '#8C2B1F',     // texto de erro sobre fundo claro
  warning: '#062A31',
  warningBg: '#EEF4F5',
  warningBorder: '#5C8891',
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
// mesma receita) — para não se escrever "linear-gradient(...#062A31...)" fixo
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
        bar: TOKENS.bar, barText: TOKENS.textOnDark, ribbon: '#0B3E48', tree: '#062A31',
        treeText: '#DCEAEC', line: '#1A5762', body: '#062A31', status: '#052128',
        hover: '#12505C', accent: TOKENS.gold,
      }
    : {
        bar: 'linear-gradient(to bottom, #F7FAFA 0%, #EEF4F5 55%, #DCEAEC 100%)',
        barText: TOKENS.textOnLight,
        ribbon: 'linear-gradient(to bottom, #F7FAFA 0%, #EEF4F5 60%, #DCEAEC 100%)',
        tree: TOKENS.surface, treeText: TOKENS.textOnLight, line: TOKENS.border,
        body: '#DCEAEC', status: TOKENS.accent, hover: TOKENS.selectedBg,
        accent: TOKENS.accent,
      };
}
