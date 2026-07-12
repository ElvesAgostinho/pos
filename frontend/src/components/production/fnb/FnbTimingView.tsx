import ClassicWindow from '../../ui/ClassicWindow';
import ClassicGrid from '../../ui/ClassicGrid';
import { Timer } from 'lucide-react';
import { useFnbTiming } from '../../../hooks/useFnb';

export default function FnbTimingView() {
  const { data, isLoading } = useFnbTiming();
  const rows = data?.outlets ?? [];
  const target = data?.target_mins ?? 20;

  return (
    <ClassicWindow
      title="Service Timing — Tempos de Serviço (hoje)"
      icon={<Timer size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Média global: {data?.global_avg_mins != null ? `${data.global_avg_mins} min` : '—'} · Alvo: {target} min</div>}
    >
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 bg-white border border-[#a0a0a0] px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Tempo médio global</div>
            <div className={`text-2xl font-bold ${data?.global_avg_mins != null && data.global_avg_mins > target ? 'text-red-700' : 'text-green-700'}`}>
              {data?.global_avg_mins != null ? `${data.global_avg_mins} min` : '—'}
            </div>
          </div>
          <div className="flex-1 bg-white border border-[#a0a0a0] px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Alvo de serviço</div>
            <div className="text-2xl font-bold text-[#1e3f66]">{target} min</div>
          </div>
        </div>
        <div className="h-[calc(100%-5rem)]">
          <ClassicGrid
            rowKey="id" data={rows}
            columns={[
              { header: 'Outlet', accessor: 'name', width: '35%' },
              { header: 'Tickets hoje', accessor: 'tickets_today', width: '20%' },
              { header: 'Tempo médio', accessor: (r: any) => r.avg_service_mins != null ? `${r.avg_service_mins} min` : '—', width: '22%' },
              { header: 'Vs. alvo', accessor: (r: any) => r.avg_service_mins == null ? '—' :
                <span className={r.avg_service_mins > target ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>{r.avg_service_mins > target ? `+${(r.avg_service_mins - target).toFixed(1)}` : 'OK'}</span>, width: '23%' },
            ]}
          />
          {!isLoading && rows.length === 0 && (
            <div className="text-center text-gray-400 text-[12px] py-8">Sem tickets fechados hoje para medir tempos.</div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
