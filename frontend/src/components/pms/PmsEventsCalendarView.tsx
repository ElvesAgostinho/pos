import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

/** Calendário EMS — lista de eventos agrupada por mês, em ordem cronológica.
    Mantido simples de propósito (MVP): uma grelha mensal a sério só faria
    sentido com um modelo de salas/venue, que ainda não existe. */

const STATUS_COLOR: Record<string, string> = { INQUIRY: '#D97706', CONFIRMED: '#16A34A', CANCELLED: '#DC2626', COMPLETED: '#6B7280' };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function PmsEventsCalendarView({ onNavigate }: {
  onNavigate?: (sec: string, pedido?: any) => void;
}) {
  const { data } = useQuery({ queryKey: ['pms', 'events'], queryFn: async () => (await apiClient.get('pms/events/')).data });
  const all: any[] = data?.results || data || [];
  const sorted = [...all].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));

  const groups: Record<string, any[]> = {};
  for (const ev of sorted) {
    const d = ev.event_date ? new Date(ev.event_date + 'T00:00:00') : null;
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'sem-data';
    (groups[key] ||= []).push(ev);
  }

  return (
    <div className="h-full overflow-auto bg-white p-2">
      {Object.keys(groups).length === 0 && <div className="text-gray-400 text-[12px] p-6 text-center">Sem eventos registados.</div>}
      {Object.entries(groups).map(([key, evs]) => {
        const [y, m] = key.split('-');
        const label = key === 'sem-data' ? 'Sem data' : `${MESES[Number(m) - 1]} ${y}`;
        return (
          <div key={key} className="mb-4">
            <div className="text-[11px] font-bold text-[#111827] border border-[#C8C8C8] px-2 py-[2px]" style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)' }}>{label} <span className="text-gray-500 font-normal">({evs.length})</span></div>
            <div className="border border-t-0 border-[#C8C8C8]">
              {evs.map((ev) => (
                /* CARREGAR NUM EVENTO ABRE-O. Era uma lista morta: mostrava o
                   evento e não levava a lado nenhum — quem o queria ver tinha
                   de ir ao EMS e procurá-lo outra vez pelo nome. Um calendário
                   existe para se chegar àquele dia e àquele evento. */
                <div key={ev.id} onClick={() => onNavigate?.('events', { abrirId: ev.id })}
                  title={onNavigate ? `Abrir o pedido de evento · ${ev.name}` : undefined}
                  className={`flex items-center gap-3 px-2 py-[3px] border-b border-[#EDEDED] text-[11.5px] hover:bg-[#FDF4D9] ${onNavigate ? 'cursor-pointer' : ''}`}>
                  <span className="w-16 font-mono text-gray-500">{ev.event_date?.slice(8, 10)}/{ev.event_date?.slice(5, 7)}</span>
                  <span className="w-16 text-gray-400">{ev.start_time ? ev.start_time.slice(0, 5) : '—'}</span>
                  <span className="flex-1 font-semibold text-[#111827]">{ev.name}</span>
                  <span className="w-40 text-gray-500">{ev.venue || '—'}</span>
                  <span className="w-32 text-gray-500">{ev.client_name || '—'}</span>
                  <span className="w-20 text-right">{Number(ev.estimated_revenue || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</span>
                  <span className="text-white px-1.5 py-0.5 text-[10px] font-bold w-24 text-center" style={{ background: STATUS_COLOR[ev.status] }}>{ev.status_display}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
