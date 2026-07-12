import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Receipt, Plus, Trash2, ArrowLeft, CreditCard, ChefHat, FileText } from 'lucide-react';
import {
  useTickets, useTicket, useOpenTicket, useAddTicketLine, useDeleteTicketLine, usePayTicket,
  useOutlets, useProductConfigs, useOutletPayments, useCashSessions, useFireKitchen,
  useIssueDocument, useTicketDocuments,
} from '../../hooks/usePosMgmt';
import type { POSTicket } from '../../api/posmgmt';
import { apiClient } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';

const fmt = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

function TicketScreen({ ticketId, onBack }: { ticketId: number; onBack: () => void }) {
  const { data: ticket } = useTicket(ticketId);
  const outletId = ticket?.outlet;
  const { data: products = [] } = useProductConfigs(outletId);
  const { data: methods = [] } = useOutletPayments(outletId);
  const addLine = useAddTicketLine();
  const delLine = useDeleteTicketLine();
  const pay = usePayTicket();
  const fire = useFireKitchen();
  const issue = useIssueDocument();
  const { data: documents = [] } = useTicketDocuments(ticketId);
  const [payAmount, setPayAmount] = useState('');
  const paid = ticket?.status === 'PAID';
  const hasNewLines = (ticket?.lines || []).some((l: any) => l.kds_status === 'NEW' && l.kds_station !== 'NONE');
  const hasLines = (ticket?.lines || []).length > 0;

  const doIssue = (type: string) => {
    issue.mutate({ id: ticketId, type }, {
      onError: (e: any) => alert(e?.response?.data?.detail || 'Erro ao emitir documento.'),
    });
  };

  const doPay = (pm: number) => {
    const amount = payAmount || ticket?.balance_due || '0';
    pay.mutate({ id: ticketId, pm, amount }, { onSuccess: (r: any) => { if (r.change_returned && Number(r.change_returned) > 0) alert(`Troco: ${fmt(r.change_returned)}`); setPayAmount(''); } });
  };

  return (
    <ClassicWindow
      title={`Ticket ${ticket?.ticket_number ?? ''} · ${ticket?.outlet_name ?? ''}`}
      icon={<Receipt size={14} className="text-gray-300" />}
      footer={<>
        <div className="flex items-center gap-2">
          {!paid && hasNewLines && <ClassicButton icon={ChefHat} label="Enviar p/ Cozinha" onClick={() => fire.mutate(ticketId)} />}
          <span className="text-[11px]">Total: <b className="text-[#1e3f66] text-[13px]">{fmt(ticket?.grand_total)}</b> · Saldo: <b className={Number(ticket?.balance_due) > 0 ? 'text-red-600' : 'text-green-700'}>{fmt(ticket?.balance_due)}</b></span>
        </div>
        <ClassicButton icon={ArrowLeft} label="Voltar" onClick={onBack} />
      </>}
    >
      <div className="flex h-full">
        {/* Produtos disponíveis no POS (deste outlet) */}
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="px-3 py-1.5 bg-[#e0e0e0] border-b border-[#a0a0a0] text-[11px] font-bold text-gray-700">Produtos POS {paid ? '(ticket pago)' : ''}</div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
            {products.filter((p: any) => p.is_available).map((p: any) => (
              <button key={p.id} disabled={paid} onClick={() => addLine.mutate({ id: ticketId, line: { item: p.item, quantity: 1 } })}
                className={`border p-2 text-left text-[11px] ${paid ? 'opacity-50' : 'bg-white hover:bg-[#e6f2ff] border-[#c0c0c0] active:bg-[#cce8ff]'}`}>
                <div className="font-bold text-gray-800 truncate">{p.item_name}</div>
                <div className="text-[#1e3f66] font-bold">{fmt(p.effective_price)}</div>
              </button>
            ))}
            {products.length === 0 && <div className="text-gray-500 text-[11px] col-span-2">Sem produtos configurados neste outlet (POS Config → Produtos POS).</div>}
          </div>
        </div>

        {/* Conta */}
        <div className="w-1/2 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <ClassicGrid
              rowKey="id"
              data={ticket?.lines || []}
              columns={[
                { header: 'Artigo', accessor: 'description', width: '46%' },
                { header: 'Qtd', accessor: (r: any) => fmt(r.quantity), width: '14%' },
                { header: 'Preço', accessor: (r: any) => fmt(r.unit_price), width: '18%' },
                { header: 'Total', accessor: (r: any) => fmt(r.line_total), width: '17%' },
                { header: '', accessor: (r: any) => (!paid ? <button onClick={() => delLine.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button> : null), width: '5%' },
              ]}
            />
          </div>
          <div className="border-t border-[#a0a0a0] bg-[#f0f0f0] p-2 text-[11px]">
            <div className="flex justify-between px-1"><span>Subtotal</span><span>{fmt(ticket?.subtotal)}</span></div>
            <div className="flex justify-between px-1"><span>IVA</span><span>{fmt(ticket?.tax_total)}</span></div>
            <div className="flex justify-between px-1 font-bold text-[#1e3f66] text-[13px]"><span>TOTAL</span><span>{fmt(ticket?.grand_total)}</span></div>
          </div>

          {/* Documentos (Motor 7) */}
          <div className="border-t border-[#a0a0a0] bg-white p-2">
            <div className="flex items-center gap-1 mb-1">
              <FileText size={12} className="text-gray-500" />
              <button disabled={!hasLines} onClick={() => doIssue('PROFORMA')} className="px-2 py-1 text-[11px] border border-[#a0a0a0] bg-[#f0f0f0] hover:bg-[#e8e8e8] disabled:opacity-50">Pré-conta</button>
              <button disabled={!hasLines} onClick={() => doIssue('INVOICE')} className="px-2 py-1 text-[11px] border border-[#a0a0a0] bg-[#f0f0f0] hover:bg-[#e8e8e8] disabled:opacity-50">Fatura</button>
            </div>
            {documents.map((d: any) => (
              <div key={d.id} className="flex justify-between text-[10px] px-1">
                <span className={d.status === 'VOID' ? 'line-through text-gray-400' : ''}>{d.document_type_display}: <b>{d.full_number}</b></span>
                <span>{fmt(d.grand_total)}</span>
              </div>
            ))}
          </div>
          {!paid ? (
            <div className="border-t border-[#a0a0a0] bg-white p-2">
              <div className="flex items-center gap-2 mb-2 text-[11px]">
                <CreditCard size={13} className="text-gray-500" />
                <input placeholder={`Valor (default: saldo ${fmt(ticket?.balance_due)})`} type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="flex-1 border border-[#a0a0a0] p-1" />
              </div>
              <div className="flex flex-wrap gap-1">
                {methods.map((m: any) => (
                  <button key={m.id} onClick={() => doPay(m.payment_method)} className="px-2 py-1 bg-[#5cb85c] hover:bg-[#4cae4c] text-white text-[11px] font-bold border border-[#4a8f4a]">
                    {m.payment_method_name}
                  </button>
                ))}
                {methods.length === 0 && <span className="text-[10px] text-gray-500">Sem métodos autorizados (POS Config → Métodos por Outlet).</span>}
              </div>
            </div>
          ) : (
            <div className="border-t border-[#a0a0a0] bg-[#eaf5ea] p-2 text-center text-green-700 font-bold text-[12px]">✓ Ticket pago</div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}

export default function SalesView() {
  const qc = useQueryClient();
  const [ticketId, setTicketId] = useState<number | null>(null);
  const { data: tickets = [] } = useTickets();
  const { data: outlets = [] } = useOutlets();
  const { data: sessions = [] } = useCashSessions();
  const openTicket = useOpenTicket();
  const [form, setForm] = useState<any>({ outlet: '', operator_name: '', cash_session: '' });

  if (ticketId) return <TicketScreen ticketId={ticketId} onBack={() => setTicketId(null)} />;

  const openSessions = sessions.filter((s: any) => s.status === 'OPEN');
  const create = () => {
    if (!form.outlet || !form.operator_name) { alert('Outlet e operador são obrigatórios.'); return; }
    openTicket.mutate({ ...form, cash_session: form.cash_session || null }, { onSuccess: (t: any) => setTicketId(t.id) });
  };

  return (
    <ClassicWindow title="Vendas (POS)" icon={<Receipt size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Nº tickets: {tickets.length}</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#eaf5ea] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <select value={form.outlet} onChange={(e) => setForm({ ...form, outlet: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— outlet —</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input placeholder="Operador" value={form.operator_name} onChange={(e) => setForm({ ...form, operator_name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={form.cash_session} onChange={(e) => setForm({ ...form, cash_session: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— caixa (opcional) —</option>
            {openSessions.map((s: any) => <option key={s.id} value={s.id}>{s.operator_name} · {s.terminal_name || 'caixa'}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Abrir Ticket" onClick={create} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={tickets}
            onRowClick={(r) => setTicketId(r.id)}
            columns={[
              { header: 'Ticket', accessor: 'ticket_number', width: '20%' },
              { header: 'Outlet', accessor: 'outlet_name', width: '24%' },
              { header: 'Operador', accessor: 'operator_name', width: '18%' },
              { header: 'Estado', accessor: (r: POSTicket) => <span className={r.status === 'PAID' ? 'text-green-700 font-bold' : r.status === 'VOID' ? 'text-gray-400' : 'text-[#1e3f66] font-bold'}>{r.status_display}</span>, width: '12%' },
              { header: 'Total', accessor: (r: POSTicket) => fmt(r.grand_total), width: '12%' },
              { header: '', accessor: (r: POSTicket) => r.status === 'PAID' ? (
                <button className="text-red-600 hover:underline text-[11px]" title="Anular venda (emite Nota de Crédito)"
                  onClick={async (e) => { e.stopPropagation();
                    if (!confirm(`Anular a venda ${r.ticket_number}? Será emitida a Nota de Crédito do documento fiscal.`)) return;
                    try { const res = await apiClient.post(`pos/tickets/${r.id}/credit_note/`, { reason: 'Anulação de venda' }); alert(`Venda anulada. NC: ${res.data.credit_note || '(sem doc fiscal)'}`); qc.invalidateQueries({ queryKey: ['pos-tickets'] }); }
                    catch (err: any) { alert(err?.response?.data?.detail || 'Erro'); } }}>Anular (NC)</button>
              ) : null, width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
