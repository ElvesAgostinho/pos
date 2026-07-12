import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

function Row({ label, children, w = 'w-[150px]' }: { label: string; children: any; w?: string }) {
  return (
    <label className="flex items-center gap-3 text-[12px] min-w-0">
      <span className={`${w} flex-shrink-0 text-[#333]`}>{label}</span>
      {children}
    </label>
  );
}

/** Caixa + o campo que ela comanda. Desligada, o campo fica mesmo bloqueado. */
function CheckRow({ on, onToggle, label, children }: any) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center">
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={!!on} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4" />
        {label}
      </label>
      <div className={on ? '' : 'opacity-45 pointer-events-none'}>{children}</div>
    </div>
  );
}

/**
 * MODO DE PAGAMENTO — como o dinheiro entra, e o que o terminal faz a seguir.
 *
 * Cada caixa desta ficha muda o pagamento NO SERVIDOR, não só no ecrã:
 *   · Dá troco       — sem ela, o POS recusa cobrar acima do devido (cartão, TRF);
 *   · Consumo interno— só quem tem a caixa "Consumo interno" na ficha o pode lançar;
 *   · Lançar em Quarto— sem quarto indicado, o pagamento é recusado;
 *   · Perguntar nº de documento — cheque/TRF sem referência não se reconcilia no banco;
 *   · Converter troco em gratificação — a gorjeta entra na caixa como gorjeta, e não
 *     aparece como "sobra" misteriosa no fecho;
 *   · Abrir Gaveta / Imprime documento — o que o terminal faz assim que paga.
 */
export default function PaymentMethodEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    is_active: true, for_pos: true, method_type: 'CASH', currency: 'AOA', sort_order: 0,
    document_type: 'INVOICE', prints_document: true, allows_change: true, allows_refund: true,
    ...row,
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['posc', 'currencies'],
    queryFn: async () => (await apiClient.get('pos/config/currencies/')).data,
  });
  const { data: articles = [] } = useQuery({
    queryKey: ['posc', 'articles-all'],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/');
      return r.data?.results || r.data || [];
    },
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/payment-methods/', d)
      : apiClient.patch(`pos/config/payment-methods/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      qc.invalidateQueries({ queryKey: ['masterdata'] });
      notifyGuide({
        title: 'Modo de pagamento gravado',
        message: 'As caixas passam a valer já no POS: troco, gaveta, folio do quarto, nº de documento.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const artigo = (k: string) => (
    <select value={d[k] || ''} onChange={(e) => set(k, Number(e.target.value) || null)}
      className={`${inp} w-full`} style={inputStyle}>
      <option value="">Nenhum</option>
      {(articles as any[]).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo modo de pagamento' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-8 items-start">
          {/* Identificação */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-3">
              <Row label="Código:" w="w-[120px]">
                <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                  className={`${inp} w-[190px]`} style={inputStyle} />
              </Row>
              <span className="text-[12px] whitespace-nowrap">Código (Outro):</span>
              <select value={d.other_code || ''} onChange={(e) => set('other_code', e.target.value)}
                className={`${inp} w-[150px]`} style={inputStyle}>
                <option value="">—</option>
                <option value="CC">CC - Cartão Crédito</option>
                <option value="CD">CD - Cartão Débito</option>
                <option value="NU">NU - Numerário</option>
                <option value="TB">TB - Transferência</option>
                <option value="CH">CH - Cheque</option>
                <option value="OU">OU - Outro</option>
              </select>
            </div>
            <Row label="Descrição:" w="w-[120px]">
              <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Abreviatura:" w="w-[120px]">
              <input value={d.abbreviation || ''} onChange={(e) => set('abbreviation', e.target.value)}
                className={`${inp} w-[240px]`} style={inputStyle} />
            </Row>
            <Row label="Moeda:" w="w-[120px]">
              <select value={d.currency || 'AOA'} onChange={(e) => set('currency', e.target.value)}
                className={`${inp} w-[240px]`} style={inputStyle}>
                {(currencies as any[]).map((c) => <option key={c.id} value={c.code}>{c.symbol_unicode || c.code}</option>)}
                {(currencies as any[]).length === 0 && <option value="AOA">Kz</option>}
              </select>
            </Row>
            <Row label="Tipo:" w="w-[120px]">
              <select value={d.method_type} onChange={(e) => set('method_type', e.target.value)}
                className={`${inp} w-[240px]`} style={inputStyle}>
                {[['CASH', 'Dinheiro'], ['CARD', 'Cartão'], ['ROOM', 'Conta Quarto'], ['COMPANY', 'Conta Empresa'],
                  ['VOUCHER', 'Voucher'], ['GIFTCARD', 'Gift Card'], ['CREDIT', 'Crédito Cliente'], ['OTHER', 'Outro']]
                  .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Row>
            <Row label="Ordem:" w="w-[120px]">
              <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
                className={`${inp} w-[240px]`} style={inputStyle} />
            </Row>
            <Row label="Documento:" w="w-[120px]">
              <select value={d.document_type} onChange={(e) => set('document_type', e.target.value)}
                className={`${inp} w-[240px]`} style={inputStyle}>
                <option value="INVOICE">Fatura</option>
                <option value="RECEIPT">Talão</option>
              </select>
            </Row>
            <Row label="Cód. Modelo do Documento:" w="w-[120px]">
              <input value={d.document_model_code || ''} onChange={(e) => set('document_model_code', e.target.value)}
                className={`${inp} w-[240px]`} style={inputStyle} />
            </Row>
            <Row label="Referência PMS:" w="w-[120px]">
              <input value={d.pms_reference || ''} onChange={(e) => set('pms_reference', e.target.value)}
                className={`${inp} w-[240px]`} style={inputStyle} />
            </Row>
            <Row label="Conta de Contabilidade:" w="w-[120px]">
              <input value={d.accounting_account || ''} onChange={(e) => set('accounting_account', e.target.value)}
                placeholder="45.1.1 (caixa)" className={`${inp} w-[240px]`} style={inputStyle} />
            </Row>
          </div>

          {/* Estado, módulos e detalhes */}
          <div className="min-w-0">
            <div className="flex items-center gap-8 mb-2">
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
                Ativo
              </label>
            </div>
            <div className="flex items-center gap-6 text-[12px] mb-3">
              <span className="w-[80px] text-[#333]">Módulos:</span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.for_ems} onChange={(e) => set('for_ems', e.target.checked)} className="w-4 h-4" />Eventos</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.for_pos} onChange={(e) => set('for_pos', e.target.checked)} className="w-4 h-4" />POS</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.for_fnb} onChange={(e) => set('for_fnb', e.target.checked)} className="w-4 h-4" />F&B (contas a pagar)</label>
            </div>

            <div className="border border-[#c8c8c8]">
              <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold text-[#333] border-b border-[#d0d0d0]">Detalhes</div>
              <div className="p-3 space-y-2">
                <CheckRow on={d.tip_from_change} onToggle={(v: boolean) => set('tip_from_change', v)}
                  label="Converter troco para gratificação">{artigo('tip_item')}</CheckRow>
                <CheckRow on={d.internal_consumption} onToggle={(v: boolean) => set('internal_consumption', v)}
                  label="Consumo interno">{artigo('internal_item')}</CheckRow>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.charge_to_room} onChange={(e) => set('charge_to_room', e.target.checked)} className="w-4 h-4" />
                    Lançar em Quarto
                  </label>
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.opens_drawer} onChange={(e) => set('opens_drawer', e.target.checked)} className="w-4 h-4" />
                    Abrir Gaveta
                  </label>
                </div>

                <CheckRow on={d.external_interface} onToggle={(v: boolean) => set('external_interface', v)}
                  label="Interface Externo">
                  <input value={d.external_device || ''} onChange={(e) => set('external_device', e.target.value)}
                    placeholder="TPA / terminal de cartões" className={`${inp} w-full`} style={inputStyle} />
                </CheckRow>

                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!d.cross_selling} onChange={(e) => set('cross_selling', e.target.checked)} className="w-4 h-4" />
                  Cross Selling Interface
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.current_account} onChange={(e) => set('current_account', e.target.checked)} className="w-4 h-4" />
                    Conta Corrente
                  </label>
                  <label className={`flex items-center gap-2 text-[12px] ${d.current_account ? '' : 'opacity-45'}`}>
                    <input type="checkbox" checked={!!d.close_only_zero_balance} disabled={!d.current_account}
                      onChange={(e) => set('close_only_zero_balance', e.target.checked)} className="w-4 h-4" />
                    Só permitir fechar com saldo zero
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.direct_payment} onChange={(e) => set('direct_payment', e.target.checked)} className="w-4 h-4" />
                    Pagamento Direto
                  </label>
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.ask_document_number} onChange={(e) => set('ask_document_number', e.target.checked)} className="w-4 h-4" />
                    Perguntar nº de documento
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.prints_document} onChange={(e) => set('prints_document', e.target.checked)} className="w-4 h-4" />
                    Imprime documento
                  </label>
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.bank_transfer} onChange={(e) => set('bank_transfer', e.target.checked)} className="w-4 h-4" />
                    Transf. Bancária
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#eee]">
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.allows_change} onChange={(e) => set('allows_change', e.target.checked)} className="w-4 h-4" />
                    Dá troco
                  </label>
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d.allows_refund} onChange={(e) => set('allows_refund', e.target.checked)} className="w-4 h-4" />
                    Permite estorno
                  </label>
                </div>
              </div>

              {/* Pickup */}
              <div className="border-t border-[#d0d0d0] p-3 space-y-2">
                <label className="flex items-center gap-2 text-[12px] font-semibold">
                  <input type="checkbox" checked={!!d.allow_pickup} onChange={(e) => set('allow_pickup', e.target.checked)} className="w-4 h-4" />
                  Permite Pickup
                </label>
                <div className={d.allow_pickup ? '' : 'opacity-45 pointer-events-none'}>
                  <Row label="Montante para aviso:" w="w-[170px]">
                    <input type="number" step="any" value={d.pickup_alert_amount ?? 0}
                      onChange={(e) => set('pickup_alert_amount', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
                  </Row>
                  <Row label="Enviar aviso para:" w="w-[170px]">
                    <input type="email" value={d.pickup_alert_email || ''}
                      onChange={(e) => set('pickup_alert_email', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
                  </Row>
                </div>
              </div>
            </div>

            {d.internal_consumption && (
              <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1 mt-2">
                Só os utilizadores com <b>"Consumo interno"</b> na ficha o podem lançar — o servidor recusa aos outros.
              </div>
            )}
          </div>
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
