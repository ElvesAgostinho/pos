import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { Star, Plus, Trash2 } from 'lucide-react';
import { useQuality, useFnbAreas } from '../../../hooks/useFnb';

const RESULTS: Record<string, string> = { PASS: 'Conforme', WARN: 'A melhorar', FAIL: 'Não conforme' };
const RESULT_TONE: Record<string, string> = { PASS: 'text-green-700', WARN: 'text-amber-700', FAIL: 'text-red-600' };
const OUTLET_TYPES: Record<string, string> = {
  RESTAURANT: 'Restaurante', BAR: 'Bar', POOL_BAR: 'Pool Bar', COFFEE: 'Coffee Shop', ROOM_SERVICE: 'Room Service', BANQUET: 'Buffet / Banquete',
};
const empty = { subject: '', score: 5, result: 'PASS', outlet_type: '', area: '', inspector: '', notes: '' };

export default function FnbQualityView() {
  const { query, create, remove } = useQuality();
  const rows = query.data ?? [];
  const areas = useFnbAreas().data ?? [];
  const [f, setF] = useState<any>(empty);

  const add = () => {
    if (!f.subject) return;
    create.mutate({ ...f, score: Number(f.score), area: f.area || null, outlet_type: f.outlet_type || null }, { onSuccess: () => setF({ ...empty }) });
  };

  const avg = rows.length ? (rows.reduce((s: number, r: any) => s + Number(r.score || 0), 0) / rows.length).toFixed(1) : '—';

  return (
    <ClassicWindow
      title="Controlo de Qualidade F&B"
      icon={<Star size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Inspeções: {rows.length} · Média: {avg}/5</div>}
    >
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Assunto (Empratamento…)" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
          </select>
          <select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(RESULTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={f.outlet_type} onChange={(e) => setF({ ...f, outlet_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— Outlet —</option>
            {Object.entries(OUTLET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— Área —</option>
            {areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Inspetor" value={f.inspector} onChange={(e) => setF({ ...f, inspector: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <ClassicButton icon={Plus} label="Registar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id" data={rows}
            columns={[
              { header: 'Data', accessor: (r: any) => new Date(r.checked_at).toLocaleDateString('pt-PT'), width: '12%' },
              { header: 'Assunto', accessor: 'subject', width: '30%' },
              { header: 'Score', accessor: (r: any) => `${r.score} ★`, width: '10%' },
              { header: 'Resultado', accessor: (r: any) => <span className={`font-bold ${RESULT_TONE[r.result]}`}>{r.result_display}</span>, width: '16%' },
              { header: 'Área', accessor: 'area_name', width: '15%' },
              { header: 'Inspetor', accessor: 'inspector', width: '12%' },
              { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
