import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { FileText, Plus, Check, DollarSign, Trash2 } from 'lucide-react';
import { useInvoices, useCreateInvoice, useIssueInvoice, useMarkInvoicePaid } from '../../hooks/useFinance';

const ST: Record<string, string> = { DRAFT: 'text-gray-500', ISSUED: 'text-[#1e3f66] font-bold', PAID: 'text-green-700 font-bold', CANCELLED: 'text-red-600' };
const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = () => ({ description: '', quantity: '1', unit_price: '', tax_percentage: '14' });

export default function InvoicesView() {
  const { data: invoices = [] } = useInvoices();
  const create = useCreateInvoice();
  const issue = useIssueInvoice();
  const markPaid = useMarkInvoicePaid();
  const [customer, setCustomer] = useState('');
  const [taxId, setTaxId] = useState('');
  const [lines, setLines] = useState<any[]>([emptyLine()]);

  const setLine = (i: number, k: string, v: string) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const preview = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 + (Number(l.tax_percentage) || 0) / 100), 0);

  const add = () => {
    const valid = lines.filter((l) => l.description && l.unit_price);
    if (!customer || valid.length === 0) { alert('Preencha cliente e pelo menos uma linha.'); return; }
    create.mutate({ customer_name: customer, customer_tax_id: taxId, date: today(),
      lines: valid.map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unit_price: Number(l.unit_price), tax_percentage: Number(l.tax_percentage) || 0 })) },
      { onSuccess: () => { setCustomer(''); setTaxId(''); setLines([emptyLine()]); } });
  };

  return (
    <ClassicWindow title="Faturação (Financeiro / AR)" icon={<FileText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{invoices.length} fatura(s) · emitir fixa a numeração; marcar paga liquida</div>}>
      <div className="flex flex-col h-full">
        <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px] space-y-1">
          <div className="flex flex-wrap items-end gap-2">
            <input placeholder="Cliente" value={customer} onChange={(e) => setCustomer(e.target.value)} className="border border-[#a0a0a0] p-1" />
            <input placeholder="NIF" value={taxId} onChange={(e) => setTaxId(e.target.value)} className="border border-[#a0a0a0] p-1 w-28" />
            <span className="font-bold text-gray-700">Total c/ IVA: {preview.toFixed(2)}</span>
            <ClassicButton icon={Plus} label="Criar Fatura (rascunho)" onClick={add} />
            <button onClick={() => setLines([...lines, emptyLine()])} className="text-[#1e3f66] underline">+ linha</button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-1">
              <input placeholder="Descrição" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} className="border border-[#a0a0a0] p-1 flex-1" />
              <input placeholder="Qtd" type="number" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} className="border border-[#a0a0a0] p-1 w-16" />
              <input placeholder="Preço" type="number" value={l.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} className="border border-[#a0a0a0] p-1 w-24" />
              <input placeholder="IVA%" type="number" value={l.tax_percentage} onChange={(e) => setLine(i, 'tax_percentage', e.target.value)} className="border border-[#a0a0a0] p-1 w-16" />
              {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-red-600"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={invoices}
            columns={[
              { header: 'Nº', accessor: 'number', width: '14%' },
              { header: 'Cliente', accessor: 'customer_name', width: '26%' },
              { header: 'Data', accessor: 'date', width: '12%' },
              { header: 'Base', accessor: (r: any) => Number(r.subtotal).toFixed(2), width: '12%' },
              { header: 'Total', accessor: (r: any) => Number(r.total).toFixed(2), width: '12%' },
              { header: 'Estado', accessor: (r: any) => <span className={ST[r.status] || ''}>{r.status_display}</span>, width: '12%' },
              { header: 'Ações', accessor: (r: any) => (
                <div className="flex gap-2">
                  {r.status === 'DRAFT' && <button title="Emitir" onClick={() => issue.mutate(r.id)} className="text-[#1e3f66] hover:text-[#16304a]"><Check size={13} /></button>}
                  {r.status === 'ISSUED' && <button title="Marcar paga" onClick={() => markPaid.mutate(r.id)} className="text-green-700 hover:text-green-900"><DollarSign size={13} /></button>}
                </div>), width: '12%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
