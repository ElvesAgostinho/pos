import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

function Fieldset({ title, children }: { title: string; children: any }) {
  return (
    <fieldset className="border border-[#c8c8c8] px-4 pb-3 pt-1 min-w-0">
      <legend className="text-[12px] text-[#333] px-1">{title}</legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}
function Row({ label, children, w = 'w-[150px]' }: { label: string; children: any; w?: string }) {
  return (
    <label className="flex items-center gap-3 text-[12px] min-w-0">
      <span className={`${w} flex-shrink-0 text-[#333]`}>{label}</span>
      {children}
    </label>
  );
}

/**
 * MOEDA — a taxa a que o hotel recebe em dólares, euros, kwanzas.
 *
 * Há duas taxas diferentes e não é engano:
 *   · COMPRA e VENDA — o balcão de câmbio. O hotel compra o dólar ao hóspede mais
 *     barato do que o vende; essa diferença é a MARGEM, e margem é receita — por
 *     isso tem de ir parar a um artigo/conta ("Encargo para margem").
 *   · TAXA DE CÂMBIO — a que converte os lançamentos em moeda estrangeira para a
 *     moeda local. É esta que a fatura e a contabilidade usam.
 *
 * Cada gravação deixa uma linha no HISTÓRICO. Numa auditoria da AGT a pergunta é
 * sempre "com que taxa foi convertida esta fatura de Novembro?" — e a resposta
 * está lá, com o nome de quem mudou.
 */
export default function CurrencyEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [hist, setHist] = useState(false);
  const [d, setD] = useState<any>({
    is_active: true, is_local: false, print_on_pos_docs: false, excluded: false,
    buy_rate: 0, sell_rate: 0, margin: 0, rate_to_base: 0, exchange_margin: 0,
    commission_mode: 'FIXED', commission_fixed: 0, commission_percent: 0, ...row,
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
      ? apiClient.post('pos/config/currencies/', d)
      : apiClient.patch(`pos/config/currencies/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Moeda gravada',
        message: 'A alteração ficou no histórico com a data e o seu nome. A taxa é a mesma no POS, na fatura e na contabilidade.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const num = (k: string, w = 'w-[290px]') => (
    <input type="number" step="any" value={d[k] ?? 0} onChange={(e) => set(k, e.target.value)}
      className={`${inp} ${w}`} style={inputStyle} />
  );
  const charge = (k: string) => (
    <select value={d[k] || ''} onChange={(e) => set(k, Number(e.target.value) || null)}
      className={`${inp} w-[230px]`} style={inputStyle}>
      <option value="">Nenhum</option>
      {(articles as any[]).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Nova moeda' : `A editar ${d.code}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Topo */}
        <div className="grid grid-cols-2 gap-8 mb-4">
          <div className="space-y-2">
            <Row label="Código ISO:" w="w-[110px]">
              <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                maxLength={8} className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <label className="flex items-start gap-3 text-[12px]">
              <span className="w-[110px] flex-shrink-0 text-[#333] pt-1">Descrição:</span>
              <textarea value={d.name || ''} onChange={(e) => set('name', e.target.value)} rows={3}
                className={`${inp} flex-1`} style={inputStyle} />
            </label>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
              Ativo
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_local} onChange={(e) => set('is_local', e.target.checked)} className="w-4 h-4" />
              Moeda Local
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.print_on_pos_docs} onChange={(e) => set('print_on_pos_docs', e.target.checked)} className="w-4 h-4" />
              Imprimir nos documentos de POS
            </label>
            {d.is_local && (
              <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1">
                Só pode haver <b>uma</b> moeda local — ao gravar, as outras deixam de o ser.
                É nela que a contabilidade fecha.
              </div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[12px] w-[110px]">Símbolo:</span>
              <input value={d.symbol || ''} onChange={(e) => set('symbol', e.target.value)}
                maxLength={8} className={`${inp} w-[130px]`} style={inputStyle} />
              <span className="text-[12px]">Símbolo (Unicode):</span>
              <input value={d.symbol_unicode || ''} onChange={(e) => set('symbol_unicode', e.target.value)}
                maxLength={16} placeholder="Kz  $  €" className={`${inp} w-[110px]`} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Painéis */}
        <div className="grid grid-cols-2 gap-6 items-start">
          <div className="space-y-4 min-w-0">
            <Fieldset title="Taxas de Câmbio de Compra e Venda">
              <Row label="Data de Referência:">
                <input type="date" value={(d.reference_date || '').slice(0, 10)}
                  onChange={(e) => set('reference_date', e.target.value || null)}
                  className={`${inp} w-[290px]`} style={inputStyle} />
              </Row>
              <Row label="Taxa de Compra:">{num('buy_rate')}</Row>
              <Row label="Taxa de Venda:">{num('sell_rate')}</Row>
              <Row label="Margem:">{num('margin')}</Row>
              <label className="flex items-center gap-2 text-[12px] pt-1">
                <input type="checkbox" checked={!!d.excluded} onChange={(e) => set('excluded', e.target.checked)} className="w-4 h-4" />
                Excluído
              </label>
              <div className="text-[11px] text-[#666] pt-1">
                Compra abaixo de venda: a diferença é a margem do balcão de câmbio.
              </div>
            </Fieldset>

            <Fieldset title="Taxa de Câmbio para lançamentos em moeda estrangeira">
              <Row label="Taxa de Câmbio:">{num('rate_to_base')}</Row>
              <Row label="Margem:">{num('exchange_margin')}</Row>
              <div className="text-[11px] text-[#666] pt-1">
                É esta que converte a conta para a moeda local — na fatura e na contabilidade.
              </div>
            </Fieldset>
          </div>

          <Fieldset title="Transação">
            <Row label="Encargo para margem:">{charge('margin_charge')}</Row>
            <Row label="Conta Paymaster:">
              <input value={d.paymaster_account || ''} onChange={(e) => set('paymaster_account', e.target.value)}
                className={`${inp} w-[230px]`} style={inputStyle} />
            </Row>

            <div className="pt-3 space-y-2">
              <label className="flex items-center gap-3 text-[12px]">
                <input type="radio" checked={d.commission_mode === 'FIXED'} onChange={() => set('commission_mode', 'FIXED')} className="w-4 h-4" />
                <span className="w-[130px]">Comissão Fixa</span>
                <input type="number" step="any" value={d.commission_fixed ?? 0} disabled={d.commission_mode !== 'FIXED'}
                  onChange={(e) => set('commission_fixed', e.target.value)}
                  className={`${inp} w-[210px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle} />
              </label>
              <label className="flex items-center gap-3 text-[12px]">
                <input type="radio" checked={d.commission_mode === 'PERCENT'} onChange={() => set('commission_mode', 'PERCENT')} className="w-4 h-4" />
                <span className="w-[130px]">Comissão Perct.</span>
                <input type="number" step="any" value={d.commission_percent ?? 0} disabled={d.commission_mode !== 'PERCENT'}
                  onChange={(e) => set('commission_percent', e.target.value)}
                  className={`${inp} w-[210px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle} />
              </label>
            </div>

            <div className="pt-6">
              <Row label="Encargo para Comissão:">{charge('commission_charge')}</Row>
            </div>
          </Fieldset>
        </div>
      </div>

      {hist && <CurrencyHistory id={row.id} code={d.code} onClose={() => setHist(false)} />}

      <Toolbar actions={[
        ...(isNew ? [] : [{ icon: '🕐', label: 'Histórico', color: '#2b2b2b', onClick: () => setHist(true) }]),
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}

/** HISTÓRICO — só de leitura. Ninguém o apaga pelo ecrã. */
function CurrencyHistory({ id, code, onClose }: { id: number; code: string; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['posc', 'cur-hist', id],
    queryFn: async () => (await apiClient.get(`pos/config/currencies/${id}/history/`)).data,
  });
  const dt = (s: string) => new Date(s).toLocaleString('pt-PT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-[#f4f4f4] border border-[#888] w-[1000px] max-w-[95vw] h-[65vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
          <span>{code} - Histórico</span>
          <button onClick={onClose} className="w-5 h-5 bg-[#c0392b] text-[12px] leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
              {['Data da alteração', 'Utilizador', 'Código ISO', 'Descrição', 'Taxa de Câmbio', 'Taxa de Compra', 'Taxa de Venda', 'Ativo'].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(rows as any[]).map((h) => (
                <tr key={h.id} className="border-b border-[#eee] hover:bg-[#f7f9fb]">
                  <td className="px-2 py-1.5 whitespace-nowrap">{dt(h.changed_at)}</td>
                  <td className="px-2 py-1.5">{h.changed_by}</td>
                  <td className="px-2 py-1.5">{h.code}</td>
                  <td className="px-2 py-1.5">{h.name}</td>
                  <td className="px-2 py-1.5 font-mono">{Number(h.rate_to_base)}</td>
                  <td className="px-2 py-1.5 font-mono">{Number(h.buy_rate)}</td>
                  <td className="px-2 py-1.5 font-mono">{Number(h.sell_rate)}</td>
                  {/* Sem onChange: o passado não se reescreve. */}
                  <td className="text-center"><GridCheck checked={h.is_active} title="Estado nesse momento (histórico)" /></td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={8} className="text-center text-[#999] py-10">Ainda não há alterações registadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-1.5 text-[11px] text-[#666] bg-[#f4f4f4] border-t border-[#e0e0e0]">
          Só de leitura — é a prova de com que taxa cada fatura foi convertida.
        </div>
        <Toolbar actions={[{ icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose }]} />
      </div>
    </div>
  );
}
