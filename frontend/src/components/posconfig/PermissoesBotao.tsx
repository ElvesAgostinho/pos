import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Users, X } from 'lucide-react';

/**
 * PERMISSÕES DE UM ECRÃ — o ícone que abre "Permissões: <nome do ecrã>".
 *
 * Em vez de mandar o dono à Configuração POS › Grupos de Utilizadores para mexer
 * num grupo inteiro só para dar/tirar UMA função, o próprio ecrã mostra o direito
 * dele e deixa marcar por grupo ali mesmo. Os dados são os MESMOS PosRight/
 * PosUserGroup de sempre (pos/config/user-groups/by-right/<número>/) — isto é só
 * um atalho, não um sistema de permissões novo.
 *
 * "Gravar" só grava o que mudou (marca-se à vontade, nada vai ao servidor até
 * tocar em Gravar); "Fechar" descarta.
 */
export default function PermissoesBotao({ right, titulo }: { right: number; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState<Record<number, boolean>>({});
  const [gravando, setGravando] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['pos-right-groups', right],
    queryFn: async () => (await apiClient.get(`pos/config/user-groups/by-right/${right}/`)).data,
    enabled: aberto,
  });

  useEffect(() => {
    if (data?.groups) {
      setMarcado(Object.fromEntries(data.groups.map((g: any) => [g.id, g.has])));
    }
  }, [data]);

  const gravar = async () => {
    setGravando(true);
    try {
      const mudou = (data?.groups || []).filter((g: any) => !!marcado[g.id] !== !!g.has);
      for (const g of mudou) {
        await apiClient.post(`pos/config/user-groups/by-right/${right}/`, { group: g.id, has: marcado[g.id] });
      }
      qc.invalidateQueries({ queryKey: ['pos-right-groups', right] });
      notifyGuide({ title: 'Permissões gravadas', message: `${titulo}: ${mudou.length} grupo(s) alterado(s).` });
      setAberto(false);
    } catch (e) {
      notifyError(e);
    } finally {
      setGravando(false);
    }
  };

  return (
    <>
      <button onClick={() => setAberto(true)} title={`Permissões: ${titulo}`}
        className="w-8 h-8 flex items-center justify-center bg-[#F7FAFA] border border-[#CFE3E6] hover:bg-[#EEF4F5] text-[#041F24]">
        <Users size={16} />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center">
          <div className="w-[420px] bg-white border border-[#7FA9B1] shadow-xl">
            <div className="px-3 py-2 bg-[#041F24] text-white text-[14px] font-bold flex items-center justify-between">
              <span>Permissões — {titulo}</span>
              <button onClick={() => setAberto(false)} className="w-6 h-6 bg-[#B0392B] text-white font-bold flex items-center justify-center"><X size={14} /></button>
            </div>
            <div className="max-h-[50vh] overflow-auto">
              <div className="grid grid-cols-[1fr_60px] px-3 py-1.5 text-[11px] font-bold text-[#5C8891] bg-[#F7FAFA] border-b border-[#EEF4F5]">
                <span>Grupo</span><span className="text-center">Tem</span>
              </div>
              {(data?.groups || []).map((g: any) => (
                <label key={g.id} className="grid grid-cols-[1fr_60px] items-center px-3 py-1.5 text-[13px] border-b border-[#F7FAFA] hover:bg-[#F7FAFA] cursor-pointer">
                  <span>{g.name}</span>
                  <span className="flex justify-center">
                    <input type="checkbox" checked={!!marcado[g.id]}
                      onChange={(e) => setMarcado((m) => ({ ...m, [g.id]: e.target.checked }))} />
                  </span>
                </label>
              ))}
              {!data && <div className="px-3 py-4 text-center text-[#7FA9B1] text-[12px]">A carregar…</div>}
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#F7FAFA]">
              <button onClick={gravar} disabled={gravando || !data}
                className="py-1.5 bg-[#062A31] text-white text-[13px] font-bold disabled:opacity-50">
                {gravando ? 'A gravar…' : 'Gravar'}
              </button>
              <button onClick={() => setAberto(false)} className="py-1.5 bg-[#5C8891] text-white text-[13px] font-bold">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
