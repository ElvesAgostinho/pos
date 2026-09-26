import { useState, useEffect, useMemo } from 'react';
import { X, Settings, Power, LogOut, ShieldCheck, Server, Wifi, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ITEM_TITLES, moduleEnabled } from '../../config/navigation';
import { WORKSPACES, workspaceByKey } from '../../config/workspace';
import type { DeskIcon } from '../../config/workspace';
import { getAppearance } from '../../config/appearance';
import { accentGradient } from '../../config/theme';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { tokenStore, authApi } from '../../api/auth';
import { useActiveModules } from '../../hooks/useActiveModules';
import ClassicIcon from './ClassicIcon';
import { MENUS as PMS_MENU_GROUPS } from '../pms/PmsShell';

// Fundo ambiente do Ambiente de Trabalho — manchas de cor desfocadas (mesh gradient,
// linguagem de dashboards modernos) nas cores do próprio módulo, com uma silhueta de
// hotel em traço fino, subtil, só decorativa (não protagonista como antes: já não é
// uma grelha de janelas pixeladas a competir com os ícones).
function HotelBackdrop({ tint, accent, glow }: { tint: string; accent: string; glow: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute rounded-full" style={{ width: 620, height: 620, left: '-8%', top: '-18%', background: glow, opacity: 0.22, filter: 'blur(120px)' }} />
      <div className="absolute rounded-full" style={{ width: 560, height: 560, right: '-10%', top: '10%', background: accent, opacity: 0.18, filter: 'blur(130px)' }} />
      <div className="absolute rounded-full" style={{ width: 480, height: 480, left: '30%', bottom: '-22%', background: tint, opacity: 0.28, filter: 'blur(140px)' }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" style={{ opacity: 0.16 }}>
        <path d="M470 600 V330 h130 V190 h60 V180 h140 V190 h60 V300 h120 V600"
          fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
        <text x="700" y="160" fontSize="15" fill="#FFFFFF" textAnchor="middle" fontFamily="Georgia" letterSpacing="3">HOTEL</text>
      </svg>
    </div>
  );
}

export default function EnterpriseDesktop({ onOpen }: { onOpen: (screen: string, module: string) => void }) {
  const nav = useNavigate();
  const { data: lic } = useActiveModules();
  const user = tokenStore.getUser();
  const erpName = getAppearance('erpName');
  const customBg = getAppearance('wallpaper') || getAppearance('loginBg');
  // Logótipo real da empresa (Administração → Empresa) — o ambiente de trabalho só
  // mostrava a palavra "System Mwana Lodge" estilizada, nunca a imagem que o dono
  // carregou lá. Mesma fonte que o login e os documentos fiscais usam.
  const [logoUrl, setLogoUrl] = useState('');
  useEffect(() => {
    apiClient.get('platform/branding/').then((r) => setLogoUrl(r.data?.logo_url || '')).catch(() => {});
  }, []);

  const active = lic?.active || [];
  const licensed = useMemo(() => WORKSPACES.filter((w) => moduleEnabled(w.licenseModule, active)), [lic]);
  const [wsKey, setWsKey] = useState('');
  useEffect(() => { if (!wsKey && licensed.length) setWsKey(licensed[0].key); }, [licensed, wsKey]);
  const ws = workspaceByKey(wsKey) || licensed[0] || WORKSPACES[0];

  const [modMenu, setModMenu] = useState(false);
  const [topMenu, setTopMenu] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
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
  const closeAll = () => { setModMenu(false); setTopMenu(null); setStart(false); setUserMenu(false); };

  const quick = ws.icons.filter((i) => i.quick);   // atalhos do ambiente de trabalho

  // MÓDULOS CONFIGURADOS (Configuração POS › Módulo): os que têm "Mostrar no Desktop"
  // aparecem aqui como atalhos, e as caixas "iframe / janela externa / widget" decidem
  // COMO abrem. Era configuração gravada que o Desktop ignorava.
  const { data: modulos = [] } = useQuery({
    queryKey: ['desk-modules'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/modules/');
      return ((r.data?.results || r.data || []) as any[])
        .filter((m) => m.is_active && m.show_on_desktop);
    },
  });
  // janela embebida (iframe) ou widget — abertos por cima do ambiente de trabalho
  const [embutido, setEmbutido] = useState<{ title: string; url: string; widget?: boolean } | null>(null);

  const MOD_ROTA: Record<string, { url?: string; sec?: string }> = {
    'mwana-pos-front': { url: '/pos/terminal' },
    'mwana-pos-config': { sec: 'articles' },
    'mwana-reporting': { sec: 'x_reports' },
    'mwana-search': { sec: 'x_entities' },
    'mwana-stock': { sec: 'x_stock' },
    'mwana-fiscal': { sec: 'x_saft' },
  };
  const abrirModulo = (m: any) => {
    const rota = MOD_ROTA[m.module_id] || {};
    const comoAbre = m.is_external_window ? 'external' : m.is_iframe ? 'iframe'
      : m.is_widget ? 'widget' : 'screen';
    if (rota.sec) localStorage.setItem('posc_section', rota.sec);
    const url = rota.url || '/backoffice#posc_config';
    if (comoAbre === 'external') return window.open(url, '_blank', 'noopener');
    if (comoAbre === 'iframe') return setEmbutido({ title: m.name, url });
    if (comoAbre === 'widget') return setEmbutido({ title: m.name, url, widget: true });
    if (rota.url) return window.open(rota.url, '_blank', 'noopener');   // ecrãs fora do backoffice
    open('posc_config', m.name);
  };

  // Dropdowns REAIS da barra de cima — OS MESMOS DO POS (F&B, Marketing, Reporting,
  // Utilitários). Antes eram outros (Favoritos/Recentes/Relatórios/Ferramentas): o
  // sistema tinha dois vocabulários para as mesmas coisas, e quem aprendia um não
  // reconhecia o outro.
  // Abre uma SECÇÃO do POS. Estes menus são os do POS: Compras, Inventário, Stock,
  // Contas a Pagar, Relatórios — tudo isso vive DENTRO do POS. Mandá-los para o
  // Procurement ou para o Warehouse era abrir outro módulo com outro vocabulário
  // para a mesma coisa (e um cliente que só comprou o POS nem sequer os tem).
  const abrirPos = (seccao: string) => {
    localStorage.setItem('posc_section', seccao);
    open('posc_config', 'Configuração POS');
  };

  const POS_MENUS: Record<string, { label: string; screen?: string; act?: () => void }[]> = {
    'F&B': [
      { label: 'Compras', act: () => abrirPos('x_purchases') },
      { label: 'Documentos Internos', act: () => abrirPos('x_internal') },
      { label: 'Inventário', act: () => abrirPos('x_inventory') },
      { label: 'Existências Stock', act: () => abrirPos('x_stock') },
      { label: 'Contas a pagar', act: () => abrirPos('x_payables') },
      { label: 'Artigos', act: () => abrirPos('articles') },
    ],
    Marketing: [
      { label: 'Pesquisa de Entidades', act: () => abrirPos('x_entities') },
      { label: 'Pedidos de eventos', act: () => abrirPos('x_events') },
      { label: 'Modelos de E-mail', act: () => abrirPos('m_templates') },
      { label: 'Códigos de Seleção', act: () => abrirPos('m_selcodes') },
    ],
    Reporting: [
      { label: 'Relatórios', act: () => abrirPos('x_reports') },
      { label: 'Informação Online', act: () => abrirPos('x_online') },
      { label: 'Pesquisar Documentos', act: () => abrirPos('x_docsearch') },
    ],
    Utilitários: [
      { label: 'POS Front Office', act: () => window.open('/pos/terminal', '_blank', 'noopener') },
      { label: 'Fecho do Dia', act: () => abrirPos('x_dayclose') },
      { label: 'Contas Correntes', act: () => abrirPos('x_accounts') },
      { label: 'SAFT-AO', act: () => abrirPos('x_saft') },
      { label: 'Configuração POS', act: () => abrirPos('articles') },
      { label: 'Papel de Parede', act: () => open('adm_appearance', 'Papel de Parede') },
      { label: 'Diagnóstico', act: () => abrirPos('x_diag') },
      { label: 'Terminar sessão', act: logout },
    ],
  };

  // O PMS tem os SEUS PRÓPRIOS menus aqui — construídos a partir da MESMA lista
  // que o PmsShell usa (PMS_MENU_GROUPS, importado), nunca uma cópia manual: uma
  // cópia à mão desincroniza sempre que o PmsShell muda (foi exatamente isso que
  // fazia aparecer "Check-Out ainda não está construído" aqui muito depois de o
  // Check-Out já estar pronto lá dentro — duas listas a dizerem coisas diferentes
  // sobre o mesmo PMS). Construído entra logo na secção certa (localStorage
  // 'pms_section', mesmo padrão do abrirPos acima); 'POS Front Office' é o único
  // item com 'url' em vez de 'section' e abre numa aba nova, como no PmsShell.
  const abrirPms = (seccao: string) => {
    localStorage.setItem('pms_section', seccao);
    open('pms_home', 'PMS');
  };
  const PMS_MENUS: Record<string, { label: string; screen?: string; act?: () => void }[]> = Object.fromEntries(
    PMS_MENU_GROUPS.map((grupo) => [
      grupo.title,
      grupo.items.map((it) => ({
        label: it.label,
        act: it.url ? () => window.open(it.url, '_blank', 'noopener') : () => abrirPms(it.section!),
      })),
    ]),
  );
  // "Papel de Parede" e "Terminar sessão" são ações do Ambiente de Trabalho em si
  // (não secções do PMS) — continuam à parte, acrescentadas ao grupo Utilitários.
  PMS_MENUS['Utilitários'] = [
    ...PMS_MENUS['Utilitários'],
    { label: 'Papel de Parede', act: () => open('adm_appearance', 'Papel de Parede') },
    { label: 'Terminar sessão', act: logout },
  ];

  const MENUS = wsKey === 'pms' ? PMS_MENUS : POS_MENUS;

  const bgStyle = customBg
    ? { backgroundImage: `linear-gradient(${ws.color}66, ${ws.colorDark}cc), url(${customBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: ws.wallpaper };

  return (
    <div className="h-screen w-screen overflow-hidden select-none font-sans relative flex flex-col" style={bgStyle} onClick={closeAll}>
      {!customBg && <HotelBackdrop tint={ws.color} accent={ws.accent} glow={ws.glow} />}

      {/* ===== BARRA SUPERIOR ===== */}
      {/* A MESMA barra do POS: mesmo fundo, mesma altura, mesma tipografia. Ter duas
          barras diferentes para a mesma coisa obrigava a aprender o sistema duas vezes. */}
      <div className="h-[56px] flex items-center px-3 gap-1 flex-shrink-0 relative z-[100] text-white"
        style={{ background: accentGradient(), fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
        {/* Logo = seletor de módulos. O logótipo próprio da instalação (Empresa →
            Imagem do Hotel) substitui o de fábrica automaticamente; sem ele, mostra-se
            o logótipo do sistema em vez de um "ML" escrito por cima da barra. */}
        <button onClick={(e) => { e.stopPropagation(); setModMenu((s) => !s); setTopMenu(null); }}
          title="Trocar de módulo"
          className={`flex items-center gap-2 px-2.5 py-1 pr-3.5 mr-2 leading-none rounded-full transition-colors ${modMenu ? 'bg-white/20' : 'hover:bg-white/10'}`}>
          {logoUrl ? <img src={logoUrl} alt="" className="h-10 w-10 object-contain flex-shrink-0 rounded-full" /> : <Building2 size={22} className="flex-shrink-0" />}
          <span className="text-[13px] text-white">▾</span>
        </button>
        {modMenu && (
          <div className="absolute left-2 top-[50px] min-w-[240px] bg-[#F7FAFA] border border-[#041F24] shadow-2xl rounded-2xl overflow-hidden z-[120]" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-[11px] font-bold text-white" style={{ background: ws.color }}>{erpName} — Módulos</div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => { setWsKey(m.key); setModMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-[#F7FAFA] text-left border-b border-[#EEF4F5] last:border-b-0">
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
                style={{ background: '#062A31', border: '1px solid #062A31' }} onClick={(e) => e.stopPropagation()}>
                {MENUS[m].map((it, i) => (
                  <button key={i} onClick={() => it.act ? (it.act(), setTopMenu(null)) : open(it.screen, it.label)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#5C8891]">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#062A31]" />{it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-3 text-[13px]">
          <span className="text-[#B0392B] font-semibold">
            {clock.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span className="opacity-30">|</span>
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setUserMenu((s) => !s); setModMenu(false); setTopMenu(null); }}
              className={`font-bold px-2 py-1 -mx-2 ${userMenu ? 'bg-white/15' : 'hover:bg-white/10'}`}>
              {user?.username || 'operador'}
            </button>
            {userMenu && (
              <div className="absolute right-0 top-[34px] min-w-[190px] bg-[#F7FAFA] border border-[#041F24] shadow-2xl z-[120]" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-2 text-[11px] font-bold text-white" style={{ background: accentGradient() }}>
                  {user?.username || 'operador'}
                </div>
                <button onClick={() => { setUserMenu(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-left hover:bg-[#F7FAFA] text-[#B0392B] font-semibold">
                  <LogOut size={14} /> Terminar sessão
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== ÁREA DE TRABALHO ===== */}
      <div className="flex-1 relative overflow-hidden">
        {/* Poucos ícones — consulta rápida */}
        <div className="absolute top-5 left-5 grid gap-5 content-start" style={{ gridTemplateRows: 'repeat(3, auto)', gridAutoFlow: 'column' }}>
          {quick.map((ic, i) => (
            <DesktopIcon key={i} ic={ic} accent={ws.accent} glow={ws.glow} onOpen={() => openIcon(ic)} />
          ))}
          {/* MÓDULOS com "Mostrar no Desktop" — abrem como a ficha manda (open_as).
              São do backoffice POS (Configuração POS › Módulo) — no ambiente de
              trabalho do PMS não aparecem, o PMS é autossuficiente e traz só o seu
              próprio ícone. */}
          {wsKey !== 'pms' && modulos.map((m: any) => (
            <DesktopIcon key={m.module_id}
              ic={{ label: m.name, icon: 'app' } as any}
              accent={ws.accent} glow={ws.glow} onOpen={() => abrirModulo(m)} />
          ))}
        </div>

        {/* JANELA EMBEBIDA (iframe) ou WIDGET — a caixa da ficha do módulo decide */}
        {embutido && (
          <div className={embutido.widget
            ? 'absolute bottom-14 right-5 w-[460px] h-[340px] z-[90] shadow-2xl border border-white/30 rounded overflow-hidden bg-black'
            : 'absolute inset-6 z-[90] shadow-2xl border border-white/30 rounded overflow-hidden bg-black'}>
            <div className="h-[34px] flex items-center justify-between px-3 text-white text-[13px] font-bold"
              style={{ background: ws.colorDark }}>
              <span>{embutido.title}{embutido.widget ? ' (widget)' : ''}</span>
              <button onClick={() => setEmbutido(null)} className="hover:bg-white/20 px-2"><X size={15} /></button>
            </div>
            <iframe src={embutido.url} title={embutido.title}
              className="w-full bg-white" style={{ height: 'calc(100% - 34px)', border: 0 }} />
          </div>
        )}

        {/* Painel direito — só consultas rápidas */}
        <div className="absolute top-5 right-5 w-[220px] flex flex-col gap-2.5">
          <div className="bg-black/35 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-white text-center" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.25)' }}>
            <div className="text-[30px] font-black leading-none" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>{clock.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-[11px] text-white/70 mt-1">{clock.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
          <div className="bg-black/35 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 text-white text-[12px] space-y-2" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
            <div className="font-bold text-[11px] uppercase text-white/60 mb-1">{ws.name} · Estado</div>
            {[['Licença', ShieldCheck, 'ativa'], ['Servidor', Server, 'online'], ['VPN', Wifi, 'ligada']].map(([k, Icon, v]: any) => (
              <div key={k as string} className="flex items-center justify-between">
                <span className="text-white/60 flex items-center gap-1.5"><Icon size={13} strokeWidth={2} className="text-white/50" />{k}</span>
                <span className="text-[#EEF4F5] font-medium">{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== BARRA DE TAREFAS ===== */}
      <div className="h-[40px] flex items-center px-1.5 gap-1 flex-shrink-0 relative z-[100]"
        style={{ background: `linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(0,0,0,0.22)), linear-gradient(to bottom, ${ws.colorDark}, #062A31)`, borderTop: `2px solid ${ws.accent}`, boxShadow: `0 -3px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)` }}>
        <button onClick={(e) => { e.stopPropagation(); setStart((s) => !s); }} className="flex items-center gap-1.5 px-3.5 h-[30px] rounded-full font-bold text-white text-[13px] transition-colors"
          style={{ background: start ? `${ws.accent}55` : `${ws.glow}26`, border: `1px solid ${ws.accent}66` }}>
          <span className="text-[15px]">⊞</span> Iniciar
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <span className="text-white/70 text-[12px] px-2">{ws.name}</span>
        <div className="flex-1" />
        <div className="px-3 text-white text-[12px] font-semibold flex items-center gap-1.5" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
          <span className="w-2 h-2 rounded-full bg-[#CFE3E6]" /> {clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* ===== MENU INICIAR (todas as apps do módulo) ===== */}
      {start && (
        <div className="absolute bottom-[48px] left-1.5 w-[320px] bg-[#F7FAFA] border border-[#041F24] shadow-2xl z-[130] rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3.5 text-white" style={{ background: `linear-gradient(to bottom, ${ws.accent}, ${ws.color})` }}>
            <div className="font-black text-[15px]">{erpName}</div>
            <div className="text-[11px] text-white/80">{user?.username} · {ws.name}</div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] uppercase text-gray-500 px-1 py-1 font-semibold">Aplicações — {ws.name}</div>
            <div className="grid grid-cols-3 gap-1.5 max-h-[300px] overflow-auto p-0.5">
              {ws.icons.map((ic, i) => (
                <button key={i} onClick={() => openIcon(ic)} className="flex flex-col items-center gap-1 px-1.5 py-2.5 text-[11px] hover:bg-[#F7FAFA] text-center rounded-xl transition-colors">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(155deg, ${ws.accent}, ${ws.color})` }}>
                    <ClassicIcon name={ic.icon} size={18} />
                  </span>
                  <span className="leading-tight text-[#041F24]">{ic.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-[#EEF4F5] flex">
            <button onClick={() => { localStorage.setItem('ui_shell', 'classic'); onOpen('home:admin', wsKey); }} className="flex-1 px-3 py-2.5 text-[12px] hover:bg-[#EEF4F5] text-left flex items-center gap-1.5"><Settings size={13} /> Backoffice clássico</button>
            <button onClick={logout} className="px-4 py-2.5 text-[12px] hover:bg-[#B0392B] hover:text-white text-left flex items-center gap-1.5"><Power size={13} /> Sair</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ícone do Ambiente de Trabalho — tile plano moderno (fundo translúcido + vidro fosco),
// sem o bisel/gloss 3D de antes.
function DesktopIcon({ ic, accent, glow, onOpen }: { ic: DeskIcon; accent: string; glow: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-[96px] flex flex-col items-center gap-2 group focus:outline-none" title={ic.label}>
      <div className="relative w-[64px] h-[64px] rounded-[18px] flex items-center justify-center transition-all duration-150 group-active:scale-95 group-hover:-translate-y-0.5"
        style={{
          background: `linear-gradient(155deg, ${accent}3d, ${accent}1a)`,
          backdropFilter: 'blur(6px)',
          border: `1px solid ${accent}66`,
          boxShadow: `0 6px 16px rgba(0,0,0,0.35)`,
        }}>
        <div className="absolute inset-0 rounded-[18px] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ boxShadow: `0 0 0 1px ${glow}aa, 0 6px 20px ${glow}55` }} />
        {ic.img
          ? <img src={`/icons/${ic.img}`} alt="" className="w-9 h-9 relative object-contain" />
          : <span className="relative text-white"><ClassicIcon name={ic.icon} size={28} /></span>}
      </div>
      <span className="text-white text-[11.5px] text-center leading-tight px-0.5 font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{ic.label}</span>
    </button>
  );
}
