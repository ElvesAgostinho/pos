import type { ReactNode } from 'react';
import { TOKENS } from '../../config/theme';
import {
  Check as CheckIcon, X, Pencil, Copy, Minus, Plus, CirclePlus, Download, Printer,
  RefreshCw, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, SquareCheck, Search,
  Ban, Save, Package, BarChart3, ArrowUpToLine, LayoutGrid, Clock, Building2, Landmark,
  Users, User, Mail, PartyPopper, FolderArchive, TrendingUp, Monitor, Moon, Coins, Receipt,
  Wrench, Settings, Heart, IdCard, Phone, Star, Info, Link as LinkIcon, BedSingle as Bed,
  Handshake, CreditCard, GitBranch, Lock, Eye, TriangleAlert, Menu, Key, Unlock, Scissors,
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
};

/** Renderiza o ícone certo para um glifo conhecido; sem mapa, mostra o texto
    original (nunca esconde um ícone só porque ainda não entrou no mapa). */
export function Glyph({ icon, size = 15 }: { icon: string; size?: number }) {
  const Cmp = ICON_MAP[icon];
  return Cmp ? <Cmp size={size} strokeWidth={2.3} /> : <>{icon}</>;
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
      <span className={`text-[#333] ${wide ? 'whitespace-nowrap' : 'w-[74px]'} flex-shrink-0`}>{label}</span>
      {children}
    </label>
  );
}

export function Sel({ value, onChange, options, all, allLabel = '(Todos)' }:
  { value: any; onChange: (v: string) => void; options: { value: any; label: string }[]; all?: boolean; allLabel?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white min-w-[170px] flex-1"
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
    <div className="flex items-center gap-0.5 px-2 py-1 border-t flex-shrink-0" style={{ background: TOKENS.toolbarBg, borderColor: TOKENS.line }}>
      {actions.map((a, i) => (
        <div key={a.label} className="flex items-center">
          <button onClick={a.onClick} disabled={a.disabled}
            className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#333] disabled:opacity-35 disabled:cursor-default border border-transparent hover:border-[#adc6e0] hover:bg-[#e6f0fa] rounded-[2px]">
            <span className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
              style={{ color: a.disabled ? '#aaa' : a.color }}><Glyph icon={a.icon} size={15} /></span>
            {a.label}
          </button>
          {i < actions.length - 1 && <span className="w-px h-5 bg-[#d5d5d5]" />}
        </div>
      ))}
      <div className="ml-auto">{right}</div>
    </div>
  );
}

/** Separador (aba) do editor de artigo. */
export function Tab({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-[13px] font-semibold border-b-[3px] ${active ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
      {children}
    </button>
  );
}

/** Caixa com título (o "group box" clássico do Windows) — rebordo em relevo
    (`groove`), o mesmo efeito 3D que os diálogos do Windows 98/XP sempre
    tiveram e que a maioria das recriações "estilo clássico" nunca se dá ao
    trabalho de reproduzir. É um detalhe pequeno, mas é o que faz a diferença
    entre "parece antigo" e "parece a sério". */
export function Box({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`px-3 pb-3 pt-1 min-w-0 overflow-hidden ${className}`}
      style={{ border: `3px groove ${TOKENS.line}` }}>
      {title && <legend className="px-1.5 text-[12px] font-semibold" style={{ color: TOKENS.textOnLight }}>{title}</legend>}
      {children}
    </fieldset>
  );
}

/** Linha etiqueta→campo dentro das caixas. */
export function Row({ label, children, w = 'w-[120px]' }: { label: string; children: ReactNode; w?: string }) {
  return (
    <label className="flex items-center gap-2 text-[12px] py-[3px] min-w-0">
      <span className={`text-[#333] ${w} flex-shrink-0`}>{label}</span>
      {children}
    </label>
  );
}

export const inputCls = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white flex-1 min-w-0';
export const inputStyle = { boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.10)' };

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
