import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { ClipboardList, Plus, Check, X, Send, FileText, Scale } from 'lucide-react';
import {
  useRequisitions, useCreateRequisition, useReqAction, useCreateRfq,
  useRfqs, useAddQuote, useComparison, useConvertToPo, useSuppliersList, useUomsList,
} from '../../hooks/useProcurementFlow';
import { useMdItems } from '../../hooks/useMasterData';

const RST: Record<string, string> = { DRAFT: 'text-gray-500', SUBMITTED: 'text-[#1e3f66] font-bold', APPROVED: 'text-green-700 font-bold', REJECTED: 'text-red-600' };
const money = (v: any) => Number(v || 0).toFixed(2);

export function RequisitionsView() {
  const { data: reqs = [] } = useRequisitions();
  const { data: items = [] } = useMdItems();
  const { data: uoms = [] } = useUomsList();
  const create = useCreateRequisition();
  const act = useReqAction();
  const rfq = useCreateRfq();
  const [d, setD] = useState<any>({ requester: '', item: '', quantity: '', uom: '' });

  const add = () => {
    if (!d.item || !d.quantity) { alert('Escolha artigo e quantidade.'); return; }
    const uom = d.uom || uoms[0]?.id;
    create.mutate({ requester: d.requester, lines: [{ item: Number(d.item), quantity: d.quantity, uom: Number(uom) }] },
      { onSuccess: () => setD({ requester: '', item: '', quantity: '', uom: '' }), onError: (e: any) => alert(JSON.stringify(e?.response?.data)) });
  };

  return (
    <ClassicWindow title="Requisições de Compra (com aprovação)" icon={<ClipboardList size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{reqs.length} requisição(ões) · Rascunho → Submeter → Aprovar → gerar RFQ</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Requisitante" value={d.requester} onChange={(e) => setD({ ...d, requester: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
          <select value={d.item} onChange={(e) => setD({ ...d, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— artigo —</option>{items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
          </select>
          <input placeholder="Qtd" type="number" value={d.quantity} onChange={(e) => setD({ ...d, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <select value={d.uom} onChange={(e) => setD({ ...d, uom: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— un —</option>{uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Nova Requisição" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={reqs} columns={[
            { header: 'Número', accessor: 'number', width: '14%' },
            { header: 'Requisitante', accessor: (r: any) => r.requester || '—', width: '16%' },
            { header: 'Artigos', accessor: (r: any) => (r.lines || []).map((l: any) => `${Number(l.quantity).toFixed(0)}× ${l.item_name}`).join(', '), width: '30%' },
            { header: 'Estado', accessor: (r: any) => <span className={RST[r.status] || ''}>{r.status_display}</span>, width: '14%' },
            { header: 'Ações', accessor: (r: any) => (
              <div className="flex gap-2">
                {r.status === 'DRAFT' && <button title="Submeter" onClick={() => act.mutate({ id: r.id, act: 'submit' })} className="text-[#1e3f66]"><Send size={13} /></button>}
                {r.status === 'SUBMITTED' && <button title="Aprovar" onClick={() => act.mutate({ id: r.id, act: 'approve' })} className="text-green-700"><Check size={14} /></button>}
                {r.status === 'SUBMITTED' && <button title="Rejeitar" onClick={() => act.mutate({ id: r.id, act: 'reject' })} className="text-red-600"><X size={14} /></button>}
                {r.status === 'APPROVED' && <button title="Gerar RFQ" onClick={() => rfq.mutate(r.id, { onSuccess: (x: any) => alert('RFQ criada: ' + x.number) })} className="text-[#b06a00] font-bold text-[11px] flex items-center gap-1"><FileText size={12} />RFQ</button>}
              </div>), width: '26%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function RfqComparisonView() {
  const { data: rfqs = [] } = useRfqs();
  const { data: suppliers = [] } = useSuppliersList();
  const [sel, setSel] = useState<number | undefined>();
  const rfq = rfqs.find((r: any) => r.id === sel) || rfqs[0];
  const { data: comp } = useComparison(rfq?.id);
  const addQuote = useAddQuote();
  const convert = useConvertToPo();
  const [sup, setSup] = useState('');

  const quoteBySupplier: Record<string, number> = {};
  (comp?.quote_totals || []).forEach((q: any) => { quoteBySupplier[q.supplier] = q.quote; });

  return (
    <ClassicWindow title="RFQ · Cotações · Comparação → Ordem de Compra" icon={<Scale size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Preços vêm do catálogo do fornecedor · escolha a melhor proposta e gere a OC</div>}>
      <div className="flex h-full">
        <div className="w-56 border-r border-[#a0a0a0] overflow-auto">
          <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-2 py-1.5 font-bold text-[11px] text-[#1e3f66]">RFQs</div>
          {rfqs.map((r: any) => (
            <div key={r.id} onClick={() => setSel(r.id)} className={`px-3 py-2 text-[12px] cursor-pointer border-b border-[#e0e0e0] ${rfq?.id === r.id ? 'bg-[#cce8ff]' : 'hover:bg-[#f5f5f5]'}`}>
              <b>{r.number}</b><br /><span className="text-gray-500 text-[10px]">{r.status_display} · {r.quote_count || 0} cotações</span>
            </div>
          ))}
          {rfqs.length === 0 && <div className="p-3 text-gray-400 text-[11px]">Sem RFQs. Gere uma a partir de uma requisição aprovada.</div>}
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
            <span className="font-bold text-[#1e3f66]">{rfq ? `Comparação · ${rfq.number}` : 'Selecione uma RFQ'}</span>
            {rfq && <>
              <select value={sup} onChange={(e) => setSup(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white ml-auto">
                <option value="">— fornecedor —</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.commercial_name}</option>)}
              </select>
              <ClassicButton icon={Plus} label="Pedir cotação" onClick={() => { if (sup) addQuote.mutate({ rfq: rfq.id, supplier: Number(sup) }, { onSuccess: () => setSup('') }); }} />
            </>}
          </div>
          <div className="flex-1 overflow-auto p-2">
            {comp?.rows?.length ? (
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-[#e8eef5] text-[#1e3f66]"><th className="text-left p-1 border border-[#c0c0c0]">Artigo</th><th className="p-1 border border-[#c0c0c0]">Qtd</th>
                  {(comp.quote_totals || []).map((q: any) => <th key={q.quote} className="p-1 border border-[#c0c0c0]">{q.supplier}</th>)}
                  <th className="p-1 border border-[#c0c0c0]">Melhor</th></tr></thead>
                <tbody>
                  {comp.rows.map((row: any) => (
                    <tr key={row.item}>
                      <td className="p-1 border border-[#e0e0e0]">{row.item_name}</td>
                      <td className="p-1 border border-[#e0e0e0] text-center">{Number(row.quantity).toFixed(0)}</td>
                      {(comp.quote_totals || []).map((q: any) => {
                        const off = row.offers.find((o: any) => o.supplier === q.supplier);
                        const isBest = off && row.best_supplier === q.supplier;
                        return <td key={q.quote} className={`p-1 border border-[#e0e0e0] text-right ${isBest ? 'bg-[#d4f5d4] font-bold text-green-800' : ''}`}>{off ? money(off.unit_price) : '—'}</td>;
                      })}
                      <td className="p-1 border border-[#e0e0e0] text-center font-bold">{row.best_supplier || '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#f5f5f5] font-bold"><td className="p-1 border border-[#c0c0c0]" colSpan={2}>Total</td>
                    {(comp.quote_totals || []).map((q: any) => <td key={q.quote} className="p-1 border border-[#c0c0c0] text-right">{money(q.total)}</td>)}
                    <td className="p-1 border border-[#c0c0c0]" /></tr>
                </tbody>
              </table>
            ) : <div className="text-gray-400 text-sm p-4">{rfq ? 'Ainda sem cotações. Peça cotações a fornecedores acima.' : ''}</div>}

            {comp?.quote_totals?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {comp.quote_totals.map((q: any) => (
                  <button key={q.quote} onClick={() => convert.mutate(q.quote, { onSuccess: (po: any) => alert('Ordem de Compra gerada: ' + po.po_number + ' · total ' + money(po.total_amount)) })}
                    className="px-3 py-1.5 bg-[#1e3f66] text-white rounded text-[11px] font-bold hover:bg-[#274d7a]">Gerar OC de {q.supplier} ({money(q.total)})</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
