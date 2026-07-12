import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import GridToggle from '../ui/GridToggle';
import { CreditCard, Plus, Trash2, Save } from 'lucide-react';
import { useMdPaymentMethods, useMdCreatePaymentMethod, useMdDeletePaymentMethod } from '../../hooks/useMasterData';
import type { MdPaymentMethod } from '../../api/masterdata';

const TYPES: { v: string; l: string }[] = [
  { v: 'CASH', l: 'Dinheiro' }, { v: 'CARD', l: 'Cartão' }, { v: 'ROOM', l: 'Conta Quarto' },
  { v: 'COMPANY', l: 'Conta Empresa' }, { v: 'VOUCHER', l: 'Voucher' }, { v: 'GIFTCARD', l: 'Gift Card' },
  { v: 'CREDIT', l: 'Crédito Cliente' }, { v: 'MIXED', l: 'Misto' }, { v: 'OTHER', l: 'Outro' },
];
const typeLabel = (v: string) => TYPES.find((t) => t.v === v)?.l || v;
const inputCls = 'flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white';

export default function PaymentMethodsView() {
  const { data: methods = [] } = useMdPaymentMethods();
  const create = useMdCreatePaymentMethod();
  const del = useMdDeletePaymentMethod();
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [form, setForm] = useState<Partial<MdPaymentMethod>>({});

  const openNew = () => {
    setForm({ method_type: 'CASH', currency: 'AOA', allows_change: true, allows_refund: true, allows_partial: true, allows_mixed: true, is_active: true, sort_order: 0 });
    setMode('edit');
  };
  const save = () => create.mutate(form, { onSuccess: () => setMode('list') });

  if (mode === 'edit') {
    const chk = (k: keyof MdPaymentMethod, label: string) => (
      <label className="flex items-center space-x-2"><input type="checkbox" checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} className="w-3 h-3" /><span>{label}</span></label>
    );
    return (
      <ClassicWindow title="Novo Método de Pagamento" icon={<CreditCard size={14} className="text-gray-300" />}
        footer={<><ClassicButton icon={Save} label="Gravar" onClick={save} /><ClassicButton label="Cancelar" onClick={() => setMode('list')} /></>}>
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto text-[11px]">
          <div className="border border-[#a0a0a0] bg-white p-2 max-w-2xl">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Método de Pagamento (Master Data)</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex items-center"><label className="w-28 font-bold">Código *</label><input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inputCls} /></div>
              <div className="flex items-center"><label className="w-28 font-bold">Nome *</label><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
              <div className="flex items-center"><label className="w-28 font-bold">Tipo</label>
                <select value={form.method_type} onChange={(e) => setForm({ ...form, method_type: e.target.value })} className={inputCls}>
                  {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select></div>
              <div className="flex items-center"><label className="w-28 font-bold">Moeda</label><input value={form.currency || ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls} /></div>
              <div className="flex items-center"><label className="w-28 font-bold">Taxa/Comissão %</label><input type="number" value={form.fee_percentage ?? 0} onChange={(e) => setForm({ ...form, fee_percentage: e.target.value })} className="w-24 border border-[#a0a0a0] p-1" /></div>
              <div className="flex items-center"><label className="w-28 font-bold">Ordem</label><input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="w-24 border border-[#a0a0a0] p-1" /></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3 border-t border-[#e0e0e0] pt-2">
              {chk('allows_change', 'Permite troco')}
              {chk('allows_refund', 'Permite estorno')}
              {chk('allows_partial', 'Pagamento parcial')}
              {chk('allows_mixed', 'Pagamento misto')}
              {chk('allows_multicurrency', 'Multimoeda')}
              {chk('is_active', 'Ativo')}
            </div>
          </div>
        </div>
      </ClassicWindow>
    );
  }

  return (
    <ClassicWindow title="Métodos de Pagamento (Master Data)" icon={<CreditCard size={14} className="text-gray-300" />}
      footer={<><ClassicButton icon={Plus} label="Novo Método" onClick={openNew} /><div className="text-gray-600">Nº registos: {methods.length}</div></>}>
      <ClassicGrid
        rowKey="id"
        data={methods}
        columns={[
          { header: 'Código', accessor: 'code', width: '12%' },
          { header: 'Nome', accessor: 'name', width: '26%' },
          { header: 'Tipo', accessor: (r: MdPaymentMethod) => typeLabel(r.method_type), width: '18%' },
          { header: 'Moeda', accessor: 'currency', width: '10%' },
          { header: 'Troco', width: '9%',
            accessor: (r: MdPaymentMethod) => <GridToggle endpoint="mdm/payment-methods" id={r.id} field="allows_change"
              value={!!r.allows_change} invalidate="masterdata"
              title="Dá troco — o dinheiro dá; o cartão e a transferência não (o POS recusa cobrar a mais)" /> },
          { header: 'Estorno', width: '9%',
            accessor: (r: MdPaymentMethod) => <GridToggle endpoint="mdm/payment-methods" id={r.id} field="allows_refund"
              value={!!r.allows_refund} invalidate="masterdata" title="Permite devolver dinheiro por este meio" /> },
          { header: 'Ativo', width: '8%',
            accessor: (r: MdPaymentMethod) => <GridToggle endpoint="mdm/payment-methods" id={r.id} field="is_active"
              value={!!r.is_active} invalidate="masterdata" title="Desligar tira este meio de pagamento do POS" /> },
          { header: '', accessor: (r: MdPaymentMethod) => <button onClick={() => del.mutate(r.id!)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
        ]}
      />
    </ClassicWindow>
  );
}
