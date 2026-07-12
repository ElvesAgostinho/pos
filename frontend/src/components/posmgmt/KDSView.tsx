import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChefHat, Clock, Printer as PrinterIcon, Utensils } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useKDS, useAdvanceKDS } from '../../hooks/usePosMgmt';
import { KDS_STATIONS } from '../../api/posmgmt';

/**
 * MONITOR DE COZINHA — o ecrã do cozinheiro.
 *
 * Desenhado para ser lido de PÉ, a dois metros, com as mãos ocupadas: letra grande,
 * botões grandes, e a informação que decide o que se faz a seguir sempre no mesmo sítio.
 *
 * Agrupa POR MESA de propósito: os pratos da mesma mesa têm de sair ao mesmo tempo.
 * Um KDS que mostra pratos soltos faz o empregado levar a sopa enquanto o bife ainda
 * está na grelha — e é assim que se estraga o serviço.
 *
 * O relógio de cada pedido conta desde que ele entrou. Passa a amarelo aos 10 minutos
 * e a vermelho aos 15: é o único número que interessa à cozinha.
 */

const ESTADOS: Record<string, { label: string; cor: string; fundo: string; borda: string }> = {
  FIRED: { label: 'Em espera', cor: '#f59e0b', fundo: '#fffbeb', borda: '#f59e0b' },
  PREPARING: { label: 'A preparar', cor: '#2563eb', fundo: '#eff6ff', borda: '#2563eb' },
  READY: { label: 'Pronto', cor: '#16a34a', fundo: '#f0fdf4', borda: '#16a34a' },
  CANCELLED: { label: 'ANULADO', cor: '#b91c1c', fundo: '#fef2f2', borda: '#b91c1c' },
};

/** Que botão avança este estado (e como se chama para o cozinheiro). */
const AVANCO: Record<string, { label: string; cor: string }> = {
  FIRED: { label: 'Iniciar', cor: '#2563eb' },
  PREPARING: { label: 'Pronto', cor: '#16a34a' },
  READY: { label: 'Entregue', cor: '#334155' },
  CANCELLED: { label: 'Confirmar anulação', cor: '#b91c1c' },
};

interface KDSProps { fixedStation?: string; title?: string }

export default function KDSView({ fixedStation, title }: KDSProps = {}) {
  const [station, setStation] = useState(fixedStation || 'KITCHEN');
  const { data: queue = [] } = useKDS(station);
  const advance = useAdvanceKDS();
  const [agora, setAgora] = useState(Date.now());

  // O relógio anda: os minutos de espera são o que a cozinha vê primeiro.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // A configuração do monitor manda no ecrã (botões, alergénios, agrupamento).
  const { data: monitores = [] } = useQuery({
    queryKey: ['kds', 'monitors', station],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/config/kds-monitors/', { params: { station } });
        return r.data || [];
      } catch { return []; }
    },
  });
  const mon: any = (monitores as any[])[0] || null;
  const opts = mon?.options || { show_allergens: true, show_timer: true, alert_late: true, group_by_table: true };
  const btns: string[] = mon?.buttons || ['PRODUCTION', 'FINISHED', 'DELIVERED', 'PRINT'];
  const porPedido = mon ? mon.kind === 'ORDER' : true;

  const mins = (t?: string | null) => (t ? Math.floor((agora - new Date(t).getTime()) / 60000) : 0);

  /** Agrupa as linhas por PEDIDO (mesa/quarto/destino). */
  const pedidos = useMemo(() => {
    const g = new Map<string, any>();
    (queue as any[]).forEach((l) => {
      const key = porPedido ? (l.ticket_number || String(l.id)) : String(l.id);
      if (!g.has(key)) {
        g.set(key, {
          key,
          destino: l.dest_label || (l.table_label ? `Mesa ${l.table_label}` : l.ticket_number),
          guests: l.guests,
          operador: l.operator_name,
          fired_at: l.fired_at,
          linhas: [],
        });
      }
      const p = g.get(key);
      p.linhas.push(l);
      // O relógio do pedido é o do item que espera há MAIS tempo.
      if (l.fired_at && (!p.fired_at || new Date(l.fired_at) < new Date(p.fired_at))) p.fired_at = l.fired_at;
    });
    return Array.from(g.values()).sort((a, b) =>
      new Date(a.fired_at || 0).getTime() - new Date(b.fired_at || 0).getTime());
  }, [queue, porPedido]);

  const contar = (st: string) => (queue as any[]).filter((l) => l.kds_status === st).length;
  const atrasados = (queue as any[]).filter((l) => l.kds_status !== 'CANCELLED' && mins(l.fired_at) >= 15).length;

  return (
    <div className="h-full flex flex-col" style={{ background: '#0f172a', color: '#e2e8f0' }}>
      {/* Barra de topo */}
      <div className="flex items-center gap-4 px-5 py-3 flex-shrink-0" style={{ background: '#1e293b', borderBottom: '2px solid #334155' }}>
        <ChefHat size={26} className="text-amber-400" />
        <div>
          <div className="text-[18px] font-black leading-tight">
            {mon?.header_text || title || 'Monitor de Cozinha'}
          </div>
          <div className="text-[12px] text-slate-400">
            {KDS_STATIONS.find((s) => s.value === station)?.label || station}
            {mon && <> · {mon.name} · {porPedido ? 'por pedido' : 'por artigo'}</>}
          </div>
        </div>

        {/* Contadores */}
        <div className="ml-auto flex items-center gap-3">
          {[['FIRED', contar('FIRED')], ['PREPARING', contar('PREPARING')], ['READY', contar('READY')]].map(([st, n]) => (
            <div key={String(st)} className="px-4 py-1.5 rounded-lg text-center min-w-[92px]"
              style={{ background: '#0f172a', border: `2px solid ${ESTADOS[String(st)].cor}` }}>
              <div className="text-[22px] font-black leading-none" style={{ color: ESTADOS[String(st)].cor }}>{String(n)}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">{ESTADOS[String(st)].label}</div>
            </div>
          ))}
          {atrasados > 0 && (
            <div className="px-4 py-1.5 rounded-lg text-center min-w-[92px] animate-pulse"
              style={{ background: '#7f1d1d', border: '2px solid #dc2626' }}>
              <div className="text-[22px] font-black leading-none text-white">{atrasados}</div>
              <div className="text-[10px] uppercase tracking-wide text-red-200 mt-0.5">Atrasados</div>
            </div>
          )}
          <div className="text-[26px] font-black tabular-nums text-slate-300 pl-2">
            {new Date(agora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Estações (só quando o display não é fixo) */}
      {!fixedStation && (
        <div className="flex gap-1 px-4 pt-2 flex-shrink-0">
          {KDS_STATIONS.map((s) => (
            <button key={s.value} onClick={() => setStation(s.value)}
              className={`px-5 py-2 text-[13px] font-bold rounded-t-lg ${station === s.value
                ? 'bg-[#1e293b] text-white' : 'bg-[#0b1120] text-slate-500 hover:text-slate-300'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Fila */}
      <div className="flex-1 overflow-y-auto p-4 grid gap-4 content-start"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {pedidos.map((p) => {
          const m = mins(p.fired_at);
          const anulado = p.linhas.some((l: any) => l.kds_status === 'CANCELLED');
          const atrasado = opts.alert_late && !anulado && m >= 15;
          const estadoPedido = p.linhas.every((l: any) => l.kds_status === 'READY') ? 'READY'
            : p.linhas.some((l: any) => l.kds_status === 'PREPARING') ? 'PREPARING' : 'FIRED';
          const av = AVANCO[anulado ? 'CANCELLED' : estadoPedido];

          return (
            <div key={p.key} className={`rounded-xl overflow-hidden flex flex-col ${atrasado ? 'animate-pulse' : ''}`}
              style={{
                background: '#ffffff',
                border: `3px solid ${anulado ? '#b91c1c' : atrasado ? '#dc2626' : ESTADOS[estadoPedido].borda}`,
                boxShadow: '0 8px 20px rgba(0,0,0,.35)',
              }}>
              {/* Cabeçalho do pedido */}
              <div className="flex items-center justify-between px-3 py-2"
                style={{ background: anulado ? '#b91c1c' : ESTADOS[estadoPedido].borda, color: '#fff' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Utensils size={16} className="flex-shrink-0" />
                  <span className="text-[17px] font-black truncate">{p.destino}</span>
                  {p.guests ? <span className="text-[12px] opacity-90">· {p.guests}p</span> : null}
                </div>
                {opts.show_timer && (
                  <span className="flex items-center gap-1 text-[15px] font-black tabular-nums px-2 py-0.5 rounded"
                    style={{ background: 'rgba(0,0,0,.25)' }}>
                    <Clock size={14} />{m}m{atrasado ? ' ⚠' : ''}
                  </span>
                )}
              </div>

              {anulado && (
                <div className="bg-[#7f1d1d] text-white text-[13px] font-black px-3 py-1.5 flex items-center gap-2 uppercase tracking-wide">
                  <AlertTriangle size={16} /> Anulado — não preparar
                </div>
              )}

              {/* Artigos */}
              <div className="flex-1 p-3 space-y-2.5">
                {p.linhas.map((l: any) => {
                  const cancelada = l.kds_status === 'CANCELLED';
                  const alerg: string[] = l.allergens || [];
                  return (
                    <div key={l.id} className="pb-2 border-b border-slate-200 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <span className="text-[20px] font-black text-slate-900 leading-tight flex-shrink-0">
                          {Number(l.quantity).toFixed(0)}×
                        </span>
                        <span className={`text-[17px] font-bold text-slate-900 leading-tight ${cancelada ? 'line-through opacity-60' : ''}`}>
                          {l.item_name}
                        </span>
                        {!porPedido && (
                          <span className="ml-auto text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: ESTADOS[l.kds_status]?.fundo, color: ESTADOS[l.kds_status]?.cor }}>
                            {ESTADOS[l.kds_status]?.label}
                          </span>
                        )}
                      </div>

                      {l.note && (
                        <div className="mt-1 text-[14px] font-bold text-red-700 bg-red-50 border-l-4 border-red-600 px-2 py-1">
                          » {l.note}
                        </div>
                      )}
                      {cancelada && l.void_reason && (
                        <div className="mt-1 text-[13px] font-bold text-[#b91c1c]">Motivo: {l.void_reason}</div>
                      )}
                      {opts.show_allergens && alerg.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1.5 bg-[#b91c1c] text-white text-[12px] font-black px-2 py-1 rounded">
                          <AlertTriangle size={14} className="flex-shrink-0" />
                          ALERGÉNIOS: {alerg.join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rodapé + ações */}
              <div className="px-3 pb-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                  <span className="font-bold uppercase tracking-wide"
                    style={{ color: anulado ? '#b91c1c' : ESTADOS[estadoPedido].cor }}>
                    {anulado ? 'Anulado' : ESTADOS[estadoPedido].label}
                  </span>
                  {p.operador && <span>{p.operador}</span>}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => p.linhas.forEach((l: any) => advance.mutate(l.id))}
                    className="flex-1 py-3.5 text-white text-[16px] font-black rounded-lg active:scale-[.98] transition-transform"
                    style={{ background: av.cor }}>
                    {av.label}
                    {porPedido && p.linhas.length > 1 && !anulado && (
                      <span className="text-[12px] font-bold opacity-80"> · {p.linhas.length} artigos</span>
                    )}
                  </button>

                  {btns.includes('PRINT') && !anulado && (
                    <button title="Reimprimir a comanda"
                      onClick={() => apiClient.post('pos/print-jobs/', {
                        job_type: station === 'BAR' ? 'BAR' : 'KITCHEN',
                        target: station, title: `Comanda ${p.destino}`,
                        content: p.linhas.map((l: any) => `${Number(l.quantity).toFixed(0)}x ${l.item_name}`).join('\n'),
                        reference: p.key,
                      }).catch(() => {})}
                      className="w-[54px] rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95">
                      <PrinterIcon size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {pedidos.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-500">
            <ChefHat size={52} className="mb-3 opacity-40" />
            <div className="text-[18px] font-bold">Sem pedidos nesta estação.</div>
            <div className="text-[13px] mt-1">Assim que a sala enviar um pedido, ele aparece aqui.</div>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-3 px-5 py-2 text-[12px] flex-shrink-0"
        style={{ background: '#1e293b', borderTop: '2px solid #334155', color: '#94a3b8' }}>
        <span>{pedidos.length} pedido(s) · {(queue as any[]).length} artigo(s)</span>
        <span className="opacity-40">|</span>
        <span>Atualiza sozinho</span>
        {mon?.footer_notifications && (
          <span className="ml-auto font-bold text-amber-300">{mon.footer_notifications}</span>
        )}
        {!mon && (
          <span className="ml-auto text-amber-300">
            Sem monitor configurado — a usar as opções por defeito. Configure em Configuração POS → Outros → Monitores de cozinha.
          </span>
        )}
      </div>
    </div>
  );
}
