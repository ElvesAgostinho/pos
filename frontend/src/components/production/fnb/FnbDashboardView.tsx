import ClassicWindow from '../../ui/ClassicWindow';
import { LayoutDashboard, TrendingUp, ShieldCheck, Trash2, Star, CalendarClock } from 'lucide-react';
import { useFnbDashboard } from '../../../hooks/useFnb';

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

export default function FnbDashboardView() {
  const { data: d, isLoading } = useFnbDashboard();

  return (
    <ClassicWindow
      title="Dashboard F&B"
      icon={<LayoutDashboard size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Centro 10 · F&B Operations — visão geral em tempo real</div>}
    >
      <div className="p-3 space-y-3">
        {isLoading || !d ? (
          <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Card icon={<TrendingUp size={12} />} label="Vendas F&B hoje" value={AOA(d.sales_today)} tone="text-green-700" />
              <Card icon={<CalendarClock size={12} />} label="Eventos futuros" value={d.events_upcoming} sub={`${d.events_today} hoje`} />
              <Card icon={<ShieldCheck size={12} />} label="Conformidade HACCP (7d)" value={d.haccp?.rate != null ? `${d.haccp.rate}%` : '—'} sub={`${d.haccp?.non_compliant_7d || 0} não conformes`} tone={d.haccp?.rate != null && d.haccp.rate < 90 ? 'text-red-700' : 'text-green-700'} />
              <Card icon={<Trash2 size={12} />} label="Desperdício (mês)" value={AOA(d.waste_month_cost)} tone="text-amber-700" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Card icon={<Star size={12} />} label="Qualidade média (30d)" value={d.quality_avg != null ? `${d.quality_avg}/5` : '—'} />
              <Card label="Receitas / Fichas técnicas" value={d.recipes} />
              <Card label="Cartas ativas" value={d.menus} />
              <Card label="Estações de produção" value={d.production_areas} />
            </div>

            <div className="bg-white border border-[#a0a0a0]">
              <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold text-gray-700">Outlets F&B por tipo</div>
              <div className="grid grid-cols-3 gap-px bg-[#e0e0e0]">
                {Object.entries(d.outlets_by_type || {}).map(([k, v]: any) => (
                  <div key={k} className="bg-white px-3 py-2 flex items-center justify-between">
                    <span className="text-[12px] text-gray-700">{v.label}</span>
                    <span className="text-lg font-bold text-[#1e3f66]">{v.count}</span>
                  </div>
                ))}
                {Object.keys(d.outlets_by_type || {}).length === 0 && (
                  <div className="bg-white px-3 py-4 text-center text-gray-400 text-[11px] col-span-3">Módulo POS não disponível.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ClassicWindow>
  );
}
