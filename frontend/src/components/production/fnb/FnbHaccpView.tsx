import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { useHaccp, useFnbAreas } from '../../../hooks/useFnb';

const CHECK_TYPES: Record<string, string> = {
  TEMP_FRIDGE: 'Temp. Frio', TEMP_FREEZER: 'Temp. Congelação', TEMP_COOKING: 'Temp. Confeção',
  TEMP_HOLDING: 'Temp. Manutenção', RECEIVING: 'Receção', CLEANING: 'Limpeza', HYGIENE: 'Higiene',
};
const empty = { check_type: 'TEMP_FRIDGE', location_label: '', measured_value: '', unit: '°C', limit_min: '', limit_max: '', compliant: true, checked_by: '', corrective_action: '', area: '' };

export default function FnbHaccpView() {
  const { query, create, remove } = useHaccp();
  const rows = query.data ?? [];
  const areas = useFnbAreas().data ?? [];
  const [f, setF] = useState<any>(empty);

  const add = () => {
    if (!f.location_label) return;
    create.mutate({
      ...f, area: f.area || null,
      measured_value: f.measured_value === '' ? null : Number(f.measured_value),
      limit_min: f.limit_min === '' ? null : Number(f.limit_min),
      limit_max: f.limit_max === '' ? null : Number(f.limit_max),
    }, { onSuccess: () => setF({ ...empty }) });
  };

  const nonCompliant = rows.filter((r: any) => !r.compliant).length;

  return (
    <ClassicWindow
      title="HACCP — Registo de Controlo"
      icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Registos: {rows.length} · Não conformes: <span className={nonCompliant ? 'text-red-600 font-bold' : ''}>{nonCompliant}</span></div>}
    >
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <select value={f.check_type} onChange={(e) => setF({ ...f, check_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(CHECK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Local (Câmara 2…)" value={f.location_label} onChange={(e) => setF({ ...f, location_label: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
          <input type="number" placeholder="Valor" value={f.measured_value} onChange={(e) => setF({ ...f, measured_value: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input placeholder="Un." value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className="border border-[#a0a0a0] p-1 w-12" />
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— Área —</option>
            {areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.compliant} onChange={(e) => setF({ ...f, compliant: e.target.checked })} />Conforme</label>
          <input placeholder="Responsável" value={f.checked_by} onChange={(e) => setF({ ...f, checked_by: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <ClassicButton icon={Plus} label="Registar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id" data={rows}
            columns={[
              { header: 'Data/hora', accessor: (r: any) => new Date(r.checked_at).toLocaleString('pt-PT'), width: '17%' },
              { header: 'Tipo', accessor: (r: any) => r.check_type_display, width: '16%' },
              { header: 'Local', accessor: 'location_label', width: '18%' },
              { header: 'Valor', accessor: (r: any) => r.measured_value != null ? `${r.measured_value} ${r.unit}` : '—', width: '12%' },
              { header: 'Área', accessor: 'area_name', width: '15%' },
              { header: 'Estado', accessor: (r: any) => <span className={r.compliant ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{r.compliant ? 'Conforme' : 'Não conforme'}</span>, width: '12%' },
              { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
