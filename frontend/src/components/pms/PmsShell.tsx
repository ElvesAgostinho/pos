import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Users, Building2 } from 'lucide-react';
import { aviso } from '../../ui/dialogo';
import { Glyph } from '../posconfig/kit';
import { apiClient } from '../../api/client';
import { MENUS } from './pmsMenus';
import { useActiveModules } from '../../hooks/useActiveModules';
import { RADIUS, SHADOW } from '../../config/theme';
import PmsPermissionsDialog from './PmsPermissionsDialog';
import { useMyAccess } from '../../hooks/useActiveModules';
import PmsAvailabilityView from './PmsAvailabilityView';
import PmsReservationsView from './PmsReservationsView';
import PmsGroupReservationsView from './PmsGroupReservationsView';
import PmsBlocksView from './PmsBlocksView';
import PmsRoomsView from './PmsRoomsView';
import PmsRoomTypesView from './PmsRoomTypesView';
import PmsRatePlansView from './PmsRatePlansView';
import PmsRatesCalendarView from './PmsRatesCalendarView';
import PmsRoomsBulkEditView from './PmsRoomsBulkEditView';
import PmsGuestsCompaniesView from './PmsGuestsCompaniesView';
import PmsFinanceView from './PmsFinanceView';
import PmsReportsView from './PmsReportsView';
import PmsHotelStatusView from './PmsHotelStatusView';
import PmsPlanningView from './PmsPlanningView';
import PmsCheckOutView from './PmsCheckOutView';
import PmsNightAuditView from './PmsNightAuditView';
import PmsProductsServicesView from './PmsProductsServicesView';
import PmsMemberCardsView from './PmsMemberCardsView';
import PmsLostFoundView from './PmsLostFoundView';
import PmsTasksView from './PmsTasksView';
import PmsPhoneDirectoryView from './PmsPhoneDirectoryView';
import PmsHomeDashboardView from './PmsHomeDashboardView';
import BookingEngineView from '../integration/BookingEngineView';
import ChannelManagerView from '../integration/ChannelManagerView';
import PmsChatbotView from './PmsChatbotView';
import PmsBookingDepositsView from './PmsBookingDepositsView';
import DesktopWallpaperView from '../admin/DesktopWallpaperView';
import {
  GruposDeUtilizadores, Utilizadores as UtilizadoresPartilhados, TiposRH, RecursosHumanos,
} from '../shared/userManagement';
import PmsEventsView from './PmsEventsView';
import PmsEventsCalendarView from './PmsEventsCalendarView';
import PmsEventsForecastView from './PmsEventsForecastView';
import PmsUsersView from './PmsUsersView';
// Estes já existem no POS (Configuração POS) — ligamos ao MESMO componente
// (mesmos dados, mesma lógica), só com a moldura do PMS à volta, para não
// parecer que se está a saltar de módulo.
import PosReports from '../posconfig/PosReports';
import PosOnline from '../posconfig/PosOnline';
import PosCurrentAccounts from '../posconfig/PosCurrentAccounts';
import { PosDayClose, PosSaft, PosDiagnostics } from '../posconfig/PosOps';
import { EntitySearch, EventRequests } from '../posconfig/PosMarketing';
import { SysLogsView } from '../system/PlatformViews';
import PmsDocumentScanView from './PmsDocumentScanView';

/**
 * PMS — cabeçalho e menus PRÓPRIOS (não o menu clássico do resto do backoffice).
 * Estrutura igual à do sistema hoteleiro de referência (Reserva/Front Desk/Contas/
 * Gestão de Canais/Marketing/Reporting/Utilitários/EMS) — o mesmo padrão que a
 * Configuração POS já usa (ver PosConfigView.tsx, "igual aos sistemas hoteleiros
 * de referência"). Ecrã de ECRÃ INTEIRO — traz a sua própria moldura, sempre a
 * mesma, seja qual for a secção ativa (nunca a árvore/ribbon clássica).
 */
const SECTIONS: Record<string, { label: string; icon: string; Comp: any }> = {
  availability: { label: 'Disponibilidade', icon: '📊', Comp: PmsAvailabilityView },
  reservations: { label: 'Reservas', icon: '🔍', Comp: PmsReservationsView },
  group_reservations: { label: 'Reservas de Grupo', icon: '👥', Comp: PmsGroupReservationsView },
  blocks: { label: 'Blocos', icon: '🗂', Comp: PmsBlocksView },
  rooms: { label: 'Mapa de Quartos', icon: '🛏', Comp: PmsRoomsView },
  room_types: { label: 'Categorias de Quarto', icon: '🛏', Comp: PmsRoomTypesView },
  rate_plans: { label: 'Tarifas (Rate Codes)', icon: '💰', Comp: PmsRatePlansView },
  rates_calendar: { label: 'Calendário de Tarifas', icon: '📊', Comp: PmsRatesCalendarView },
  rooms_bulk: { label: 'Gestão de Quartos', icon: '🏢', Comp: PmsRoomsBulkEditView },
  guests_companies: { label: 'Hóspedes & Empresas', icon: '👤', Comp: PmsGuestsCompaniesView },
  finance_pms: { label: 'Financeiro', icon: '📋', Comp: PmsFinanceView },
  // A MESMA Conta Corrente do POS (mesmos dados: fiscal.FiscalDocument por
  // Customer, que já mistura tickets do POS com faturas de folio do PMS —
  // "source_module" é só metadado do documento, a conta é da entidade, não do
  // módulo). Antes este item do menu apontava para "reservations" (só o folio
  // de UMA reserva de cada vez) — dava a entender que era uma conta corrente a
  // sério e não era; agora é a conta a sério, partilhada com o POS.
  current_accounts: { label: 'Contas Correntes', icon: '💰', Comp: PosCurrentAccounts },
  booking_deposits: { label: 'Depósitos de Reservas Online', icon: '💳', Comp: PmsBookingDepositsView },
  reports: { label: 'Relatórios', icon: '🖨', Comp: PosReports },
  reports_pms: { label: 'Performance & Ocupação', icon: '📊', Comp: PmsReportsView },
  online: { label: 'Informação Online', icon: '📈', Comp: PosOnline },
  dayclose_pos: { label: 'Fecho do dia POS', icon: '🌙', Comp: PosDayClose },
  saft_pos: { label: 'SAFT-AO', icon: '🧾', Comp: PosSaft },
  diag_pos: { label: 'Diagnóstico', icon: '⚙', Comp: PosDiagnostics },
  hotel_status: { label: 'Estado Hotel', icon: '🏛', Comp: PmsHotelStatusView },
  planning: { label: 'Planning', icon: '🕐', Comp: PmsPlanningView },
  checkout: { label: 'Check-Out', icon: '🧾', Comp: PmsCheckOutView },
  night_audit: { label: 'Auditoria da Noite', icon: '🌙', Comp: PmsNightAuditView },
  products_services: { label: 'Produtos & Serviços', icon: '📦', Comp: PmsProductsServicesView },
  membership_points: { label: 'Gestão de Pontos', icon: '⭐', Comp: PmsMemberCardsView },
  entity_search: { label: 'Pesquisa de Entidades', icon: '🔎', Comp: EntitySearch },
  event_list: { label: 'Lista de Eventos', icon: '🎉', Comp: EventRequests },
  lost_found: { label: 'Perdidos e Achados', icon: '📦', Comp: PmsLostFoundView },
  tasks: { label: 'Tarefas', icon: '✔', Comp: PmsTasksView },
  phone_directory: { label: 'Lista Telefónica', icon: '☎', Comp: PmsPhoneDirectoryView },
  home_dashboard: { label: 'Início', icon: '🖥', Comp: PmsHomeDashboardView },
  // PAPEL DE PAREDE PRÓPRIO DO PMS. É o MESMO ecrã do Ambiente de Trabalho, com
  // outra chave: o trabalho (escolher ficheiro, limitar o tamanho, pré-visualizar,
  // guardar por terminal) é idêntico, e duplicá-lo era ter dois sítios para
  // corrigir o mesmo problema. A recepção pode assim pôr a fachada do hotel por
  // trás do PMS sem mudar o fundo do Ambiente de Trabalho, que é partilhado.
  wallpaper: {
    label: 'Papel de Parede', icon: '🖼',
    Comp: (p: any) => <DesktopWallpaperView {...p}
      storageKey="ui_wallpaper_pms" title="Papel de Parede do PMS"
      hint="Fundo do Ambiente de Trabalho do PMS — o ecrã com os ícones, o relógio e o painel de estado. É independente do fundo do POS: trocar aqui não mexe no outro." />,
  },
  booking_engine: { label: 'Booking Engine', icon: '🔗', Comp: BookingEngineView },
  channel_manager: { label: 'Channel Manager', icon: '🔗', Comp: ChannelManagerView },
  chatbot: { label: 'Chatbot', icon: '✉', Comp: PmsChatbotView },
  events: { label: 'EMS (Eventos)', icon: '🎉', Comp: PmsEventsView },
  events_calendar: { label: 'Calendário EMS', icon: '🕐', Comp: PmsEventsCalendarView },
  events_forecast: { label: 'Previsão EMS', icon: '📈', Comp: PmsEventsForecastView },
  users: { label: 'Utilizadores (PMS)', icon: '👤', Comp: PmsUsersView },
  // GESTÃO DE UTILIZADORES — os MESMOS ecrãs da Configuração POS, montados aqui
  // (components/shared/userManagement.tsx). Os módulos vendem-se separados, mas
  // quem usa o sistema é a mesma pessoa: o recepcionista que lança o consumo no
  // quarto é o mesmo que abre a conta no restaurante. Dois cadastros seria criar
  // cada empregado duas vezes — e esquecer de o despedir num deles.
  user_groups: { label: 'Grupos de Utilizadores', icon: '👥', Comp: GruposDeUtilizadores },
  user_list: { label: 'Utilizadores', icon: '👤', Comp: UtilizadoresPartilhados },
  hr_types: { label: 'Tipo R.H.', icon: '●', Comp: TiposRH },
  hr_people: { label: 'Recursos Humanos', icon: '🧑', Comp: RecursosHumanos },
  sys_logs_pms: { label: 'Logs', icon: '📋', Comp: SysLogsView },
  document_scan: { label: 'Leitor de Documentos', icon: '🪪', Comp: PmsDocumentScanView },
};

// MENUS agora vive em pmsMenus.ts (importado lá em cima) — ver o comentário
// nesse ficheiro sobre porquê (Fast Refresh + cascata de invalidação).

export default function PmsShell({ onDesktop }: { onBack?: () => void; onOpen?: (id: string) => void; onDesktop?: () => void }) {
  // MENUS VISÍVEIS — um módulo que o cliente não comprou não aparece.
  // `licensing/active-modules/` diz o que a licença autoriza (e não o que está
  // instalado: 'pos' entra sempre no esquema por razões técnicas — ver
  // licensing/views.py::_active_modules). Em erro, mostra-se tudo: trancar o
  // menu porque um pedido falhou seria pior do que mostrar a mais.
  const { data: modulos } = useActiveModules();
  const activos: string[] | null = modulos?.active ?? null;
  const temModulo = (m?: string) => !m || activos === null || activos.includes(m);
  const MENUS_VISIVEIS = MENUS
    .map((g) => ({ ...g, items: g.items.filter((it) => temModulo(it.needs)) }))
    .filter((g) => g.items.length > 0);
  // A secção com que se abre: quem manda abrir o PMS (o Ambiente de Trabalho, um
  // atalho dos seus próprios menus) deixa-a aqui — mesmo padrão do posc_section
  // que a Configuração POS já usa.
  const [section, setSection] = useState(() => {
    const pedida = localStorage.getItem('pms_section');
    if (pedida) localStorage.removeItem('pms_section');
    return pedida || 'home_dashboard';
  });
  const [menu, setMenu] = useState<string | null>(null);
  const [showPerms, setShowPerms] = useState(false);
  const cur = SECTIONS[section];
  const Comp = cur.Comp;
  const [clock] = useState(() => new Date());
  // O mesmo logótipo real da instalação (Empresa → Imagem do Hotel) que o
  // Ambiente de Trabalho e a Configuração POS já mostram — nada de "ML"
  // escrito à mão só aqui, que ficava diferente do resto do sistema.
  const [logoUrl, setLogoUrl] = useState('');
  useEffect(() => {
    apiClient.get('platform/branding/').then((r) => setLogoUrl(r.data?.logo_url || '')).catch(() => {});
  }, []);

  const { data: myHotels } = useQuery({
    queryKey: ['auth', 'hotels'],
    queryFn: async () => (await apiClient.get('auth/hotels/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const hotels: any[] = myHotels?.hotels || [];
  const [hotelId, setHotelId] = useState(() => localStorage.getItem('erp_hotel') || '');
  const hotelName = hotels.find((h) => String(h.id) === hotelId)?.name || hotels[0]?.name || '';

  const { data: access } = useMyAccess();
  const accFull = access?.full !== false;
  const accScreens = access?.screens ?? [];
  const screenAllowed = (id: string) => accFull || accScreens.length === 0 || accScreens.includes(id);

  return (
    <div className="h-full flex flex-col" style={{ background: '#F3F4F6', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      {/* Barra de menus (topo escuro) — cabeçalho próprio do PMS */}
      <div className="flex items-center gap-1 px-3 flex-shrink-0 text-white" style={{ background: '#17375E', height: 56 }}>
        <div className="relative pr-4 mr-2">
          <button onClick={() => setMenu(menu === '__ml' ? null : '__ml')} title="Trocar de módulo"
            className={`flex items-center gap-2 px-2 py-1 leading-none ${menu === '__ml' ? 'bg-white/15' : 'hover:bg-white/10'}`}>
            {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 object-contain flex-shrink-0 rounded-full" /> : <Building2 size={20} className="flex-shrink-0" />}
          </button>
          {menu === '__ml' && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-full mt-1.5 z-[61] min-w-[230px] py-1 overflow-hidden" style={{ background: '#17375E', borderRadius: RADIUS.md, boxShadow: SHADOW.panel }}>
                <button onClick={() => { setMenu(null); localStorage.removeItem('ui_shell'); onDesktop?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#2E75B6] transition-colors">
                  <span className="w-5 flex items-center justify-center opacity-80"><Glyph icon="🖥" size={15} /></span>
                  Ambiente de Trabalho
                </button>
              </div>
            </>
          )}
        </div>

        {MENUS_VISIVEIS.map((m) => (
          <div key={m.title} className="relative">
            {/* Só troca de menu ao CLICAR — havia um onMouseEnter aqui que trocava
                de menu só de o rato passar por cima do título ao caminho de outro
                sítio, sem se clicar em nada: o operador achava que o sistema
                "saltava sozinho" de secção. */}
            <button onClick={() => setMenu(menu === m.title ? null : m.title)}
              // A seta "▾" saiu: com os títulos todos na barra, não cabia ao lado
              // do texto e caía para uma segunda linha debaixo de cada menu.
              // Que um título de menu abre uma lista já se percebe por si.
              className="px-3 py-1.5 text-[14px] font-semibold hover:bg-white/10 transition-colors whitespace-nowrap"
              style={{ background: menu === m.title ? 'rgba(255,255,255,0.1)' : 'transparent', borderRadius: RADIUS.sm }}>
              {m.title}
            </button>
            {menu === m.title && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
                <div className="absolute left-0 top-full mt-1.5 z-[61] min-w-[260px] py-1 overflow-hidden" style={{ background: '#17375E', borderRadius: RADIUS.md, boxShadow: SHADOW.panel }}>
                  {m.items.map((it, i) => (
                    <button key={i}
                      onClick={() => {
                        setMenu(null);
                        if (it.soon) { aviso(`"${it.label}" ainda não está construído nesta fase do PMS.`); return; }
                        if (it.url) { window.open(it.url, '_blank'); return; }
                        if (it.section) {
                          if (!screenAllowed(`pms_${it.section}`)) { aviso('Sem permissão para aceder a este ecrã.'); return; }
                          setSection(it.section);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#2E75B6] transition-colors">
                      <span className="w-5 flex items-center justify-center opacity-80"><Glyph icon={it.icon} size={16} /></span>
                      {it.label}{it.soon && <span className="ml-auto text-[10px] opacity-50">(brevemente)</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-4 text-[13px]">
          <span className="font-bold">{JSON.parse(localStorage.getItem('erp_user') || '{}').username || 'operador'}</span>
        </div>
      </div>

      {/* Título da secção ativa */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 text-white text-[15px] font-bold flex-shrink-0" style={{ background: '#17375E' }}>
        <span className="inline-flex items-center opacity-90"><Glyph icon={cur.icon} size={17} /></span>
        {cur.label}{hotelName && <span className="font-normal opacity-70"> — {hotelName}</span>}
        <button onClick={() => setShowPerms(true)} title="Permissões deste ecrã"
          className="ml-auto w-7 h-7 flex items-center justify-center text-[#6B7280] hover:text-white hover:bg-white/10 transition-colors" style={{ borderRadius: RADIUS.sm }}>
          <Users size={15} />
        </button>
      </div>

      {/* `flex flex-col` (e não só `overflow-hidden`): quase todos os ecrãs do
          PMS são `flex-1 overflow-auto` por dentro. Sem o pai ser flex, esse
          `flex-1` não tem altura nenhuma para trabalhar — o conteúdo crescia
          para fora e era simplesmente CORTADO por este `overflow-hidden`, sem
          barra de deslocamento (era o que acontecia no Diagnóstico: metade do
          ecrã inacessível). `min-h-0` é o que permite ao filho encolher dentro
          do flex em vez de empurrar o contentor. */}
      {/* O papel de parede do PMS vive no AMBIENTE DE TRABALHO do PMS
          (EnterpriseDesktop), que é onde um fundo faz sentido e onde o dono o
          foi procurar. Cheguei a pô-lo também aqui, por trás do ecrã inicial,
          com um véu escuro por cima — era a mesma imagem com dois tratamentos
          diferentes em dois sítios, e dentro da aplicação, onde se lêem números,
          um fundo fotográfico é só ruído. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <Comp onDesktop={onDesktop} onNavigate={setSection} />
      </div>

      {/* Rodapé — um bar só (era dois empilhados: ação do ecrã + hora, e depois
          separador/versão/hotel — a mesma informação cabe toda numa linha). */}
      <div className="h-8 flex items-center px-3 gap-3 flex-shrink-0 text-white text-[11px]" style={{ background: '#17375E' }}>
        <span className="opacity-80">Atualizado em {clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        {hotels.length > 1 && (
          <select value={hotelId || String(hotels[0]?.id)} onChange={(e) => { setHotelId(e.target.value); localStorage.setItem('erp_hotel', e.target.value); }}
            className="h-6 text-[11px] px-1.5 border" style={{ background: '#17375E', borderColor: '#1F4E79', borderRadius: RADIUS.sm }}>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <span className="opacity-50">PMS v1.0</span>
        <button onClick={() => { localStorage.removeItem('ui_shell'); onDesktop?.(); }}
          className="flex items-center gap-1.5 font-semibold hover:text-white opacity-90 hover:opacity-100 transition-opacity" title="Fechar (volta ao Ambiente de Trabalho)">
          <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B42318] text-white">
            <X size={10} strokeWidth={3} />
          </span>
          Fechar
        </button>
      </div>

      {showPerms && (
        <PmsPermissionsDialog screenId={`pms_${section}`} screenLabel={cur.label} hotelName={hotelName}
          onClose={() => setShowPerms(false)} />
      )}
    </div>
  );
}
