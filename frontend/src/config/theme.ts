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
  // O CONTORNO DE UM CAMPO NÃO É UMA LINHA DE SEPARAÇÃO. Os campos usavam o
  // mesmo #E6E8EC das divisórias e dos painéis — e a um campo branco sobre
  // fundo branco isso deixa uma aresta quase inexistente: o formulário lê-se
  // como texto a flutuar, desfocado, sem se perceber onde se pode escrever.
  // Uma divisória deve desaparecer; um campo tem de se ver. São trabalhos
  // diferentes, e por isso são cores diferentes — esta é só para os campos,
  // para não escurecer tudo o resto ao mesmo tempo.
  field: '#D0D5DD',

  // ── TEXTO ─────────────────────────────────────────────────────────────────
  textOnDark: '#FFFFFF',
  textOnLight: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',

  // ── SELECÇÃO ──────────────────────────────────────────────────────────────
  // DOIS TOKENS, PORQUE SÃO DOIS TRABALHOS. Havia um só, `selectedText`, e
  // dezenas de ecrãs usavam-no a querer dizer "texto normal" — funcionava por
  // acaso, por os dois serem escuros. No dia em que a linha seleccionada passou
  // a azul cheio e este token passou a branco, todos esses títulos
  // desapareceram: branco sobre branco. Um nome só pode querer dizer uma coisa.
  // DUAS SELECÇÕES, PORQUE SÃO DOIS TRABALHOS.
  //
  // Numa ÁRVORE, a linha escolhida é uma barra azul cheia com texto branco — é
  // a convenção do Explorador do Windows e lê-se de relance numa lista de
  // quarenta nós onde só há nomes.
  //
  // Numa GRELHA DE DADOS não serve: a barra cheia apaga os números da linha que
  // se acabou de escolher — justamente a linha que se quer ler. O Excel resolve
  // isto há trinta anos com preenchimento claro e uma moldura fina: vê-se qual
  // é, e continua a ler-se o que lá está.
  selectedBg: '#316AC5',          // ÁRVORE: a barra azul cheia (Windows)
  selectedRow: '#DCE9F7',         // GRELHA: preenchimento claro
  selectedRowLine: '#8FB8E0',     // GRELHA: a moldura que diz onde ela começa e acaba
  selectedSoft: '#DBEAFE',        // realce leve (linha sob o rato, pré-selecção)
  selectedText: '#111827',        // TEXTO SOBRE FUNDO CLARO (o significado antigo, mantido)
  textOnSelection: '#FFFFFF',     // texto POR CIMA da barra azul — e só aí

  // ── A MOLDURA CLÁSSICA (ERP de gestão) ────────────────────────────────────
  // As cores da moldura — ribbon, separadores, cabeçalhos de grelha. São
  // cinzentos quentes de poucos passos, como em qualquer ERP desta família: a
  // moldura não tem de se ver, tem de desaparecer para o conteúdo aparecer.
  chrome: '#F0F0F0',              // fundo do ribbon e das barras
  chromeDeep: '#E4E4E4',          // o mesmo, carregado (limite inferior)
  chromeLine: '#C8C8C8',          // divisórias da moldura — visíveis, 1px
  tabBar: '#DCE4F0',              // tira onde assentam os separadores
  tabActive: '#FFFFFF',           // separador aberto
  gridHead: '#F3F3F3',            // cabeçalho de coluna
  gridLine: '#D4D4D4',            // grelha interior — tem de SE VER
  rowAlt: '#F7F9FC',              // linha alternada
  // O REALCE DE QUEM PASSA POR CIMA é âmbar, não cinzento: é o que distingue
  // "o rato está aqui" de "isto está seleccionado" (azul) sem usar duas vezes
  // a mesma cor para coisas diferentes.
  hoverGold: 'linear-gradient(to bottom, #FDF4D9, #F7E4A8)',
  hoverGoldLine: '#D9B451',

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
/**
 * O FUNDO DO SISTEMA — o Ambiente de Trabalho e o início de sessão.
 *
 * Está aqui, e não em cada um dos dois ecrãs, porque são o MESMO fundo visto em
 * dois momentos: quem entra vê esta superfície no login e volta a encontrá-la
 * atrás das janelas. Duas cópias desalinham-se à primeira alteração.
 *
 * É cinzento-azulado escuro e NEUTRO, sem a cor da marca: num ambiente de
 * trabalho a janela do módulo é que importa, e um fundo com cor compete com ela.
 * Uma fonte de luz fraca em cima à esquerda dá-lhe orientação; mais do que isso
 * já é decoração, e um fundo que se nota é um fundo mal feito.
 */
export const FUNDO_SISTEMA =
  'radial-gradient(120% 90% at 8% -10%, #33414F 0%, #2A3540 38%, transparent 72%),'
  + ' linear-gradient(165deg, #273039 0%, #1E252C 58%, #171C21 100%)';

/**
 * O VÉU que vai por cima da FOTOGRAFIA do hotel. Escurece, e não tinge: era
 * azul-escuro, e tingia a fotografia do dono de uma cor que não é a dela. O véu
 * existe por uma razão só — o texto por cima é branco, e um céu claro na
 * fotografia tornava-o ilegível.
 */
export const VEU_SOBRE_FOTO =
  'linear-gradient(rgba(14,18,22,0.52), rgba(14,18,22,0.68))';

export const RADIUS = {
  // CANTO VIVO. Esta escala já foi o contrário — 8/12/16px, cantos generosos,
  // na ideia de que isso lê como "software desta década". Lê; mas lê como uma
  // aplicação web, e isto é um ERP de gestão, da família do Comarch, do PRODAT,
  // do Primavera. Nesses, um canto redondo aparece em exactamente zero sítios:
  // as caixas encostam umas às outras e o que as separa é uma linha de 1px.
  // Mudar isto não é nostalgia — é o pedido do dono, e é o que faz com que a
  // mesma grelha pareça "o programa da contabilidade" em vez de um site.
  //
  // Os nomes ficam todos, porque uns quarenta ecrãs os importam; o que muda é
  // o valor. A pílula sobrevive para os estados (Pago/Anulado), onde continua
  // a ser a forma certa.
  sm: '0px',
  md: '0px',
  lg: '2px',     // só a moldura exterior de um diálogo
  pill: '999px', // estados e etiquetas — e mais nada
} as const;

export const SHADOW = {
  // A BORDA VOLTA A SUBSTITUIR A SOMBRA — o inverso do que aqui estava escrito.
  // Num ERP o que separa duas áreas é uma linha de 1px, não um cartão a flutuar:
  // o ecrã é uma folha única dividida em regiões, e não uma pilha de cartões
  // pousados. Sombra fica só onde alguma coisa está MESMO por cima do resto —
  // um menu aberto, um diálogo. Nos painéis encostados, nenhuma.
  xs: 'none',
  soft: 'none',
  panel: '0 2px 10px rgba(0,0,0,0.22)',     // menu suspenso / painel flutuante
  pop: '0 4px 20px rgba(0,0,0,0.30)',       // diálogo modal
  ring: '0 0 0 1px #316AC5',                // foco — moldura fina, não halo
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
        // Cinzento de moldura, com a linha a ver-se. O gradiente de três passos
        // que aqui estava não é relevo: é quase a mesma cor três vezes, e o que
        // dava era uma mancha baça. Duas cores e um limite inferior chegam.
        bar: 'linear-gradient(to bottom, #FBFBFB 0%, #F0F0F0 100%)',
        barText: TOKENS.textOnLight,
        ribbon: 'linear-gradient(to bottom, #FDFDFD 0%, #F0F0F0 92%, #E8E8E8 100%)',
        tree: TOKENS.surface, treeText: TOKENS.textOnLight, line: TOKENS.chromeLine,
        body: '#F0F0F0', status: TOKENS.accent, hover: TOKENS.selectedSoft,
        accent: TOKENS.accent,
      };
}
