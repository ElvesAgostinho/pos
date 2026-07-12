import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { TrendingUp, Percent, Boxes, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Landmark, BedDouble } from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Card({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-white border border-[#c0c0c0] shadow-[inset_1px_1px_0_#fff] p-3 flex items-center gap-3 min-w-[190px]">
      <div className="w-11 h-11 rounded flex items-center justify-center flex-shrink-0" style={{ background: color }}><Icon size={22} className="text-white" /></div>
      <div><div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div><div className="text-xl font-bold text-[#1e3f66]">{value}</div>{sub && <div className="text-[10px] text-gray-500">{sub}</div>}</div>
    </div>
  );
}

export default function ManagementDashboard() {
  const { data: d } = useQuery({ queryKey: ['mgmt-dash'], queryFn: async () => (await apiClient.get('reports/dashboard/')).data, refetchInterval: 20000 });
  const pos = d?.pos || {}, stock = d?.stock || {}, fin = d?.finance || {}, pms = d?.pms || {};
  const marginPct = pos.sales > 0 ? (Number(pos.margin) / Number(pos.sales) * 100).toFixed(1) : '0';

  return (
    <ClassicWindow title="Dashboard de Gestão (Reporting)" icon={<TrendingUp size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Atualiza automaticamente · {d?.date} · visão consolidada de vendas, margem, stock, financeiro e ocupação</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Vendas & Margem (hoje)</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={TrendingUp} label="Vendas do dia" value={money(pos.sales)} color="#2e7d32" sub={`${pos.count || 0} vendas · ticket médio ${money(pos.avg_ticket)}`} />
            <Card icon={Percent} label="Margem (preço − custo)" value={money(pos.margin)} color="#1565c0" sub={`${marginPct}% · custo ${money(pos.cost)}`} />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Stock</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={Boxes} label="Valor do stock" value={money(stock.value)} color="#b5651d" />
            <Card icon={AlertTriangle} label="Artigos em rutura/baixo" value={String(stock.low_count ?? 0)} color="#c0392b" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Financeiro</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={ArrowUpCircle} label="Contas a Receber" value={money(fin.receivable)} color="#16a085" />
            <Card icon={ArrowDownCircle} label="Contas a Pagar" value={money(fin.payable)} color="#a01818" />
            <Card icon={Landmark} label="Tesouraria (saldo)" value={money(fin.treasury)} color="#2c3e50" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Hotelaria (PMS)</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={BedDouble} label="Ocupação" value={`${pms.occupancy_pct ?? 0}%`} color="#2980b9" sub={`${pms.occupied ?? 0} / ${pms.rooms ?? 0} quartos`} />
          </div>
        </div>
        {pos.top_products?.length ? (
          <div>
            <div className="text-[11px] font-bold text-[#1e3f66] mb-1 uppercase">Mais vendidos (hoje)</div>
            <div className="bg-white border border-[#c0c0c0] max-w-md">
              {pos.top_products.map((p: any) => (
                <div key={p.name} className="flex justify-between px-3 py-1.5 text-[12px] border-b border-[#eee]"><span>{p.name}</span><span className="font-bold">{Number(p.qty).toFixed(0)}</span></div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ClassicWindow>
  );
}
