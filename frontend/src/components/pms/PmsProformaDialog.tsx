import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Printer, Mail } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const FORMATOS = ['Fatura: Detalhada', 'Fatura: Sumário Package - Resto Detalhado', 'Fatura: Sumário por Dia', 'Fatura: Sumário por Estadia'];

/** Pro-forma — impressão real do resumo da reserva/folio (ainda não é o
 * documento fiscal definitivo, é só a pro-forma para o hóspede conferir). */
export default function PmsProformaDialog({ reservation: r, onClose }: { reservation: any; onClose: () => void }) {
  const [formato, setFormato] = useState('Fatura: Sumário por Estadia');
  const { data: folio } = useQuery({
    queryKey: ['pms', 'folios', r.folio_id],
    queryFn: async () => (await apiClient.get(`pms/folios/${r.folio_id}/`)).data,
    enabled: !!r.folio_id,
  });

  const imprimir = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const linhas = folio ? folio.charges.filter((c: any) => !c.is_void && c.charge_type !== 'PAYMENT').map((c: any) =>
      `<tr><td>${c.description}</td><td style="text-align:right">${money(c.amount)}</td></tr>`).join('')
      : `<tr><td>Alojamento (${r.nights} noite(s))</td><td style="text-align:right">${money(Number(r.rate) * (r.nights || 0))}</td></tr>`;
    w.document.write(`<html><head><title>Fatura Proforma — Reserva ${r.confirmation}</title></head><body style="font-family:sans-serif">` +
      `<h3>Fatura Proforma para a reserva ${r.confirmation}</h3>` +
      `<p><b>Entidade:</b> ${r.guest_name}${r.guest_tax_id ? ` · NIF ${r.guest_tax_id}` : ''}</p>` +
      `<p><b>Formato:</b> ${formato}</p>` +
      `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">${linhas}</table>` +
      `</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[560px] bg-[#f0f0f0] border border-[#8a8a8a] shadow-xl">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          Fatura Proforma para a reserva {r.confirmation}
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <label className="flex flex-col gap-0.5">Entidade:
            <select disabled className="border border-[#a0a0a0] p-1.5 bg-[#f4f4f4]"><option>{r.guest_name}</option></select>
          </label>
          <label className="flex flex-col gap-0.5">Agrupado por:
            <select disabled className="border border-[#a0a0a0] p-1.5 bg-[#f4f4f4]"><option>(Sem Agrupamento)</option></select>
          </label>
          <label className="flex flex-col gap-0.5">Formato:
            <select value={formato} onChange={(e) => setFormato(e.target.value)} className="border border-[#a0a0a0] p-1.5 bg-white">
              {FORMATOS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 bg-[#e8e8e8] border-t border-[#c0c0c0]">
          <button onClick={imprimir} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black"><Printer size={14} /> Imprimir</button>
          <button onClick={() => aviso('"Enviar E-mail" ainda não está construído nesta fase do PMS.')}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400"><Mail size={14} /> Enviar E-mail</button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#333] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
