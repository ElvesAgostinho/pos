import { useQuery } from '@tanstack/react-query';
import { Circle } from 'lucide-react';
import { Glyph } from '../posconfig/kit';
import { apiClient } from '../../api/client';

/** Ecrã de arranque do PMS — um "Getting Started" (passos estáticos, sem
    seguimento real de conclusão: é uma checklist de orientação, não um motor
    de onboarding) e um painel de Check-ins/Check-outs de HOJE com dados
    verdadeiros (pms/reservations/, os mesmos parâmetros que o resto do PMS
    já usa — ver ReservationViewSet.get_queryset em pms/views.py). */

const STEPS = [
  { label: 'Preencher categorias e nomes de quartos', section: 'room_types' },
  { label: 'Adicionar hóspedes', section: 'guests_companies' },
  { label: 'Criar a primeira reserva', section: 'reservations' },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function PmsHomeDashboardView({ onNavigate }: { onDesktop?: () => void; onNavigate?: (section: string) => void }) {
  const d = today();

  const { data: arrivals } = useQuery({
    queryKey: ['pms', 'reservations', 'arrivals-today', d],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params: { check_in_from: d, check_in_to: d } })).data,
  });
  const { data: departures } = useQuery({
    queryKey: ['pms', 'reservations', 'departures-today', d],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params: { check_out_from: d, check_out_to: d } })).data,
  });
  const arrivalRows: any[] = Array.isArray(arrivals) ? arrivals : arrivals?.results || [];
  const departureRows: any[] = Array.isArray(departures) ? departures : departures?.results || [];

  const go = (section: string) => onNavigate?.(section);

  return (
    <div className="flex flex-col h-full bg-[#F0F0F0] overflow-auto p-2 gap-2 text-[11.5px]">
      <div className="bg-white border border-[#C8C8C8]">
        <div className="px-2 py-[2px] text-[11px] border-b border-[#C8C8C8] font-bold text-[#111827]" style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)' }}>
          Primeiros Passos
        </div>
        <div className="p-3 space-y-1">
          {STEPS.map((s) => (
            <button key={s.section} onClick={() => go(s.section)}
              className="w-full flex items-center gap-2 px-2 py-[3px] text-left hover:bg-[#FDF4D9] disabled:opacity-60"
              disabled={!onNavigate}>
              <Circle size={15} className="text-[#6B7280] flex-shrink-0" />
              <span className="text-[#111827]">{s.label}</span>
            </button>
          ))}
          {!onNavigate && (
            <div className="text-[10px] text-[#6B7280] px-2 pt-1">A navegação direta a partir daqui ainda não está ligada ao menu.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-[#C8C8C8]">
          <div className="px-2 py-[2px] text-[11px] border-b border-[#C8C8C8] font-bold text-[#111827] flex items-center gap-1.5" style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)' }}>
            <Glyph icon="🔍" size={14} /> Check-ins hoje ({arrivalRows.length})
          </div>
          <div className="max-h-[280px] overflow-auto">
            {arrivalRows.length === 0 && <div className="text-center text-[#6B7280] py-6">Sem chegadas hoje.</div>}
            {arrivalRows.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between px-2 py-[2px] border-b border-[#EDEDED] hover:bg-[#FDF4D9]">
                <div>
                  <div className="font-semibold text-[#111827]">{r.guest_name}</div>
                  <div className="text-[10px] text-[#6B7280]">{r.confirmation} · {r.room_type_name}{r.room_number ? ` · Quarto ${r.room_number}` : ''}</div>
                </div>
                <span className="text-[10px] text-[#111827]">{r.status_display}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#C8C8C8]">
          <div className="px-2 py-[2px] text-[11px] border-b border-[#C8C8C8] font-bold text-[#111827] flex items-center gap-1.5" style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)' }}>
            <Glyph icon="🚫" size={14} /> Check-outs hoje ({departureRows.length})
          </div>
          <div className="max-h-[280px] overflow-auto">
            {departureRows.length === 0 && <div className="text-center text-[#6B7280] py-6">Sem saídas hoje.</div>}
            {departureRows.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between px-2 py-[2px] border-b border-[#EDEDED] hover:bg-[#FDF4D9]">
                <div>
                  <div className="font-semibold text-[#111827]">{r.guest_name}</div>
                  <div className="text-[10px] text-[#6B7280]">{r.confirmation} · {r.room_type_name}{r.room_number ? ` · Quarto ${r.room_number}` : ''}</div>
                </div>
                <span className="text-[10px] text-[#111827]">{r.status_display}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
