import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Pencil } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

const MEALS: [string, string][] = [
  ['BREAKFAST', 'Pequeno Almoço'], ['COFFEE_AM', 'Coffee Break Manhã'], ['LUNCH', 'Almoço'],
  ['COFFEE_PM', 'Coffee Break Tarde'], ['SNACK', 'Lanche'], ['DINNER', 'Jantar'], ['SUPPER', 'Ceia'],
  ['COCKTAIL_AM', 'COCKTAIL MANHÃ'], ['COCKTAIL_PM', 'COCKTAIL TARDE'],
];
const AGE_COLS = ['adults', 'children_1', 'children_2', 'children_3'] as const;
const AGE_LABEL: Record<string, string> = { adults: 'Adultos', children_1: 'Crianças 1', children_2: 'Crianças 2', children_3: 'Crianças 3' };
const fmtD = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
const plusDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Mapa de Refeições — quantas pessoas usam cada refeição, por dia. Dados
 * reais (pms.MealPlanEntry); "Editar" grava para um intervalo de datas de
 * uma vez, tal como no PMS de referência. */
export default function PmsMealPlanDialog({ reservation: r, onClose }: { reservation: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<'reserva' | 'guest'>('reserva');
  const [showEdit, setShowEdit] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'meal-plan-entries', r.id],
    queryFn: async () => (await apiClient.get('pms/meal-plan-entries/', { params: { reservation: r.id } })).data,
  });
  const entries = Array.isArray(data) ? data : data?.results || [];

  const nights = Math.max(r.nights || 0, 0);
  const dias = Array.from({ length: nights + 1 }, (_, i) => plusDays(r.check_in, i));
  const cell = (date: string, meal: string, col: string) =>
    entries.find((e: any) => e.date === date && e.meal_code === meal)?.[col] || 0;

  const totalUtilizado: Record<string, number> = { adults: 0, children_1: 0, children_2: 0, children_3: 0 };
  entries.forEach((e: any) => AGE_COLS.forEach((c) => { totalUtilizado[c] += e[c] || 0; }));
  const possivel = (r.adults || 0) * dias.length;
  const naoUtilizado = { adults: Math.max(possivel - totalUtilizado.adults, 0), children_1: 0, children_2: 0, children_3: 0 };

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[97vw] h-[88vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-2xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          Mapa de Refeições
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[220px] border-r border-[#c0c0c0] bg-white">
            <div className="px-2 py-1.5 font-bold text-[11px] bg-[#eef1f4] border-b border-[#c0c7d0]">Detalhes</div>
            <button onClick={() => setDetail('reserva')} className={`w-full text-left px-3 py-2 text-[12px] ${detail === 'reserva' ? 'bg-[#dfe9f3] font-semibold' : 'hover:bg-[#f5f5f5]'}`}>
              Reserva {r.confirmation}
            </button>
            <button onClick={() => setDetail('guest')} className={`w-full text-left px-3 py-2 text-[12px] ${detail === 'guest' ? 'bg-[#dfe9f3] font-semibold' : 'hover:bg-[#f5f5f5]'}`}>
              {r.guest_name}
            </button>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="text-[11px] border-collapse w-max">
                <thead style={{ background: '#eef1f4' }}>
                  <tr>
                    <th className="sticky left-0 bg-[#eef1f4] px-2 py-1.5 border-b border-r border-[#c0c7d0] text-left">Data</th>
                    {MEALS.map(([code, label]) => (
                      <th key={code} colSpan={4} className="px-2 py-1.5 border-b border-r border-[#c0c7d0] text-center">{label}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 bg-[#eef1f4] border-b border-r border-[#c0c7d0]"></th>
                    {MEALS.map(([code]) => AGE_COLS.map((c) => (
                      <th key={code + c} className="px-2 py-1 border-b border-r border-[#e0e0e0] font-normal text-[10px]">{AGE_LABEL[c]}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d}>
                      <td className="sticky left-0 bg-white px-2 py-1 border-b border-r border-[#c0c7d0] font-semibold whitespace-nowrap">{fmtD(d)}</td>
                      {MEALS.map(([code]) => AGE_COLS.map((c) => {
                        const v = cell(d, code, c);
                        return <td key={code + c} className="px-2 py-1 border-b border-r border-[#eee] text-center">{v || ''}</td>;
                      }))}
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="sticky left-0 bg-white px-2 py-1 border-r border-[#c0c7d0]">Dias: {dias.length}</td>
                    {MEALS.map(([code]) => AGE_COLS.map((c) => {
                      const total = entries.filter((e: any) => e.meal_code === code).reduce((s: number, e: any) => s + (e[c] || 0), 0);
                      return <td key={code + c} className="px-2 py-1 border-r border-[#eee] text-center">{total || 0}</td>;
                    }))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-2 py-1.5 border-t border-[#c0c0c0] bg-[#f4f4f4] flex-shrink-0">
              <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0b7fbf] hover:underline">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: '#3a9ecf' }}><Pencil size={11} /></span>
                Editar
              </button>
            </div>
            <div className="border-t border-[#c0c0c0] bg-white overflow-auto max-h-[220px] flex-shrink-0">
              <div className="px-2 py-1.5 font-bold text-[11px] bg-[#f4f4f4]">Resumo</div>
              <table className="w-full text-[11px] border-collapse">
                <thead style={{ background: '#eef1f4' }}>
                  <tr>
                    <th className="px-2 py-1 border-b border-[#c0c7d0] text-left">Código</th>
                    <th className="px-2 py-1 border-b border-[#c0c7d0] text-left">Tipo</th>
                    {AGE_COLS.map((c) => <th key={'u' + c} colSpan={1} className="px-2 py-1 border-b border-[#c0c7d0]">Utiliz. {AGE_LABEL[c]}</th>)}
                    {AGE_COLS.map((c) => <th key={'n' + c} colSpan={1} className="px-2 py-1 border-b border-[#c0c7d0]">Não util. {AGE_LABEL[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MEALS.map(([code, label]) => {
                    const util: Record<string, number> = { adults: 0, children_1: 0, children_2: 0, children_3: 0 };
                    entries.filter((e: any) => e.meal_code === code).forEach((e: any) => AGE_COLS.forEach((c) => { util[c] += e[c] || 0; }));
                    return (
                      <tr key={code} className="border-b border-[#eee]">
                        <td className="px-2 py-1">{label}</td>
                        <td className="px-2 py-1">Refeição</td>
                        {AGE_COLS.map((c) => <td key={'u' + c} className="px-2 py-1 text-center">{util[c] || ''}</td>)}
                        {AGE_COLS.map((c) => <td key={'n' + c} className="px-2 py-1 text-center">{code === 'BREAKFAST' ? (naoUtilizado[c as keyof typeof naoUtilizado] || '') : ''}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>

      {showEdit && (
        <MealEditDialog reservation={r} onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); refetch(); qc.invalidateQueries({ queryKey: ['pms', 'meal-plan-entries'] }); }} />
      )}
    </div>
  );
}

function MealEditDialog({ reservation: r, onClose, onSaved }: { reservation: any; onClose: () => void; onSaved: () => void }) {
  const [meal, setMeal] = useState('');
  const [dateFrom, setDateFrom] = useState(r.check_in);
  const [dateTo, setDateTo] = useState(r.check_out);
  const [adults, setAdults] = useState(0);
  const [c1, setC1] = useState(0);
  const [c2, setC2] = useState(0);
  const [c3, setC3] = useState(0);
  const [info, setInfo] = useState('');
  const [aplicarTodos, setAplicarTodos] = useState(false);
  const [saving, setSaving] = useState(false);

  const gravar = async () => {
    if (!meal) { aviso('Escolha uma refeição.'); return; }
    setSaving(true);
    try {
      const payload = { meal_code: meal, date_from: dateFrom, date_to: dateTo,
        adults, children_1: c1, children_2: c2, children_3: c3, info };
      let reservationIds = [r.id];
      if (aplicarTodos) {
        const { data } = await apiClient.get('pms/reservations/', { params: { guest: r.guest } });
        const outras = (Array.isArray(data) ? data : data?.results || []).map((x: any) => x.id);
        reservationIds = Array.from(new Set([r.id, ...outras]));
      }
      for (const rid of reservationIds) {
        await apiClient.post('pms/meal-plan-entries/apply-range/', { reservation: rid, ...payload });
      }
      onSaved();
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[9300] flex items-center justify-center bg-black/40">
      <div className="w-[420px] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          Refeição
          <button onClick={onClose} className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={12} strokeWidth={3} /></button>
        </div>
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <label className="flex flex-col gap-0.5">Refeição:
            <select value={meal} onChange={(e) => setMeal(e.target.value)} className="border border-[#a0a0a0] p-1.5 bg-white">
              <option value="">Selecione um…</option>
              {MEALS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col gap-0.5">De data:<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
            <label className="flex-1 flex flex-col gap-0.5">Até à data:<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
          </div>
          <label className="flex flex-col gap-0.5">Adultos:<input type="number" min={0} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Crianças 1:<input type="number" min={0} value={c1} onChange={(e) => setC1(Number(e.target.value))} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Crianças 2:<input type="number" min={0} value={c2} onChange={(e) => setC2(Number(e.target.value))} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Crianças 3:<input type="number" min={0} value={c3} onChange={(e) => setC3(Number(e.target.value))} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Info:<textarea value={info} onChange={(e) => setInfo(e.target.value)} rows={3} className="border border-[#a0a0a0] p-1.5 bg-white" /></label>
          <div className="flex items-center gap-4">
            Aplicar a:
            <label className="flex items-center gap-1"><input type="radio" checked={!aplicarTodos} onChange={() => setAplicarTodos(false)} /> Detalhe selecionado</label>
            <label className="flex items-center gap-1"><input type="radio" checked={aplicarTodos} onChange={() => setAplicarTodos(true)} /> Todos</label>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0]">
          <button onClick={gravar} disabled={saving} className="flex items-center gap-2 text-[12px] font-semibold text-[#333] disabled:opacity-50">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: '#2e9e4f' }}>✓</span>
            {saving ? 'A gravar…' : 'Gravar'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
