import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

const money = (v: any, cur = '') => `${Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 0 })} ${cur}`.trim();

// Área do cliente — consultar / cancelar / check-in online (pública, por código + email).
export default function BookingManage() {
  const { slug } = useParams();
  const [cfg, setCfg] = useState<any>(null);
  const [conf, setConf] = useState('');
  const [email, setEmail] = useState('');
  const [res, setRes] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => { apiClient.get('pms/booking/config/', { params: { slug } }).then((r) => setCfg(r.data)).catch(() => {}); }, [slug]);
  const color = cfg?.primary_color || '#1e3f66';

  const lookup = async () => {
    setBusy(true); setMsg('');
    try { const r = await apiClient.get('pms/booking/reservation/', { params: { slug, confirmation: conf, email } }); setRes(r.data); }
    catch (e: any) { setRes(null); setMsg(e?.response?.data?.detail || 'Não encontrada.'); } finally { setBusy(false); }
  };
  const doAction = async (path: string, extra: any = {}) => {
    setBusy(true); setMsg('');
    try { const r = await apiClient.post(path, { slug, confirmation: conf, email, ...extra }); setRes(r.data); setMsg(r.data.detail); }
    catch (e: any) { setMsg(e?.response?.data?.detail || 'Erro'); } finally { setBusy(false); }
  };
  const payDeposit = async () => {
    setBusy(true); setMsg('');
    try {
      const init = (await apiClient.post('pms/booking/payment/initiate/', { slug, confirmation: conf, email })).data;
      // Gateway real: redirecionar para init.redirect_url. Simulado: confirma de imediato.
      if (init.simulated) {
        await apiClient.post('pms/booking/payment/confirm/', { slug, reference: init.reference });
        setMsg('Adiantamento pago com sucesso.');
        await lookup();
      } else if (init.redirect_url) { window.location.href = init.redirect_url; }
      else { setMsg(init.note || 'Gateway por configurar.'); }
    } catch (e: any) { setMsg(e?.response?.data?.detail || 'Erro no pagamento'); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          {cfg?.logo_url && <img src={cfg.logo_url} className="h-10 mx-auto mb-2" alt="" />}
          <h1 className="text-2xl font-bold" style={{ color }}>{cfg?.hotel || 'A minha reserva'}</h1>
          <p className="text-gray-500 text-sm">Consulte, faça check-in online ou cancele a sua reserva.</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          {!res ? (
            <div className="space-y-3">
              <input placeholder="Código de reserva (ex.: WEB…)" value={conf} onChange={(e) => setConf(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              <input placeholder="Email da reserva" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              <button onClick={lookup} disabled={busy || !conf} className="w-full py-3 rounded-lg text-white font-bold disabled:opacity-60" style={{ background: color }}>{busy ? '…' : 'Consultar reserva'}</button>
              {msg && <p className="text-red-600 text-sm text-center">{msg}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div><div className="text-xs text-gray-400">Código</div><div className="font-mono font-bold">{res.confirmation}</div></div>
                <span className="text-xs px-2 py-1 rounded-full text-white" style={{ background: res.status_code === 'CANCELLED' ? '#c0392b' : res.status_code === 'CHECKED_IN' ? '#1f9d55' : color }}>{res.status}</span>
              </div>
              <Line label="Hóspede" value={res.guest} />
              <Line label="Quarto" value={`${res.room_type}${res.room ? ` · Quarto ${res.room}` : ''}`} />
              <Line label="Estadia" value={`${res.check_in} → ${res.check_out} (${res.nights} noite(s))`} />
              <Line label="Pessoas" value={`${res.adults} adulto(s), ${res.children} criança(s)`} />
              <Line label="Total" value={money(res.total, cfg?.currency)} bold />
              {res.online_checkin && <p className="text-green-700 text-sm text-center bg-green-50 rounded py-1">✓ Check-in online concluído</p>}
              {res.status_code === 'BOOKED' && Number(cfg?.deposit_percent) > 0 && (
                res.deposit_paid
                  ? <p className="text-green-700 text-sm text-center bg-green-50 rounded py-1">✓ Adiantamento pago</p>
                  : <button onClick={payDeposit} disabled={busy} className="w-full py-2 rounded-lg text-white font-semibold" style={{ background: '#1f9d55' }}>Pagar adiantamento ({money(Number(res.total) * Number(cfg?.deposit_percent) / 100, cfg?.currency)})</button>
              )}

              {res.status_code === 'BOOKED' && (
                <div className="border-t pt-3 space-y-3">
                  {!res.online_checkin && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-gray-700">Check-in online (opcional)</div>
                      <input placeholder="Nº de documento/BI" value={doc} onChange={(e) => setDoc(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                      <input placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                      <button onClick={() => doAction('pms/booking/reservation/checkin/', { document_id: doc, phone })} disabled={busy} className="w-full py-2 rounded-lg text-white font-semibold" style={{ background: color }}>Fazer check-in online</button>
                    </div>
                  )}
                  <button onClick={() => { if (confirm('Cancelar esta reserva?')) doAction('pms/booking/reservation/cancel/'); }} disabled={busy} className="w-full py-2 rounded-lg border border-red-300 text-red-700 font-semibold hover:bg-red-50">Cancelar reserva</button>
                </div>
              )}
              {cfg?.cancellation_policy && <p className="text-xs text-gray-400">Política: {cfg.cancellation_policy}</p>}
              {msg && <p className="text-sm text-center" style={{ color }}>{msg}</p>}
              <button onClick={() => { setRes(null); setMsg(''); }} className="w-full text-sm text-gray-500 hover:underline">← Consultar outra reserva</button>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">Reservas seguras · {cfg?.hotel}</p>
      </div>
    </div>
  );
}

function Line({ label, value, bold }: any) {
  return <div className="flex justify-between text-sm border-b border-gray-100 py-1"><span className="text-gray-500">{label}</span><span className={bold ? 'font-bold' : 'font-medium'}>{value}</span></div>;
}
