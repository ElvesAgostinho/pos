import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, X, Users } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import ClassicGrid from '../ui/ClassicGrid';

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);

const FIELD_LABEL: Record<string, string> = {
  'Nr. contribuinte': 'Nr. contribuinte', 'Nr. de identificacao': 'Nr. de identificação',
  'E-mail': 'E-mail', 'Telefone': 'Telefone',
};

/** "Controlo de duplicação" — a mesma entidade criada duas vezes (mesmo NIF,
 * documento, e-mail ou telefone). Usa `pos/marketing/entities/duplicates/`,
 * o mesmo motor que a Configuração POS já tem. */
export default function PmsDuplicateCheckDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pos', 'entities', 'duplicates'],
    queryFn: async () => (await apiClient.get('pos/marketing/entities/duplicates/')).data,
  });
  const groups: any[] = data?.groups || [];
  const rows = groups.flatMap((g: any) => g.entities.map((e: any) => ({
    ...e, field: FIELD_LABEL[g.field] || g.field, value: g.value,
  }))).filter((r: any) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-h-[75vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          Controlo de duplicação
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-2 bg-white border-b border-[#d0d0d0] flex items-end gap-3 text-[12px]">
          <label className="flex items-center gap-2 flex-1">
            <span className="w-[110px]">Pesquisa livre:</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus className="border border-[#a0a0a0] p-1 bg-white flex-1" />
          </label>
          <button onClick={() => refetch()}
            className="w-[110px] flex-shrink-0 flex flex-col items-center justify-center gap-1 text-white font-bold text-[13px] py-2"
            style={{ background: '#2b2b2b' }}>
            <RefreshCw size={18} /> Pesquisar
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {isFetching ? <div className="p-4 text-gray-400 text-[12px]">A verificar…</div> : groups.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Sem entidades duplicadas encontradas.</div>
          ) : (
            <ClassicGrid rowKey="id" data={rows} columns={[
              { header: 'Coincide em', accessor: 'field', width: '16%' },
              { header: 'Valor', accessor: 'value', width: '18%' },
              { header: 'Código', accessor: 'code', width: '12%' },
              { header: 'Nome', accessor: 'name', width: '24%' },
              { header: 'Contacto', accessor: (r: any) => r.contact || '—', width: '15%' },
              { header: 'Cidade', accessor: (r: any) => r.city || '—', width: '15%' },
            ]} />
          )}
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5 bg-[#e8e8e8] border-t border-[#c0c0c0] text-[12px]">
          <button onClick={() => naoConstruido('Detalhes')} className="flex items-center gap-1.5 px-2 py-1 text-gray-400 hover:bg-[#ddd]">
            <Users size={13} /> Detalhes
          </button>
          <button onClick={() => naoConstruido('Filtro')} className="flex items-center gap-1.5 px-2 py-1 text-gray-400 hover:bg-[#ddd]">
            Filtro
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="flex items-center gap-1.5 font-semibold hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white">
              <X size={9} strokeWidth={3} />
            </span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
