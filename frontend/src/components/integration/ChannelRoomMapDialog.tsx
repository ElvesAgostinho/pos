import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Wand2, Link2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

const inp = 'border border-[#7FA9B1] rounded-[6px] px-2 py-1 text-[12px]';
const btn = 'px-3 py-1.5 text-[12px] border border-[#CFE3E6] rounded-[6px] bg-gradient-to-b from-white to-[#EEF4F5] hover:to-[#E3EDEE] active:translate-y-px flex items-center gap-1.5 disabled:opacity-40';

/**
 * MAPEAMENTO DE CATEGORIAS — a nossa categoria ↔ o código do quarto na OTA.
 *
 * É a peça que faltava para o Channel Manager poder sincronizar: a Booking não
 * sabe o que é o nosso `RoomType`; conhece o *room id* dela. Sem esta tabela o
 * ecrã mostrava sempre "0 tipo(s) mapeado(s)" e a sincronização não tinha para
 * onde enviar nada.
 */
export default function ChannelRoomMapDialog({ channel, onClose }: { channel: any; onClose: () => void }) {
  const qc = useQueryClient();
  const inval = () => {
    qc.invalidateQueries({ queryKey: ['channel-room-maps', channel.id] });
    qc.invalidateQueries({ queryKey: ['channels'] });
  };

  const { data: maps = [] } = useQuery({
    queryKey: ['channel-room-maps', channel.id],
    queryFn: async () => (await apiClient.get('pms/channel-room-maps/', { params: { channel: channel.id } })).data,
  });
  const { data: roomTypes = [] } = useQuery({
    queryKey: ['pms', 'room-types'],
    queryFn: async () => (await apiClient.get('pms/room-types/')).data,
  });
  const { data: ratePlans = [] } = useQuery({
    queryKey: ['pms', 'rate-plans'],
    queryFn: async () => (await apiClient.get('pms/rate-plans/')).data,
  });

  const [novo, setNovo] = useState<any>({ room_type: '', ota_room_id: '', ota_rate_id: '', rate_plan: '', max_rooms: 0 });

  const criar = useMutation({
    mutationFn: async () => (await apiClient.post('pms/channel-room-maps/', {
      channel: channel.id,
      room_type: Number(novo.room_type),
      ota_room_id: novo.ota_room_id.trim(),
      ota_rate_id: novo.ota_rate_id.trim() || null,
      rate_plan: novo.rate_plan ? Number(novo.rate_plan) : null,
      max_rooms: Number(novo.max_rooms) || 0,
    })).data,
    onSuccess: () => { setNovo({ room_type: '', ota_room_id: '', ota_rate_id: '', rate_plan: '', max_rooms: 0 }); inval(); },
    onError: notifyError,
  });

  const gravar = useMutation({
    mutationFn: async ({ id, campos }: any) => (await apiClient.patch(`pms/channel-room-maps/${id}/`, campos)).data,
    onSuccess: inval, onError: notifyError,
  });

  const apagar = useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`pms/channel-room-maps/${id}/`)).data,
    onSuccess: inval, onError: notifyError,
  });

  const automatico = useMutation({
    mutationFn: async () => (await apiClient.post('pms/channel-room-maps/auto-map/', { channel: channel.id })).data,
    onSuccess: (d: any) => { inval(); aviso(d.detail, 'Mapeamento automático'); },
    onError: notifyError,
  });

  // As tarifas oferecidas são só as da categoria escolhida — uma tarifa da
  // Suite não serve para o Standard (e o servidor recusa).
  const tarifasDe = (roomTypeId: number) => ratePlans.filter((p: any) => p.room_type === roomTypeId);
  const porMapear = roomTypes.filter((rt: any) => !maps.some((m: any) => m.room_type === rt.id));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[10px] shadow-xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-[#0B3A43] to-[#062A31] text-white">
          <span className="font-bold text-[13px] flex items-center gap-2">
            <Link2 size={14} />Mapeamento de categorias — {channel.provider_display} · {channel.name}
          </span>
          <button onClick={onClose} className="hover:bg-white/15 rounded px-1.5"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3 overflow-auto bg-[#F7FAFA] flex-1 min-h-0">
          <div className="bg-white border border-[#CFE3E6] rounded-[10px] p-3 text-[12px] text-gray-700">
            A OTA não conhece as nossas categorias — conhece o código de quarto dela. Ligue aqui cada
            categoria ao código correspondente no painel da <b>{channel.provider_display}</b>. Sem pelo menos
            uma categoria mapeada não há nada para sincronizar.
          </div>

          {/* Linhas já mapeadas */}
          <div className="bg-white border border-[#CFE3E6] rounded-[10px] overflow-hidden">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_90px_40px] gap-2 px-3 py-1.5 bg-[#F7FAFA] border-b border-[#EEF4F5] text-[11px] font-bold text-[#5C8891]">
              <span>Categoria</span><span>ID do quarto na OTA</span><span>ID da tarifa (opcional)</span>
              <span>Tarifa a enviar</span><span>Limite</span><span />
            </div>
            {maps.map((m: any) => (
              <div key={m.id} className="grid grid-cols-[1.2fr_1fr_1fr_1.2fr_90px_40px] gap-2 px-3 py-1.5 border-b border-[#F7FAFA] items-center text-[12px]">
                <span className="font-bold">{m.room_type_name}
                  <span className="text-gray-500 font-normal"> · {m.rooms_available} quarto(s)</span></span>
                <input className={inp} defaultValue={m.ota_room_id}
                       onBlur={(e) => e.target.value !== m.ota_room_id && gravar.mutate({ id: m.id, campos: { ota_room_id: e.target.value } })} />
                <input className={inp} defaultValue={m.ota_rate_id || ''} placeholder="—"
                       onBlur={(e) => (e.target.value || null) !== m.ota_rate_id && gravar.mutate({ id: m.id, campos: { ota_rate_id: e.target.value || null } })} />
                <select className={inp} defaultValue={m.rate_plan || ''}
                        onChange={(e) => gravar.mutate({ id: m.id, campos: { rate_plan: e.target.value ? Number(e.target.value) : null } })}>
                  <option value="">Mais barata válida</option>
                  {tarifasDe(m.room_type).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min={0} className={inp} defaultValue={m.max_rooms}
                       title="0 = todos os quartos livres"
                       onBlur={(e) => Number(e.target.value) !== m.max_rooms && gravar.mutate({ id: m.id, campos: { max_rooms: Number(e.target.value) || 0 } })} />
                <button className="text-[#B0392B] hover:bg-[#B0392B]/10 rounded p-1 justify-self-center"
                        title="Remover mapeamento" onClick={() => apagar.mutate(m.id)}><Trash2 size={13} /></button>
              </div>
            ))}
            {maps.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-gray-500">
                Nenhuma categoria mapeada. Use "Mapear tudo automaticamente" ou acrescente uma em baixo.
              </div>
            )}
          </div>

          {/* Nova linha */}
          <div className="bg-white border border-[#CFE3E6] rounded-[10px] p-3 flex flex-wrap items-end gap-2 text-[12px]">
            <label className="flex flex-col">Categoria
              <select className={inp + ' w-44'} value={novo.room_type}
                      onChange={(e) => setNovo({ ...novo, room_type: e.target.value, rate_plan: '' })}>
                <option value="">— escolher —</option>
                {porMapear.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.code} · {rt.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col">ID do quarto na OTA
              <input className={inp + ' w-36'} value={novo.ota_room_id}
                     onChange={(e) => setNovo({ ...novo, ota_room_id: e.target.value })} placeholder="Ex: 77001" />
            </label>
            <label className="flex flex-col">ID da tarifa
              <input className={inp + ' w-32'} value={novo.ota_rate_id}
                     onChange={(e) => setNovo({ ...novo, ota_rate_id: e.target.value })} placeholder="opcional" />
            </label>
            <label className="flex flex-col">Tarifa a enviar
              <select className={inp + ' w-44'} value={novo.rate_plan}
                      onChange={(e) => setNovo({ ...novo, rate_plan: e.target.value })}>
                <option value="">Mais barata válida</option>
                {novo.room_type && tarifasDe(Number(novo.room_type)).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col">Limite de quartos
              <input type="number" min={0} className={inp + ' w-24'} value={novo.max_rooms}
                     title="0 = todos os quartos livres"
                     onChange={(e) => setNovo({ ...novo, max_rooms: e.target.value })} />
            </label>
            <button className={btn} disabled={!novo.room_type || !novo.ota_room_id.trim() || criar.isPending}
                    onClick={() => criar.mutate()}><Plus size={13} />Acrescentar</button>
            <button className={btn} disabled={porMapear.length === 0 || automatico.isPending}
                    onClick={() => automatico.mutate()}
                    title="Cria as linhas em falta usando o nosso código de categoria como código na OTA">
              <Wand2 size={13} />Mapear tudo automaticamente</button>
          </div>

          <div className="text-[11px] text-gray-500">
            <b>Limite de quartos:</b> 0 = o canal pode vender todos os quartos livres da categoria.
            Use um número para guardar inventário para a recepção ou não dar o hotel inteiro a uma só OTA.
          </div>
        </div>

        <div className="px-4 py-2 border-t border-[#EEF4F5] bg-white flex items-center justify-between text-[12px]">
          <span className="text-gray-600">{maps.length} categoria(s) mapeada(s)</span>
          <button className={btn} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
