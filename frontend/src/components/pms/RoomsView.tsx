import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { DoorClosed, Plus } from 'lucide-react';
import { useRooms, useCreateRoom, useSetRoomStatus, useRoomTypes, useCreateRoomType } from '../../hooks/usePms';
import { ROOM_STATUS } from '../../api/pms';

const CLS: Record<string, string> = {
  VACANT_CLEAN: 'text-green-700 font-bold', VACANT_DIRTY: 'text-orange-600 font-bold',
  OCCUPIED: 'text-[#1e3f66] font-bold', OOO: 'text-red-600',
};

export default function RoomsView() {
  const { data: rooms = [] } = useRooms();
  const { data: roomTypes = [] } = useRoomTypes();
  const create = useCreateRoom();
  const createType = useCreateRoomType();
  const setStatus = useSetRoomStatus();
  const empty = { number: '', room_type: '', floor: '' };
  const [draft, setDraft] = useState<any>(empty);
  const [newType, setNewType] = useState('');

  const add = () => {
    if (!draft.number) { alert('Indique o número do quarto.'); return; }
    if (!draft.room_type) { alert('Escolha um tipo de quarto (crie um primeiro, se ainda não existir).'); return; }
    create.mutate({ number: draft.number, room_type: Number(draft.room_type), floor: draft.floor },
      { onSuccess: () => setDraft(empty), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };

  const addType = () => {
    if (!newType.trim()) return;
    createType.mutate({ code: newType.slice(0, 6).toUpperCase(), name: newType, capacity: 2, base_rate: 0 } as any,
      { onSuccess: (t: any) => { setNewType(''); setDraft((d: any) => ({ ...d, room_type: String(t.id) })); },
        onError: (e: any) => alert('Erro ao criar tipo: ' + JSON.stringify(e?.response?.data)) });
  };

  return (
    <ClassicWindow title="Quartos & Housekeeping (PMS)" icon={<DoorClosed size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{rooms.length} quarto(s) · muda o estado para gerir limpeza/manutenção</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Nº" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <select value={draft.room_type} onChange={(e) => setDraft({ ...draft, room_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— tipo —</option>{roomTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input placeholder="Piso" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <ClassicButton icon={Plus} label="Novo Quarto" onClick={add} />
          <span className="text-gray-400 mx-1">|</span>
          <input placeholder="Novo tipo (ex: Standard)" value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addType()} className="border border-[#a0a0a0] p-1 w-40" />
          <ClassicButton icon={Plus} label="Criar Tipo" onClick={addType} />
        </div>
        {roomTypes.length === 0 && (
          <div className="bg-[#fff7e6] border-b border-[#e0c080] px-3 py-1.5 text-[11px] text-[#8a5a00]">
            Ainda não há tipos de quarto. Crie um tipo (ex.: "Standard") no campo acima antes de adicionar quartos.
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={rooms}
            columns={[
              { header: 'Nº', accessor: 'number', width: '12%' },
              { header: 'Tipo', accessor: 'room_type_name', width: '22%' },
              { header: 'Piso', accessor: (r: any) => r.floor || '—', width: '12%' },
              { header: 'Estado', accessor: (r: any) => <span className={CLS[r.status] || ''}>{r.status_display}</span>, width: '24%' },
              { header: 'Mudar estado', accessor: (r: any) => (
                <select value={r.status} onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value })} className="border border-[#a0a0a0] p-0.5 bg-white text-[11px]">
                  {ROOM_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>), width: '30%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
