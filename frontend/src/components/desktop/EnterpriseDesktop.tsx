import React, { useState, useEffect, useMemo } from 'react';
import { X, Settings, Power, ShieldCheck, Server, Wifi, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ITEM_TITLES, moduleEnabled } from '../../config/navigation';
import { WORKSPACES, workspaceByKey } from '../../config/workspace';
import type { DeskIcon } from '../../config/workspace';
import { getAppearance } from '../../config/appearance';
import { TOKENS, FUNDO_SISTEMA, VEU_SOBRE_FOTO } from '../../config/theme';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { tokenStore, authApi } from '../../api/auth';
import { useActiveModules } from '../../hooks/useActiveModules';
import ClassicIcon from './ClassicIcon';
import { MENUS as PMS_MENU_GROUPS } from '../pms/pmsMenus';

/* ══════════════════════════════════════════════════════════════════════════
   O AMBIENTE DE TRABALHO, NO REGISTO DO WINDOWS 10
   ══════════════════════════════════════════════════════════════════════════

   O que estava aqui era um ambiente "de telemóvel": fundo claro com manchas
   de cor desfocadas, cartões de vidro fosco arredondados a flutuar nos cantos,
   ícones dentro de tiles com bisel, duas barras azuis saturadas (uma em cima e
   uma em baixo) e cantos de 18px por todo o lado.

   Três coisas o denunciavam como brinquedo e não como ferramenta de trabalho:

    1. A BARRA DE CIMA ERA UMA SEGUNDA NAVEGAÇÃO. Tinha F&B, Marketing,
       Reporting, Utilitários — exactamente os mesmos menus que o POS já tem
       lá dentro. Quem clicava num item saía do Ambiente de Trabalho para o
       módulo, onde o mesmo menu estava outra vez. Duas portas para a mesma
       sala, e a de fora com a data escrita a VERMELHO sobre AZUL, que é a
       combinação com menos contraste que se consegue fazer de propósito.
       Os itens não se perderam: foram para o menu Iniciar, que é onde um
       sistema operativo põe "todas as aplicações".

    2. OS PAINÉIS DE VIDRO no canto diziam a hora e três estados (licença,
       servidor, VPN). Um ambiente de trabalho a sério não gasta um quarto do
       ecrã com isso: põe-no na BANDEJA, ao lado do relógio, em ícones de 13px.
       É lá que quem trabalha com Windows os vai procurar.

    3. OS ÍCONES TINHAM CARTÃO. Um ícone de desktop é o desenho e o nome — mais
       nada. O cartão branco por baixo acrescentava uma caixa que não é clicável
       por si, roubava contraste ao desenho e obrigava a cantos arredondados
       que nada mais no sistema tem.

   O fundo passa a ser escuro e neutro, por uma razão prática e não estética:
   num ambiente de trabalho a janela do módulo é que importa, e um fundo claro
   com cor compete com ela. Escuro, o fundo recua e as janelas saltam à frente.

   NOTA SOBRE A COR: isto tira a última cor forte do sistema. O azul da marca
   deixa de aparecer no Ambiente de Trabalho — fica no sublinhado do separador
   activo da barra de tarefas e dentro dos módulos. Foi uma decisão do dono.
   ────────────────────────────────────────────────────────────────────────── */

/** A moldura do sistema: cinzentos quase-negros, como a barra de tarefas. */
const BARRA = '#1F1F1F';          // barra de tarefas
const BARRA_ALTO = '#2B2B2B';     // o que está por cima dela (menu Iniciar)
const BARRA_HOVER = '#383838';    // rato por cima
const LINHA = '#3C3C3C';          // divisórias dentro do escuro
const TEXTO = '#F3F3F3';          // texto principal sobre escuro
const TEXTO_FRACO = '#A0A0A0';    // legendas, estados

export default function EnterpriseDesktop({ onOpen }: { onOpen: (screen: string, module: string) => void }) {
  const nav = useNavigate();
  const { data: lic } = useActiveModules();
  const user = tokenStore.getUser();
  const erpName = getAppearance('erpName');
  // Logótipo real da empresa (Administração → Empresa) — mesma fonte que o login
  // e os documentos fiscais usam. Aparece no cabeçalho do menu Iniciar.
  const [logoUrl, setLogoUrl] = useState('');
  useEffect(() => {
    apiClient.get('platform/branding/').then((r) => setLogoUrl(r.data?.logo_url || '')).catch(() => {});
  }, []);

  const active = lic?.active || [];
  const licensed = useMemo(() => WORKSPACES.filter((w) => moduleEnabled(w.licenseModule, active)), [lic]);
  const [wsKey, setWsKey] = useState('');
  useEffect(() => { if (!wsKey && licensed.length) setWsKey(licensed[0].key); }, [licensed, wsKey]);
  const ws = workspaceByKey(wsKey) || licensed[0] || WORKSPACES[0];

  const [start, setStart] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date());
  // DE MINUTO A MINUTO, não de 15 em 15 segundos. O relógio mostra horas e
  // minutos: três das quatro voltas eram trabalho para pintar o mesmo texto.
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t); }, []);

  const [recent, setRecent] = useState<{ screen: string; label: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('recent_screens') || '[]'); } catch { return []; }
  });
  const open = (screen?: string, label?: string) => {
    if (!screen) return;
    const item = { screen, label: label || ITEM_TITLES[screen] || screen };
    const next = [item, ...recent.filter((r) => r.screen !== screen)].slice(0, 6);
    setRecent(next); localStorage.setItem('recent_screens', JSON.stringify(next));
    setStart(false);
    onOpen(screen, wsKey);
  };
  const openIcon = (ic: DeskIcon) => { if (ic.launch) window.open(ic.launch, '_blank', 'noopener'); else open(ic.screen, ic.label); };
  const logout = async () => { await authApi.logout(); nav('/backoffice/login'); };
  const closeAll = () => { setStart(false); setSelecionado(null); };

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

  // "Terminar sessão" NÃO entra nestas listas. É uma acção do sistema, não uma
  // aplicação, e o menu Iniciar já a tem no rodapé ao lado do botão de desligar
  // — como no Windows. Tê-la nos dois sítios punha a mesma coisa duas vezes no
  // mesmo painel.
  const MENUS = wsKey === 'pms' ? PMS_MENUS : POS_MENUS;

  // CADA MÓDULO PODE TER O SEU FUNDO. O papel de parede era um só, partilhado
  // por todos os ambientes de trabalho — mudá-lo no PMS mudava-o também no POS,
  // e era por isso que trocar o fundo "do PMS" não dava diferença nenhuma aqui:
  // o ecrã lia a chave partilhada e ignorava a do PMS. Agora, no ambiente do
  // PMS, manda o fundo do PMS; sem nenhum definido, cai para o partilhado, que
  // continua a ser o do Ambiente de Trabalho em geral.
  const fundoDoModulo = wsKey === 'pms'
    ? (typeof localStorage !== 'undefined' ? localStorage.getItem('ui_wallpaper_pms') : null)
    : null;
  const customBg = fundoDoModulo || getAppearance('wallpaper') || getAppearance('loginBg');

  // SOBRE A FOTOGRAFIA DO HOTEL vai um véu escuro NEUTRO, não um véu azul.
  // O véu azul tingia a fotografia do dono de uma cor que não é a dela — e o
  // véu existe por uma razão só: os nomes dos ícones são brancos e um céu claro
  // na fotografia tornava-os ilegíveis. Escurecer resolve isso; tingir não.
  const bgStyle = customBg
    ? {
      backgroundImage: `${VEU_SOBRE_FOTO}, url(${customBg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    : { background: FUNDO_SISTEMA };

  return (
    <div className="h-screen w-screen overflow-hidden select-none font-sans relative flex flex-col"
      style={bgStyle} onClick={closeAll}>

      {/* ===== ÁREA DE TRABALHO ===== */}
      <div className="flex-1 relative overflow-hidden">
        {/* Os ícones, em coluna a partir do canto superior esquerdo — como num
            ambiente de trabalho a sério, e não centrados nem em grelha larga. */}
        <div className="absolute top-2 left-2 grid gap-1 content-start"
          style={{ gridTemplateRows: 'repeat(7, auto)', gridAutoFlow: 'column' }}>
          {quick.map((ic, i) => (
            <DesktopIcon key={`quick-${i}`} ic={ic}
              sel={selecionado === `quick-${i}`}
              onSel={(e) => { e.stopPropagation(); setSelecionado(`quick-${i}`); }}
              onOpen={() => openIcon(ic)} />
          ))}
          {/* MÓDULOS com "Mostrar no Desktop" — abrem como a ficha manda (open_as).
              São do backoffice POS (Configuração POS › Módulo) — no ambiente de
              trabalho do PMS não aparecem, o PMS é autossuficiente e traz só o seu
              próprio ícone. Chave prefixada: partilha o painel com os ícones rápidos
              acima (outro .map, outras chaves) — sem prefixo, um module_id como "1"
              colidia com o índice de um ícone rápido (mesma chave "1" em irmãos). */}
          {wsKey !== 'pms' && modulos.map((m: any) => (
            <DesktopIcon key={`mod-${m.module_id}`}
              ic={{ label: m.name, icon: 'app' } as any}
              sel={selecionado === `mod-${m.module_id}`}
              onSel={(e) => { e.stopPropagation(); setSelecionado(`mod-${m.module_id}`); }}
              onOpen={() => abrirModulo(m)} />
          ))}
        </div>

        {/* JANELA EMBEBIDA (iframe) ou WIDGET — a caixa da ficha do módulo decide.
            Moldura quadrada e cinzenta, a mesma das janelas do backoffice. */}
        {embutido && (
          <div className={embutido.widget
            ? 'absolute bottom-3 right-3 w-[460px] h-[340px] z-[90] overflow-hidden'
            : 'absolute inset-4 z-[90] overflow-hidden'}
            style={{ border: '1px solid #6E6E6E', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', background: '#FFFFFF' }}>
            <div className="h-[24px] flex items-center justify-between px-2 text-[11px] font-bold"
              style={{
                background: 'linear-gradient(to bottom, #FDFDFD, #F0F0F0)',
                borderBottom: '1px solid #C8C8C8', color: '#2B2B2B',
              }}>
              <span>{embutido.title}{embutido.widget ? ' (widget)' : ''}</span>
              <button onClick={() => setEmbutido(null)} className="px-1.5 hover:bg-[#DC2626] hover:text-white"
                title="Fechar"><X size={13} /></button>
            </div>
            <iframe src={embutido.url} title={embutido.title}
              className="w-full bg-white" style={{ height: 'calc(100% - 24px)', border: 0 }} />
          </div>
        )}
      </div>

      {/* ══════════════════ BARRA DE TAREFAS ══════════════════
          40px, quase negra, quadrada. Botão Iniciar · módulos abertos como
          separadores · bandeja com os estados e o relógio. Nada mais: tudo o
          que cá estava a mais foi para o menu Iniciar. */}
      <div className="h-[40px] flex items-stretch flex-shrink-0 relative z-[100]"
        style={{ background: BARRA, borderTop: `1px solid ${LINHA}` }}>

        {/* O botão Iniciar. Quadrado, da altura toda da barra, sem texto —
            é o símbolo que o torna reconhecível, não a palavra. */}
        <button onClick={(e) => { e.stopPropagation(); setStart((s) => !s); }}
          title="Iniciar" aria-label="Iniciar"
          className="w-[48px] flex items-center justify-center transition-colors"
          style={{ background: start ? BARRA_HOVER : 'transparent', color: TEXTO }}
          onMouseEnter={(e) => { if (!start) e.currentTarget.style.background = BARRA_HOVER; }}
          onMouseLeave={(e) => { if (!start) e.currentTarget.style.background = 'transparent'; }}>
          <JanelasIcone />
        </button>

        {/* OS MÓDULOS COMO SEPARADORES. É aqui que se troca de módulo — era um
            menu escondido atrás do logótipo, que ninguém encontrava (o dono
            escreveu "Não vejo o PMS" com o PMS licenciado e a funcionar).
            Numa barra de tarefas, o que está aberto está à vista. */}
        {licensed.map((m) => {
          const act = m.key === wsKey;
          return (
            <button key={m.key} onClick={(e) => { e.stopPropagation(); setWsKey(m.key); setStart(false); }}
              title={`${m.name} — ${erpName}`}
              className="flex items-center gap-2 px-3 min-w-[150px] text-[12px] transition-colors"
              style={{
                background: act ? '#3A3A3A' : 'transparent',
                color: act ? TEXTO : '#CFCFCF',
                // O sublinhado é a ÚNICA cor forte que sobra na moldura: diz qual
                // o módulo em que se está a trabalhar, e é a marca da casa.
                borderBottom: act ? `3px solid ${TOKENS.accent}` : '3px solid transparent',
              }}
              onMouseEnter={(e) => { if (!act) e.currentTarget.style.background = '#2E2E2E'; }}
              onMouseLeave={(e) => { if (!act) e.currentTarget.style.background = 'transparent'; }}>
              <span className="flex-shrink-0 opacity-90"><ClassicIcon name="gear" size={15} /></span>
              <span className="truncate font-medium">{m.name}</span>
            </button>
          );
        })}

        <div className="flex-1" />

        {/* ══ BANDEJA ══
            Os três estados que estavam em painéis de vidro de 220px: licença,
            servidor e VPN. Aqui, em ícones de 13px com o estado no tooltip —
            é o sítio onde quem usa Windows os vai procurar, e deixam de roubar
            um canto do ecrã para dizerem sempre a mesma coisa. */}
        <div className="flex items-center gap-2.5 px-2.5" style={{ color: TEXTO_FRACO }}>
          <span title="Licença: activa"><ShieldCheck size={14} strokeWidth={1.8} /></span>
          <span title="Servidor: online"><Server size={14} strokeWidth={1.8} /></span>
          <span title="VPN: ligada"><Wifi size={14} strokeWidth={1.8} /></span>
        </div>

        {/* O RELÓGIO, em duas linhas e alinhado à direita — horas em cima, data
            em baixo. A data estava escrita a VERMELHO sobre AZUL na barra de
            cima, que é o pior contraste que se consegue fazer. */}
        <div className="flex flex-col items-end justify-center px-3 leading-[1.15] text-[11px] cursor-default"
          style={{ color: TEXTO }}
          title={clock.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}>
          <span className="num">{clock.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="num" style={{ color: TEXTO_FRACO }}>
            {clock.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ══════════════════ MENU INICIAR ══════════════════
          Duas colunas, como no Windows 10: à esquerda TODAS AS APLICAÇÕES do
          módulo, agrupadas pelos mesmos títulos que o módulo usa lá dentro; à
          direita os mosaicos dos atalhos. Os menus que estavam na barra azul de
          cima vivem agora aqui — é o sítio certo para eles, porque são uma
          lista de aplicações e não uma navegação permanente. */}
      {start && (
        <div className="absolute bottom-[40px] left-0 w-[560px] z-[130] flex flex-col"
          style={{
            background: BARRA_ALTO, border: `1px solid ${LINHA}`, borderBottom: 'none',
            boxShadow: '0 -8px 26px rgba(0,0,0,0.45)',
          }}
          onClick={(e) => e.stopPropagation()}>

          {/* Cabeçalho: quem está ligado e em que módulo. */}
          <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: `1px solid ${LINHA}` }}>
            {logoUrl
              ? <img src={logoUrl} alt="" className="h-7 w-7 object-contain flex-shrink-0" />
              : <span className="h-7 w-7 flex items-center justify-center flex-shrink-0"
                style={{ background: '#3A3A3A', color: TEXTO }}><JanelasIcone /></span>}
            <div className="leading-tight min-w-0">
              <div className="text-[12px] font-semibold truncate" style={{ color: TEXTO }}>
                {user?.username || 'operador'}
              </div>
              <div className="text-[10.5px] truncate" style={{ color: TEXTO_FRACO }}>{erpName} · {ws.name}</div>
            </div>
          </div>

          <div className="flex" style={{ height: '380px' }}>
            {/* ── Todas as aplicações ── */}
            <div className="w-[290px] overflow-auto pt-1 pb-3" style={{ borderRight: `1px solid ${LINHA}` }}>
              {recent.length > 0 && (
                <>
                  <GrupoTitulo>Usado recentemente</GrupoTitulo>
                  {recent.slice(0, 4).map((r) => (
                    <ItemIniciar key={`rec-${r.screen}`} label={r.label} onClick={() => open(r.screen, r.label)} />
                  ))}
                </>
              )}
              {Object.keys(MENUS).map((grupo) => (
                <React.Fragment key={grupo}>
                  <GrupoTitulo>{grupo}</GrupoTitulo>
                  {MENUS[grupo].map((it, i) => (
                    <ItemIniciar key={`${grupo}-${i}`} label={it.label}
                      onClick={() => (it.act ? (it.act(), setStart(false)) : open(it.screen, it.label))} />
                  ))}
                </React.Fragment>
              ))}
            </div>

            {/* ── Mosaicos ── */}
            <div className="flex-1 p-2 overflow-auto">
              <GrupoTitulo>{ws.name}</GrupoTitulo>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {ws.icons.map((ic, i) => (
                  <button key={i} onClick={() => openIcon(ic)}
                    className="flex flex-col items-start justify-end gap-1 h-[88px] p-2 text-left transition-colors"
                    style={{ background: '#3A3A3A', color: TEXTO }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#474747'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#3A3A3A'; }}>
                    <span className="flex-1 flex items-center"><ClassicIcon name={ic.icon} size={26} /></span>
                    <span className="text-[11px] leading-tight">{ic.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Rodapé: as acções do sistema, não aplicações. */}
          <div className="flex" style={{ borderTop: `1px solid ${LINHA}` }}>
            <button onClick={() => { localStorage.setItem('ui_shell', 'classic'); onOpen('home:admin', wsKey); }}
              className="flex-1 px-3 py-2 text-[11.5px] text-left flex items-center gap-2 transition-colors"
              style={{ color: TEXTO }}
              onMouseEnter={(e) => { e.currentTarget.style.background = BARRA_HOVER; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <Settings size={13} /> Backoffice clássico
            </button>
            <button onClick={logout}
              className="px-4 py-2 text-[11.5px] flex items-center gap-2 transition-colors"
              style={{ color: TEXTO }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#C42B1C'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <Power size={13} /> Terminar sessão
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** O símbolo do botão Iniciar — quatro quadrados, desenhados e não um emoji. */
function JanelasIcone() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="7" height="7" /><rect x="9" y="0" width="7" height="7" />
      <rect x="0" y="9" width="7" height="7" /><rect x="9" y="9" width="7" height="7" />
    </svg>
  );
}

/** Título de grupo dentro do menu Iniciar. */
function GrupoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: TEXTO_FRACO }}>
      {children}
    </div>
  );
}

/** Uma linha da lista de aplicações. */
function ItemIniciar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-[5px] text-left text-[12px] transition-colors"
      style={{ color: TEXTO }}
      onMouseEnter={(e) => { e.currentTarget.style.background = BARRA_HOVER; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <ChevronRight size={11} style={{ color: TEXTO_FRACO }} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * ÍCONE DO AMBIENTE DE TRABALHO — o desenho e o nome, e mais nada.
 *
 * Tinha um cartão de vidro fosco de 64px com cantos de 18px por baixo. O cartão
 * não era clicável por si, roubava contraste ao desenho e era a única coisa no
 * sistema com cantos daquele tamanho.
 *
 * A SELECÇÃO é um rectângulo translúcido fino por cima de tudo — exactamente o
 * que o Windows faz. Um clique selecciona (e mostra que se seleccionou), um
 * duplo clique abre; a tecla Enter também abre, para quem navega por teclado.
 * Sem isto, um clique que não acerte em cheio no desenho não dá resposta
 * nenhuma e parece que o ambiente de trabalho não reagiu.
 *
 * O nome é SEMPRE branco com sombra. O fundo é escuro de fábrica e escuro por
 * baixo do véu quando o hotel põe a sua fotografia — a sombra é o que o mantém
 * legível se a fotografia tiver um céu claro naquele canto.
 */
function DesktopIcon({ ic, sel, onSel, onOpen }:
{ ic: DeskIcon; sel?: boolean; onSel: (e: React.MouseEvent) => void; onOpen: () => void }) {
  return (
    <button
      onClick={onSel}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      title={`${ic.label} — duplo clique para abrir`}
      className="w-[84px] flex flex-col items-center gap-1 px-1 py-1.5 focus:outline-none"
      style={{
        background: sel ? 'rgba(255,255,255,0.14)' : 'transparent',
        border: sel ? '1px solid rgba(255,255,255,0.30)' : '1px solid transparent',
      }}
      onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
      <span className="h-[40px] flex items-center justify-center" style={{ color: '#E8EDF2' }}>
        {ic.img
          ? <img src={`/icons/${ic.img}`} alt="" className="w-9 h-9 object-contain" />
          : <ClassicIcon name={ic.icon} size={33} />}
      </span>
      <span className="text-[11px] text-center leading-tight text-white"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.6)' }}>
        {ic.label}
      </span>
    </button>
  );
}
