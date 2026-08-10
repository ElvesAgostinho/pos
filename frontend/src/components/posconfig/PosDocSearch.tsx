import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money, Glyph, SearchButton } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';
const L = ({ w = 'w-[110px]', children }: any) => (
  <span className={`text-[12px] text-[#333] ${w} flex-shrink-0`}>{children}</span>
);

/**
 * PESQUISAR DOCUMENTOS — encontrar a fatura que o cliente traz na mão.
 *
 * Um documento fiscal NÃO se apaga: anula-se com nota de crédito, que também é
 * assinada e encadeada. É o que a AGT exige — e o que impede que uma venda desapareça
 * sem rasto. Por isso o botão diz "Anular (nota de crédito)" e pede o motivo.
 */
export default function PosDocSearch() {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const [aplicado, setAplicado] = useState<any>({});
  const [sel, setSel] = useState<number | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [anular, setAnular] = useState<any | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data: tipos = [] } = useQuery({
    queryKey: ['docs', 'types'],
    queryFn: async () => {
      const r = await apiClient.get('fiscal/doc-types/');
      return (r.data?.results || r.data || []) as any[];
    },
  });
  const { data: metodos = [] } = useQuery({
    queryKey: ['docs', 'pm'],
    queryFn: async () => {
      const r = await apiClient.get('mdm/payment-methods/');
      return (r.data?.results || r.data || []) as any[];
    },
  });

  const { data } = useQuery({
    queryKey: ['docs', 'search', aplicado],
    queryFn: async () => {
      const params: any = {};
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      return (await apiClient.get('pos/reports/documents/', { params })).data;
    },
  });
  const { data: doc } = useQuery({
    queryKey: ['docs', 'detail', ver],
    queryFn: async () => (await apiClient.get(`pos/reports/documents/${ver}/`)).data,
    enabled: !!ver,
  });

  const acao = useMutation({
    mutationFn: ({ id, ...body }: any) => apiClient.post(`pos/reports/documents/${id}/`, body),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['docs'] });
      setAnular(null);
      notifyGuide({ title: 'Feito', message: r.data.detail });
    },
    onError: notifyError,
  });

  const rows: any[] = data?.rows || [];
  const paginas = Math.max(1, Math.ceil(rows.length / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const selRow = rows.find((r) => r.id === sel);

  const exportar = () => {
    const head = ['Nome', 'Número', 'Data', 'Total', 'NIF', 'Entidade', 'Operador', 'Estado'];
    const csv = [head.join(';'), ...rows.map((r) => [
      r.name, r.number, r.date, r.total, r.tax_id, r.entity, r.operator,
      r.voided ? 'Anulado' : (r.settled ? 'Liquidado' : 'Por receber')].join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'documentos.csv'; a.click();
  };

  const imprimir = () => {
    if (!doc) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>${doc.invoice_no}</title><style>
        body{font-family:'Segoe UI',sans-serif;font-size:12px;padding:24px;max-width:700px}
        h1{font-size:16px;margin:0} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-top:12px}
        th{text-align:left;border-bottom:1px solid #333;padding:4px} td{padding:4px;border-bottom:1px solid #eee}
        .r{text-align:right} .tot{font-size:15px;font-weight:bold}
        .mention{margin-top:16px;font-size:10px;color:#555}
      </style></head><body>
      <h1>${doc.company}</h1><div class="muted">NIF: ${doc.company_tax_id}</div>
      <h2>${doc.type} ${doc.invoice_no}${doc.print_count > 0 ? ' — 2ª VIA' : ''}</h2>
      <div>Data: ${doc.date} · Operador: ${doc.operator || ''} ${doc.place ? '· ' + doc.place : ''}</div>
      <div>Cliente: ${doc.customer} · NIF: ${doc.customer_tax_id || 'Consumidor Final'}</div>
      <table><thead><tr><th>Artigo</th><th class="r">Qtd</th><th class="r">Preço</th><th class="r">IVA</th><th class="r">Total</th></tr></thead>
      <tbody>${doc.lines.map((l: any) => `<tr><td>${l.description}</td><td class="r">${Number(l.quantity)}</td>
        <td class="r">${Number(l.unit_price).toFixed(2)}</td><td class="r">${l.tax}%</td>
        <td class="r">${Number(l.total).toFixed(2)}</td></tr>`).join('')}</tbody></table>
      <p>Incidência: ${doc.net} · IVA: ${doc.tax}</p>
      <p class="tot">TOTAL: ${doc.gross} Kz</p>
      <p>Valor por extenso: ${doc.amount_in_words || ''}</p>
      <div class="mention">${(doc.hash || '').slice(0, 1)}${(doc.hash || '').slice(10, 11)}${(doc.hash || '').slice(20, 21)}${(doc.hash || '').slice(30, 31)}-Processado por programa validado n.º ${doc.certificate || ''}</div>
      </body></html>`);
    w.document.close();
    w.print();
    acao.mutate({ id: ver, action: 'print' });
  };

  // ─────────── pré-visualização do documento
  if (ver && doc) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-[720px] mx-auto bg-white border border-[#d0d0d0] p-8 shadow">
            {doc.voided && (
              <div className="mb-3 px-3 py-2 bg-[#fdecea] border border-[#e6b0aa] text-[#a01818] font-bold text-[13px]">
                DOCUMENTO ANULADO
              </div>
            )}
            <div className="flex justify-between">
              <div>
                <div className="text-[17px] font-bold">{doc.company}</div>
                <div className="text-[12px] text-[#666]">NIF: {doc.company_tax_id}</div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-bold">{doc.type}</div>
                <div className="text-[14px] font-mono">{doc.invoice_no}</div>
                <div className="text-[12px] text-[#666]">{doc.date}</div>
                {doc.print_count > 0 && (
                  <div className="text-[11px] text-[#a01818] font-bold">2ª VIA (impressa {doc.print_count}x)</div>
                )}
              </div>
            </div>

            <div className="mt-5 text-[12px] border-t border-b border-[#eee] py-3">
              <div><b>Cliente:</b> {doc.customer}</div>
              <div><b>NIF:</b> {doc.customer_tax_id || 'Consumidor Final'}</div>
              <div className="text-[#666] mt-1">
                Operador: {doc.operator || '—'}{doc.place ? ` · ${doc.place}` : ''}
                {doc.payment ? ` · ${doc.payment}` : ''}
              </div>
            </div>

            <table className="w-full text-[12px] mt-4">
              <thead><tr className="border-b border-[#333]">
                <th className="text-left py-1">Artigo</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Preço</th>
                <th className="text-right">IVA</th>
                <th className="text-right">Total</th>
              </tr></thead>
              <tbody>
                {doc.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-[#f0f0f0]">
                    <td className="py-1">{l.description}</td>
                    <td className="text-right">{Number(l.quantity)}</td>
                    <td className="text-right">{money(l.unit_price)}</td>
                    <td className="text-right">{l.tax}%</td>
                    <td className="text-right">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 text-[12px] text-right space-y-1">
              <div>Incidência: {money(doc.net)}</div>
              <div>IVA: {money(doc.tax)}</div>
              <div className="text-[17px] font-bold">TOTAL: {money(doc.gross)} Kz</div>
            </div>
            <div className="mt-2 text-[12px] italic text-[#555]">
              Valor por extenso: {doc.amount_in_words}
            </div>
            <div className="mt-6 text-[10px] text-[#888] break-all">
              {(doc.hash || '').slice(0, 1)}{(doc.hash || '').slice(10, 11)}{(doc.hash || '').slice(20, 21)}{(doc.hash || '').slice(30, 31)}
              -Processado por programa validado n.º {doc.certificate}
            </div>
          </div>
        </div>

        <Toolbar actions={[
          { label: 'Voltar', icon: '◀', color: '#6b6b6b', onClick: () => setVer(null) },
          { label: 'Imprimir', icon: '🖨', color: '#2b2b2b', onClick: imprimir },
          {
            label: 'Anular (nota de crédito)', icon: '🚫', disabled: doc.voided,
            onClick: () => setAnular({ id: ver, number: doc.invoice_no }),
          },
        ]} right={
          <span className="text-[11px] text-[#666]">
            Um documento fiscal não se apaga — anula-se com nota de crédito, também assinada.
          </span>
        } />

        {anular && <PopupAnular anular={anular} setAnular={setAnular} acao={acao} />}
      </div>
    );
  }

  // ─────────── pesquisa
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      <div className="flex gap-6 p-3 bg-white border-b border-[#d0d0d0]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L>Tipo Documento:</L>
            <select value={f.doc_type ?? ''} onChange={(e) => setF({ ...f, doc_type: e.target.value })}
              className={`${inp} w-[180px]`} style={inputStyle}>
              <option value="">Todos</option>
              {tipos.map((t: any) => <option key={t.id} value={t.code}>{t.code} · {t.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <L>Operador:</L>
            <input value={f.operator ?? ''} onChange={(e) => setF({ ...f, operator: e.target.value })}
              className={`${inp} w-[180px]`} style={inputStyle} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[80px]">Documento:</L>
            <input value={f.number ?? ''} onChange={(e) => setF({ ...f, number: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && setAplicado({ ...f })}
              className={`${inp} w-[180px]`} style={inputStyle} />
          </div>
          <div className="flex items-center gap-2">
            <L w="w-[80px]">Entidade:</L>
            <input value={f.entity ?? ''} onChange={(e) => setF({ ...f, entity: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && setAplicado({ ...f })}
              className={`${inp} w-[180px]`} style={inputStyle} placeholder="nome ou NIF" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[130px]">Modos de Pagamento:</L>
            <select value={f.payment ?? ''} onChange={(e) => setF({ ...f, payment: e.target.value })}
              className={`${inp} w-[160px]`} style={inputStyle}>
              <option value="">Todos</option>
              {metodos.map((m: any) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <L w="w-[130px]">Quarto:</L>
            <input value={f.room ?? ''} onChange={(e) => setF({ ...f, room: e.target.value })}
              className={`${inp} w-[160px]`} style={inputStyle} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <L w="w-[60px]">De data:</L>
            <input type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value })}
              className={`${inp} w-[145px]`} style={inputStyle} />
          </div>
          <div className="flex items-center gap-2">
            <L w="w-[60px]">A data:</L>
            <input type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value })}
              className={`${inp} w-[145px]`} style={inputStyle} />
          </div>
        </div>

        <SearchButton onClick={() => { setAplicado({ ...f }); setPage(1); }} className="ml-auto w-[170px]" />
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            {['Nome', 'Número', 'Data', 'Total', 'NIF', 'Entidade', 'Operador', 'Estado'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {vista.map((r) => (
              <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setVer(r.id)}
                className={`border-b border-[#eee] cursor-pointer ${sel === r.id ? 'bg-[#dce9f7]' : 'hover:bg-[#f5f9ff]'}`}>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1 font-mono font-semibold">{r.number}</td>
                <td className="px-2 py-1">{r.date}</td>
                <td className="px-2 py-1 text-right font-bold"
                  style={{ textDecoration: r.voided ? 'line-through' : undefined }}>{money(r.total)}</td>
                <td className="px-2 py-1">{r.tax_id || '—'}</td>
                <td className="px-2 py-1">{r.entity}</td>
                <td className="px-2 py-1 text-[#666]">{r.operator}</td>
                <td className="px-2 py-1">
                  <span className={`px-2 py-0.5 text-[11px] font-semibold ${r.voided
                    ? 'bg-[#fdecea] text-[#a01818]'
                    : r.settled ? 'bg-[#e8f5e9] text-[#1f7a34]' : 'bg-[#fff7e6] text-[#8a6100]'}`}>
                    {r.voided ? 'Anulado' : r.settled ? 'Liquidado' : 'Por receber'}
                  </span>
                </td>
              </tr>
            ))}
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
        <span className="ml-auto">
          {rows.length} documento(s) · <b>{money(data?.total || 0)} Kz</b>
        </span>
      </div>

      <Toolbar actions={[
        { label: 'Pré-visualizar', icon: '🔍', color: '#1a73c8', disabled: !sel, onClick: () => setVer(sel) },
        { label: 'Imprimir', icon: '🖨', color: '#2b2b2b', disabled: !sel, onClick: () => setVer(sel) },
        {
          label: 'Anular', icon: '🚫', disabled: !sel || selRow?.voided,
          onClick: () => setAnular({ id: sel, number: selRow.number }),
        },
        { label: 'Exportar para Excel', icon: '⬇', color: '#1f7a34', onClick: exportar },
      ]} />

      {anular && <PopupAnular anular={anular} setAnular={setAnular} acao={acao} />}
    </div>
  );
}

function PopupAnular({ anular, setAnular, acao }: any) {
  const [motivo, setMotivo] = useState('');
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => setAnular(null)} />
      <div className="fixed left-1/2 top-1/3 -translate-x-1/2 z-[71] bg-white border border-[#888] shadow-2xl w-[460px]">
        <div className="px-3 py-2 bg-[#3c3c3c] text-white text-[13px] font-bold flex justify-between">
          Anular {anular.number} <button onClick={() => setAnular(null)} className="inline-flex"><Glyph icon="✕" size={13} /></button>
        </div>
        <div className="p-4 space-y-3 text-[12px]">
          <div className="text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1.5">
            O documento não é apagado: é emitida uma <b>nota de crédito</b>, assinada e
            encadeada. É o que a AGT exige.
          </div>
          <div>Motivo da anulação:</div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus
            className={`${inp} w-full`} style={inputStyle} />
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setAnular(null)} className="px-4 py-1.5 border border-[#b0b0b0]">Voltar</button>
            <button disabled={!motivo}
              onClick={() => acao.mutate({ id: anular.id, action: 'void', reason: motivo })}
              className="px-4 py-1.5 bg-[#a01818] text-white disabled:bg-[#c0c0c0]">
              Emitir nota de crédito
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
