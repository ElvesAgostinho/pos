import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import { Toolbar, inputStyle, money } from './kit';
import ReportGrid from './ReportGrid';

const hoje = () => new Date().toISOString().slice(0, 10);
const haUmMes = () => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const PAGE_SIZE = 40;

/**
 * RELATÓRIOS — por pastas, como o sistema de referência.
 *
 * Start Page (pastas) → pasta (relatórios) → parâmetros → relatório.
 * Um sistema com 40 relatórios numa lista é um sistema onde ninguém encontra nada.
 * As pastas são as do NEGÓCIO (Facturação, Receitas, Caixa, F&B, Eventos), não as da
 * base de dados. Tudo sai do POS — nenhum relatório vai buscar dados a outro módulo.
 *
 * O ecrã de parâmetros é UM formulário só, como no sistema de referência: os campos
 * do próprio relatório (De Data, tipo de documento, armazém…) mais UM campo que
 * existe em TODOS — "Incluir detalhes?" — e que é obrigatório escolher antes de
 * exibir. Sim mostra cada linha; Não mostra só o total (pos/reports.py:apply_detail).
 */
function Campo({ x, params, setParams, armazens }: {
  x: any; params: any; setParams: (v: any) => void; armazens: any[];
}) {
  const val = params[x.key] ?? '';
  const cls = 'w-[240px] border border-[#8a95a3] px-2 py-[5px] text-[13px] bg-white';
  if (x.type === 'bool_sn') {
    return (
      <select value={val} onChange={(e) => setParams({ ...params, [x.key]: e.target.value })}
        className={cls} style={inputStyle}>
        <option value="">&lt;Selecione um Valor&gt;</option>
        <option value="Sim">Sim</option>
        <option value="Não">Não</option>
      </select>
    );
  }
  if (x.type === 'warehouse') {
    return (
      <select value={val} onChange={(e) => setParams({ ...params, [x.key]: e.target.value })}
        className={cls} style={inputStyle}>
        <option value="">Todos</option>
        {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    );
  }
  return (
    <input type={x.type === 'number' ? 'number' : x.type === 'date' ? 'date' : 'text'}
      value={val} onChange={(e) => setParams({ ...params, [x.key]: e.target.value })}
      className={cls} style={inputStyle} />
  );
}

export default function PosReports() {
  const [pasta, setPasta] = useState<any | null>(null);
  const [rep, setRep] = useState<any | null>(null);
  const [params, setParams] = useState<any>({});
  const [busca, setBusca] = useState('');
  // O que passou no filtro (TODAS as linhas, não só a página à vista) — é isto que
  // se imprime e se exporta.
  const [vista, setVista] = useState<{ rows: any[]; cols: any[] }>({ rows: [], cols: [] });
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [procurar, setProcurar] = useState('');
  const [achadoIdx, setAchadoIdx] = useState(-1);

  const { data: cat } = useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: async () => (await apiClient.get('pos/reports/catalog/')).data,
  });
  const { data: armazens = [] } = useQuery({
    queryKey: ['reports', 'wh'],
    queryFn: async () => (await apiClient.get('pos/config/warehouses/')).data,
  });

  const correr = useMutation({
    mutationFn: () => apiClient.post('pos/reports/run/', { code: rep.code, params }),
    onError: notifyError,
    onSuccess: () => { setPagina(1); setProcurar(''); setAchadoIdx(-1); },
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
      // "Incluir detalhes?" fica por escolher de propósito — é obrigatório e o
      // botão só liga depois de o operador decidir.
    });
    setParams(p);
    correr.reset();
  };

  const voltar = () => {
    if (correr.data) correr.reset();
    else if (rep) setRep(null);
    else setPasta(null);
  };

  const podeExibir = rep ? rep.params.every((x: any) => !x.required || (params[x.key] ?? '') !== '') : false;

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
          ${d.folder} · ${d.params?.from ? `de ${d.params.from} a ${d.params.to}` : ''} ·
          Incluir detalhes? ${d.params?.detailed || 'Não'}<br/>
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

    // FIND — procura em todas as colunas da linha; encontrando, salta para a página
    // dessa linha. "Next" repete a partir de onde ficou, como qualquer "localizar".
    const procurarProxima = () => {
      const q = procurar.trim().toLowerCase();
      if (!q || !vista.rows.length) return;
      const cols = vista.cols.length ? vista.cols : d.columns;
      let i = achadoIdx;
      for (let passo = 0; passo < vista.rows.length; passo++) {
        i = (i + 1) % vista.rows.length;
        const r = vista.rows[i];
        if (cols.some((c: any) => String(r[c[0]] ?? '').toLowerCase().includes(q))) {
          setAchadoIdx(i);
          setPagina(Math.floor(i / PAGE_SIZE) + 1);
          return;
        }
      }
      aviso(`"${procurar}" não encontrado.`);
    };

    // Os parâmetros que NÃO são De Data/A Data/Incluir detalhes ecoam-se aqui — cada
    // tipo de relatório tem os seus (tipo de documento, armazém, quantos…), e é assim
    // que a pessoa que imprime sabe exatamente com que filtro o número saiu.
    const outrosParams = rep.params.filter((x: any) => !['from', 'to', 'detailed'].includes(x.key)
      && (d.params?.[x.key] ?? '') !== '');

    const geradoEm = new Date(d.generated_at);
    const idTecnico = `/POS/${pasta.code}/${rep.code} — ${rep.name} | `
      + `${geradoEm.getFullYear()}${String(geradoEm.getMonth() + 1).padStart(2, '0')}${String(geradoEm.getDate()).padStart(2, '0')} | pt-PT | System Mwana Lodge`;

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-4 py-2 border-b border-[#e0e0e0] text-[13px] flex-shrink-0">
          <button onClick={() => { correr.reset(); setRep(null); setPasta(null); }}
            className="text-[#1a73c8] hover:underline">Start Page</button>
          <span className="mx-1 text-[#999]">&gt;</span>
          <button onClick={() => { correr.reset(); setRep(null); }}
            className="text-[#1a73c8] hover:underline">{pasta.code}</button>
          <span className="mx-1 text-[#999]">&gt;</span>
          <span className="font-semibold">{rep.name}</span>
        </div>

        {/* ── barra do visualizador — como o sistema de referência ── */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#d0d0d0] bg-[#f3f3f3] flex-shrink-0 text-[13px]">
          <button title="Primeira página" disabled={pagina <= 1} onClick={() => setPagina(1)}
            className="px-2 py-1 border border-[#c0c0c0] bg-white disabled:opacity-40 disabled:cursor-default hover:enabled:bg-[#e8e8e8]">|◀</button>
          <button title="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="px-2 py-1 border border-[#c0c0c0] bg-white disabled:opacity-40 disabled:cursor-default hover:enabled:bg-[#e8e8e8]">◀</button>
          <input value={pagina} onChange={(e) => setPagina(Math.min(totalPaginas, Math.max(1, Number(e.target.value) || 1)))}
            className="w-[42px] text-center border border-[#c0c0c0] py-1" style={inputStyle} />
          <span className="text-[#666] px-1">of {totalPaginas}</span>
          <button title="Página seguinte" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            className="px-2 py-1 border border-[#c0c0c0] bg-white disabled:opacity-40 disabled:cursor-default hover:enabled:bg-[#e8e8e8]">▶</button>
          <button title="Última página" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)}
            className="px-2 py-1 border border-[#c0c0c0] bg-white disabled:opacity-40 disabled:cursor-default hover:enabled:bg-[#e8e8e8]">▶|</button>

          <span className="w-px h-5 bg-[#c8c8c8] mx-2" />
          <button title="Atualizar" onClick={() => correr.mutate()}
            className="px-2 py-1 border border-[#c0c0c0] bg-white hover:bg-[#e8e8e8]">↻</button>
          <button title="Voltar aos parâmetros" onClick={voltar}
            className="px-2 py-1 border border-[#c0c0c0] bg-white hover:bg-[#e8e8e8]">←</button>

          <span className="w-px h-5 bg-[#c8c8c8] mx-2" />
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
            className="border border-[#c0c0c0] px-1 py-1 bg-white" style={inputStyle}>
            {[50, 75, 100, 125, 150, 200].map((z) => <option key={z} value={z}>{z}%</option>)}
          </select>

          <span className="w-px h-5 bg-[#c8c8c8] mx-2" />
          <button title="Guardar (CSV)" onClick={exportar}
            className="px-2 py-1 border border-[#c0c0c0] bg-white hover:bg-[#e8e8e8]">💾</button>
          <button title="Imprimir" onClick={imprimir}
            className="px-2 py-1 border border-[#c0c0c0] bg-white hover:bg-[#e8e8e8]">🖨</button>

          <span className="w-px h-5 bg-[#c8c8c8] mx-2" />
          <input value={procurar} onChange={(e) => setProcurar(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && procurarProxima()}
            placeholder="Find" className="w-[140px] border border-[#c0c0c0] px-2 py-1" style={inputStyle} />
          <button onClick={procurarProxima} className="text-[#1a73c8] hover:underline px-1">Next</button>
        </div>

        <div className="flex-1 overflow-auto p-6" style={{ zoom: zoom / 100 }}>
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
                <div className="text-[12px] text-[#555] mt-1"><b>{d.company}</b> · NIF {d.tax_id}</div>
                <div className="text-[12px] text-[#555]">{d.folder}</div>
                {d.params?.from && (
                  <div className="text-[12px] text-[#555]">
                    De data: {d.params.from} — A data: {d.params.to}
                  </div>
                )}
                <div className="text-[12px] text-[#555]">
                  Incluir detalhes? <b>{d.params?.detailed || 'Não'}</b>
                </div>
                {outrosParams.map((x: any) => (
                  <div key={x.key} className="text-[12px] text-[#555]">
                    {x.label}: {d.params[x.key]}
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[#888] italic text-right">
                Data de impressão:<br />
                {new Date(d.generated_at).toLocaleString('pt-PT')}<br />
                {d.user}
              </div>
            </div>

            <ReportGrid d={d} onView={(rows, cols) => setVista({ rows, cols })}
              page={pagina} pageSize={PAGE_SIZE}
              onPageInfo={({ page, totalPages }) => { setTotalPaginas(totalPages); if (page !== pagina) setPagina(page); }} />

            <div className="mt-6 pt-3 border-t border-[#e0e0e0] text-[10px] text-[#999] flex justify-between">
              <span>System Mwana Lodge © {new Date().getFullYear()}. Todos os direitos reservados.<br />{idTecnico}</span>
              <span>Página {pagina} de {totalPaginas}</span>
            </div>
          </div>
        </div>

        <Toolbar actions={[
          { label: 'Voltar aos parâmetros', icon: '◀', color: '#6b6b6b', onClick: voltar },
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
          <div className="max-w-[1100px] border border-[#c8c8c8] bg-white">
            <div className="px-5 py-5 flex items-start justify-between gap-8">
              <div className="grid grid-cols-2 gap-x-10 gap-y-4">
                {rep.params.map((x: any) => (
                  <div key={x.key} className="flex items-center gap-3">
                    <span className="w-[170px] flex-shrink-0 text-[13px] text-[#333]">{x.label}:</span>
                    <Campo x={x} params={params} setParams={setParams} armazens={armazens as any[]} />
                  </div>
                ))}
              </div>
              <button onClick={() => correr.mutate()} disabled={!podeExibir || correr.isPending}
                className="flex-shrink-0 px-6 py-2.5 bg-[#e8e8e8] border border-[#9a9a9a] hover:enabled:bg-[#dcdcdc] text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                {correr.isPending ? 'A gerar…' : 'Exibir Relatório'}
              </button>
            </div>
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
