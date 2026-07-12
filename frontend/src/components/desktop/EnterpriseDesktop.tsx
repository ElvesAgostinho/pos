import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ITEM_TITLES, moduleEnabled } from '../../config/navigation';
import { WORKSPACES, workspaceByKey } from '../../config/workspace';
import type { DeskIcon } from '../../config/workspace';
import { getAppearance } from '../../config/appearance';
import { tokenStore, authApi } from '../../api/auth';
import { useActiveModules } from '../../hooks/useActiveModules';
import ClassicIcon from './ClassicIcon';

// Ícones de estado (SVG estilo Windows — não emoji).

// Fundo temático de hotel (SVG — funciona offline; sobreposto pela cor do módulo).
function HotelBackdrop({ tint }: { tint: string }) {
  const windows = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 6; c++) {
    const lit = (r * 7 + c * 3) % 4 === 0;
    windows.push(<rect key={`a${r}${c}`} x={640 + c * 26} y={230 + r * 34} width="14" height="20" fill={lit ? '#ffd98a' : '#2a3a52'} opacity={lit ? 0.9 : 0.5} />);
  }
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    const lit = (r + c) % 3 === 0;
    windows.push(<rect key={`b${r}${c}`} x={470 + c * 24} y={360 + r * 34} width="12" height="18" fill={lit ? '#ffd98a' : '#2a3a52'} opacity={lit ? 0.85 : 0.45} />);
  }
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" style={{ opacity: 0.55 }}>
      <defs><radialGradient id="glow" cx="50%" cy="100%" r="70%"><stop offset="0%" stopColor="#e6b45a" stopOpacity="0.35" /><stop offset="60%" stopColor={tint} stopOpacity="0" /></radialGradient></defs>
      <rect x="0" y="0" width="1000" height="600" fill="url(#glow)" />
      {/* prédios */}
      <rect x="450" y="330" width="130" height="270" fill="#16233a" />
      <rect x="620" y="190" width="200" height="410" fill="#1b2c46" />
      <rect x="820" y="300" width="120" height="300" fill="#12203a" />
      <rect x="620" y="170" width="200" height="22" fill="#0e1c30" />
      {/* letreiro do hotel */}
      <text x="720" y="215" fontSize="16" fill="#ffd98a" textAnchor="middle" fontFamily="Georgia" opacity="0.85" letterSpacing="2">HOTEL</text>
      {windows}
      {/* reflexo no chão */}
      <rect x="0" y="560" width="1000" height="40" fill="#000" opacity="0.25" />
    </svg>
  );
}

export default function EnterpriseDesktop({ onOpen }: { onOpen: (screen: string, module: string) => void }) {
  const nav = useNavigate();
  const { data: lic } = useActiveModules();
  const user = tokenStore.getUser();
  const erpName = getAppearance('erpName') || 'System Mwana Lodge';
  const customBg = getAppearance('wallpaper') || getAppearance('loginBg');

  const active = lic?.active || [];
  const licensed = useMemo(() => WORKSPACES.filter((w) => moduleEnabled(w.licenseModule, active)), [lic]);
  const [wsKey, setWsKey] = useState('');
  useEffect(() => { if (!wsKey && licensed.length) setWsKey(licensed[0].key); }, [licensed, wsKey]);
  const ws = workspaceByKey(wsKey) || licensed[0] || WORKSPACES[0];

  const [modMenu, setModMenu] = useState(false);
  const [topMenu, setTopMenu] = useState<string | null>(null);
  const [start, setStart] = useState(false);
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(t); }, []);

  const [recent, setRecent] = useState<{ screen: string; label: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('recent_screens') || '[]'); } catch { return []; }
  });
  const open = (screen?: string, label?: string) => {
    if (!screen) return;
    const item = { screen, label: label || ITEM_TITLES[screen] || screen };
    const next = [item, ...recent.filter((r) => r.screen !== screen)].slice(0, 6);
    setRecent(next); localStorage.setItem('recent_screens', JSON.stringify(next));
    setStart(false); setTopMenu(null); setModMenu(false);
    onOpen(screen, wsKey);
  };
  const openIcon = (ic: DeskIcon) => { if (ic.launch) window.open(ic.launch, '_blank', 'noopener'); else open(ic.screen, ic.label); };
  const logout = async () => { await authApi.logout(); nav('/backoffice/login'); };
  const closeAll = () => { setModMenu(false); setTopMenu(null); setStart(false); };

  const quick = ws.icons.filter((i) => i.quick);   // atalhos do ambiente de trabalho

  // Dropdowns REAIS da barra de cima — OS MESMOS DO POS (F&B, Marketing, Reporting,
  // Utilitários). Antes eram outros (Favoritos/Recentes/Relatórios/Ferramentas): o
  // sistema tinha dois vocabulários para as mesmas coisas, e quem aprendia um não
  // reconhecia o outro.
  const MENUS: Record<string, { label: string; screen?: string; act?: () => void }[]> = {
    'F&B': [
      { label: 'Compras', screen: 'proc_po' },
      { label: 'Documentos Internos', screen: 'doc_center' },
      { label: 'Inventário', screen: 'wh_inventory' },
      { label: 'Existências Stock', screen: 'wh_stock' },
      { label: 'Contas a pagar', screen: 'fin_ledger' },
      { label: 'Artigos', screen: 'posc_config' },
    ],
    Marketing: [
      { label: 'Promoções', screen: 'com_promotions' },
      { label: 'Campanhas', screen: 'com_campaigns' },
      { label: 'Fidelização', screen: 'com_loyalty' },
    ],
    Reporting: [
      { label: 'Relatórios', screen: ws.key === 'pms' ? 'rep_hotel' : ws.key === 'restauracao' ? 'rep_fnb' : 'rep_pos' },
      { label: 'Informação Online', screen: 'ops_dashboard' },
      { label: 'Pesquisar Documentos', screen: 'doc_center' },
    ],
    Utilitários: [
      { label: 'POS Front Office', act: () => window.open('/pos/terminal', '_blank', 'noopener') },
      { label: 'Fecho do Dia', screen: 'pms_nightaudit' },
      { label: 'Contas Correntes', screen: 'fin_cash' },
      { label: 'SAFT-AO', screen: 'fis_saft' },
      { label: 'Configuração POS', screen: 'posc_config' },
      { label: 'Diagnóstico', screen: 'sys_diagnostics' },
      { label: 'Terminar sessão', act: logout },
    ],
  };

  const bgStyle = customBg
    ? { backgroundImage: `linear-gradient(${ws.color}66, ${ws.colorDark}cc), url(${customBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: ws.wallpaper };

  return (
    <div className="h-screen w-screen overflow-hidden select-none font-sans relative flex flex-col" style={bgStyle} onClick={closeAll}>
      {!customBg && <HotelBackdrop tint={ws.color} />}

      {/* ===== BARRA SUPERIOR ===== */}
      {/* A MESMA barra do POS: mesmo fundo, mesma altura, mesma tipografia. Ter duas
          barras diferentes para a mesma coisa obrigava a aprender o sistema duas vezes. */}
      <div className="h-[56px] flex items-center px-3 gap-1 flex-shrink-0 relative z-[100] text-white"
        style={{ background: '#2b2b2b', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
        {/* Logo 3D = seletor de módulos */}
        <button onClick={(e) => { e.stopPropagation(); setModMenu((s) => !s); setTopMenu(null); }}
          title="Trocar de módulo"
          className={`flex items-center gap-2 px-2 py-1 pr-4 mr-2 leading-none ${modMenu ? 'bg-white/15' : 'hover:bg-white/10'}`}>
          <span className="text-[30px] font-black tracking-tight select-none"
            style={{
              background: 'linear-gradient(180deg,#ffd75e 0%,#c9a400 55%,#8a6f00 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              textShadow: '0 1px 0 rgba(255,255,255,.35), 0 3px 6px rgba(0,0,0,.55)',
              filter: 'drop-shadow(0 2px 1px rgba(0,0,0,.6))',
            }}>
            {erpName}
          </span>
          <span className="text-[10px] text-[#9a9a9a] pb-1">Mwana Lodge ▾</span>
        </button>
        {modMenu && (
          <div className="absolute left-2 top-[46px] min-w-[240px] bg-[#f0f0f0] border border-[#333] shadow-2xl rounded-b-md overflow-hidden z-[120]" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-[11px] font-bold text-white" style={{ background: ws.color }}>{erpName} — Módulos</div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => { setWsKey(m.key); setModMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-[#dbe8ff] text-left border-b border-[#e0e0e0]">
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: `radial-gradient(circle at 30% 30%, ${m.glow}, ${m.color})`, boxShadow: `0 0 6px ${m.glow}` }} />
                <span className="font-bold" style={{ color: m.color }}>{m.name}</span>
                {m.key === wsKey && <span className="ml-auto text-[11px] text-gray-500">● ativo</span>}
              </button>
            ))}
          </div>
        )}

        {/* Menus de topo (dropdowns reais) */}
        {Object.keys(MENUS).map((m) => (
          <div key={m} className="relative">
            <button onClick={(e) => { e.stopPropagation(); setTopMenu((o) => (o === m ? null : m)); setModMenu(false); }}
              onMouseEnter={() => topMenu && setTopMenu(m)}
              className={`px-4 py-2 text-[15px] font-semibold ${topMenu === m ? 'bg-white/15' : 'hover:bg-white/10'}`}>
              {m} ▾
            </button>
            {topMenu === m && (
              <div className="absolute left-0 top-full min-w-[260px] py-1 shadow-2xl z-[120]"
                style={{ background: '#2b2b2b', border: '1px solid #444' }} onClick={(e) => e.stopPropagation()}>
                {MENUS[m].map((it, i) => (
                  <button key={i} onClick={() => it.act ? (it.act(), setTopMenu(null)) : open(it.screen, it.label)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#3d6ea5]">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#c9a400]" />{it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-4 text-[13px]">
          <span className="text-[#e05555] font-semibold">
            {clock.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span className="opacity-30">|</span>
          <span className="font-bold">{user?.username || 'operador'}</span>
        </div>
      </div>

      {/* ===== ÁREA DE TRABALHO ===== */}
      <div className="flex-1 relative overflow-hidden">
        {/* Poucos ícones — consulta rápida */}
        <div className="absolute top-5 left-5 grid gap-5 content-start" style={{ gridTemplateRows: 'repeat(3, auto)', gridAutoFlow: 'column' }}>
          {quick.map((ic, i) => (
            <DesktopIcon key={i} ic={ic} accent={ws.accent} glow={ws.glow} onOpen={() => openIcon(ic)} />
          ))}
        </div>

        {/* Painel direito — só consultas rápidas */}
        <div className="absolute top-5 right-5 w-[220px] flex flex-col gap-2.5">
          <div className="bg-black/40 backdrop-blur-sm border border-white/15 rounded-lg p-3 text-white text-center" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
            <div className="text-[30px] font-black leading-none" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>{clock.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-[11px] text-white/70 mt-1">{clock.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
          <div className="bg-black/40 border border-white/15 rounded-lg p-3 text-white text-[12px] space-y-1.5">
            <div className="font-bold text-[11px] uppercase text-white/60 mb-1">{ws.name} · Estado</div>
            {[['Licença', '✓ ativa'], ['Servidor', 'online'], ['VPN', 'ligada']].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-white/60">{k}</span><span className="text-[#9dffb0]">{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== BARRA DE TAREFAS ===== */}
      <div className="h-[40px] flex items-center px-1.5 gap-1 flex-shrink-0 relative z-[100]"
        style={{ background: `linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(0,0,0,0.22)), linear-gradient(to bottom, ${ws.colorDark}, #070f18)`, borderTop: `2px solid ${ws.accent}`, boxShadow: `0 -3px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)` }}>
        <button onClick={(e) => { e.stopPropagation(); setStart((s) => !s); }} className="flex items-center gap-1.5 px-3 h-[30px] rounded font-bold text-white text-[13px]"
          style={{ background: `linear-gradient(to bottom, ${ws.glow}33, rgba(0,0,0,0.15))`, border: `1px solid ${ws.accent}66` }}>
          <span className="text-[15px]">⊞</span> Iniciar
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <span className="text-white/70 text-[12px] px-2">{ws.name}</span>
        <div className="flex-1" />
        <div className="px-3 text-white text-[12px] font-semibold flex items-center gap-1.5" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
          <span className="w-2 h-2 rounded-full bg-[#7CFC98]" /> {clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* ===== MENU INICIAR (todas as apps do módulo) ===== */}
      {start && (
        <div className="absolute bottom-[40px] left-1.5 w-[320px] bg-[#f0f0f0] border border-[#333] shadow-2xl z-[130] rounded-t-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3 text-white" style={{ background: `linear-gradient(to bottom, ${ws.accent}, ${ws.color})` }}>
            <div className="font-black text-[15px]">{erpName}</div>
            <div className="text-[11px] text-white/80">{user?.username} · {ws.name}</div>
          </div>
          <div className="p-1.5">
            <div className="text-[10px] uppercase text-gray-500 px-2 py-1">Aplicações — {ws.name}</div>
            <div className="grid grid-cols-2 gap-0.5 max-h-[300px] overflow-auto">
              {ws.icons.map((ic, i) => (
                <button key={i} onClick={() => openIcon(ic)} className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-[#dbe8ff] text-left rounded">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ws.accent }} />{ic.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-[#d0d0d0] flex">
            <button onClick={() => { localStorage.setItem('ui_shell', 'classic'); onOpen('home:admin', wsKey); }} className="flex-1 px-3 py-2 text-[12px] hover:bg-[#e4e4e4] text-left">⚙ Backoffice clássico</button>
            <button onClick={logout} className="px-4 py-2 text-[12px] hover:bg-[#c0392b] hover:text-white text-left">⏻ Sair</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ícone de desktop 3D/gloss clássico.
function DesktopIcon({ ic, accent, glow, onOpen }: { ic: DeskIcon; accent: string; glow: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-[96px] flex flex-col items-center gap-1.5 group focus:outline-none" title={ic.label}>
      <div className="relative w-[66px] h-[66px] rounded-[15px] flex items-center justify-center transition-all group-active:scale-95 group-hover:scale-[1.06]"
        style={{ background: `linear-gradient(160deg, ${glow} 0%, ${accent} 45%, ${accent} 62%, rgba(0,0,0,0.35) 100%)`, boxShadow: '0 4px 8px rgba(0,0,0,0.5), inset 0 1.5px 1px rgba(255,255,255,0.7), inset 0 -4px 8px rgba(0,0,0,0.35)', border: '1px solid rgba(0,0,0,0.45)' }}>
        <div className="absolute top-0 left-1 right-1 h-[26px] rounded-t-[13px] pointer-events-none" style={{ background: 'linear-gradient(rgba(255,255,255,0.45), rgba(255,255,255,0))' }} />
        {ic.img ? <img src={`/icons/${ic.img}`} alt="" className="w-11 h-11 relative" /> : <div className="relative"><ClassicIcon name={ic.icon} /></div>}
      </div>
      <span className="text-white text-[11px] text-center leading-tight px-0.5 font-semibold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}>{ic.label}</span>
    </button>
  );
}
