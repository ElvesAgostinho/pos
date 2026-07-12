import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { LifeBuoy, Download, Server, Database, KeyRound, Activity, CheckCircle2, XCircle, RefreshCw, Printer, MonitorSmartphone, Wifi, HardDriveDownload, ShieldCheck, Send } from 'lucide-react';

function Row({ label, value, ok }: { label: string; value: any; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#eee] text-[12px]">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold flex items-center gap-1">
        {ok === true && <CheckCircle2 size={13} className="text-green-600" />}
        {ok === false && <XCircle size={13} className="text-red-600" />}
        {String(value)}
      </span>
    </div>
  );
}
function Section({ title, icon: Icon, children }: any) {
  return (
    <div className="bg-white border border-[#c0c0c0]">
      <div className="px-3 py-1.5 bg-[#1e3f66] text-white text-[12px] font-bold flex items-center gap-2"><Icon size={14} />{title}</div>
      {children}
    </div>
  );
}

export default function SupportCenterView() {
  const qc = useQueryClient();
  const { data: d, refetch, isFetching } = useQuery({ queryKey: ['support-diag'], queryFn: async () => (await apiClient.get('support/diagnostics/')).data, refetchInterval: 30000 });
  const [supportUrl, setSupportUrl] = useState('');
  const dl = async (path: string, name: string) => {
    const res = await apiClient.get(path, { params: { download: 1 }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const download = () => dl('support/diagnostics/', `diagnostico_${Date.now()}.json`);
  const backup = () => dl('support/backup/', `backup_${Date.now()}.json`);
  const act = async (body: any) => { try { const r = await apiClient.post('support/actions/', body); alert(r.data.detail + (r.data.code ? `\nCódigo: ${r.data.code}` : '')); qc.invalidateQueries({ queryKey: ['support-diag'] }); } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } };
  const sys = d?.system || {}, db = d?.database || {}, lic = d?.license || {}, sv = d?.services || {}, counts = d?.data_counts || {}, events = d?.recent_events || [];
  const pr = d?.printers || {}, term = d?.terminals || {}, sup = d?.support || {};

  return (
    <ClassicWindow title="Support Center — Diagnóstico & Estado" icon={<LifeBuoy size={14} className="text-gray-300" />}
      footer={<div className="flex items-center justify-between w-full"><span className="text-gray-600">Assistência remota via VPN · gere um diagnóstico e envie ao suporte</span>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="px-3 py-1 border border-[#a0a0a0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] text-[11px] flex items-center gap-1"><RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />Atualizar</button>
          <button onClick={download} className="px-3 py-1 border border-[#a0a0a0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] text-[11px] font-bold flex items-center gap-1"><Download size={12} />Criar Diagnóstico</button>
        </div></div>}>
      <div className="p-4 grid grid-cols-2 gap-3 bg-[#ececec] h-full overflow-auto">
        <Section title="Sistema" icon={Server}>
          <Row label="Aplicação" value={`${sys.app} v${sys.version}`} />
          <Row label="Modo" value={sys.run_mode} />
          <Row label="Python / Django" value={`${sys.python} / ${sys.django}`} />
          <Row label="Plataforma" value={sys.platform} />
          <Row label="DEBUG" value={sys.debug ? 'Ligado (dev)' : 'Desligado (produção)'} ok={sys.debug === false} />
        </Section>

        <Section title="Base de Dados" icon={Database}>
          <Row label="Motor" value={db.engine} />
          <Row label="Ligação" value={db.connected ? 'Ligada' : 'Sem ligação'} ok={!!db.connected} />
          <Row label="Migrações pendentes" value={db.pending_migrations ?? '—'} ok={db.pending_migrations === 0} />
          {db.name && <Row label="BD" value={db.name} />}
        </Section>

        <Section title="Licença" icon={KeyRound}>
          <Row label="Estado" value={lic.licensed ? 'Válida' : 'Inválida/ausente'} ok={!!lic.licensed} />
          <Row label="Cliente" value={lic.client || '—'} />
          <Row label="Nº / Validade" value={`${lic.license_number || '—'} · ${lic.valid_until || '∞'}`} />
          <Row label="Módulos / Funcionalidades" value={`${lic.modules ?? 0} / ${lic.features}`} />
          <Row label="Origem" value={lic.source || '—'} />
        </Section>

        <Section title="Serviços & Dados" icon={Activity}>
          <Row label="API" value={sv.api} ok={sv.api === 'online'} />
          <Row label="Base de dados" value={sv.database} ok={sv.database === 'online'} />
          {Object.entries(counts).map(([k, v]: any) => <Row key={k} label={k.replace('_', ' ')} value={v} />)}
        </Section>

        <Section title="Impressoras (spooler)" icon={Printer}>
          <Row label="Trabalhos falhados" value={pr.failed ?? 0} ok={(pr.failed ?? 0) === 0} />
          <Row label="Estações/impressoras" value={(pr.stations || []).join(', ') || '—'} />
          <Row label="Fila" value={(pr.jobs?.QUEUED ?? 0) + ' em fila · ' + (pr.jobs?.PRINTED ?? 0) + ' impressos'} />
        </Section>

        <Section title="Terminais" icon={MonitorSmartphone}>
          <Row label="Terminais licenciados" value={`${term.active ?? 0} ativos / ${term.total ?? 0}`} />
          <Row label="Caixas abertas (em uso)" value={term.open_cash_sessions ?? 0} />
        </Section>

        {/* Assistência remota / VPN / Backup */}
        <div className="col-span-2">
          <Section title="Assistência Remota, VPN & Backup" icon={ShieldCheck}>
            <div className="p-3 space-y-3 text-[12px]">
              <div className="flex items-center gap-2">
                <Wifi size={14} className={sup.support_url ? 'text-green-600' : 'text-gray-400'} />
                Servidor de suporte (VPN): <b>{sup.vpn_link || 'não configurado'}</b>
                {sup.last_sent_at && <span className="text-gray-500">· último envio {new Date(sup.last_sent_at).toLocaleString('pt-PT')}</span>}
              </div>
              <div className="flex items-end gap-2">
                <input value={supportUrl} onChange={(e) => setSupportUrl(e.target.value)} placeholder="https://suporte.seuerp.com/ingest (URL do teu servidor)" className="flex-1 border border-[#a0a0a0] px-2 py-1.5" />
                <button onClick={() => act({ action: 'save_config', support_url: supportUrl, auto_send_logs: true })} className="px-3 py-1.5 border border-[#a0a0a0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4]">Guardar</button>
                <button onClick={() => act({ action: 'send_logs' })} className="px-3 py-1.5 border border-[#a0a0a0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] flex items-center gap-1"><Send size={13} />Enviar diagnóstico</button>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-[#eee]">
                <ShieldCheck size={15} className={sup.remote_assist ? 'text-green-600' : 'text-gray-400'} />
                Assistência remota: <b className={sup.remote_assist ? 'text-green-700' : 'text-gray-600'}>{sup.remote_assist ? `AUTORIZADA (código ${sup.remote_assist_code})` : 'Desativada'}</b>
                {sup.remote_assist && <span className="text-gray-500">até {new Date(sup.remote_assist_until).toLocaleString('pt-PT')}</span>}
                <div className="flex-1" />
                {!sup.remote_assist
                  ? <button onClick={() => act({ action: 'remote_assist', hours: 2 })} className="px-3 py-1.5 bg-[#1f9d55] text-white rounded font-bold">Autorizar (2h)</button>
                  : <button onClick={() => act({ action: 'revoke' })} className="px-3 py-1.5 bg-[#a01818] text-white rounded font-bold">Revogar</button>}
                <button onClick={backup} className="px-3 py-1.5 border border-[#a0a0a0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] flex items-center gap-1"><HardDriveDownload size={13} />Criar Backup</button>
              </div>
            </div>
          </Section>
        </div>

        <div className="col-span-2">
          <Section title="Eventos recentes (auditoria)" icon={Activity}>
            <div className="max-h-52 overflow-auto">
              {events.map((e: any, i: number) => (
                <div key={i} className="grid grid-cols-[150px_140px_1fr_100px] px-3 py-1 border-b border-[#eee] text-[11px]">
                  <span className="text-gray-500">{new Date(e.at).toLocaleString('pt-PT')}</span>
                  <span className="font-bold">{e.event}</span><span className="truncate">{e.desc}</span><span className="text-gray-500">{e.user || '—'}</span>
                </div>
              ))}
              {events.length === 0 && <div className="px-3 py-2 text-gray-500 text-[12px]">Sem eventos recentes.</div>}
            </div>
          </Section>
        </div>
      </div>
    </ClassicWindow>
  );
}
