import { useQuery } from '@tanstack/react-query';
import { X, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const plusDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Visualizar Preço — por noite, a partir dos dados reais da reserva (rate x
 * noites) e do saldo real do folio, se já existir. */
export default function PmsPriceViewDialog({ reservation: r, onClose }: { reservation: any; onClose: () => void }) {
  const { data: folio } = useQuery({
    queryKey: ['pms', 'reservations', r.id, 'folio'],
    queryFn: async () => r.folio_id ? (await apiClient.get(`pms/folios/${r.folio_id}/`)).data : null,
    enabled: !!r.folio_id,
  });

  const nights = Math.max(r.nights || 0, 0);
  const rate = Number(r.rate || 0);
  const dias = Array.from({ length: nights }, (_, i) => plusDays(r.check_in, i));
  const total = rate * nights;

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[720px] bg-[#F3F4F6] border border-[#D7DBDF] shadow-xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#17375E' }}>
          Visualizar Preço
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B42318] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 text-[12px]">
          <div className="font-semibold mb-2">{r.confirmation} {r.guest_name}</div>
          <table className="w-full border-collapse mb-3">
            <thead style={{ background: '#F3F4F6' }}>
              <tr><th className="text-left px-2 py-1.5 border-b border-[#D7DBDF]">Data</th><th className="text-right px-2 py-1.5 border-b border-[#D7DBDF]">Alojamento</th><th className="text-right px-2 py-1.5 border-b border-[#D7DBDF]">Total</th></tr>
            </thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d} className="border-b border-[#EBEEF0]"><td className="px-2 py-1">{d}</td><td className="px-2 py-1 text-right">{money(rate)}</td><td className="px-2 py-1 text-right">{money(rate)}</td></tr>
              ))}
              <tr className="font-bold"><td className="px-2 py-1">Dias: {nights}</td><td className="px-2 py-1 text-right">{money(total)}</td><td className="px-2 py-1 text-right">{money(total)}</td></tr>
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-[#D7DBDF] pt-2 text-[13px] font-bold">
            <span>Total: {money(total)}</span>
            <span>Diariamente: {money(nights ? total / nights : 0)}</span>
            <span>Saldo: {folio ? money(folio.balance) : money(total)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-[#F3F4F6] border-t border-[#D7DBDF] flex-shrink-0">
          <button disabled className="flex items-center gap-1.5 text-[12px] text-gray-400 cursor-not-allowed"><RefreshCw size={13} /> Recálculo de Preços</button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1A1D21] hover:text-black">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B42318] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
