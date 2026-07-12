import type { ReactNode } from 'react';

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
    { key: 'e_events', label: 'Eventos & Banquetes' },
  ] },
  { key: 'fnb', title: 'Gestão de F&B', items: [
    { key: 'g_outlets', label: 'Outlets' },
    { key: 'g_tables', label: 'Salas & Mesas' },
    { key: 'g_kds', label: 'Ecrãs de Produção (KDS)' },
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

/** Barra de ferramentas inferior — ícones redondos, como nos ERP clássicos. */
export function Toolbar({ actions, right }: { actions: any[]; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-t border-[#c0c0c0] flex-shrink-0" style={{ background: '#f4f4f4' }}>
      {actions.map((a, i) => (
        <div key={a.label} className="flex items-center">
          <button onClick={a.onClick} disabled={a.disabled}
            className="flex items-center gap-2 px-3 py-1 text-[13px] text-[#333] disabled:opacity-35 disabled:cursor-default hover:bg-[#e8e8e8]">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[15px] font-bold flex-shrink-0"
              style={{ background: a.disabled ? '#b8b8b8' : a.color }}>{a.icon}</span>
            {a.label}
          </button>
          {i < actions.length - 1 && <span className="w-px h-6 bg-[#d5d5d5]" />}
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

/** Caixa com título (o "group box" clássico do Windows). */
export function Box({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`border border-[#c8c8c8] px-3 pb-3 pt-1 min-w-0 overflow-hidden ${className}`}>
      {title && <legend className="px-1 text-[12px] font-semibold text-[#333]">{title}</legend>}
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
