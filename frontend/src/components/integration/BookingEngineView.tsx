import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { Globe, KeyRound, RefreshCw, Link2, Search, Calendar } from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';

export default function BookingEngineView() {
  const qc = useQueryClient();
  const { data: list } = useQuery({ queryKey: ['booking-settings'], queryFn: async () => (await apiClient.get('pms/booking-settings/')).data });
  const settings = (list?.results || list || [])[0];
  const [f, setF] = useState<any>({ enabled: false, currency: 'AOA', deposit_percent: 0, primary_color: '#1e3f66', welcome_text: '', cancellation_policy: '' });
  useEffect(() => { if (settings) setF({ ...settings }); }, [settings?.id]);

  const save = useMutation({
    mutationFn: async () => settings
      ? (await apiClient.patch(`pms/booking-settings/${settings.id}/`, f)).data
      : (await apiClient.post('pms/booking-settings/', f)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking-settings'] }),
    onError: (e: any) => alert(JSON.stringify(e?.response?.data)),
  });
  const rotate = useMutation({ mutationFn: async () => (await apiClient.post(`pms/booking-settings/${settings.id}/rotate_key/`, {})).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['booking-settings'] }) });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicLink = settings ? `${origin}/book/${settings.slug}` : '—';
  const clientLink = settings ? `${origin}/reserva/${settings.slug}` : '—';

  // Testador de disponibilidade
  const today = new Date();
  const d1 = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const d2 = new Date(today.getTime() + 9 * 864e5).toISOString().slice(0, 10);
  const [ci, setCi] = useState(d1); const [co, setCo] = useState(d2);
  const [avail, setAvail] = useState<any>(null);
  const test = async () => {
    if (!settings?.api_key) return alert('Guarde a configuração primeiro (gera a chave).');
    try { const r = await apiClient.get('pms/booking/availability/', { params: { key: settings.api_key, check_in: ci, check_out: co, adults: 2 } }); setAvail(r.data); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
  };

  return (
    <ClassicWindow title="Booking Engine — Reservas Online" icon={<Globe size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">API segura: o motor de reservas (cloud/site) consome a disponibilidade e cria reservas via chave · o SQL nunca é exposto</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        {/* Config */}
        <div className="bg-white border border-[#c0c0c0] p-3">
          <div className="flex items-center gap-2 mb-3 text-[#1e3f66] font-bold text-[12px]"><Globe size={14} />Configuração do motor de reservas</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.enabled} onChange={e => setF({ ...f, enabled: e.target.checked })} /> Motor de reservas <b>ativo</b></label>
            <label className="flex items-center gap-2">Moeda <input className="border border-[#a0a0a0] px-2 py-1 w-24" value={f.currency || ''} onChange={e => setF({ ...f, currency: e.target.value })} /></label>
            <label className="flex items-center gap-2">Adiantamento % <input type="number" className="border border-[#a0a0a0] px-2 py-1 w-24" value={f.deposit_percent ?? 0} onChange={e => setF({ ...f, deposit_percent: e.target.value })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.payment_enabled} onChange={e => setF({ ...f, payment_enabled: e.target.checked })} /> Pagamento online</label>
            <label className="flex items-center gap-2">Gateway <select className="border border-[#a0a0a0] px-2 py-1" value={f.payment_provider || 'SIMULATED'} onChange={e => setF({ ...f, payment_provider: e.target.value })}><option value="SIMULATED">Simulado (testes)</option><option value="MULTICAIXA">Multicaixa Express</option><option value="EMIS">EMIS GPO</option><option value="STRIPE">Stripe</option><option value="PAYPAL">PayPal</option></select></label>
            <label className="flex items-center gap-2">Cor principal <input type="color" className="w-12 h-8 border border-[#a0a0a0]" value={f.primary_color || '#1e3f66'} onChange={e => setF({ ...f, primary_color: e.target.value })} /></label>
            <label className="flex items-center gap-2 col-span-2">Boas-vindas <input className="border border-[#a0a0a0] px-2 py-1 flex-1" value={f.welcome_text || ''} onChange={e => setF({ ...f, welcome_text: e.target.value })} /></label>
            <label className="flex items-center gap-2 col-span-2">Domínio personalizado (CNAME) <input className="border border-[#a0a0a0] px-2 py-1 flex-1" placeholder="reservas.hotelx.ao" value={f.custom_domain || ''} onChange={e => setF({ ...f, custom_domain: e.target.value })} /></label>
            <label className="flex items-center gap-2 col-span-2">Política de cancelamento <input className="border border-[#a0a0a0] px-2 py-1 flex-1" value={f.cancellation_policy || ''} onChange={e => setF({ ...f, cancellation_policy: e.target.value })} /></label>
          </div>
          <button className={`${btn} mt-3`} onClick={() => save.mutate()}>Guardar configuração</button>
        </div>

        {/* Links + chave + ligações do ecossistema */}
        {settings ? (
          <div className="bg-white border border-[#c0c0c0] p-3 text-[12px] space-y-2">
            <div className="flex items-center gap-2 flex-wrap"><Link2 size={14} className="text-[#1e3f66]" /><b>Site público de reservas:</b>
              <a href={publicLink} target="_blank" rel="noreferrer" className="font-mono text-[#1565c0] hover:underline">{publicLink}</a>
              <button className={btn} onClick={() => window.open(publicLink, '_blank')}>Abrir site →</button></div>
            <div className="flex items-center gap-2 flex-wrap"><Link2 size={14} className="text-[#1e3f66]" /><b>Área do cliente</b> (consultar/check-in/cancelar):
              <a href={clientLink} target="_blank" rel="noreferrer" className="font-mono text-[#1565c0] hover:underline">{clientLink}</a>
              <button className={btn} onClick={() => window.open(clientLink, '_blank')}>Abrir →</button></div>
            <div className="flex items-center gap-2"><KeyRound size={14} className="text-[#c9820a]" /><b>Chave da API:</b> <span className="font-mono bg-[#f4f4f4] px-2 py-0.5 border border-[#e0e0e0] break-all">{settings.api_key}</span>
              <button className="text-[#1565c0] hover:underline flex items-center gap-1" onClick={() => rotate.mutate()}><RefreshCw size={12} />rodar</button></div>
            <div className="text-[11px] text-gray-600 border-t border-[#eee] pt-2">
              <b>Ecossistema de reservas (tudo o que foi criado):</b> Site público ↑ · Área do cliente ↑ · <b>Channel Manager</b> (OTAs Booking/Expedia…) no Integration Center → "Channel Manager" · Reservas recebidas no <b>PMS → Reservas</b> · Pagamento online do adiantamento (acima).
            </div>
            <div className="text-[11px] text-gray-500">Fluxo: Site → Booking Engine → <b>API (esta chave)</b> → PMS → SQL. Domínio próprio via CNAME (ex.: <i>reservas.hotelx.ao</i>).</div>
          </div>
        ) : (
          <div className="bg-[#fff7e6] border border-[#e0c080] p-3 text-[11px] text-[#8a5a00]">Guarde a configuração acima para gerar o link do site público e a chave da API.</div>
        )}

        {/* Testador de disponibilidade */}
        <div className="bg-white border border-[#c0c0c0] p-3 text-[12px]">
          <div className="flex items-center gap-2 mb-2 text-[#1e3f66] font-bold"><Search size={14} />Testar disponibilidade (como o site faria)</div>
          <div className="flex items-end gap-2 mb-2">
            <label className="flex flex-col">Entrada<input type="date" className="border border-[#a0a0a0] px-2 py-1" value={ci} onChange={e => setCi(e.target.value)} /></label>
            <label className="flex flex-col">Saída<input type="date" className="border border-[#a0a0a0] px-2 py-1" value={co} onChange={e => setCo(e.target.value)} /></label>
            <button className={btn} onClick={test}><Calendar size={13} />Verificar</button>
          </div>
          {avail && (
            <div className="border border-[#e0e0e0]">
              <div className="grid grid-cols-[1fr_90px_110px_110px] font-bold bg-[#f0f0f0] px-2 py-1"><span>Tipo de quarto</span><span>Disponível</span><span className="text-right">€/noite</span><span className="text-right">Total</span></div>
              {(avail.rooms || []).map((r: any) => (
                <div key={r.room_type} className="grid grid-cols-[1fr_90px_110px_110px] px-2 py-1 border-b border-[#eee]"><span>{r.name} <span className="text-gray-400">({r.board})</span></span><span>{r.available}</span><span className="text-right">{money(r.price_per_night)}</span><span className="text-right font-bold">{money(r.total)}</span></div>
              ))}
              {(avail.rooms || []).length === 0 && <div className="px-2 py-2 text-gray-500">Sem disponibilidade para as datas.</div>}
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
