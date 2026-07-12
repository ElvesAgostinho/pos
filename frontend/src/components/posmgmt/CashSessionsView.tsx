import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Banknote, Plus, ArrowLeft, Lock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useCashSessions, useOpenCashSession, useAddCashMovement, useCloseCashSession, useOutlets } from '../../hooks/usePosMgmt';
import { MOVEMENT_TYPES } from '../../api/posmgmt';
import type { CashSession } from '../../api/posmgmt';

const fmt = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2 }));

function SessionDetail({ session, onBack }: { session: CashSession; onBack: () => void }) {
  const { data: sessions = [] } = useCashSessions();
  const fresh = sessions.find((s) => s.id === session.id) || session;
  const addMov = useAddCashMovement();
  const close = useCloseCashSession();
  const [mov, setMov] = useState<any>({ movement_type: 'REFORCO', amount: '', reason: '' });
  const [counted, setCounted] = useState('');
  const closed = fresh.status === 'CLOSED';

  const submitMov = () => {
    if (!mov.amount) return;
    addMov.mutate({ id: fresh.id!, data: mov }, { onSuccess: () => setMov({ movement_type: 'REFORCO', amount: '', reason: '' }) });
  };
  const doClose = () => {
    if (counted === '') { alert('Introduza a contagem física.'); return; }
    close.mutate({ id: fresh.id!, counted });
  };

  return (
    <ClassicWindow
      title={`Caixa · ${fresh.operator_name} ${closed ? '(Fechada)' : '(Aberta)'}`}
      icon={<Banknote size={14} className="text-gray-300" />}
      footer={<ClassicButton icon={ArrowLeft} label="Voltar" onClick={onBack} />}
    >
      <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto text-[11px] space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Fundo Inicial', fmt(fresh.opening_float)],
            ['Esperado em Caixa', fmt(fresh.expected_cash)],
            ['Contado', fmt(fresh.counted_amount)],
            ['Diferença', fmt(fresh.difference)],
          ].map(([l, v]) => (
            <div key={l} className="bg-white border border-[#c0c0c0] p-2">
              <div className="text-[10px] text-gray-500">{l}</div>
              <div className={`text-lg font-bold ${l === 'Diferença' && fresh.difference != null && Number(fresh.difference) !== 0 ? 'text-red-600' : 'text-[#1e3f66]'}`}>{v}</div>
            </div>
          ))}
        </div>

        {!closed && (
          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Movimentos de Caixa</h3>
            <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
              <select value={mov.movement_type} onChange={(e) => setMov({ ...mov, movement_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input placeholder="Valor" type="number" value={mov.amount} onChange={(e) => setMov({ ...mov, amount: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
              <input placeholder="Motivo" value={mov.reason} onChange={(e) => setMov({ ...mov, reason: e.target.value })} className="border border-[#a0a0a0] p-1" />
              <ClassicButton icon={Plus} label="Registar" onClick={submitMov} />
            </div>
          </div>
        )}

        <div className="border border-[#a0a0a0] bg-white p-2">
          <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Histórico</h3>
          <ClassicGrid
            rowKey="id"
            data={fresh.movements || []}
            columns={[
              { header: 'Tipo', accessor: (r: any) => (
                <span className={`flex items-center ${['REFORCO', 'ENTRADA'].includes(r.movement_type) ? 'text-green-700' : 'text-red-600'}`}>
                  {['REFORCO', 'ENTRADA'].includes(r.movement_type) ? <ArrowUpCircle size={12} className="mr-1" /> : <ArrowDownCircle size={12} className="mr-1" />}
                  {r.movement_type_display}
                </span>), width: '25%' },
              { header: 'Valor', accessor: (r: any) => fmt(r.amount), width: '20%' },
              { header: 'Motivo', accessor: (r: any) => r.reason || '—', width: '35%' },
              { header: 'Por', accessor: 'created_by', width: '20%' },
            ]}
          />
        </div>

        {!closed && (
          <div className="border border-[#a0a0a0] bg-[#fff7f7] p-3">
            <h3 className="font-bold text-red-700 mb-2">Fecho de Caixa (reconciliação)</h3>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-[10px] text-gray-600 mb-1">Contagem física (contado)</label>
                <input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} className="border border-[#a0a0a0] p-1 w-40" />
              </div>
              <ClassicButton icon={Lock} label="Fechar Caixa" onClick={doClose} />
              <span className="text-[10px] text-gray-500">Esperado: <b>{fmt(fresh.expected_cash)}</b> — a diferença é calculada ao fechar.</span>
            </div>
          </div>
        )}
        {closed && fresh.closing_notes && <div className="text-gray-600">Notas de fecho: {fresh.closing_notes}</div>}
      </div>
    </ClassicWindow>
  );
}

export default function CashSessionsView() {
  const { data: sessions = [] } = useCashSessions();
  const { data: outlets = [] } = useOutlets();
  const open = useOpenCashSession();
  const [selected, setSelected] = useState<CashSession | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [form, setForm] = useState<any>({ operator_name: '', terminal_name: '', opening_float: '', outlet: '' });

  if (selected) return <SessionDetail session={selected} onBack={() => setSelected(null)} />;

  const doOpen = () => {
    if (!form.operator_name || form.opening_float === '') { alert('Operador e fundo inicial são obrigatórios.'); return; }
    open.mutate({ ...form, outlet: form.outlet || null }, { onSuccess: () => { setShowOpen(false); setForm({ operator_name: '', terminal_name: '', opening_float: '', outlet: '' }); } });
  };

  return (
    <ClassicWindow
      title="Caixas & Sessões"
      icon={<Banknote size={14} className="text-gray-300" />}
      footer={<>
        <ClassicButton icon={Plus} label="Abrir Caixa" onClick={() => setShowOpen(true)} />
        <div className="text-gray-600">Nº sessões: {sessions.length}</div>
      </>}
    >
      <div className="flex flex-col h-full">
        {showOpen && (
          <div className="flex flex-wrap items-end gap-2 bg-[#eaf5ea] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
            <input placeholder="Operador *" value={form.operator_name} onChange={(e) => setForm({ ...form, operator_name: e.target.value })} className="border border-[#a0a0a0] p-1" />
            <input placeholder="Terminal / Caixa" value={form.terminal_name} onChange={(e) => setForm({ ...form, terminal_name: e.target.value })} className="border border-[#a0a0a0] p-1" />
            <select value={form.outlet} onChange={(e) => setForm({ ...form, outlet: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              <option value="">— outlet —</option>
              {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input placeholder="Fundo inicial *" type="number" value={form.opening_float} onChange={(e) => setForm({ ...form, opening_float: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
            <ClassicButton label="Confirmar Abertura" onClick={doOpen} />
            <ClassicButton label="Cancelar" onClick={() => setShowOpen(false)} />
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={sessions}
            onRowClick={(r) => setSelected(r)}
            columns={[
              { header: 'Operador', accessor: 'operator_name', width: '20%' },
              { header: 'Terminal', accessor: (r: any) => r.terminal_name || '—', width: '16%' },
              { header: 'Estado', accessor: (r: any) => <span className={r.status === 'OPEN' ? 'text-green-700 font-bold' : 'text-gray-500'}>{r.status_display}</span>, width: '12%' },
              { header: 'Fundo', accessor: (r: any) => fmt(r.opening_float), width: '13%' },
              { header: 'Esperado', accessor: (r: any) => fmt(r.expected_cash), width: '13%' },
              { header: 'Diferença', accessor: (r: any) => <span className={r.difference != null && Number(r.difference) !== 0 ? 'text-red-600 font-bold' : ''}>{fmt(r.difference)}</span>, width: '13%' },
              { header: 'Abertura', accessor: (r: any) => (r.opened_at ? new Date(r.opened_at).toLocaleDateString('pt-PT') : ''), width: '13%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
