import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { AlertTriangle, Save, Search } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

/**
 * Alergénios — catálogo (os 14 de declaração obrigatória) e atribuição por artigo.
 * O que aqui se marca aparece no POS e nas fichas técnicas/menus.
 */
export default function AllergensView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selItem, setSelItem] = useState<any>(null);
  const [checked, setChecked] = useState<number[]>([]);

  const { data: allergens = [] } = useQuery({
    queryKey: ['prod', 'allergens'],
    queryFn: async () => (await apiClient.get('production/allergens/')).data,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['prod', 'items', search],
    queryFn: async () => {
      const d = (await apiClient.get('inventory/items/', { params: { search: search || undefined } })).data;
      return d?.results || d || [];
    },
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ['prod', 'item-profiles'],
    queryFn: async () => {
      const d = (await apiClient.get('production/item-profiles/')).data;
      return d?.results || d || [];
    },
  });

  const profileOf = (itemId: number) => profiles.find((p: any) => p.item === itemId);

  const pick = (it: any) => {
    setSelItem(it);
    const p = profileOf(it.id);
    setChecked((p?.allergens || []).map((a: any) => a.id));
  };

  const save = useMutation({
    mutationFn: async () => {
      const p = profileOf(selItem.id);
      if (p) return (await apiClient.patch(`production/item-profiles/${p.id}/`, { allergen_ids: checked })).data;
      return (await apiClient.post('production/item-profiles/', { item: selItem.id, allergen_ids: checked })).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prod', 'item-profiles'] }); alert('Alergénios guardados.'); },
    onError: notifyError,
  });

  const toggle = (id: number) => setChecked((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);

  return (
    <ClassicWindow title="Alergénios (declaração obrigatória)" icon={<AlertTriangle size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{allergens.length} alergénios no catálogo · {profiles.length} artigo(s) com alergénios declarados · aparece no POS e nas fichas técnicas</div>}>
      <div className="flex h-full">
        {/* Artigos */}
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex items-center gap-1 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <Search size={12} className="text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar artigo…" className="border border-[#a0a0a0] p-1 flex-1 bg-white" />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={items} selectedRowId={selItem?.id} onRowClick={pick} columns={[
              { header: 'Código', accessor: 'code', width: '18%' },
              { header: 'Artigo', accessor: 'name', width: '46%' },
              { header: 'Alergénios', accessor: (r: any) => {
                const p = profileOf(r.id);
                const n = p?.allergens?.length || 0;
                return n
                  ? <span className="text-[#c0392b] font-bold">⚠ {p.allergens.map((a: any) => a.name).join(', ')}</span>
                  : <span className="text-gray-400">— nenhum declarado —</span>;
              }, width: '36%' },
            ]} />
          </div>
        </div>

        {/* Atribuição */}
        <div className="flex-1 flex flex-col">
          {selItem ? (
            <>
              <div className="px-3 py-2 bg-[#eef4fb] border-b border-[#a0a0a0] text-[11px]">
                <b>{selItem.code} · {selItem.name}</b> — marque os alergénios presentes neste artigo.
              </div>
              <div className="flex-1 overflow-auto p-3 grid grid-cols-2 gap-1.5">
                {allergens.map((a: any) => (
                  <label key={a.id} className={`flex items-center gap-2 px-2 py-2 border text-[11px] cursor-pointer ${checked.includes(a.id) ? 'bg-[#fdeaea] border-[#e0a0a0] font-bold text-[#a01818]' : 'bg-white border-[#d0d0d0]'}`}>
                    <input type="checkbox" checked={checked.includes(a.id)} onChange={() => toggle(a.id)} />
                    {checked.includes(a.id) && <AlertTriangle size={12} className="text-[#c0392b]" />}
                    {a.name}
                  </label>
                ))}
              </div>
              <div className="p-2 border-t border-[#a0a0a0] flex items-center gap-2">
                <ClassicButton icon={Save} label="Guardar alergénios" onClick={() => save.mutate()} />
                <span className="text-[11px] text-gray-500">{checked.length} marcado(s)</span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px] px-6 text-center">
              Escolha um artigo à esquerda para declarar os seus alergénios.<br />
              <span className="text-[11px]">Os alergénios declarados aparecem no POS (aviso ao operador) e nas fichas técnicas/menus.</span>
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
