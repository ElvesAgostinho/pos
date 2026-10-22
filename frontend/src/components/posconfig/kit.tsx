import type { ReactNode } from 'react';
import { TOKENS, RADIUS, SHADOW } from '../../config/theme';
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
export function Glyph({ icon, size = 15, chip, tom }: {
  icon: string; size?: number; chip?: boolean; tom?: string;
}) {
  const Cmp = ICON_MAP[icon];
  const desenho = Cmp ? <Cmp size={size} strokeWidth={1.8} /> : <>{icon}</>;
  if (!chip) return desenho;

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
export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[12px]">
      {/* `min-w` em vez de `w`: a caixa tem uma largura MÍNIMA (para as etiquetas
          curtas alinharem umas com as outras) mas cresce quando o texto é mais
          comprido, em vez de o deixar transbordar por cima do campo ao lado —
          era o que acontecia com "Sub Família:" e "Pesquisa por texto livre:". */}
      <span className={`text-[#111827] whitespace-nowrap ${wide ? '' : 'min-w-[74px]'} flex-shrink-0`}>{label}</span>
      {children}
    </label>
  );
}

export function Sel({ value, onChange, options, all, allLabel = '(Todos)' }:
  { value: any; onChange: (v: string) => void; options: { value: any; label: string }[]; all?: boolean; allLabel?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      className="border border-[#E6E8EC] px-2 py-1 text-[12px] bg-white min-w-[170px] flex-1"
      style={{ boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.10)' }}>
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
    <div className="flex items-center gap-1.5 px-3 py-2.5 border-t flex-shrink-0" style={{ background: TOKENS.toolbarBg, borderColor: TOKENS.lineSoft }}>
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title}
          className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-[#111827] disabled:opacity-35 disabled:cursor-default hover:bg-[#F3F4F6] active:bg-[#E6E8EC] transition-colors"
          style={{ borderRadius: RADIUS.sm }}>
          <span className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
            style={{ color: a.disabled ? '#3B82F6' : a.color }}><Glyph icon={a.icon} size={15} /></span>
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
    <button onClick={onClick}
      className={`px-3.5 py-1.5 text-[12px] font-medium transition-colors ${active
        ? 'bg-[#DBEAFE] text-[#1D4ED8]' : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]'}`}
      style={{ borderRadius: RADIUS.sm }}>
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
export function Box({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`p-4 min-w-0 overflow-hidden ${className}`}
      style={{
        border: `1px solid ${TOKENS.lineSoft}`,
        background: TOKENS.surface,
        borderRadius: RADIUS.md,
        boxShadow: SHADOW.soft,
      }}>
      {title && (
        <h3 className="text-[12px] font-semibold mb-3" style={{ color: TOKENS.textOnLight }}>
          {title}
        </h3>
      )}
      {children}
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
      className={`flex items-center justify-center gap-2 px-6 py-2.5 text-white font-semibold
        hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-default
        transition-[filter] ${className}`}
      style={{ background: TOKENS.brand, borderRadius: RADIUS.sm, boxShadow: SHADOW.xs }}>
      <Glyph icon={icon} size={16} />
      <span className="text-[13.5px]">{label}</span>
    </button>
  );
}

/** Linha etiqueta→campo dentro das caixas. */
export function Row({ label, children, w = 'w-[120px]' }: { label: string; children: ReactNode; w?: string }) {
  return (
    <label className="flex items-center gap-3 text-[12px] py-[5px] min-w-0">
      <span className={`text-[#6B7280] whitespace-nowrap ${w.replace('w-[', 'min-w-[')} flex-shrink-0`}>{label}</span>
      {children}
    </label>
  );
}

export const inputCls = 'border border-[#E6E8EC] px-3 py-1.5 text-[12px] bg-white flex-1 min-w-0 '
  + 'rounded-[8px] outline-none focus:border-[#2563EB] transition-colors';
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
