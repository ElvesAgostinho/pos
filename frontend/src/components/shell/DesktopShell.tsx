import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  MODULES, VIEW_REGISTRY, ITEM_TITLES, moduleEnabled, moduleKeyOf, suiteIncludes, featureAllowed,
} from '../../config/navigation';
import { getAppearance } from '../../config/appearance';
import ErrorBoundary from './ErrorBoundary';
import { exportDomTable } from '../../utils/exportData';
import { WORKSPACES, centerInModule } from '../../config/workspace';
import type { NavItem } from '../../config/navigation';
import { tokenStore, authApi } from '../../api/auth';
import { useActiveModules, useFeatures, useMyAccess } from '../../hooks/useActiveModules';
import {
  FilePlus2, Pencil, Save, Trash2, Copy, Search, RefreshCw, Printer, Download,
  Paperclip, History, ClipboardList, ChevronRight, ChevronDown, Folder, FolderOpen,
  Power, Moon, Sun, Server, ShieldCheck, Monitor, Building2,
} from 'lucide-react';

// ==========================================================================
// Enterprise Windows Desktop Shell — menu bar + ribbon + navigation tree +
// status bar. Visual clássico (Primavera/PHC/Office), sem cartões/animações.
// Envolve TODOS os ecrãs (VIEW_REGISTRY) — muda o visual do sistema inteiro.
// ==========================================================================

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
  const suite = 'all';   // suites geridas no Ambiente de Trabalho; aqui o clássico mostra tudo o licenciado
  const [menu, setMenu] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [treeQuery, setTreeQuery] = useState('');
  const [clock, setClock] = useState(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'classic'); localStorage.setItem('ui_theme', dark ? 'dark' : 'classic'); }, [dark]);

  // Segurança = LICENÇA (moduleEnabled): o não-comprado não existe.
  // Organização = SEPARAÇÃO por módulo (centerInModule): cada módulo mostra só o que é
  // dele; para ver outro módulo, volta-se ao Ambiente de Trabalho e troca-se lá.
  const licensed = useMemo(
    () => MODULES.filter((m) => moduleEnabled(m.key, lic?.active || []) && suiteIncludes(suite, m.key) && moduleAllowed(m.key) && centerInModule(m.key, module)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lic, suite, access, module]);
  const bizModules = WORKSPACES.filter((w) => moduleEnabled(w.licenseModule, lic?.active || []));
  const activeModuleKey = moduleKeyOf(activeView);

  // Expande automaticamente o módulo ativo na árvore.
  useEffect(() => { if (activeModuleKey) setExpanded((e) => ({ ...e, [activeModuleKey]: true })); }, [activeModuleKey]);

  // Ao mudar de módulo: se o ecrã atual não pertence ao módulo, aterra no 1º centro dele.
  useEffect(() => {
    if (licensed.length && !licensed.some((m) => m.key === activeModuleKey)) {
      onOpen(`home:${licensed[0].key}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

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

  const treeItems = (items: NavItem[]) => {
    const feats = items.filter((i) => featureAllowed(i.id, activeFeatures) && screenAllowed(i.id));
    return treeQuery ? feats.filter((i) => i.name.toLowerCase().includes(treeQuery.toLowerCase())) : feats;
  };

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
          {/* Cabeçalho do módulo ativo — os outros módulos ficam ocultos. Regresso ao Ambiente para trocar. */}
          {onDesktop && (() => { const w = bizModules.find((b) => b.key === module) || bizModules[0]; return (
            <button onClick={() => { localStorage.removeItem('ui_shell'); onDesktop(); }} title="Voltar ao Ambiente de Trabalho para mudar de módulo"
              className="flex items-center gap-2 px-3 py-2 border-b text-white text-[12px] font-bold"
              style={{ borderColor: t.line, background: w ? `linear-gradient(to bottom, ${w.accent}, ${w.color})` : t.accent }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: w?.glow || '#fff' }} />
              {w?.name || 'Módulo'}
              <span className="ml-auto text-[11px] font-normal opacity-90 flex items-center gap-1">🖥️ Ambiente</span>
            </button>
          ); })()}
          <div className="p-1.5 border-b" style={{ borderColor: t.line }}>
            <div className="flex items-center gap-1 px-1.5 py-1 border" style={{ borderColor: t.line, background: dark ? '#1a1a1a' : '#fff' }}>
              <Search size={12} className="opacity-50" />
              <input value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} placeholder="Pesquisar ecrãs…"
                className="bg-transparent outline-none text-[12px] w-full" style={{ color: t.treeText }} />
            </div>
          </div>
          <div className="flex-1 overflow-auto py-1">
            {licensed.map((m) => {
              const open = expanded[m.key] || (!!treeQuery && treeItems(m.items).length > 0);
              const label = m.title.replace(/^\d+\s·\s/, '');
              const its = treeItems(m.items);
              if (treeQuery && its.length === 0) return null;
              return (
                <div key={m.key}>
                  <button onClick={() => setExpanded((e) => ({ ...e, [m.key]: !open }))}
                    className="w-full flex items-center gap-1 px-2 py-1 text-[12px] font-semibold hover:bg-black/5"
                    style={{ background: m.key === activeModuleKey ? t.hover : 'transparent' }}>
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {open ? <FolderOpen size={13} style={{ color: '#d8a30a' }} /> : <Folder size={13} style={{ color: '#d8a30a' }} />}
                    <span className="truncate">{label}</span>
                  </button>
                  {open && its.map((it) => {
                    const real = !!VIEW_REGISTRY[it.id];
                    const sel = it.id === activeView;
                    return (
                      <button key={it.id} onClick={() => onOpen(it.id)}
                        className="w-full flex items-center gap-1.5 pl-7 pr-2 py-[3px] text-[12px] hover:bg-black/10 text-left"
                        style={{ background: sel ? t.accent : 'transparent', color: sel ? '#fff' : (real ? t.treeText : (dark ? '#777' : '#9aa')) }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: real ? '#3aa655' : '#bbb' }} />
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
            {Active ? <Active /> : <WelcomePanel moduleTitle={MODULES.find((m) => m.key === activeModuleKey)?.title} onOpen={onOpen} activeModuleKey={activeModuleKey} dark={dark} />}
          </ErrorBoundary>
        </div>
      </div>

      {/* ================= BARRA DE ESTADO ================= */}
      <div className="h-[24px] flex items-center px-2 gap-3 text-[11px] flex-shrink-0" style={{ background: t.status, color: '#fff' }}>
        <span className="flex items-center gap-1"><Monitor size={12} /> {user?.username || 'operador'}</span>
        <span className="opacity-40">|</span>
        <span className="flex items-center gap-1"><Building2 size={12} /> {companyName || user?.name || 'System Mwana Lodge'}</span>
        <span className="opacity-40">|</span>
        <span className="flex items-center gap-1"><Server size={12} /> localhost:8000</span>
        <span className="opacity-40">|</span>
        <span className="flex items-center gap-1 text-[#7CFC98]"><span className="w-2 h-2 rounded-full bg-[#3aa655]" /> Ligado</span>
        <span className="opacity-40">|</span>
        <span className="flex items-center gap-1"><ShieldCheck size={12} /> Licença ativa</span>
        <div className="flex-1" />
        <span>{ITEM_TITLES[activeView] || ''}</span>
        <span className="opacity-40">|</span>
        <span>v1.0</span>
        <span className="opacity-40">|</span>
        <span>{clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={logout} title="Terminar sessão" className="ml-1 hover:text-[#ffd1d1]"><Power size={13} /></button>
      </div>
    </div>
  );
}

function WelcomePanel({ moduleTitle, onOpen, activeModuleKey, dark }: { moduleTitle?: string; onOpen: (id: string) => void; activeModuleKey: string; dark: boolean }) {
  const mod = MODULES.find((m) => m.key === activeModuleKey);
  const card = dark ? 'bg-[#252525] border-[#3a3a3a] text-[#dcdcdc]' : 'bg-white border-[#c8c8c8] text-[#1a2a3a]';
  return (
    <div className="h-full overflow-auto p-4">
      <div className={`border ${card} shadow-sm`}>
        <div className="px-4 py-2 border-b text-[13px] font-bold" style={{ borderColor: dark ? '#3a3a3a' : '#e0e0e0' }}>
          {(moduleTitle || 'Plataforma').replace(/^\d+\s·\s/, '')}
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1">
          {(mod?.items || []).map((it) => {
            const real = !!VIEW_REGISTRY[it.id];
            return (
              <button key={it.id} onClick={() => onOpen(it.id)}
                className="flex items-center gap-2 py-1 text-[12px] text-left hover:underline"
                style={{ opacity: real ? 1 : 0.5 }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: real ? '#3aa655' : '#bbb' }} />
                {it.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 text-[11px] opacity-60" style={{ color: dark ? '#aaa' : '#555' }}>
        Selecione um ecrã na árvore à esquerda ou na lista acima. Atalhos: F5 atualizar · Ctrl+P imprimir · Ctrl+N novo · Esc fechar menus.
      </div>
    </div>
  );
}
