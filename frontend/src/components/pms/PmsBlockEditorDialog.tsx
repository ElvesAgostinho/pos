import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

const blank = {
  code: '', description: '', is_active: true, is_guaranteed: false, is_elastic: false,
  main_entity: '', group_name: '', other_entity: '', contact_name: '',
  valid_from: '', valid_to: '', color: '', manager: '',
  default_prefix: '', default_reservation_type: 'Normal', default_voucher: '',
  default_segment: '', default_subsegment: '', default_channel: '', default_rate_plan: '',
  arrival_until: '', departure_until: '', block_info: '', reservation_info: '',
  release_method: 'DAYS', release_days: 0, contract_value: 0,
};

const TABS = ['Detalhes do Bloco', 'Defaults da Reserva', 'Contrato', 'Grelha (Inventário)'] as const;

/** Editor de Bloco (= "Nova Reserva de Grupo") — a ÚNICA ficha para criar/editar
 * um grupo, partilhada entre "Blocos" e "Reservas de Grupo" (não duplicar). */
export default function PmsBlockEditorDialog({ block, copyFrom, onClose, onSaved }: {
  block?: any; copyFrom?: any; onClose: () => void; onSaved: (id: number) => void;
}) {
  const qc = useQueryClient();
  const initial = block ? { ...blank, ...block }
    : copyFrom ? { ...blank, ...copyFrom, id: undefined, code: `${copyFrom.code}-COPIA` }
    : blank;
  const [form, setForm] = useState<any>(initial);
  const [tab, setTab] = useState<typeof TABS[number]>('Detalhes do Bloco');
  const selId: number | null = block?.id ?? null;

  const { data: guests } = useQuery({ queryKey: ['mdm', 'customers'], queryFn: async () => (await apiClient.get('mdm/customers/')).data });
  const guestList = Array.isArray(guests) ? guests : guests?.results || [];
  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];
  const { data: segments } = useQuery({ queryKey: ['pos', 'segments'], queryFn: async () => (await apiClient.get('pos/config/segments/')).data });
  const segList = (Array.isArray(segments) ? segments : segments?.results || []).filter((s: any) => s.for_pms !== false);
  const { data: subSegments } = useQuery({ queryKey: ['pos', 'subsegments'], queryFn: async () => (await apiClient.get('pos/config/subsegments/')).data });
  const subList = (Array.isArray(subSegments) ? subSegments : subSegments?.results || [])
    .filter((s: any) => s.for_pms !== false && (!form.default_segment || String(s.segment) === String(form.default_segment)));
  const { data: channels } = useQuery({ queryKey: ['pos', 'channels'], queryFn: async () => (await apiClient.get('pos/config/channels/')).data });
  const chList = (Array.isArray(channels) ? channels : channels?.results || []).filter((c: any) => c.for_pms !== false);
  const { data: ratePlans } = useQuery({ queryKey: ['pms', 'rate-plans'], queryFn: async () => (await apiClient.get('pms/rate-plans/')).data });
  const rpList = Array.isArray(ratePlans) ? ratePlans : ratePlans?.results || [];

  const save = async () => {
    if (!form.code || !form.description || !form.valid_from || !form.valid_to) {
      aviso('Preencha código, descrição e período (De/Até).'); return;
    }
    const payload = { ...form };
    delete payload.id;
    ['main_entity', 'default_segment', 'default_subsegment', 'default_channel', 'default_rate_plan'].forEach((k) => {
      if (!payload[k]) payload[k] = null;
    });
    try {
      let id = selId;
      if (selId) await apiClient.patch(`pms/blocks/${selId}/`, payload);
      else { const r = await apiClient.post('pms/blocks/', payload); id = r.data.id; }
      qc.invalidateQueries({ queryKey: ['pms', 'blocks'] });
      onSaved(id!);
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[900px] max-w-[97vw] bg-[#f0f0f0] border border-[#8a8a8a] shadow-2xl flex flex-col" style={{ height: 'min(85vh, 700px)' }}>
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          {selId ? `Bloco — ${form.code}` : copyFrom ? 'Copiar Reserva de Grupo' : 'Nova Reserva de Grupo'}
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="flex border-b border-[#a0a0a0] bg-[#e8ecf1] flex-shrink-0">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[11px] font-bold border-r border-[#c0c7d0] ${tab === t ? 'bg-white text-[#1e3f66]' : 'text-gray-600 hover:bg-white/60'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-3 text-[11px]">
          {tab === 'Detalhes do Bloco' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <label className="flex flex-col">Código<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Descrição<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">De<input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Até<input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Entidade Principal
                <select value={form.main_entity || ''} onChange={(e) => setForm({ ...form, main_entity: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">(nenhuma)</option>{guestList.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col">Grupo<input value={form.group_name || ''} onChange={(e) => setForm({ ...form, group_name: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Contacto<input value={form.contact_name || ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Gestor do bloco<input value={form.manager || ''} onChange={(e) => setForm({ ...form, manager: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <div className="flex gap-4 items-center col-span-2">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.is_guaranteed} onChange={(e) => setForm({ ...form, is_guaranteed: e.target.checked })} /> Garantido</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.is_elastic} onChange={(e) => setForm({ ...form, is_elastic: e.target.checked })} /> Elastic block</label>
                <label className="flex items-center gap-1.5">Cor<input type="color" value={form.color || '#1e3f66'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="border border-[#a0a0a0] h-7 w-14" /></label>
              </div>
            </div>
          )}

          {tab === 'Defaults da Reserva' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <label className="flex flex-col">Prefixo<input value={form.default_prefix || ''} onChange={(e) => setForm({ ...form, default_prefix: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Tipo de Reserva
                <select value={form.default_reservation_type} onChange={(e) => setForm({ ...form, default_reservation_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option>Normal</option><option>Day Use</option>
                </select>
              </label>
              <label className="flex flex-col">Voucher<input value={form.default_voucher || ''} onChange={(e) => setForm({ ...form, default_voucher: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Rate Code
                <select value={form.default_rate_plan || ''} onChange={(e) => setForm({ ...form, default_rate_plan: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">(nenhum)</option>{rpList.map((rp: any) => <option key={rp.id} value={rp.id}>{rp.code}</option>)}
                </select>
              </label>
              <label className="flex flex-col">Segmento
                <select value={form.default_segment || ''} onChange={(e) => setForm({ ...form, default_segment: e.target.value, default_subsegment: '' })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">(nenhum)</option>{segList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col">Sub-Segmento
                <select value={form.default_subsegment || ''} onChange={(e) => setForm({ ...form, default_subsegment: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">(nenhum)</option>{subList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col">Canal de Dist.
                <select value={form.default_channel || ''} onChange={(e) => setForm({ ...form, default_channel: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">(nenhum)</option>{chList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col">Chegada até<input type="date" value={form.arrival_until || ''} onChange={(e) => setForm({ ...form, arrival_until: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Saída até<input type="date" value={form.departure_until || ''} onChange={(e) => setForm({ ...form, departure_until: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col col-span-2">Informação do bloco<textarea value={form.block_info || ''} onChange={(e) => setForm({ ...form, block_info: e.target.value })} rows={2} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col col-span-2">Informação da reserva<textarea value={form.reservation_info || ''} onChange={(e) => setForm({ ...form, reservation_info: e.target.value })} rows={2} className="border border-[#a0a0a0] p-1" /></label>
            </div>
          )}

          {tab === 'Contrato' && (
            <div className="space-y-2">
              <label className="flex flex-col">Método de release
                <select value={form.release_method} onChange={(e) => setForm({ ...form, release_method: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white w-64">
                  <option value="DAYS">Dias antes da chegada</option>
                  <option value="DATE">Data fixa</option>
                </select>
              </label>
              <label className="flex flex-col">Dias de release<input type="number" value={form.release_days} onChange={(e) => setForm({ ...form, release_days: Number(e.target.value) })} className="border border-[#a0a0a0] p-1 w-32" /></label>
              <label className="flex flex-col">Valor do contrato<input type="number" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} className="border border-[#a0a0a0] p-1 w-40" /></label>
            </div>
          )}

          {tab === 'Grelha (Inventário)' && (
            selId ? <BlockGrid blockId={selId} roomTypes={rtList} /> : <div className="text-gray-400">Grave o bloco primeiro para definir o inventário.</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0] flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1 text-[12px] border border-[#a0a0a0] bg-white hover:bg-[#eee]">Cancelar</button>
          <button onClick={save} className="px-4 py-1.5 text-[12px] font-bold text-white" style={{ background: '#2b7a3b' }}>Gravar</button>
        </div>
      </div>
    </div>
  );
}

function BlockGrid({ blockId, roomTypes }: { blockId: number; roomTypes: any[] }) {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ['pms', 'block', blockId, 'full'],
    queryFn: async () => (await apiClient.get(`pms/blocks/${blockId}/`)).data,
  });
  const [row, setRow] = useState({ room_type: '', date: '', rooms_blocked: 1 });

  const addRow = async () => {
    if (!row.room_type || !row.date) return;
    try {
      await apiClient.post(`pms/blocks/${blockId}/room-types/`, row);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] });
    } catch (e) { notifyError(e); }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <select value={row.room_type} onChange={(e) => setRow({ ...row, room_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
          <option value="">Categoria…</option>{roomTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        <input type="date" value={row.date} onChange={(e) => setRow({ ...row, date: e.target.value })} className="border border-[#a0a0a0] p-1" />
        <input type="number" min={0} value={row.rooms_blocked} onChange={(e) => setRow({ ...row, rooms_blocked: Number(e.target.value) })} className="border border-[#a0a0a0] p-1 w-20" placeholder="Qtd" />
        <ClassicButton icon={Plus} label="Adicionar" onClick={addRow} />
      </div>
      <ClassicGrid rowKey="id" data={data?.room_types || []} columns={[
        { header: 'Categoria', accessor: 'room_type_name', width: '35%' },
        { header: 'Data', accessor: 'date', width: '25%' },
        { header: 'Bloqueados', accessor: 'rooms_blocked', width: '20%' },
        { header: 'Pickup', accessor: 'rooms_picked_up', width: '20%' },
      ]} />
    </div>
  );
}
