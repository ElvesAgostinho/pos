import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { Archive, Search, AlertTriangle, Eye, Trash2, FileDown, Plus, Pencil, Ban } from 'lucide-react';
import { apiClient } from '../../api/client';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const when = (v: any) => new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const ACTION: Record<string, { label: string; bg: string; icon: any }> = {
  CREATE: { label: 'Criado', bg: '#1f7a34', icon: Plus },
  UPDATE: { label: 'Alterado', bg: '#1565c0', icon: Pencil },
  DELETE: { label: 'ELIMINADO', bg: '#7a1f1f', icon: Trash2 },
  VOID: { label: 'ANULADO', bg: '#a01818', icon: Ban },
  VIEW: { label: 'Consultado', bg: '#6b7280', icon: Eye },
  EXPORT: { label: 'Exportado', bg: '#b5651d', icon: FileDown },
  DENIED: { label: 'Acesso recusado', bg: '#8a1a1a', icon: AlertTriangle },
  LOGIN: { label: 'Entrada', bg: '#334155', icon: Eye },
  SUBMIT: { label: 'Comunicado à AGT', bg: '#0e7490', icon: FileDown },
  PRINT: { label: 'Impresso', bg: '#475569', icon: FileDown },
};

function Panel({ title, children, right }: any) {
  return (
    <div className="bg-white border border-[#9aa6b6]" style={{ boxShadow: 'inset 0 1px 0 #fff, 0 1px 3px rgba(0,0,0,0.10)' }}>
      <div className="px-3 py-1.5 border-b border-[#c0c7d0] flex items-center justify-between text-[12px] font-bold text-[#25405e]"
        style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>
        <span>{title}</span>{right}
      </div>
      <div className="p-0">{children}</div>
    </div>
  );
}

/**
 * REPOSITÓRIO & PESQUISA GLOBAL — tudo o que aconteceu no sistema, sem exceção.
 * Criações, alterações, ELIMINAÇÕES, ANULAÇÕES (com o motivo), consultas, exportações,
 * acessos recusados — capturado automaticamente, incluindo o que foi anulado na
 * cozinha, no bar e na pastelaria. Nada se apaga daqui.
 */
export default function AuditTrailView() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<{ action?: string; module?: string; destructive?: boolean }>({});
  const [sel, setSel] = useState<any>(null);

  const { data: ov } = useQuery({
    queryKey: ['audit', 'overview'],
    queryFn: async () => (await apiClient.get('platform/audit/overview/')).data,
    refetchInterval: 30000,
  });
  const { data: events = [] } = useQuery({
    queryKey: ['audit', 'events', q, filter],
    queryFn: async () => {
      const params: any = { ...filter };
      if (filter.destructive) params.destructive = 1;
      if (q.length >= 2) params.q = q;
      const r = await apiClient.get('platform/audit/events/', { params });
      return r.data?.results || r.data || [];
    },
  });

  const Kpi = ({ label, value, color, onClick, active }: any) => (
    <button onClick={onClick}
      className={`flex-1 bg-white border px-3 py-2 text-left ${active ? 'border-[#2f5f92] ring-1 ring-[#2f5f92]' : 'border-[#9aa6b6]'}`}
      style={{ boxShadow: 'inset 0 1px 0 #fff' }}>
      <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wide">{label}</div>
      <div className="text-[20px] font-black leading-tight" style={{ color: color || '#25405e' }}>{value ?? 0}</div>
    </button>
  );

  const c24 = ov?.last_24h || {};

  return (
    <ClassicWindow title="Repositório & Pesquisa Global — Trilho de Auditoria" icon={<Archive size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{ov?.total_events ?? 0} acontecimentos registados · captura automática · nada se apaga deste trilho</div>}>
      <div className="h-full flex flex-col bg-[#dfe3e8] overflow-auto p-3 gap-3">

        {/* Pesquisa global */}
        <div className="bg-white border border-[#9aa6b6] p-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-[#25405e]" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar em TUDO — fatura, hóspede, quarto, comanda anulada, quem eliminou o quê, motivo…"
              className="flex-1 border border-[#8a95a3] px-3 py-1.5 text-[13px] outline-none focus:border-[#2f5f92]"
              style={{ boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.12)' }} />
            {(q || filter.action || filter.destructive) && (
              <button onClick={() => { setQ(''); setFilter({}); }}
                className="text-[11px] font-bold text-[#a01818] hover:underline">Limpar</button>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Procura no histórico completo do sistema: o que foi criado, alterado, eliminado, anulado (e porquê), consultado e exportado.
          </div>
        </div>

        {/* Pulso do sistema — últimas 24h */}
        <div className="flex gap-2">
          <Kpi label="Criados (24h)" value={c24.CREATE} color="#1f7a34"
            onClick={() => setFilter({ action: 'CREATE' })} active={filter.action === 'CREATE'} />
          <Kpi label="Alterados (24h)" value={c24.UPDATE} color="#1565c0"
            onClick={() => setFilter({ action: 'UPDATE' })} active={filter.action === 'UPDATE'} />
          <Kpi label="ANULADOS (24h)" value={c24.VOID} color="#a01818"
            onClick={() => setFilter({ action: 'VOID' })} active={filter.action === 'VOID'} />
          <Kpi label="ELIMINADOS (24h)" value={c24.DELETE} color="#7a1f1f"
            onClick={() => setFilter({ action: 'DELETE' })} active={filter.action === 'DELETE'} />
          <Kpi label="Consultas (24h)" value={c24.VIEW} color="#6b7280"
            onClick={() => setFilter({ action: 'VIEW' })} active={filter.action === 'VIEW'} />
          <Kpi label="Exportações (24h)" value={c24.EXPORT} color="#b5651d"
            onClick={() => setFilter({ action: 'EXPORT' })} active={filter.action === 'EXPORT'} />
          <Kpi label="Acessos recusados" value={c24.DENIED} color="#8a1a1a"
            onClick={() => setFilter({ action: 'DENIED' })} active={filter.action === 'DENIED'} />
          <Kpi label="Valor anulado (7d)" value={money(ov?.destructive_value)} color="#a01818"
            onClick={() => setFilter({ destructive: true })} active={!!filter.destructive} />
        </div>

        {/* Por área/departamento */}
        <Panel title="Atividade por área e departamento (7 dias)">
          <div className="p-3 flex flex-wrap gap-2">
            {(ov?.by_module || []).map((m: any) => (
              <button key={`${m.module}-${m.area}`} onClick={() => setFilter({ module: m.module })}
                className={`px-2.5 py-1.5 border text-[11px] text-left ${filter.module === m.module ? 'bg-[#e6f0fa] border-[#2f5f92]' : 'bg-[#f7f9fb] border-[#c0c7d0] hover:bg-[#eef2f6]'}`}>
                <div className="font-bold text-[#25405e]">{m.module}</div>
                <div className="text-gray-500">{m.area || '—'} · <b>{m.n}</b> acontecimentos</div>
              </button>
            ))}
            {!(ov?.by_module || []).length && <span className="text-gray-400 text-[12px]">Sem atividade nos últimos 7 dias.</span>}
          </div>
        </Panel>

        {/* Trilho */}
        <Panel title="Trilho de acontecimentos"
          right={<span className="text-[11px] font-normal text-gray-500">{events.length} registo(s) · clique para ver o que mudou</span>}>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-[#25405e] bg-[#f2f5f8]">
                {['Quando', 'Ação', 'Módulo', 'Área', 'Registo', 'Quem', 'Motivo', 'Valor'].map((h) => (
                  <th key={h} className="text-left font-bold px-2 py-1 border-b border-[#c0c7d0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => {
                const a = ACTION[e.action] || { label: e.action, bg: '#6b7280', icon: Eye };
                const I = a.icon;
                const bad = e.action === 'VOID' || e.action === 'DELETE' || e.action === 'DENIED';
                return (
                  <tr key={e.id} onClick={() => setSel(e)}
                    className={`border-b border-[#e6e9ed] cursor-pointer hover:bg-[#f2f5f8] ${bad ? 'bg-[#fdf3f3]' : ''}`}>
                    <td className="px-2 py-1 font-mono text-[11px] whitespace-nowrap">{when(e.at)}</td>
                    <td className="px-2 py-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: a.bg }}>
                        <I size={10} />{a.label}
                      </span>
                    </td>
                    <td className="px-2 py-1">{e.module}</td>
                    <td className="px-2 py-1 font-bold text-[#25405e]">{e.area || '—'}</td>
                    <td className="px-2 py-1">{e.label}</td>
                    <td className="px-2 py-1 text-gray-600">{e.user || '—'}</td>
                    <td className="px-2 py-1 text-[#a01818]">{e.reason || ''}</td>
                    <td className="px-2 py-1 font-mono text-right">{e.amount ? money(e.amount) : ''}</td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">
                  {q ? 'Nada encontrado no histórico do sistema.' : 'Sem acontecimentos.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </Panel>

        {/* O que mudou, exatamente */}
        {sel && (
          <Panel title={`${ACTION[sel.action]?.label || sel.action} · ${sel.label}`}
            right={<button onClick={() => setSel(null)} className="text-[16px] leading-none text-gray-500 hover:text-black">×</button>}>
            <div className="p-3 text-[11px]">
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div><span className="text-gray-500">Quando:</span> <b>{when(sel.at)}</b></div>
                <div><span className="text-gray-500">Quem:</span> <b>{sel.user || '—'}</b></div>
                <div><span className="text-gray-500">De onde:</span> <b>{sel.ip_address || '—'}</b></div>
                <div><span className="text-gray-500">Registo:</span> <b>{sel.entity} #{sel.entity_id}</b></div>
              </div>
              {sel.reason && <div className="mb-2 p-2 bg-[#fdeaea] border border-[#e0a0a0] text-[#a01818] font-bold">Motivo: {sel.reason}</div>}
              {sel.changes ? (
                <table className="w-full border-collapse">
                  <thead><tr className="bg-[#f2f5f8] text-[#25405e]">
                    <th className="text-left px-2 py-1 border-b border-[#c0c7d0] font-bold">Campo</th>
                    <th className="text-left px-2 py-1 border-b border-[#c0c7d0] font-bold">Antes</th>
                    <th className="text-left px-2 py-1 border-b border-[#c0c7d0] font-bold">Depois</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(sel.changes).map(([k, v]: any) => (
                      <tr key={k} className="border-b border-[#e6e9ed]">
                        <td className="px-2 py-1 font-bold">{k}</td>
                        <td className="px-2 py-1 text-gray-600">{String(v?.antes ?? (typeof v === 'object' ? JSON.stringify(v) : v))}</td>
                        <td className="px-2 py-1 text-[#25405e] font-bold">{String(v?.depois ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="text-gray-500">Sem detalhe de alterações.</div>}
            </div>
          </Panel>
        )}
      </div>
    </ClassicWindow>
  );
}
