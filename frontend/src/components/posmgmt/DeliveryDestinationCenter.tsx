import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { MapPin, Plus, Trash2, Waves, Palmtree, Dumbbell, Sparkles, PartyPopper, Building2 } from 'lucide-react';

const TYPES: [string, string][] = [
  ['POOL', 'Piscina'], ['BEACH', 'Praia'], ['SPA', 'Spa'], ['GYM', 'Ginásio'],
  ['EVENT', 'Evento'], ['CONFERENCE', 'Sala de Conferência'], ['CABANA', 'Cabana'],
  ['LOUNGE', 'Lounge'], ['LOBBY', 'Lobby'], ['ROOFTOP', 'Rooftop'], ['TERRACE', 'Terraço'],
  ['GARDEN', 'Jardim'], ['GOLF', 'Campo de Golfe'], ['TENNIS', 'Campo de Ténis'],
  ['VIP', 'Zona VIP'], ['OFFICE', 'Escritório'], ['OTHER', 'Outro'],
];
const PRIORITY: [string, string][] = [['LOW', 'Baixa'], ['NORMAL', 'Normal'], ['HIGH', 'Alta'], ['URGENT', 'Urgente']];
const icon = (t: string) => t === 'POOL' ? Waves : t === 'BEACH' ? Palmtree : t === 'GYM' ? Dumbbell : t === 'SPA' ? Sparkles : (t === 'EVENT' || t === 'CONFERENCE') ? PartyPopper : Building2;
const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';

export default function DeliveryDestinationCenter() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['service-destinations'], queryFn: async () => (await apiClient.get('pos/service-destinations/')).data });
  const [f, setF] = useState<any>({ code: '', name: '', dtype: 'POOL', zone: '', location_detail: '', responsible: '', eta_minutes: 15, priority: 'NORMAL', is_active: true });
  const [filter, setFilter] = useState('');
  const save = useMutation({
    mutationFn: async () => (await apiClient.post('pos/service-destinations/', { ...f, eta_minutes: Number(f.eta_minutes) })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-destinations'] }); setF({ ...f, code: '', name: '', location_detail: '' }); },
  });
  const del = useMutation({
    mutationFn: async (id: number) => apiClient.delete(`pos/service-destinations/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-destinations'] }),
  });
  const rows = (data || []).filter((d: any) => !filter || d.dtype === filter);

  return (
    <ClassicWindow title="Delivery Destination Center — Destinos de Serviço" icon={<MapPin size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Locais de entrega além de Mesa/Quarto (Piscina, Praia, Spa, Evento…) · usados no POS e no KDS</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-3">
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Novo destino</div>
          <div className="flex flex-wrap items-end gap-2 text-[12px]">
            <label className="flex flex-col">Código<input className="border border-[#c0c0c0] px-2 py-1 w-32" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></label>
            <label className="flex flex-col">Nome<input className="border border-[#c0c0c0] px-2 py-1 w-44" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
            <label className="flex flex-col">Tipo
              <select className="border border-[#c0c0c0] px-2 py-1" value={f.dtype} onChange={e => setF({ ...f, dtype: e.target.value })}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="flex flex-col">Zona<input className="border border-[#c0c0c0] px-2 py-1 w-28" value={f.zone} onChange={e => setF({ ...f, zone: e.target.value })} /></label>
            <label className="flex flex-col">Detalhe (nº/espreguiçadeira/cabana)<input className="border border-[#c0c0c0] px-2 py-1 w-52" value={f.location_detail} onChange={e => setF({ ...f, location_detail: e.target.value })} /></label>
            <label className="flex flex-col">Responsável<input className="border border-[#c0c0c0] px-2 py-1 w-36" value={f.responsible} onChange={e => setF({ ...f, responsible: e.target.value })} /></label>
            <label className="flex flex-col">ETA (min)<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-20" value={f.eta_minutes} onChange={e => setF({ ...f, eta_minutes: e.target.value })} /></label>
            <label className="flex flex-col">Prioridade
              <select className="border border-[#c0c0c0] px-2 py-1" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
                {PRIORITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <button className={btn} disabled={!f.code || !f.name} onClick={() => save.mutate()}><Plus size={13} /> Adicionar</button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-gray-600">Filtrar:</span>
          <select className="border border-[#c0c0c0] px-2 py-1" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-gray-500">{rows.length} destino(s)</span>
        </div>

        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[130px_1fr_120px_120px_90px_80px_40px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1">
            <span>Código</span><span>Destino</span><span>Zona</span><span>Responsável</span><span>Prioridade</span><span>Estado</span><span></span>
          </div>
          {rows.map((d: any) => {
            const Ico = icon(d.dtype);
            return (
              <div key={d.id} className="grid grid-cols-[130px_1fr_120px_120px_90px_80px_40px] px-2 py-1 border-b border-[#eee] items-center">
                <span className="font-bold">{d.code}</span>
                <span className="flex items-center gap-1.5"><Ico size={13} className="text-[#1565c0]" /> {d.label} <span className="text-gray-400">· {d.dtype_display}</span></span>
                <span>{d.zone || '—'}</span><span>{d.responsible || '—'}</span>
                <span>{PRIORITY.find(p => p[0] === d.priority)?.[1]}</span>
                <span>{d.is_active ? 'Ativo' : 'Inativo'}</span>
                <button className="text-red-600" onClick={() => del.mutate(d.id)}><Trash2 size={14} /></button>
              </div>
            );
          })}
          {rows.length === 0 && <div className="px-3 py-3 text-gray-500">Sem destinos. Adicione Piscina, Praia, Spa, Evento…</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
