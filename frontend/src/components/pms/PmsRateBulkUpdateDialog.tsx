import { useState } from 'react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import { Toolbar } from '../posconfig/kit';

const WEEKDAYS = [['Seg', 0], ['Ter', 1], ['Qua', 2], ['Qui', 3], ['Sex', 4], ['Sáb', 5], ['Dom', 6]] as const;

/** Atualização em Massa do Calendário de Tarifas — nunca mexe no RatePlan em
    si, só cria/apaga exceções por dia (pms.RateOverride) via
    pms/rate-plans/bulk_update/. Mesma lógica das imagens de referência:
    escolher tarifas + período + dias da semana, e o que mudar. */
export default function PmsRateBulkUpdateDialog({ ratePlans, preselectedIds, onClose, onDone }: {
  ratePlans: { id: number; label: string }[];
  preselectedIds: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(preselectedIds));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [updatePrice, setUpdatePrice] = useState(false);
  const [basePrice, setBasePrice] = useState('');
  const [updateMinNights, setUpdateMinNights] = useState(false);
  const [minNights, setMinNights] = useState('');
  const [updateSaleState, setUpdateSaleState] = useState(false);
  const [saleState, setSaleState] = useState<'AVAILABLE' | 'UNAVAILABLE'>('AVAILABLE');
  const [removeOverrides, setRemoveOverrides] = useState(false);
  const [sending, setSending] = useState(false);

  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleWd = (d: number) => setWeekdays((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });

  const send = async () => {
    if (selected.size === 0) { aviso('Escolha pelo menos uma tarifa.'); return; }
    if (!dateFrom || !dateTo) { aviso('Escolha o período de datas.'); return; }
    if (weekdays.size === 0) { aviso('Escolha pelo menos um dia da semana.'); return; }
    if (!removeOverrides && !updatePrice && !updateMinNights && !updateSaleState) {
      aviso('Escolha o que quer mudar, ou marque "Remover todas as exceções".'); return;
    }
    setSending(true);
    try {
      const r = await apiClient.post('pms/rate-plans/bulk_update/', {
        rate_plan_ids: Array.from(selected), date_from: dateFrom, date_to: dateTo,
        weekdays: Array.from(weekdays), remove_overrides: removeOverrides,
        update_price: updatePrice, base_price: basePrice || null,
        update_min_nights: updateMinNights, min_nights: minNights ? Number(minNights) : null,
        update_sale_state: updateSaleState, sale_state: saleState,
      });
      aviso(`Atualizado: ${r.data.rate_plans} tarifa(s), ${r.data.days_touched} dia(s).`);
      onDone(); onClose();
    } catch (e) { notifyError(e); } finally { setSending(false); }
  };

  const inp = 'border border-[#7FA9B1] p-1 bg-white';

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[560px] max-h-[85vh] bg-[#F7FAFA] border border-[#7FA9B1] shadow-xl flex flex-col">
        <div className="h-8 flex items-center justify-between px-3 text-white text-[12px] font-bold flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #062A31, #041F24)' }}>
          Atualização em Massa de Tarifas
          <button onClick={onClose} className="text-white/80 hover:text-white">×</button>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-3 text-[11px]">
          <div>
            <div className="font-bold text-[#062A31] mb-1">Tarifas a atualizar*</div>
            <div className="border border-[#7FA9B1] bg-white max-h-[110px] overflow-auto">
              {ratePlans.map((rp) => (
                <label key={rp.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#F7FAFA] cursor-pointer">
                  <input type="checkbox" checked={selected.has(rp.id)} onChange={() => toggleSel(rp.id)} />
                  {rp.label}
                </label>
              ))}
              {ratePlans.length === 0 && <div className="p-2 text-gray-400">Sem tarifas criadas.</div>}
            </div>
          </div>

          <div className="font-bold text-[#062A31]">Datas e dias da semana</div>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">De<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inp} /></label>
            <label className="flex-1 flex flex-col">Até<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inp} /></label>
          </div>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map(([label, d]) => (
              <button key={d} onClick={() => toggleWd(d)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${weekdays.has(d) ? 'bg-[#0B4F5C] text-white border-[#0B4F5C]' : 'bg-white text-[#5C8891] border-[#7FA9B1]'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]))} className="text-[#0B4F5C] underline text-[11px] px-1">Todos</button>
            <button onClick={() => setWeekdays(new Set())} className="text-[#5C8891] underline text-[11px] px-1">Nenhum</button>
          </div>

          <div className="font-bold text-[#062A31] pt-1">O que mudar</div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={updatePrice} onChange={(e) => setUpdatePrice(e.target.checked)} disabled={removeOverrides} />
            Preço base
            <input type="number" min="0" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} disabled={!updatePrice || removeOverrides} className={`${inp} w-32 disabled:opacity-40`} placeholder="Kz" />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={updateMinNights} onChange={(e) => setUpdateMinNights(e.target.checked)} disabled={removeOverrides} />
            Estadia mínima
            <input type="number" min="1" value={minNights} onChange={(e) => setMinNights(e.target.value)} disabled={!updateMinNights || removeOverrides} className={`${inp} w-20 disabled:opacity-40`} placeholder="noites" />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={updateSaleState} onChange={(e) => setUpdateSaleState(e.target.checked)} disabled={removeOverrides} />Estado de venda</label>
            <button onClick={() => setSaleState('AVAILABLE')} disabled={!updateSaleState || removeOverrides}
              className={`px-2 py-1 text-[11px] border disabled:opacity-40 ${saleState === 'AVAILABLE' ? 'bg-[#0B4F5C] text-white border-[#0B4F5C]' : 'bg-white border-[#7FA9B1]'}`}>Disponível</button>
            <button onClick={() => setSaleState('UNAVAILABLE')} disabled={!updateSaleState || removeOverrides}
              className={`px-2 py-1 text-[11px] border disabled:opacity-40 ${saleState === 'UNAVAILABLE' ? 'bg-[#B0392B] text-white border-[#B0392B]' : 'bg-white border-[#7FA9B1]'}`}>Fechado</button>
          </div>

          <div className="border-t border-[#CFE3E6] pt-2">
            <label className="flex items-center gap-2 text-[#8C2B1F] font-semibold">
              <input type="checkbox" checked={removeOverrides} onChange={(e) => setRemoveOverrides(e.target.checked)} />
              Remover todas as exceções e repor os valores da tarifa base
            </label>
          </div>
        </div>
        <Toolbar actions={[
          { label: 'Cancelar', icon: '✕', color: '#5C8891', onClick: onClose },
          { label: sending ? 'A enviar…' : 'Enviar', icon: '✔', color: '#062A31', onClick: send, disabled: sending },
        ]} />
      </div>
    </div>
  );
}
