import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import {
  VIEW_REGISTRY, ITEM_TITLES, ITEM_MODULE_KEY, moduleEnabled, moduleKeyOf, featureAllowed,
} from '../../config/navigation';
import { getAppearance } from '../../config/appearance';
import { classicTheme, TOKENS, RADIUS, SHADOW } from '../../config/theme';
import ErrorBoundary from './ErrorBoundary';
import { exportDomTable } from '../../utils/exportData';
import { WORKSPACES, MODULE_TREE } from '../../config/workspace';
import { irParaModulo } from '../../config/navegar';
import { tokenStore, authApi } from '../../api/auth';
import { useActiveModules, useFeatures, useMyAccess } from '../../hooks/useActiveModules';
import {
  FilePlus2, Pencil, Save, Trash2, Copy, Search, RefreshCw, Printer, Download,
  Paperclip, History, ClipboardList, ChevronRight, ChevronDown, Folder, FolderOpen,
  Power, Moon, Sun, Server, ShieldCheck, Monitor, Building2, Database, Wifi, Cpu,
  Lock, LogOut, X, Star, Filter, FileText,
} from 'lucide-react';
import { aviso } from '../../ui/dialogo';
import LockScreen from '../ui/LockScreen';
import IconeRibbon, { TEM_ICONE } from '../desktop/IconeRibbon';

// ==========================================================================
// Enterprise Windows Desktop Shell — menu bar + ribbon + navigation tree +
// status bar. Visual clássico (Primavera/PHC/Office), sem cartões/animações.
// Envolve TODOS os ecrãs (VIEW_REGISTRY) — muda o visual do sistema inteiro.
// ==========================================================================

// Ecrãs que trazem a sua própria janela completa (não entram na árvore + ribbon).
// PMS é ecrã inteiro, cabeçalho e menus PRÓPRIOS (PmsShell) — igual à Configuração
// POS. NUNCA passa pela árvore/ribbon clássica abaixo.
// 'adm_appearance': a janela do Papel de Parede já traz a sua própria moldura
// (ClassicWindow) — dentro da árvore+ribbon do shell ficava com DUAS barras de
// título e um ribbon/árvore cheios de ações (Novo/Eliminar/Duplicar/Anexos…)
// que não fazem sentido para um ecrã de uma só definição, sem registos.
const FULLSCREEN_VIEWS = ['posc_config', 'pms_home', 'adm_appearance'];

const cmd = (name: string) => window.dispatchEvent(new CustomEvent('erp:cmd', { detail: name }));

// A COR DA PASTA DIZ DE QUE FAMÍLIA É O ECRÃ. Numa árvore de quarenta nós todos
// iguais, encontrar "Tesouraria" obriga a ler tudo de cima a baixo. Com a pasta
// do dinheiro sempre verde e a do sistema sempre roxa, o olho salta direito à
// zona certa e só depois lê — é por isso que estes ERP têm a árvore colorida, e
// não por enfeite.
const COR_DO_GRUPO: Record<string, string> = {
  'OPERAÇÃO': '#D9A441',    // âmbar — o dia-a-dia
  'FINANCEIRO': '#3C8C4E',  // verde — dinheiro
  'ANÁLISE': '#2F6FB5',     // azul — números para ler
  'SISTEMA': '#8A6FB0',     // roxo — o que o técnico mexe
};

// As cores da tira de módulos da extrema esquerda. Os módulos partilham todos o
// mesmo azul institucional (config/workspace.ts) — o que serve no Ambiente de
// Trabalho, onde cada um tem o seu ícone grande e o seu nome por baixo. Numa
// tira de 26px não há nome nem ícone grande: resta a cor, e se for a mesma para
// os dez, a tira não informa nada. Aqui, e só aqui, cada módulo tem a sua.
const COR_DO_MODULO = ['#C8562B', '#2F6FB5', '#3C8C4E', '#8A6FB0', '#C9A227',
                       '#2D8C8C', '#B5476E', '#6B7D8F', '#7A8C2D', '#B5651D'];

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
  const [locked, setLocked] = useState(false);

  // OS SEPARADORES DE DOCUMENTO. O shell abria um ecrã de cada vez: ir à ficha
  // do cliente a meio de lançar uma factura obrigava a sair da factura e a
  // voltar a encontrá-la na árvore. Aqui os ecrãs abertos ficam numa tira por
  // cima da área de trabalho e alterna-se entre eles com um clique — é o que
  // as imagens mostram ("Agenda | Produtos ×") e é como se trabalha mesmo.
  const [abertos, setAbertos] = useState<string[]>([]);
  useEffect(() => {
    if (!VIEW_REGISTRY[activeView]) return;
    setAbertos((a) => (a.includes(activeView) ? a : [...a, activeView]));
  }, [activeView]);
  const fecharAba = (id: string) => {
    setAbertos((a) => {
      const resto = a.filter((x) => x !== id);
      // Fechar o separador ABERTO tem de deixar outro aberto, nunca o vazio:
      // salta-se para o vizinho da esquerda, como em qualquer editor.
      if (id === activeView && resto.length) {
        const i = a.indexOf(id);
        onOpen(resto[Math.max(0, i - 1)]);
      }
      return resto;
    });
  };

  // FAVORITOS. O botão "Adicionar a Favoritos" existe nas imagens, e um botão
  // que não leva a lado nenhum é pior do que não existir: os ecrãs marcados
  // aparecem numa pasta no topo da árvore, que é onde se vão buscar. Fica no
  // browser de quem marcou — cada pessoa tem os seus, e não há nada no servidor
  // para gerir por causa disto.
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('erp_favs') || '[]'); } catch { return []; }
  });
  const alternarFav = (id: string) => setFavs((f) => {
    const novo = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    localStorage.setItem('erp_favs', JSON.stringify(novo));
    return novo;
  });
  const shellRef = useRef<HTMLDivElement>(null);

  // Logótipo real do cliente (Administração → Empresa) — mesma fonte que o
  // Ambiente de Trabalho e o PMS já usam. Sem imagem de reserva de marca: sem
  // logótipo carregado, mostra um ícone neutro (prédio), nunca uma imagem do
  // sistema a fingir ser a marca do cliente.
  const [logoUrl, setLogoUrl] = useState('');
  useEffect(() => {
    apiClient.get('platform/branding/').then((r) => setLogoUrl(r.data?.logo_url || '')).catch(() => {});
  }, []);

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

  // O PRIMEIRO ECRÃ DE UM MÓDULO — o destino de um clique na tira da esquerda.
  // Não serve o primeiro da lista escrita: essa inclui ecrãs que podem não estar
  // licenciados nem autorizados para quem está a usar o sistema, e aterrar num
  // ecrã proibido mostra um módulo vazio como se estivesse avariado. Vai-se ao
  // primeiro que EXISTE e que esta pessoa pode mesmo abrir.
  const primeiroEcraDo = (moduleKey: string) => {
    for (const pasta of MODULE_TREE[moduleKey] || []) {
      for (const id of pasta.items) {
        if (VIEW_REGISTRY[id] && screenAllowed(id)) return id;
      }
    }
    return '';
  };

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

  const companyName = getAppearance('companyName');
  // Paleta oficial (config/theme.ts) — antes definida aqui, sozinha, ligeiramente
  // diferente da usada na Configuração POS e no login. Uma só fonte agora.
  const t = classicTheme(dark);

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
      { label: 'Papel de Parede', act: () => onOpen('adm_appearance') },
    ],
    'Ajuda': [{ label: 'Sobre a Plataforma', act: () => aviso('System Mwana Lodge · v1.0') }],
  };

  // O QUARTO ELEMENTO é o nome do pictograma colorido (IconeRibbon). O ícone de
  // traço (lucide) fica como alternativa, para um botão novo nunca aparecer
  // vazio enquanto não se lhe desenha o seu.
  const ribbonGroups: { title: string; btns: [any, string, string, string][] }[] = [
    { title: 'Registo', btns: [[FilePlus2, 'Novo', 'new', 'novo'], [Pencil, 'Editar', 'edit', 'editar'], [Save, 'Guardar', 'save', 'gravar'], [Trash2, 'Eliminar', 'delete', 'eliminar'], [Copy, 'Duplicar', 'duplicate', 'duplicar']] },
    { title: 'Dados', btns: [[Search, 'Pesquisar', 'search', 'pesquisar'], [RefreshCw, 'Atualizar', 'refresh', 'atualizar']] },
    { title: 'Saída', btns: [[Printer, 'Imprimir', 'print', 'imprimir'], [Download, 'Exportar', 'export', 'exportar']] },
    { title: 'Anexos e trilho', btns: [[Paperclip, 'Anexos', 'attach', 'anexos'], [History, 'Histórico', 'history', 'historico'], [ClipboardList, 'Auditoria', 'audit', 'auditoria']] },
  ];
  // Exporta a grelha visível do ecrã ativo no formato escolhido (todos os ecrãs).
  const exportAs = (format: 'pdf' | 'excel' | 'word' | 'csv' | 'json') => {
    setExportOpen(false);
    const table = document.getElementById('erp-active-view')?.querySelector('table');
    if (!table) { aviso('Este ecrã não tem uma tabela para exportar.'); return; }
    const name = (ITEM_TITLES[activeView] || 'exportacao').replace(/[^\w]+/g, '_');
    exportDomTable(table as HTMLTableElement, format, name, ITEM_TITLES[activeView] || 'Exportação');
  };
  const focusSearch = () => {
    const root = document.getElementById('erp-active-view');
    const inp = root?.querySelector('input[placeholder*="esquis" i], input[placeholder*="rocur" i], input[type="search"], input') as HTMLInputElement | undefined;
    if (inp) inp.focus(); else aviso('Este ecrã não tem campo de pesquisa.');
  };
  // "Novo": foca o 1º campo do formulário do ecrã ativo (barra de inserção).
  const focusNew = () => {
    const root = document.getElementById('erp-active-view');
    const field = root?.querySelector('input:not([type="checkbox"]):not([readonly]), select, textarea') as HTMLElement | undefined;
    if (field) { field.scrollIntoView({ block: 'nearest' }); field.focus(); }
    else aviso('Este ecrã não tem formulário de inserção.');
  };
  // "Guardar": aciona o botão principal de gravação/criação do ecrã ativo.
  const clickPrimary = () => {
    const root = document.getElementById('erp-active-view');
    const btns = Array.from(root?.querySelectorAll('button') || []) as HTMLButtonElement[];
    const re = /guardar|adicionar|criar|registar|gravar|reconciliar|agendar|novo|lançar/i;
    const btn = btns.find((b) => re.test(b.innerText || '') && !b.disabled);
    if (btn) btn.click();
    else aviso('Este ecrã não tem ação de gravação no ribbon. Use os botões do próprio ecrã.');
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
          delete: 'Use o ícone de eliminar na linha que quer apagar.',
          duplicate: 'Duplicação disponível apenas em alguns ecrãs.',
          attach: 'Anexos ligam-se no Reporting/Document Center.',
          history: 'Consulte o histórico no Reporting Center (por área).',
          audit: 'A auditoria está no Sistema → Logs e no Reporting Center.',
        };
        aviso(`"${labels[a] || a}": ${hint[a] || 'não disponível neste ecrã.'}`);
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
      <div className="flex items-center h-[30px] px-1.5 gap-0.5 text-[12px] flex-shrink-0 border-b" style={{ background: t.bar, color: t.barText, borderColor: t.line }}>
        <button onClick={() => { localStorage.removeItem('ui_shell'); onDesktop ? onDesktop() : window.location.reload(); }}
          title="Voltar ao Ambiente de Trabalho"
          className="flex items-center justify-center w-7 h-7 mr-1 flex-shrink-0 hover:bg-black/10 transition-colors" style={{ borderRadius: RADIUS.sm }}>
          {logoUrl ? <img src={logoUrl} alt="" className="w-6 h-6 object-contain rounded-full" /> : <Building2 size={16} />}
        </button>
        {Object.keys(MENUS).map((m) => (
          <div key={m} className="menu-root relative">
            <button onClick={() => setMenu((o) => (o === m ? null : m))}
              className="px-2.5 h-7 transition-colors" style={{ background: menu === m ? t.hover : 'transparent', borderRadius: RADIUS.sm }}>{m}</button>
            {menu === m && (
              <div className="absolute left-0 top-[32px] min-w-[220px] py-1 z-50 border overflow-hidden"
                style={{ background: t.tree, borderColor: t.line, color: t.treeText, borderRadius: RADIUS.md, boxShadow: SHADOW.panel }}>
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

        {/* Ecrã ativo — a mesma informação que antes vivia numa barra de "janela"
            à parte, sem fingir controlos de minimizar/maximizar de um SO. */}
        <span className="ml-2 text-[12px] font-medium truncate opacity-80">{ITEM_TITLES[activeView] || ''}</span>

        <div className="flex-1" />
        {/* PROPRIEDADE ATIVA — só aparece em grupos com mais do que um hotel. */}
        {hotels.length > 1 && (
          <div className="flex items-center gap-1.5 pr-2 mr-1 border-r" style={{ borderColor: t.line }}>
            <Building2 size={13} className="opacity-70" />
            <select value={hotelId || String(hotels[0].id)} onChange={(e) => pickHotel(e.target.value)}
              title="Propriedade ativa — só vê os dados deste hotel"
              className="h-6 text-[11px] font-bold px-1.5 border" style={{ background: t.tree, color: t.treeText, borderColor: t.line, borderRadius: RADIUS.sm }}>
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}
        <span className="flex items-center gap-1.5 text-[11px] mr-1.5 opacity-80">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" /> {user?.username || 'operador'}
        </span>
        <button onClick={() => setLocked(true)} title="Bloquear ecrã" className="flex items-center justify-center w-7 h-7 hover:bg-black/10 transition-colors" style={{ borderRadius: RADIUS.sm }}>
          <Lock size={13} />
        </button>
        <button onClick={() => setDark((d) => !d)} title="Tema" className="flex items-center justify-center w-7 h-7 hover:bg-black/10 transition-colors" style={{ borderRadius: RADIUS.sm }}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={logout} title="Terminar sessão" className="flex items-center justify-center w-7 h-7 hover:bg-[#DC2626]/85 hover:text-white transition-colors" style={{ borderRadius: RADIUS.sm }}>
          <LogOut size={13} />
        </button>
      </div>

      {/* ================= RIBBON ================= */}
      <div className="flex items-stretch flex-shrink-0 border-b overflow-x-auto"
        style={{ background: t.ribbon, borderColor: TOKENS.chromeLine }}>
        {ribbonGroups.map((g, gi) => (
          /* UM GRUPO. A DIVISÓRIA à esquerda é o que faz o ribbon funcionar: sem
             ela, catorze botões seguidos lêem-se como uma fila só e o olho
             percorre tudo até encontrar. Com ela procura-se primeiro o grupo
             ("isto é da Saída") e só depois o botão — duas decisões pequenas em
             vez de uma grande. O nome do grupo vai por baixo, que é onde estes
             ERP o põem. */
          <div key={g.title} className="flex flex-col px-1.5 pt-1 pb-0.5"
            style={{ borderLeft: gi ? `1px solid ${TOKENS.chromeLine}` : undefined }}>
            <div className="flex items-end gap-0 flex-1">
              {g.btns.map(([Icon, label, action, desenho]) => (
                <button key={label} onClick={() => runRibbon(action)} title={label}
                  className="flex flex-col items-center justify-start w-[56px] pt-1 pb-0.5 gap-1"
                  style={{ color: t.barText, borderRadius: 0, border: '1px solid transparent' }}
                  onMouseEnter={(e) => {
                    // O realce é MOLDURA + fundo âmbar, e não uma mancha cinzenta:
                    // é o que diz qual dos catorze está debaixo do rato.
                    e.currentTarget.style.background = TOKENS.hoverGold;
                    e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}>
                  {TEM_ICONE(desenho)
                    ? <IconeRibbon nome={desenho} size={26} />
                    : <Icon size={24} strokeWidth={1.6} />}
                  <span className="text-[10px] leading-none">{label}</span>
                </button>
              ))}
            </div>
            <div className="text-[9px] mt-1 w-full text-center" style={{ color: TOKENS.textMuted }}>{g.title}</div>
          </div>
        ))}
      </div>

      {/* Menu de formatos de exportação (grelha visível) */}
      {exportOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
          <div className="absolute z-50 border overflow-hidden" style={{ top: 80, left: 360, background: t.tree, borderColor: t.line, color: t.treeText, borderRadius: RADIUS.md, boxShadow: SHADOW.panel }}>
            <div className="px-3 py-1.5 text-[10px] uppercase opacity-60 border-b" style={{ borderColor: t.line }}>Exportar a grelha visível</div>
            {[['pdf', 'PDF', '#DC2626'], ['excel', 'Excel', '#2563EB'], ['word', 'Word', '#2563EB'], ['csv', 'CSV', '#2563EB'], ['json', 'JSON', '#2563EB']].map(([f, label, c]: any) => (
              <button key={f} onClick={() => exportAs(f)} className="w-full flex items-center gap-2 px-4 py-2 text-[12px] hover:bg-black/10 text-left">
                <Download size={14} style={{ color: c }} /> {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ============ CORPO: TIRA + ÁRVORE + ÁREA PRINCIPAL ============ */}
      <div className="flex-1 flex overflow-hidden">
        {/* --- A TIRA DA EXTREMA ESQUERDA -----------------------------------
            26 pixels com os módulos empilhados e o nome do sistema na vertical.

            Para que serve, e porque vale os 26 pixels: a árvore ao lado mostra
            UM módulo de cada vez — o que está aberto. Saltar do Alojamento para
            o Economato obrigava a subir ao menu, abrir, descer. Aqui estão todos
            à vista, sempre, e a mudança é um clique. É a barra que se usa dezenas
            de vezes por dia sem se dar por ela.

            A etiqueta vertical em baixo não é enfeite: num computador de
            recepção com três sistemas abertos, é o que diz de relance qual
            destas janelas é esta. */}
        <div className="w-[26px] flex-shrink-0 flex flex-col items-center justify-between border-r py-1"
          style={{ background: 'linear-gradient(to right, #F6F6F6, #E9E9E9)', borderColor: TOKENS.chromeLine }}>
          <div className="flex flex-col items-center gap-[2px]">
            {bizModules.slice(0, 10).map((w, i) => {
              const activo = w.key === module;
              return (
                <button key={w.key} title={w.name}
                  onClick={() => { const e = primeiroEcraDo(w.key); if (e) irParaModulo(w.key, e); }}
                  className="w-[21px] h-[21px] flex items-center justify-center"
                  style={{
                    border: `1px solid ${activo ? TOKENS.hoverGoldLine : 'transparent'}`,
                    background: activo ? TOKENS.hoverGold : 'transparent',
                  }}>
                  {/* A inicial dentro do quadrado de cor. Só a cor não chega — dez
                      quadrados coloridos obrigam a decorar a ordem; com a letra,
                      lê-se à primeira e a cor serve para acertar depressa. */}
                  <span className="w-[15px] h-[15px] flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: COR_DO_MODULO[i % COR_DO_MODULO.length], border: '1px solid rgba(0,0,0,0.30)' }}>
                    {w.name.slice(0, 1)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="text-[9px] tracking-[0.18em] select-none pb-1"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: TOKENS.textMuted }}>
            MWANA LODGE
          </div>
        </div>

        {/* Árvore de navegação (Windows Explorer) */}
        <div className="w-[228px] flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ background: t.tree, borderColor: TOKENS.chromeLine, color: t.treeText }}>
          {/* O cabeçalho da árvore diz em que módulo se está. Sem ele, a árvore
              muda de conteúdo ao mudar de módulo e nada no ecrã diz porquê. */}
          <div className="h-[20px] flex items-center px-2 text-[11px] font-bold border-b flex-shrink-0"
            style={{ background: TOKENS.chrome, borderColor: TOKENS.chromeLine, color: TOKENS.textOnLight }}>
            {bizModules.find((b) => b.key === module)?.name || 'Menu principal'}
          </div>
          <div className="p-1 border-b" style={{ borderColor: TOKENS.chromeLine }}>
            <div className="flex items-center gap-1.5 px-1.5 py-[3px] border" style={{ borderColor: TOKENS.field, background: dark ? '#2563EB' : '#FFFFFF', borderRadius: 0 }}>
              <Search size={12} className="opacity-50" />
              <input value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} placeholder="Pesquisar ecrãs…"
                className="bg-transparent outline-none text-[11.5px] w-full" style={{ color: t.treeText }} />
            </div>
          </div>
          <div className="flex-1 overflow-auto py-0.5 px-0.5">
            {/* FAVORITOS — primeiro, porque é a pasta a que se volta todos os
                dias. Só aparece quando alguém marcou alguma coisa: uma pasta
                vazia permanente ensina a ignorá-la. */}
            {favs.length > 0 && !treeQuery && (
              <div className="mb-0.5">
                <div className="w-full flex items-center gap-1.5 px-1.5 py-[3px] text-[11.5px] font-bold">
                  <Star size={13} style={{ color: '#D9A441', fill: '#F3CE6A' }} />
                  <span>Favoritos</span>
                  <span className="ml-auto text-[10px] font-normal" style={{ color: TOKENS.textFaint }}>{favs.length}</span>
                </div>
                {favs.filter((id) => VIEW_REGISTRY[id] && screenAllowed(id)).map((id) => {
                  const sel = id === activeView;
                  return (
                    <button key={'fav-' + id} onClick={() => onOpen(id)}
                      className="w-full flex items-center gap-1.5 pl-7 pr-1.5 py-[2px] text-[11.5px] text-left"
                      style={{ background: sel ? TOKENS.selectedBg : 'transparent', color: sel ? TOKENS.textOnSelection : t.treeText }}>
                      <Star size={11} style={{ color: sel ? '#FFFFFF' : '#D9A441', fill: sel ? '#FFFFFF' : '#F3CE6A' }} />
                      <span className="truncate">{ITEM_TITLES[id] || id}</span>
                    </button>
                  );
                })}
              </div>
            )}
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
                    <div className="flex items-center gap-2 px-1.5 pt-2 pb-1 select-none">
                      <span className="text-[9px] font-bold tracking-widest" style={{ color: TOKENS.textFaint }}>{grp}</span>
                      <span className="flex-1 h-px" style={{ background: TOKENS.lineSoft }} />
                    </div>
                  )}
                  <button onClick={() => setExpanded((e) => ({ ...e, [f.key]: !open }))}
                    className="w-full flex items-center gap-1 px-1.5 py-[3px] text-[11.5px] font-bold hover:bg-black/5"
                    style={{ background: f.key === activeFolder ? t.hover : 'transparent', borderRadius: 0 }}>
                    {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    {/* A pasta leva a cor da família (COR_DO_GRUPO) — cheia por
                        dentro e com o contorno mais escuro, como nas imagens:
                        um ícone de traço fino desaparece a este tamanho. */}
                    {open
                      ? <FolderOpen size={13} style={{ color: COR_DO_GRUPO[grp] || '#D9A441', fill: (COR_DO_GRUPO[grp] || '#D9A441') + '55' }} />
                      : <Folder size={13} style={{ color: COR_DO_GRUPO[grp] || '#D9A441', fill: (COR_DO_GRUPO[grp] || '#D9A441') + '55' }} />}
                    <span className="truncate">{f.title}</span>
                    <span className="ml-auto text-[10px] font-normal" style={{ color: TOKENS.textFaint }}>{f.items.length}</span>
                  </button>
                  {open && its.map((it) => {
                    const sel = it.id === activeView;
                    return (
                      /* A LINHA SELECCIONADA É UMA BARRA AZUL DE PONTA A PONTA,
                         com o texto branco por cima (`textOnSelection`, que é
                         justamente o token que antes não existia). É assim que
                         se vê onde se está sem procurar. */
                      <div key={it.id} className="group relative flex items-center"
                        style={{ background: sel ? TOKENS.selectedBg : 'transparent' }}>
                        <button onClick={() => onOpen(it.id)}
                          className="flex-1 min-w-0 flex items-center gap-1.5 pl-6 pr-1 py-[2px] text-[11.5px] text-left hover:bg-black/[0.05]"
                          style={{ color: sel ? TOKENS.textOnSelection : t.treeText, borderRadius: 0 }}>
                          <FileText size={11} className="flex-shrink-0" style={{ color: sel ? '#FFFFFF' : '#7C93AB' }} />
                          <span className="truncate">{it.name}</span>
                        </button>
                        {/* A estrela só aparece com o rato em cima (ou já marcada):
                            uma coluna de estrelas apagadas em quarenta linhas é
                            ruído — o que se lê na árvore são os nomes. */}
                        <button onClick={() => alternarFav(it.id)} title="Adicionar a Favoritos"
                          className={favs.includes(it.id) ? 'px-1' : 'px-1 opacity-0 group-hover:opacity-100'}>
                          <Star size={11}
                            style={{
                              color: favs.includes(it.id) ? '#D9A441' : (sel ? '#FFFFFF' : TOKENS.textFaint),
                              fill: favs.includes(it.id) ? '#F3CE6A' : 'none',
                            }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Área principal: separadores + barra do ecrã + o ecrã ativo */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: t.body }}>

          {/* --- SEPARADORES DE DOCUMENTO --- */}
          {abertos.length > 0 && (
            <div className="h-[22px] flex items-end gap-[1px] px-1 flex-shrink-0 overflow-x-auto border-b"
              style={{ background: TOKENS.tabBar, borderColor: TOKENS.chromeLine }}>
              {abertos.map((id) => {
                const sel = id === activeView;
                return (
                  <div key={id}
                    className="h-[21px] flex items-center gap-1 pl-2 pr-1 text-[11.5px] flex-shrink-0 cursor-default"
                    onClick={() => onOpen(id)}
                    style={{
                      // O separador ABERTO liga-se à área de baixo: fundo branco
                      // igual ao dela e sem linha inferior. É o que o faz parecer
                      // a frente de uma pasta e não mais um botão na fila.
                      background: sel ? TOKENS.tabActive : 'transparent',
                      borderTop: `1px solid ${sel ? TOKENS.chromeLine : 'transparent'}`,
                      borderLeft: `1px solid ${sel ? TOKENS.chromeLine : 'transparent'}`,
                      borderRight: `1px solid ${sel ? TOKENS.chromeLine : 'transparent'}`,
                      marginBottom: sel ? '-1px' : 0,
                      fontWeight: sel ? 700 : 400,
                      color: TOKENS.textOnLight,
                    }}>
                    <span className="truncate max-w-[150px]">{ITEM_TITLES[id] || id}</span>
                    <button onClick={(e) => { e.stopPropagation(); fecharAba(id); }} title="Fechar"
                      className="w-[13px] h-[13px] flex items-center justify-center hover:bg-black/15">
                      <X size={9} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* --- BARRA DE FERRAMENTAS DO ECRÃ ---
              As acções que se usam DENTRO de um ecrã, à mão, sem subir ao ribbon.
              São as mesmas acções (runRibbon) — não há aqui segunda implementação
              nenhuma, só um segundo caminho para as mesmas. */}
          <div className="h-[22px] flex items-center gap-0 px-1 flex-shrink-0 border-b"
            style={{ background: t.bar, borderColor: TOKENS.chromeLine }}>
            {([[Filter, 'Filtro', 'search'], [RefreshCw, 'Atualizar', 'refresh'],
               [Star, 'Favoritos', 'fav'], [Printer, 'Imprimir', 'print'],
               [Download, 'Exportar (Excel)', 'export']] as [any, string, string][]).map(([Ic, label, acc]) => (
              <button key={label} title={label}
                onClick={() => (acc === 'fav' ? alternarFav(activeView) : runRibbon(acc))}
                className="flex items-center gap-1 px-1.5 h-[19px] text-[11px]"
                style={{ color: TOKENS.textOnLight, border: '1px solid transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.hoverGold; e.currentTarget.style.borderColor = TOKENS.hoverGoldLine; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                <Ic size={12} style={{ color: acc === 'fav' && favs.includes(activeView) ? '#D9A441' : '#4A6B8A' }} />
                {label}
              </button>
            ))}
          </div>

          <div id="erp-active-view" className="flex-1 overflow-hidden">
            <ErrorBoundary viewKey={activeView}>
              {Active ? <Active /> : <WelcomePanel tree={tree} moduleName={bizModules.find((b) => b.key === module)?.name} onOpen={onOpen} dark={dark} />}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* ================= BARRA DE ESTADO ================= */}
      <div className="h-[28px] flex items-center px-3 gap-3 text-[11px] flex-shrink-0 overflow-hidden"
        style={{ background: t.status, color: '#FFFFFF' }}>
        <span className="flex items-center gap-1 opacity-90"><Monitor size={12} /> {user?.username || 'operador'}</span>
        <span className="flex items-center gap-1 opacity-90"><Building2 size={12} /> {companyName || 'System Mwana Lodge'}</span>
        {/* Propriedade em que se está a trabalhar (evita lançar num hotel errado). */}
        <span className="flex items-center gap-1 font-bold" title="Propriedade ativa">{hotelName}</span>
        <span className="flex items-center gap-1 opacity-90"><Server size={12} /> {window.location.hostname}:8000</span>
        <span className="flex items-center gap-1 opacity-90" title="Base de dados"><Database size={12} /> {lic ? 'SQL' : '—'}</span>
        <span className="flex items-center gap-1 text-[#6B7280]"><span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" /> Ligado</span>
        <span className="flex items-center gap-1 opacity-90" title="VPN de suporte"><Wifi size={12} /> VPN</span>
        <span className="flex items-center gap-1 opacity-90"><ShieldCheck size={12} /> Licença ativa</span>
        <span className="flex items-center gap-1 opacity-90" title="Memória usada pela aplicação"><Cpu size={12} /> {mem}</span>
        <div className="flex-1" />
        <span className="font-semibold">{ITEM_TITLES[activeView] || ''}</span>
        <span className="opacity-70">v1.0</span>
        <span className="opacity-90">{clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <button onClick={logout} title="Terminar sessão" className="hover:text-[#DC2626] transition-colors"><Power size={13} /></button>
      </div>
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </div>
  );
}

// Página inicial do módulo — mostra as PASTAS por tarefa e os seus ecrãs.
function WelcomePanel({ tree, moduleName, onOpen, dark }:
  { tree: { key: string; title: string; items: { id: string; name: string }[] }[]; moduleName?: string; onOpen: (id: string) => void; dark: boolean }) {
  const card = dark ? 'bg-[#2563EB] border-[#E6E8EC] text-[#6B7280]' : 'bg-white border-[#E6E8EC] text-[#111827]';
  return (
    <div className="h-full overflow-auto p-4">
      <div className="text-[15px] font-bold mb-3" style={{ color: dark ? '#F1F2F4' : '#3B82F6' }}>{moduleName || 'Módulo'} — o que quer fazer?</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tree.map((f) => (
          <div key={f.key} className={`border overflow-hidden ${card}`} style={{ borderRadius: RADIUS.md, boxShadow: SHADOW.soft }}>
            <div className="px-3 py-2 border-b text-[12px] font-bold" style={{ borderColor: dark ? '#2563EB' : '#F1F2F4', background: dark ? '#2563EB' : 'linear-gradient(to bottom,#FFFFFF,#EEF1F5)' }}>
              {f.title}
            </div>
            <div className="p-2">
              {f.items.map((it) => (
                <button key={it.id} onClick={() => onOpen(it.id)}
                  className="w-full flex items-center gap-2 py-1.5 px-1.5 text-[12px] text-left hover:bg-[#EEF1F5] transition-colors" style={{ borderRadius: RADIUS.sm }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3B82F6' }} />
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] opacity-60" style={{ color: dark ? '#3B82F6' : '#2563EB' }}>
        Atalhos: F5 atualizar · Ctrl+P imprimir · Ctrl+N novo · Esc fechar menus.
      </div>
    </div>
  );
}
