import ClassicWindow from '../../ui/ClassicWindow';
import { LayoutDashboard, Warehouse, PackageX, ArrowLeftRight, ClipboardList, AlertTriangle } from 'lucide-react';
import { useWhDashboard } from '../../../hooks/useWh';

const AOA = (n: number) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(n || 0) + ' Kz';

function Card({ icon, label, value, sub, tone }: any) {
  return (
    <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase tracking-wide">{icon}{label}</div>
      <div className={`text-2xl font-bold ${tone || 'text-[#1e3f66]'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function WhDashboardView() {
  const { data: d, isLoading } = useWhDashboard();
  return (
    <ClassicWindow title="Armazém — Dashboard" icon={<LayoutDashboard size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Centro 09 · Armazém — saldo, alertas e operações</div>}>
      <div className="p-3">
        {isLoading || !d ? <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : (
          <div className="grid grid-cols-4 gap-2">
            <Card icon={<Warehouse size={12} />} label="Valor em stock" value={AOA(d.stock_value)} tone="text-green-700" />
            <Card icon={<Warehouse size={12} />} label="Armazéns / Localizações" value={`${d.warehouses} / ${d.locations}`} />
            <Card label="SKUs em stock" value={d.skus_in_stock} />
            <Card icon={<AlertTriangle size={12} />} label="Alertas stock mínimo" value={d.low_stock_alerts} tone={d.low_stock_alerts ? 'text-red-700' : 'text-green-700'} />
            <Card icon={<PackageX size={12} />} label="Movimentos hoje" value={d.movements_today} />
            <Card icon={<ArrowLeftRight size={12} />} label="Transferências abertas" value={d.open_transfers} tone={d.open_transfers ? 'text-amber-700' : undefined} />
            <Card icon={<ClipboardList size={12} />} label="Inventários abertos" value={d.open_counts} tone={d.open_counts ? 'text-amber-700' : undefined} />
            <Card icon={<AlertTriangle size={12} />} label="Lotes a expirar (30d)" value={`${d.lots_expiring_30d}`} sub={d.lots_expired ? `${d.lots_expired} já expirados` : undefined} tone={d.lots_expiring_30d ? 'text-amber-700' : 'text-green-700'} />
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
