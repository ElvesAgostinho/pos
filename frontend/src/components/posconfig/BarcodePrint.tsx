import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Toolbar, inputStyle, money } from './kit';

const MODELS = ['Barcode_Code39', 'Barcode_Code128', 'Barcode_EAN13', 'Etiqueta_Prateleira'];

/**
 * IMPRESSÃO DE CÓDIGOS DE BARRAS — escolhe-se o que etiquetar e imprime-se.
 * Filtra por sub-família e nível de preço (a etiqueta leva o preço desse nível).
 */
export default function BarcodePrint() {
  const [f, setF] = useState<any>({ subfamily: '', level: 1, all: false, q: '' });
  const [applied, setApplied] = useState<any>(null);
  const [sel, setSel] = useState<Record<number, number>>({});   // id -> quantidade
  const [qty, setQty] = useState(1);
  const [model, setModel] = useState(MODELS[0]);

  const { data: subs = [] } = useQuery({ queryKey: ['posc', 'subs'], queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/')).data });
  const { data: rows = [] } = useQuery({
    queryKey: ['posc', 'bc', applied],
    enabled: !!applied,
    queryFn: async () => {
      const params: any = {};
      if (applied.subfamily) params.subfamily = applied.subfamily;
      if (applied.q) params.q = applied.q;
      const r = await apiClient.get('inventory/pos/articles/', { params });
      return r.data?.results || r.data || [];
    },
  });

  const priceOf = (r: any) => {
    const p = (r.prices || []).find((x: any) => x.level === Number(f.level));
    return p ? p.price : (r.sale_price || 0);
  };
  const toggle = (id: number) => setSel((s) => {
    const n = { ...s };
    if (n[id]) delete n[id]; else n[id] = qty;
    return n;
  });
  const selectAll = () => {
    const all: Record<number, number> = {};
    rows.forEach((r: any) => { all[r.id] = qty; });
    setSel(Object.keys(sel).length === rows.length ? {} : all);
  };

  const print = () => {
    const chosen = rows.filter((r: any) => sel[r.id]);
    if (!chosen.length) return;
    const html = `<html><head><title>Etiquetas</title><style>
      body{font-family:'Segoe UI',sans-serif;margin:8px}
      .lbl{display:inline-block;width:180px;height:90px;border:1px solid #ccc;margin:4px;padding:6px;text-align:center;vertical-align:top}
      .n{font-size:11px;font-weight:bold;height:26px;overflow:hidden}
      .p{font-size:15px;font-weight:bold;margin-top:2px}
      .bc{font-family:'Libre Barcode 39',monospace;font-size:26px;letter-spacing:1px}
      .c{font-size:9px;color:#555}
    </style></head><body>
    ${chosen.flatMap((r: any) => Array.from({ length: sel[r.id] || 1 }).map(() => `
      <div class="lbl">
        <div class="n">${r.name}</div>
        <div class="bc">*${r.code}*</div>
        <div class="c">${r.code} · ${model}</div>
        <div class="p">${money(priceOf(r))} Kz</div>
      </div>`)).join('')}
    </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const exportCsv = () => {
    const chosen = rows.filter((r: any) => sel[r.id]);
    const csv = ['Código de Barras;Código;Descrição;Preço;Unidade Venda;Quantidade',
      ...chosen.map((r: any) => [r.code, r.code, r.name, priceOf(r), r.units_label?.split('/').pop()?.trim(), sel[r.id]].join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'etiquetas.csv'; a.click();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Filtros */}
      <div className="flex items-start gap-6 px-4 py-3 border-b border-[#d0d0d0] text-[13px]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
          <label className="flex items-center gap-2">
            <span className="w-[90px] text-[#333]">Sub Família:</span>
            <select value={f.subfamily} onChange={(e) => setF({ ...f, subfamily: e.target.value })}
              className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white flex-1" style={inputStyle}>
              <option value="">(Todos)</option>
              {subs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-[90px] text-[#333]">Nível de Preço:</span>
            <input type="number" min={1} max={6} value={f.level} onChange={(e) => setF({ ...f, level: Number(e.target.value) })}
              className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white w-[80px]" style={inputStyle} />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-[90px] text-[#333]">Pesquisar:</span>
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
              className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white flex-1" style={inputStyle} />
          </label>
        </div>
        <button onClick={() => { setApplied({ ...f }); setSel({}); }}
          className="w-[180px] h-[62px] flex flex-col items-center justify-center gap-1 text-white font-bold" style={{ background: '#2b2b2b' }}>
          <span className="text-[20px]">⟳</span> Pesquisar
        </button>
      </div>

      {/* Barra de seleção */}
      <div className="flex items-center gap-5 px-4 py-2 bg-[#f4f4f4] border-b border-[#d0d0d0] text-[13px]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={rows.length > 0 && Object.keys(sel).length === rows.length} onChange={selectAll} className="w-4 h-4" />
          Selecionar Tudo
        </label>
        <label className="flex items-center gap-2">
          Quantidade:
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)}
            className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[80px] bg-white" style={inputStyle} />
        </label>
        <label className="flex items-center gap-2">
          Modelo de Impressão:
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[220px] bg-white" style={inputStyle}>
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <span className="ml-auto text-[#555]">{Object.keys(sel).length} artigo(s) selecionado(s)</span>
      </div>

      {/* Grelha */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0">
            <tr className="bg-[#efefef] text-[#333]">
              <th className="w-[40px] border border-[#d5d5d5]" />
              {['Código de Barras', 'Código', 'Descrição', 'Preço', 'Unidade Venda', 'Quantidade'].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#eee] hover:bg-[#f5f9ff]">
                <td className="text-center border border-[#eee]">
                  <input type="checkbox" checked={!!sel[r.id]} onChange={() => toggle(r.id)} className="w-4 h-4" />
                </td>
                <td className="px-2 py-1 border border-[#eee] font-mono">{r.code}</td>
                <td className="px-2 py-1 border border-[#eee]">{r.code}</td>
                <td className="px-2 py-1 border border-[#eee]">{r.name}</td>
                <td className="px-2 py-1 border border-[#eee] text-right">{money(priceOf(r))}</td>
                <td className="px-2 py-1 border border-[#eee]">{r.units_label?.split('/').pop()?.trim()}</td>
                <td className="px-1 py-0.5 border border-[#eee] w-[90px]">
                  <input type="number" min={1} value={sel[r.id] || ''} disabled={!sel[r.id]}
                    onChange={(e) => setSel((s) => ({ ...s, [r.id]: Number(e.target.value) || 1 }))}
                    className="w-full border border-[#dcdcdc] px-1 py-0.5 text-[12px] text-right disabled:bg-[#f4f4f4]" />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-[#999] py-10">
                {applied ? 'Não foram encontrados artigos.' : 'Escolha os filtros e carregue em Pesquisar.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toolbar actions={[
        { icon: '🖶', label: 'Imprimir', color: '#333', disabled: !Object.keys(sel).length, onClick: print },
        { icon: '⤓', label: 'Exportar', color: '#217346', disabled: !Object.keys(sel).length, onClick: exportCsv },
      ]} />
    </div>
  );
}
