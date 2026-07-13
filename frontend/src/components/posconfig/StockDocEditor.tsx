import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

type Tab = 'geral' | 'stocks' | 'print' | 'states';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[120px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * DOCUMENTO DE STOCK — a série de cada movimento do armazém.
 *
 * As caixas do separador STOCKS não são cosmética: dizem o que ESTE documento faz
 * ao custo. Uma fatura de fornecedor atualiza o custo médio (a mercadoria entrou a
 * um preço novo); uma transferência entre armazéns NÃO — a mesma garrafa não muda
 * de valor por mudar de sala. Trocar isto corrompe o custo de todos os artigos.
 *
 * Os ESTADOS DISPONÍVEIS são o circuito de aprovação: uma requisição da cozinha
 * passa por Pendente → Aprovado → Cumprido. Sem estados, qualquer um tira o que
 * quer do armazém.
 */
export default function StockDocEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<Tab>('geral');
  const [sel, setSel] = useState<number | null>(null);
  const [d, setD] = useState<any>({
    is_active: true, kind: 'STOCK', series_number: '1', year: 0, current_number: 0,
    links_stock: true, updates_avg_cost: true, updates_last_price: true,
    external_dup: 'IGNORE', print_models: [], status_ids: [], ...row,
  });

  const { data: estados = [] } = useQuery({
    queryKey: ['posc', 'docstatus'],
    queryFn: async () => (await apiClient.get('pos/config/doc-status/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/stock-docs/', d)
      : apiClient.patch(`pos/config/stock-docs/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Documento gravado',
        message: 'As caixas do separador Stocks decidem o que este documento faz ao custo médio.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const pms: any[] = d.print_models || [];
  const setPm = (i: number, k: string, v: any) => set('print_models', pms.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const sids: number[] = d.status_ids || [];
  const toggleS = (id: number) => set('status_ids', sids.includes(id) ? sids.filter((x) => x !== id) : [...sids, id]);

  const TABS: [Tab, string][] = [
    ['geral', 'Geral'], ['stocks', 'Stocks'],
    ['print', 'Modelo de Impressão'], ['states', 'Estados disponíveis'],
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo documento' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Ficha */}
        <div className="w-[38%] p-4 space-y-2 overflow-auto border-r border-[#e0e0e0]">
          <div className="flex items-start gap-4">
            <Row label="Código:">
              <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                className={`${inp} w-[170px]`} style={inputStyle} />
            </Row>
            <label className="flex items-center gap-2 text-[12px] pt-1">
              <input type="checkbox" checked={!!d.is_closed} onChange={(e) => set('is_closed', e.target.checked)} className="w-4 h-4" />
              Série fechada
            </label>
          </div>
          <Row label="Nº Série:">
            <input value={d.series_number || ''} onChange={(e) => set('series_number', e.target.value)}
              className={`${inp} w-[170px]`} style={inputStyle} />
          </Row>
          <Row label="Ano:">
            <input type="number" value={d.year ?? 0} onChange={(e) => set('year', Number(e.target.value))}
              className={`${inp} w-[170px]`} style={inputStyle} />
          </Row>
          <Row label="Número:">
            <input value={d.current_number ?? 0} readOnly
              className={`${inp} w-[170px] bg-[#f0f0f0] text-[#666]`} style={inputStyle} />
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Tipo:">
            <select value={d.kind} onChange={(e) => set('kind', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle}>
              {[['STOCK', 'Stocks'], ['SALES_STOCK', 'Stock de Vendas'], ['REQUEST', 'Requisição'],
                ['TRANSFER', 'Transferência'], ['INVENTORY', 'Inventário'], ['ORDER', 'Encomenda'],
                ['INVOICE', 'Faturação'], ['DELIVERY', 'Guia']].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Row>
          <Row label="Último documento:">
            <input type="date" value={(d.last_doc_date || '').slice(0, 10)}
              onChange={(e) => set('last_doc_date', e.target.value || null)}
              className={`${inp} w-[170px]`} style={inputStyle} />
          </Row>
          <label className="flex items-center gap-2 text-[12px] pt-1">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>
        </div>

        {/* Separadores */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b-2 border-[#2b2b2b] px-2">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-1.5 text-[12px] font-semibold border-b-[3px] ${tab === k
                  ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {tab === 'geral' && (
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  {([['links_stock', 'Ligação aos stocks'],
                     ['links_current_account', 'Ligação a contas correntes'],
                     ['convertible', 'Sujeito a conversão'],
                     ['allow_future', 'Permite lançamentos futuros'],
                     ['notes_required', 'Campo obrigatório - Observações']] as const).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-[12px]">
                      <input type="checkbox" checked={!!d[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4" />
                      {l}
                    </label>
                  ))}
                </div>

                <div className="space-y-4">
                  <fieldset className="border border-[#c8c8c8] px-3 pb-3 pt-1">
                    <legend className="text-[12px] px-1">Natureza</legend>
                    {[['RECEIVABLE', 'Documento a receber'], ['PAYABLE', 'Documento a pagar']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 text-[12px] py-0.5">
                        <input type="radio" checked={d.nature === v} onChange={() => set('nature', v)} className="w-4 h-4" />
                        {l}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset className="border border-[#c8c8c8] px-3 pb-3 pt-1">
                    <legend className="text-[12px] px-1">Documento externo</legend>
                    {[['IGNORE', 'Ignorar duplicação'], ['WARN', 'Informar sobre duplicação'],
                      ['BLOCK', 'Não permite duplicação']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 text-[12px] py-0.5">
                        <input type="radio" checked={d.external_dup === v}
                          onChange={() => set('external_dup', v)} className="w-4 h-4" />
                        {l}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-[12px] pt-2 border-t border-[#eee] mt-2">
                      <input type="checkbox" checked={!!d.external_required}
                        onChange={(e) => set('external_required', e.target.checked)} className="w-4 h-4" />
                      Preenchimento obrigatório
                    </label>
                    <div className="text-[11px] text-[#666] mt-1">
                      "Não permite duplicação" impede pagar a mesma fatura do fornecedor duas vezes.
                    </div>
                  </fieldset>
                </div>
              </div>
            )}

            {tab === 'stocks' && (
              <div className="space-y-2 max-w-[600px]">
                {([['updates_avg_cost', 'Atualiza custo médio',
                    'Só os documentos de ENTRADA o devem fazer. Uma transferência não: a mesma garrafa não muda de valor por mudar de sala.'],
                   ['updates_last_price', 'Atualiza último preço', 'Guarda quanto se pagou da última vez.'],
                   ['updates_last_entry_date', 'Atualiza última data de entrada', '']] as const).map(([k, l, ajuda]) => (
                  <label key={k} className="flex items-start gap-2 text-[12px]">
                    <input type="checkbox" checked={!!d[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4 mt-px" />
                    <span><b>{l}</b>{ajuda && <span className="text-[#888]"> — {ajuda}</span>}</span>
                  </label>
                ))}
              </div>
            )}

            {tab === 'print' && (
              <div className="border border-[#c8c8c8]">
                <table className="w-full text-[12px] border-collapse">
                  <thead><tr className="bg-[#f0f0f0]">
                    {['Tipo', 'Código', 'Descrição', 'Modelo', 'Ordem', 'Ativo'].map((h) => (
                      <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {pms.map((m, i) => (
                      <tr key={i} onClick={() => setSel(i)}
                        className={`border-b border-[#eee] cursor-pointer ${sel === i ? 'bg-[#cfe2f3]' : ''}`}>
                        <td className="p-0.5"><input value={m.kind} onChange={(e) => setPm(i, 'kind', e.target.value)} className={cell} /></td>
                        <td className="p-0.5 w-[70px]"><input value={m.code} onChange={(e) => setPm(i, 'code', e.target.value)} className={cell} /></td>
                        <td className="p-0.5"><input value={m.description || ''} onChange={(e) => setPm(i, 'description', e.target.value)} className={cell} /></td>
                        <td className="p-0.5"><input value={m.model_path || ''} onChange={(e) => setPm(i, 'model_path', e.target.value)} className={`${cell} text-[#1a4f8a]`} /></td>
                        <td className="p-0.5 w-[70px]"><input type="number" value={m.sort_order} onChange={(e) => setPm(i, 'sort_order', Number(e.target.value))} className={cell} /></td>
                        <td className="text-center w-[60px]"><GridCheck checked={m.is_active} onChange={(v) => setPm(i, 'is_active', v)} /></td>
                      </tr>
                    ))}
                    {pms.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-[#999] py-8">Sem modelos de impressão.</td></tr>
                    )}
                  </tbody>
                </table>
                <div className="flex items-center gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d5d5d5]">
                  <button onClick={() => set('print_models', [...pms, {
                    kind: 'Normal', code: String(pms.length + 1), description: 'Normal',
                    model_path: '', sort_order: pms.length + 1, is_active: true,
                  }])} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
                    <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
                  </button>
                  <button onClick={() => { if (sel !== null) { set('print_models', pms.filter((_, j) => j !== sel)); setSel(null); } }}
                    disabled={sel === null}
                    className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
                    <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Apagar
                  </button>
                </div>
              </div>
            )}

            {tab === 'states' && (
              <div className="max-w-[420px]">
                <div className="text-[11px] text-[#666] mb-2">
                  Os estados por que este documento pode passar. É o circuito de aprovação —
                  sem ele, qualquer pessoa tira o que quer do armazém.
                </div>
                <div className="border border-[#c8c8c8]">
                  {(estados as any[]).map((s) => (
                    <label key={s.id}
                      className="flex items-center gap-3 px-2 py-1.5 border-b border-[#eee] cursor-pointer hover:bg-[#f7f9fb]">
                      <input type="checkbox" checked={sids.includes(s.id)} onChange={() => toggleS(s.id)} className="w-4 h-4" />
                      <span className="flex-1 px-3 py-1 text-[12px] font-bold text-center"
                        style={{ background: s.bg_color, color: s.text_color }}>
                        {s.name}
                      </span>
                    </label>
                  ))}
                  {(estados as any[]).length === 0 && (
                    <div className="text-center text-[#999] py-6 text-[12px]">
                      Sem estados. Crie-os em <b>Status dos documentos</b>.
                    </div>
                  )}
                </div>
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
