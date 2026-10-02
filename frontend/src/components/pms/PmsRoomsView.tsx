import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

const STATUS_STYLE: Record<string, string> = {
  VACANT_CLEAN: 'bg-[#F4F6F7] border-[#C8D2D5] text-[#1F292C]',
  VACANT_DIRTY: 'bg-[#F4F6F7] border-[#C8D2D5] text-[#1F292C]',
  OCCUPIED: 'bg-[#F4F6F7] border-[#C94A4A] text-[#A83A3A]',
  OOO: 'bg-[#F4F6F7] border-[#C8D2D5] text-gray-500',
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
          <div key={r.id} className={`border p-2 text-[11px] rounded-[10px] ${STATUS_STYLE[r.status] || ''}`}>
            <div className="font-bold text-[13px]">{r.number}</div>
            <div className="text-[10px] mb-1">{r.room_type_name}</div>
            {/* AÇÃO ÓBVIA primeiro: o seletor sozinho escondia a única forma de
                libertar um quarto (ninguém procura um dropdown minúsculo para
                dizer "já está limpo"). O seletor fica por baixo, para os casos
                que estes botões não cobrem. */}
            {r.status === 'VACANT_DIRTY' && (
              <button onClick={() => setStatus(r.id, 'VACANT_CLEAN')}
                className="w-full mb-1 px-1 py-1 text-[10px] font-semibold text-white rounded-[6px] hover:brightness-110 transition-[filter]"
                style={{ background: '#062F35' }}>
                ✔ Marcar como limpo
              </button>
            )}
            {r.status === 'OOO' && (
              <button onClick={() => setStatus(r.id, 'VACANT_DIRTY')}
                className="w-full mb-1 px-1 py-1 text-[10px] font-semibold text-white rounded-[6px] hover:brightness-110 transition-[filter]"
                style={{ background: '#4B858E' }}>
                ↩ Voltar ao serviço
              </button>
            )}
            {r.status === 'VACANT_CLEAN' && (
              <button onClick={() => setStatus(r.id, 'OOO')}
                className="w-full mb-1 px-1 py-1 text-[10px] font-semibold rounded-[6px] border border-[#C8D2D5] bg-white hover:bg-[#F4F6F7] transition-colors text-[#A83A3A]">
                ⊘ Pôr fora de serviço
              </button>
            )}
            <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}
              className="w-full text-[10px] border border-black/10 bg-white/70 rounded-[6px]">
              <option value="VACANT_CLEAN">Livre / Limpo</option>
              <option value="VACANT_DIRTY">Livre / Por limpar</option>
              <option value="OCCUPIED">Ocupado</option>
              <option value="OOO">Fora de serviço</option>
            </select>
          </div>
        ))}
        {rows.length === 0 && <div className="col-span-6 text-center text-gray-400 py-6">Sem quartos criados.</div>}
      </div>
      <Toolbar actions={[{ label: 'Novo Quarto', icon: '＋', color: '#062F35', onClick: () => setShowNew(true) }]} />

      {showNew && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
          <div className="w-[360px] bg-[#F4F6F7] border border-[#C8D2D5] shadow-xl rounded-[16px] overflow-hidden">
            <div className="h-8 flex items-center px-3 text-white text-[12px] font-bold" style={{ background: 'linear-gradient(to bottom, #062F35, #062F35)' }}>Novo Quarto</div>
            <div className="p-3 space-y-2 text-[11px]">
              <label className="flex flex-col">Número<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="border border-[#C8D2D5] p-1" /></label>
              <label className="flex flex-col">Categoria
                <select value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })} className="border border-[#C8D2D5] p-1 bg-white">
                  <option value="">Escolha…</option>{rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                </select>
              </label>
            </div>
            <Toolbar actions={[
              { label: 'Cancelar', icon: '✕', color: '#4B858E', onClick: () => setShowNew(false) },
              { label: 'Gravar', icon: '💾', color: '#062F35', onClick: create },
            ]} />
          </div>
        </div>
      )}
    </div>
  );
}
