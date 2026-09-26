import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { RefreshCw, Plus, Pencil, Hand, User, Copy, X, Search } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import { notifyError } from '../../utils/friendlyError';
import ClassicGrid from '../ui/ClassicGrid';
import EntityEditor from '../posconfig/EntityEditor';
import PmsDuplicateCheckDialog from './PmsDuplicateCheckDialog';
import { STATUS_COLOR } from './reservationStatus';

/** "Campos obrigatórios" — a MESMA regra do servidor (mdm.Customer via
 * EntitySerializer.validate, pos/marketing/entity-rules/) que já existe e já
 * é usada pela "Pesquisa de Entidades" da Configuração POS
 * (posconfig/PosMarketing.tsx). Aqui é só a moldura popup do PMS por cima do
 * MESMO endpoint — o servidor continua a ser a única fonte da regra. */
function RequiredFieldsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: regras } = useQuery({
    queryKey: ['pos', 'entity-rules'],
    queryFn: async () => (await apiClient.get('pos/marketing/entity-rules/')).data,
  });
  const rows: any[] = Array.isArray(regras) ? regras : regras?.results || [];
  const toggle = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) => apiClient.patch(`pos/marketing/entity-rules/${id}/`, { is_required: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'entity-rules'] }),
    onError: notifyError,
  });

  return (
    <div className="fixed inset-0 z-[9300] flex items-center justify-center bg-black/40">
      <div className="w-[440px] max-h-[70vh] bg-[#F7FAFA] border border-[#5C8891] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
          Campos obrigatórios
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 overflow-auto bg-white text-[12px]">
          <div className="text-[11px] text-[#5C8891] mb-2">
            O servidor recusa gravar uma entidade sem estes campos. Não é um aviso — é uma regra.
          </div>
          {rows.map((r: any) => (
            <label key={r.id} className="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={!!r.is_required} disabled={r.field === 'name' || toggle.isPending}
                onChange={(e) => toggle.mutate({ id: r.id, v: e.target.checked })} className="w-4 h-4" />
              {r.label || r.field}{r.field === 'name' && <span className="text-[#7FA9B1] text-[11px]"> (sempre)</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "Guest Info" — histórico de estadias deste hóspede em todo o hotel
 * (pms/reservations/?guest=<id>, o MESMO filtro que ReservationViewSet já
 * suporta — ver pms/views.py). Diferente do "Histórico" de uma reserva
 * (PmsHistoryDialog, que mostra os eventos de UMA reserva): aqui mostra-se
 * TODAS as reservas deste hóspede, passadas e futuras. */
function GuestInfoDialog({ guest, onClose }: { guest: any; onClose: () => void }) {
  const { data, isFetching } = useQuery({
    queryKey: ['pms', 'reservations', 'by-guest', guest.id],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params: { guest: guest.id } })).data,
  });
  const rows: any[] = Array.isArray(data) ? data : data?.results || [];
  const stays = rows.filter((r: any) => r.status === 'CHECKED_OUT').length;

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[760px] max-h-[75vh] bg-[#F7FAFA] border border-[#5C8891] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
          Guest Info — {guest.name}
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="px-3 py-2 bg-white border-b border-[#CFE3E6] text-[12px] flex gap-6 flex-shrink-0">
          <span><b>Nr. cliente:</b> {guest.code || '—'}</span>
          <span><b>Contacto:</b> {guest.contact || '—'}</span>
          <span><b>NIF:</b> {guest.tax_id || '—'}</span>
          <span><b>Estadias concluídas:</b> {stays}</span>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {isFetching ? <div className="p-4 text-gray-400 text-[12px]">A carregar…</div> : rows.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Este hóspede ainda não tem reservas.</div>
          ) : (
            <ClassicGrid rowKey="id" data={rows} filterable={false} columns={[
              { header: 'Confirmação', accessor: 'confirmation', width: '15%' },
              { header: 'Categoria', accessor: 'room_type_name', width: '20%' },
              { header: 'Quarto', accessor: (r: any) => r.room_number || '—', width: '10%' },
              { header: 'Check-in', accessor: 'check_in', width: '13%' },
              { header: 'Check-out', accessor: 'check_out', width: '13%' },
              { header: 'Estado', accessor: (r: any) => (
                <span style={{ color: STATUS_COLOR[r.status] || '#041F24', fontWeight: 700 }}>{r.status_display}</span>
              ), width: '15%' },
            ]} />
          )}
        </div>
        <div className="flex justify-end px-3 py-2 bg-[#F7FAFA] border-t border-[#CFE3E6] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#041F24] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [showGuestInfo, setShowGuestInfo] = useState(false);
  const [showRequired, setShowRequired] = useState(false);

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
      <span className="w-[110px] text-[#041F24]">{label}</span>
      <input value={adv[k] || ''} onChange={(e) => setAdv((a: any) => ({ ...a, [k]: e.target.value }))}
        className="border border-[#7FA9B1] p-1 bg-white flex-1" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[1000px] max-h-[85vh] bg-[#F7FAFA] border border-[#5C8891] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#041F24' }}>
          Entidades
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="bg-white border-b border-[#EEF4F5] text-[12px]">
          <div className="flex border-b border-[#EEF4F5]">
            <button onClick={() => setTab('S')}
              className={`px-4 py-1.5 font-semibold ${tab === 'S' ? 'bg-white border-b-2 border-[#041F24]' : 'bg-[#F7FAFA] text-[#5C8891]'}`}>
              Pesquisa simples
            </button>
            <button onClick={() => setTab('A')}
              className={`px-4 py-1.5 font-semibold ${tab === 'A' ? 'bg-white border-b-2 border-[#041F24]' : 'bg-[#F7FAFA] text-[#5C8891]'}`}>
              Pesquisa Avançada
            </button>
          </div>
          <div className="p-2 flex gap-3">
            <div className="flex-1">
              <label className="flex items-center gap-2 mb-1.5">
                <span className="w-[110px] text-[#041F24]">Tipo de entidade:</span>
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
                  className="border border-[#7FA9B1] p-1 bg-white flex-1">
                  <option value="">(Todos)</option>
                  {tipoList.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              {tab === 'S' ? (
                <label className="flex items-center gap-2">
                  <span className="w-[110px] text-[#041F24]">Pesquisa livre:</span>
                  <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
                    className="border border-[#7FA9B1] p-1 bg-white flex-1" />
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
              style={{ background: '#041F24' }}>
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
                { header: '', accessor: () => <User size={14} className="text-[#7FA9B1]" />, width: '4%' },
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

        <div className="flex items-center gap-1 px-2 py-1.5 bg-[#F7FAFA] border-t border-[#CFE3E6] text-[12px]">
          <button onClick={() => setEditing({ is_blocked: false })} className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5]">
            <Plus size={13} /> Adicionar
          </button>
          <button disabled={!sel} onClick={() => sel && setEditing({ ...sel })}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5] disabled:opacity-30 disabled:hover:bg-transparent">
            <Pencil size={13} /> Editar
          </button>
          <button disabled={!sel} onClick={() => sel && onSelect(sel)}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5] disabled:opacity-30 disabled:hover:bg-transparent">
            <Hand size={13} /> Selecionar
          </button>
          <button disabled={!sel} onClick={() => sel && setShowGuestInfo(true)}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5] disabled:opacity-30 disabled:hover:bg-transparent">
            <User size={13} /> Guest Info
          </button>
          <button onClick={() => setShowRequired(true)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5]">
            <Search size={13} /> Campos obrigatórios
          </button>
          <button onClick={() => setShowDups(true)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-[#EEF4F5]">
            <Copy size={13} /> Controlo de duplicação
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

      {showDups && <PmsDuplicateCheckDialog onClose={() => setShowDups(false)} />}
      {showGuestInfo && sel && <GuestInfoDialog guest={sel} onClose={() => setShowGuestInfo(false)} />}
      {showRequired && <RequiredFieldsDialog onClose={() => setShowRequired(false)} />}
    </div>
  );
}
