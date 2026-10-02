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

  // DIREITO a refeições, por tipo de refeição: cada pessoa tem direito a UMA de
  // cada refeição por dia de estadia. O "não utilizado" é por LINHA (por
  // refeição) — antes era um número global, calculado à custa do direito só do
  // pequeno-almoço mas descontando as refeições de TODOS os tipos (marcar 8
  // almoços zerava os pequenos-almoços por utilizar) e ainda por cima só era
  // mostrado na linha do pequeno-almoço; as outras ficavam sempre em branco.
  // Crianças: a reserva só guarda um total (`children`), não os 3 escalões do
  // mapa — por isso o direito entra no escalão 1 e os outros ficam a zero.
  const direito: Record<string, number> = {
    adults: (r.adults || 0) * dias.length,
    children_1: (r.children || 0) * dias.length,
    children_2: 0,
    children_3: 0,
  };
  const naoUtilizadoDe = (util: Record<string, number>) => ({
    adults: Math.max(direito.adults - util.adults, 0),
    children_1: Math.max(direito.children_1 - util.children_1, 0),
    children_2: Math.max(direito.children_2 - util.children_2, 0),
    children_3: Math.max(direito.children_3 - util.children_3, 0),
  });

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[97vw] h-[88vh] bg-[#F3F4F6] border border-[#D7DBDF] shadow-2xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#17375E' }}>
          Mapa de Refeições
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B42318] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[220px] border-r border-[#D7DBDF] bg-white">
            <div className="px-2 py-1.5 font-bold text-[11px] bg-[#F3F4F6] border-b border-[#D7DBDF]">Detalhes</div>
            <button onClick={() => setDetail('reserva')} className={`w-full text-left px-3 py-2 text-[12px] ${detail === 'reserva' ? 'bg-[#F3F4F6] font-semibold' : 'hover:bg-[#F3F4F6]'}`}>
              Reserva {r.confirmation}
            </button>
            <button onClick={() => setDetail('guest')} className={`w-full text-left px-3 py-2 text-[12px] ${detail === 'guest' ? 'bg-[#F3F4F6] font-semibold' : 'hover:bg-[#F3F4F6]'}`}>
              {r.guest_name}
            </button>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="text-[11px] border-collapse w-max">
                <thead style={{ background: '#F3F4F6' }}>
                  <tr>
                    <th className="sticky left-0 bg-[#F3F4F6] px-2 py-1.5 border-b border-r border-[#D7DBDF] text-left">Data</th>
                    {MEALS.map(([code, label]) => (
                      <th key={code} colSpan={4} className="px-2 py-1.5 border-b border-r border-[#D7DBDF] text-center">{label}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 bg-[#F3F4F6] border-b border-r border-[#D7DBDF]"></th>
                    {MEALS.map(([code]) => AGE_COLS.map((c) => (
                      <th key={code + c} className="px-2 py-1 border-b border-r border-[#EBEEF0] font-normal text-[10px]">{AGE_LABEL[c]}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d}>
                      <td className="sticky left-0 bg-white px-2 py-1 border-b border-r border-[#D7DBDF] font-semibold whitespace-nowrap">{fmtD(d)}</td>
                      {MEALS.map(([code]) => AGE_COLS.map((c) => {
                        const v = cell(d, code, c);
                        return <td key={code + c} className="px-2 py-1 border-b border-r border-[#EBEEF0] text-center">{v || ''}</td>;
                      }))}
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="sticky left-0 bg-white px-2 py-1 border-r border-[#D7DBDF]">Dias: {dias.length}</td>
                    {MEALS.map(([code]) => AGE_COLS.map((c) => {
                      const total = entries.filter((e: any) => e.meal_code === code).reduce((s: number, e: any) => s + (e[c] || 0), 0);
                      return <td key={code + c} className="px-2 py-1 border-r border-[#EBEEF0] text-center">{total || 0}</td>;
                    }))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-2 py-1.5 border-t border-[#D7DBDF] bg-[#F3F4F6] flex-shrink-0">
              <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] hover:underline">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: '#2E75B6' }}><Pencil size={11} /></span>
                Editar
              </button>
            </div>
            <div className="border-t border-[#D7DBDF] bg-white overflow-auto max-h-[220px] flex-shrink-0">
              <div className="px-2 py-1.5 font-bold text-[11px] bg-[#F3F4F6]">Resumo</div>
              <table className="w-full text-[11px] border-collapse">
                <thead style={{ background: '#F3F4F6' }}>
                  <tr>
                    <th className="px-2 py-1 border-b border-[#D7DBDF] text-left">Código</th>
                    <th className="px-2 py-1 border-b border-[#D7DBDF] text-left">Tipo</th>
                    {AGE_COLS.map((c) => <th key={'u' + c} colSpan={1} className="px-2 py-1 border-b border-[#D7DBDF]">Utiliz. {AGE_LABEL[c]}</th>)}
                    {AGE_COLS.map((c) => <th key={'n' + c} colSpan={1} className="px-2 py-1 border-b border-[#D7DBDF]">Não util. {AGE_LABEL[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MEALS.map(([code, label]) => {
                    const util: Record<string, number> = { adults: 0, children_1: 0, children_2: 0, children_3: 0 };
                    entries.filter((e: any) => e.meal_code === code).forEach((e: any) => AGE_COLS.forEach((c) => { util[c] += e[c] || 0; }));
                    const naoUtil = naoUtilizadoDe(util);
                    return (
                      <tr key={code} className="border-b border-[#EBEEF0]">
                        <td className="px-2 py-1">{label}</td>
                        <td className="px-2 py-1">Refeição</td>
                        {AGE_COLS.map((c) => <td key={'u' + c} className="px-2 py-1 text-center">{util[c] || ''}</td>)}
                        {AGE_COLS.map((c) => (
                          <td key={'n' + c} className="px-2 py-1 text-center">
                            {naoUtil[c as keyof typeof naoUtil] || ''}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-3 py-2 bg-[#F3F4F6] border-t border-[#D7DBDF] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B42318] text-white"><X size={9} strokeWidth={3} /></span>
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
      <div className="w-[420px] bg-[#F3F4F6] border border-[#D7DBDF] shadow-xl rounded-[16px] overflow-hidden">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#17375E' }}>
          Refeição
          <button onClick={onClose} className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B42318] text-white"><X size={12} strokeWidth={3} /></button>
        </div>
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <label className="flex flex-col gap-0.5">Refeição:
            <select value={meal} onChange={(e) => setMeal(e.target.value)} className="border border-[#D7DBDF] p-1.5 bg-white">
              <option value="">Selecione um…</option>
              {MEALS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col gap-0.5">De data:<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
            <label className="flex-1 flex flex-col gap-0.5">Até à data:<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
          </div>
          <label className="flex flex-col gap-0.5">Adultos:<input type="number" min={0} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Crianças 1:<input type="number" min={0} value={c1} onChange={(e) => setC1(Number(e.target.value))} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Crianças 2:<input type="number" min={0} value={c2} onChange={(e) => setC2(Number(e.target.value))} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Crianças 3:<input type="number" min={0} value={c3} onChange={(e) => setC3(Number(e.target.value))} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
          <label className="flex flex-col gap-0.5">Info:<textarea value={info} onChange={(e) => setInfo(e.target.value)} rows={3} className="border border-[#D7DBDF] p-1.5 bg-white" /></label>
          <div className="flex items-center gap-4">
            Aplicar a:
            <label className="flex items-center gap-1"><input type="radio" checked={!aplicarTodos} onChange={() => setAplicarTodos(false)} /> Detalhe selecionado</label>
            <label className="flex items-center gap-1"><input type="radio" checked={aplicarTodos} onChange={() => setAplicarTodos(true)} /> Todos</label>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-[#F3F4F6] border-t border-[#D7DBDF]">
          <button onClick={gravar} disabled={saving} className="flex items-center gap-2 text-[12px] font-semibold text-[#1A1D21] disabled:opacity-50">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: '#2E75B6' }}>✓</span>
            {saving ? 'A gravar…' : 'Gravar'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B42318] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
