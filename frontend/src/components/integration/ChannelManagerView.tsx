import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { Network, Plus, RefreshCw, DownloadCloud, UploadCloud, Link2 } from 'lucide-react';

const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';
const PROVIDERS: [string, string][] = [['BOOKING', 'Booking.com'], ['EXPEDIA', 'Expedia'], ['AIRBNB', 'Airbnb'], ['AGODA', 'Agoda'], ['HOTELS', 'Hotels.com'], ['TRIVAGO', 'Trivago'], ['GOOGLE', 'Google Hotels'], ['OTHER', 'Outro']];
const PROV_COLOR: Record<string, string> = { BOOKING: '#003580', EXPEDIA: '#00355f', AIRBNB: '#ff5a5f', AGODA: '#5b2d8e', HOTELS: '#d32f2f', TRIVAGO: '#e5484d', GOOGLE: '#4285f4', OTHER: '#607d8b' };
const ST_COLOR: Record<string, string> = { CONNECTED: '#1f9d55', ERROR: '#c0392b', DISABLED: '#8a8f98' };

export default function ChannelManagerView() {
  const qc = useQueryClient();
  const inval = () => { qc.invalidateQueries({ queryKey: ['channels'] }); qc.invalidateQueries({ queryKey: ['channel-logs'] }); };
  const { data: channels = [] } = useQuery({ queryKey: ['channels'], queryFn: async () => (await apiClient.get('pms/channels/')).data, refetchInterval: 30000 });
  const { data: logs = [] } = useQuery({ queryKey: ['channel-logs'], queryFn: async () => (await apiClient.get('pms/channel-sync-logs/')).data, refetchInterval: 20000 });
  const [f, setF] = useState<any>({ provider: 'BOOKING', name: '', property_id: '', api_key: '', commission_percent: 15, enabled: true });
  const create = useMutation({ mutationFn: async () => (await apiClient.post('pms/channels/', { ...f, commission_percent: Number(f.commission_percent) })).data, onSuccess: () => { inval(); setF({ ...f, name: '', property_id: '', api_key: '' }); } });
  const act = useMutation({ mutationFn: async ({ id, a }: any) => (await apiClient.post(`pms/channels/${id}/${a}/`, {})).data, onSuccess: inval });
  const syncAll = useMutation({ mutationFn: async () => (await apiClient.post('pms/channels/sync_all/', {})).data, onSuccess: inval });

  return (
    <ClassicWindow title="Channel Manager — Sincronização com OTAs" icon={<Network size={14} className="text-gray-300" />}
      footer={<div className="flex items-center justify-between w-full"><span className="text-gray-600">Booking.com · Expedia · Airbnb · Agoda · Hotels.com — disponibilidade/tarifas e reservas · anti-overbooking automático</span>
        <button onClick={() => syncAll.mutate()} className={btn}><RefreshCw size={12} className={syncAll.isPending ? 'animate-spin' : ''} />Sincronizar todos</button></div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        {/* ONDE OBTER AS CREDENCIAIS de cada plataforma */}
        <div className="bg-white border border-[#c0c0c0] p-3 text-[12px]">
          <div className="font-bold text-[#1e3f66] mb-2">Onde obter as credenciais de cada plataforma</div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#f0f0f0]">
                <th className="border border-[#ddd] px-2 py-1 text-left">Plataforma</th>
                <th className="border border-[#ddd] px-2 py-1 text-left">Onde pedir / encontrar</th>
                <th className="border border-[#ddd] px-2 py-1 text-left">Property ID</th>
                <th className="border border-[#ddd] px-2 py-1 text-left">Chave API</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Booking.com', 'Extranet → Conta → Connectivity Provider. Peça acesso à Connectivity API (Booking aprova o parceiro).', 'Hotel ID na Extranet (canto superior)', 'Fornecida pela Booking após aprovação'],
                ['Expedia', 'Expedia Partner Central → Connectivity Settings → EPS Rapid / EQC API.', 'Property ID no Partner Central', 'API Key + Secret (EPS Rapid)'],
                ['Airbnb', 'Airbnb Partner Portal → API access (só para software homologado).', 'Listing ID', 'OAuth token'],
                ['Agoda', 'Agoda YCS → Connectivity → escolher provider.', 'Hotel ID (YCS)', 'API Key fornecida pela Agoda'],
                ['Hotels.com', 'Gerido pela Expedia (mesma credencial).', 'Property ID Expedia', 'Chave Expedia'],
              ].map((r) => (
                <tr key={r[0]}>
                  <td className="border border-[#ddd] px-2 py-1 font-bold">{r[0]}</td>
                  <td className="border border-[#ddd] px-2 py-1 text-gray-700">{r[1]}</td>
                  <td className="border border-[#ddd] px-2 py-1 text-gray-700">{r[2]}</td>
                  <td className="border border-[#ddd] px-2 py-1 text-gray-700">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 p-2 bg-[#eaf1fa] border border-[#b9cde6] text-[11px] text-[#1e3f66]">
            💡 <b>Como funciona:</b> preenche em baixo o canal, o <b>Property ID</b> e a <b>Chave API</b> → o sistema envia disponibilidade e tarifas, e recebe as reservas automaticamente (com <b>anti-overbooking</b>). As reservas entram no <b>PMS → Reservas</b>.
            <br />⚠️ As OTAs só dão as credenciais a software <b>homologado</b> por elas — este é o passo comercial a fazer com cada plataforma.
          </div>
        </div>

        {/* Ligar canal */}
        <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col">Canal<select className="border border-[#a0a0a0] px-2 py-1" value={f.provider} onChange={e => setF({ ...f, provider: e.target.value })}>{PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="flex flex-col">Nome<input className="border border-[#a0a0a0] px-2 py-1 w-40" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ex: Booking Hotel X" /></label>
          <label className="flex flex-col">Property ID<input className="border border-[#a0a0a0] px-2 py-1 w-32" value={f.property_id} onChange={e => setF({ ...f, property_id: e.target.value })} /></label>
          <label className="flex flex-col">Chave API<input className="border border-[#a0a0a0] px-2 py-1 w-40" value={f.api_key} onChange={e => setF({ ...f, api_key: e.target.value })} type="password" /></label>
          <label className="flex flex-col">Comissão %<input type="number" className="border border-[#a0a0a0] px-2 py-1 w-20" value={f.commission_percent} onChange={e => setF({ ...f, commission_percent: e.target.value })} /></label>
          <button className={btn} disabled={!f.name} onClick={() => create.mutate()}><Plus size={13} />Ligar canal</button>
        </div>

        {/* Canais */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {channels.map((ch: any) => (
            <div key={ch.id} className="bg-white border border-[#c0c0c0] p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PROV_COLOR[ch.provider] }} />{ch.provider_display}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: ST_COLOR[ch.status] }}>{ch.status_display}</span>
              </div>
              <div className="text-[12px] text-gray-700 mt-1">{ch.name}</div>
              <div className="text-[10px] text-gray-500">Property {ch.property_id || '—'} · comissão {Number(ch.commission_percent)}% · {ch.mapped_rooms} tipo(s) mapeado(s)</div>
              <div className="text-[10px] text-gray-400">{ch.last_sync_at ? `última sync ${new Date(ch.last_sync_at).toLocaleString('pt-PT')}` : 'nunca sincronizado'}</div>
              <div className="flex gap-1 mt-2">
                <button className="text-[11px] text-[#1565c0] hover:underline flex items-center gap-0.5" onClick={() => act.mutate({ id: ch.id, a: 'sync_availability' })}><UploadCloud size={12} />Enviar disp.</button>
                <button className="text-[11px] text-[#1565c0] hover:underline flex items-center gap-0.5" onClick={() => act.mutate({ id: ch.id, a: 'pull' })}><DownloadCloud size={12} />Receber reservas</button>
              </div>
            </div>
          ))}
          {channels.length === 0 && <div className="col-span-3 text-gray-500 text-[12px]">Sem canais ligados. Ligue Booking.com, Expedia, etc. acima.</div>}
        </div>

        {/* Log de sincronização */}
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-1 uppercase flex items-center gap-1"><Link2 size={13} />Registo de sincronização</div>
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-[140px_100px_90px_1fr_130px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Canal</span><span>Direção</span><span>Evento</span><span>Resumo</span><span>Quando</span></div>
            {logs.map((l: any) => (
              <div key={l.id} className="grid grid-cols-[140px_100px_90px_1fr_130px] px-2 py-1 border-b border-[#eee] items-center">
                <span className="font-bold">{l.channel_name}</span>
                <span>{l.direction === 'PUSH' ? '↑ Enviado' : '↓ Recebido'}</span>
                <span>{l.event}</span>
                <span className="truncate" title={l.summary}>{l.summary} {l.status.includes('SIMULADO') && <em className="text-[#b06a00]">· {l.status}</em>}</span>
                <span className="text-gray-500">{new Date(l.created_at).toLocaleString('pt-PT')}</span>
              </div>
            ))}
            {logs.length === 0 && <div className="px-3 py-2 text-gray-500">Sem sincronizações ainda.</div>}
          </div>
        </div>
        <div className="text-[11px] text-gray-500">As chamadas às APIs das OTAs ligam-se aqui quando as credenciais/certificação de cada canal estiverem disponíveis (Booking.com Connectivity, Expedia EPS, etc.). A arquitetura (mapeamento, push/pull, anti-overbooking) já está pronta.</div>
      </div>
    </ClassicWindow>
  );
}
