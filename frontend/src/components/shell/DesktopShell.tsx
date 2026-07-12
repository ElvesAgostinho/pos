import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import {
  VIEW_REGISTRY, ITEM_TITLES, ITEM_MODULE_KEY, moduleEnabled, moduleKeyOf, featureAllowed,
} from '../../config/navigation';
import { getAppearance } from '../../config/appearance';
import ErrorBoundary from './ErrorBoundary';
import { exportDomTable } from '../../utils/exportData';
import { WORKSPACES, MODULE_TREE } from '../../config/workspace';
import { tokenStore, authApi } from '../../api/auth';
import { useActiveModules, useFeatures, useMyAccess } from '../../hooks/useActiveModules';
import {
  FilePlus2, Pencil, Save, Trash2, Copy, Search, RefreshCw, Printer, Download,
  Paperclip, History, ClipboardList, ChevronRight, ChevronDown, Folder, FolderOpen,
  Power, Moon, Sun, Server, ShieldCheck, Monitor, Building2, Database, Wifi, Cpu,
} from 'lucide-react';

// ==========================================================================
// Enterprise Windows Desktop Shell — menu bar + ribbon + navigation tree +
// status bar. Visual clássico (Primavera/PHC/Office), sem cartões/animações.
// Envolve TODOS os ecrãs (VIEW_REGISTRY) — muda o visual do sistema inteiro.
// ==========================================================================

// Ecrãs que trazem a sua própria janela completa (não entram na árvore + ribbon).
const FULLSCREEN_VIEWS = ['posc_config'];

const cmd = (name: string) => window.dispatchEvent(new CustomEvent('erp:cmd', { detail: name }));

interface Props { activeView: string; onOpen: (id: string) => void; onDesktop?: () => void; module?: string; }

export default function DesktopShell({ activeView, onOpen, onDesktop, module }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: lic } = useActiveModules();
  const { data: feat } = useFeatures();
  const { data: access } = useMyAccess();
  const activeFeatures = feat?.active ?? null;
  // Acesso por perfil: full → tudo; senão só os módulos/ecrãs autorizados (oculta o resto).
  const accFull = access?.full !== false;
  const accModules = access?.modules ?? [];
  const accScreens = access?.screens ?? [];
  const moduleAllowed = (key: string) => accFull || accModules.includes(key);
  const screenAllowed = (id: string) => accFull || accScreens.length === 0 || accScreens.includes(id);
  const user = tokenStore.getUser();
  const [dark, setDark] = useState(() => localStorage.getItem('ui_theme') === 'dark');
  const [menu, setMenu] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [treeQuery, setTreeQuery] = useState('');
  const [clock, setClock] = useState(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // PROPRIEDADE ATIVA — em grupos com vários hotéis, tudo o que se vê é do hotel escolhido.
  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotels: any[] = myHotels?.hotels || [];
  const [hotelId, setHotelId] = useState(() => localStorage.getItem('erp_hotel') || '');
  const hotelName = hotels.find((h) => String(h.id) === hotelId)?.name || hotels[0]?.name || '—';
  const pickHotel = (id: string) => {
    setHotelId(id);
    if (id) localStorage.setItem('erp_hotel', id); else localStorage.removeItem('erp_hotel');
    qc.invalidateQueries();   // tudo o que está em ecrã pertence ao hotel anterior
  };

  // Memória usada pela aplicação (barra de estado) — só nos browsers que o expõem.
  const [mem, setMem] = useState('—');
  useEffect(() => {
    const read = () => {
      const m = (performance as any).memory;
      setMem(m ? `${Math.round(m.usedJSHeapSize / 1048576)} MB` : '—');
    };
    read(); const t = setInterval(read, 10000); return () => clearInterval(t);
  }, []);

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'classic'); localStorage.setItem('ui_theme', dark ? 'dark' : 'classic'); }, [dark]);

  const bizModules = WORKSPACES.filter((w) => moduleEnabled(w.licenseModule, lic?.active || []));

  // ÁRVORE POR TAREFA — pastas que qualquer pessoa percebe (Receção, Quartos, Cozinha,
  // Caixa…) em vez dos "Centros" técnicos. Só entram ecrãs que EXISTEM, estão
  // LICENCIADOS e que o utilizador tem PERMISSÃO para ver.
  const tree = useMemo(() => {
    const folders = (module && MODULE_TREE[module]) || [];
    // DEDUPLICAÇÃO: o mesmo ecrã estava a aparecer com nomes diferentes em pastas
    // diferentes (ex.: "Utilizadores" em Segurança e em Administração eram O MESMO
    // ecrã). Um ecrã real só pode surgir UMA vez por módulo — a primeira pasta onde
    // pertence fica com ele. Quando dois IDs deixarem de partilhar o componente
    // (porque cada um passou a ter ecrã próprio), voltam ambos a aparecer sozinhos.
    const seen = new Set<any>();
    const seenName = new Set<string>();
    return folders
      .map((f) => ({
        key: f.key,
        title: f.title,
        items: f.items
          .filter((id) => !!VIEW_REGISTRY[id])
          .filter((id) => moduleEnabled(ITEM_MODULE_KEY[id] || '', lic?.active || []))
          .filter((id) => featureAllowed(id, activeFeatures))
          .filter((id) => screenAllowed(id))
          .filter((id) => {
            const comp = VIEW_REGISTRY[id];
            const name = (ITEM_TITLES[id] || id).toLowerCase();
            if (seen.has(comp) || seenName.has(name)) return false;   // já existe neste módulo
            seen.add(comp); seenName.add(name);
            return true;
          })
          .map((id) => ({ id, name: ITEM_TITLES[id] || id })),
      }))
      .filter((f) => f.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, lic, access, activeFeatures]);

  const activeFolder = tree.find((f) => f.items.some((i) => i.id === activeView))?.key;
  // Grupos do menu lateral (separadores de leitura, estilo Windows).
  const groupOf = (key: string) => {
    const k = key.split('_').slice(1).join('_');
    if (['tesouraria', 'fiscal', 'contab'].includes(k)) return 'FINANCEIRO';
    if (['relatorios'].includes(k)) return 'ANÁLISE';
    if (['dados', 'estrutura', 'seguranca', 'sistema'].includes(k)) return 'SISTEMA';
    return 'OPERAÇÃO';
  };
  const q = (items: { id: string; name: string }[]) =>
    treeQuery ? items.filter((i) => i.name.toLowerCase().includes(treeQuery.toLowerCase())) : items;
  const activeModuleKey = moduleKeyOf(activeView);

  // Expande automaticamente o módulo ativo na árvore.
  useEffect(() => { if (activeModuleKey) setExpanded((e) => ({ ...e, [activeModuleKey]: true })); }, [activeModuleKey]);

  // Aterra no 1º ecrã do módulo APENAS se o ecrã atual não for um ecrã real
  // (ex.: 'home:xxx'). Nunca empurrar para fora um ecrã aberto por um ícone válido.
  useEffect(() => {
    if (!tree.length) return;
    if (!VIEW_REGISTRY[activeView]) onOpen(tree[0].items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, tree.length]);

  // Atalhos de teclado tipo Windows.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F5') { e.preventDefault(); qc.invalidateQueries(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); window.print(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); cmd('new'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); cmd('save'); }
      else if (e.key === 'Escape') { setMenu(null); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [qc]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (shellRef.current && !(e.target as HTMLElement).closest('.menu-root')) setMenu(null); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const barColor = getAppearance('barColor') || '#1e3f66';
  const companyName = getAppearance('companyName');
  const t = dark
    ? { bar: '#2b2b2b', barText: '#e6e6e6', ribbon: '#333', tree: '#252525', treeText: '#dcdcdc', line: '#3a3a3a', body: '#1e1e1e', status: '#1b1b1b', hover: '#3a3a3a', accent: '#4a9edb' }
    : {
        // Aspeto clássico "pesado": barras com relevo/gradiente, linhas fortes.
        bar: 'linear-gradient(to bottom, #fbfcfd 0%, #eceff2 55%, #dfe3e8 100%)', barText: '#1a2433',
        ribbon: 'linear-gradient(to bottom, #f6f8fa 0%, #e6eaee 60%, #d7dce2 100%)',
        tree: '#ffffff', treeText: '#1a2a3a', line: '#9aa6b6', body: '#dfe3e8',
        status: barColor, hover: '#cfe0f5', accent: barColor,
      };

  const logout = async () => { await authApi.logout(); nav('/backoffice/login'); };
  // Bloqueia o acesso direto a ecrãs não autorizados (mesmo via estado guardado).
  const Active = (moduleAllowed(activeModuleKey) && screenAllowed(activeView)) ? VIEW_REGISTRY[activeView] : undefined;

  // ---- Menu superior ----
  const MENUS: Record<string, { label: string; act?: () => void }[]> = {
    'Ficheiro': [
      { label: 'Novo\tCtrl+N', act: () => cmd('new') },
      { label: 'Guardar\tCtrl+S', act: () => cmd('save') },
      { label: 'Imprimir\tCtrl+P', act: () => window.print() },
      { label: 'Terminar sessão', act: logout },
    ],
    'Editar': [{ label: 'Editar', act: () => cmd('edit') }, { label: 'Eliminar', act: () => cmd('delete') }, { label: 'Duplicar', act: () => cmd('duplicate') }],
    'Visualizar': [
      { label: 'Atualizar\tF5', act: () => qc.invalidateQueries() },
      { label: dark ? 'Tema Clássico (claro)' : 'Tema Escuro', act: () => setDark((d) => !d) },
    ],
    'Ferramentas': [
      { label: 'Voltar ao Ambiente de Trabalho', act: () => { localStorage.removeItem('ui_shell'); onDesktop ? onDesktop() : window.location.reload(); } },
      { label: 'Aparência', act: () => onOpen('adm_appearance') },
    ],
    'Ajuda': [{ label: 'Sobre a Plataforma', act: () => alert('System Mwana Lodge · v1.0') }],
  };

  const ribbonGroups: { title: string; btns: [any, string, string][] }[] = [
    { title: 'Registo', btns: [[FilePlus2, 'Novo', 'new'], [Pencil, 'Editar', 'edit'], [Save, 'Guardar', 'save'], [Trash2, 'Eliminar', 'delete'], [Copy, 'Duplicar', 'duplicate']] },
    { title: 'Dados', btns: [[Search, 'Pesquisar', 'search'], [RefreshCw, 'Atualizar', 'refresh']] },
    { title: 'Saída', btns: [[Printer, 'Imprimir', 'print'], [Download, 'Exportar', 'export']] },
    { title: 'Registo/Anexos', btns: [[Paperclip, 'Anexos', 'attach'], [History, 'Histórico', 'history'], [ClipboardList, 'Auditoria', 'audit']] },
  ];
  // Exporta a grelha visível do ecrã ativo no formato escolhido (todos os ecrãs).
  const exportAs = (format: 'pdf' | 'excel' | 'word' | 'csv' | 'json') => {
    setExportOpen(false);
    const table = document.getElementById('erp-active-view')?.querySelector('table');
    if (!table) { alert('Este ecrã não tem uma tabela para exportar.'); return; }
    const name = (ITEM_TITLES[activeView] || 'exportacao').replace(/[^\w]+/g, '_');
    exportDomTable(table as HTMLTableElement, format, name, ITEM_TITLES[activeView] || 'Exportação');
  };
  const focusSearch = () => {
    const root = document.getElementById('erp-active-view');
    const inp = root?.querySelector('input[placeholder*="esquis" i], input[placeholder*="rocur" i], input[type="search"], input') as HTMLInputElement | undefined;
    if (inp) inp.focus(); else alert('Este ecrã não tem campo de pesquisa.');
  };
  // "Novo": foca o 1º campo do formulário do ecrã ativo (barra de inserção).
  const focusNew = () => {
    const root = document.getElementById('erp-active-view');
    const field = root?.querySelector('input:not([type="checkbox"]):not([readonly]), select, textarea') as HTMLElement | undefined;
    if (field) { field.scrollIntoView({ block: 'nearest' }); field.focus(); }
    else alert('Este ecrã não tem formulário de inserção.');
  };
  // "Guardar": aciona o botão principal de gravação/criação do ecrã ativo.
  const clickPrimary = () => {
    const root = document.getElementById('erp-active-view');
    const btns = Array.from(root?.querySelectorAll('button') || []) as HTMLButtonElement[];
    const re = /guardar|adicionar|criar|registar|gravar|reconciliar|agendar|novo|lançar/i;
    const btn = btns.find((b) => re.test(b.innerText || '') && !b.disabled);
    if (btn) btn.click();
    else alert('Este ecrã não tem ação de gravação no ribbon. Use os botões do próprio ecrã.');
  };
  const runRibbon = (a: string) => {
    if (a === 'refresh') { qc.invalidateQueries(); return; }
    if (a === 'print') { window.print(); return; }
    if (a === 'export') { setExportOpen((o) => !o); return; }
    if (a === 'search') { focusSearch(); return; }
    if (a === 'new') { focusNew(); return; }
    if (a === 'save') { clickPrimary(); return; }
    // edit/delete/duplicate/attach/history/audit — o ecrã ativo pode reagir via 'erp:cmd'.
    // Se ninguém tratar, dá feedback em vez de falhar em silêncio.
    let handled = false;
    const mark = () => { handled = true; };
    window.addEventListener('erp:cmd:ack', mark, { once: true });
    cmd(a);
    setTimeout(() => {
      window.removeEventListener('erp:cmd:ack', mark);
      if (!handled) {
        const labels: Record<string, string> = { edit: 'Editar', delete: 'Eliminar', duplicate: 'Duplicar', attach: 'Anexos', history: 'Histórico', audit: 'Auditoria' };
        const hint: Record<string, string> = {
          edit: 'Selecione a linha e edite pelos controlos da própria linha.',
          delete: 'Use o ícone de lixo (🗑) na linha que quer eliminar.',
          duplicate: 'Duplicação disponível apenas em alguns ecrãs.',
          attach: 'Anexos ligam-se no Reporting/Document Center.',
          history: 'Consulte o histórico no Reporting Center (por área).',
          audit: 'A auditoria está no Sistema → Logs e no Reporting Center.',
        };
        alert(`"${labels[a] || a}": ${hint[a] || 'não disponível neste ecrã.'}`);
      }
    }, 60);
  };


  // ECRÃS DE ECRÃ INTEIRO — trazem a sua própria moldura (barra de menus, secções,
  // barra de ferramentas). Mostrá-los DENTRO da árvore + ribbon do shell dava duas
  // molduras sobrepostas e dois menus laterais. Estes tomam a janela toda.
  if (FULLSCREEN_VIEWS.includes(activeView) && Active) {
    return (
      <div ref={shellRef} className="h-screen w-screen overflow-hidden font-sans select-none">
        <ErrorBoundary viewKey={activeView}>
          <Active onBack={() => onOpen(tree[0]?.items[0]?.id || 'posc_dashboard')}
            onOpen={onOpen}
            onDesktop={() => { localStorage.removeItem('ui_shell'); onDesktop ? onDesktop() : window.location.reload(); }} />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="h-screen w-screen flex flex-col overflow-hidden font-sans select-none" style={{ background: t.body }}>
      {/* ================= BARRA DE MENUS ================= */}
      <div className="flex items-center h-[26px] px-1 text-[12px] flex-shrink-0 border-b" style={{ background: t.bar, color: t.barText, borderColor: t.line }}>
        <button onClick={() => { localStorage.removeItem('ui_shell'); onDesktop ? onDesktop() : window.location.reload(); }} title="Voltar ao Ambiente de Trabalho" className="font-black tracking-tight px-2 hover:bg-black/10 h-[26px]"><span className="text-[#c9a400]">M</span><span style={{ color: t.accent }}>L</span></button>
        {Object.keys(MENUS).map((m) => (
          <div key={m} className="menu-root relative">
            <button onClick={() => setMenu((o) => (o === m ? null : m))}
              className="px-2.5 h-[26px] hover:bg-black/10" style={{ background: menu === m ? t.hover : 'transparent' }}>{m}</button>
            {menu === m && (
              <div className="absolute left-0 top-[26px] min-w-[220px] shadow-lg py-1 z-50 border" style={{ background: t.tree, borderColor: t.line, color: t.treeText }}>
                {MENUS[m].map((it) => (
                  <button key={it.label} onClick={() => { it.act?.(); setMenu(null); }}
                    className="w-full text-left px-3 py-1.5 flex justify-between gap-6 hover:bg-black/10">
                    <span>{it.label.split('\t')[0]}</span><span className="opacity-50 text-[11px]">{it.label.split('\t')[1] || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="flex-1" />
        {/* PROPRIEDADE ATIVA — só aparece em grupos com mais do que um hotel. */}
        {hotels.length > 1 && (
          <div className="flex items-center gap-1.5 pr-2 mr-1 border-r" style={{ borderColor: t.line }}>
            <Building2 size={13} className="opacity-70" />
            <select value={hotelId || String(hotels[0].id)} onChange={(e) => pickHotel(e.target.value)}
              title="Propriedade ativa — só vê os dados deste hotel"
              className="h-[20px] text-[11px] font-bold px-1 border"
              style={{ background: t.tree, color: t.treeText, borderColor: t.line }}>
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}
        <button onClick={() => setDark((d) => !d)} title="Tema" className="px-2 h-[26px] hover:bg-black/10">{dark ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>

      {/* ================= RIBBON ================= */}
      <div className="flex items-stretch gap-0 px-1 py-1 flex-shrink-0 border-b overflow-x-auto" style={{ background: t.ribbon, borderColor: t.line, boxShadow: dark ? 'none' : 'inset 0 1px 0 #fff, 0 2px 4px rgba(0,0,0,0.14)' }}>
        {ribbonGroups.map((g) => (
          <div key={g.title} className="flex flex-col items-center px-2 border-r" style={{ borderColor: t.line }}>
            <div className="flex items-end gap-0.5">
              {g.btns.map(([Icon, label, action]) => (
                <button key={label} onClick={() => runRibbon(action)} title={label}
                  className="flex flex-col items-center justify-center w-[52px] h-[46px] gap-0.5 hover:bg-black/10 rounded-sm"
                  style={{ color: t.barText }}>
                  <Icon size={18} strokeWidth={1.6} />
                  <span className="text-[10px] leading-none">{label}</span>
                </button>
              ))}
            </div>
            <div className="text-[9px] mt-0.5 opacity-50 uppercase tracking-wide">{g.title}</div>
          </div>
        ))}
      </div>

      {/* Menu de formatos de exportação (grelha visível) */}
      {exportOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
          <div className="absolute z-50 shadow-lg border rounded-sm overflow-hidden" style={{ top: 80, left: 360, background: t.tree, borderColor: t.line, color: t.treeText }}>
            <div className="px-3 py-1.5 text-[10px] uppercase opacity-60 border-b" style={{ borderColor: t.line }}>Exportar a grelha visível</div>
            {[['pdf', 'PDF', '#c0392b'], ['excel', 'Excel', '#217346'], ['word', 'Word', '#2b5797'], ['csv', 'CSV', '#555'], ['json', 'JSON', '#b58900']].map(([f, label, c]: any) => (
              <button key={f} onClick={() => exportAs(f)} className="w-full flex items-center gap-2 px-4 py-2 text-[12px] hover:bg-black/10 text-left">
                <Download size={14} style={{ color: c }} /> {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ================= CORPO: ÁRVORE + ÁREA PRINCIPAL ================= */}
      <div className="flex-1 flex overflow-hidden">
        {/* Árvore de navegação (Windows Explorer) */}
        <div className="w-[236px] flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ background: t.tree, borderColor: t.line, color: t.treeText }}>
          <div className="p-1.5 border-b" style={{ borderColor: t.line }}>
            <div className="flex items-center gap-1 px-1.5 py-1 border" style={{ borderColor: t.line, background: dark ? '#1a1a1a' : '#fff' }}>
              <Search size={12} className="opacity-50" />
              <input value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} placeholder="Pesquisar ecrãs…"
                className="bg-transparent outline-none text-[12px] w-full" style={{ color: t.treeText }} />
            </div>
          </div>
          <div className="flex-1 overflow-auto py-1">
            {tree.map((f, idx) => {
              const its = q(f.items);
              if (treeQuery && its.length === 0) return null;
              const open = expanded[f.key] ?? (f.key === activeFolder || !!treeQuery);
              const grp = groupOf(f.key);
              const newGroup = idx === 0 || groupOf(tree[idx - 1].key) !== grp;
              return (
                <div key={f.key}>
                  {/* Separador de grupo (Operação / Financeiro / Análise / Sistema) */}
                  {newGroup && !treeQuery && (
                    <div className="flex items-center gap-2 px-2 pt-2.5 pb-1 select-none">
                      <span className="text-[9px] font-bold tracking-widest opacity-45">{grp}</span>
                      <span className="flex-1 h-px" style={{ background: dark ? '#3a3a3a' : '#c8d0da' }} />
                    </div>
                  )}
                  <button onClick={() => setExpanded((e) => ({ ...e, [f.key]: !open }))}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-bold hover:bg-black/5 border-b"
                    style={{ background: f.key === activeFolder ? t.hover : 'transparent', borderColor: dark ? '#2a2a2a' : '#eef1f5' }}>
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {open ? <FolderOpen size={14} style={{ color: '#d8a30a' }} /> : <Folder size={14} style={{ color: '#d8a30a' }} />}
                    <span className="truncate">{f.title}</span>
                    <span className="ml-auto text-[10px] font-normal opacity-40">{f.items.length}</span>
                  </button>
                  {open && its.map((it) => {
                    const sel = it.id === activeView;
                    return (
                      <button key={it.id} onClick={() => onOpen(it.id)}
                        className="w-full flex items-center gap-1.5 pl-8 pr-2 py-[4px] text-[12px] hover:bg-black/10 text-left"
                        style={{ background: sel ? t.accent : 'transparent', color: sel ? '#fff' : t.treeText }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sel ? '#fff' : '#3aa655' }} />
                        <span className="truncate">{it.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Área principal — renderiza o ecrã ativo (isolado por ErrorBoundary) */}
        <div id="erp-active-view" className="flex-1 overflow-hidden" style={{ background: t.body }}>
          <ErrorBoundary viewKey={activeView}>
            {Active ? <Active /> : <WelcomePanel tree={tree} moduleName={bizModules.find((b) => b.key === module)?.name} onOpen={onOpen} dark={dark} />}
          </ErrorBoundary>
        </div>
      </div>

      {/* ================= BARRA DE ESTADO ================= */}
      <div className="h-[26px] flex items-center px-2 gap-2.5 text-[11px] flex-shrink-0 overflow-hidden"
        style={{ background: t.status, color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }}>
        <span className="flex items-center gap-1"><Monitor size={12} /> {user?.username || 'operador'}</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1"><Building2 size={12} /> {companyName || 'System Mwana Lodge'}</span>
        <span className="opacity-30">|</span>
        {/* Propriedade em que se está a trabalhar (evita lançar num hotel errado). */}
        <span className="flex items-center gap-1 font-bold" title="Propriedade ativa">{hotelName}</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1"><Server size={12} /> {window.location.hostname}:8000</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1" title="Base de dados"><Database size={12} /> {lic ? 'SQL' : '—'}</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1 text-[#7CFC98]"><span className="w-2 h-2 rounded-full bg-[#3aa655]" /> Ligado</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1" title="VPN de suporte"><Wifi size={12} /> VPN</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1"><ShieldCheck size={12} /> Licença ativa</span>
        <span className="opacity-30">|</span>
        <span className="flex items-center gap-1" title="Memória usada pela aplicação"><Cpu size={12} /> {mem}</span>
        <div className="flex-1" />
        <span className="font-semibold">{ITEM_TITLES[activeView] || ''}</span>
        <span className="opacity-30">|</span>
        <span>v1.0</span>
        <span className="opacity-30">|</span>
        <span>{clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={logout} title="Terminar sessão" className="ml-1 hover:text-[#ffd1d1]"><Power size={13} /></button>
      </div>
    </div>
  );
}

// Página inicial do módulo — mostra as PASTAS por tarefa e os seus ecrãs.
function WelcomePanel({ tree, moduleName, onOpen, dark }:
  { tree: { key: string; title: string; items: { id: string; name: string }[] }[]; moduleName?: string; onOpen: (id: string) => void; dark: boolean }) {
  const card = dark ? 'bg-[#252525] border-[#3a3a3a] text-[#dcdcdc]' : 'bg-white border-[#9aa6b6] text-[#1a2a3a]';
  return (
    <div className="h-full overflow-auto p-4">
      <div className="text-[15px] font-bold mb-3" style={{ color: dark ? '#dcdcdc' : '#1e3f66' }}>{moduleName || 'Módulo'} — o que quer fazer?</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tree.map((f) => (
          <div key={f.key} className={`border ${card}`} style={{ boxShadow: 'inset 0 1px 0 #fff, 0 1px 3px rgba(0,0,0,0.12)' }}>
            <div className="px-3 py-2 border-b text-[12px] font-bold" style={{ borderColor: dark ? '#3a3a3a' : '#dfe3e8', background: dark ? '#2a2a2a' : 'linear-gradient(to bottom,#f7f9fb,#e7ebef)' }}>
              {f.title}
            </div>
            <div className="p-2">
              {f.items.map((it) => (
                <button key={it.id} onClick={() => onOpen(it.id)}
                  className="w-full flex items-center gap-2 py-1 px-1 text-[12px] text-left hover:bg-[#e6f3ff] rounded">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3aa655' }} />
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] opacity-60" style={{ color: dark ? '#aaa' : '#555' }}>
        Atalhos: F5 atualizar · Ctrl+P imprimir · Ctrl+N novo · Esc fechar menus.
      </div>
    </div>
  );
}
