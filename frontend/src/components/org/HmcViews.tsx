import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Building2, Layers, Target, Wallet, Wrench, LayoutDashboard, Plus, Trash2 } from 'lucide-react';
import { hmcApi } from '../../api/hmc';

const qk = (r: string, p?: any) => ['hmc', r, p ?? {}];
const useHotels = () => useQuery({ queryKey: ['hmc', 'hotels'], queryFn: () => hmcApi.hotels() });

function useCrud(resource: keyof typeof hmcApi, params?: any) {
  const qc = useQueryClient();
  const api = hmcApi[resource] as any;
  const inval = () => qc.invalidateQueries({ queryKey: ['hmc', resource] });
  return {
    rows: (useQuery({ queryKey: qk(resource as string, params), queryFn: () => api.list(params) }).data ?? []) as any[],
    create: useMutation({ mutationFn: (p: any) => api.create(p), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: number) => api.remove(id), onSuccess: inval }),
  };
}

function HotelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: hotels = [] } = useHotels();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
      <option value="">Hotel…</option>
      {hotels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
    </select>
  );
}

// -------- Dashboard --------
export function HmcDashboardView() {
  const { data: d, isLoading } = useQuery({ queryKey: ['hmc', 'dashboard'], queryFn: () => hmcApi.dashboard() });
  const Card = ({ label, value }: any) => (
    <div className="bg-white border border-[#a0a0a0] p-3"><div className="text-[10px] text-gray-500 uppercase">{label}</div><div className="text-2xl font-bold text-[#1e3f66]">{value ?? '—'}</div></div>
  );
  return (
    <ClassicWindow title="Hotel Management — Dashboard" icon={<LayoutDashboard size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Centro 04 · estrutura física e dimensões de gestão</div>}>
      <div className="p-3">
        {isLoading || !d ? <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : (
          <div className="grid grid-cols-4 gap-2">
            <Card label="Hotéis" value={d.hotels} /><Card label="Edifícios" value={d.buildings} />
            <Card label="Pisos" value={d.floors} /><Card label="Quartos" value={d.rooms} />
            <Card label="Departamentos" value={d.departments} /><Card label="Outlets" value={d.outlets} />
            <Card label="Centros de lucro" value={d.profit_centers} /><Card label="Centros de custo" value={d.cost_centers} />
            <Card label="Recursos" value={d.resources} /><Card label="Recursos em manutenção" value={d.resources_maintenance} />
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}

// -------- Edifícios --------
export function HmcBuildingsView() {
  const { rows, create, remove } = useCrud('buildings');
  const [f, setF] = useState<any>({ hotel: '', code: '', name: '', description: '' });
  const add = () => { if (!f.code || !f.name) return; create.mutate({ ...f, hotel: f.hotel ? Number(f.hotel) : undefined }, { onSuccess: () => setF({ hotel: f.hotel, code: '', name: '', description: '' }) }); };
  return (
    <ClassicWindow title="Blocos / Torres / Edifícios" icon={<Building2 size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Edifícios: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <HotelSelect value={f.hotel} onChange={(v) => setF({ ...f, hotel: v })} />
          <input placeholder="Código" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Código', accessor: 'code', width: '14%' }, { header: 'Edifício', accessor: 'name', width: '30%' },
            { header: 'Hotel', accessor: 'hotel_name', width: '24%' }, { header: 'Pisos', accessor: 'floors_count', width: '12%' },
            { header: 'Descrição', accessor: 'description', width: '14%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// -------- Pisos --------
export function HmcFloorsView() {
  const buildings = useCrud('buildings').rows;
  const [bld, setBld] = useState('');
  const { rows, create, remove } = useCrud('floors', bld ? { building: bld } : undefined);
  const [f, setF] = useState<any>({ number: '', name: '' });
  const add = () => { const building = bld || buildings[0]?.id; if (!building) return; create.mutate({ building: Number(building), number: Number(f.number) || 0, name: f.name }, { onSuccess: () => setF({ number: '', name: '' }) }); };
  return (
    <ClassicWindow title="Pisos & Alas" icon={<Layers size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Pisos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <select value={bld} onChange={(e) => setBld(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Todos os edifícios</option>{buildings.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="text-gray-400">|</span>
          <input type="number" placeholder="Nº piso" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <input placeholder="Nome/Ala" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Piso', accessor: 'number', width: '15%' }, { header: 'Nome/Ala', accessor: (r: any) => r.name || '—', width: '40%' },
            { header: 'Edifício', accessor: 'building_name', width: '39%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// -------- Centros de lucro / custo (genérico) --------
function CentersView({ resource, title, icon, extraField }: { resource: 'profitCenters' | 'costCenters'; title: string; icon: any; extraField?: string }) {
  const { rows, create, remove } = useCrud(resource);
  const [f, setF] = useState<any>({ hotel: '', code: '', name: '', manager: '' });
  const add = () => { if (!f.code || !f.name) return; create.mutate({ ...f, hotel: f.hotel ? Number(f.hotel) : undefined }, { onSuccess: () => setF({ hotel: f.hotel, code: '', name: '', manager: '' }) }); };
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">Centros: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <HotelSelect value={f.hotel} onChange={(v) => setF({ ...f, hotel: v })} />
          <input placeholder="Código" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          {extraField === 'manager' && <input placeholder="Responsável" value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })} className="border border-[#a0a0a0] p-1" />}
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Código', accessor: 'code', width: '20%' }, { header: 'Nome', accessor: 'name', width: extraField === 'manager' ? '44%' : '68%' },
            ...(extraField === 'manager' ? [{ header: 'Responsável', accessor: (r: any) => r.manager || '—', width: '24%' }] : []),
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
export const HmcProfitCentersView = () => <CentersView resource="profitCenters" title="Centros de Lucro" icon={<Target size={14} className="text-gray-300" />} extraField="manager" />;
export const HmcCostCentersView = () => <CentersView resource="costCenters" title="Centros de Custo" icon={<Wallet size={14} className="text-gray-300" />} />;

// -------- Recursos & Equipamentos --------
const RES_TYPES: Record<string, string> = { EQUIPMENT: 'Equipamento', VEHICLE: 'Viatura', IT: 'Informática', FURNITURE: 'Mobiliário', HVAC: 'AVAC', OTHER: 'Outro' };
const RES_STATUS: Record<string, string> = { ACTIVE: 'Operacional', MAINTENANCE: 'Em manutenção', RETIRED: 'Abatido' };
export function HmcResourcesView() {
  const { rows, create, remove } = useCrud('resources');
  const [f, setF] = useState<any>({ hotel: '', code: '', name: '', resource_type: 'EQUIPMENT', location: '', status: 'ACTIVE' });
  const add = () => { if (!f.code || !f.name) return; create.mutate({ ...f, hotel: f.hotel ? Number(f.hotel) : undefined }, { onSuccess: () => setF({ hotel: f.hotel, code: '', name: '', resource_type: 'EQUIPMENT', location: '', status: 'ACTIVE' }) }); };
  const tone = (s: string) => s === 'ACTIVE' ? 'text-green-700' : s === 'MAINTENANCE' ? 'text-amber-700' : 'text-gray-500';
  return (
    <ClassicWindow title="Recursos & Equipamentos" icon={<Wrench size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Recursos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <HotelSelect value={f.hotel} onChange={(v) => setF({ ...f, hotel: v })} />
          <input placeholder="Código" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={f.resource_type} onChange={(e) => setF({ ...f, resource_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(RES_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Localização" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Código', accessor: 'code', width: '12%' }, { header: 'Recurso', accessor: 'name', width: '30%' },
            { header: 'Tipo', accessor: (r: any) => RES_TYPES[r.resource_type] || r.resource_type, width: '16%' },
            { header: 'Localização', accessor: (r: any) => r.location || '—', width: '18%' },
            { header: 'Estado', accessor: (r: any) => <span className={`font-bold ${tone(r.status)}`}>{RES_STATUS[r.status] || r.status}</span>, width: '18%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
