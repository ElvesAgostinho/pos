import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar } from '../../ui/dialogo';

/** Lista Telefónica — ramais/departamentos internos, para a receção transferir
    uma chamada sem perguntar a ninguém. Modelo novo e pequeno
    (pms.PhoneDirectoryEntry); não havia nada parecido no resto do sistema. */

const blank = { name: '', department: '', extension: '', phone: '', notes: '', is_active: true };

export default function PmsPhoneDirectoryView() {
  const qc = useQueryClient();
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'phone-directory'],
    queryFn: async () => (await apiClient.get('pms/phone-directory/')).data,
  });
  const rows: any[] = Array.isArray(data) ? data : data?.results || [];

  const select = (r: any) => { setSelId(r.id); setForm(r); };
  const novo = () => { setSelId(null); setForm(blank); };

  const save = async () => {
    if (!form.name?.trim()) { aviso('O nome é obrigatório.'); return; }
    try {
      const payload = { ...form };
      if (selId) await apiClient.patch(`pms/phone-directory/${selId}/`, payload);
      else await apiClient.post('pms/phone-directory/', payload);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); novo();
    } catch (e) { notifyError(e); }
  };

  const remove = async () => {
    if (!selId) return;
    if (!(await confirmar(`Eliminar "${form.name}"?`))) return;
    try { await apiClient.delete(`pms/phone-directory/${selId}/`); refetch(); novo(); } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={[
            { header: 'Nome', accessor: 'name', width: '28%' },
            { header: 'Departamento', accessor: (r: any) => r.department || '—', width: '24%' },
            { header: 'Ramal', accessor: (r: any) => r.extension || '—', width: '16%' },
            { header: 'Telefone', accessor: (r: any) => r.phone || '—', width: '20%' },
            { header: 'Ativo', accessor: (r: any) => (r.is_active ? 'Sim' : 'Não'), width: '12%' },
          ]} />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px] overflow-auto">
          <div className="font-bold text-[#062A31]">{selId ? 'Editar Contacto' : 'Novo Contacto'}</div>
          <label className="flex flex-col">Nome<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <label className="flex flex-col">Departamento<input value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inp} /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Ramal<input value={form.extension || ''} onChange={(e) => setForm({ ...form, extension: e.target.value })} className={inp} /></label>
            <label className="flex-1 flex flex-col">Telefone<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></label>
          </div>
          <label className="flex flex-col">Notas<input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} /></label>
          <label className="flex items-center gap-2 py-1 cursor-pointer">
            <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4" />
            Ativo
          </label>
        </div>
      </div>
      <Toolbar actions={[
        { label: 'Novo', icon: '＋', color: '#062A31', onClick: novo },
        { label: 'Gravar', icon: '💾', color: '#062A31', onClick: save },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !selId, color: '#B0392B' },
      ]} />
    </div>
  );
}
