import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';

/**
 * AGRUPAR MESAS — o grupo de 12 que junta três mesas de 4.
 *
 * Escolhem-se as mesas, o motor cria o GRUPO com UMA conta (tudo o que se lançar em
 * qualquer uma cai na mesma conta) e as mesas ficam ocupadas juntas. DESAGRUPAR
 * devolve as mesas — a conta fica na principal. É o motor POSTableGroup do backoffice.
 */
export default function GroupTables({ setor, onOpenTicket, onClose }: {
  setor: any; onOpenTicket: (id: number) => void; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<number[]>([]);

  const { data: mesas = [] } = useQuery({
    queryKey: ['pos-tables', setor?.id],
    queryFn: async () => {
      const r = await apiClient.get('pos/tables/', { params: { sector: setor.id } });
      return (r.data?.results || r.data || []) as any[];
    },
  });
  const { data: grupos = [] } = useQuery({
    queryKey: ['pos-groups', setor?.outlet],
    queryFn: async () => {
      const r = await apiClient.get('pos/table-groups/', { params: { outlet: setor?.outlet } });
      return (r.data?.results || r.data || []) as any[];
    },
  });
  const inval = () => {
    qc.invalidateQueries({ queryKey: ['pos-groups'] });
    qc.invalidateQueries({ queryKey: ['pos-tables'] });
    qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
  };

  const agrupar = async () => {
    try {
      const r = await apiClient.post('pos/table-groups/', { table_ids: sel });
      inval(); setSel([]);
      if (r.data?.ticket_id) { onClose(); onOpenTicket(r.data.ticket_id); }
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível agrupar.'); }
  };
  const desagrupar = async (g: any) => {
    if (!window.confirm(`Desagrupar "${g.name}"? A conta fica na mesa principal.`)) return;
    try { await apiClient.post(`pos/table-groups/${g.id}/ungroup/`, {}); inval(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro.'); }
  };

  return (
    <Window title="Agrupar Mesas (grupos grandes)" width={640} onClose={onClose} tone="#b39100">
      <div className="p-3 bg-[#1a1a1a] flex flex-col gap-3" style={{ maxHeight: '68vh' }}>
        <div className="text-white/60 text-[13px]">
          Toque nas mesas LIVRES a juntar (mín. 2) — tudo o que se lançar cai numa conta só.
        </div>
        <div className="grid grid-cols-5 gap-2 overflow-auto" style={{ maxHeight: '30vh' }}>
          {(mesas as any[]).map((m: any) => {
            const livre = m.status === 'FREE' && !m.group_name;
            const marcada = sel.includes(m.id);
            return (
              <button key={m.id} disabled={!livre}
                onClick={() => setSel(marcada ? sel.filter((x) => x !== m.id) : [...sel, m.id])}
                className={`h-[64px] rounded font-bold text-[16px] disabled:opacity-30
                  ${marcada ? 'bg-[#b39100] text-black ring-2 ring-white' : 'bg-[#0f8b8d] text-white'}`}>
                {m.table_number}
                <span className="block text-[11px] font-normal opacity-80">
                  {m.group_name ? m.group_name : livre ? `${m.seats} lug.` : 'ocupada'}
                </span>
              </button>
            );
          })}
        </div>
        <button onClick={agrupar} disabled={sel.length < 2}
          className="h-[52px] bg-[#1f7a34] text-white font-bold rounded disabled:opacity-40">
          ⛓ Agrupar {sel.length >= 2 ? `${sel.length} mesas` : '(escolha 2+)'}
        </button>

        {grupos.filter((g: any) => g.is_active !== false).length > 0 && (
          <>
            <div className="text-white/60 text-[13px] border-t border-white/10 pt-2">Grupos ativos:</div>
            <div className="overflow-auto" style={{ maxHeight: '18vh' }}>
              {grupos.filter((g: any) => g.is_active !== false).map((g: any) => (
                <div key={g.id} className="flex items-center justify-between px-3 py-2 text-white
                  text-[14px] border-b border-black/30">
                  <span><b>{g.name}</b></span>
                  <span className="flex gap-1">
                    {g.ticket_id || g.ticket ? (
                      <button onClick={() => { onClose(); onOpenTicket(g.ticket_id || g.ticket); }}
                        className="h-[34px] px-3 bg-[#0f8b8d] text-white text-[13px] font-bold rounded">Abrir conta</button>
                    ) : null}
                    <button onClick={() => desagrupar(g)}
                      className="h-[34px] px-3 bg-[#8a0f0f] text-white text-[13px] font-bold rounded">Desagrupar</button>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Window>
  );
}
