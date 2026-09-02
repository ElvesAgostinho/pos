import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import ClassicButton from '../ui/ClassicButton';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

const STATUS_STYLE: Record<string, string> = {
  VACANT_CLEAN: 'bg-[#eafaf0] border-[#8fce9e] text-green-800',
  VACANT_DIRTY: 'bg-[#fff7e6] border-[#e0c080] text-amber-800',
  OCCUPIED: 'bg-[#fdeaea] border-[#e0a0a0] text-red-800',
  OOO: 'bg-[#e8e8e8] border-[#b0b0b0] text-gray-500',
};

const blank = { number: '', room_type: '' };

export default function PmsRoomsView() {
  const qc = useQueryClient();
  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];

  const { data, refetch } = useQuery({ queryKey: ['pms', 'rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const rows = Array.isArray(data) ? data : data?.results || [];

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>(blank);

  const setStatus = async (id: number, status: string) => {
    try { await apiClient.post(`pms/rooms/${id}/set_status/`, { status }); refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); }
    catch (e) { notifyError(e); }
  };
  const create = async () => {
    if (!form.number || !form.room_type) return;
    try {
      await apiClient.post('pms/rooms/', form);
      setShowNew(false); setForm(blank); refetch(); qc.invalidateQueries({ queryKey: ['pms'] });
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 p-3 grid grid-cols-6 gap-2 overflow-auto content-start">
        {rows.map((r: any) => (
          <div key={r.id} className={`border p-2 text-[11px] ${STATUS_STYLE[r.status] || ''}`}>
            <div className="font-bold text-[13px]">{r.number}</div>
            <div className="text-[10px] mb-1">{r.room_type_name}</div>
            <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="w-full text-[10px] border border-black/10 bg-white/70">
              <option value="VACANT_CLEAN">Livre / Limpo</option>
              <option value="VACANT_DIRTY">Livre / Por limpar</option>
              <option value="OCCUPIED">Ocupado</option>
              <option value="OOO">Fora de serviço</option>
            </select>
          </div>
        ))}
        {rows.length === 0 && <div className="col-span-6 text-center text-gray-400 py-6">Sem quartos criados.</div>}
      </div>
      <div className="p-2 border-t border-[#c0c0c0] bg-[#f4f4f4]">
        <ClassicButton icon={Plus} label="Novo Quarto" onClick={() => setShowNew(true)} />
      </div>

      {showNew && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
          <div className="w-[360px] bg-[#f0f0f0] border border-[#8fa4bb] shadow-xl">
            <div className="h-8 flex items-center px-3 text-white text-[12px] font-bold" style={{ background: 'linear-gradient(to bottom, #2a5488, #183453)' }}>Novo Quarto</div>
            <div className="p-3 space-y-2 text-[11px]">
              <label className="flex flex-col">Número<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
              <label className="flex flex-col">Categoria
                <select value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                  <option value="">Escolha…</option>{rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 p-2 bg-[#e8e8e8] border-t border-[#c0c0c0]">
              <ClassicButton label="Cancelar" onClick={() => setShowNew(false)} />
              <ClassicButton icon={Save} label="Gravar" onClick={create} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
