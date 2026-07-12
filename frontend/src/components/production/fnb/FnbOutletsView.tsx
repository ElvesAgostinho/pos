import ClassicWindow from '../../ui/ClassicWindow';
import ClassicGrid from '../../ui/ClassicGrid';
import { UtensilsCrossed } from 'lucide-react';
import { useFnbOutlets } from '../../../hooks/useFnb';

const AOA = (n: number) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(n || 0) + ' Kz';

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 bg-white border border-[#a0a0a0] px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${tone || 'text-[#1e3f66]'}`}>{value}</div>
    </div>
  );
}

/** Ecrã partilhado pelos 6 tipos de outlet F&B (Restaurantes, Bares, Coffee, Pool Bar, Room Service, Buffets). */
export default function FnbOutletsView({ type, title }: { type: string; title: string }) {
  const { data, isLoading } = useFnbOutlets(type);
  const outlets = data?.outlets ?? [];
  const t = data?.totals ?? { count: 0, sales_today: 0, tickets_today: 0, open_tickets: 0 };

  return (
    <ClassicWindow
      title={title}
      icon={<UtensilsCrossed size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{outlets.length} outlet(s) · Vendas hoje: {AOA(t.sales_today)}</div>}
    >
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <Kpi label="Outlets" value={String(t.count)} />
          <Kpi label="Vendas hoje" value={AOA(t.sales_today)} tone="text-green-700" />
          <Kpi label="Tickets fechados" value={String(t.tickets_today)} />
          <Kpi label="Mesas/tickets abertos" value={String(t.open_tickets)} tone="text-amber-700" />
        </div>

        <div className="h-[calc(100%-4rem)]">
          <ClassicGrid
            rowKey="id"
            data={outlets}
            columns={[
              { header: 'Código', accessor: 'code', width: '10%' },
              { header: 'Outlet', accessor: 'name', width: '26%' },
              { header: 'Vendas hoje', accessor: (r: any) => AOA(r.sales_today), width: '15%' },
              { header: 'Tickets', accessor: 'tickets_today', width: '9%' },
              { header: 'Ticket médio', accessor: (r: any) => AOA(r.avg_ticket), width: '14%' },
              { header: 'Abertos', accessor: 'open_tickets', width: '9%' },
              { header: 'Caixas', accessor: 'open_sessions', width: '8%' },
              { header: 'T. serviço', accessor: (r: any) => r.avg_service_mins != null ? `${r.avg_service_mins} min` : '—', width: '9%' },
            ]}
          />
          {!isLoading && outlets.length === 0 && (
            <div className="text-center text-gray-400 text-[12px] py-8">
              Sem outlets do tipo "{data?.type_label || title}". Crie-os em Hotel Management → Outlets.
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
