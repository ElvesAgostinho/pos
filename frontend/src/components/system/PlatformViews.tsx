import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import {
  Lock, CreditCard, Scale, Printer, Plug, Mail, MessageSquare, Bell, BellRing,
  FileText, PenTool, Clock, ScrollText, HardDriveDownload, RefreshCw, Trash2, Plus, Database,
} from 'lucide-react';
import { platformApi } from '../../api/platform';
import { apiClient } from '../../api/client';

function useCrud(resource: keyof typeof platformApi, params?: any) {
  const qc = useQueryClient();
  const api = platformApi[resource] as any;
  const inval = () => qc.invalidateQueries({ queryKey: ['platform', resource] });
  return {
    rows: (useQuery({ queryKey: ['platform', resource, params ?? {}], queryFn: () => api.list(params) }).data ?? []) as any[],
    create: useMutation({ mutationFn: (p: any) => api.create(p), onSuccess: inval }),
    update: useMutation({ mutationFn: ({ id, data }: any) => api.update(id, data), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: number) => api.remove(id), onSuccess: inval }),
  };
}

// ============ Integração (20) ============
function IntegrationView({ kind, title, icon }: { kind: string; title: string; icon: any }) {
  const { rows, create, update, remove } = useCrud('connectors', { kind });
  const [f, setF] = useState<any>({ name: '', vendor: '', endpoint: '' });
  const add = () => { if (!f.name) return; create.mutate({ ...f, kind, status: 'PENDING' }, { onSuccess: () => setF({ name: '', vendor: '', endpoint: '' }) }); };
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">Conectores: {rows.length} · reais ligam-se com credenciais</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Fornecedor/Marca" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Endpoint / host" value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value })} className="border border-[#a0a0a0] p-1 w-40" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Nome', accessor: 'name', width: '26%' },
            { header: 'Fornecedor', accessor: (r: any) => r.vendor || '—', width: '20%' },
            { header: 'Endpoint', accessor: (r: any) => r.endpoint || '—', width: '24%' },
            { header: 'Estado', accessor: (r: any) => r.status_display, width: '14%' },
            { header: 'Ativo', accessor: (r: any) => <input type="checkbox" checked={r.enabled} onChange={() => update.mutate({ id: r.id, data: { enabled: !r.enabled, status: !r.enabled ? 'CONFIGURED' : 'DISABLED' } })} />, width: '10%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
export const IntLocksView = () => <IntegrationView kind="LOCK" title="Integração — Fechaduras Eletrónicas" icon={<Lock size={14} className="text-gray-300" />} />;
export const IntBankPosView = () => <IntegrationView kind="BANK_POS" title="Integração — TPA / Terminais de Pagamento" icon={<CreditCard size={14} className="text-gray-300" />} />;
export const IntScalesView = () => <IntegrationView kind="SCALE" title="Integração — Balanças" icon={<Scale size={14} className="text-gray-300" />} />;
export const IntPrintersView = () => <IntegrationView kind="PRINTER" title="Integração — Impressoras" icon={<Printer size={14} className="text-gray-300" />} />;
export const IntApisView = () => <IntegrationView kind="API" title="Integração — APIs Externas" icon={<Plug size={14} className="text-gray-300" />} />;

// ============ Notificações (06) ============
function ChannelsView({ channel, title, icon }: { channel: string; title: string; icon: any }) {
  const { rows, create, update, remove } = useCrud('channels', { channel });
  const [f, setF] = useState<any>({ name: '', provider: '', sender: '' });
  const add = () => { if (!f.name) return; create.mutate({ ...f, channel }, { onSuccess: () => setF({ name: '', provider: '', sender: '' }) }); };
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">Canais: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Fornecedor (SMTP/Twilio/FCM)" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} className="border border-[#a0a0a0] p-1 w-44" />
          <input placeholder="Remetente" value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Nome', accessor: 'name', width: '28%' },
            { header: 'Fornecedor', accessor: (r: any) => r.provider || '—', width: '26%' },
            { header: 'Remetente', accessor: (r: any) => r.sender || '—', width: '26%' },
            { header: 'Ativo', accessor: (r: any) => <input type="checkbox" checked={r.enabled} onChange={() => update.mutate({ id: r.id, data: { enabled: !r.enabled } })} />, width: '12%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
export const NtfEmailsView = () => <ChannelsView channel="EMAIL" title="Notificações — Email" icon={<Mail size={14} className="text-gray-300" />} />;
export const NtfSmsView = () => <ChannelsView channel="SMS" title="Notificações — SMS" icon={<MessageSquare size={14} className="text-gray-300" />} />;
export const NtfPushView = () => <ChannelsView channel="PUSH" title="Notificações — Push" icon={<Bell size={14} className="text-gray-300" />} />;

export function NtfAlertsView() {
  const { rows, create, update, remove } = useCrud('rules');
  const channels = useCrud('channels').rows;
  const [f, setF] = useState<any>({ event: '', name: '', channel: '', recipients: '' });
  const add = () => { if (!f.event || !f.name) return; create.mutate({ ...f, channel: f.channel ? Number(f.channel) : null }, { onSuccess: () => setF({ event: '', name: '', channel: '', recipients: '' }) }); };
  return (
    <ClassicWindow title="Notificações — Alertas & Regras" icon={<BellRing size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Regras: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Evento (stock.low…)" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} className="border border-[#a0a0a0] p-1 w-36" />
          <input placeholder="Nome da regra" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Canal…</option>{channels.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <input placeholder="Destinatários" value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Evento', accessor: 'event', width: '24%' },
            { header: 'Regra', accessor: 'name', width: '28%' },
            { header: 'Canal', accessor: (r: any) => r.channel_name || '—', width: '18%' },
            { header: 'Destinatários', accessor: (r: any) => r.recipients || '—', width: '16%' },
            { header: 'Ativo', accessor: (r: any) => <input type="checkbox" checked={r.enabled} onChange={() => update.mutate({ id: r.id, data: { enabled: !r.enabled } })} />, width: '8%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// ============ Documentos (18) ============
const FORMATS: Record<string, string> = { A4: 'A4', A5: 'A5', THERMAL_80: 'Talão 80mm', THERMAL_58: 'Talão 58mm' };
function TemplatesBase({ title, icon, onlySignature }: { title: string; icon: any; onlySignature?: boolean }) {
  const { rows: all, create, update, remove } = useCrud('templates');
  const rows = onlySignature ? all.filter((t: any) => t.signature_enabled) : all;
  const [f, setF] = useState<any>({ name: '', doc_type: '', page_format: 'A4', signature_enabled: !!onlySignature });
  const add = () => { if (!f.name || !f.doc_type) return; create.mutate({ ...f }, { onSuccess: () => setF({ name: '', doc_type: '', page_format: 'A4', signature_enabled: !!onlySignature }) }); };
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">Modelos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome do modelo" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Tipo (FT, FR, VOUCHER…)" value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-32" />
          <select value={f.page_format} onChange={(e) => setF({ ...f, page_format: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {onlySignature && <span className="text-gray-500">assinatura digital</span>}
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Modelo', accessor: 'name', width: '28%' },
            { header: 'Tipo', accessor: 'doc_type', width: '14%' },
            { header: 'Formato', accessor: (r: any) => r.page_format_display, width: '16%' },
            { header: 'Logo/QR', accessor: (r: any) => `${r.show_logo ? 'Logo' : ''} ${r.show_qr ? 'QR' : ''}`.trim() || '—', width: '14%' },
            { header: 'Assinatura', accessor: (r: any) => <input type="checkbox" checked={r.signature_enabled} onChange={() => update.mutate({ id: r.id, data: { signature_enabled: !r.signature_enabled } })} />, width: '12%' },
            { header: 'Def.', accessor: (r: any) => r.is_default ? '★' : '', width: '8%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
export const DocTemplatesView = () => <TemplatesBase title="Documentos — Modelos" icon={<FileText size={14} className="text-gray-300" />} />;
export const DocPdfView = () => <TemplatesBase title="Documentos — Formatos PDF / Impressão" icon={<FileText size={14} className="text-gray-300" />} />;
export const DocSignaturesView = () => <TemplatesBase title="Documentos — Assinaturas Digitais" icon={<PenTool size={14} className="text-gray-300" />} onlySignature />;

// ============ Sistema (21) ============
export function SysSchedulerView() {
  const { rows, create, update, remove } = useCrud('tasks');
  const FREQ: Record<string, string> = { HOURLY: 'Horária', DAILY: 'Diária', WEEKLY: 'Semanal', MONTHLY: 'Mensal' };
  const [f, setF] = useState<any>({ name: '', task_type: '', frequency: 'DAILY', run_at: '03:00' });
  const add = () => { if (!f.name) return; create.mutate({ ...f }, { onSuccess: () => setF({ name: '', task_type: '', frequency: 'DAILY', run_at: '03:00' }) }); };
  return (
    <ClassicWindow title="Sistema — Agendador de Tarefas" icon={<Clock size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Tarefas: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Tipo (BACKUP…)" value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value.toUpperCase() })} className="border border-[#a0a0a0] p-1 w-32" />
          <select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
            {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Hora" value={f.run_at} onChange={(e) => setF({ ...f, run_at: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <ClassicButton icon={Plus} label="Agendar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Tarefa', accessor: 'name', width: '30%' },
            { header: 'Tipo', accessor: 'task_type', width: '18%' },
            { header: 'Frequência', accessor: (r: any) => r.frequency_display, width: '16%' },
            { header: 'Hora', accessor: (r: any) => r.run_at || '—', width: '10%' },
            { header: 'Últ. estado', accessor: (r: any) => r.last_status || '—', width: '12%' },
            { header: 'Ativo', accessor: (r: any) => <input type="checkbox" checked={r.enabled} onChange={() => update.mutate({ id: r.id, data: { enabled: !r.enabled } })} />, width: '8%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function SysLogsView() {
  const { data } = useQuery({ queryKey: ['platform', 'logs'], queryFn: () => platformApi.logs() });
  const rows = data?.events ?? [];
  return (
    <ClassicWindow title="Sistema — Logs & Eventos" icon={<ScrollText size={14} className="text-gray-300" />} footer={<div className="text-gray-600">{rows.length} evento(s) recentes</div>}>
      <div className="p-2 h-full">
        <ClassicGrid rowKey="at" data={rows} columns={[
          { header: 'Data/hora', accessor: (r: any) => new Date(r.at).toLocaleString('pt-PT'), width: '22%' },
          { header: 'Origem', accessor: 'source', width: '12%' },
          { header: 'Evento', accessor: 'event', width: '20%' },
          { header: 'Descrição', accessor: 'desc', width: '30%' },
          { header: 'Utilizador', accessor: 'user', width: '16%' },
        ]} />
        {rows.length === 0 && <div className="text-center text-gray-400 text-[12px] py-8">Sem eventos recentes.</div>}
      </div>
    </ClassicWindow>
  );
}

function SysInfoView({ title, icon }: { title: string; icon: any }) {
  const qc = useQueryClient();
  const { data: d } = useQuery({ queryKey: ['platform', 'system'], queryFn: () => platformApi.systemInfo() });
  const clear = useMutation({ mutationFn: () => platformApi.clearCache(), onSuccess: () => { alert('Cache limpa.'); qc.invalidateQueries({ queryKey: ['platform', 'system'] }); } });
  const Row = ({ k, v }: any) => <div className="flex justify-between border-b border-[#eee] py-1 text-[12px]"><span className="text-gray-500">{k}</span><span className="font-mono">{v}</span></div>;
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">Estado do sistema em tempo real</div>}>
      <div className="p-3 space-y-3">
        {!d ? <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : (
          <>
            <div className="bg-white border border-[#a0a0a0] p-3">
              <Row k="Aplicação" v={`${d.app} v${d.version}`} />
              <Row k="Atualização" v={d.update?.up_to_date ? `✓ Atualizado (${d.update.current})` : `Disponível ${d.update?.latest}`} />
              <Row k="Canal" v={d.update?.channel} />
              <Row k="Base de dados" v={d.database} />
              <Row k="Python / Django" v={`${d.python} / ${d.django}`} />
              <Row k="Cache" v={d.cache?.backend} />
            </div>
            <div className="flex gap-2">
              <ClassicButton icon={RefreshCw} label="Verificar atualizações" onClick={() => qc.invalidateQueries({ queryKey: ['platform', 'system'] })} />
              <ClassicButton icon={Database} label="Limpar cache" onClick={() => clear.mutate()} />
            </div>
          </>
        )}
      </div>
    </ClassicWindow>
  );
}
export const SysUpdatesView = () => <SysInfoView title="Sistema — Atualizações" icon={<RefreshCw size={14} className="text-gray-300" />} />;
export const SysCacheView = () => <SysInfoView title="Sistema — Cache & Manutenção" icon={<Database size={14} className="text-gray-300" />} />;

export function SysBackupsView() {
  const download = async () => {
    const res = await apiClient.get(platformApi.backupUrl, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <ClassicWindow title="Sistema — Backups" icon={<HardDriveDownload size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Backup portável da base de dados (JSON)</div>}>
      <div className="p-4 space-y-3">
        <div className="bg-[#eef4fb] border border-[#a0a0a0] p-3 text-[12px] text-gray-700">
          O backup exporta todos os dados de negócio num ficheiro JSON portável (independente do motor de base de dados).
          Guarde-o em local seguro. Agende backups automáticos no <b>Agendador de Tarefas</b>.
        </div>
        <ClassicButton icon={HardDriveDownload} label="Descarregar backup agora" onClick={download} />
      </div>
    </ClassicWindow>
  );
}
