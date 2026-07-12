import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { ShieldCheck, Save, Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { MODULES } from '../../config/navigation';

/**
 * Acessos por Perfil — o dono define a que CENTROS cada perfil acede.
 * O que não é autorizado é OCULTADO por completo na árvore do funcionário.
 */
export default function ProfileAccessView() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({ queryKey: ['eae', 'profiles'], queryFn: async () => (await apiClient.get('eae/profiles/')).data });
  const [selId, setSelId] = useState<number | null>(null);
  const sel = profiles.find((p: any) => p.id === selId);
  const [newName, setNewName] = useState('');

  const save = useMutation({
    mutationFn: (patch: any) => apiClient.patch(`eae/profiles/${selId}/`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eae', 'profiles'] }); alert('Acessos guardados.'); },
    onError: (e: any) => alert(JSON.stringify(e?.response?.data)),
  });
  const createProfile = useMutation({
    mutationFn: (name: string) => apiClient.post('eae/profiles/', { code: name.slice(0, 18).toUpperCase().replace(/\s+/g, '_'), name, full_access: false, allowed_modules: [] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eae', 'profiles'] }); setNewName(''); },
    onError: (e: any) => alert(JSON.stringify(e?.response?.data)),
  });

  // Estado editável do perfil selecionado
  const [full, setFull] = useState(true);
  const [mods, setMods] = useState<string[]>([]);
  const load = (p: any) => { setSelId(p.id); setFull(p.full_access !== false); setMods(p.allowed_modules || []); };
  const toggleMod = (key: string) => setMods((m) => m.includes(key) ? m.filter((x) => x !== key) : [...m, key]);

  return (
    <ClassicWindow title="Acessos por Perfil (Permissões)" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">O funcionário só vê os centros autorizados — o resto é ocultado por completo</div>}>
      <div className="flex h-full">
        {/* Perfis */}
        <div className="w-1/3 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex items-end gap-1 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <input placeholder="Novo perfil (ex.: Rececionista)" value={newName} onChange={(e) => setNewName(e.target.value)} className="border border-[#a0a0a0] p-1 flex-1" />
            <ClassicButton icon={Plus} label="Criar" onClick={() => newName.trim() && createProfile.mutate(newName.trim())} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={profiles} selectedRowId={selId ?? undefined} onRowClick={load} columns={[
              { header: 'Perfil', accessor: 'name', width: '60%' },
              { header: 'Acesso', accessor: (r: any) => r.full_access !== false ? 'Total' : `${(r.allowed_modules || []).length} centro(s)`, width: '40%' },
            ]} />
          </div>
        </div>
        {/* Editor de acessos */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {sel ? (
            <>
              <div className="p-2 bg-[#eef4fb] border-b border-[#a0a0a0] text-[11px] flex items-center justify-between">
                <span className="font-bold">{sel.name}</span>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Acesso total (vê tudo)</label>
              </div>
              <div className="flex-1 overflow-auto p-2">
                <div className={`text-[11px] text-gray-500 mb-2 ${full ? '' : 'font-bold text-[#1e3f66]'}`}>
                  {full ? 'Este perfil vê todos os centros. Desmarque "Acesso total" para restringir.' : 'Escolha os centros que este perfil pode ver:'}
                </div>
                {!full && (
                  <div className="grid grid-cols-2 gap-1">
                    {MODULES.map((m) => (
                      <label key={m.key} className={`flex items-center gap-2 px-2 py-1.5 border text-[11px] cursor-pointer ${mods.includes(m.key) ? 'bg-[#eafaf0] border-[#8fce9e]' : 'bg-white border-[#d0d0d0]'}`}>
                        <input type="checkbox" checked={mods.includes(m.key)} onChange={() => toggleMod(m.key)} />
                        {m.title.replace(/^\d+\s·\s/, '')}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-[#a0a0a0]">
                <ClassicButton icon={Save} label="Guardar acessos" onClick={() => save.mutate({ full_access: full, allowed_modules: full ? [] : mods })} />
              </div>
            </>
          ) : <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Selecione um perfil para definir os acessos.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
