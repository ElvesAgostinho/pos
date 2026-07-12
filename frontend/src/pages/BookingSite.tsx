import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

const money = (v: any, cur = '') => `${Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${cur}`.trim();
const BOARD: Record<string, string> = { RO: 'Só alojamento', BB: 'Pequeno-almoço', HB: 'Meia pensão', FB: 'Pensão completa', AI: 'Tudo incluído' };

// Site PÚBLICO do motor de reservas — multi-tenant por slug, com a identidade do hotel.
export default function BookingSite() {
  const { slug } = useParams();
  const [cfg, setCfg] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const today = new Date();
  const [ci, setCi] = useState(new Date(today.getTime() + 864e5).toISOString().slice(0, 10));
  const [co, setCo] = useState(new Date(today.getTime() + 3 * 864e5).toISOString().slice(0, 10));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [confirmation, setConfirmation] = useState<any>(null);

  useEffect(() => {
    apiClient.get('pms/booking/config/', { params: { slug } })
      .then((r) => setCfg(r.data)).catch(() => setNotFound(true));
  }, [slug]);

  const color = cfg?.primary_color || '#1e3f66';
  const search = async () => {
    setBusy(true); setRooms(null);
    try { const r = await apiClient.get('pms/booking/availability/', { params: { slug, check_in: ci, check_out: co, adults, children } }); setRooms(r.data.rooms || []); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); } finally { setBusy(false); }
  };
  const reserve = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post('pms/booking/reserve/', { slug, room_type: picked.room_type, check_in: ci, check_out: co, adults, children, guest });
      setConfirmation(r.data); setPicked(null);
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro na reserva'); } finally { setBusy(false); }
  };

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-gray-500">Motor de reservas indisponível.</div>;
  if (!cfg) return <div className="min-h-screen flex items-center justify-center text-gray-400">A carregar…</div>;

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Hero */}
      <div className="relative h-64 md:h-80 flex items-end" style={{ background: cfg.hero_image_url ? `url(${cfg.hero_image_url}) center/cover` : `linear-gradient(135deg, ${color}, ${shade(color, -30)})` }}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative max-w-5xl mx-auto w-full px-6 pb-8 text-white">
          {cfg.logo_url && <img src={cfg.logo_url} alt="" className="h-12 mb-3" />}
          <h1 className="text-3xl md:text-5xl font-bold drop-shadow">{cfg.hotel}</h1>
          <p className="opacity-90 mt-1">{cfg.welcome_text || 'Reserve a sua estadia diretamente connosco.'}</p>
          <a href={`/reserva/${slug}`} className="inline-block mt-2 text-sm underline opacity-90 hover:opacity-100">A minha reserva →</a>
        </div>
      </div>

      {/* Barra de pesquisa */}
      <div className="max-w-5xl mx-auto px-6 -mt-8 relative">
        <div className="bg-white rounded-xl shadow-lg p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Field label="Entrada"><input type="date" value={ci} onChange={(e) => setCi(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></Field>
          <Field label="Saída"><input type="date" value={co} onChange={(e) => setCo(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></Field>
          <Field label="Adultos"><input type="number" min={1} value={adults} onChange={(e) => setAdults(+e.target.value)} className="w-full border rounded-lg px-3 py-2" /></Field>
          <Field label="Crianças"><input type="number" min={0} value={children} onChange={(e) => setChildren(+e.target.value)} className="w-full border rounded-lg px-3 py-2" /></Field>
          <button onClick={search} disabled={busy} className="h-[42px] rounded-lg text-white font-bold disabled:opacity-60" style={{ background: color }}>{busy ? '…' : 'Pesquisar'}</button>
        </div>
      </div>

      {/* Resultados */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {rooms === null && <p className="text-gray-400 text-center py-10">Escolha as datas e pesquise a disponibilidade.</p>}
        {rooms && rooms.length === 0 && <p className="text-gray-500 text-center py-10">Sem disponibilidade para as datas escolhidas.</p>}
        <div className="grid md:grid-cols-2 gap-4">
          {rooms?.map((r: any) => (
            <div key={r.room_type} className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
              <div className="h-32" style={{ background: `linear-gradient(135deg, ${shade(color, 20)}, ${shade(color, -20)})` }} />
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div><h3 className="font-bold text-lg">{r.name}</h3><p className="text-sm text-gray-500">Até {r.capacity} pessoas · {BOARD[r.board] || r.board}</p></div>
                  <div className="text-right"><div className="text-2xl font-bold" style={{ color }}>{money(r.price_per_night, cfg.currency)}</div><div className="text-xs text-gray-400">/ noite</div></div>
                </div>
                <div className="flex justify-between items-center mt-3">
                  <span className="text-sm text-gray-600">{r.nights} noite(s) · <b>{money(r.total, cfg.currency)}</b> · {r.available} disponível(is)</span>
                  <button onClick={() => setPicked(r)} className="px-4 py-2 rounded-lg text-white font-semibold" style={{ background: color }}>Reservar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cfg.cancellation_policy && <p className="text-xs text-gray-400 mt-6 text-center">Política de cancelamento: {cfg.cancellation_policy}</p>}
      </div>

      {/* Modal de reserva */}
      {picked && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPicked(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-1">Reservar {picked.name}</h3>
            <p className="text-sm text-gray-500 mb-4">{ci} → {co} · {picked.nights} noite(s) · <b>{money(picked.total, cfg.currency)}</b></p>
            <div className="space-y-3">
              <input placeholder="Nome completo" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <input placeholder="Email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <input placeholder="Telefone" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              {Number(cfg.deposit_percent) > 0 && <p className="text-sm text-gray-500">Adiantamento ({cfg.deposit_percent}%): <b>{money(Number(picked.total) * Number(cfg.deposit_percent) / 100, cfg.currency)}</b></p>}
              <button onClick={reserve} disabled={busy || !guest.name} className="w-full py-3 rounded-lg text-white font-bold disabled:opacity-60" style={{ background: color }}>{busy ? 'A reservar…' : 'Confirmar reserva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação */}
      {confirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl" style={{ background: '#1f9d55' }}>✓</div>
            <h3 className="text-xl font-bold">Reserva confirmada!</h3>
            <p className="text-gray-600 mt-2">Código: <b className="font-mono">{confirmation.confirmation}</b></p>
            <p className="text-gray-600">{confirmation.room_type} · {confirmation.check_in} → {confirmation.check_out}</p>
            <p className="text-gray-800 font-bold mt-2">Total: {money(confirmation.total, cfg.currency)}</p>
            {Number(confirmation.deposit_due) > 0 && <p className="text-sm text-gray-500">Adiantamento devido: {money(confirmation.deposit_due, cfg.currency)}</p>}
            <button onClick={() => { setConfirmation(null); setRooms(null); }} className="mt-5 px-5 py-2 rounded-lg text-white font-semibold" style={{ background: color }}>Nova pesquisa</button>
          </div>
        </div>
      )}
      <div className="text-center text-xs text-gray-400 py-6">Reservas seguras · {cfg.hotel}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="block"><span className="text-xs text-gray-500 mb-1 block">{label}</span>{children}</label>;
}
function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + pct));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + pct));
  const b = Math.max(0, Math.min(255, (n & 255) + pct));
  return `rgb(${r},${g},${b})`;
}
