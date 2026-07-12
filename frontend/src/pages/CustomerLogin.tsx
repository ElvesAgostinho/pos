import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, tokenStore } from '../api/auth';
import { apiClient } from '../api/client';
import { getAppearance } from '../config/appearance';
import { User, Lock, LogIn, Eye, EyeOff, Settings, Building2, X, Wifi } from 'lucide-react';

// Login estilo Primavera / Windows clássico — janela retangular, barra de título,
// imagem à esquerda, formulário à direita, barra de estado no rodapé.
const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState(() => localStorage.getItem('ui_last_user') || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(() => !!localStorage.getItem('ui_last_user'));
  const [autoLogin, setAutoLogin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  const company = getAppearance('companyName');
  const erpName = getAppearance('erpName');
  const welcome = getAppearance('welcome');
  const logo = getAppearance('logo');
  const loginBg = getAppearance('loginBg');
  const barColor = getAppearance('barColor') || '#1e3f66';

  useEffect(() => { tokenStore.clearBackoffice(); tokenStore.clearPos(); }, []);
  // Testa a ligação ao servidor (barra de estado).
  useEffect(() => {
    let alive = true;
    apiClient.get('licensing/status/').then(() => alive && setOnline(true)).catch((e) => {
      if (alive) setOnline(!!e?.response); // responde (mesmo 401/404) = servidor online
    });
    return () => { alive = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await authApi.backofficeLogin(username, password);
      if (remember) localStorage.setItem('ui_last_user', username); else localStorage.removeItem('ui_last_user');
      navigate('/backoffice');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Não foi possível iniciar sessão. Verifique as credenciais.');
    } finally { setLoading(false); }
  };

  const winBtn ='h-8 px-4 text-[13px] bg-[#e8e8e8] border border-[#8c8c8c] shadow-[inset_1px_1px_0_#fff] hover:bg-[#f2f2f2] active:shadow-[inset_1px_1px_0_#808080] active:translate-y-px';

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", background: loginBg ? undefined : 'linear-gradient(135deg,#4a6785 0%,#26374b 100%)' }}>
      {loginBg && <img src={loginBg} alt="" className="fixed inset-0 w-full h-full object-cover -z-10" />}
      {loginBg && <div className="fixed inset-0 bg-black/30 -z-10" />}

      {/* Janela de login */}
      <div className="w-[760px] max-w-full bg-[#f0f0f0] border border-[#4a6785] shadow-2xl">
        {/* Barra de título */}
        <div className="h-8 flex items-center justify-between px-2 text-white text-[13px] font-semibold" style={{ background: `linear-gradient(180deg, ${barColor} 0%, ${shade(barColor, -18)} 100%)` }}>
          <span className="flex items-center gap-2"><Building2 size={14} /> {erpName} — Início de Sessão</span>
          <button onClick={() => setConfig(true)} title="Configurações" className="w-6 h-6 flex items-center justify-center hover:bg-white/20"><Settings size={14} /></button>
        </div>

        <div className="flex">
          {/* Imagem / Branding (esquerda) */}
          <div className="hidden md:flex w-64 flex-shrink-0 flex-col items-center justify-center gap-4 p-6 border-r border-[#c0c0c0]"
            style={{ background: loginBg ? 'rgba(255,255,255,0.06)' : `linear-gradient(160deg, ${shade(barColor, 12)} 0%, ${shade(barColor, -24)} 100%)` }}>
            {logo ? <img src={logo} alt="Logo" className="max-h-24 max-w-[180px] object-contain" />
              : <div className="text-5xl font-black"><span className="text-[#c9a400]">M</span><span className="text-white">L</span></div>}
            <div className="text-center text-white">
              <div className="text-lg font-bold leading-tight">{company}</div>
              <div className="text-[11px] opacity-80 mt-1">{erpName}</div>
            </div>
          </div>

          {/* Formulário (direita) */}
          <div className="flex-1 p-6">
            <div className="text-[13px] text-gray-600 mb-4">{welcome}</div>
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <label className="text-[13px] text-gray-700 text-right">Empresa:</label>
                <div className="flex items-center gap-2 bg-white border border-[#7f9db9] h-9 px-2">
                  <Building2 size={14} className="text-gray-500" />
                  <select className="flex-1 outline-none text-[13px] bg-white">
                    <option>{company}</option>
                  </select>
                </div>

                <label className="text-[13px] text-gray-700 text-right">Utilizador:</label>
                <div className="flex items-center gap-1.5 bg-white border border-[#7f9db9] h-9 px-2">
                  <User size={14} className="text-gray-500" />
                  <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className="flex-1 outline-none text-[13px]" />
                </div>

                <label className="text-[13px] text-gray-700 text-right">Palavra-passe:</label>
                <div className="flex items-center gap-1.5 bg-white border border-[#7f9db9] h-9 px-2">
                  <Lock size={14} className="text-gray-500" />
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 outline-none text-[13px]" />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="text-gray-500 hover:text-gray-800">{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </div>

              <div className="pl-[118px] space-y-1 text-[12px] text-gray-700">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Memorizar utilizador</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={autoLogin} onChange={(e) => setAutoLogin(e.target.checked)} /> Entrar automaticamente</label>
              </div>

              {error && <div className="ml-[118px] text-[12px] text-red-700 bg-red-50 border border-red-200 px-2 py-1">{error}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setUsername(''); setPassword(''); setError(''); }} className={winBtn}>Cancelar</button>
                <button type="submit" disabled={loading || !username} className={`${winBtn} font-bold flex items-center gap-1.5 disabled:opacity-50`} style={{ background: '#dbe8ff' }}>
                  <LogIn size={14} />{loading ? 'A entrar…' : 'Entrar'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Barra de estado (rodapé) */}
        <div className="h-7 flex items-center gap-4 px-3 text-[11px] text-gray-700 border-t border-[#c0c0c0] bg-[#e4e4e4]">
          <span>Servidor: <b>localhost:8000</b></span>
          <span className="opacity-40">|</span>
          <span>Base: <b>ERP_2026</b></span>
          <span className="opacity-40">|</span>
          <span>Versão: <b>1.0.0</b></span>
          <div className="flex-1" />
          <span className="flex items-center gap-1">
            <Wifi size={12} className={online === false ? 'text-red-600' : 'text-green-600'} />
            Ligação: <b className={online === false ? 'text-red-700' : 'text-green-700'}>{online === null ? '…' : online ? 'Online' : 'Offline'}</b>
          </span>
        </div>
      </div>

      {/* Diálogo Configurações */}
      {config && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConfig(false)}>
          <div className="w-[420px] bg-[#f0f0f0] border border-[#4a6785] shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
            <div className="h-8 flex items-center justify-between px-2 text-white text-[13px] font-semibold" style={{ background: barColor }}>
              <span className="flex items-center gap-2"><Settings size={14} />Configurações de Ligação</span>
              <button onClick={() => setConfig(false)} className="w-6 h-6 flex items-center justify-center hover:bg-white/20"><X size={14} /></button>
            </div>
            <div className="p-4 space-y-2 text-[13px]">
              <Row label="Servidor SQL / API" value="localhost:8000" />
              <Row label="Base de dados" value="ERP_2026" />
              <Row label="Idioma" value="Português (Angola)" />
              <div className="flex items-center justify-between pt-2">
                <span className="flex items-center gap-1 text-[12px]"><Wifi size={13} className={online ? 'text-green-600' : 'text-red-600'} />{online ? 'Servidor acessível' : 'Sem ligação'}</span>
                <button onClick={() => { setOnline(null); apiClient.get('licensing/status/').then(() => setOnline(true)).catch((e) => setOnline(!!e?.response)); }} className={winBtn}>Testar ligação</button>
              </div>
              <div className="text-[11px] text-gray-500 pt-1">Para personalizar logo/imagem/cores use Administração → Aparência.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[130px_1fr] items-center gap-2"><span className="text-gray-600">{label}:</span><input readOnly value={value} className="h-8 px-2 bg-white border border-[#c0c0c0] text-gray-700 outline-none" /></div>;
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

export default CustomerLogin;
