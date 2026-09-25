import { useState, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Toolbar } from '../posconfig/kit';
import PmsRateBulkUpdateDialog from './PmsRateBulkUpdateDialog';

const DAYS_VISIBLE = 14;

const fmtISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const money = (n: number) => Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Calendário de Tarifas — o preço de cada dia é sempre: exceção (RateOverride)
    se existir, senão o preço base do RatePlan (se o dia cair dentro da sua
    validade). Nunca mostra nem edita o RatePlan diretamente aqui — só
    exceções, via "Atualização em Massa". */
export default function PmsRatesCalendarView() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulk, setShowBulk] = useState(false);

  const dateFrom = fmtISO(weekStart);
  const dateTo = fmtISO(addDays(weekStart, DAYS_VISIBLE - 1));
  const days = Array.from({ length: DAYS_VISIBLE }, (_, i) => addDays(weekStart, i));

  const { data: rpData, refetch: refetchPlans } = useQuery({
    queryKey: ['pms', 'rate-plans'],
    queryFn: async () => (await apiClient.get('pms/rate-plans/')).data,
  });
  const ratePlans: any[] = Array.isArray(rpData) ? rpData : rpData?.results || [];

  const { data: ovData, refetch: refetchOverrides } = useQuery({
    queryKey: ['pms', 'rate-overrides', dateFrom, dateTo],
    queryFn: async () => (await apiClient.get('pms/rate-overrides/', { params: { date_from: dateFrom, date_to: dateTo } })).data,
  });
  const overrides: any[] = Array.isArray(ovData) ? ovData : ovData?.results || [];
  const overrideFor = (rateId: number, dateIso: string) => overrides.find((o) => o.rate_plan === rateId && o.date === dateIso);

  const grouped = ratePlans.reduce((acc: Record<string, any[]>, rp) => {
    const key = rp.room_type_name || '—';
    (acc[key] = acc[key] || []).push(rp);
    return acc;
  }, {});

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const refresh = () => { refetchPlans(); refetchOverrides(); qc.invalidateQueries({ queryKey: ['pms'] }); };

  return (
    <div className="flex flex-col h-full bg-white">
      <Toolbar actions={[
        { label: '← 14 dias', icon: '◀', color: '#5C8891', onClick: () => setWeekStart((d) => addDays(d, -DAYS_VISIBLE)) },
        { label: '14 dias →', icon: '▶', color: '#5C8891', onClick: () => setWeekStart((d) => addDays(d, DAYS_VISIBLE)) },
        { label: 'Hoje', icon: '🕐', color: '#5C8891', onClick: () => setWeekStart(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }) },
        { label: 'Atualização em Massa', icon: '✎', color: '#062A31', onClick: () => setShowBulk(true), disabled: ratePlans.length === 0 },
      ]} />
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-[11px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#F7FAFA] border border-[#CFE3E6] px-2 py-1 text-left min-w-[220px] z-10">Categoria / Tarifa</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="border border-[#CFE3E6] px-1 py-1 min-w-[64px] font-normal text-[#5C8891]">
                  {d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([roomTypeName, plans]) => (
              <Fragment key={roomTypeName}>
                <tr>
                  <td colSpan={DAYS_VISIBLE + 1} className="bg-[#EEF4F5] border border-[#CFE3E6] px-2 py-1 font-bold text-[#062A31]">{roomTypeName}</td>
                </tr>
                {plans.map((rp: any) => (
                  <tr key={rp.id}>
                    <td className="sticky left-0 bg-white border border-[#CFE3E6] px-2 py-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={selected.has(rp.id)} onChange={() => toggle(rp.id)} />
                        <span>{rp.name} <span className="text-[#7FA9B1]">({rp.code})</span></span>
                      </label>
                    </td>
                    {days.map((d) => {
                      const iso = fmtISO(d);
                      const ov = overrideFor(rp.id, iso);
                      const inRange = (!rp.valid_from || iso >= rp.valid_from) && (!rp.valid_to || iso <= rp.valid_to);
                      const closed = ov?.is_bookable === false;
                      const price = ov?.price_per_night ?? (inRange ? rp.price_per_night : null);
                      return (
                        <td key={iso} className={`border border-[#CFE3E6] px-1 py-1 text-center ${closed ? 'bg-[#FDECEA] text-[#8C2B1F]' : ov ? 'bg-[#EEF4F5] font-semibold text-[#062A31]' : ''}`}>
                          {closed ? 'Fechado' : price != null ? money(Number(price)) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
            {ratePlans.length === 0 && (
              <tr><td colSpan={DAYS_VISIBLE + 1} className="text-center text-gray-400 py-6">Sem tarifas criadas — crie primeiro em "Tarifas (Rate Codes)".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showBulk && (
        <PmsRateBulkUpdateDialog
          ratePlans={ratePlans.map((rp) => ({ id: rp.id, label: `${rp.room_type_name} · ${rp.name} (${rp.code})` }))}
          preselectedIds={Array.from(selected)}
          onClose={() => setShowBulk(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
