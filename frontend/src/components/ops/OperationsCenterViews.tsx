import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import {
  Radar, Table2, ChefHat, Coins, BedDouble, Boxes, AlertTriangle, TrendingUp, Clock,
} from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Panel({ title, icon: Icon, color, children }: any) {
  return (
    <div className="bg-white border border-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">
      <div className="flex items-center gap-2 px-3 py-1.5 text-white text-[12px] font-bold" style={{ background: color }}>
        <Icon size={15} />{title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
function Stat({ label, value, tone = '#1e3f66' }: any) {
  return <div className="flex flex-col"><span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span><span className="text-2xl font-bold" style={{ color: tone }}>{value}</span></div>;
}

// ======================= PAINEL DO PROPRIETÁRIO =======================
export function OperationsCenterView() {
  const { data: d } = useQuery({ queryKey: ['ops-center'], queryFn: async () => (await apiClient.get('ops/center/')).data, refetchInterval: 12000 });
  const t = d?.tables || {}, s = d?.sales || {}, k = d?.kitchen || {}, h = d?.hotel || {}, st = d?.stock || {}, cash = d?.cash || {};
  const alerts = d?.alerts || [];
  return (
    <ClassicWindow title="Centro de Operações — Painel do Proprietário" icon={<Radar size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Torre de controlo em tempo real · atualiza automaticamente · {d?.time} de {d?.date}</div>}>
      <div className="p-4 bg-[#ececec] h-full overflow-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Panel title="MESAS" icon={Table2} color="#c9a400">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Ocupadas" value={t.occupied ?? 0} tone="#c0392b" />
              <Stat label="Livres" value={t.free ?? 0} tone="#1f9d55" />
              <Stat label="Reservadas" value={t.reserved ?? 0} tone="#2563c9" />
            </div>
          </Panel>

          <Panel title="COZINHA (KDS)" icon={ChefHat} color="#b5651d">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Pendentes" value={k.pending ?? 0} tone="#2563c9" />
              <Stat label="Em preparação" value={k.preparing ?? 0} tone="#c9820a" />
              <Stat label="Prontos" value={k.ready ?? 0} tone="#1f9d55" />
              <Stat label="Atrasados" value={k.delayed ?? 0} tone="#c0392b" />
            </div>
          </Panel>

          <Panel title="CAIXA / VENDAS" icon={Coins} color="#2e7d32">
            <div className="flex flex-col gap-2">
              <Stat label="Vendas hoje" value={money(s.today)} tone="#2e7d32" />
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Nº faturas" value={s.tickets ?? 0} />
                <Stat label="Ticket médio" value={money(s.avg_ticket)} />
              </div>
              <div className="text-[11px] text-gray-500">Em aberto (mesas): {money(s.open_amount)} · caixas abertas: {cash.sessions_open ?? 0}</div>
            </div>
          </Panel>

          <Panel title="HOTEL (PMS)" icon={BedDouble} color="#2980b9">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Ocupação" value={`${h.occupancy_pct ?? 0}%`} tone="#2980b9" />
              <Stat label="Ocupados" value={`${h.occupied ?? 0}/${h.rooms_total ?? 0}`} />
              <Stat label="Check-in hoje" value={h.arrivals ?? 0} tone="#1f9d55" />
              <Stat label="Check-out hoje" value={h.departures ?? 0} tone="#c0392b" />
            </div>
          </Panel>

          <Panel title="STOCK" icon={Boxes} color="#a0522d">
            <Stat label="Produtos em rutura/baixo" value={st.low_count ?? 0} tone={st.low_count ? '#c0392b' : '#1f9d55'} />
          </Panel>

          <Panel title={`ALERTAS (${d?.alerts_count ?? 0})`} icon={AlertTriangle} color="#a01818">
            <div className="space-y-1 max-h-40 overflow-auto">
              {alerts.map((a: any, i: number) => (
                <div key={i} className={`text-[12px] flex items-start gap-1.5 px-1.5 py-1 rounded ${a.level === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                  <span>{a.icon}</span><span>{a.msg}</span>
                </div>
              ))}
              {alerts.length === 0 && <div className="text-[12px] text-green-700 flex items-center gap-1"><TrendingUp size={13} />Tudo sob controlo. Sem alertas.</div>}
            </div>
          </Panel>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= MONITOR DE MESAS (live) =======================
export function LiveTablesMonitor() {
  const { data: tables = [] } = useQuery({ queryKey: ['live-tables'], queryFn: async () => (await apiClient.get('pos/tables/')).data, refetchInterval: 10000 });
  const { data: openTk = [] } = useQuery({ queryKey: ['live-open'], queryFn: async () => (await apiClient.get('pos/tickets/', { params: { status: 'OPEN' } })).data, refetchInterval: 10000 });
  const now = Date.now();
  const COLOR: Record<string, string> = { FREE: '#1f9d55', OCCUPIED: '#c0392b', RESERVED: '#2563c9', DIRTY: '#8a8f98', BLOCKED: '#6b7280', MAINTENANCE: '#6b7280' };
  const ticketOf = (t: any) => openTk.find((k: any) => k.table === t.id || (k.dest_kind === 'TABLE' && String(k.dest_ref) === String(t.id)));
  return (
    <ClassicWindow title="Monitor de Mesas — Tempo Real" icon={<Table2 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Planta em tempo real · valor consumido e tempo de permanência por mesa</div>}>
      <div className="p-4 bg-[#0e1622] h-full overflow-auto">
        <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
          {tables.map((t: any) => {
            const tk = ticketOf(t);
            const mins = tk?.opened_at ? Math.floor((now - new Date(tk.opened_at).getTime()) / 60000) : 0;
            return (
              <div key={t.id} className="rounded-lg p-2 text-white text-center shadow" style={{ background: COLOR[t.status] || '#334' }}>
                <div className="font-bold text-[15px]">{t.name || `Mesa ${t.table_number}`}</div>
                {tk ? (
                  <>
                    <div className="text-[15px] font-bold text-[#ffe08a]">{money(tk.grand_total)}</div>
                    <div className="text-[10px] opacity-90 flex items-center justify-center gap-1"><Clock size={10} />{mins}min · {tk.operator_name}</div>
                  </>
                ) : (<div className="text-[10px] opacity-90">{t.status_display}</div>)}
              </div>
            );
          })}
          {tables.length === 0 && <div className="col-span-6 text-white/50 text-center py-10">Sem mesas.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
