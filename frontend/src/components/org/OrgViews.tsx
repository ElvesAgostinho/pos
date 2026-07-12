import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Building2, Hotel as HotelIcon, Layers, MapPin, Plus, Trash2 } from 'lucide-react';
import { useOrgList, useOrgCreate, useOrgDelete } from '../../hooks/useOrg';

export function CompaniesView() {
  const { data = [] } = useOrgList('companies');
  const create = useOrgCreate('companies');
  const del = useOrgDelete('companies');
  const [d, setD] = useState<any>({ name: '', tax_id: '' });
  const add = () => { if (!d.name) return; create.mutate(d, { onSuccess: () => setD({ name: '', tax_id: '' }) }); };
  return (
    <ClassicWindow title="Empresas (Organização)" icon={<Building2 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{data.length} empresa(s)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome comercial" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="NIF" value={d.tax_id} onChange={(e) => setD({ ...d, tax_id: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
          <ClassicButton icon={Plus} label="Adicionar Empresa" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={data} columns={[
            { header: 'Empresa', accessor: 'name', width: '45%' },
            { header: 'NIF', accessor: (r: any) => r.tax_id || '—', width: '30%' },
            { header: 'Grupo', accessor: (r: any) => r.group_name || '—', width: '17%' },
            { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function HotelsView() {
  const { data = [] } = useOrgList('hotels');
  const { data: companies = [] } = useOrgList('companies');
  const create = useOrgCreate('hotels');
  const del = useOrgDelete('hotels');
  const [d, setD] = useState<any>({ name: '', location: '', company: '' });
  const add = () => { if (!d.name) return; create.mutate({ ...d, company: d.company || undefined }, { onSuccess: () => setD({ name: '', location: '', company: '' }) }); };
  return (
    <ClassicWindow title="Hotéis (Organização)" icon={<HotelIcon size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{data.length} hotel(éis)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome do hotel" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Localização" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— empresa (auto) —</option>{companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar Hotel" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={data} columns={[
            { header: 'Hotel', accessor: 'name', width: '38%' },
            { header: 'Localização', accessor: (r: any) => r.location || '—', width: '28%' },
            { header: 'Empresa', accessor: (r: any) => r.company_name || '—', width: '26%' },
            { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function DepartmentsOrgView() {
  const { data = [] } = useOrgList('departments');
  const { data: hotels = [] } = useOrgList('hotels');
  const create = useOrgCreate('departments');
  const del = useOrgDelete('departments');
  const [d, setD] = useState<any>({ name: '', hotel: '' });
  const add = () => { if (!d.name) return; create.mutate({ ...d, hotel: d.hotel || undefined }, { onSuccess: () => setD({ name: '', hotel: '' }) }); };
  return (
    <ClassicWindow title="Departamentos (Organização)" icon={<Layers size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{data.length} departamento(s)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={d.hotel} onChange={(e) => setD({ ...d, hotel: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— hotel (auto) —</option>{hotels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar Departamento" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={data} columns={[
            { header: 'Departamento', accessor: 'name', width: '55%' },
            { header: 'Hotel', accessor: (r: any) => r.hotel_name || '—', width: '37%' },
            { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function AreasView() {
  const { data = [] } = useOrgList('areas');
  const { data: departments = [] } = useOrgList('departments');
  const create = useOrgCreate('areas');
  const del = useOrgDelete('areas');
  const [d, setD] = useState<any>({ name: '', department: '' });
  const add = () => { if (!d.name) return; create.mutate({ ...d, department: d.department || undefined }, { onSuccess: () => setD({ name: '', department: '' }) }); };
  return (
    <ClassicWindow title="Áreas (Organização)" icon={<MapPin size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{data.length} área(s)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nome" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— departamento (auto) —</option>{departments.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <ClassicButton icon={Plus} label="Adicionar Área" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={data} columns={[
            { header: 'Área', accessor: 'name', width: '55%' },
            { header: 'Departamento', accessor: (r: any) => r.department_name || '—', width: '37%' },
            { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
