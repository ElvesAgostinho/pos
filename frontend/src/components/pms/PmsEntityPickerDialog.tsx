import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, RefreshCw, Plus, Pencil, Hand, User, Copy, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import ClassicGrid from '../ui/ClassicGrid';
import EntityEditor from '../posconfig/EntityEditor';
import PmsDuplicateCheckDialog from './PmsDuplicateCheckDialog';

const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);

/**
 * "Entidades" — pesquisar/criar/editar um hóspede. NÃO é um cadastro à parte:
 * usa exatamente o mesmo `pos/marketing/entities/` (mdm.Customer) que a
 * Configuração POS já usa, e o MESMO editor (`EntityEditor`, "Nova entidade").
 * Só a moldura (título escuro, botões) é do PMS — os dados e a lógica são
 * ligados, não duplicados.
 */
export default function PmsEntityPickerDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (entity: any) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'S' | 'A'>('S');
  const [entityType, setEntityType] = useState('');
  const [q, setQ] = useState('');
  const [adv, setAdv] = useState<any>({});
  const [applied, setApplied] = useState<any>({});
  const [selId, setSelId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [showDups, setShowDups] = useState(false);

  const { data: tipos } = useQuery({
    queryKey: ['pos', 'customer-types'],
    queryFn: async () => (await apiClient.get('pos/config/customer-types/')).data,
  });
  const tipoList = Array.isArray(tipos) ? tipos : tipos?.results || [];

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pos', 'entities', 'picker', applied],
    queryFn: async () => (await apiClient.get('pos/marketing/entities/', { params: applied })).data,
  });
  const rows = Array.isArray(data) ? data : data?.results || [];
  const sel = rows.find((r: any) => r.id === selId);

  const pesquisar = () => {
    const params: any = { entity_type: entityType || undefined };
    if (tab === 'S') params.q = q || undefined;
    else Object.assign(params, adv);
    setApplied(params);
  };

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['pos', 'entities'] }); refetch(); };

  if (editing !== null) {
    return <EntityEditor entity={editing} onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); invalidate(); }} />;
  }

  const Adv = ({ k, label }: { k: string; label: string }) => (
    <label className="flex items-center gap-2">
      <span className="w-[110px] text-[#333]">{label}</span>
      <input value={adv[k] || ''} onChange={(e) => setAdv((a: any) => ({ ...a, [k]: e.target.value }))}
        className="border border-[#a0a0a0] p-1 bg-white flex-1" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[1000px] max-h-[85vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          Entidades
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="bg-white border-b border-[#d0d0d0] text-[12px]">
          <div className="flex border-b border-[#d0d0d0]">
            <button onClick={() => setTab('S')}
              className={`px-4 py-1.5 font-semibold ${tab === 'S' ? 'bg-white border-b-2 border-[#3c3c3c]' : 'bg-[#e8e8e8] text-[#666]'}`}>
              Pesquisa simples
            </button>
            <button onClick={() => setTab('A')}
              className={`px-4 py-1.5 font-semibold ${tab === 'A' ? 'bg-white border-b-2 border-[#3c3c3c]' : 'bg-[#e8e8e8] text-[#666]'}`}>
              Pesquisa Avançada
            </button>
          </div>
          <div className="p-2 flex gap-3">
            <div className="flex-1">
              <label className="flex items-center gap-2 mb-1.5">
                <span className="w-[110px] text-[#333]">Tipo de entidade:</span>
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
                  className="border border-[#a0a0a0] p-1 bg-white flex-1">
                  <option value="">(Todos)</option>
                  {tipoList.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              {tab === 'S' ? (
                <label className="flex items-center gap-2">
                  <span className="w-[110px] text-[#333]">Pesquisa livre:</span>
                  <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
                    className="border border-[#a0a0a0] p-1 bg-white flex-1" />
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <Adv k="last_name" label="Apelido:" />
                  <Adv k="name" label="Nome:" />
                  <Adv k="other_names" label="Outros nomes:" />
                  <Adv k="code" label="Nr. cliente:" />
                  <Adv k="tax_id" label="Nr. contrib.:" />
                  <Adv k="id_number" label="Nr. de identif.:" />
                  <Adv k="contact" label="E-mail/Telefone:" />
                  <Adv k="city" label="Cidade:" />
                </div>
              )}
            </div>
            <button onClick={pesquisar}
              className="w-[110px] flex-shrink-0 flex flex-col items-center justify-center gap-1 text-white font-bold text-[13px]"
              style={{ background: '#2b2b2b' }}>
              <RefreshCw size={20} /> Pesquisar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          {isFetching ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : (
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined}
              onRowClick={(r: any) => setSelId(r.id)}
              onRowDoubleClick={(r: any) => onSelect(r)}
              columns={[
                { header: '', accessor: () => <User size={14} className="text-[#8a95a3]" />, width: '4%' },
                { header: 'Apelido', accessor: 'last_name', width: '13%' },
                { header: 'Nome', accessor: 'name', width: '17%' },
                { header: 'Outros nomes', accessor: 'other_names', width: '15%' },
                { header: 'Nr. cliente', accessor: 'code', width: '10%' },
                { header: 'Tipo', accessor: 'entity_type_name', width: '11%' },
                { header: 'Contacto', accessor: 'contact', width: '13%' },
                { header: 'Informações', accessor: (r: any) => r.tax_id ? `NIF ${r.tax_id}` : '—', width: '17%' },
              ]} />
          )}
        </div>

        <div className="flex items-center gap-1 px-2 py-1.5 bg-[#e8e8e8] border-t border-[#c0c0c0] text-[12px]">
          <button onClick={() => setEditing({ is_blocked: false })} className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#ddd]">
            <Plus size={13} /> Adicionar
          </button>
          <button disabled={!sel} onClick={() => sel && setEditing({ ...sel })}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#ddd] disabled:opacity-30 disabled:hover:bg-transparent">
            <Pencil size={13} /> Editar
          </button>
          <button disabled={!sel} onClick={() => sel && onSelect(sel)}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#ddd] disabled:opacity-30 disabled:hover:bg-transparent">
            <Hand size={13} /> Selecionar
          </button>
          <button onClick={() => naoConstruido('Guest Info')} className="flex items-center gap-1.5 px-2 py-1 text-gray-400 hover:bg-[#ddd]">
            <User size={13} /> Guest Info
          </button>
          <button onClick={() => naoConstruido('Campos obrigatórios')} className="flex items-center gap-1.5 px-2 py-1 text-gray-400 hover:bg-[#ddd]">
            <Search size={13} /> Campos obrigatórios
          </button>
          <button onClick={() => setShowDups(true)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#ddd]">
            <Copy size={13} /> Controlo de duplicação
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

      {showDups && <PmsDuplicateCheckDialog onClose={() => setShowDups(false)} />}
    </div>
  );
}
