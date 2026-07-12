import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Activity, TrendingUp, ShoppingBag, Users, Table2, Coins } from 'lucide-react';
import { useOutlets, usePosSummary } from '../../hooks/usePosMgmt';

const money = (v: any) => Number(v || 0).toFixed(2);

function KPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-[#c0c0c0] shadow-[inset_1px_1px_0_#fff] p-3 flex items-center gap-3 min-w-[170px]">
      <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: color }}><Icon size={20} className="text-white" /></div>
      <div><div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div><div className="text-lg font-bold text-[#1e3f66]">{value}</div></div>
    </div>
  );
}

export default function PosSupervisionView() {
  const { data: outlets = [] } = useOutlets();
  const [outlet, setOutlet] = useState<number | undefined>();
  const { data: s } = usePosSummary(outlet);

  return (
    <ClassicWindow title="Supervisão POS — Vendas & Mesas (tempo real)" icon={<Activity size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Atualiza automaticamente · {s?.date} · caixa {s?.cash_open ? 'ABERTO' : 'fechado'}{s?.cash_open ? ` (esperado ${money(s?.cash_expected)})` : ''}</div>}>
      <div className="flex flex-col h-full bg-[#ececec]">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Outlet:</label>
          <select value={outlet || ''} onChange={(e) => setOutlet(e.target.value ? Number(e.target.value) : undefined)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Todos</option>{outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 p-3">
          <KPI icon={TrendingUp} label="Vendas do dia" value={money(s?.sales_total)} color="#2e7d32" />
          <KPI icon={ShoppingBag} label="Nº vendas" value={String(s?.sales_count ?? 0)} color="#1565c0" />
          <KPI icon={Coins} label="Ticket médio" value={money(s?.avg_ticket)} color="#b5651d" />
          <KPI icon={Table2} label="Mesas ocupadas" value={String(s?.occupied_tables ?? 0)} color="#c0621d" />
          <KPI icon={Users} label="Contas abertas" value={String(s?.open_tickets ?? 0)} color="#6a1b9a" />
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 px-3 pb-3 overflow-hidden">
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] font-bold text-[#1e3f66] mb-1">Desempenho por operador</div>
            <div className="flex-1 overflow-hidden">
              <ClassicGrid rowKey="operator" data={s?.by_operator || []} columns={[
                { header: 'Operador', accessor: 'operator', width: '40%' },
                { header: 'Vendas', accessor: (r: any) => money(r.sales), width: '25%' },
                { header: 'Tickets', accessor: 'tickets', width: '17%' },
                { header: 'Abertas', accessor: 'open', width: '18%' },
              ]} />
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="text-[11px] font-bold text-[#1e3f66] mb-1">Produtos mais vendidos (hoje)</div>
            <div className="flex-1 overflow-hidden">
              <ClassicGrid rowKey="name" data={s?.top_products || []} columns={[
                { header: 'Produto', accessor: 'name', width: '55%' },
                { header: 'Qtd', accessor: (r: any) => Number(r.qty).toFixed(0), width: '20%' },
                { header: 'Total', accessor: (r: any) => money(r.total), width: '25%' },
              ]} />
            </div>
          </div>
          <div className="col-span-2 flex flex-col min-h-0" style={{ maxHeight: 180 }}>
            <div className="text-[11px] font-bold text-[#1e3f66] mb-1">Contas abertas agora (por funcionário)</div>
            <div className="flex-1 overflow-hidden">
              <ClassicGrid rowKey="ticket_number" data={s?.open_ticket_list || []} columns={[
                { header: 'Conta', accessor: 'ticket_number', width: '25%' },
                { header: 'Operador', accessor: 'operator', width: '30%' },
                { header: 'Mesa', accessor: (r: any) => r.table || '—', width: '15%' },
                { header: 'Total', accessor: (r: any) => money(r.total), width: '15%' },
                { header: 'Aberta', accessor: (r: any) => new Date(r.opened_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }), width: '15%' },
              ]} />
            </div>
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
