import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiClient } from '../../api/client';

const SOURCE_LABEL: Record<string, string> = { DIRECT: 'Normal', ONLINE: 'Online', BLOCK: 'Bloco/Grupo' };

/** Sharer Manager — outros quartos/reservas que partilham esta estadia (o
 * mesmo bloco/grupo). Sem bloco associado, fica mesmo vazio — não é bug, é o
 * que a reserva tem. */
export default function PmsSharerManagerDialog({ reservation: r, onClose }: { reservation: any; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['pms', 'reservations', 'block', r.block],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params: { block: r.block } })).data,
    enabled: !!r.block,
  });
  const rows = (Array.isArray(data) ? data : data?.results || []).filter((x: any) => x.id !== r.id);

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[820px] max-h-[70vh] bg-[#F3F4F6] border border-[#D7DBDF] shadow-xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#17375E' }}>
          Sharer Manager
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B42318] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-[12px] border-collapse">
            <thead style={{ background: '#F3F4F6' }}>
              <tr>{['Nº Quarto', 'Nome', 'Hóspede Principal', 'Check-In', 'Check-Out', 'Tipo de Reserva'].map((h) => (
                <th key={h} className="text-left px-3 py-1.5 border-b border-[#D7DBDF] font-semibold">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => (
                <tr key={s.id} className="border-b border-[#EBEEF0]">
                  <td className="px-3 py-1.5">{s.room_number || '—'}</td>
                  <td className="px-3 py-1.5">{s.guest_name}</td>
                  <td className="px-3 py-1.5">{r.guest_name}</td>
                  <td className="px-3 py-1.5">{s.check_in}</td>
                  <td className="px-3 py-1.5">{s.check_out}</td>
                  <td className="px-3 py-1.5">{SOURCE_LABEL[s.source] || s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-6 text-center text-gray-400 text-[12px]">Não foram encontrados dados.</div>}
        </div>
        <div className="flex justify-end px-3 py-2 bg-[#F3F4F6] border-t border-[#D7DBDF] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B42318] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
