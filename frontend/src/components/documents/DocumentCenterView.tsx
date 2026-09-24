import { useState } from 'react';
import AuditTrailView from '../system/AuditTrailView';
import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { printFiscalInvoice } from '../fiscal/printInvoice';
import {
  FolderArchive, Search, FileText, Folder, Receipt, BedDouble, ShoppingCart, Boxes, Coins, X, Link2, Printer,
  BookText, FileType2, FileSpreadsheet, FileJson, FileDown, Server, SlidersHorizontal,
} from 'lucide-react';
import { exportPDF, exportExcel, exportWord, exportCSV, exportJSON } from '../../utils/exportData';
import { aviso } from '../../ui/dialogo';

const money = (v: any) => (v == null ? '—' : Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const CAT_ICON: Record<string, any> = { FATURACAO: FileText, POS: Receipt, PMS: BedDouble, COMPRAS: ShoppingCart, STOCK: Boxes, TESOURARIA: Coins, CONTABILIDADE: BookText };
const CAT_COLOR: Record<string, string> = { FATURACAO: '#B0392B', POS: '#0B4F5C', PMS: '#5C8891', COMPRAS: '#5C8891', STOCK: '#5C8891', TESOURARIA: '#0B4F5C', CONTABILIDADE: '#0B4F5C' };

// Colunas de exportação (todas as áreas, formato comum).
const EXPORT_COLS = [
  { header: 'Área', get: (r: any) => r.category },
  { header: 'Documento', get: (r: any) => r.number },
  { header: 'Tipo', get: (r: any) => r.doc_type },
  { header: 'Cliente / Ref.', get: (r: any) => r.party },
  { header: 'Valor', get: (r: any) => r.amount },
  { header: 'Data', get: (r: any) => r.date },
  { header: 'Estado', get: (r: any) => r.status },
];

export default function DocumentCenterView() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState<{ module: string; id: string } | null>(null);
  const { data: dash } = useQuery({ queryKey: ['doc-dash'], queryFn: async () => (await apiClient.get('documents/dashboard/')).data, refetchInterval: 30000 });
  const { data } = useQuery({ queryKey: ['doc-center', q, cat], queryFn: async () => (await apiClient.get('documents/center/', { params: { q: q || undefined, category: cat || undefined, limit: 200 } })).data });
  const rows = data?.results || [];
  const cats = data?.categories || [];
  const [reportServer, setReportServer] = useState(() => localStorage.getItem('report_server_url') || '');
  const [showRS, setShowRS] = useState(false);
  // Filtros avançados (client-side, sobre os resultados)
  const [showAdv, setShowAdv] = useState(false);
  const [adv, setAdv] = useState<any>({ dateFrom: '', dateTo: '', valMin: '', valMax: '', status: '' });
  const [view, setView] = useState<'docs' | 'trail'>('docs');
  const statuses = Array.from(new Set(rows.map((r: any) => r.status).filter(Boolean)));
  const filtered = rows.filter((r: any) => {
    if (adv.dateFrom && (r.date || '') < adv.dateFrom) return false;
    if (adv.dateTo && (r.date || '') > adv.dateTo) return false;
    const v = Number(r.amount);
    if (adv.valMin !== '' && !(v >= Number(adv.valMin))) return false;
    if (adv.valMax !== '' && !(v <= Number(adv.valMax))) return false;
    if (adv.status && r.status !== adv.status) return false;
    return true;
  });
  const advActive = adv.dateFrom || adv.dateTo || adv.valMin !== '' || adv.valMax !== '' || adv.status;
  const expName = `documentos_${cat || 'todos'}`;
  const expTitle = `Document Center — ${cat || 'Todas as áreas'}`;
  const EXPORTS = [
    { label: 'PDF', icon: FileType2, color: '#B0392B', run: () => exportPDF(filtered, EXPORT_COLS, expName, expTitle) },
    { label: 'Excel', icon: FileSpreadsheet, color: '#0B4F5C', run: () => exportExcel(filtered, EXPORT_COLS, expName, expTitle) },
    { label: 'Word', icon: FileText, color: '#0B4F5C', run: () => exportWord(filtered, EXPORT_COLS, expName, expTitle) },
    { label: 'CSV', icon: FileDown, color: '#0B4F5C', run: () => exportCSV(filtered, EXPORT_COLS, expName) },
    { label: 'JSON', icon: FileJson, color: '#0B4F5C', run: () => exportJSON(filtered, EXPORT_COLS, expName) },
  ];

  // O repositório tem DUAS metades: os DOCUMENTOS (o que foi emitido) e o TRILHO
  // (tudo o que aconteceu — incluindo o que foi anulado/eliminado e porquê).
  if (view === 'trail') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex gap-1 px-3 pt-2 bg-[#EEF4F5] border-b border-[#7FA9B1]">
          <button onClick={() => setView('docs')}
            className="px-4 py-1.5 text-[12px] font-bold border border-b-0 bg-[#EEF4F5] text-gray-600 border-[#CFE3E6]">Documentos</button>
          <button className="px-4 py-1.5 text-[12px] font-bold border border-b-0 bg-white text-[#0B4F5C] border-[#7FA9B1]">
            Trilho de Auditoria (tudo o que aconteceu)
          </button>
        </div>
        <div className="flex-1 overflow-hidden"><AuditTrailView /></div>
      </div>
    );
  }

  return (
    <ClassicWindow title="Document Center — Repositório Documental" icon={<FolderArchive size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Todos os documentos de todos os módulos · pesquisa global (nº, cliente, mesa, quarto, valor) · {data?.count ?? 0} resultado(s)</div>}>
      <div className="flex flex-col h-full bg-[#F7FAFA]">
        <div className="flex gap-1 px-3 pt-2 bg-[#EEF4F5] border-b border-[#7FA9B1]">
          <button className="px-4 py-1.5 text-[12px] font-bold border border-b-0 bg-white text-[#0B4F5C] border-[#7FA9B1]">Documentos</button>
          <button onClick={() => setView('trail')}
            className="px-4 py-1.5 text-[12px] font-bold border border-b-0 bg-[#EEF4F5] text-gray-600 border-[#CFE3E6] hover:bg-[#F7FAFA]">
            Trilho de Auditoria (tudo o que aconteceu)
          </button>
        </div>
        {/* Dashboard */}
        <div className="flex flex-wrap gap-2 p-3 border-b border-[#CFE3E6] bg-[#F7FAFA]">
          {[['Emitidos hoje', dash?.total_today, '#5C8891'], ['Faturas', dash?.invoices, '#B0392B'], ['Vendas POS', dash?.pos_sales, '#0B4F5C'], ['Check-ins', dash?.checkins, '#5C8891'], ['Compras', dash?.purchases, '#5C8891'], ['Mov. Stock', dash?.stock_moves, '#5C8891'], ['Anulados', dash?.voided, '#5C8891']].map(([l, v, c]: any) => (
            <div key={l} className="bg-white border border-[#CFE3E6] px-3 py-1"><div className="text-[9px] uppercase text-gray-500">{l}</div><div className="text-lg font-bold" style={{ color: c }}>{v ?? 0}</div></div>
          ))}
        </div>
        {/* Pesquisa global */}
        <form className="flex items-center gap-2 p-2 border-b border-[#CFE3E6]" onSubmit={(e) => { e.preventDefault(); setQ(search); }}>
          <div className="flex items-center gap-1 bg-white border border-[#7FA9B1] px-2 flex-1 max-w-lg">
            <Search size={14} className="text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar: FT2026… · Mesa 12 · Quarto 405 · João Silva · Coca-Cola · valor…" className="flex-1 py-1.5 outline-none text-[12px]" />
          </div>
          <button type="submit" className="px-3 py-1.5 text-[12px] border border-[#7FA9B1] bg-gradient-to-b from-white to-[#EEF4F5] hover:to-[#EEF4F5]">Pesquisar</button>
          {q && <button type="button" className="text-[12px] text-[#5C8891] hover:underline" onClick={() => { setSearch(''); setQ(''); }}>limpar</button>}
          <button type="button" onClick={() => setShowAdv((s) => !s)} className={`px-3 py-1.5 text-[12px] border border-[#7FA9B1] flex items-center gap-1 ${advActive ? 'bg-[#F7FAFA] font-bold' : 'bg-gradient-to-b from-white to-[#EEF4F5]'}`}><SlidersHorizontal size={13} />Filtros{advActive ? ' •' : ''}</button>
          {/* Exportação multi-formato */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-gray-500 mr-1">Exportar:</span>
            {EXPORTS.map((ex) => (
              <button key={ex.label} type="button" onClick={ex.run} title={`Exportar em ${ex.label}`} disabled={!rows.length}
                className="flex flex-col items-center justify-center w-[54px] h-[46px] border border-[#CFE3E6] bg-gradient-to-b from-white to-[#F7FAFA] hover:to-[#EEF4F5] disabled:opacity-40 rounded-sm">
                <ex.icon size={20} style={{ color: ex.color }} strokeWidth={1.7} />
                <span className="text-[10px] mt-0.5 text-gray-700">{ex.label}</span>
              </button>
            ))}
            <button type="button" onClick={() => setShowRS((s) => !s)} title="Windows Reporting Services"
              className={`flex flex-col items-center justify-center w-[54px] h-[46px] border border-[#CFE3E6] rounded-sm ${reportServer ? 'bg-[#F7FAFA]' : 'bg-gradient-to-b from-white to-[#F7FAFA] hover:to-[#EEF4F5]'}`}>
              <Server size={20} className="text-[#5C8891]" strokeWidth={1.7} /><span className="text-[10px] mt-0.5 text-gray-700">Servidor</span>
            </button>
          </div>
        </form>
        {showAdv && (
          <div className="flex flex-wrap items-end gap-3 px-3 py-2 border-b border-[#CFE3E6] bg-[#F7FAFA] text-[11px]">
            <label className="flex flex-col text-gray-600">Data de<input type="date" value={adv.dateFrom} onChange={(e) => setAdv({ ...adv, dateFrom: e.target.value })} className="border border-[#7FA9B1] px-2 py-1" /></label>
            <label className="flex flex-col text-gray-600">Data até<input type="date" value={adv.dateTo} onChange={(e) => setAdv({ ...adv, dateTo: e.target.value })} className="border border-[#7FA9B1] px-2 py-1" /></label>
            <label className="flex flex-col text-gray-600">Valor mín.<input type="number" value={adv.valMin} onChange={(e) => setAdv({ ...adv, valMin: e.target.value })} className="border border-[#7FA9B1] px-2 py-1 w-24" /></label>
            <label className="flex flex-col text-gray-600">Valor máx.<input type="number" value={adv.valMax} onChange={(e) => setAdv({ ...adv, valMax: e.target.value })} className="border border-[#7FA9B1] px-2 py-1 w-24" /></label>
            <label className="flex flex-col text-gray-600">Estado<select value={adv.status} onChange={(e) => setAdv({ ...adv, status: e.target.value })} className="border border-[#7FA9B1] px-2 py-1 bg-white"><option value="">Todos</option>{statuses.map((s: any) => <option key={s} value={s}>{s}</option>)}</select></label>
            {advActive && <button onClick={() => setAdv({ dateFrom: '', dateTo: '', valMin: '', valMax: '', status: '' })} className="text-[#5C8891] hover:underline mb-1">limpar filtros</button>}
            <span className="text-gray-500 mb-1">{filtered.length} de {rows.length}</span>
          </div>
        )}
        {showRS && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#CFE3E6] bg-[#F7FAFA] text-[11px]">
            <Server size={13} className="text-[#5C8891]" />
            <span className="text-gray-700">Windows Reporting Services:</span>
            <input value={reportServer} onChange={(e) => setReportServer(e.target.value)} placeholder="http://servidor/ReportServer" className="border border-[#7FA9B1] px-2 py-1 w-72" />
            <button onClick={() => { localStorage.setItem('report_server_url', reportServer); aviso('Servidor de relatórios guardado.'); }} className="px-2 py-1 border border-[#7FA9B1] bg-white hover:bg-[#F7FAFA]">Guardar</button>
            {reportServer && <a href={reportServer} target="_blank" rel="noreferrer" className="text-[#5C8891] hover:underline">abrir servidor →</a>}
            <span className="text-gray-500 ml-1">Descarrega relatórios pesados para o servidor Windows, sem sobrecarregar o sistema.</span>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">
          {/* Pastas por área */}
          <div className="w-52 flex-shrink-0 bg-white border-r border-[#CFE3E6] overflow-auto py-1">
            <button onClick={() => setCat('')} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-[#F7FAFA] ${cat === '' ? 'bg-[#F7FAFA] font-bold' : ''}`}><Folder size={14} className="text-[#0B4F5C]" />Todos os documentos</button>
            {cats.map((c: any) => {
              const Icon = CAT_ICON[c.key] || Folder;
              return (
                <button key={c.key} onClick={() => setCat(c.key)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-[#F7FAFA] ${cat === c.key ? 'bg-[#F7FAFA] font-bold' : ''}`}>
                  <Icon size={14} style={{ color: CAT_COLOR[c.key] }} />{c.name}
                </button>
              );
            })}
          </div>
          {/* Resultados */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-[110px_1fr_1fr_110px_100px_90px] font-bold bg-[#F7FAFA] border-b border-[#EEF4F5] px-2 py-1 text-[12px] sticky top-0"><span>Documento</span><span>Tipo</span><span>Cliente / Ref.</span><span className="text-right">Valor</span><span>Data</span><span>Estado</span></div>
            {filtered.map((r: any, i: number) => {
              const Icon = CAT_ICON[r.category] || FileText;
              return (
                <div key={i} onClick={() => r.module && setSel({ module: r.module, id: r.ref })}
                  className="grid grid-cols-[110px_1fr_1fr_110px_100px_90px] px-2 py-1 border-b border-[#F7FAFA] text-[12px] items-center hover:bg-[#FFFFFF] cursor-pointer">
                  <span className="font-bold flex items-center gap-1.5"><Icon size={12} style={{ color: CAT_COLOR[r.category] }} />{r.number}</span>
                  <span className="text-gray-700">{r.doc_type}</span>
                  <span className="truncate">{r.party || '—'}</span>
                  <span className="text-right">{money(r.amount)}</span>
                  <span>{r.date || '—'}</span>
                  <span className="truncate">{r.status || '—'}</span>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="px-3 py-6 text-gray-500 text-center text-[12px]">Sem documentos para este filtro/pesquisa.</div>}
          </div>
        </div>
      </div>
      {sel && <DocDetail sel={sel} onClose={() => setSel(null)} onOpen={(s) => setSel(s)} />}
    </ClassicWindow>
  );
}

function DocDetail({ sel, onClose, onOpen }: { sel: { module: string; id: string }; onClose: () => void; onOpen: (s: { module: string; id: string }) => void }) {
  const { data } = useQuery({ queryKey: ['doc-links', sel.module, sel.id], queryFn: async () => (await apiClient.get('documents/links/', { params: sel })).data });
  const det = data?.detail || {};
  const links = data?.links || [];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-[560px] max-h-[85vh] bg-white border border-[#5C8891] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="h-8 flex items-center justify-between px-2 bg-[#5C8891] text-white text-[13px] font-semibold flex-shrink-0">
          <span className="flex items-center gap-2"><FileText size={14} />{det.title || 'Documento'}</span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center hover:bg-white/20"><X size={14} /></button>
        </div>
        <div className="p-4 overflow-auto text-[12px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-3">
            {Object.entries(det.fields || {}).map(([k, v]: any) => (
              <div key={k} className="flex justify-between border-b border-[#F7FAFA] py-0.5"><span className="text-gray-500">{k}</span><span className="font-semibold text-right">{String(v)}</span></div>
            ))}
          </div>
          {det.items?.length ? (
            <div className="mb-3"><div className="text-[11px] font-bold text-[#5C8891] uppercase mb-1">Itens</div>
              <div className="bg-[#F7FAFA] border border-[#EEF4F5] p-2 space-y-0.5">{det.items.map((it: string, i: number) => <div key={i}>{it}</div>)}</div>
            </div>
          ) : null}
          {sel.module === 'fiscal' && det.printable && (
            <button onClick={() => printFiscalInvoice(Number(sel.id), false)} className="mb-3 px-3 py-1.5 border border-[#7FA9B1] bg-gradient-to-b from-white to-[#EEF4F5] hover:to-[#EEF4F5] flex items-center gap-1.5"><Printer size={13} />Imprimir documento</button>
          )}
          <div className="text-[11px] font-bold text-[#5C8891] uppercase mb-1 flex items-center gap-1"><Link2 size={13} />Documentos ligados ({links.length})</div>
          {links.length === 0 && <div className="text-gray-500">Sem ligações.</div>}
          {links.map((l: any, i: number) => (
            <button key={i} disabled={!l.module} onClick={() => l.module && onOpen({ module: l.module, id: l.id })}
              className={`w-full flex items-center justify-between px-2 py-1.5 border border-[#EEF4F5] mb-1 text-left ${l.module ? 'hover:bg-[#F7FAFA] cursor-pointer' : 'opacity-70'}`}>
              <span className="flex items-center gap-2"><span className="w-1.5 h-6 rounded" style={{ background: CAT_COLOR[l.category] || '#5C8891' }} /><b>{l.label}</b> · {l.number}</span>
              <span>{l.amount != null ? money(l.amount) : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
