import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Split, ArrowRightLeft, Undo2, FileCheck2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar, pedir } from '../../ui/dialogo';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function PmsFolioPanel({ reservationId, onClose }: { reservationId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [folioId, setFolioId] = useState<number | null>(null);

  const { data: reservation } = useQuery({
    queryKey: ['pms', 'reservation', reservationId],
    queryFn: async () => (await apiClient.get(`pms/reservations/${reservationId}/`)).data,
  });
  const activeFolioId = folioId ?? reservation?.folio_id;

  const { data: folio, refetch } = useQuery({
    queryKey: ['pms', 'folio', activeFolioId],
    queryFn: async () => (await apiClient.get(`pms/folios/${activeFolioId}/`)).data,
    enabled: !!activeFolioId,
  });

  const invalidate = () => { refetch(); qc.invalidateQueries({ queryKey: ['pms'] }); };

  const addCharge = async () => {
    const desc = await pedir({ titulo: 'Novo Lançamento', mensagem: 'Descrição', entrada: 'texto' });
    if (!desc) return;
    const amountStr = await pedir({ titulo: 'Novo Lançamento', mensagem: 'Valor', entrada: 'numero' });
    if (!amountStr) return;
    try {
      await apiClient.post(`pms/folios/${activeFolioId}/post_charge/`, { description: desc, amount: amountStr, charge_type: 'MISC' });
      invalidate();
    } catch (e) { notifyError(e); }
  };
  const settle = async () => {
    if (!(await confirmar(`Registar pagamento de ${folio?.balance}?`))) return;
    try { await apiClient.post(`pms/folios/${activeFolioId}/settle/`, {}); invalidate(); }
    catch (e) { notifyError(e); }
  };
  const split = async () => {
    try {
      const r = await apiClient.post(`pms/folios/${activeFolioId}/split/`, {});
      setFolioId(r.data.id);
      invalidate();
    } catch (e) { notifyError(e); }
  };
  const reverseCharge = async (chargeId: number) => {
    const reason = await pedir({ titulo: 'Estorno', mensagem: 'Motivo', entrada: 'texto' });
    if (!reason) return;
    try { await apiClient.post(`pms/folios/${activeFolioId}/reverse-charge/`, { charge: chargeId, reason }); invalidate(); }
    catch (e) { notifyError(e); }
  };
  const transferCharge = async (chargeId: number) => {
    const sibling = folio?.sibling_folios?.[0];
    if (!sibling) { aviso('Não há outra conta nesta reserva — divida a conta primeiro.'); return; }
    try {
      await apiClient.post(`pms/folios/${activeFolioId}/transfer-charge/`, { charge: chargeId, target_folio: sibling.id });
      invalidate();
    } catch (e) { notifyError(e); }
  };
  const generateInvoice = async () => {
    if (!(await confirmar('Gerar a fatura fiscal (AGT) desta conta?'))) return;
    try {
      const r = await apiClient.post(`pms/folios/${activeFolioId}/generate-invoice/`, {});
      aviso(`Fatura emitida: ${r.data.invoice_number} · ${r.data.total}`);
      invalidate();
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[640px] max-h-[80vh] bg-[#f0f0f0] border border-[#8fa4bb] shadow-xl flex flex-col">
        <div className="h-8 flex items-center justify-between px-3 text-white text-[12px] font-bold" style={{ background: 'linear-gradient(to bottom, #2a5488, #183453)' }}>
          <span className="flex items-center gap-1.5"><Wallet size={13} /> Conta — {folio?.confirmation}</span>
          <button onClick={onClose} className="text-white/80 hover:text-white">×</button>
        </div>

        {folio?.sibling_folios?.length > 0 && (
          <div className="flex gap-1 px-2 py-1 bg-[#e8ecf1] border-b border-[#c0c7d0]">
            <button onClick={() => setFolioId(folio.id)} className="px-2 py-0.5 text-[10px] font-bold bg-[#1e3f66] text-white">{folio.label}</button>
            {folio.sibling_folios.map((s: any) => (
              <button key={s.id} onClick={() => setFolioId(s.id)} className="px-2 py-0.5 text-[10px] font-bold bg-white border border-[#c0c7d0] hover:bg-[#e6f3ff]">{s.label}</button>
            ))}
          </div>
        )}

        <div className="px-3 py-2 bg-white border-b border-[#d0d0d0] flex items-center justify-between text-[11px]">
          <span>{folio?.label} · {folio?.status_display} · {folio?.room_number ? `Quarto ${folio.room_number}` : ''}</span>
          <span className="font-bold text-[14px] text-[#1e3f66]">Saldo: {folio?.balance}</span>
        </div>

        <div className="flex-1 overflow-auto">
          <ClassicGrid rowKey="id" data={folio?.charges || []} columns={[
            { header: 'Data', accessor: (r: any) => new Date(r.created_at).toLocaleString('pt-PT'), width: '22%' },
            { header: 'Tipo', accessor: 'charge_type_display', width: '15%' },
            { header: 'Descrição', accessor: (r: any) => r.is_void ? <span className="line-through text-gray-400">{r.description}</span> : r.description, width: '38%' },
            { header: 'Valor', accessor: (r: any) => r.amount, width: '13%' },
            { header: '', accessor: (r: any) => (r.is_void || r.charge_type === 'PAYMENT') ? null : (
              <div className="flex gap-1">
                <button title="Transferir" onClick={() => transferCharge(r.id)} className="text-blue-700 hover:text-blue-900"><ArrowRightLeft size={12} /></button>
                <button title="Estornar" onClick={() => reverseCharge(r.id)} className="text-red-600 hover:text-red-800"><Undo2 size={12} /></button>
              </div>
            ), width: '12%' },
          ]} />
        </div>

        <div className="flex flex-wrap gap-2 p-2 bg-[#e8e8e8] border-t border-[#c0c0c0]">
          <ClassicButton icon={Plus} label="Lançar" onClick={addCharge} />
          <ClassicButton icon={Split} label="Dividir Conta" onClick={split} />
          <ClassicButton icon={Wallet} label="Registar Pagamento" onClick={settle} />
          <ClassicButton icon={FileCheck2} label="Gerar Fatura (AGT)" onClick={generateInvoice} />
          <div className="flex-1" />
          <ClassicButton label="Fechar" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
