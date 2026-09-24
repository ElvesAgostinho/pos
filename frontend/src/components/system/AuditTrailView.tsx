import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { Archive, Search, AlertTriangle, Eye, Trash2, FileDown, Plus, Pencil, Ban } from 'lucide-react';
import { apiClient } from '../../api/client';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const when = (v: any) => new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const ACTION: Record<string, { label: string; bg: string; icon: any }> = {
  CREATE: { label: 'Criado', bg: '#062A31', icon: Plus },
  UPDATE: { label: 'Alterado', bg: '#5C8891', icon: Pencil },
  DELETE: { label: 'ELIMINADO', bg: '#8C2B1F', icon: Trash2 },
  VOID: { label: 'ANULADO', bg: '#B0392B', icon: Ban },
  VIEW: { label: 'Consultado', bg: '#5C8891', icon: Eye },
  EXPORT: { label: 'Exportado', bg: '#5C8891', icon: FileDown },
  DENIED: { label: 'Acesso recusado', bg: '#8C2B1F', icon: AlertTriangle },
  LOGIN: { label: 'Entrada', bg: '#062A31', icon: Eye },
  SUBMIT: { label: 'Comunicado à AGT', bg: '#062A31', icon: FileDown },
  PRINT: { label: 'Impresso', bg: '#062A31', icon: FileDown },
};

function Panel({ title, children, right }: any) {
  return (
    <div className="bg-white border border-[#7FA9B1]" style={{ boxShadow: 'inset 0 1px 0 #FFFFFF, 0 1px 3px rgba(0,0,0,0.10)' }}>
      <div className="px-3 py-1.5 border-b border-[#CFE3E6] flex items-center justify-between text-[12px] font-bold text-[#062A31]"
        style={{ background: 'linear-gradient(to bottom, #FFFFFF, #F7FAFA)' }}>
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
      className={`flex-1 bg-white border px-3 py-2 text-left ${active ? 'border-[#062A31] ring-1 ring-[#062A31]' : 'border-[#7FA9B1]'}`}
      style={{ boxShadow: 'inset 0 1px 0 #FFFFFF' }}>
      <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wide">{label}</div>
      <div className="text-[20px] font-black leading-tight" style={{ color: color || '#062A31' }}>{value ?? 0}</div>
    </button>
  );

  const c24 = ov?.last_24h || {};

  return (
    <ClassicWindow title="Repositório & Pesquisa Global — Trilho de Auditoria" icon={<Archive size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{ov?.total_events ?? 0} acontecimentos registados · captura automática · nada se apaga deste trilho</div>}>
      <div className="h-full flex flex-col bg-[#EEF4F5] overflow-auto p-3 gap-3">

        {/* Pesquisa global */}
        <div className="bg-white border border-[#7FA9B1] p-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-[#062A31]" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar em TUDO — fatura, hóspede, quarto, comanda anulada, quem eliminou o quê, motivo…"
              className="flex-1 border border-[#7FA9B1] px-3 py-1.5 text-[13px] outline-none focus:border-[#062A31]"
              style={{ boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.12)' }} />
            {(q || filter.action || filter.destructive) && (
              <button onClick={() => { setQ(''); setFilter({}); }}
                className="text-[11px] font-bold text-[#B0392B] hover:underline">Limpar</button>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Procura no histórico completo do sistema: o que foi criado, alterado, eliminado, anulado (e porquê), consultado e exportado.
          </div>
        </div>

        {/* Pulso do sistema — últimas 24h */}
        <div className="flex gap-2">
          <Kpi label="Criados (24h)" value={c24.CREATE} color="#062A31"
            onClick={() => setFilter({ action: 'CREATE' })} active={filter.action === 'CREATE'} />
          <Kpi label="Alterados (24h)" value={c24.UPDATE} color="#5C8891"
            onClick={() => setFilter({ action: 'UPDATE' })} active={filter.action === 'UPDATE'} />
          <Kpi label="ANULADOS (24h)" value={c24.VOID} color="#B0392B"
            onClick={() => setFilter({ action: 'VOID' })} active={filter.action === 'VOID'} />
          <Kpi label="ELIMINADOS (24h)" value={c24.DELETE} color="#8C2B1F"
            onClick={() => setFilter({ action: 'DELETE' })} active={filter.action === 'DELETE'} />
          <Kpi label="Consultas (24h)" value={c24.VIEW} color="#5C8891"
            onClick={() => setFilter({ action: 'VIEW' })} active={filter.action === 'VIEW'} />
          <Kpi label="Exportações (24h)" value={c24.EXPORT} color="#5C8891"
            onClick={() => setFilter({ action: 'EXPORT' })} active={filter.action === 'EXPORT'} />
          <Kpi label="Acessos recusados" value={c24.DENIED} color="#8C2B1F"
            onClick={() => setFilter({ action: 'DENIED' })} active={filter.action === 'DENIED'} />
          <Kpi label="Valor anulado (7d)" value={money(ov?.destructive_value)} color="#B0392B"
            onClick={() => setFilter({ destructive: true })} active={!!filter.destructive} />
        </div>

        {/* Por área/departamento */}
        <Panel title="Atividade por área e departamento (7 dias)">
          <div className="p-3 flex flex-wrap gap-2">
            {(ov?.by_module || []).map((m: any) => (
              <button key={`${m.module}-${m.area}`} onClick={() => setFilter({ module: m.module })}
                className={`px-2.5 py-1.5 border text-[11px] text-left ${filter.module === m.module ? 'bg-[#F7FAFA] border-[#062A31]' : 'bg-[#FFFFFF] border-[#CFE3E6] hover:bg-[#F7FAFA]'}`}>
                <div className="font-bold text-[#062A31]">{m.module}</div>
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
              <tr className="text-[#062A31] bg-[#F7FAFA]">
                {['Quando', 'Ação', 'Módulo', 'Área', 'Registo', 'Quem', 'Motivo', 'Valor'].map((h) => (
                  <th key={h} className="text-left font-bold px-2 py-1 border-b border-[#CFE3E6]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => {
                const a = ACTION[e.action] || { label: e.action, bg: '#5C8891', icon: Eye };
                const I = a.icon;
                const bad = e.action === 'VOID' || e.action === 'DELETE' || e.action === 'DENIED';
                return (
                  <tr key={e.id} onClick={() => setSel(e)}
                    className={`border-b border-[#F7FAFA] cursor-pointer hover:bg-[#F7FAFA] ${bad ? 'bg-[#FFFFFF]' : ''}`}>
                    <td className="px-2 py-1 font-mono text-[11px] whitespace-nowrap">{when(e.at)}</td>
                    <td className="px-2 py-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: a.bg }}>
                        <I size={10} />{a.label}
                      </span>
                    </td>
                    <td className="px-2 py-1">{e.module}</td>
                    <td className="px-2 py-1 font-bold text-[#062A31]">{e.area || '—'}</td>
                    <td className="px-2 py-1">{e.label}</td>
                    <td className="px-2 py-1 text-gray-600">{e.user || '—'}</td>
                    <td className="px-2 py-1 text-[#B0392B]">{e.reason || ''}</td>
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
              {sel.reason && <div className="mb-2 p-2 bg-[#F7FAFA] border border-[#B0392B] text-[#B0392B] font-bold">Motivo: {sel.reason}</div>}
              {sel.changes ? (
                <table className="w-full border-collapse">
                  <thead><tr className="bg-[#F7FAFA] text-[#062A31]">
                    <th className="text-left px-2 py-1 border-b border-[#CFE3E6] font-bold">Campo</th>
                    <th className="text-left px-2 py-1 border-b border-[#CFE3E6] font-bold">Antes</th>
                    <th className="text-left px-2 py-1 border-b border-[#CFE3E6] font-bold">Depois</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(sel.changes).map(([k, v]: any) => (
                      <tr key={k} className="border-b border-[#F7FAFA]">
                        <td className="px-2 py-1 font-bold">{k}</td>
                        <td className="px-2 py-1 text-gray-600">{String(v?.antes ?? (typeof v === 'object' ? JSON.stringify(v) : v))}</td>
                        <td className="px-2 py-1 text-[#062A31] font-bold">{String(v?.depois ?? '')}</td>
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
