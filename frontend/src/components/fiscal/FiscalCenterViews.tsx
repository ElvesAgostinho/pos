import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import {
  Landmark, ShieldCheck, FileText, Radio, Boxes, CheckCircle2, XCircle,
  Plus, Trash2, Send, Download, KeyRound, Activity, Printer, Ban,
} from 'lucide-react';
import { printFiscalInvoice, printCommercialDocument } from './printInvoice';
import Pagination from '../ui/Pagination';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- helpers de UI clássica ----------
function Kpi({ label, value, tone = '#1e3f66', sub }: { label: string; value: any; tone?: string; sub?: string }) {
  return (
    <div className="bg-white border border-[#c0c0c0] shadow-[inset_1px_1px_0_#fff] px-3 py-2 min-w-[150px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-xl font-bold" style={{ color: tone }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">{title}</div>
      {children}
    </div>
  );
}
const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';

// ======================================================================
// 1 · Dashboard Fiscal
// ======================================================================
export function FiscalDashboardView() {
  const { data: d } = useQuery({ queryKey: ['fis-dash'], queryFn: async () => (await apiClient.get('fiscal/dashboard/')).data, refetchInterval: 15000 });
  const { data: m } = useQuery({ queryKey: ['fis-monitor'], queryFn: async () => (await apiClient.get('fiscal/monitor/')).data, refetchInterval: 15000 });
  return (
    <ClassicWindow title="Dashboard Fiscal — Angola AGT" icon={<Landmark size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Ambiente {d?.environment} · certificado n.º {d?.certificate_number}/AGT · motor de assinatura {m?.keys_engine_ok ? 'operacional' : 'indisponível'}</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Emissão">
          <div className="flex flex-wrap gap-2">
            <Kpi label="Emitidos hoje" value={d?.issued_today ?? 0} tone="#2e7d32" />
            <Kpi label="Total emitidos" value={d?.issued_total ?? 0} />
            <Kpi label="Anulados" value={d?.voided ?? 0} tone="#c0392b" />
            <Kpi label="Séries ativas" value={d?.active_series ?? 0} />
            <Kpi label="Tipos de documento" value={d?.doc_types ?? 0} />
          </div>
        </Section>
        <Section title="Comunicação AGT (fila)">
          <div className="flex flex-wrap gap-2">
            <Kpi label="Pendentes" value={d?.queue_pending ?? 0} tone="#b5651d" />
            <Kpi label="Enviados / aceites" value={d?.queue_sent ?? 0} tone="#16a085" />
            <Kpi label="Rejeitados" value={d?.queue_rejected ?? 0} tone="#c0392b" />
            <Kpi label="Ligação AGT" value={m?.agt_connection?.configured ? (m?.agt_connection?.health || '—') : 'Por configurar'} />
          </div>
        </Section>
        <Section title="Documentos Comerciais (pipeline)">
          <div className="flex flex-wrap gap-2">
            <Kpi label="Rascunhos" value={d?.commercial?.drafts ?? 0} tone="#7f8c8d" />
            <Kpi label="Em curso (enviado/aceite)" value={d?.commercial?.open ?? 0} tone="#b5651d" />
            <Kpi label="Convertidos em fatura" value={d?.commercial?.converted ?? 0} tone="#2e7d32" />
          </div>
        </Section>
        <Section title="Ciclo de vida fiscal">
          <div className="flex flex-wrap gap-2">
            <Kpi label="Pagos" value={d?.lifecycle?.paid ?? 0} tone="#16a085" />
            <Kpi label="Arquivados" value={d?.lifecycle?.archived ?? 0} tone="#2c3e50" />
          </div>
        </Section>
        <Section title="Certificados & Chaves">
          <div className="flex flex-wrap gap-2">
            <Kpi label="Certificados ativos" value={m?.certificates?.active ?? 0} />
            <Kpi label="Expirados" value={m?.certificates?.expired ?? 0} tone="#c0392b" />
            <Kpi label="Motor de chaves RSA" value={m?.keys_engine_ok ? 'OK' : 'FALHA'} tone={m?.keys_engine_ok ? '#2e7d32' : '#c0392b'} />
          </div>
        </Section>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 2 · Séries & Tipos de Documento
// ======================================================================
export function FiscalSeriesView() {
  const qc = useQueryClient();
  const { data: series } = useQuery({ queryKey: ['fis-series'], queryFn: async () => (await apiClient.get('fiscal/series/')).data });
  const { data: types } = useQuery({ queryKey: ['fis-types'], queryFn: async () => (await apiClient.get('fiscal/doc-types/')).data });
  const [form, setForm] = useState<any>({ code: '', doc_type: '', year: 2026, prefix: '', certified: true, environment: 'TEST', is_active: true });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post('fiscal/series/', { ...form, doc_type: Number(form.doc_type) })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fis-series'] }); setForm({ ...form, code: '' }); },
  });
  const verify = useMutation({ mutationFn: async (id: number) => (await apiClient.get(`fiscal/series/${id}/verify/`)).data });
  return (
    <ClassicWindow title="Séries Fiscais & Tipos de Documento" icon={<FileText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Numeração sequencial contínua por série · cadeia de hash verificável (auditoria)</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Nova série">
          <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
            <label className="flex flex-col">Código<input className="border border-[#c0c0c0] px-2 py-1 w-20" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label>
            <label className="flex flex-col">Tipo
              <select className="border border-[#c0c0c0] px-2 py-1" value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })}>
                <option value="">—</option>
                {(types || []).map((t: any) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
              </select></label>
            <label className="flex flex-col">Exercício<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-24" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} /></label>
            <label className="flex flex-col">Prefixo<input className="border border-[#c0c0c0] px-2 py-1 w-20" value={form.prefix} onChange={e => setForm({ ...form, prefix: e.target.value })} /></label>
            <button className={btn} disabled={!form.code || !form.doc_type} onClick={() => create.mutate()}><Plus size={13} /> Criar série</button>
          </div>
        </Section>
        <Section title="Séries">
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-7 font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1">
              <span>Documento</span><span>Série</span><span>Exercício</span><span>Nº atual</span><span>Certificada</span><span>Ambiente</span><span></span>
            </div>
            {(series || []).map((s: any) => (
              <div key={s.id} className="grid grid-cols-7 px-2 py-1 border-b border-[#eee] items-center">
                <span>{s.doc_type_code} · {s.doc_type_name}</span>
                <span>{s.prefix} {s.code}</span><span>{s.year}</span><span className="font-bold">{s.current_number}</span>
                <span>{s.certified ? '✔' : '✘'}</span><span>{s.environment}</span>
                <button className="text-[#1565c0] hover:underline text-left flex items-center gap-1" onClick={() => verify.mutate(s.id)}><ShieldCheck size={13} /> verificar</button>
              </div>
            ))}
          </div>
          {verify.data && (
            <div className="mt-2 text-[12px] bg-white border border-[#c0c0c0] p-2">
              Cadeia {verify.data.all_ok ? <span className="text-green-700 font-bold">ÍNTEGRA</span> : <span className="text-red-700 font-bold">COMPROMETIDA</span>} · {verify.data.count} documentos verificados
            </div>
          )}
        </Section>
        <Section title="Tipos de documento (Rules Engine)">
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-5 font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Código</span><span>Nome</span><span>SAF-T</span><span>Assina</span><span>Retificativo</span></div>
            {(types || []).map((t: any) => (
              <div key={t.id} className="grid grid-cols-5 px-2 py-1 border-b border-[#eee]"><span className="font-bold">{t.code}</span><span>{t.name}</span><span>{t.saft_type}</span><span>{t.signable ? '✔' : '—'}</span><span>{t.is_rectifying ? '✔' : '—'}</span></div>
            ))}
          </div>
        </Section>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 3 · Faturação Eletrónica — emitir + lista de documentos
// ======================================================================
// Seletor de produtos pesquisável — preenche as linhas da fatura a partir do Master Data.
function ProductPicker({ onPick }: { onPick: (item: any) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: ['fis-item-pick', q],
    queryFn: async () => (await apiClient.get('inventory/items/', { params: { search: q || undefined, page_size: 20 } })).data?.results
      ?? (await apiClient.get('inventory/items/', { params: { search: q || undefined } })).data,
    enabled: open,
  });
  const list = Array.isArray(items) ? items : (items?.results || []);
  return (
    <div className="relative">
      <div className="flex items-center gap-1 border border-[#c0c0c0] bg-white px-2 py-1">
        <Boxes size={14} className="text-[#1e3f66]" />
        <input value={q} onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }}
          placeholder="Filtrar e adicionar produto (código, nome, código de barras)…" className="flex-1 outline-none text-[12px]" />
        {q && <button onClick={() => setQ('')} className="text-gray-400 text-[11px]">limpar</button>}
      </div>
      {open && (
        <div className="absolute z-30 left-0 right-0 bg-white border border-[#a0a0a0] shadow-lg max-h-56 overflow-auto text-[12px]" onMouseLeave={() => setOpen(false)}>
          {list.slice(0, 20).map((it: any) => (
            <button key={it.id} onClick={() => { onPick(it); setOpen(false); setQ(''); }}
              className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#eef4fb] text-left border-b border-[#f0f0f0]">
              <span><b>{it.code}</b> · {it.name}</span>
              <span className="text-gray-600">{money(it.sale_price)} · IVA {it.tax_percentage ?? 14}%</span>
            </button>
          ))}
          {list.length === 0 && <div className="px-2 py-2 text-gray-400">Sem produtos. Escreva para pesquisar.</div>}
        </div>
      )}
    </div>
  );
}

export function FiscalDocumentsView() {
  const qc = useQueryClient();
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');  // termo aplicado (debounce simples ao submeter)
  const { data: series } = useQuery({ queryKey: ['fis-series'], queryFn: async () => (await apiClient.get('fiscal/series/')).data });
  const { data: docs } = useQuery({
    queryKey: ['fis-docs', page, q],
    queryFn: async () => (await apiClient.get('fiscal/documents/', { params: { page, page_size: PAGE_SIZE, search: q || undefined, ordering: '-created_at' } })).data,
  });
  const [hdr, setHdr] = useState<any>({ series: '', customer_name: '', customer_tax_id: '' });
  const [lines, setLines] = useState<any[]>([{ description: '', quantity: 1, unit_price: 0, tax_percentage: 14 }]);
  const [err, setErr] = useState('');
  const issue = useMutation({
    mutationFn: async () => (await apiClient.post('fiscal/documents/issue/', { ...hdr, series: Number(hdr.series), lines })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fis-docs'] }); setLines([{ description: '', quantity: 1, unit_price: 0, tax_percentage: 14 }]); setErr(''); },
    onError: (e: any) => setErr(e?.response?.data?.detail || 'Erro ao emitir.'),
  });
  const rows = docs?.results || (Array.isArray(docs) ? docs : []);
  const total = docs?.count ?? rows.length;
  const setLine = (i: number, k: string, v: any) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  return (
    <ClassicWindow title="Faturação Eletrónica — Emissão de Documentos" icon={<FileText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Cada documento é validado, numerado sequencialmente, assinado (RSA) e encadeado por hash · imutável</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Emitir documento">
          <div className="bg-white border border-[#c0c0c0] p-3 space-y-2 text-[12px]">
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex flex-col">Série
                <select className="border border-[#c0c0c0] px-2 py-1" value={hdr.series} onChange={e => setHdr({ ...hdr, series: e.target.value })}>
                  <option value="">—</option>
                  {(series || []).filter((s: any) => s.is_active).map((s: any) => <option key={s.id} value={s.id}>{s.doc_type_code} {s.code}/{s.year}</option>)}
                </select></label>
              <label className="flex flex-col">Cliente<input className="border border-[#c0c0c0] px-2 py-1 w-56" placeholder="Consumidor Final" value={hdr.customer_name} onChange={e => setHdr({ ...hdr, customer_name: e.target.value })} /></label>
              <label className="flex flex-col">NIF<input className="border border-[#c0c0c0] px-2 py-1 w-40" placeholder="(sem NIF = Consumidor Final)" value={hdr.customer_tax_id} onChange={e => setHdr({ ...hdr, customer_tax_id: e.target.value })} /></label>
            </div>
            <ProductPicker onPick={(it) => setLines(ls => [...ls, {
              description: `${it.code ? it.code + ' · ' : ''}${it.name}`, quantity: 1,
              unit_price: Number(it.sale_price) || 0, tax_percentage: Number(it.tax_percentage ?? 14),
            }])} />
            <div className="border border-[#eee]">
              <div className="grid grid-cols-[1fr_80px_110px_80px_40px] font-bold bg-[#f0f0f0] px-2 py-1"><span>Descrição</span><span>Qtd</span><span>Preço</span><span>IVA %</span><span></span></div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_110px_80px_40px] px-2 py-1 gap-1 items-center">
                  <input className="border border-[#c0c0c0] px-2 py-1" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} />
                  <input type="number" className="border border-[#c0c0c0] px-1 py-1" value={l.quantity} onChange={e => setLine(i, 'quantity', Number(e.target.value))} />
                  <input type="number" className="border border-[#c0c0c0] px-1 py-1" value={l.unit_price} onChange={e => setLine(i, 'unit_price', Number(e.target.value))} />
                  <input type="number" className="border border-[#c0c0c0] px-1 py-1" value={l.tax_percentage} onChange={e => setLine(i, 'tax_percentage', Number(e.target.value))} />
                  <button className="text-red-600" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="px-2 py-1"><button className="text-[#1565c0] flex items-center gap-1" onClick={() => setLines(ls => [...ls, { description: '', quantity: 1, unit_price: 0, tax_percentage: 14 }])}><Plus size={13} /> linha</button></div>
            </div>
            {err && <div className="text-red-700 font-bold">{err}</div>}
            <button className={btn} disabled={!hdr.series || issue.isPending} onClick={() => issue.mutate()}><Send size={13} /> Emitir & assinar</button>
            {issue.data && <div className="text-green-800 bg-green-50 border border-green-200 px-2 py-1">Emitido <b>{issue.data.invoice_no}</b> · total {money(issue.data.gross_total)} · {issue.data.print_mention}</div>}
          </div>
        </Section>
        <Section title="Documentos emitidos">
          <form className="flex items-center gap-2 mb-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
            <input className="border border-[#c0c0c0] px-2 py-1 text-[12px] w-72" placeholder="Pesquisar nº, cliente ou NIF…" value={search} onChange={e => setSearch(e.target.value)} />
            <button className={btn} type="submit">Pesquisar</button>
            {q && <button type="button" className="text-[12px] text-[#1565c0] hover:underline" onClick={() => { setSearch(''); setQ(''); setPage(1); }}>limpar</button>}
          </form>
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-[1fr_90px_1fr_100px_80px_170px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Documento</span><span>Data</span><span>Cliente</span><span className="text-right">Total</span><span>Estado</span><span className="text-right">Ações</span></div>
            {rows.map((r: any) => (
              <div key={r.id} className="grid grid-cols-[1fr_90px_1fr_100px_80px_170px] px-2 py-1 border-b border-[#eee] items-center">
                <span className="font-bold">{r.invoice_no}</span><span>{r.doc_date}</span><span>{r.customer_name}</span>
                <span className="text-right">{money(r.gross_total)}</span>
                <span className={r.status === 'N' ? '' : 'text-red-600 font-bold'}>{r.status === 'N' ? 'Normal' : 'Anulado'}</span>
                <span className="flex items-center gap-2 justify-end">
                  <button className="text-[#1565c0] hover:underline flex items-center gap-1" onClick={() => printFiscalInvoice(r.id)}><Printer size={13} /> Imprimir</button>
                  {r.status === 'N' && !r.doc_type_is_rectifying && (
                    <button className="text-red-600 hover:underline flex items-center gap-1" title="Anular (emite Nota de Crédito)"
                      onClick={async () => {
                        const reason = prompt(`Anular ${r.invoice_no}? Será emitida uma Nota de Crédito.\nMotivo:`, 'Anulação');
                        if (reason === null) return;
                        try { const res = await apiClient.post(`fiscal/documents/${r.id}/credit_note/`, { reason }); alert(res.data.detail); qc.invalidateQueries({ queryKey: ['fis-docs'] }); }
                        catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
                      }}><Ban size={13} /> Anular (NC)</button>
                  )}
                </span>
              </div>
            ))}
            {rows.length === 0 && <div className="px-3 py-2 text-gray-500">Sem documentos.</div>}
            {docs?.count !== undefined && <Pagination page={page} pageSize={PAGE_SIZE} count={total} onPage={setPage} />}
          </div>
        </Section>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 3a · Documentos Comerciais (Orçamento / Proforma / Encomenda)
// ======================================================================
const KIND: Record<string, string> = { BUDGET: 'Orçamento', PROFORMA: 'Proforma', ORDER: 'Encomenda' };
export function CommercialDocumentsView() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['fis-commercial'], queryFn: async () => (await apiClient.get('fiscal/commercial-documents/')).data });
  const [hdr, setHdr] = useState<any>({ kind: 'BUDGET', customer_name: '', customer_tax_id: '' });
  const [lines, setLines] = useState<any[]>([{ description: '', quantity: 1, unit_price: 0, tax_code: 'IVA14' }]);
  const [msg, setMsg] = useState('');
  const inval = () => qc.invalidateQueries({ queryKey: ['fis-commercial'] });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post('fiscal/commercial-documents/', { ...hdr, lines })).data,
    onSuccess: () => { inval(); setLines([{ description: '', quantity: 1, unit_price: 0, tax_code: 'IVA14' }]); setMsg(''); },
  });
  const act = useMutation({
    mutationFn: async ({ id, action }: any) => (await apiClient.post(`fiscal/commercial-documents/${id}/${action}/`, {})).data,
    onSuccess: (d: any) => { inval(); if (d?.fiscal) setMsg(`Convertido em ${d.fiscal.invoice_no} (${d.fiscal.gross_total})`); },
    onError: (e: any) => setMsg(e?.response?.data?.detail || 'Erro'),
  });
  const rows = data?.results || data || [];
  const setLine = (i: number, k: string, v: any) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  return (
    <ClassicWindow title="Documentos Comerciais — Orçamento · Proforma · Encomenda" icon={<FileText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Documentos não-fiscais, editáveis em rascunho · convertem-se em Fatura (entram então no motor de assinatura/SAF-T)</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Novo documento">
          <div className="bg-white border border-[#c0c0c0] p-3 space-y-2 text-[12px]">
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex flex-col">Tipo
                <select className="border border-[#c0c0c0] px-2 py-1" value={hdr.kind} onChange={e => setHdr({ ...hdr, kind: e.target.value })}>
                  <option value="BUDGET">Orçamento</option><option value="PROFORMA">Proforma</option><option value="ORDER">Encomenda de Cliente</option>
                </select></label>
              <label className="flex flex-col">Cliente<input className="border border-[#c0c0c0] px-2 py-1 w-56" value={hdr.customer_name} onChange={e => setHdr({ ...hdr, customer_name: e.target.value })} /></label>
              <label className="flex flex-col">NIF<input className="border border-[#c0c0c0] px-2 py-1 w-40" value={hdr.customer_tax_id} onChange={e => setHdr({ ...hdr, customer_tax_id: e.target.value })} /></label>
            </div>
            <div className="border border-[#eee]">
              <div className="grid grid-cols-[1fr_80px_110px_90px_40px] font-bold bg-[#f0f0f0] px-2 py-1"><span>Descrição</span><span>Qtd</span><span>Preço</span><span>IVA</span><span></span></div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_110px_90px_40px] px-2 py-1 gap-1 items-center">
                  <input className="border border-[#c0c0c0] px-2 py-1" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} />
                  <input type="number" className="border border-[#c0c0c0] px-1 py-1" value={l.quantity} onChange={e => setLine(i, 'quantity', Number(e.target.value))} />
                  <input type="number" className="border border-[#c0c0c0] px-1 py-1" value={l.unit_price} onChange={e => setLine(i, 'unit_price', Number(e.target.value))} />
                  <select className="border border-[#c0c0c0] px-1 py-1" value={l.tax_code} onChange={e => setLine(i, 'tax_code', e.target.value)}>
                    <option value="IVA14">14%</option><option value="IVA7">7%</option><option value="IVA5">5%</option><option value="IVA0">0%</option><option value="ISE">Isento</option>
                  </select>
                  <button className="text-red-600" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="px-2 py-1"><button className="text-[#1565c0] flex items-center gap-1" onClick={() => setLines(ls => [...ls, { description: '', quantity: 1, unit_price: 0, tax_code: 'IVA14' }])}><Plus size={13} /> linha</button></div>
            </div>
            <button className={btn} disabled={create.isPending} onClick={() => create.mutate()}><Plus size={13} /> Criar rascunho</button>
            {msg && <div className="text-green-800 bg-green-50 border border-green-200 px-2 py-1">{msg}</div>}
          </div>
        </Section>
        <Section title="Documentos">
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-[110px_90px_1fr_100px_100px_1fr] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Nº</span><span>Tipo</span><span>Cliente</span><span className="text-right">Total</span><span>Estado</span><span>Ações</span></div>
            {rows.map((r: any) => (
              <div key={r.id} className="grid grid-cols-[110px_90px_1fr_100px_100px_1fr] px-2 py-1 border-b border-[#eee] items-center">
                <span className="font-bold">{r.number}</span><span>{KIND[r.kind]}</span><span>{r.customer_name || '—'}</span>
                <span className="text-right">{money(r.gross_total)}</span>
                <span>{r.state_display}{r.converted_invoice_no ? ` → ${r.converted_invoice_no}` : ''}</span>
                <span className="flex flex-wrap gap-1">
                  {r.state === 'DRAFT' && <button className="text-[#1565c0] hover:underline" onClick={() => act.mutate({ id: r.id, action: 'send' })}>Enviar</button>}
                  {(r.state === 'SENT' || r.state === 'APPROVED') && <button className="text-[#1565c0] hover:underline" onClick={() => act.mutate({ id: r.id, action: 'accept' })}>Aceitar</button>}
                  {r.state !== 'CONVERTED' && <button className="text-green-700 font-bold hover:underline" onClick={() => act.mutate({ id: r.id, action: 'convert' })}>→ Fatura</button>}
                  <button className="text-gray-600 hover:underline" onClick={() => act.mutate({ id: r.id, action: 'duplicate' })}>Duplicar</button>
                  <button className="text-[#1565c0] hover:underline flex items-center gap-0.5" onClick={() => printCommercialDocument(r.id)}><Printer size={12} /> Imprimir</button>
                </span>
              </div>
            ))}
            {rows.length === 0 && <div className="px-3 py-2 text-gray-500">Sem documentos. Crie um Orçamento acima.</div>}
          </div>
        </Section>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 3b · Tax / IVA Engine
// ======================================================================
export function TaxEngineView() {
  const qc = useQueryClient();
  const { data: rates } = useQuery({ queryKey: ['fis-rates'], queryFn: async () => (await apiClient.get('fiscal/tax-rates/')).data });
  const { data: exemptions } = useQuery({ queryKey: ['fis-exemptions'], queryFn: async () => (await apiClient.get('fiscal/exemptions/')).data });
  const [r, setR] = useState<any>({ code: '', name: '', percentage: 0, is_default: false, is_exempt: false, is_active: true });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post('fiscal/tax-rates/', { ...r, percentage: Number(r.percentage) })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fis-rates'] }); setR({ ...r, code: '', name: '' }); },
  });
  return (
    <ClassicWindow title="Tax / IVA Engine" icon={<Landmark size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Taxas e isenções parametrizáveis · aplicadas automaticamente na emissão (POS, Financeiro, manual)</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Nova taxa">
          <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
            <label className="flex flex-col">Código<input className="border border-[#c0c0c0] px-2 py-1 w-24" value={r.code} onChange={e => setR({ ...r, code: e.target.value })} /></label>
            <label className="flex flex-col">Nome<input className="border border-[#c0c0c0] px-2 py-1 w-64" value={r.name} onChange={e => setR({ ...r, name: e.target.value })} /></label>
            <label className="flex flex-col">%<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-20" value={r.percentage} onChange={e => setR({ ...r, percentage: e.target.value })} /></label>
            <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={r.is_default} onChange={e => setR({ ...r, is_default: e.target.checked })} /> Padrão</label>
            <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={r.is_exempt} onChange={e => setR({ ...r, is_exempt: e.target.checked })} /> Isenta</label>
            <button className={btn} disabled={!r.code} onClick={() => create.mutate()}><Plus size={13} /> Criar</button>
          </div>
        </Section>
        <Section title="Taxas de IVA">
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-5 font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Código</span><span>Nome</span><span className="text-right">%</span><span>Padrão</span><span>Isenta</span></div>
            {(rates || []).map((x: any) => (
              <div key={x.id} className="grid grid-cols-5 px-2 py-1 border-b border-[#eee]"><span className="font-bold">{x.code}</span><span>{x.name}</span><span className="text-right">{Number(x.percentage)}%</span><span>{x.is_default ? '✔' : '—'}</span><span>{x.is_exempt ? '✔' : '—'}</span></div>
            ))}
          </div>
        </Section>
        <Section title="Motivos de isenção">
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            {(exemptions || []).map((x: any) => (
              <div key={x.id} className="flex gap-3 px-2 py-1 border-b border-[#eee]"><span className="font-bold w-14">{x.code}</span><span>{x.description}</span></div>
            ))}
          </div>
        </Section>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 3c · Fiscal Archive (arquivo legal por documento)
// ======================================================================
export function FiscalArchiveView() {
  const PAGE = 15;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['fis-archive', page, q],
    queryFn: async () => (await apiClient.get('fiscal/documents/', { params: { page, page_size: PAGE, search: q || undefined, ordering: '-created_at' } })).data,
  });
  const rows = data?.results || (Array.isArray(data) ? data : []);
  const downloadXml = async (id: number, no: string) => {
    const res = await apiClient.get(`fiscal/documents/${id}/xml/`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }));
    const a = document.createElement('a'); a.href = url; a.download = `${no.replace(/[/ ]/g, '-')}.xml`; a.click(); URL.revokeObjectURL(url);
  };
  const archive = async (id: number) => { await apiClient.post(`fiscal/documents/${id}/archive/`, {}); };
  const LIFE: Record<string, string> = { ISSUED: 'Emitido', SIGNED: 'Assinado', SENT_AGT: 'Enviado AGT', ACCEPTED: 'Aceite', PAID: 'Pago', ARCHIVED: 'Arquivado', VOID: 'Anulado' };
  return (
    <ClassicWindow title="Fiscal Archive — Arquivo Legal de Documentos" icon={<Boxes size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Arquivo imutável · imprimir (PDF), exportar XML por documento e SAF-T por período · nunca eliminar</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
          <input className="border border-[#c0c0c0] px-2 py-1 text-[12px] w-72" placeholder="Pesquisar nº, cliente ou NIF…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className={btn} type="submit">Pesquisar</button>
          {q && <button type="button" className="text-[12px] text-[#1565c0] hover:underline" onClick={() => { setSearch(''); setQ(''); setPage(1); }}>limpar</button>}
        </form>
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[1fr_86px_1fr_100px_90px_180px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Documento</span><span>Data</span><span>Cliente</span><span className="text-right">Total</span><span>Estado</span><span>Ações</span></div>
          {rows.map((r: any) => (
            <div key={r.id} className="grid grid-cols-[1fr_86px_1fr_100px_90px_180px] px-2 py-1 border-b border-[#eee] items-center">
              <span className="font-bold">{r.invoice_no}</span><span>{r.doc_date}</span><span className="truncate">{r.customer_name}</span>
              <span className="text-right">{money(r.gross_total)}</span>
              <span>{LIFE[r.lifecycle_state] || r.lifecycle_state}</span>
              <span className="flex gap-2">
                <button className="text-[#1565c0] hover:underline flex items-center gap-0.5" onClick={() => printFiscalInvoice(r.id, false)}><Printer size={12} />PDF</button>
                <button className="text-[#1565c0] hover:underline flex items-center gap-0.5" onClick={() => downloadXml(r.id, r.invoice_no)}><Download size={12} />XML</button>
                {!r.is_archived && <button className="text-gray-600 hover:underline" onClick={() => archive(r.id)}>Arquivar</button>}
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="px-3 py-2 text-gray-500">Sem documentos.</div>}
          {data?.count !== undefined && <Pagination page={page} pageSize={PAGE} count={data.count} onPage={setPage} />}
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 4 · SAF-T Center
// ======================================================================
export function SaftCenterView() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));
  const download = async () => {
    const res = await apiClient.get('fiscal/saft/export/', { params: { start, end }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }));
    const a = document.createElement('a'); a.href = url; a.download = `SAFT_AO_${start}_${end}.xml`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <ClassicWindow title="SAF-T Center (Angola)" icon={<Boxes size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Ficheiro normalizado SAF-T(AO) · Header · MasterFiles · SourceDocuments (SalesInvoices/WorkingDocuments)</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Gerar SAF-T(AO)">
          <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-3 text-[12px]">
            <label className="flex flex-col">Início<input type="date" className="border border-[#c0c0c0] px-2 py-1" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="flex flex-col">Fim<input type="date" className="border border-[#c0c0c0] px-2 py-1" value={end} onChange={e => setEnd(e.target.value)} /></label>
            <button className={btn} onClick={download}><Download size={13} /> Exportar XML</button>
          </div>
        </Section>
        <div className="text-[12px] text-gray-600 bg-white border border-[#c0c0c0] p-3">
          O motor SAF-T é orientado a dados; novos layouts exigidos pela AGT (Contabilidade, Faturação, Inventário) podem ser acrescentados sem alterar o núcleo do ERP.
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 5 · Fiscal Connectivity Center — AGT + certificados + Test Center
// ======================================================================
export function FiscalConnectivityView() {
  const qc = useQueryClient();
  const { data: conns } = useQuery({ queryKey: ['fis-conns'], queryFn: async () => (await apiClient.get('fiscal/connections/')).data });
  const { data: certs } = useQuery({ queryKey: ['fis-certs'], queryFn: async () => (await apiClient.get('fiscal/certificates/')).data });
  const [c, setC] = useState<any>({ name: 'AGT', environment: 'SANDBOX', url_auth: '', url_submit: '', url_saft: '', url_health: '', client_id: '', client_secret: '', username: '', password: '' });
  const saveConn = useMutation({
    mutationFn: async () => (await apiClient.post('fiscal/connections/', c)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fis-conns'] }),
  });
  const test = useMutation({ mutationFn: async (t: string) => (await apiClient.post('fiscal/test-center/', { test: t })).data });
  const R = test.data?.results || {};
  const row = (k: string, label: string) => R[k] ? (
    <div className="flex items-center gap-2 text-[12px]">{R[k].ok ? <CheckCircle2 size={14} className="text-green-600" /> : <XCircle size={14} className="text-red-600" />}<b>{label}:</b> {R[k].detail}</div>
  ) : null;
  return (
    <ClassicWindow title="Fiscal Connectivity Center — AGT" icon={<Radio size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Endpoints e credenciais parametrizáveis · segredos guardados encriptados · integração real na certificação AGT</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <Section title="Test Center (auto-diagnóstico)">
          <div className="bg-white border border-[#c0c0c0] p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {['all', 'keys', 'signature', 'saft', 'qr', 'agt'].map(t => (
                <button key={t} className={btn} onClick={() => test.mutate(t)}><Activity size={13} /> Testar {t}</button>
              ))}
            </div>
            {test.data && (
              <div className="space-y-1 pt-1">
                {row('keys', 'Chaves RSA')}{row('signature', 'Assinatura')}{row('saft', 'SAF-T')}{row('xml', 'XML')}{row('qr', 'QR Code')}{row('agt', 'Ligação AGT')}
                <div className="text-[12px] pt-1 font-bold">{test.data.overall_ok ? <span className="text-green-700">Todos os testes OK</span> : <span className="text-[#b5651d]">Há itens por configurar</span>}</div>
              </div>
            )}
          </div>
        </Section>
        <Section title="Ligação AGT (AGT API Manager)">
          <div className="bg-white border border-[#c0c0c0] p-3 grid grid-cols-2 gap-2 text-[12px]">
            <label className="flex flex-col">Ambiente
              <select className="border border-[#c0c0c0] px-2 py-1" value={c.environment} onChange={e => setC({ ...c, environment: e.target.value })}><option value="SANDBOX">Sandbox</option><option value="PROD">Produção</option></select></label>
            <label className="flex flex-col">Nome<input className="border border-[#c0c0c0] px-2 py-1" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></label>
            <label className="flex flex-col">URL Autenticação<input className="border border-[#c0c0c0] px-2 py-1" value={c.url_auth} onChange={e => setC({ ...c, url_auth: e.target.value })} /></label>
            <label className="flex flex-col">URL Emissão<input className="border border-[#c0c0c0] px-2 py-1" value={c.url_submit} onChange={e => setC({ ...c, url_submit: e.target.value })} /></label>
            <label className="flex flex-col">URL SAF-T<input className="border border-[#c0c0c0] px-2 py-1" value={c.url_saft} onChange={e => setC({ ...c, url_saft: e.target.value })} /></label>
            <label className="flex flex-col">URL Health<input className="border border-[#c0c0c0] px-2 py-1" value={c.url_health} onChange={e => setC({ ...c, url_health: e.target.value })} /></label>
            <label className="flex flex-col">Client ID<input className="border border-[#c0c0c0] px-2 py-1" value={c.client_id} onChange={e => setC({ ...c, client_id: e.target.value })} /></label>
            <label className="flex flex-col">Client Secret<input type="password" className="border border-[#c0c0c0] px-2 py-1" value={c.client_secret} onChange={e => setC({ ...c, client_secret: e.target.value })} /></label>
            <label className="flex flex-col">Utilizador<input className="border border-[#c0c0c0] px-2 py-1" value={c.username} onChange={e => setC({ ...c, username: e.target.value })} /></label>
            <label className="flex flex-col">Password<input type="password" className="border border-[#c0c0c0] px-2 py-1" value={c.password} onChange={e => setC({ ...c, password: e.target.value })} /></label>
            <div className="col-span-2"><button className={btn} onClick={() => saveConn.mutate()}><Send size={13} /> Guardar ligação</button></div>
          </div>
          {(conns || []).length > 0 && (
            <div className="mt-2 bg-white border border-[#c0c0c0] text-[12px]">
              {(conns || []).map((cn: any) => (
                <div key={cn.id} className="flex items-center gap-3 px-2 py-1 border-b border-[#eee]">
                  <Radio size={13} /> <b>{cn.name}</b> [{cn.environment}] · segredo {cn.has_client_secret ? '••••••••' : '—'} · saúde {cn.last_health_status || 'n/d'}
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Certificados & Chaves">
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-5 font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Alias</span><span>Algoritmo</span><span>Validade</span><span>Estado</span><span>Chave privada</span></div>
            {(certs || []).length === 0 && <div className="px-2 py-2 text-gray-500 flex items-center gap-2"><KeyRound size={13} /> Motor usa o par RSA do sistema (licensing/engine). Importe certificados AGT quando disponíveis.</div>}
            {(certs || []).map((ct: any) => (
              <div key={ct.id} className="grid grid-cols-5 px-2 py-1 border-b border-[#eee]"><span className="font-bold">{ct.alias}</span><span>{ct.algorithm}</span><span>{ct.valid_until || '—'}</span><span>{ct.status}</span><span>{ct.has_private_key ? '•••• (encriptada)' : '—'}</span></div>
            ))}
          </div>
        </Section>
      </div>
    </ClassicWindow>
  );
}

// ======================================================================
// 6 · Auditoria Fiscal
// ======================================================================
export function FiscalAuditView() {
  const { data } = useQuery({ queryKey: ['fis-audit'], queryFn: async () => (await apiClient.get('fiscal/audit/')).data, refetchInterval: 20000 });
  const rows = data?.results || data || [];
  return (
    <ClassicWindow title="Auditoria Fiscal" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Registo imutável de todas as operações fiscais (quem, quando, IP, documento)</div>}>
      <div className="p-4 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-5 font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Evento</span><span>Documento</span><span>Utilizador</span><span>IP</span><span>Quando</span></div>
          {rows.map((r: any) => (
            <div key={r.id} className="grid grid-cols-5 px-2 py-1 border-b border-[#eee]"><span className="font-bold">{r.event}</span><span>{r.document_ref || '—'}</span><span>{r.user || '—'}</span><span>{r.ip_address || '—'}</span><span>{new Date(r.created_at).toLocaleString('pt-PT')}</span></div>
          ))}
        </div>
      </div>
    </ClassicWindow>
  );
}
