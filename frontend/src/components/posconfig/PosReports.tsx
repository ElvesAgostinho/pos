import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money } from './kit';
import ReportGrid from './ReportGrid';
import ReportFilters, { type Adv } from './ReportFilters';

const hoje = () => new Date().toISOString().slice(0, 10);
const haUmMes = () => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

/**
 * RELATÓRIOS — por pastas, como o sistema de referência.
 *
 * Start Page (pastas) → pasta (relatórios) → parâmetros → relatório.
 * Um sistema com 40 relatórios numa lista é um sistema onde ninguém encontra nada.
 * As pastas são as do NEGÓCIO (Facturação, Receitas, Caixa, F&B, Eventos), não as da
 * base de dados. Tudo sai do POS — nenhum relatório vai buscar dados a outro módulo.
 */
export default function PosReports() {
  const [pasta, setPasta] = useState<any | null>(null);
  const [rep, setRep] = useState<any | null>(null);
  const [params, setParams] = useState<any>({});
  const [busca, setBusca] = useState('');
  // O que está NO ECRÃ depois dos filtros — é isto que se imprime e se exporta.
  const [vista, setVista] = useState<{ rows: any[]; cols: any[] }>({ rows: [], cols: [] });
  // O filtro avançado — decidido ANTES de abrir o relatório, e corrido no servidor.
  const [adv, setAdv] = useState<Adv>({});
  const [preset, setPreset] = useState('');

  const { data: cat } = useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: async () => (await apiClient.get('pos/reports/catalog/')).data,
  });
  const { data: armazens = [] } = useQuery({
    queryKey: ['reports', 'wh'],
    queryFn: async () => (await apiClient.get('pos/config/warehouses/')).data,
  });

  const correr = useMutation({
    mutationFn: () => apiClient.post('pos/reports/run/', {
      code: rep.code,
      params: {
        ...params,
        ...(preset ? { preset } : {}),
        ...(adv.compare ? { compare: adv.compare } : {}),
        advanced: {
          ...adv,
          weekdays: adv.weekdays?.length ? adv.weekdays : undefined,
        },
      },
    }),
    onError: notifyError,
  });

  const folders: any[] = cat?.folders || [];
  const encontrados = busca
    ? folders.flatMap((f) => f.reports
      .filter((r: any) => r.name.toLowerCase().includes(busca.toLowerCase()))
      .map((r: any) => ({ ...r, folder: f })))
    : [];

  const abrirRelatorio = (r: any, f: any) => {
    setPasta(f);
    setRep(r);
    const p: any = {};
    r.params.forEach((x: any) => {
      if (x.type === 'date') p[x.key] = x.key === 'from' ? haUmMes() : hoje();
      else if (x.default !== undefined) p[x.key] = x.default;
    });
    setParams(p);
    setAdv({});
    setPreset('');
    correr.reset();
  };

  const voltar = () => {
    if (correr.data) correr.reset();
    else if (rep) setRep(null);
    else setPasta(null);
  };

  // ───────────────────────────── RELATÓRIO (resultado)
  const d: any = correr.data?.data;
  if (rep && d) {
    const fmt = (c: any, v: any) => c[2] === 'money' ? money(v) : (v ?? '');

    const imprimir = () => {
      const w = window.open('', '_blank');
      if (!w) return;
      const cols = vista.cols.length ? vista.cols : d.columns;
      const rows = vista.rows;
      w.document.write(`
        <html><head><title>${d.title}</title><style>
          body{font-family:'Segoe UI',sans-serif;font-size:12px;padding:24px}
          h1{font-size:18px;margin:0 0 4px} .meta{color:#666;font-size:11px;margin-bottom:14px}
          table{width:100%;border-collapse:collapse} th{background:#eee;text-align:left;padding:5px;border:1px solid #ccc}
          td{padding:4px 5px;border:1px solid #ddd} tfoot td{font-weight:bold;background:#f5f5f5}
          .r{text-align:right}
        </style></head><body>
        <h1>${d.title}</h1>
        <div class="meta">${d.company || ''} · NIF ${d.tax_id || ''}<br/>
          ${d.folder} · ${d.params?.from ? `de ${d.params.from} a ${d.params.to}` : ''}<br/>
          Impresso por ${d.user || ''} em ${new Date(d.generated_at).toLocaleString('pt-PT')}</div>
        <table><thead><tr>${cols.map((c: any) => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r: any) => `<tr>${cols.map((c: any) =>
          `<td class="${c[2] === 'money' ? 'r' : ''}">${fmt(c, r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody>
        ${(() => {
          // O total impresso é o das linhas IMPRESSAS. Imprimir 20 linhas filtradas com
          // o total de 2000 é a maneira mais fácil de mandar um número errado à direção.
          const somas: Record<string, number> = {};
          cols.forEach((c: any) => {
            if (c[2] === 'money') somas[c[0]] = rows.reduce(
              (s: number, r: any) => s + (Number(String(r[c[0]] ?? '0').replace(',', '.')) || 0), 0);
          });
          if (!Object.keys(somas).length) return '';
          return `<tfoot><tr>${cols.map((c: any, i: number) =>
            `<td class="${c[2] === 'money' ? 'r' : ''}">${i === 0 ? 'TOTAL'
              : (somas[c[0]] !== undefined ? money(somas[c[0]]) : '')}</td>`).join('')}</tr></tfoot>`;
        })()}
        </table></body></html>`);
      w.document.close();
      w.print();
    };

    const exportar = () => {
      const cs = vista.cols.length ? vista.cols : d.columns;
      const csv = [cs.map((c: any) => c[1]).join(';'),
      ...vista.rows.map((r: any) => cs.map((c: any) => String(r[c[0]] ?? '')).join(';'))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `${rep.code}.csv`; a.click();
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-4 py-2 border-b border-[#e0e0e0] text-[13px]">
          <button onClick={() => { correr.reset(); setRep(null); setPasta(null); }}
            className="text-[#1a73c8] hover:underline">Start Page</button>
          <span className="mx-1 text-[#999]">&gt;</span>
          <button onClick={() => { correr.reset(); setRep(null); }}
            className="text-[#1a73c8] hover:underline">{pasta.code}</button>
          <span className="mx-1 text-[#999]">&gt;</span>
          <span className="font-semibold">{rep.name}</span>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-[1400px]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-[20px] font-bold text-[#222]">
                  {d.title}
                  {d.grouped_by && (
                    <span className="ml-2 text-[13px] font-normal text-[#1a4f8a]">
                      · agrupado por {d.grouped_by}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[#555] mt-1">
                  <b>{d.company}</b> · NIF {d.tax_id}
                </div>
                {d.params?.from && (
                  <div className="text-[12px] text-[#555]">
                    De data: {d.params.from} — A data: {d.params.to}
                  </div>
                )}
              </div>
              <div className="text-[11px] text-[#888] italic text-right">
                Data de impressão:<br />
                {new Date(d.generated_at).toLocaleString('pt-PT')}<br />
                {d.user}
              </div>
            </div>

            {d.comparison && (
              <div className="mb-4 border border-[#c8b8b0] bg-white">
                <div className="px-3 py-1.5 bg-[#efe7e3] border-b border-[#c8b8b0] text-[12px] font-bold text-[#5d4037]">
                  Comparação com {d.comparison.mode === 'year' ? 'o mesmo período do ano passado'
                    : 'o período anterior'} ({d.comparison.from} a {d.comparison.to})
                </div>
                <div className="flex flex-wrap">
                  {d.comparison.lines.map((l: any) => (
                    <div key={l.key} className="px-4 py-3 border-r border-[#eee] min-w-[190px]">
                      <div className="text-[11px] text-[#666] uppercase tracking-wide">{l.label}</div>
                      <div className="text-[18px] font-bold text-[#222]">{money(l.now)}</div>
                      <div className="text-[12px] flex items-center gap-1">
                        <span className="font-bold" style={{
                          color: l.up ? '#1f7a34' : l.down ? '#a01818' : '#888',
                        }}>
                          {l.up ? '▲' : l.down ? '▼' : '='} {l.pct}
                        </span>
                        <span className="text-[#888]">antes {money(l.before)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ReportGrid d={d} onView={(rows, cols) => setVista({ rows, cols })} />

            <div className="text-[11px] text-[#999] mt-3">{d.folder}</div>
          </div>
        </div>

        <Toolbar actions={[
          { label: 'Voltar aos parâmetros', icon: '◀', color: '#6b6b6b', onClick: voltar },
          { label: 'Imprimir', icon: '🖨', color: '#2b2b2b', onClick: imprimir },
          { label: 'Exportar para Excel', icon: '⬇', color: '#1f7a34', onClick: exportar },
        ]} />
      </div>
    );
  }

  // ───────────────────────────── PARÂMETROS
  if (rep) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-4 py-2 border-b border-[#e0e0e0] text-[13px]">
          <button onClick={() => { setRep(null); setPasta(null); }}
            className="text-[#1a73c8] hover:underline">Start Page</button>
          <span className="mx-1 text-[#999]">&gt;</span>
          <button onClick={() => setRep(null)} className="text-[#1a73c8] hover:underline">{pasta.code}</button>
          <span className="mx-1 text-[#999]">&gt;</span>
          <span className="font-semibold">{rep.name}</span>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Os parâmetros do relatório vivem DENTRO do filtro — eram duas caixas a dizer
              a mesma coisa (uma com as datas, outra com tudo o resto). Fica uma só, e
              um botão. O filtro decide-se ANTES de abrir o relatório, não depois. */}
          <div className="max-w-[980px]">
            <ReportFilters adv={adv} setAdv={setAdv} preset={preset} setPreset={setPreset}
              presets={cat?.filters?.presets || []}
              groupOpts={[
                ...(cat?.filters?.group_by || []),
                ...(rep.columns || []),
              ]}
              compares={cat?.filters?.compare || []}
              params={rep.params} values={params} setValues={setParams} armazens={armazens as any[]} />

            <button onClick={() => correr.mutate()} disabled={correr.isPending}
              className="mt-4 px-8 py-2.5 bg-[#3c3c3c] text-white hover:bg-[#2b2b2b] text-[14px] font-semibold disabled:bg-[#b8b8b8]">
              {correr.isPending ? 'A gerar…' : 'Exibir Relatório'}
            </button>
          </div>
        </div>

        <Toolbar actions={[{ label: 'Voltar', icon: '◀', color: '#6b6b6b', onClick: voltar }]} />
      </div>
    );
  }

  // ───────────────────────────── PASTAS
  const lista = pasta ? pasta.reports : [];
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center px-4 py-2 border-b border-[#e0e0e0]">
        <div className="text-[13px]">
          <button onClick={() => setPasta(null)} className="text-[#1a73c8] hover:underline">Start Page</button>
          {pasta && (<>
            <span className="mx-1 text-[#999]">&gt;</span>
            <span className="font-semibold">{pasta.code}</span>
          </>)}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Search"
          className="ml-auto border border-[#c0c0c0] px-3 py-1 text-[13px] w-[320px]" style={inputStyle} />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {busca ? (
          <div className="space-y-1">
            <div className="text-[12px] text-[#666] mb-3">{encontrados.length} relatório(s)</div>
            {encontrados.map((r: any) => (
              <button key={r.code} onClick={() => { setBusca(''); abrirRelatorio(r, r.folder); }}
                className="flex items-start gap-3 w-full text-left p-2 hover:bg-[#f0f6ff]">
                <span className="w-5 h-6 flex-shrink-0 bg-white border border-[#9aa5b1]" />
                <span>
                  <span className="text-[13px] text-[#222]">{r.name}</span>
                  <span className="block text-[11px] text-[#888]">{r.folder.code} {r.folder.name}</span>
                </span>
              </button>
            ))}
          </div>
        ) : pasta ? (
          <div className="grid grid-cols-4 gap-6">
            {lista.map((r: any) => (
              <button key={r.code} onClick={() => abrirRelatorio(r, pasta)}
                className="flex items-start gap-3 text-left hover:bg-[#f0f6ff] p-2">
                <span className="w-7 h-8 flex-shrink-0 bg-white border border-[#9aa5b1] relative">
                  <span className="absolute inset-x-1 top-1.5 h-px bg-[#c8d0d8]" />
                  <span className="absolute inset-x-1 top-3 h-px bg-[#c8d0d8]" />
                  <span className="absolute inset-x-1 top-[18px] h-px bg-[#c8d0d8]" />
                </span>
                <span className="text-[13px] text-[#222] leading-5">{r.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6">
            {folders.map((f: any) => (
              <button key={f.code} onClick={() => setPasta(f)}
                className="flex items-start gap-3 text-left hover:bg-[#f0f6ff] p-2">
                {/* pasta desenhada, como nos ERP clássicos — não um emoji */}
                <span className="w-9 h-7 flex-shrink-0 relative">
                  <span className="absolute inset-x-0 bottom-0 h-6 bg-[#f0c14b] border border-[#b8901f]" />
                  <span className="absolute left-0 top-0 w-4 h-2 bg-[#f0c14b] border border-[#b8901f] border-b-0" />
                </span>
                <span>
                  <span className="text-[14px] text-[#222]">{f.code} {f.name}</span>
                  <span className="block text-[11px] text-[#888]">{f.count} relatório(s)</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Toolbar actions={pasta ? [{ label: 'Voltar', icon: '◀', color: '#6b6b6b', onClick: voltar }] : []}
        right={<span className="text-[11px] text-[#666]">
          Tudo o que o POS sabe, em pastas. Clique numa pasta para ver os relatórios.
        </span>} />
    </div>
  );
}
