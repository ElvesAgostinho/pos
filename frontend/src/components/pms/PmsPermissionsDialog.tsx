import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

/**
 * "Permissões" — por ecrã, quais os perfis (eae.Profile) que o podem ver.
 * Usa o campo real `allowed_screens` (já existia no modelo, "controlo fino",
 * mas nenhum ecrã o editava ainda) e o mesmo `screenAllowed()` que o
 * DesktopShell clássico já usa para ocultar a árvore — por isso isto tem
 * efeito a sério, não é só uma lista de caixas.
 */
export default function PmsPermissionsDialog({ screenId, screenLabel, hotelName, onClose }: {
  screenId: string; screenLabel: string; hotelName: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['eae', 'profiles'],
    queryFn: async () => (await apiClient.get('eae/profiles/')).data,
  });
  const rows = Array.isArray(profiles) ? profiles : profiles?.results || [];
  // Só guarda o que o utilizador MUDOU nesta sessão do popup — o valor "de
  // fábrica" vem sempre dos dados reais (has), sem precisar de sincronizar
  // estado local com uma query assíncrona.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

  const isChecked = (p: any) => {
    if (p.id in overrides) return overrides[p.id];
    return p.full_access !== false || (p.allowed_screens || []).includes(screenId);
  };
  const toggle = (p: any) => {
    if (p.full_access !== false) { aviso(`"${p.name}" tem acesso total — desmarque "Acesso total" nos Acessos por Perfil para restringir ecrã a ecrã.`); return; }
    setOverrides((o) => ({ ...o, [p.id]: !isChecked(p) }));
  };

  const gravar = async () => {
    setSaving(true);
    try {
      for (const p of rows) {
        if (p.full_access !== false || !(p.id in overrides)) continue;
        const has = (p.allowed_screens || []).includes(screenId);
        const wants = overrides[p.id];
        if (has === wants) continue;
        const next = wants ? [...(p.allowed_screens || []), screenId] : (p.allowed_screens || []).filter((s: string) => s !== screenId);
        await apiClient.patch(`eae/profiles/${p.id}/`, { allowed_screens: next });
      }
      qc.invalidateQueries({ queryKey: ['eae', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['auth', 'access'] });
      onClose();
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-h-[75vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          Permissões - {screenLabel} - {hotelName}
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {isLoading ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : rows.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Ainda não existem perfis criados (Acessos por Perfil).</div>
          ) : (
            <table className="w-full text-[12px] border-collapse">
              <thead style={{ background: '#eef1f4' }}>
                <tr><th className="w-10 border-b border-[#c0c7d0]"></th><th className="text-left px-3 py-1.5 border-b border-[#c0c7d0] font-semibold">Grupo</th></tr>
              </thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id} className="border-b border-[#eee] hover:bg-[#f7fafd]">
                    <td className="text-center py-1.5">
                      <input type="checkbox" checked={isChecked(p)} onChange={() => toggle(p)} />
                    </td>
                    <td className={`px-3 py-1.5 ${p.full_access !== false ? 'text-gray-400 italic' : ''}`}>
                      {p.name}{p.full_access !== false && ' (acesso total)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0] flex-shrink-0">
          <button onClick={gravar} disabled={saving}
            className="flex items-center gap-2 text-[12px] font-semibold text-[#333] disabled:opacity-50 hover:text-black">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: '#2e9e4f' }}>
              <Check size={13} />
            </span>
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
