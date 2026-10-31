import type { ReactNode } from 'react';
import { TOKENS } from '../../config/theme';
import Pictograma, { temPictograma } from '../icons/Pictogramas';
import {
  Check as CheckIcon, X, Pencil, Copy, Minus, Plus, CirclePlus, Download, Printer,
  RefreshCw, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, SquareCheck, Search,
  Ban, Save, Package, BarChart3, ArrowUpToLine, LayoutGrid, Clock, Building2, Landmark,
  Users, User, Mail, PartyPopper, FolderArchive, TrendingUp, Monitor, Moon, Coins, Receipt,
  Wrench, Settings, Heart, IdCard, Phone, Star, Info, Link as LinkIcon, BedSingle as Bed,
  Handshake, CreditCard, GitBranch, Lock, Eye, TriangleAlert, Menu, Key, Unlock, Scissors,
  FileText, Files, Image as ImageIcon, ShoppingCart, ShieldCheck, UserRound, Dot,
  LayoutDashboard, Calendar, ClipboardList, Wallet, Globe, Bell, Truck, Boxes,
  FileSpreadsheet, Percent, Tag, MapPin, Utensils, Sparkles, SlidersHorizontal,
} from 'lucide-react';

/**
 * GLIFO → ÍCONE. As barras de ferramentas dos ecrãs de configuração (Toolbar,
 * abaixo) e o menu do módulo (SECTIONS) vinham de um emoji ou de um carácter
 * Unicode solto (✔ ✖ ✎ 🏢…) — desenhados pelo SISTEMA (Windows/Android/iPhone
 * mostram formas diferentes), coloridos por cima de fundo escuro, e sem obedecer
 * ao tamanho nem à cor do botão. Este mapa troca o glifo por um traço da mesma
 * biblioteca usada no resto do sistema — quem já usa `icon: '✔'` num ecrã não
 * precisa de mudar nada: só troca o DESENHO por dentro do Toolbar/menu.
 */
export const ICON_MAP: Record<string, any> = {
  '✔': CheckIcon, '✓': CheckIcon, '✅': CheckIcon, '☑': SquareCheck,
  '✖': X, '✕': X, '✗': X, '❌': X,
  '✎': Pencil, '✏': Pencil, '🖊': Pencil,
  '⧉': Copy, '📋': Copy,
  '−': Minus, '➖': Minus,
  '＋': Plus, '➕': Plus,
  '⤓': Download, '⬇': Download, '📥': Download,
  '⤒': ArrowUpToLine,
  '🖶': Printer, '🖨': Printer,
  '⟳': RefreshCw, '🔄': RefreshCw, '🔁': RefreshCw,
  '▶': ChevronRight, '▸': ChevronRight,
  '◀': ChevronLeft,
  '⏮': ChevronsLeft, '⏭': ChevronsRight,
  '🔍': Search, '🔎': Search,
  '🚫': Ban, '⛔': Ban, '❗': TriangleAlert, '⚠': TriangleAlert,
  '💾': Save,
  '📦': Package,
  '📊': BarChart3, '📈': TrendingUp,
  '▦': LayoutGrid,
  '🕐': Clock,
  '🏢': Building2, '🏛': Landmark,
  '👥': Users, '👤': User,
  '✉': Mail,
  '🗂': FolderArchive,
  '🎉': PartyPopper,
  '🖥': Monitor,
  '🌙': Moon,
  '💰': Coins, '💸': Coins,
  '🧾': Receipt,
  '🔧': Wrench,
  '⚙': Settings,
  '♥': Heart,
  '⊕': CirclePlus,
  '🪪': IdCard,
  '☎': Phone,
  '⭐': Star,
  'ℹ': Info,
  '🔗': LinkIcon,
  '🛏': Bed,
  '🤝': Handshake,
  '💳': CreditCard,
  '⎇': GitBranch,
  '🔒': Lock, '🔐': Lock,
  '🔓': Unlock,
  '✂': Scissors,
  '👁': Eye,
  '☰': Menu,
  '🔑': Key,
  // ── Os que faltavam e saíam como EMOJI CRU ──────────────────────────────
  // Um emoji sem mapa é desenhado pelo sistema operativo: muda de forma entre
  // Windows, Android e iPhone, vem colorido por cima de um fundo escuro e
  // ignora o tamanho e a cor do botão. Bastava um para o conjunto deixar de
  // parecer desenhado. Estes nove eram os que ainda escapavam.
  '●': Dot,
  '📄': FileText, '📑': Files,
  '🖼': ImageIcon,
  '🛒': ShoppingCart,
  '🛡': ShieldCheck,
  '🧑': UserRound,
  'app': LayoutDashboard, 'gear': SlidersHorizontal, 'terminal': Monitor,
  // ── Vocabulário de hotelaria, para quem precisar ────────────────────────
  '📅': Calendar, '📝': ClipboardList, '👛': Wallet, '🌐': Globe,
  '🔔': Bell, '🚚': Truck, '📚': Boxes, '📗': FileSpreadsheet,
  '%': Percent, '🏷': Tag, '📍': MapPin, '🍽': Utensils, '✨': Sparkles,
};

/**
 * Renderiza o ícone certo para um glifo conhecido; sem mapa, mostra o texto
 * original (nunca esconde um ícone só porque ainda não entrou no mapa).
 *
 * TRAÇO: 1.8 em vez de 2.3. O traço grosso era o que fazia os ícones parecerem
 * carimbados em cima do texto — num conjunto denso, o ícone deve acompanhar a
 * letra, não gritar mais alto do que ela.
 *
 * RELEVO (`chip`): o ícone dentro de um quadrado arredondado com um degradê
 * muito curto, uma luz no rebordo de cima e uma sombra aberta em baixo. É a
 * maneira de dar profundidade a um ícone sem recorrer a ilustrações 3D
 * desenhadas — essas são bonitas numa página de produto e erradas aqui: pesam,
 * não acompanham a cor do tema e, num ecrã com quarenta linhas, viram ruído.
 * Assim o relevo vem da LUZ, que é como se faz volume num símbolo.
 */
/**
 * A COR DE UM ÍCONE — sempre a mesma para o mesmo ícone.
 *
 * No ribbon há vinte comandos lado a lado. Pintados todos do mesmo azul, lêem-se
 * como vinte manchas iguais e não se encontra nenhum sem ler as legendas uma a
 * uma — que é exactamente o que se quer evitar pôr os ícones. Com cor, ao fim do
 * primeiro dia procura-se "o verde do costume" e acerta-se de relance.
 *
 * A cor sai do NOME do ícone, por conta: o mesmo ícone dá sempre a mesma cor,
 * em todos os ecrãs, sem ninguém ter de a escolher nem de a manter numa tabela
 * de duzentas linhas que ninguém actualiza. Os poucos casos onde a cor TEM
 * significado — dinheiro, apagar, avisar — estão escritos à mão em cima, porque
 * nesses a cor é informação e não arrumação.
 */
const PALETA_ICONES = [
  '#C8562B', '#2F6FB5', '#3C8C4E', '#8A6FB0', '#C9A227',
  '#2D8C8C', '#B5476E', '#5A7A96', '#7A8C2D', '#B5651D',
];
const COR_FIXA: Record<string, string> = {
  '🗑': '#C0392B',   // apagar — vermelho, e nunca outra coisa
  '⚠': '#D97706',       // aviso — âmbar
  '💰': '#2E7D32',   // dinheiro — verde
  '💳': '#2E7D32',   // cartão
  '🧾': '#4A6B8A',   // factura
  '🔒': '#5A6B7A',   // segurança — cinzento de aço
};
export function corDoIcone(nome: string): string {
  if (COR_FIXA[nome]) return COR_FIXA[nome];
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA_ICONES[h % PALETA_ICONES.length];
}

export function Glyph({ icon, size = 15, chip, tom }: {
  icon: string; size?: number; chip?: boolean; tom?: string;
}) {
  // 1.º O PICTOGRAMA CHEIO, se existir para este nome. É o desenho a sério —
  //    a folha do Excel, o envelope, a pasta — e é o que deve aparecer.
  if (temPictograma(icon)) {
    const p = <Pictograma nome={icon} size={size} />;
    return chip ? <span className="inline-flex items-center justify-center flex-shrink-0">{p}</span> : p;
  }

  // 2.º O ícone de traço, para os símbolos de controlo (setas, visto, ×) onde o
  //    traço é a forma certa e um desenho cheio ficaria pesado.
  const Cmp = ICON_MAP[icon];
  // 3.º NUNCA O EMOJI EM CRU. Era isto que estava aqui: faltando desenho, escrevia
  //    o caracter tal e qual, e saia um emoji colorido do sistema operativo no
  //    meio de uma barra de ERP — diferente em cada máquina, infantil em todas.
  //    Os emojis são a CHAVE com que o código pede o ícone, nunca o que se mostra.
  //    Sem desenho, mostra-se uma forma neutra: vê-se que falta um ícone, e não
  //    se enfeita o ecrã com um boneco.
  const desenho = Cmp
    ? <Cmp size={size} strokeWidth={1.8} />
    : (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ display: 'block' }}>
        <rect x="5" y="4" width="22" height="24" rx="2.5" fill="#E4EAF0" stroke="#B9C6D4" strokeWidth="1.4" />
        <path d="M10 12h12M10 17h12M10 22h8" stroke="#B9C6D4" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  // SEM MOLDURA, A COR TEM DE CHEGAR À MESMA. O `tom` só era usado para pintar
  // o quadradinho do `chip`; quem pedisse um ícone solto com cor levava com a
  // cor herdada do pai e não percebia porquê. É o caso do ribbon, onde o chip a
  // 22px ficaria do tamanho de um botão.
  if (!chip) return tom ? <span style={{ color: tom, display: 'inline-flex' }}>{desenho}</span> : desenho;

  const cor = tom || TOKENS.brand;
  const lado = Math.round(size * 2);
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: lado, height: lado, borderRadius: Math.round(lado * 0.32),
        color: cor,
        background: `linear-gradient(160deg, #FFFFFF 0%, ${cor}14 55%, ${cor}22 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 ${cor}1F, `
                 + `0 1px 2px rgba(16,24,40,0.06), 0 2px 6px rgba(16,24,40,0.05)`,
      }}>
      {desenho}
    </span>
  );
}

export const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

/** As secções da Configuração POS (menu da esquerda). */
export const SECTIONS = [
  {
    key: 'artigos', title: 'Artigos', items: [
      { key: 'articles', label: 'Artigos' },
      { key: 'groups', label: 'Grupos' },
      { key: 'families', label: 'Famílias' },
      { key: 'subfamilies', label: 'Sub-Famílias' },
      { key: 'allergens', label: 'Alergénios' },
      { key: 'messages', label: 'Mensagens' },
      { key: 'maintenance', label: 'Manutenção' },
      { key: 'report_defs', label: 'Definições de Relatórios' },
      { key: 'barcode_print', label: 'Impressão de Códigos de Barras' },
    ],
  },
  { key: 'params', title: 'Parâmetros do Sistema', items: [
    { key: 'p_group', label: 'Grupo', icon: '🏢' },
    { key: 'p_company', label: 'Empresa', icon: '🏛' },
    { key: 'p_modules', label: 'Módulos' },
    // O PONTO DE VENDA VIVE AQUI, antes dos Setores e dos Terminais — porque é
    // deles que estes dependem. O ecrã existia, mas só no Centro de Gestão
    // Hoteleira (04), outro módulo: quem estava a configurar o POS via o campo
    // "Ponto de venda" em metade das fichas (setores, terminais, impressoras,
    // modos de pagamento, happy hour) e não tinha ali forma nenhuma de criar um,
    // nem uma pista de onde ele se criava. Ficava com as listas todas vazias e
    // sem saber porquê. É o MESMO ecrã, não uma cópia: aparece nos dois sítios.
    { key: 'p_outlets', label: 'Pontos de Venda (Outlets)', icon: '🏪' },
    { key: 'p_terminals', label: 'Terminais' },
    { key: 'p_sectors', label: 'Setores' },
    { key: 'p_params', label: 'Parâmetros' },
    { key: 'p_keyboards', label: 'Teclados' },
    { key: 'p_periods', label: 'Horários - Períodos' },
    { key: 'p_schedules', label: 'Horários' },
    { key: 'p_printers', label: 'Impressoras' },
  ] },
  { key: 'users', title: 'Gestão de Utilizadores', items: [
    { key: 'u_groups', label: 'Grupos de Utilizadores', icon: '👥' },
    { key: 'u_users', label: 'Utilizadores', icon: '👤' },
    { key: 'u_hr_type', label: 'Tipo R.H.' },
    { key: 'u_hr', label: 'Recursos Humanos' },
  ] },
  { key: 'fin', title: 'Financeiro', items: [
    { key: 'f_currencies', label: 'Moedas' },
    { key: 'f_discounts', label: 'Descontos' },
    { key: 'f_taxes', label: 'Impostos' },
    { key: 'f_exemptions', label: 'Isenções IVA' },
    { key: 'f_payments', label: 'Modos de Pagamento' },
    { key: 'f_documents', label: 'Documentos' },
    { key: 'f_analytic', label: 'Conta analítica' },
  ] },
  { key: 'others', title: 'Outros', items: [
    { key: 'o_pms', label: 'Interface com PMS' },
    { key: 'o_stock_iface', label: 'Interface com Controle de Stocks' },
    { key: 'o_stock_units', label: 'Unidades de Stock' },
    { key: 'o_happy', label: 'Happy Hour' },
    { key: 'o_reasons', label: 'Motivos de Anulação' },
    { key: 'o_hardware', label: 'Hardware' },
    { key: 'o_printers', label: 'Impressoras' },
    { key: 'o_kds', label: 'Monitores de cozinha' },
    { key: 'o_smartcash', label: 'Caixa inteligente' },
    { key: 'o_customer_types', label: 'Tipos de Cliente' },
    { key: 'o_custom_fields', label: 'Campos personalizados' },
  ] },
  { key: 'cards', title: 'Cartões', items: [
    { key: 'c_types', label: 'Tipos de cartões' },
    { key: 'c_members', label: 'Cartões de membro' },
  ] },
  { key: 'marketing', title: 'Marketing', items: [
    { key: 'm_params', label: 'Parâmetros' },
    { key: 'm_languages', label: 'Línguas' },
    { key: 'm_templates', label: 'Modelos de E-mail', icon: '✉' },
    { key: 'm_attachments', label: 'Modelos - Anexos' },
    { key: 'm_variables', label: 'Modelos - Variáveis' },
    { key: 'm_selgroups', label: 'Grupos de códigos de selecção' },
    { key: 'm_selcodes', label: 'Códigos de seleção' },
  ] },
  { key: 'events', title: 'Eventos', items: [
    { key: 'e_params', label: 'Parâmetros' },
    { key: 'e_states', label: 'Estado da Reserva' },
    { key: 'e_addstates', label: 'Estado Adicional' },
    { key: 'e_cancel', label: 'Motivos de Cancelamento' },
    { key: 'e_types', label: 'Tipos de eventos/serviços' },
    { key: 'e_spacetypes', label: 'Tipo de Espaço' },
    { key: 'e_spaceavail', label: 'Disp. Espaço' },
    { key: 'e_planning', label: 'Opções do Planning' },
    { key: 'e_packages', label: 'Packages', icon: '📦' },
    { key: 'e_segments', label: 'Segmento' },
    { key: 'e_subsegments', label: 'Sub-Segmento' },
    { key: 'e_channels', label: 'Canal Distrib.' },
  ] },
  { key: 'fnb', title: 'Gestão de F&B', items: [
    { key: 'g_utils', label: 'Utilitários' },
    { key: 'g_params', label: 'Parâmetros' },
    { key: 'g_docs', label: 'Documentos' },
    { key: 'g_docstatus', label: 'Status dos documentos' },
    { key: 'g_payterms', label: 'Condições de pagamento' },
    { key: 'g_uoms', label: 'Unidades de Stock' },
    { key: 'g_warehouses', label: 'Armazéns' },
    { key: 'g_mapping', label: 'Mapeamentos Setor/Armazéns' },
    { key: 'g_costcenters', label: 'Centro de Custo' },
  ] },
];

/** Etiqueta + campo, alinhados como nos formulários clássicos. */
export function Field({ label, children, wide, empilhado }: {
  label: string; children: ReactNode; wide?: boolean; empilhado?: boolean;
}) {
  // EMPILHADO — etiqueta por cima do campo, cada um com a largura toda.
  //
  // Lado a lado é bom numa coluna larga; numa coluna estreita (um painel de
  // filtros com cinco colunas, por exemplo) a etiqueta e o campo não cabem na
  // mesma linha e a etiqueta parte ao meio: "Check-" numa linha, "In:" na
  // outra. Empilhados, a largura da coluna deixa de ser um problema — e os
  // campos ficam todos alinhados pela esquerda, que é mais fácil de percorrer
  // com os olhos do que uma coluna de etiquetas de comprimentos diferentes.
  if (empilhado) {
    return (
      <label className="flex flex-col gap-1 text-[12px] min-w-0">
        <span className="text-[#6B7280] whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
        {children}
      </label>
    );
  }
  return (
    <label className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] min-w-0">
      {/* A ETIQUETA TEM DE PODER ENCOLHER.
          `min-w` dá-lhe uma largura mínima para as etiquetas curtas alinharem
          umas com as outras. Mas com `flex-shrink-0` e `whitespace-nowrap` ela
          deixava de poder encolher OU quebrar: numa célula estreita transbordava
          e caía por cima da coluna ao lado — era o "GrupoSub Família:" escrito um
          por cima do outro, visível numa janela de 1030px e invisível numa de
          1920.
          Agora encolhe e quebra em duas linhas quando é preciso. Uma etiqueta em
          duas linhas lê-se; duas etiquetas sobrepostas não. */}
      <span className={`text-[#111827] ${wide ? '' : 'min-w-[74px]'} shrink`}>{label}</span>
      {/* E o campo também: sem `min-w-0` um `select` recusa-se a encolher abaixo
          do seu conteúdo e empurra tudo para fora da célula. */}
      {/* `flex-wrap` no pai + uma largura MÍNIMA aqui: quando a etiqueta e o
          campo não cabem lado a lado, o campo passa para baixo em vez de
          encolher até desaparecer. Era o que acontecia neste bloco de filtros:
          a coluna tem ~90px, a etiqueta ocupa 74, e o `select` ficava com 8px —
          invisível, e a etiqueta seguinte parecia estar por cima desta.
          Um campo numa segunda linha lê-se; um campo de 8px não. */}
      <span className="min-w-[110px] flex-1 flex items-center">{children}</span>
    </label>
  );
}

export function Sel({ value, onChange, options, all, allLabel = '(Todos)' }:
  { value: any; onChange: (v: string) => void; options: { value: any; label: string }[]; all?: boolean; allLabel?: string }) {
  return (
    // `min-w-0` em vez de `min-w-[170px]`: com uma largura MÍNIMA fixa, o campo
    // recusava-se a encolher dentro de uma coluna estreita, transbordava da
    // célula e passava por baixo da etiqueta do campo seguinte — era isto que
    // juntava as palavras nos painéis de filtros. Agora acompanha a coluna.
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      className="border border-[#E6E8EC] rounded-[8px] px-2.5 py-1.5 text-[12px] bg-white
        min-w-0 w-full flex-1 outline-none focus:border-[#2563EB] transition-colors">
      {all && <option value="">{allLabel}</option>}
      {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Barra de ferramentas inferior — fila compacta de ícones, como nos ERP
    hoteleiros clássicos (Fidelio/Micros): ícone tingido na cor da ação, sem
    bolha colorida à volta, moldura só aparece ao passar o rato por cima. */
export function Toolbar({ actions, right }: { actions: any[]; right?: ReactNode }) {
  return (
    // A BARRA DE ACÇÕES DO RODAPÉ — uma barra de ferramentas, não uma fila de
    // botões grandes. Eram 44px de altura a repetir, em texto de 12px, aquilo
    // que o ícone já diz; ficam 26, e as 18 que sobram são mais uma linha de
    // grelha visível em TODOS os ecrãs de lista do sistema.
    <div className="flex items-center gap-0 px-1 py-[2px] border-t flex-shrink-0"
      style={{ background: 'linear-gradient(to bottom, #FDFDFD, #F0F0F0)', borderColor: TOKENS.chromeLine }}>
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title}
          className="flex items-center gap-1 px-2 h-[22px] text-[11.5px] disabled:opacity-35 disabled:cursor-default"
          style={{ color: TOKENS.textOnLight, border: '1px solid transparent', borderRadius: 0 }}
          onMouseEnter={(e) => {
            if (a.disabled) return;
            e.currentTarget.style.background = TOKENS.hoverGold;
            e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}>
          <span className="w-[15px] h-[15px] flex items-center justify-center flex-shrink-0">
            <Glyph icon={a.icon} size={13} tom={a.disabled ? '#9CA3AF' : (a.color || corDoIcone(a.icon))} />
          </span>
          {a.label}
        </button>
      ))}
      <div className="ml-auto">{right}</div>
    </div>
  );
}

/** Separador (aba) do editor de artigo. */
export function Tab({ active, onClick, children }: any) {
  return (
    // Separador de ficha: o aberto liga-se ao conteúdo de baixo (fundo branco,
    // moldura em cima e dos lados, sem linha em baixo) — a mesma figura dos
    // separadores de documento do topo. São a mesma ideia; devem ler-se igual.
    <button onClick={onClick}
      className="px-3 h-[22px] text-[11.5px]"
      style={{
        background: active ? TOKENS.surface : 'transparent',
        borderTop: `1px solid ${active ? TOKENS.chromeLine : 'transparent'}`,
        borderLeft: `1px solid ${active ? TOKENS.chromeLine : 'transparent'}`,
        borderRight: `1px solid ${active ? TOKENS.chromeLine : 'transparent'}`,
        marginBottom: active ? '-1px' : 0,
        fontWeight: active ? 700 : 400,
        color: TOKENS.textOnLight,
        borderRadius: 0,
      }}>
      {children}
    </button>
  );
}

/** CARTÃO — o bloco de que os ecrãs são feitos.
 *
 * Era um "group box" à maneira dos PMS antigos: rebordo em relevo, fundo
 * recuado, sombra interior — uma caixa DESENHADA dentro da janela. Agora é uma
 * superfície branca POUSADA sobre o fundo: canto generoso, uma linha quase
 * invisível e uma sombra aberta. O que separa um cartão do seguinte é o espaço
 * entre eles, não um contorno à volta de cada um.
 *
 * O título deixou de ser `legend` encavalitada na borda (um desenho que só
 * existe porque o HTML o permite) e passa a ser uma linha de texto própria,
 * acima do conteúdo, com espaço a seguir. */
/**
 * A CAIXA — um painel com título, do género "group box" de qualquer ERP.
 *
 * Era um cartão: canto redondo, sombra, 16px de folga por dentro e o título
 * solto lá dentro. Passou a ser o que as imagens mostram: moldura de 1px, título
 * numa tira cinzenta encostada ao topo, e 6px de folga. O que se ganha não é
 * gosto — são cerca de 30 pixéis por caixa, e um ecrã de filtros tem três ou
 * quatro: quase uma linha de grelha por caixa, que é o que se vem aqui ver.
 */
export function Box({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 overflow-hidden ${className}`}
      style={{
        border: `1px solid ${TOKENS.chromeLine}`,
        background: TOKENS.surface,
        borderRadius: 0,
      }}>
      {title && (
        <h3 className="text-[11px] font-bold px-2 py-[2px] border-b"
          style={{
            color: TOKENS.textOnLight,
            background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)',
            borderColor: TOKENS.chromeLine,
          }}>
          {title}
        </h3>
      )}
      <div className="p-1.5">{children}</div>
    </section>
  );
}

/** Botão de Pesquisar clássico — relevo 3D "outset" (o mesmo princípio do
    `groove` acima, só que a fazer um botão parecer PRESSIONÁVEL em vez de
    EMBUTIDO), sempre na cor institucional. Cada ecrã de pesquisa escrevia o
    seu próprio botão preto à mão, com fundo e largura ligeiramente
    diferentes um do outro — este substitui todos por um só. */
export function SearchButton({ onClick, label = 'Pesquisar', icon = '⟳', className = '', disabled }: {
  onClick: () => void; label?: string; icon?: string; className?: string; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      // UM BOTÃO DE BARRA, NÃO UM BLOCO DE COR. Era um rectângulo azul de 190
      // por 60 ao lado dos filtros — o objecto mais pesado do ecrã a dizer
      // "Pesquisar", quando o que importa no ecrã é o resultado. Nas imagens o
      // comando mais usado é uma linha de barra de ferramentas com um ícone
      // pequeno; pesa o que deve pesar e deixa o espaço para a grelha.
      className={`flex items-center justify-center gap-1.5 px-3 h-[22px]
        disabled:opacity-40 disabled:cursor-default ${className}`}
      style={{
        background: 'linear-gradient(to bottom, #FDFDFD, #EDEDED)',
        border: `1px solid ${TOKENS.chromeLine}`,
        color: TOKENS.textOnLight,
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = TOKENS.hoverGold;
        e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(to bottom, #FDFDFD, #EDEDED)';
        e.currentTarget.style.borderColor = TOKENS.chromeLine;
      }}>
      <Glyph icon={icon} size={13} tom="#2F6FB5" />
      <span className="text-[11.5px] font-semibold">{label}</span>
    </button>
  );
}

/** Linha etiqueta→campo dentro das caixas. */
export function Row({ label, children, w = 'w-[120px]' }: { label: string; children: ReactNode; w?: string }) {
  return (
    // `py-2` (era 5px): com cinco píxeis de folga, duas linhas seguidas ficam
    // praticamente encostadas — as caixas dos campos tocam-se e o formulário
    // lê-se como um bloco único em vez de uma lista de campos. O que separa
    // campos num formulário é o ESPAÇO entre eles, não uma linha a dividi-los.
    // `py-[3px]` (era `py-2`): a folga de 8px em cima e em baixo de CADA linha
    // deixava caber sete campos onde cabem quinze. Num formulário de ERP, rolar
    // para ver o campo seguinte é o custo que se paga o dia inteiro; o ar entre
    // campos é um luxo de ecrã de marketing.
    //
    // A etiqueta pode encolher e quebrar (`shrink`, sem `whitespace-nowrap`):
    // foi por não poder que duas etiquetas se escreveram uma por cima da outra
    // numa janela estreita — ver o mesmo cuidado no `Field` aqui ao lado.
    <label className="flex items-center gap-2 text-[11.5px] py-[3px] min-w-0">
      <span className={`text-[#6B7280] ${w.replace('w-[', 'min-w-[')} shrink`}>{label}</span>
      {children}
    </label>
  );
}

// Canto vivo e 2px de folga vertical: é o campo de um ERP, não o de um
// formulário de site. O contorno continua a ser `#D0D5DD` (TOKENS.field) — mais
// escuro do que as divisórias de propósito, porque uma divisória deve
// desaparecer e um campo tem de se ver.
export const inputCls = 'border border-[#D0D5DD] px-1.5 py-[2px] text-[11.5px] bg-white flex-1 min-w-0 '
  + 'rounded-none outline-none focus:border-[#2563EB] transition-colors';
// Sombra interior discreta (substitui o "afundado" 3D de antes) — aplicada
// inline (style={inputStyle}) para continuar a ganhar da regra global em
// index.css em todos os formulários que já a usam.
// O campo deixou de ser "afundado". A sombra interior era o que o fazia parecer
// entalhado na janela; num formulário moderno o campo é uma superfície branca
// com um contorno leve, e o que o destaca é o ANEL de foco quando se escreve
// nele — ver `focus:border` acima e SHADOW.ring.
export const inputStyle = {};

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[12px] py-[3px] cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      {label}
    </label>
  );
}

/**
 * CAIXA DE GRELHA — o "visto" de uma coluna é sempre uma CAIXA, nunca um símbolo.
 *
 * Com `onChange`, clicar grava logo no servidor (a caixa comanda mesmo alguma coisa).
 * Sem `onChange`, fica desativada: o valor é verdadeiro, mas não é o cliente que o
 * decide — como o "Licenciado" (vem da licença assinada) ou uma linha de histórico
 * (é passado; não se reescreve). Verde em ambos os casos, apagada quando é só leitura.
 */
export function GridCheck({ checked, onChange, title }: {
  checked: boolean; onChange?: (v: boolean) => void; title?: string;
}) {
  return (
    <input type="checkbox" checked={!!checked} disabled={!onChange}
      title={title || (onChange ? 'Ligar/desligar' : 'Só de leitura')}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange?.(e.target.checked)}
      className="w-4 h-4 align-middle" />
  );
}
