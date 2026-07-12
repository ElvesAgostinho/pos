import { useEffect, useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { CloudOff, Cloud, RefreshCw, Plus, Wifi, WifiOff } from 'lucide-react';
import { outbox } from '../../api/offline';
import type { OfflineTicket } from '../../api/offline';
import { posMgmtApi } from '../../api/posmgmt';
import { useOutlets } from '../../hooks/usePosMgmt';
import { useMdItems, useMdPaymentMethods } from '../../hooks/useMasterData';

const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `off-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function OfflineSyncView() {
  const { data: outlets = [] } = useOutlets();
  const { data: items = [] } = useMdItems();
  const { data: methods = [] } = useMdPaymentMethods();
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<OfflineTicket[]>(outbox.list());
  const [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState<any>({ outlet: '', operator_name: 'Offline', item: '', quantity: '1', unit_price: '', payment_method: '' });

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refresh = () => setQueue(outbox.list());

  const addOffline = () => {
    if (!draft.outlet || !draft.item || !draft.unit_price || !draft.payment_method) { alert('Preencha outlet, artigo, preço e método.'); return; }
    const item = items.find((i: any) => i.id === Number(draft.item));
    const total = Number(draft.unit_price) * Number(draft.quantity || 1);
    outbox.add({
      client_uuid: uuid(), outlet: Number(draft.outlet), operator_name: draft.operator_name || 'Offline',
      lines: [{ item: Number(draft.item), quantity: Number(draft.quantity || 1), unit_price: Number(draft.unit_price), label: item?.name }],
      payments: [{ payment_method: Number(draft.payment_method), amount: total }],
      created_at: new Date().toISOString(),
    });
    setDraft({ ...draft, item: '', unit_price: '' });
    refresh();
  };

  const syncNow = async () => {
    const pending = outbox.list();
    if (pending.length === 0) return;
    setSyncing(true);
    try {
      const res = await posMgmtApi.syncTickets(pending);
      const done = (res.synced || []).filter((r: any) => r.status !== 'failed').map((r: any) => r.client_uuid);
      outbox.removeSynced(done);
      refresh();
      alert(`Sincronizados: ${done.length} de ${pending.length}`);
    } catch {
      alert('Falha na sincronização (servidor offline?). As vendas permanecem na fila local.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ClassicWindow title="Sincronização Offline (Store-and-Forward)" icon={<CloudOff size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{queue.length} venda(s) na fila local · sincroniza de forma idempotente (sem duplicar)</div>}>
      <div className="flex flex-col h-full">
        {/* Estado de ligação */}
        <div className={`flex items-center justify-between px-3 py-2 border-b border-[#a0a0a0] text-[11px] ${online ? 'bg-[#eaf5ea]' : 'bg-[#fff3cd]'}`}>
          <span className="flex items-center font-bold">
            {online ? <Wifi size={13} className="mr-1.5 text-green-700" /> : <WifiOff size={13} className="mr-1.5 text-[#b06a00]" />}
            {online ? 'Ligado ao servidor' : 'Offline — as vendas ficam guardadas localmente'}
          </span>
          <ClassicButton icon={RefreshCw} label={syncing ? 'A sincronizar…' : 'Sincronizar agora'} onClick={syncNow} disabled={syncing || queue.length === 0} />
        </div>

        {/* Simular venda offline */}
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <span className="font-bold text-gray-600 w-full mb-[-4px]">Registar venda (fica em fila local até sincronizar):</span>
          <select value={draft.outlet} onChange={(e) => setDraft({ ...draft, outlet: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— outlet —</option>{outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={draft.item} onChange={(e) => { const it = items.find((i: any) => i.id === Number(e.target.value)); setDraft({ ...draft, item: e.target.value, unit_price: it?.sale_price || draft.unit_price }); }} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— artigo —</option>{items.map((i: any) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
          </select>
          <input placeholder="Qtd" type="number" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input placeholder="Preço" type="number" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <select value={draft.payment_method} onChange={(e) => setDraft({ ...draft, payment_method: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— pagamento —</option>{methods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Guardar offline" onClick={addOffline} />
        </div>

        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="client_uuid"
            data={queue}
            columns={[
              { header: 'Hora', accessor: (r: any) => new Date(r.created_at).toLocaleTimeString('pt-PT'), width: '15%' },
              { header: 'ID Local (client_uuid)', accessor: (r: any) => r.client_uuid.slice(0, 13) + '…', width: '25%' },
              { header: 'Operador', accessor: 'operator_name', width: '18%' },
              { header: 'Artigos', accessor: (r: any) => r.lines.map((l: any) => `${l.quantity}× ${l.label || l.item}`).join(', '), width: '27%' },
              { header: 'Total', accessor: (r: any) => r.payments.reduce((s: number, p: any) => s + Number(p.amount), 0).toFixed(2), width: '15%' },
            ]}
          />
          {queue.length === 0 && <div className="text-center text-gray-400 py-8 text-[12px]"><Cloud size={20} className="mx-auto mb-2" />Fila local vazia — tudo sincronizado.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
