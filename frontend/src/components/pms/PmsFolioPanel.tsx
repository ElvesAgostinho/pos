import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Undo2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { printFiscalInvoice } from '../fiscal/printInvoice';
import { aviso, confirmar, pedir } from '../../ui/dialogo';
import { Toolbar, Glyph } from '../posconfig/kit';
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
  // UMA CONTA, UMA FATURA. Faturada a conta, o botão deixa de oferecer emitir
  // outra (o servidor recusa, e com razão) e passa a dar acesso à que existe —
  // que é o que quem carrega ali quer: ver ou reimprimir o documento. Antes
  // oferecia sempre "Gerar Fatura" e respondia com um erro a quem só queria o
  // papel outra vez.
  const abrirFatura = async () => {
    try {
      const docs = (await apiClient.get('fiscal/documents/', {
        params: { source_module: 'pms', source_ref: activeFolioId },
      })).data;
      const arr = docs?.results || docs;
      if (arr && arr[0]) await printFiscalInvoice(arr[0].id, false);
      else aviso(`Esta conta está faturada (${folio.fiscal_document_number}), mas o documento não `
               + `foi encontrado no arquivo fiscal. Procure-o em Fiscal → Documentos.`);
    } catch (e) { notifyError(e); }
  };

  const generateInvoice = async () => {
    if (folio?.fiscal_document_number) return abrirFatura();
    if (!(await confirmar('Gerar a fatura fiscal (AGT) desta conta?'))) return;
    try {
      const r = await apiClient.post(`pms/folios/${activeFolioId}/generate-invoice/`, {});
      aviso(`Fatura emitida: ${r.data.invoice_number} · ${r.data.total}`);
      invalidate();
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[640px] max-h-[80vh] bg-[#F4F6F7] border border-[#C8D2D5] shadow-xl rounded-[16px] overflow-hidden flex flex-col">
        <div className="h-8 flex items-center justify-between px-3 text-white text-[12px] font-bold" style={{ background: 'linear-gradient(to bottom, #062F35, #062F35)' }}>
          <span className="flex items-center gap-1.5"><Glyph icon="💳" size={13} /> Conta — {folio?.confirmation}</span>
          <button onClick={onClose} className="text-white/80 hover:text-white">×</button>
        </div>

        {folio?.sibling_folios?.length > 0 && (
          <div className="flex gap-1 px-2 py-1 bg-[#F4F6F7] border-b border-[#C8D2D5]">
            <button onClick={() => setFolioId(folio.id)} className="px-2 py-0.5 text-[10px] font-bold bg-[#062F35] text-white">{folio.label}</button>
            {folio.sibling_folios.map((s: any) => (
              <button key={s.id} onClick={() => setFolioId(s.id)} className="px-2 py-0.5 text-[10px] font-bold bg-white border border-[#C8D2D5] hover:bg-[#F4F6F7]">{s.label}</button>
            ))}
          </div>
        )}

        <div className="px-3 py-2 bg-white border-b border-[#E4E9EB] flex items-center justify-between text-[11px]">
          <span>{folio?.label} · {folio?.status_display} · {folio?.room_number ? `Quarto ${folio.room_number}` : ''}</span>
          <span className="font-bold text-[14px] text-[#1F292C]">Saldo: {folio?.balance}</span>
        </div>

        <div className="flex-1 overflow-auto">
          <ClassicGrid rowKey="id" data={folio?.charges || []} columns={[
            { header: 'Data', accessor: (r: any) => new Date(r.created_at).toLocaleString('pt-PT'), width: '22%' },
            { header: 'Tipo', accessor: 'charge_type_display', width: '15%' },
            { header: 'Descrição', accessor: (r: any) => r.is_void ? <span className="line-through text-gray-400">{r.description}</span> : r.description, width: '38%' },
            { header: 'Valor', accessor: (r: any) => r.amount, width: '13%' },
            { header: '', accessor: (r: any) => (r.is_void || r.charge_type === 'PAYMENT') ? null : (
              <div className="flex gap-1">
                <button title="Transferir" onClick={() => transferCharge(r.id)} className="text-[#1F292C] hover:text-[#1F292C]"><ArrowRightLeft size={12} /></button>
                <button title="Estornar" onClick={() => reverseCharge(r.id)} className="text-[#A83A3A] hover:text-[#A83A3A]"><Undo2 size={12} /></button>
              </div>
            ), width: '12%' },
          ]} />
        </div>

        <Toolbar actions={[
          { label: 'Lançar', icon: '＋', color: '#062F35', onClick: addCharge },
          { label: 'Dividir Conta', icon: '✂', color: '#4B858E', onClick: split },
          { label: 'Registar Pagamento', icon: '💳', color: '#062F35', onClick: settle },
          { label: folio?.fiscal_document_number ? `Ver Fatura (${folio.fiscal_document_number})` : 'Gerar Fatura (AGT)',
            icon: '🧾', color: '#062F35', onClick: generateInvoice },
        ]} right={
          <button onClick={onClose} className="px-2 py-1 text-[12px] text-[#1F292C] border border-transparent hover:border-[#C8D2D5] hover:bg-[#F4F6F7] rounded-[6px]">Fechar</button>
        } />
      </div>
    </div>
  );
}
