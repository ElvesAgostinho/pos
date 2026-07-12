import type { ReactNode } from 'react';

/**
 * FORMULÁRIOS ENTERPRISE — o padrão de todos os formulários do sistema.
 *
 * Regras (é isto que distingue um formulário sério de uma caixa de texto solta):
 *   · cada campo tem ETIQUETA visível (nunca só um placeholder — o placeholder
 *     desaparece quando se escreve, e o utilizador fica sem saber o que preencheu);
 *   · os campos obrigatórios estão MARCADOS, e diz-se PORQUÊ quando faz falta;
 *   · os campos agrupam-se em SECÇÕES com título — não uma parede de inputs;
 *   · o aspeto é pesado/clássico (campo afundado, etiqueta à esquerda), não SaaS.
 */

export function FormSection({ title, hint, children, cols = 2 }:
  { title: string; hint?: string; children: ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div className="bg-white border border-[#9aa6b6] mb-3" style={{ boxShadow: 'inset 0 1px 0 #fff, 0 1px 3px rgba(0,0,0,0.10)' }}>
      <div className="px-3 py-1.5 border-b border-[#c0c7d0] text-[12px] font-bold text-[#25405e]"
        style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>
        {title}
        {hint && <span className="ml-2 font-normal text-[11px] text-gray-500">{hint}</span>}
      </div>
      <div className={`p-3 grid gap-x-4 gap-y-2 ${cols === 1 ? '' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {children}
      </div>
    </div>
  );
}

const inputCls = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white w-full outline-none focus:border-[#2f5f92]';
const inputStyle = { boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.12)' };

interface FieldProps {
  label: string;
  value: any;
  onChange: (v: any) => void;
  required?: boolean;
  help?: string;          // porque é que este campo importa
  type?: string;
  options?: { value: any; label: string }[];
  span?: boolean;         // ocupa a linha inteira
  disabled?: boolean;
}

export function Field({ label, value, onChange, required, help, type = 'text', options, span, disabled }: FieldProps) {
  const empty = value === null || value === undefined || value === '';
  const missing = required && empty;
  return (
    <label className={`flex flex-col gap-0.5 ${span ? 'col-span-full' : ''}`}>
      <span className="text-[11px] font-bold text-gray-700">
        {label}{required && <span className="text-[#a01818] ml-0.5">*</span>}
      </span>
      {options ? (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          className={inputCls} style={{ ...inputStyle, borderColor: missing ? '#c07a7a' : undefined }}>
          <option value="">— escolher —</option>
          {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled}
          className="w-4 h-4 mt-1" />
      ) : (
        <input type={type} value={value ?? ''} onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
          disabled={disabled} className={inputCls}
          style={{ ...inputStyle, borderColor: missing ? '#c07a7a' : undefined, background: disabled ? '#eef0f2' : '#fff' }} />
      )}
      {/* Só se diz o que falta QUANDO falta — nunca uma parede de avisos. */}
      {missing && help && <span className="text-[10px] text-[#a01818]">{help}</span>}
      {!missing && help && <span className="text-[10px] text-gray-500">{help}</span>}
    </label>
  );
}

export const btnPrimary = {
  className: 'px-4 py-1.5 text-[12px] font-bold text-white border border-[#16304a]',
  style: { background: 'linear-gradient(to bottom, #2f5f92, #1e3f66)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' },
};
export const btnNormal = {
  className: 'px-3 py-1.5 text-[12px] font-semibold border border-[#7f8b9b] text-[#2a3543]',
  style: {
    background: 'linear-gradient(to bottom, #fdfdfd, #eceef1 48%, #dde1e6 52%, #cfd4da)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.18)',
  },
};
