import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money, Glyph } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';
const L = ({ w = 'w-[110px]', children }: any) => (
  <span className={`text-[12px] text-[#333] ${w} flex-shrink-0`}>{children}</span>
);
const hoje = () => new Date().toISOString().slice(0, 10);

function useList(ep: string, key: string, params?: any) {
  return useQuery({
    queryKey: ['fnbinv', key, params],
    queryFn: async () => {
      const r = await apiClient.get(ep, { params });
      return (r.data?.results || r.data || []) as any[];
    },
  });
}

/**
 * INVENTÁRIO — a contagem física contra o stock teórico.
 *
 * O STOCK TEÓRICO é o que o sistema julga ter. A CONTAGEM FÍSICA é o que está mesmo na
 * prateleira. A DIFERENÇA é o que desapareceu — e é a única coisa que interessa neste
 * ecrã. Ao lançar, o sistema faz o acerto: o stock passa a ser o que se contou.
 */
export default function FnbInventory() {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const [aplicado, setAplicado] = useState<any>({});
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [filtro, setFiltro] = useState('');

  const { data: armazens = [] } = useList('pos/config/warehouses/', 'wh');
  const { data: estados = [] } = useList('pos/config/doc-status/', 'st');
  const { data: series = [] } = useList('pos/config/stock-docs/', 'series');
  const { data: familias = [] } = useList('inventory/pos/families/', 'fam');
  const { data: subfamilias = [] } = useList('inventory/pos/subfamilies/', 'sub',
    { family: (edit?.family) || undefined });

  const serieInv = series.filter((s: any) => s.kind === 'INVENTORY');

  const { data: rows = [] } = useQuery({
    queryKey: ['fnbinv', 'docs', aplicado],
    queryFn: async () => {
      const params: any = { kinds: 'INVENTORY' };
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await apiClient.get('pos/fnb/documents/', { params });
      return (r.data?.results || r.data || []) as any[];
    },
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['fnbinv'] });
  const gerar = useMutation({
    mutationFn: (body: any) => apiClient.post('pos/fnb/documents/sheet/', body),
    onSuccess: (r: any) => {
      setEdit((e: any) => ({ ...e, lines: r.data.lines }));
      notifyGuide({ title: 'Folha de contagem', message: `${r.data.count} artigo(s) para contar.` });
    },
    onError: notifyError,
  });
  const gravar = useMutation({
    mutationFn: (v: any) => v.id ? apiClient.patch(`pos/fnb/documents/${v.id}/`, v)
      : apiClient.post('pos/fnb/documents/', v),
    onSuccess: (r: any) => { setEdit(r.data); inval(); notifyGuide({ title: 'Inventário gravado', message: `${r.data.number} — por lançar.` }); },
    onError: notifyError,
  });
  const lancar = useMutation({
    mutationFn: (id: number) => apiClient.post(`pos/fnb/documents/${id}/post_stock/`, {}),
    onSuccess: (r: any) => { setEdit(null); inval(); notifyGuide({ title: 'Inventário lançado', message: r.data.detail }); },
    onError: notifyError,
  });
  const anular = useMutation({
    mutationFn: (id: number) => apiClient.post(`pos/fnb/documents/${id}/void/`, {}),
    onSuccess: (r: any) => { inval(); notifyGuide({ title: 'Anulado', message: r.data.detail }); },
    onError: notifyError,
  });

  const selRow = rows.find((r) => r.id === sel);

  // ─────────────────────────────── FOLHA DE CONTAGEM
  if (edit) {
    const linhas: any[] = edit.lines || [];
    const setLinha = (i: number, campo: string, v: any) =>
      setEdit({ ...edit, lines: linhas.map((l, k) => k === i ? { ...l, [campo]: v } : l) });

    const n = (v: any) => Number(v || 0);
    const vistas = filtro
      ? linhas.filter((l) => `${l.code} ${l.name}`.toLowerCase().includes(filtro.toLowerCase()))
      : linhas;

    const difQtd = linhas.reduce((s, l) => s + (n(l.quantity) - n(l.theoretical_qty)), 0);
    const difVal = linhas.reduce((s, l) =>
      s + (n(l.quantity) - n(l.theoretical_qty)) * n(l.theoretical_cost), 0);

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
        <div className="px-3 py-2 bg-[#3c3c3c] text-white text-[13px] font-bold">
          {edit.id ? `Inventário ${edit.number}` : 'Novo documento'}
          {edit.posted && <span className="ml-3 px-2 py-0.5 bg-[#1f7a34] text-[11px]">LANÇADO</span>}
        </div>

        <div className="flex gap-3 p-3">
          <fieldset className="bg-white px-3 pb-3 flex-1" style={{ border: '1.5px groove #c0c0c0' }}>
            <legend className="text-[12px] px-1 font-bold">Geral</legend>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <L>Armazém:</L>
                <select value={edit.warehouse ?? ''} onChange={(e) => setEdit({ ...edit, warehouse: e.target.value })}
                  disabled={edit.posted} className={`${inp} w-[170px]`} style={inputStyle}>
                  <option value="">—</option>
                  {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <L>Estado:</L>
                <select value={edit.status ?? ''} onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  className={`${inp} w-[170px]`} style={inputStyle}>
                  <option value="">Em contagem</option>
                  {estados.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <L>Data referência:</L>
                <input type="date" value={edit.doc_date ?? hoje()}
                  onChange={(e) => setEdit({ ...edit, doc_date: e.target.value })}
                  className={`${inp} w-[170px]`} style={inputStyle} />
              </div>
              <div className="flex items-center gap-2">
                <L>Data lançamento:</L>
                <input disabled value={edit.posted_at ? new Date(edit.posted_at).toLocaleString('pt-PT') : ''}
                  className={`${inp} w-[170px] bg-[#f0f0f0]`} style={inputStyle} placeholder="(por lançar)" />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <L>Responsável:</L>
                <input value={edit.responsible ?? ''} onChange={(e) => setEdit({ ...edit, responsible: e.target.value })}
                  disabled={edit.posted} className={`${inp} w-[380px]`} style={inputStyle}
                  placeholder="quem conta — é quem responde pela diferença" />
              </div>
            </div>
          </fieldset>

          <fieldset className="bg-white px-3 pb-3 flex-1" style={{ border: '1.5px groove #c0c0c0' }}>
            <legend className="text-[12px] px-1 font-bold">Filtros</legend>
            <div className="flex gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <L w="w-[80px]">Família:</L>
                  <select value={edit.family ?? ''} onChange={(e) => setEdit({ ...edit, family: e.target.value, subfamily: '' })}
                    className={`${inp} w-[150px]`} style={inputStyle}>
                    <option value="">Todos</option>
                    {familias.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <L w="w-[80px]">Sub Família:</L>
                  <select value={edit.subfamily ?? ''} onChange={(e) => setEdit({ ...edit, subfamily: e.target.value })}
                    className={`${inp} w-[150px]`} style={inputStyle}>
                    <option value="">Todos</option>
                    {subfamilias.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                {[
                  ['include_negative', 'Incluir artigos com existência a negativo', true],
                  ['include_zero', 'Incluir artigos com existência a zero em stock', true],
                  ['exclude_inactive', 'Excluir inativos', true],
                  ['start_zero', 'Iniciar com contagem física a zero', false],
                ].map(([k, label, def]: any) => (
                  <label key={k} className="flex items-center gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox"
                      checked={edit[k] ?? def}
                      onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })}
                      className="w-4 h-4" />
                    {label}
                  </label>
                ))}
              </div>

              <button
                disabled={!edit.warehouse || edit.posted || gerar.isPending}
                onClick={() => gerar.mutate({
                  warehouse: edit.warehouse,
                  family: edit.family || undefined,
                  subfamily: edit.subfamily || undefined,
                  include_negative: edit.include_negative ?? true,
                  include_zero: edit.include_zero ?? true,
                  exclude_inactive: edit.exclude_inactive ?? true,
                  start_zero: edit.start_zero ?? false,
                })}
                className="w-[140px] flex flex-col items-center justify-center gap-1 bg-[#3c3c3c] text-white hover:bg-[#2b2b2b] disabled:bg-[#b8b8b8]">
                <Glyph icon="🔄" size={20} />
                <span className="text-[12px]">{gerar.isPending ? 'A gerar…' : 'Atualizar'}</span>
              </button>
            </div>
          </fieldset>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden mx-3 mb-3 border border-[#c8c8c8] bg-white">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#eee] text-[12px]">
            <span>Filtro:</span>
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)}
              className={`${inp} w-[240px]`} style={inputStyle} />
            <span className="ml-auto">
              Diferença total: <b style={{ color: difQtd < 0 ? '#a01818' : '#1f7a34' }}>
                {difQtd.toFixed(3)} un · {money(difVal)} Kz
              </b>
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-[#f0f0f0]">
                  <th rowSpan={2} className="text-left font-normal px-2 py-1 border-b border-r border-[#d0d0d0]">Código</th>
                  <th rowSpan={2} className="text-left font-normal px-2 py-1 border-b border-r border-[#d0d0d0]">Descrição</th>
                  <th rowSpan={2} className="text-left font-normal px-2 py-1 border-b border-r border-[#d0d0d0]">Unidade</th>
                  <th colSpan={3} className="text-center font-bold px-2 py-1 border-b border-r border-[#d0d0d0] bg-[#e8f0f7]">Contagem física</th>
                  <th colSpan={3} className="text-center font-bold px-2 py-1 border-b border-r border-[#d0d0d0] bg-[#f0f0f0]">Stock Teórico</th>
                  <th colSpan={2} className="text-center font-bold px-2 py-1 border-b border-[#d0d0d0] bg-[#fff7e6]">Diferença</th>
                </tr>
                <tr className="bg-[#f4f4f4]">
                  {['Quantidade', 'Custo', 'Total Custo', 'Quantidade', 'Custo', 'Total Custo', 'Quantidade', 'Custo'].map((h, i) => (
                    <th key={i} className="text-right font-normal px-2 py-1 border-b border-r border-[#d0d0d0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vistas.map((l, i) => {
                  const idx = linhas.indexOf(l);
                  const cQ = n(l.quantity), cC = n(l.unit_cost);
                  const tQ = n(l.theoretical_qty), tC = n(l.theoretical_cost);
                  const dQ = cQ - tQ, dV = dQ * tC;
                  return (
                    <tr key={i} className={`border-b border-[#eee] ${dQ ? 'bg-[#fffdf5]' : ''}`}>
                      <td className="px-2 py-1 font-mono text-[#666]">{l.code}</td>
                      <td className="px-2 py-1">{l.name}</td>
                      <td className="px-2 py-1 text-[#666]">{l.unit || 'UN'}</td>
                      <td className="px-1 py-1">
                        <input type="number" value={l.quantity ?? 0} disabled={edit.posted}
                          onChange={(e) => setLinha(idx, 'quantity', e.target.value)}
                          className={`${inp} w-[80px] text-right`} style={inputStyle} />
                      </td>
                      <td className="px-2 py-1 text-right">{money(cC)}</td>
                      <td className="px-2 py-1 text-right">{money(cQ * cC)}</td>
                      <td className="px-2 py-1 text-right text-[#666]">{tQ.toFixed(3)}</td>
                      <td className="px-2 py-1 text-right text-[#666]">{money(tC)}</td>
                      <td className="px-2 py-1 text-right text-[#666]">{money(tQ * tC)}</td>
                      <td className="px-2 py-1 text-right font-bold"
                        style={{ color: dQ < 0 ? '#a01818' : dQ > 0 ? '#1f7a34' : '#999' }}>
                        {dQ.toFixed(3)}
                      </td>
                      <td className="px-2 py-1 text-right font-bold"
                        style={{ color: dV < 0 ? '#a01818' : dV > 0 ? '#1f7a34' : '#999' }}>
                        {money(dV)}
                      </td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && (
                  <tr><td colSpan={11} className="text-center text-[#999] py-10">
                    Escolha o armazém e clique em <b>Atualizar</b> para gerar a folha de contagem.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[11px] text-[#8a6100] bg-[#fff7e6] border-t border-[#e0c080]">
            Ao <b>lançar</b>, o stock passa a ser o que se contou. A diferença fica como movimento
            de ajuste no histórico, com o nome do responsável — quebras não desaparecem em silêncio.
          </div>
        </div>

        <Toolbar actions={[
          {
            label: 'Gravar', icon: '💾', disabled: edit.posted || !edit.warehouse || !linhas.length,
            onClick: () => gravar.mutate({
              ...edit,
              series: edit.series || serieInv[0]?.id,
              doc_date: edit.doc_date || hoje(),
              lines: linhas.filter((l) => l.item).map((l) => ({
                item: l.item, quantity: l.quantity || 0, unit_cost: l.unit_cost || 0,
                theoretical_qty: l.theoretical_qty || 0, theoretical_cost: l.theoretical_cost || 0,
              })),
            }),
          },
          {
            label: 'Lançar (acerto de stock)', icon: '📦', disabled: !edit.id || edit.posted,
            onClick: () => {
              if (confirm('Lançar o inventário? O stock passa a ser o que foi contado.'))
                lancar.mutate(edit.id);
            },
          },
          { label: 'Exportar para Excel', icon: '📊', onClick: () => {
            const head = ['Código', 'Descrição', 'Contagem', 'Teórico', 'Diferença'];
            const csv = [head.join(';'), ...linhas.map((l) =>
              [l.code, l.name, l.quantity, l.theoretical_qty,
               (n(l.quantity) - n(l.theoretical_qty)).toFixed(3)].join(';'))].join('\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
            a.download = 'inventario.csv'; a.click();
          } },
          { label: 'Fechar', icon: '✖', color: '#6b6b6b', onClick: () => setEdit(null) },
        ]} />
      </div>
    );
  }

  // ─────────────────────────────── LISTA
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      <div className="flex gap-6 p-3 bg-white border-b border-[#d0d0d0]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[80px]">Armazéns:</L>
            <select value={f.warehouse ?? ''} onChange={(e) => setF({ ...f, warehouse: e.target.value })}
              className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="">Todos</option>
              {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <L w="w-[80px]">Estado:</L>
            <select value={f.status ?? ''} onChange={(e) => setF({ ...f, status: e.target.value })}
              className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="">Todos</option>
              {estados.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
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
        <button onClick={() => setAplicado({ ...f })}
          className="ml-auto w-[180px] flex flex-col items-center justify-center gap-1 bg-[#3c3c3c] text-white hover:bg-[#2b2b2b]">
          <Glyph icon="🔄" size={22} />
          <span className="text-[13px]">Pesquisar</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            {['Número', 'Criado em', 'Armazém', 'Responsável', 'Data referência', 'Estado'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const estado = r.voided ? ['Anulado', '#fdecea', '#a01818']
                : r.posted ? ['Lançado', '#e8f5e9', '#1f7a34']
                  : ['Em contagem', '#fff7e6', '#8a6100'];
              return (
                <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setEdit({ ...r })}
                  className={`border-b border-[#eee] cursor-pointer ${sel === r.id ? 'bg-[#dce9f7]' : 'hover:bg-[#f5f9ff]'}`}>
                  <td className="px-2 py-1 font-mono font-semibold">{r.number}</td>
                  <td className="px-2 py-1">{new Date(r.created_at).toLocaleString('pt-PT')}</td>
                  <td className="px-2 py-1">{r.warehouse_name}</td>
                  <td className="px-2 py-1">{r.responsible || r.created_by || '—'}</td>
                  <td className="px-2 py-1">{r.doc_date}</td>
                  <td className="px-2 py-1">
                    <span className="px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: estado[1], color: estado[2] }}>{estado[0]}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#999] py-12">Não foram encontrados dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toolbar actions={[
        {
          label: 'Novo', icon: '➕',
          onClick: () => setEdit({
            doc_date: hoje(), lines: [], series: serieInv[0]?.id,
            include_negative: true, include_zero: true, exclude_inactive: true, start_zero: false,
          }),
        },
        {
          label: 'Inserir contagem física', icon: '✏', disabled: !sel || selRow?.posted,
          onClick: () => setEdit({ ...selRow }),
        },
        {
          label: 'Anular', icon: '🚫', disabled: !sel || selRow?.voided,
          onClick: () => {
            if (confirm(`Anular ${selRow.number}?${selRow.posted
              ? '\n\nJá foi lançado — o acerto de stock será REVERTIDO.' : ''}`))
              anular.mutate(sel!);
          },
        },
      ]} right={
        <span className="text-[11px] text-[#666]">
          Contagem física vs stock teórico. A diferença é o que desapareceu.
        </span>
      } />
    </div>
  );
}
