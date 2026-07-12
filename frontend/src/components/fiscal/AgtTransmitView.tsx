import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Send, RefreshCw, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, Clock, XCircle, Radio } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const when = (v: any) => (v ? new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Panel({ title, children, right }: any) {
  return (
    <div className="bg-white border border-[#9aa6b6]" style={{ boxShadow: 'inset 0 1px 0 #fff, 0 1px 3px rgba(0,0,0,0.12)' }}>
      <div className="px-3 py-1.5 border-b border-[#c0c7d0] flex items-center justify-between text-[12px] font-bold text-[#25405e]"
        style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>
        <span>{title}</span>{right}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const btn = 'px-3 py-1.5 text-[11px] font-semibold border border-[#7f8b9b] text-[#2a3543] flex items-center gap-1.5';
const btnStyle = {
  background: 'linear-gradient(to bottom, #fdfdfd, #eceef1 48%, #dde1e6 52%, #cfd4da)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.18)',
};

const STATUS: Record<string, { label: string; bg: string; icon: any }> = {
  QUEUED: { label: 'Em fila', bg: '#6b7280', icon: Clock },
  SENDING: { label: 'A enviar', bg: '#1565c0', icon: Send },
  RETRY: { label: 'A reenviar', bg: '#b5651d', icon: RefreshCw },
  ACK: { label: 'Aceite pela AGT', bg: '#1f7a34', icon: CheckCircle2 },
  REJECTED: { label: 'Rejeitado', bg: '#a01818', icon: XCircle },
  FAILED: { label: 'Falhou', bg: '#7a1f1f', icon: AlertTriangle },
  SENT: { label: 'Enviado', bg: '#1565c0', icon: Send },
};

/**
 * CENTRO DE TRANSMISSÃO AGT — faturação eletrónica enviada diretamente à AGT.
 * A venda nunca espera: o documento é emitido e entra em fila; o transmissor envia-o
 * assim que houver linha, com reenvio automático e chave de idempotência (nunca duplica).
 */
export default function AgtTransmitView() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ['agt', 'transmit'],
    queryFn: async () => (await apiClient.get('fiscal/agt/transmit/')).data,
    refetchInterval: 15000,
  });
  const { data: subs = [] } = useQuery({
    queryKey: ['agt', 'submissions'],
    queryFn: async () => { const d = (await apiClient.get('fiscal/agt/submissions/')).data; return d?.results || d || []; },
    refetchInterval: 15000,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['agt'] });
  const run = useMutation({
    mutationFn: () => apiClient.post('fiscal/agt/transmit/', { limit: 100 }),
    onSuccess: (r: any) => {
      inval();
      const d = r.data;
      notifyGuide({
        title: 'Fila processada',
        message: `${d.sent} documento(s) transmitido(s): ${d.acked} aceite(s), ${d.retry} a reenviar, ${d.rejected} rejeitado(s).`,
        hint: 'Os que ficaram "a reenviar" voltam a ser tentados sozinhos (1min, 2min, 4min…).',
      });
    },
    onError: notifyError,
  });
  const check = useMutation({
    mutationFn: () => apiClient.post('fiscal/agt/transmit/', { health: true }),
    onSuccess: (r: any) => { inval(); notifyGuide({ title: 'Estado da ligação à AGT', message: `${r.data.status} — ${r.data.detail || ''}` }); },
    onError: notifyError,
  });
  const retry = useMutation({
    mutationFn: (id: number) => apiClient.post(`fiscal/agt/submissions/${id}/retry/`),
    onSuccess: inval, onError: notifyError,
  });

  const c = data?.connection;
  const q = data?.queue;
  const f = data?.fiscal;

  const Kpi = ({ label, value, color }: any) => (
    <div className="flex-1 bg-white border border-[#9aa6b6] px-3 py-2" style={{ boxShadow: 'inset 0 1px 0 #fff' }}>
      <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wide">{label}</div>
      <div className="text-[22px] font-black leading-tight" style={{ color: color || '#25405e' }}>{value ?? '—'}</div>
    </div>
  );

  return (
    <ClassicWindow title="Transmissão AGT — Faturação Eletrónica" icon={<Radio size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Store-and-forward: a venda nunca espera pela AGT · reenvio automático · chave de idempotência (nunca duplica)</div>}>
      <div className="p-3 space-y-3 bg-[#dfe3e8] h-full overflow-auto">

        {/* Estado da ligação */}
        <Panel title="Ligação à AGT"
          right={<div className="flex gap-2">
            <button onClick={() => check.mutate()} className={btn} style={btnStyle}><RefreshCw size={12} />Testar ligação</button>
            <button onClick={() => run.mutate()} disabled={run.isPending} className={btn}
              style={{ ...btnStyle, background: 'linear-gradient(to bottom, #2f5f92, #1e3f66)', color: '#fff', borderColor: '#16304a' }}>
              <Send size={12} />{run.isPending ? 'A transmitir…' : 'Transmitir agora'}
            </button>
          </div>}>
          {c?.simulation ? (
            <div className="flex items-start gap-2 p-2 bg-[#fff7e6] border border-[#e0c080] text-[12px]">
              <ShieldAlert size={20} className="text-amber-700 flex-shrink-0" />
              <div>
                <div className="font-bold text-amber-800">Modo simulação — ainda não está a comunicar com a AGT a sério</div>
                <div className="text-gray-700 mt-0.5">
                  Toda a infraestrutura está pronta (fila, transmissor, reenvio, idempotência, prova de envio).
                  Falta apenas o que <b>só a AGT pode dar ao contribuinte</b>: o <b>URL de submissão</b> e as <b>credenciais</b>.
                  Preencha-os em <b>Fiscal Connectivity → Ligação AGT</b> e o sistema passa a comunicar de verdade,
                  sem mais nenhuma alteração.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[12px]">
              <div className="flex items-center gap-2 px-3 py-2 bg-[#eafaf0] border border-[#8fce9e]">
                <ShieldCheck size={20} className="text-green-700" />
                <div>
                  <div className="font-bold text-green-800">Ligada · {c?.environment === 'PROD' ? 'Produção' : 'Sandbox'}</div>
                  <div className="text-[11px] text-gray-600">{c?.url_submit}</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-600">
                Estado: <b>{c?.health || '—'}</b> · verificado {when(c?.health_at)}<br />
                Tentativas máx.: {c?.max_retries} · timeout {c?.timeout_seconds}s
                {!c?.has_credentials && <div className="text-[#a01818] font-bold">⚠ Sem credenciais configuradas</div>}
              </div>
            </div>
          )}
          <div className="mt-2 text-[11px] text-gray-600">
            Certificado AGT: <b>{f?.certified ? f.certificate_number : 'não certificado'}</b> · ambiente {f?.environment === 'PROD' ? 'Produção' : 'Testes'}
          </div>
        </Panel>

        {/* Fila */}
        <div className="flex gap-2">
          <Kpi label="Por enviar" value={q?.pending} color={q?.pending ? '#b5651d' : '#1f7a34'} />
          <Kpi label="Aceites pela AGT" value={q?.acked} color="#1f7a34" />
          <Kpi label="Rejeitados" value={q?.rejected} color={q?.rejected ? '#a01818' : '#25405e'} />
          <Kpi label="Falhados" value={q?.failed} color={q?.failed ? '#a01818' : '#25405e'} />
          <Kpi label="Total" value={q?.total} />
          <Kpi label="Mais antigo por enviar" value={q?.oldest_pending_at ? when(q.oldest_pending_at) : '—'} />
        </div>

        {(q?.documents_not_queued ?? 0) > 0 && (
          <div className="flex items-center gap-2 p-2 bg-[#fdeaea] border border-[#e0a0a0] text-[12px] text-[#a01818] font-bold">
            <AlertTriangle size={14} />
            {q.documents_not_queued} documento(s) emitido(s) antes desta funcionalidade existir não estão em fila.
            Foram emitidos e assinados corretamente — só não passaram pelo transmissor.
          </div>
        )}

        {/* Detalhe */}
        <Panel title="Documentos e estado da comunicação"
          right={<span className="text-[11px] font-normal text-gray-500">{subs.length} submissão(ões) · atualiza sozinho</span>}>
          <ClassicGrid rowKey="id" data={subs} onRowClick={(r: any) => setSel(r)} columns={[
            { header: 'Documento', accessor: 'invoice_no', width: '12%' },
            { header: 'Cliente', accessor: (r: any) => r.customer_name || '—', width: '18%' },
            { header: 'Total', accessor: (r: any) => money(r.gross_total), width: '10%' },
            { header: 'Estado', accessor: (r: any) => {
              const s = STATUS[r.status] || { label: r.status, bg: '#6b7280', icon: Clock };
              const I = s.icon;
              return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: s.bg }}>
                <I size={10} />{s.label}{r.simulated ? ' (simulado)' : ''}
              </span>;
            }, width: '16%' },
            { header: 'Tent.', accessor: 'attempts', width: '6%' },
            { header: 'Protocolo AGT', accessor: (r: any) => <span className="font-mono text-[10px]">{r.agt_reference || '—'}</span>, width: '16%' },
            { header: 'Aceite em', accessor: (r: any) => when(r.acked_at), width: '12%' },
            { header: '', accessor: (r: any) => (
              r.status !== 'ACK' ? (
                <button onClick={(e: any) => { e.stopPropagation(); retry.mutate(r.id); }}
                  className="px-1.5 py-0.5 text-[10px] font-bold border border-[#16304a] text-white"
                  style={{ background: 'linear-gradient(to bottom, #2f5f92, #1e3f66)' }}>Reenviar</button>
              ) : null), width: '10%' },
          ]} />
        </Panel>

        {/* Prova de envio */}
        {sel && (
          <Panel title={`Prova de comunicação — ${sel.invoice_no}`}
            right={<button onClick={() => setSel(null)} className="text-[14px] leading-none text-gray-500 hover:text-black">×</button>}>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="space-y-1">
                <div><span className="text-gray-500">Chave de idempotência:</span> <span className="font-mono">{sel.idempotency_key}</span></div>
                <div><span className="text-gray-500">Código HTTP:</span> <b>{sel.http_status ?? '—'}</b></div>
                <div><span className="text-gray-500">Tentativas:</span> {sel.attempts}</div>
                <div><span className="text-gray-500">Próximo reenvio:</span> {when(sel.next_attempt_at)}</div>
                {sel.error_message && <div className="text-[#a01818] font-bold">{sel.error_message}</div>}
                <div className="text-gray-500 mt-2">Resposta da AGT:</div>
                <pre className="bg-[#f5f6f8] border border-[#d0d0d0] p-2 overflow-auto max-h-40 whitespace-pre-wrap">{sel.response || '—'}</pre>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Conteúdo enviado (o que a AGT recebeu):</div>
                <pre className="bg-[#f5f6f8] border border-[#d0d0d0] p-2 overflow-auto max-h-56 font-mono text-[10px]">{sel.payload_preview || sel.payload || '—'}</pre>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </ClassicWindow>
  );
}
