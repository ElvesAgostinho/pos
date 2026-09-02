import { X } from 'lucide-react';

const fmtDT = (iso: string) => iso ? new Date(iso).toLocaleString('pt-PT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}) : '—';

/** Histórico — os eventos reais que o PMS guarda para esta reserva (criação,
 * check-in, check-out). Não é um log de alterações campo-a-campo (isso
 * precisava de auditoria própria, que ainda não existe) — antes um evento
 * inventado, prefiro mostrar só o que é mesmo real. */
export default function PmsHistoryDialog({ reservation: r, onClose }: { reservation: any; onClose: () => void }) {
  const eventos = [
    { data: r.created_at, desc: 'Reserva Criada', valor: `${r.confirmation} · ${r.room_type_name} · ${r.check_in} → ${r.check_out}` },
    r.checked_in_at && { data: r.checked_in_at, desc: 'Check-In', valor: r.room_number ? `Quarto ${r.room_number}` : '' },
    r.checked_out_at && { data: r.checked_out_at, desc: 'Check-Out', valor: '' },
  ].filter(Boolean) as { data: string; desc: string; valor: string }[];
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[720px] max-h-[70vh] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          Histórico
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-[12px] border-collapse">
            <thead style={{ background: '#eef1f4' }}>
              <tr>{['Data', 'Descrição', 'Detalhe'].map((h) => <th key={h} className="text-left px-3 py-1.5 border-b border-[#c0c7d0] font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {eventos.map((e, i) => (
                <tr key={i} className="border-b border-[#eee]">
                  <td className="px-3 py-1.5">{fmtDT(e.data)}</td>
                  <td className="px-3 py-1.5">{e.desc}</td>
                  <td className="px-3 py-1.5 text-gray-600">{e.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0] flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
