import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Monitor, User, ChevronDown, Check, XCircle, Keyboard, RotateCcw, Power, Delete } from 'lucide-react';
import { authApi } from '../api/auth';
import { posMgmtApi } from '../api/posmgmt';

// ---------------------------------------------------------------------------
// Marca / identificação do terminal — EDITE aqui para a sua própria marca e
// nº de certificação AGT. Os valores abaixo replicam o ecrã de referência.
// ---------------------------------------------------------------------------
const BRAND = {
  version: 'System Mwana Lodge POS v1.0',
  cert: 'Programa certificado nº 0000 / AGT',
  instance: 'MWANA-LODGE',
};

const DEFAULT_PROPERTIES = [{ id: '1', name: 'Mwana Lodge' }];
const DEFAULT_AREAS = [
  { id: 'restaurante', name: 'Restaurante' },
  { id: 'esplanada', name: 'Esplanada' },
  { id: 'bar', name: 'Lobby Bar' },
];

const PosLoginModern: React.FC = () => {
  const [properties] = useState(DEFAULT_PROPERTIES);
  const [areas, setAreas] = useState(DEFAULT_AREAS);
  const [property, setProperty] = useState(DEFAULT_PROPERTIES[0].id);
  const [area, setArea] = useState(DEFAULT_AREAS[0].id);
  const [pin, setPin] = useState('');
  const [showPad, setShowPad] = useState(false);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    posMgmtApi.getOutlets()
      .then((os) => { if (os?.length) setAreas(os.map((o: any) => ({ id: String(o.id), name: o.name }))); })
      .catch(() => {});
  }, []);

  const fmt = (d: Date) => {
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const propName = properties.find((p) => p.id === property)?.name || '';

  const doLogin = async () => {
    if (pin.length === 0 || loading) return;
    setError(''); setLoading(true);
    try {
      localStorage.setItem('pos_property', property);
      localStorage.setItem('pos_area', area);
      await authApi.posLogin(pin);
      navigate('/pos/terminal');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'PIN inválido.');
      setPin('');
    } finally { setLoading(false); }
  };
  const key = (k: string) => {
    if (k === 'C') setPin('');
    else if (k === 'DEL') setPin((p) => p.slice(0, -1));
    else if (pin.length < 8) setPin((p) => p + k);
  };

  const sel = 'w-full h-11 bg-[#6f6f6f] border border-[#4d4d4d] rounded text-[#e8e8e8] text-lg pl-4 pr-10 appearance-none focus:outline-none focus:ring-2 focus:ring-[#7cbf30] shadow-[inset_0_1px_4px_rgba(0,0,0,0.35)]';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans select-none overflow-y-auto"
      style={{ background: 'radial-gradient(circle at 32% 38%, #6f6f6f 0%, #545454 38%, #3a3a3a 100%)' }}>
      <div className="pointer-events-none fixed inset-0 opacity-[0.12]"
        style={{ background: 'repeating-linear-gradient(115deg, transparent 0 55px, rgba(255,255,255,0.25) 55px 110px)' }} />

      <div className="relative w-full max-w-[440px] bg-[#2b2b2b] rounded-md overflow-hidden shadow-[0_14px_44px_rgba(0,0,0,0.7)] border border-[#181818]">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-b from-[#232323] to-[#040404] px-3 py-2 flex justify-between items-center">
          <div className="flex items-end leading-none">
            {localStorage.getItem('ui_login_logo')
              ? <img src={localStorage.getItem('ui_login_logo') as string} alt="Logótipo" className="h-8 object-contain" />
              : <span className="text-[30px] font-black tracking-tight"><span className="text-[#c9a400]">M</span><span className="text-white">L</span></span>}
          </div>
          <div className="text-right text-white">
            <div className="italic font-bold text-base tracking-wide">{BRAND.version}</div>
            <div className="italic font-semibold text-xs text-gray-200 mt-0.5">{fmt(now)}</div>
          </div>
        </div>

        {/* Corpo */}
        <div className="px-3 py-3 space-y-2">
          {/* Hotel */}
          <div className="flex items-center gap-2">
            <Home className="text-white w-7 h-7 flex-shrink-0" />
            <div className="relative flex-1">
              <select value={property} onChange={(e) => setProperty(e.target.value)} className={sel}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="text-gray-300 w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          {/* Outlet */}
          <div className="flex items-center gap-2">
            <Monitor className="text-white w-7 h-7 flex-shrink-0" />
            <div className="relative flex-1">
              <select value={area} onChange={(e) => setArea(e.target.value)} className={sel}>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown className="text-gray-300 w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          {/* PIN + limpar + teclado */}
          <div className="flex items-center gap-2">
            <User className="text-white w-7 h-7 flex-shrink-0" />
            <div className="flex-1 h-11 bg-[#6f6f6f] border border-[#4d4d4d] rounded flex items-center px-4 shadow-[inset_0_1px_4px_rgba(0,0,0,0.35)]">
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                className="bg-transparent w-full text-white text-2xl tracking-[0.35em] outline-none" placeholder="••••" />
            </div>
            <button onClick={() => setPin('')} className="w-8 h-8 rounded-full bg-[#8a8a8a] flex items-center justify-center hover:bg-[#9a9a9a] flex-shrink-0">
              <XCircle className="text-[#eee] w-6 h-6" />
            </button>
            <button onClick={() => setShowPad((s) => !s)}
              className="w-12 h-11 bg-gradient-to-b from-[#1f1f1f] to-[#000] border border-[#111] rounded flex items-center justify-center hover:from-[#333] flex-shrink-0">
              <Keyboard className="text-white w-7 h-7" />
            </button>
          </div>

          {error && <div className="text-red-400 text-center text-sm font-bold">{error}</div>}

          {/* Botão ✓ verde (largura toda) */}
          <button onClick={doLogin} disabled={loading}
            className="w-full h-12 rounded flex justify-center items-center border border-[#5c9e1f] bg-gradient-to-b from-[#8ccf3a] to-[#5f9a1e] shadow-[inset_0_2px_6px_rgba(255,255,255,0.35)] hover:from-[#98d84a] active:from-[#7ab52f] disabled:opacity-60">
            <Check className="text-white w-8 h-8" strokeWidth={4} />
          </button>

          {/* Teclado numérico (aparece ao clicar no ícone) */}
          {showPad && (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((n) => (
                <button key={n} onClick={() => key(n)} className="h-11 bg-[#444] text-white text-xl font-bold rounded hover:bg-[#555] active:bg-[#666]">{n}</button>
              ))}
              <button onClick={() => key('C')} className="h-11 bg-red-800 text-white font-bold rounded hover:bg-red-700">C</button>
              <button onClick={() => key('0')} className="h-11 bg-[#444] text-white text-xl font-bold rounded hover:bg-[#555]">0</button>
              <button onClick={() => key('DEL')} className="h-11 bg-yellow-700 text-white rounded hover:bg-yellow-600 flex items-center justify-center"><Delete className="w-5 h-5" /></button>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-3 pb-2 pt-0.5 flex justify-between items-end">
          <div className="leading-tight">
            <div className="text-white font-bold text-sm uppercase">{propName}</div>
            <div className="text-gray-400 text-xs uppercase mt-0.5">{BRAND.instance} ; {propName}</div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex gap-3 mb-0.5">
              <Monitor className="text-[#00d000] w-6 h-6" />
              <button onClick={() => window.location.reload()}><RotateCcw className="text-[#2b6bff] w-6 h-6" /></button>
              <button onClick={() => navigate('/')}><Power className="text-[#e10000] w-6 h-6" /></button>
            </div>
            <div className="text-gray-400 text-[10px] italic">{BRAND.cert}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PosLoginModern;
