import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, X, Users } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import ClassicGrid from '../ui/ClassicGrid';
import EntityEditor from '../posconfig/EntityEditor';

const FIELD_LABEL: Record<string, string> = {
  'Nr. contribuinte': 'Nr. contribuinte', 'Nr. de identificacao': 'Nr. de identificação',
  'E-mail': 'E-mail', 'Telefone': 'Telefone',
};

/** "Controlo de duplicação" — a mesma entidade criada duas vezes (mesmo NIF,
 * documento, e-mail ou telefone). Usa `pos/marketing/entities/duplicates/`,
 * o mesmo motor que a Configuração POS já tem. */
export default function PmsDuplicateCheckDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pos', 'entities', 'duplicates'],
    queryFn: async () => (await apiClient.get('pos/marketing/entities/duplicates/')).data,
  });
  const groups: any[] = data?.groups || [];
  const rows = groups.flatMap((g: any) => g.entities.map((e: any) => ({
    ...e, field: FIELD_LABEL[g.field] || g.field, value: g.value,
  }))).filter((r: any) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));

  // "Detalhes" — abre a MESMA ficha de entidade (EntityEditor) do resto do
  // sistema, para o utilizador comparar as duas entidades duplicadas lado a
  // lado (abrindo cada uma) antes de decidir qual fundir/eliminar.
  const abrirDetalhes = async () => {
    if (!selId) { aviso('Escolha uma entidade na lista.'); return; }
    const { data: full } = await apiClient.get(`pos/marketing/entities/${selId}/`);
    setDetail(full);
  };

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-h-[75vh] bg-[#F7FAFA] border border-[#5C8891] shadow-xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#041F24' }}>
          Controlo de duplicação
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-2 bg-white border-b border-[#EEF4F5] flex items-end gap-3 text-[12px]">
          <label className="flex items-center gap-2 flex-1">
            <span className="w-[110px]">Pesquisa livre:</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus className="border border-[#7FA9B1] p-1 bg-white flex-1" />
          </label>
          <button onClick={() => refetch()}
            className="w-[110px] flex-shrink-0 flex flex-col items-center justify-center gap-1 text-white font-bold text-[13px] py-2"
            style={{ background: '#041F24' }}>
            <RefreshCw size={18} /> Pesquisar
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {isFetching ? <div className="p-4 text-gray-400 text-[12px]">A verificar…</div> : groups.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Sem entidades duplicadas encontradas.</div>
          ) : (
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined}
              onRowClick={(r: any) => setSelId(r.id)} onRowDoubleClick={() => abrirDetalhes()}
              filterable={false}
              columns={[
              { header: 'Coincide em', accessor: 'field', width: '16%' },
              { header: 'Valor', accessor: 'value', width: '18%' },
              { header: 'Código', accessor: 'code', width: '12%' },
              { header: 'Nome', accessor: 'name', width: '24%' },
              { header: 'Contacto', accessor: (r: any) => r.contact || '—', width: '15%' },
              { header: 'Cidade', accessor: (r: any) => r.city || '—', width: '15%' },
            ]} />
          )}
        </div>
        {/* Sem botão "Filtro" à parte: a pesquisa livre acima já filtra esta
            lista em tempo real — um segundo filtro seria a mesma coisa duas
            vezes (o ClassicGrid também tem o seu próprio filtro embutido,
            aqui desligado com filterable={false} para não ficar um 3º). */}
        <div className="flex items-center gap-1 px-2 py-1.5 bg-[#F7FAFA] border-t border-[#CFE3E6] text-[12px]">
          <button disabled={!selId} onClick={abrirDetalhes}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5] disabled:opacity-30 disabled:hover:bg-transparent">
            <Users size={13} /> Detalhes
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="flex items-center gap-1.5 font-semibold hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
      {detail && <EntityEditor entity={detail} onClose={() => setDetail(null)}
        onSaved={() => { setDetail(null); refetch(); }} />}
    </div>
  );
}
