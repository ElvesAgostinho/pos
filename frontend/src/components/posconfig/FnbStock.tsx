import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';
const L = ({ w = 'w-[130px]', children }: any) => (
  <span className={`text-[12px] text-[#333] ${w} flex-shrink-0`}>{children}</span>
);

function useList(ep: string, key: string, params?: any) {
  return useQuery({
    queryKey: ['fnb', key, params],
    queryFn: async () => {
      const r = await apiClient.get(ep, { params });
      return (r.data?.results || r.data || []) as any[];
    },
  });
}

/**
 * EXISTÊNCIAS STOCK — o que há, onde está, e quanto vale.
 *
 * Vem do ledger de movimentos (a fonte única). "Recalcular o stock" existe porque um
 * saldo pode ficar torto (uma anulação mal feita, uma migração): o botão volta a somar
 * TODOS os movimentos desde o início e repõe a verdade — e diz o que corrigiu.
 */
export default function FnbStock() {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const [aplicado, setAplicado] = useState<any>({});
  const [agrupar, setAgrupar] = useState(false);
  const [soComQtd, setSoComQtd] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data: armazens = [] } = useList('pos/config/warehouses/', 'wh');
  const { data: familias = [] } = useList('inventory/pos/families/', 'fam');
  const { data: subfamilias = [] } = useList('inventory/pos/subfamilies/', 'sub', { family: f.family || undefined });

  const { data } = useQuery({
    queryKey: ['fnb', 'levels', aplicado],
    queryFn: async () => {
      const params: any = {};
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      return (await apiClient.get('pos/fnb/stock-levels/', { params })).data;
    },
  });

  const recalcular = useMutation({
    mutationFn: () => apiClient.post('pos/stock/recalc/', {}),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['fnb'] });
      const n = r.data.changed?.length || 0;
      notifyGuide({
        title: n ? `${n} saldo(s) corrigido(s)` : 'Stock certo',
        message: n
          ? r.data.changed.slice(0, 5).map((c: any) =>
            `${c.item}: ${c.before} → ${c.after}`).join(' · ')
          : 'Todos os saldos batem com o histórico de movimentos.',
      });
    },
    onError: notifyError,
  });

  let rows: any[] = data?.rows || [];
  if (soComQtd) rows = rows.filter((r) => Number(r.quantity) !== 0);

  const paginas = Math.max(1, Math.ceil(rows.length / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const pesquisar = () => { setAplicado({ ...f }); setPage(1); };

  const exportar = () => {
    const head = ['Código', 'Artigo', 'Armazém', 'Stock Qtd.', 'Custo médio', 'Valor'];
    const csv = [head.join(';'), ...rows.map((r) =>
      [r.code, r.name, r.warehouse, r.quantity, r.average_cost, r.value].join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'existencias.csv'; a.click();
  };

  // Agrupado por armazém (a caixa do ecrã)
  const grupos: Record<string, any[]> = {};
  if (agrupar) vista.forEach((r) => { (grupos[r.warehouse] ||= []).push(r); });

  const Linha = ({ r }: any) => (
    <tr className={`border-b border-[#eee] ${r.below_min ? 'bg-[#fff7e6]' : 'hover:bg-[#f5f9ff]'}`}>
      <td className="px-2 py-1 font-mono text-[#666]">{r.code}</td>
      <td className="px-2 py-1 font-semibold">
        {r.name}
        {Number(r.quantity) < 0 && (
          <span className="ml-2 text-[11px] text-[#a01818]" title="Stock negativo — é sempre um erro">⚠ negativo</span>
        )}
      </td>
      {!agrupar && <td className="px-2 py-1">{r.warehouse}</td>}
      <td className="px-2 py-1 text-right font-bold"
        style={{ color: Number(r.quantity) < 0 ? '#a01818' : undefined }}>{r.quantity}</td>
      <td className="px-2 py-1 text-right text-[#666]">{money(r.average_cost)}</td>
      <td className="px-2 py-1 text-right font-bold">{money(r.value)}</td>
      <td className="px-2 py-1 text-right text-[#666]">{r.min_stock}</td>
    </tr>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      <div className="flex gap-6 p-3 bg-white border-b border-[#d0d0d0]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L>Família:</L>
            <select value={f.family ?? ''} onChange={(e) => setF({ ...f, family: e.target.value, subfamily: '' })}
              className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="">Todos</option>
              {familias.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <L>Sub Família:</L>
            <select value={f.subfamily ?? ''} onChange={(e) => setF({ ...f, subfamily: e.target.value })}
              className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="">Todos</option>
              {subfamilias.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <L>Pesquisa livre:</L>
            <input value={f.q ?? ''} onChange={(e) => setF({ ...f, q: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
              className={`${inp} w-[200px]`} style={inputStyle} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[90px]">Armazéns:</L>
            <select value={f.warehouse ?? ''} onChange={(e) => setF({ ...f, warehouse: e.target.value })}
              className={`${inp} w-[220px]`} style={inputStyle}>
              <option value="">Todos</option>
              {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="w-4 h-4" />
            Agrupar por armazém
          </label>
          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <input type="checkbox" checked={soComQtd} onChange={(e) => { setSoComQtd(e.target.checked); setPage(1); }} className="w-4 h-4" />
            Só com quantidades
          </label>
        </div>

        <button onClick={pesquisar}
          className="ml-auto w-[180px] flex flex-col items-center justify-center gap-1 bg-[#3c3c3c] text-white hover:bg-[#2b2b2b]">
          <span className="text-[22px]">🔄</span>
          <span className="text-[13px]">Pesquisar</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            {['Código', 'Artigo', ...(agrupar ? [] : ['Armazém']), 'Stock Qtd.', 'Custo médio', 'Valor', 'Mínimo'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {agrupar
              ? Object.entries(grupos).map(([arm, lista]) => (
                <>
                  <tr key={arm} className="bg-[#e4e4e4]">
                    <td colSpan={6} className="px-2 py-1 font-bold text-[#333]">
                      {arm} — {money(lista.reduce((s, r) => s + Number(r.value), 0))} Kz
                    </td>
                  </tr>
                  {lista.map((r) => <Linha key={r.id} r={r} />)}
                </>
              ))
              : vista.map((r) => <Linha key={r.id} r={r} />)}
            {vista.length === 0 && (
              <tr><td colSpan={7} className="text-center text-[#999] py-12">Não foram encontrados dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f4f4f4] border-t border-[#d8d8d8] text-[12px]">
        <span>Nº registos a visualizar:</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className={`${inp} w-[70px]`} style={inputStyle}>
          {[25, 50, 100, 200].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30">◀</button>
        <span>Página {page} de {paginas}</span>
        <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30">▶</button>
        <span className="ml-auto">
          {rows.length} artigo(s) · valor em armazém:{' '}
          <b className="text-[14px]">{money(data?.total_value || 0)} Kz</b>
        </span>
      </div>

      <Toolbar actions={[
        {
          label: recalcular.isPending ? 'A recalcular…' : 'Recalcular o stock', icon: '⟳', color: '#1a73c8',
          onClick: () => recalcular.mutate(),
        },
        { label: 'Exportar para Excel', icon: '⬇', color: '#1f7a34', onClick: exportar },
      ]} right={
        <span className="text-[11px] text-[#666]">
          O valor é a quantidade ao custo médio — é o dinheiro parado dentro do armazém.
        </span>
      } />
    </div>
  );
}
