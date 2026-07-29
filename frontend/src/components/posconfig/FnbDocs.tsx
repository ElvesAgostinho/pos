import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money, Glyph } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';
const L = ({ w = 'w-[120px]', children }: any) => (
  <span className={`text-[12px] text-[#333] ${w} flex-shrink-0`}>{children}</span>
);

function useList(ep: string, key: string) {
  return useQuery({
    queryKey: ['fnb', key],
    queryFn: async () => {
      const r = await apiClient.get(ep);
      return (r.data?.results || r.data || []) as any[];
    },
  });
}

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * COMPRAS · DOCUMENTOS INTERNOS · INVENTÁRIO — o mesmo documento de stock.
 *
 * O que muda entre eles é a SÉRIE, e são as caixas da série que decidem tudo:
 * se mexe no stock, se atualiza o custo médio, se é um documento a pagar. Por isso
 * há um só ecrã: três ecrãs diferentes seriam três motores a divergir.
 *
 * `mode`:
 *   PURCHASE  — Compras (entidade, condições de pagamento, IVA, totais)
 *   INTERNAL  — Documentos Internos (armazém origem → destino, data de entrega)
 *   INVENTORY — Inventário (a quantidade é a CONTAGEM; o sistema faz o acerto)
 */
export default function FnbDocs({ mode }: { mode: 'PURCHASE' | 'INTERNAL' | 'INVENTORY' }) {
  const qc = useQueryClient();
  const KINDS = mode === 'PURCHASE' ? 'ORDER,INVOICE,STOCK'
    : mode === 'INTERNAL' ? 'REQUEST,TRANSFER,DELIVERY' : 'INVENTORY';

  const [f, setF] = useState<any>({ from: '', to: '' });
  const [aplicado, setAplicado] = useState<any>({});
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [filtro, setFiltro] = useState('');

  const { data: series = [] } = useList('pos/config/stock-docs/', 'series');
  const { data: estados = [] } = useList('pos/config/doc-status/', 'status');
  const { data: armazens = [] } = useList('pos/config/warehouses/', 'wh');
  const { data: termos = [] } = useList('pos/config/payment-terms/', 'terms');
  const { data: entidades = [] } = useList('pos/marketing/entities/', 'ents');
  const { data: artigos = [] } = useList('inventory/pos/articles/', 'arts');

  const doMode = series.filter((s: any) => KINDS.split(',').includes(s.kind));

  const { data: rows = [] } = useQuery({
    queryKey: ['fnb', 'docs', KINDS, aplicado],
    queryFn: async () => {
      const params: any = { kinds: KINDS };
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await apiClient.get('pos/fnb/documents/', { params });
      return (r.data?.results || r.data || []) as any[];
    },
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['fnb'] });
  const gravar = useMutation({
    mutationFn: (v: any) => v.id ? apiClient.patch(`pos/fnb/documents/${v.id}/`, v)
      : apiClient.post('pos/fnb/documents/', v),
    onSuccess: (r: any) => {
      setEdit(null); inval();
      notifyGuide({ title: 'Documento gravado', message: `${r.data.number} — por lançar. Use "Lançar no stock" quando a mercadoria entrar.` });
    },
    onError: notifyError,
  });
  const lancar = useMutation({
    mutationFn: (id: number) => apiClient.post(`pos/fnb/documents/${id}/post_stock/`, {}),
    onSuccess: (r: any) => { setEdit(null); inval(); notifyGuide({ title: 'Lançado no stock', message: r.data.detail }); },
    onError: notifyError,
  });
  const anular = useMutation({
    mutationFn: (id: number) => apiClient.post(`pos/fnb/documents/${id}/void/`, {}),
    onSuccess: (r: any) => { inval(); notifyGuide({ title: 'Anulado', message: r.data.detail }); },
    onError: notifyError,
  });
  const copiar = useMutation({
    mutationFn: (id: number) => apiClient.post(`pos/fnb/documents/${id}/duplicate/`, {}),
    onSuccess: (r: any) => { inval(); setEdit(r.data); },
    onError: notifyError,
  });

  const total = rows.length;
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const pesquisar = () => { setAplicado({ ...f }); setPage(1); };
  const selRow = rows.find((r) => r.id === sel);

  const exportar = () => {
    const head = ['Documento', 'Data', 'Entidade', 'Armazém', 'Total', 'Estado'];
    const csv = [head.join(';'), ...rows.map((r) => [
      r.number, r.doc_date, r.entity_name || '', r.warehouse_name || '', r.total,
      r.voided ? 'Anulado' : r.posted ? 'Lançado' : 'Por lançar'].join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'documentos.csv'; a.click();
  };

  // ─────────────────────────────────── NOVO DOCUMENTO
  if (edit) {
    const linhas: any[] = edit.lines || [];
    const setLinha = (i: number, campo: string, v: any) => {
      const novas = linhas.map((l, k) => k === i ? { ...l, [campo]: v } : l);
      setEdit({ ...edit, lines: novas });
    };
    const addLinha = () => setEdit({
      ...edit, lines: [...linhas, { item: '', quantity: 0, unit_cost: 0, tax_percentage: 14, discount_percent: 0 }],
    });
    const stockDe = (itemId: any) => {
      const a = artigos.find((x: any) => String(x.id) === String(itemId));
      return a?.stock_qty ?? '—';
    };

    const dec = (v: any) => Number(v || 0);
    const sub = linhas.reduce((s, l) => s + dec(l.quantity) * dec(l.unit_cost), 0);
    const descArt = linhas.reduce((s, l) => s + dec(l.quantity) * dec(l.unit_cost) * dec(l.discount_percent) / 100, 0);
    const descGlobal = (sub - descArt) * dec(edit.discount_percent) / 100;
    const liq = sub - descArt - descGlobal;
    const iva = linhas.reduce((s, l) => {
      const bruto = dec(l.quantity) * dec(l.unit_cost) * (1 - dec(l.discount_percent) / 100);
      return s + (edit.tax_included
        ? bruto - bruto / (1 + dec(l.tax_percentage) / 100)
        : bruto * dec(l.tax_percentage) / 100);
    }, 0);
    const tot = edit.tax_included ? liq : liq + iva;

    const artigosFiltrados = filtro
      ? artigos.filter((a: any) => (a.name + a.code).toLowerCase().includes(filtro.toLowerCase()))
      : artigos;

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
        <div className="px-3 py-2 bg-[#3c3c3c] text-white text-[13px] font-bold">
          {edit.id ? `Documento ${edit.number}` : 'Novo documento'}
          {edit.posted && <span className="ml-3 px-2 py-0.5 bg-[#1f7a34] text-[11px]">LANÇADO NO STOCK</span>}
        </div>

        <div className="flex gap-3 p-3">
          {/* cabeçalho */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <L>Documento:</L>
              <select value={edit.series ?? ''} onChange={(e) => setEdit({ ...edit, series: e.target.value })}
                disabled={edit.posted} className={`${inp} w-[240px]`} style={inputStyle}>
                <option value="">(nenhum)</option>
                {doMode.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <L>{mode === 'INTERNAL' ? 'Armazém origem:' : 'Armazém:'}</L>
              <select
                value={(mode === 'INTERNAL' ? edit.warehouse_from : edit.warehouse) ?? ''}
                onChange={(e) => setEdit({
                  ...edit,
                  [mode === 'INTERNAL' ? 'warehouse_from' : 'warehouse']: e.target.value,
                })}
                disabled={edit.posted} className={`${inp} w-[240px]`} style={inputStyle}>
                <option value="">—</option>
                {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {mode === 'INTERNAL' && (
              <div className="flex items-center gap-2">
                <L>Armazém destino:</L>
                <select value={edit.warehouse ?? ''} onChange={(e) => setEdit({ ...edit, warehouse: e.target.value })}
                  disabled={edit.posted} className={`${inp} w-[240px]`} style={inputStyle}>
                  <option value="">—</option>
                  {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-start gap-2">
              <L>Observações:</L>
              <textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                rows={3} className={`${inp} w-[380px]`} style={inputStyle} />
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <L w="w-[140px]">Data Documento:</L>
              <input type="date" value={edit.doc_date ?? ''} onChange={(e) => setEdit({ ...edit, doc_date: e.target.value })}
                className={`${inp} w-[170px]`} style={inputStyle} />
            </div>
            {mode === 'PURCHASE' && (
              <>
                <div className="flex items-center gap-2">
                  <L w="w-[140px]">Condições pagamento:</L>
                  <select value={edit.payment_term ?? ''} onChange={(e) => setEdit({ ...edit, payment_term: e.target.value })}
                    className={`${inp} w-[170px]`} style={inputStyle}>
                    <option value="">—</option>
                    {termos.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <L w="w-[140px]">Referência:</L>
                  <input value={edit.external_ref ?? ''} onChange={(e) => setEdit({ ...edit, external_ref: e.target.value })}
                    className={`${inp} w-[170px]`} style={inputStyle} placeholder="nº da fatura do fornecedor" />
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <L w="w-[140px]">{mode === 'INTERNAL' ? 'Data de entrega:' : 'Data de vencimento:'}</L>
              <input type="date" value={edit.due_date ?? ''} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })}
                className={`${inp} w-[170px]`} style={inputStyle} />
            </div>
            <div className="flex items-center gap-2">
              <L w="w-[140px]">Estado:</L>
              <select value={edit.status ?? ''} onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                className={`${inp} w-[170px]`} style={inputStyle}>
                <option value="">—</option>
                {estados.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Entidade + Totais */}
          <div className="w-[42%] flex gap-3">
            {mode === 'PURCHASE' && (
              <div className="flex-1 border border-[#c8c8c8] bg-white">
                <div className="px-2 py-1 bg-[#e4e4e4] text-[12px] font-bold border-b border-[#c8c8c8]">Entidade</div>
                <div className="p-2 space-y-1">
                  <select value={edit.entity ?? ''} onChange={(e) => setEdit({ ...edit, entity: e.target.value })}
                    className={`${inp} w-full`} style={inputStyle}>
                    <option value="">(nenhuma)</option>
                    {entidades.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {(() => {
                    const e = entidades.find((x: any) => String(x.id) === String(edit.entity));
                    return e ? (
                      <div className="text-[11px] text-[#666] leading-5">
                        <div>Morada: {e.address || '—'}</div>
                        <div>Nr. contrib.: {e.tax_id || '—'}</div>
                        {e.is_blocked && <div className="text-[#a01818] font-bold flex items-center gap-1"><Glyph icon="⛔" size={13} /> Entidade bloqueada</div>}
                      </div>
                    ) : null;
                  })()}
                  <label className="flex items-center gap-2 text-[12px] pt-1 cursor-pointer">
                    <input type="checkbox" checked={!!edit.tax_included}
                      onChange={(e) => setEdit({ ...edit, tax_included: e.target.checked })} className="w-4 h-4" />
                    IVA incluído
                  </label>
                  <div className="flex items-center gap-2 text-[12px]">
                    <span>Desconto:</span>
                    <input type="number" value={edit.discount_percent ?? 0}
                      onChange={(e) => setEdit({ ...edit, discount_percent: e.target.value })}
                      className={`${inp} w-[70px]`} style={inputStyle} />%
                  </div>
                </div>
              </div>
            )}

            <div className="w-[220px] border border-[#c8c8c8] bg-white">
              <div className="px-2 py-1 bg-[#e4e4e4] text-[12px] font-bold border-b border-[#c8c8c8] text-right">Totais</div>
              <div className="p-2 text-[12px] space-y-1">
                {[['Subtotal', sub], ['Desconto Artigo', descArt], ['Desconto', descGlobal], ['Tax', iva]].map(([k, v]: any) => (
                  <div key={k} className="flex justify-between text-[#666]">
                    <span>{k}</span><span>{money(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-[#ddd] text-[16px] font-bold">
                  <span>Total</span><span>{money(tot)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Artigos */}
        <div className="flex-1 flex flex-col overflow-hidden mx-3 mb-3 border border-[#c8c8c8] bg-white">
          <div className="px-2 py-1 bg-[#e4e4e4] text-[12px] font-bold border-b border-[#c8c8c8]">Artigos</div>
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#eee] text-[12px]">
            <span>Filtro:</span>
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)}
              className={`${inp} w-[240px]`} style={inputStyle} />
            <button onClick={addLinha} disabled={edit.posted}
              className="ml-2 px-3 py-1 bg-[#3d6ea5] text-white disabled:bg-[#c0c0c0]">+ Adicionar linha</button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
                {['Código / Descrição', mode === 'INTERNAL' ? 'Armazém destino' : 'IVA',
                  mode === 'INVENTORY' ? 'Contagem' : 'Quantidade', 'Stock Qtd.', 'Valor',
                  ...(mode === 'PURCHASE' ? ['Desconto', 'Lote', 'Validade'] : []),
                  'Total', 'Notas', ''].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {linhas.map((l, i) => {
                  const bruto = dec(l.quantity) * dec(l.unit_cost);
                  const lt = bruto * (1 - dec(l.discount_percent) / 100);
                  return (
                    <tr key={i} className="border-b border-[#eee]">
                      <td className="px-2 py-1">
                        <select value={l.item ?? ''} onChange={(e) => setLinha(i, 'item', e.target.value)}
                          disabled={edit.posted} className={`${inp} w-[260px]`} style={inputStyle}>
                          <option value="">— artigo —</option>
                          {artigosFiltrados.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        {mode === 'INTERNAL' ? (
                          <select value={l.warehouse ?? ''} onChange={(e) => setLinha(i, 'warehouse', e.target.value)}
                            disabled={edit.posted} className={`${inp} w-[140px]`} style={inputStyle}>
                            <option value="">(do documento)</option>
                            {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        ) : (
                          <input type="number" value={l.tax_percentage ?? 0}
                            onChange={(e) => setLinha(i, 'tax_percentage', e.target.value)}
                            disabled={edit.posted} className={`${inp} w-[60px]`} style={inputStyle} />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" value={l.quantity ?? 0} onChange={(e) => setLinha(i, 'quantity', e.target.value)}
                          disabled={edit.posted} className={`${inp} w-[80px] text-right`} style={inputStyle} />
                      </td>
                      <td className="px-2 py-1 text-right text-[#666]">{stockDe(l.item)}</td>
                      <td className="px-2 py-1">
                        <input type="number" value={l.unit_cost ?? 0} onChange={(e) => setLinha(i, 'unit_cost', e.target.value)}
                          disabled={edit.posted} className={`${inp} w-[90px] text-right`} style={inputStyle} />
                      </td>
                      {mode === 'PURCHASE' && (
                        <>
                          <td className="px-2 py-1">
                            <input type="number" value={l.discount_percent ?? 0}
                              onChange={(e) => setLinha(i, 'discount_percent', e.target.value)}
                              disabled={edit.posted} className={`${inp} w-[60px] text-right`} style={inputStyle} />
                          </td>
                          <td className="px-2 py-1">
                            <input value={l.lot ?? ''} onChange={(e) => setLinha(i, 'lot', e.target.value)}
                              disabled={edit.posted} className={`${inp} w-[80px]`} style={inputStyle} />
                          </td>
                          <td className="px-2 py-1">
                            <input type="date" value={l.expiry ?? ''} onChange={(e) => setLinha(i, 'expiry', e.target.value)}
                              disabled={edit.posted} className={`${inp} w-[130px]`} style={inputStyle} />
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1 text-right font-bold">{money(lt)}</td>
                      <td className="px-2 py-1">
                        <input value={l.note ?? ''} onChange={(e) => setLinha(i, 'note', e.target.value)}
                          disabled={edit.posted} className={`${inp} w-[120px]`} style={inputStyle} />
                      </td>
                      <td className="px-2 py-1">
                        {!edit.posted && (
                          <button onClick={() => setEdit({ ...edit, lines: linhas.filter((_, k) => k !== i) })}
                            className="text-[#a01818] font-bold">×</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && (
                  <tr><td colSpan={11} className="text-center text-[#999] py-8">
                    Sem artigos. Clique em "Adicionar linha".
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {mode === 'INVENTORY' && (
            <div className="px-3 py-2 text-[11px] text-[#8a6100] bg-[#fff7e6] border-t border-[#e0c080]">
              A <b>Contagem</b> é o que existe MESMO na prateleira. Ao lançar, o sistema faz o
              acerto contra o que julgava ter — a diferença é o que desapareceu (ou apareceu).
            </div>
          )}
        </div>

        <Toolbar actions={[
          {
            label: 'Gravar', icon: '💾', disabled: edit.posted,
            onClick: () => gravar.mutate({
              ...edit,
              doc_date: edit.doc_date || hoje(),
              lines: linhas.filter((l) => l.item),
            }),
          },
          {
            label: 'Lançar no stock', icon: '▶', color: '#1f7a34', disabled: !edit.id || edit.posted,
            onClick: () => lancar.mutate(edit.id),
          },
          { label: 'Fechar', icon: '✖', color: '#6b6b6b', onClick: () => setEdit(null) },
        ]} right={
          edit.posted
            ? <span className="text-[11px] text-[#1f7a34]">Já lançado — para corrigir, anule e faça outro.</span>
            : <span className="text-[11px] text-[#666]">Gravar não mexe no stock. Só "Lançar" é que mexe.</span>
        } />
      </div>
    );
  }

  // ─────────────────────────────────── LISTA
  const titulo = mode === 'PURCHASE' ? 'Compras'
    : mode === 'INTERNAL' ? 'Documentos Internos' : 'Inventário';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      <div className="flex gap-6 p-3 bg-white border-b border-[#d0d0d0]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[110px]">Documento:</L>
            <select value={f.series ?? ''} onChange={(e) => setF({ ...f, series: e.target.value })}
              className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="">(Todos)</option>
              {doMode.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <L w="w-[110px]">Estado:</L>
            <select value={f.status ?? ''} onChange={(e) => setF({ ...f, status: e.target.value })}
              className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="">(Todos)</option>
              {estados.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[90px]">Nº Doc.:</L>
            <input value={f.number ?? ''} onChange={(e) => setF({ ...f, number: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
              className={`${inp} w-[200px]`} style={inputStyle} />
          </div>
          {mode === 'PURCHASE' ? (
            <div className="flex items-center gap-2">
              <L w="w-[90px]">Entidade:</L>
              <input value={f.entity ?? ''} onChange={(e) => setF({ ...f, entity: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
                className={`${inp} w-[200px]`} style={inputStyle} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <L w="w-[90px]">Origem:</L>
              <select value={f.warehouse_from ?? ''} onChange={(e) => setF({ ...f, warehouse_from: e.target.value })}
                className={`${inp} w-[200px]`} style={inputStyle}>
                <option value="">Todos</option>
                {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[70px]">De data:</L>
            <input type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value })}
              className={`${inp} w-[150px]`} style={inputStyle} />
          </div>
          <div className="flex items-center gap-2">
            <L w="w-[70px]">A data:</L>
            <input type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value })}
              className={`${inp} w-[150px]`} style={inputStyle} />
          </div>
        </div>

        <button onClick={pesquisar}
          className="w-[180px] flex flex-col items-center justify-center gap-1 bg-[#3c3c3c] text-white hover:bg-[#2b2b2b]">
          <Glyph icon="🔄" size={22} />
          <span className="text-[13px]">Pesquisar</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            {(mode === 'PURCHASE'
              ? ['Documento', 'Doc. Original', 'Data Documento', 'Data de criação', 'Total', 'Entidade', 'Estado', 'Notas']
              : ['Número', 'Data', 'Utilizador', 'Armazém origem', 'Armazém destino', 'Estado', 'Notas']
            ).map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {vista.map((r) => {
              const estado = r.voided ? ['Anulado', '#fdecea', '#a01818']
                : r.posted ? ['Lançado', '#e8f5e9', '#1f7a34']
                  : ['Por lançar', '#fff7e6', '#8a6100'];
              return (
                <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setEdit({ ...r })}
                  className={`border-b border-[#eee] cursor-pointer ${sel === r.id ? 'bg-[#dce9f7]' : 'hover:bg-[#f5f9ff]'}`}>
                  <td className="px-2 py-1 font-mono font-semibold">{r.number}</td>
                  {mode === 'PURCHASE' ? (
                    <>
                      <td className="px-2 py-1 text-[#666]">{r.original_number || '—'}</td>
                      <td className="px-2 py-1">{r.doc_date}</td>
                      <td className="px-2 py-1 text-[#666]">
                        {new Date(r.created_at).toLocaleDateString('pt-PT')}
                      </td>
                      <td className="px-2 py-1 text-right font-bold">{money(r.total)}</td>
                      <td className="px-2 py-1">{r.entity_name || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1">{r.doc_date}</td>
                      <td className="px-2 py-1 text-[#666]">{r.created_by || '—'}</td>
                      <td className="px-2 py-1">{r.warehouse_from_name || '—'}</td>
                      <td className="px-2 py-1">{r.warehouse_name || '—'}</td>
                    </>
                  )}
                  <td className="px-2 py-1">
                    <span className="px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: estado[1], color: estado[2] }}>{estado[0]}</span>
                    {r.status_name && <span className="ml-1 text-[11px] text-[#666]">{r.status_name}</span>}
                  </td>
                  <td className="px-2 py-1 text-[#666] max-w-[200px] truncate">{r.notes || ''}</td>
                </tr>
              );
            })}
            {vista.length === 0 && (
              <tr><td colSpan={8} className="text-center text-[#999] py-12">Não foram encontrados dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f4f4f4] border-t border-[#d8d8d8] text-[12px]">
        <span>Nº registos a visualizar:</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className={`${inp} w-[70px]`} style={inputStyle}>
          {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30">◀</button>
        <span>Página {page} de {paginas}</span>
        <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30">▶</button>
        <span className="ml-auto text-[#666]">
          {total === 0 ? 'Não foram encontrados dados.' : `${total} documento(s) — ${titulo}`}
        </span>
      </div>

      <Toolbar actions={[
        {
          label: 'Novo', icon: '➕',
          onClick: () => setEdit({
            doc_date: hoje(), lines: [], tax_included: false, discount_percent: 0,
            series: doMode[0]?.id, warehouse: armazens[0]?.id,
          }),
        },
        { label: 'Editar', icon: '✏', disabled: !sel, onClick: () => setEdit({ ...selRow }) },
        {
          label: 'Anular', icon: '🚫', disabled: !sel || selRow?.voided,
          onClick: () => {
            if (confirm(`Anular ${selRow.number}?${selRow.posted
              ? '\n\nJá foi lançado — os movimentos de stock serão REVERTIDOS.' : ''}`))
              anular.mutate(sel!);
          },
        },
        { label: 'Copiar', icon: '⧉', color: '#5d4037', disabled: !sel, onClick: () => copiar.mutate(sel!) },
        { label: 'Exportar para Excel', icon: '⬇', color: '#1f7a34', onClick: exportar },
      ]} />
    </div>
  );
}
