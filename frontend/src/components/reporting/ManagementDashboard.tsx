import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { TrendingUp, Percent, Boxes, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Landmark, BedDouble } from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Card({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="bg-white border border-[#CFE3E6] shadow-[inset_1px_1px_0_#FFFFFF] p-3 flex items-center gap-3 min-w-[190px]">
      <div className="w-11 h-11 rounded flex items-center justify-center flex-shrink-0" style={{ background: color }}><Icon size={22} className="text-white" /></div>
      <div><div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div><div className="text-xl font-bold text-[#5C8891]">{value}</div>{sub && <div className="text-[10px] text-gray-500">{sub}</div>}</div>
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
      <div className="p-4 space-y-4 bg-[#F7FAFA] h-full overflow-auto">
        <div>
          <div className="text-[11px] font-bold text-[#5C8891] mb-2 uppercase">Vendas & Margem (hoje)</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={TrendingUp} label="Vendas do dia" value={money(pos.sales)} color="#062A31" sub={`${pos.count || 0} vendas · ticket médio ${money(pos.avg_ticket)}`} />
            <Card icon={Percent} label="Margem (preço − custo)" value={money(pos.margin)} color="#5C8891" sub={`${marginPct}% · custo ${money(pos.cost)}`} />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#5C8891] mb-2 uppercase">Stock</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={Boxes} label="Valor do stock" value={money(stock.value)} color="#5C8891" />
            <Card icon={AlertTriangle} label="Artigos em rutura/baixo" value={String(stock.low_count ?? 0)} color="#B0392B" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#5C8891] mb-2 uppercase">Financeiro</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={ArrowUpCircle} label="Contas a Receber" value={money(fin.receivable)} color="#062A31" />
            <Card icon={ArrowDownCircle} label="Contas a Pagar" value={money(fin.payable)} color="#B0392B" />
            <Card icon={Landmark} label="Tesouraria (saldo)" value={money(fin.treasury)} color="#041F24" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#5C8891] mb-2 uppercase">Hotelaria (PMS)</div>
          <div className="flex flex-wrap gap-2">
            <Card icon={BedDouble} label="Ocupação" value={`${pms.occupancy_pct ?? 0}%`} color="#5C8891" sub={`${pms.occupied ?? 0} / ${pms.rooms ?? 0} quartos`} />
          </div>
        </div>
        {pos.top_products?.length ? (
          <div>
            <div className="text-[11px] font-bold text-[#5C8891] mb-1 uppercase">Mais vendidos (hoje)</div>
            <div className="bg-white border border-[#CFE3E6] max-w-md">
              {pos.top_products.map((p: any) => (
                <div key={p.name} className="flex justify-between px-3 py-1.5 text-[12px] border-b border-[#F7FAFA]"><span>{p.name}</span><span className="font-bold">{Number(p.qty).toFixed(0)}</span></div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ClassicWindow>
  );
}
