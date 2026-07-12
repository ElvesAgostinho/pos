import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODULES, VIEW_REGISTRY, MODULE_MENUS, MODULE_OF, ITEM_TITLES, moduleEnabled } from '../config/navigation';
import type { NavItem } from '../config/navigation';
import { tokenStore, authApi } from '../api/auth';
import { useActiveModules } from '../hooks/useActiveModules';
import { ChevronDown, User, LayoutGrid, Power, Home, Construction } from 'lucide-react';
import Sidebar from './Sidebar';

// Ícone "tipo imagem" (emoji colorido) por função — parece uma imagem reduzida, sem
// depender de ficheiros/CDN externos nem de bibliotecas de terceiros.
function pickEmoji(id: string, name: string): string {
  const s = (id + ' ' + name).toLowerCase();
  const t: [string[], string][] = [
    [['dashboard', 'painel'], '📊'], [['reserva', 'reservation', 'booking'], '📅'],
    [['check-in', 'checkin', 'check-out'], '🛎️'], [['quarto', 'room', 'housekeeping'], '🛏️'],
    [['mapa'], '🗺️'], [['mesa', 'table'], '🍽️'],
    [['venda', 'sale', 'balcão', 'frontoffice', 'terminal'], '🛒'],
    [['pagamento', 'tesouraria', 'caixa', 'cash', 'payment'], '💰'], [['recebimento'], '🧾'],
    [['fatura', 'invoic', 'documento', 'doc'], '📄'], [['promo', 'happy', 'desconto'], '🏷️'],
    [['combo', 'menu'], '🍔'], [['gift', 'voucher'], '🎁'], [['stock', 'inventár', 'inventar'], '📦'],
    [['armaz', 'warehouse'], '🏬'], [['localiz', 'location'], '📍'], [['movimento', 'transfer'], '🔁'],
    [['lote', 'valid'], '🏷️'], [['fornecedor', 'supplier', 'srm'], '🚚'], [['artigo', 'item', 'produto'], '📦'],
    [['categoria', 'família', 'familia', 'marca', 'subcateg'], '🗂️'],
    [['cliente', 'hóspede', 'hospede', 'guest', 'funcion', 'colaborador', 'operador', 'entidade', 'equipa'], '👥'],
    [['utilizador', 'user'], '👤'], [['perfil', 'role', 'permiss', 'abac', 'segur', 'security', 'política', 'bloqueio'], '🔐'],
    [['pin', 'token', 'mfa', 'chave', 'licen'], '🔑'], [['cozinha', 'kitchen', 'grelha'], '👨‍🍳'],
    [['bar', 'beverage', 'cocktail'], '🍸'], [['pastel', 'pastry', 'sobremesa'], '🧁'],
    [['receita', 'recipe', 'ficha'], '📖'], [['relatório', 'report', 'kpi', 'performance', 'previsão', 'ranking'], '📈'],
    [['auditor', 'audit', 'log'], '📋'], [['haccp', 'qualidade', 'quality', 'timing', 'controlo'], '✅'],
    [['saft', 'fiscal', 'agt', 'assinatura'], '🇦🇴'], [['série', 'serie'], '🔢'], [['imposto', 'tax', 'iva'], '💸'],
    [['método', 'metodo', 'cartão', 'card'], '💳'], [['impress', 'print', 'spooler'], '🖨️'],
    [['banco', 'bank', 'conta'], '🏦'],
    [['hotel', 'edifíc', 'bloco', 'piso', 'ala', 'outlet', 'área', 'area', 'sala', 'departamento', 'centro'], '🏨'],
    [['país', 'idioma', 'moeda', 'country', 'language', 'província', 'município'], '🌍'], [['setor', 'sector'], '🚪'],
    [['notific', 'email', 'sms', 'push', 'alerta'], '🔔'],
    [['integr', 'api', 'webhook', 'channel', 'fechadura', 'balança', 'booking engine'], '🔌'],
    [['backup', 'cache', 'scheduler', 'agendamento', 'diagn', 'atualiz', 'update', 'monitor'], '🖥️'],
    [['aparência', 'personaliz'], '🎨'], [['config', 'parâmetro', 'engine', 'motor', 'global', 'regional'], '⚙️'],
    [['workflow', 'fluxo', 'aprovaç'], '🔀'], [['evento'], '🎉'], [['banquete', 'buffet', 'catering'], '🍴'],
    [['compra', 'procurement', 'rfq', 'cotação', 'requisiç'], '🛍️'], [['devoluç', 'return'], '↩️'],
    [['base', 'dados', 'master'], '🗃️'], [['feature', 'flag'], '🚩'],
  ];
  for (const [keys, e] of t) if (keys.some((k) => s.includes(k))) return e;
  return '📁';
}

// Cor por módulo (ponto no dropdown de módulos).
const ICON_COLORS = ['#e74c3c', '#e67e22', '#f1a208', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#c0398b', '#00838f', '#2c7873', '#5661b3', '#c0392b'];

const ML = ({ cls = 'text-2xl' }: { cls?: string }) => (
  <span className={`font-black tracking-tight ${cls}`}><span className="text-[#c9a400]">M</span><span className="text-white">L</span></span>
);

interface Props { moduleKey: string; activeView: string; onOpen: (id: string) => void; }

export default function ModuleDesktop({ moduleKey, activeView, onOpen }: Props) {
  const nav = useNavigate();
  const mod = MODULES.find((m) => m.key === moduleKey);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [switcher, setSwitcher] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const { data: lic } = useActiveModules();
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 20000); return () => clearInterval(t); }, []);
  if (!mod) return null;
  const licensed = MODULES.filter((m) => moduleEnabled(m.key, lic?.active || []));
  const user = tokenStore.getUser();
  const items = mod.items;
  const byId: Record<string, NavItem> = Object.fromEntries(items.map((i) => [i.id, i]));
  const groups = MODULE_MENUS[mod.key];
  const isDesktop = activeView.startsWith('home:');
  const wallpaper = (typeof localStorage !== 'undefined' && localStorage.getItem('ui_wallpaper')) || '/hotel-bg.jpg';
  const dateStr = clock.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  const pick = (id: string) => { setOpenGroup(null); setStartOpen(false); onOpen(id); };
  const logout = async () => { await authApi.logout(); nav('/backoffice/login'); };

  const Real = !isDesktop ? VIEW_REGISTRY[activeView] : null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* ================= HEADER (navegação real do módulo) ================= */}
      <div className="h-12 bg-[#111] flex items-center px-2 flex-shrink-0 relative z-30"
        onMouseLeave={() => setOpenGroup(null)}>
        {/* ML — switcher de módulos */}
        <div className="relative mr-2">
          <button onClick={() => licensed.length > 1 && setSwitcher((o) => !o)} className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-[#222]">
            <ML /> {licensed.length > 1 && <ChevronDown size={14} className="text-gray-400" />}
          </button>
          {switcher && (
            <div className="absolute left-0 top-11 bg-[#111] border border-[#333] min-w-[280px] shadow-2xl py-1 z-40 max-h-[75vh] overflow-auto">
              <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[#2a2a2a]"><ML cls="text-base" /><span className="text-[10px] uppercase tracking-widest text-gray-500">Os seus módulos</span></div>
              {licensed.map((m) => (
                <button key={m.key} onClick={() => { setSwitcher(false); onOpen(`home:${m.key}`); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[#222] ${m.key === moduleKey ? 'bg-[#1e1e1e]' : ''}`}>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: ICON_COLORS[MODULES.indexOf(m) % ICON_COLORS.length] }} />
                  <span className="text-gray-200 text-sm text-left flex-1">{m.title.replace(/^\d+\s·\s/, '')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Voltar ao ambiente de trabalho */}
        <button onClick={() => onOpen(`home:${moduleKey}`)} title="Ambiente de trabalho"
          className="px-2 h-12 text-gray-400 hover:bg-[#222] hover:text-white flex items-center"><Home size={16} /></button>

        {/* Menus reais (submódulos por área) */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
          {groups ? groups.map((g) => (
            <div key={g.label} className="relative">
              <button onClick={() => setOpenGroup((o) => (o === g.label ? null : g.label))}
                className={`px-3 h-12 text-sm whitespace-nowrap flex items-center gap-1 hover:bg-[#2a2a2a] ${openGroup === g.label ? 'bg-[#2a2a2a] text-white' : 'text-gray-100'}`}>
                {g.label} <ChevronDown size={13} className="opacity-70" />
              </button>
              {openGroup === g.label && (
                <div className="absolute left-0 top-12 bg-[#1b1b1b] border border-[#333] min-w-[230px] shadow-xl py-1 z-30">
                  {g.items.filter((id) => byId[id]).map((id) => (
                    <button key={id} onClick={() => pick(id)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-[#2a2a2a] flex items-center justify-between ${VIEW_REGISTRY[id] ? 'text-white' : 'text-gray-500'}`}>
                      {byId[id].name}{VIEW_REGISTRY[id] && <span className="w-1.5 h-1.5 rounded-full bg-[#3fd23f]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )) : items.slice(0, 9).map((it) => (
            <button key={it.id} onClick={() => pick(it.id)} className={`px-3 h-12 text-sm whitespace-nowrap hover:bg-[#2a2a2a] ${VIEW_REGISTRY[it.id] ? 'text-white' : 'text-gray-500'}`}>{it.name}</button>
          ))}
        </nav>

        <div className="flex items-center gap-3 pl-3 flex-shrink-0">
          <span className="text-[#e05555] text-sm font-semibold hidden md:inline">{dateStr}</span>
          <User size={16} className="text-gray-300" /><span className="text-white text-sm">{user?.username || 'user'}</span>
          <button onClick={logout} title="Terminar sessão" className="text-gray-400 hover:text-white"><Power size={16} /></button>
        </div>
      </div>

      {/* ================= CONTEÚDO ================= */}
      {isDesktop ? (
        <div className="flex-1 overflow-auto relative" style={{ backgroundColor: '#0d6e6e' }}>
          <div className="absolute inset-0 pointer-events-none bg-cover bg-center" style={{ backgroundImage: `url('${wallpaper}')` }} />
          <div className="relative p-6">
            <div className="mb-4 text-white/90 text-sm font-bold uppercase tracking-wide" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.6)' }}>{mod.title}</div>
            <div className="grid grid-flow-col grid-rows-6 auto-cols-max gap-x-3 gap-y-2" style={{ width: 'fit-content' }}>
              {items.map((item: NavItem) => {
                const emoji = pickEmoji(item.id, item.name);
                const real = !!VIEW_REGISTRY[item.id];
                return (
                  <button key={item.id} onClick={() => onOpen(item.id)} title={item.name}
                    className="w-[92px] flex flex-col items-center gap-1 p-1 group">
                    <div className="w-16 h-16 flex items-center justify-center text-[44px] leading-none group-hover:scale-110 group-active:scale-95 transition drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]"
                      style={{ opacity: real ? 1 : 0.4, filter: real ? 'none' : 'grayscale(70%)' }}>
                      {emoji}
                    </div>
                    <span className="text-[11px] text-center leading-tight px-1 text-white group-hover:bg-[#000080]" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.85)' }}>{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Ao clicar num ícone, o navbar do lado esquerdo aparece para navegar dentro do módulo */}
          <Sidebar scopeKey={moduleKey} activeView={activeView} onSelectView={onOpen} />
          <div className="flex-1 overflow-hidden bg-[#e6e6e6]">
            {Real ? <Real /> : <RoadmapPlaceholder id={activeView} />}
          </div>
        </div>
      )}

      {/* ================= BARRA DE TAREFAS ================= */}
      <div className="h-9 bg-[#c0c0c0] flex items-center px-1 gap-1 flex-shrink-0 relative"
        style={{ boxShadow: 'inset 0 2px 0 #dfdfdf, inset 0 1px 0 #fff' }}>
        <button onClick={() => setStartOpen((o) => !o)}
          className="h-7 px-2.5 flex items-center gap-1.5 font-bold text-[13px] text-black active:translate-y-px"
          style={{ background: '#c0c0c0', boxShadow: startOpen ? 'inset -1px -1px 0 #fff, inset 1px 1px 0 #0a0a0a, inset -2px -2px 0 #dfdfdf, inset 2px 2px 0 #808080' : 'inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf' }}>
          <span className="text-sm font-black leading-none"><span className="text-[#c9a400]">M</span><span className="text-[#1e3f66]">L</span></span> Iniciar
        </button>
        <div className="flex-1 text-[10px] text-gray-700 px-2 truncate">System Mwana Lodge · Licenciado a {user?.name || 'Cliente Demo'}</div>
        <div className="h-7 px-3 flex items-center text-[12px] text-black" style={{ boxShadow: 'inset -1px -1px 0 #fff, inset 1px 1px 0 #808080' }}>
          {clock.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </div>
        {startOpen && (
          <div className="absolute left-1 bottom-9 w-64 bg-[#c0c0c0] py-1 z-40" onMouseLeave={() => setStartOpen(false)}
            style={{ boxShadow: 'inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #fff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf' }}>
            <div className="flex">
              <div className="w-7 bg-[#1e3f66] flex items-end justify-center pb-2">
                <span className="text-white font-black text-xs" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>MÓDULOS</span>
              </div>
              <div className="flex-1 py-1">
                {licensed.map((m) => (
                  <button key={m.key} onClick={() => { setStartOpen(false); onOpen(`home:${m.key}`); }}
                    className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12px] hover:bg-[#000080] hover:text-white ${m.key === moduleKey ? 'font-bold' : ''}`}>
                    <LayoutGrid size={13} className="text-gray-600" />{m.title.replace(/^\d+\s·\s/, '')}
                  </button>
                ))}
                <div className="border-t border-[#808080] mt-1 pt-1">
                  <button onClick={logout} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12px] hover:bg-[#000080] hover:text-white"><Power size={13} />Terminar sessão</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoadmapPlaceholder({ id }: { id: string }) {
  const title = ITEM_TITLES[id] || id;
  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <div className="bg-white border border-[#c0c0c0] p-8 max-w-lg text-center shadow">
        <div className="w-14 h-14 mx-auto mb-4 bg-[#f0f0f0] border border-[#c0c0c0] rounded-full flex items-center justify-center"><Construction size={26} className="text-[#1e3f66]" /></div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{MODULE_OF[id] || ''}</div>
        <h2 className="text-lg font-bold text-[#1e3f66] mb-2">{title}</h2>
        <div className="inline-block text-[10px] font-bold text-[#8a6d1a] bg-[#fff4d6] border border-[#e0c877] px-2 py-0.5 rounded mb-2">EM DESENVOLVIMENTO</div>
        <p className="text-[12px] text-gray-600">Não é um erro. Esta função está a ser construída — o módulo está ativo na sua licença.</p>
      </div>
    </div>
  );
}
