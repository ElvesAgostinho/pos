import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Users, Building2 } from 'lucide-react';
import { aviso } from '../../ui/dialogo';
import { Glyph } from '../posconfig/kit';
import { apiClient } from '../../api/client';
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
  booking_engine: { label: 'Booking Engine', icon: '🔗', Comp: BookingEngineView },
  channel_manager: { label: 'Channel Manager', icon: '🔗', Comp: ChannelManagerView },
  chatbot: { label: 'Chatbot', icon: '✉', Comp: PmsChatbotView },
  events: { label: 'EMS (Eventos)', icon: '🎉', Comp: PmsEventsView },
  events_calendar: { label: 'Calendário EMS', icon: '🕐', Comp: PmsEventsCalendarView },
  events_forecast: { label: 'Previsão EMS', icon: '📈', Comp: PmsEventsForecastView },
  users: { label: 'Utilizadores (PMS)', icon: '👤', Comp: PmsUsersView },
  sys_logs_pms: { label: 'Logs', icon: '📋', Comp: SysLogsView },
  document_scan: { label: 'Leitor de Documentos', icon: '🪪', Comp: PmsDocumentScanView },
};

// Só glifos que existem em ICON_MAP (posconfig/kit.tsx) — nunca emoji cru no ecrã.
// Exportado: é também a fonte destes menus no Ambiente de Trabalho
// (EnterpriseDesktop.tsx) — só existe UMA lista, nunca um espelho manual que
// desincroniza sempre que aqui se muda algo (foi exatamente isso que causava
// "Check-Out ainda não está construído" a aparecer a partir do Ambiente de
// Trabalho muito depois de o Check-Out já estar pronto aqui).
export const MENUS: { title: string; items: { icon: string; label: string; section?: string; url?: string; soon?: boolean }[] }[] = [
  { title: 'Reserva', items: [
    { icon: '📊', label: 'Disponibilidade', section: 'availability' },
    { icon: '🔍', label: 'Reservas', section: 'reservations' },
    { icon: '👥', label: 'Reservas de Grupo', section: 'group_reservations' },
    { icon: '🗂', label: 'Blocos', section: 'blocks' },
    { icon: '📊', label: 'Blocos (disponibilidade)', section: 'blocks' },
  ] },
  { title: 'Front Desk', items: [
    { icon: '🏛', label: 'Estado Hotel', section: 'hotel_status' },
    { icon: '🔍', label: 'Reservas', section: 'reservations' },
    { icon: '🕐', label: 'Planning', section: 'planning' },
    { icon: '🛏', label: 'Quartos Livres / Mapa de Quartos', section: 'rooms' },
    { icon: '👤', label: 'Hóspedes & Empresas', section: 'guests_companies' },
    { icon: '📦', label: 'Perdidos e Achados', section: 'lost_found' },
    { icon: '🏢', label: 'Gestão de Quartos', section: 'rooms_bulk' },
    { icon: '✔', label: 'Tarefas', section: 'tasks' },
    { icon: '🪪', label: 'Leitor de Documentos', section: 'document_scan' },
    { icon: '☎', label: 'Lista telefónica', section: 'phone_directory' },
  ] },
  { title: 'Contas', items: [
    { icon: '🧾', label: 'Check-Out', section: 'checkout' },
    { icon: '📋', label: 'Financeiro (Receitas/Despesas)', section: 'finance_pms' },
    { icon: '💰', label: 'Contas Correntes', section: 'current_accounts' },
  ] },
  { title: 'Gestão de Canais', items: [
    { icon: '📊', label: 'Calendário de Tarifas', section: 'rates_calendar' },
    { icon: '💰', label: 'Rate Codes', section: 'rate_plans' },
    { icon: '📦', label: 'Produtos & Serviços', section: 'products_services' },
    { icon: '🔗', label: 'Booking Engine', section: 'booking_engine' },
    { icon: '🔗', label: 'Channel Manager', section: 'channel_manager' },
    { icon: '✉', label: 'Chatbot', section: 'chatbot' },
  ] },
  { title: 'Marketing', items: [
    { icon: '🔎', label: 'Pesquisa de Entidades', section: 'entity_search' },
    { icon: '🎉', label: 'Lista de Eventos', section: 'event_list' },
    { icon: '⭐', label: 'Gestão de Pontos', section: 'membership_points' },
  ] },
  { title: 'Reporting', items: [
    { icon: '📊', label: 'Performance & Ocupação', section: 'reports_pms' },
    { icon: '🖨', label: 'Relatórios', section: 'reports' },
    { icon: '📈', label: 'Informação Online', section: 'online' },
  ] },
  { title: 'Utilitários', items: [
    { icon: '🌙', label: 'Auditoria da Noite', section: 'night_audit' },
    { icon: '🖥', label: 'POS Front Office', url: '/pos/terminal' },
    { icon: '🌙', label: 'Fecho do dia POS', section: 'dayclose_pos' },
    { icon: '🧾', label: 'SAFT-AO', section: 'saft_pos' },
    { icon: '🛏', label: 'Categorias de Quarto', section: 'room_types' },
    { icon: '💰', label: 'Tarifas (Rate Codes)', section: 'rate_plans' },
    { icon: '⚙', label: 'Diagnóstico', section: 'diag_pos' },
    { icon: '👤', label: 'Utilizadores (PMS)', section: 'users' },
    { icon: '📋', label: 'Visualizar Logs', section: 'sys_logs_pms' },
  ] },
  { title: 'EMS', items: [
    { icon: '🎉', label: 'EMS (Eventos)', section: 'events' },
    { icon: '🔍', label: 'Pesquisar EMS', section: 'events' },
    { icon: '🕐', label: 'Calendário EMS', section: 'events_calendar' },
    { icon: '📈', label: 'Previsão EMS', section: 'events_forecast' },
  ] },
];

export default function PmsShell({ onDesktop }: { onBack?: () => void; onOpen?: (id: string) => void; onDesktop?: () => void }) {
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
    <div className="h-full flex flex-col" style={{ background: '#F7FAFA', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      {/* Barra de menus (topo escuro) — cabeçalho próprio do PMS */}
      <div className="flex items-center gap-1 px-3 flex-shrink-0 text-white" style={{ background: '#041F24', height: 56 }}>
        <div className="relative pr-4 mr-2">
          <button onClick={() => setMenu(menu === '__ml' ? null : '__ml')} title="Trocar de módulo"
            className={`flex items-center gap-2 px-2 py-1 leading-none ${menu === '__ml' ? 'bg-white/15' : 'hover:bg-white/10'}`}>
            {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 object-contain flex-shrink-0 rounded-full" /> : <Building2 size={20} className="flex-shrink-0" />}
            <span className="text-[13px] text-white">▾</span>
          </button>
          {menu === '__ml' && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-full z-[61] min-w-[230px] py-1 shadow-2xl" style={{ background: '#041F24', border: '1px solid #062A31' }}>
                <button onClick={() => { setMenu(null); localStorage.removeItem('ui_shell'); onDesktop?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#5C8891]">
                  <span className="w-5 flex items-center justify-center opacity-80"><Glyph icon="🖥" size={15} /></span>
                  Ambiente de Trabalho
                </button>
              </div>
            </>
          )}
        </div>

        {MENUS.map((m) => (
          <div key={m.title} className="relative">
            {/* Só troca de menu ao CLICAR — havia um onMouseEnter aqui que trocava
                de menu só de o rato passar por cima do título ao caminho de outro
                sítio, sem se clicar em nada: o operador achava que o sistema
                "saltava sozinho" de secção. */}
            <button onClick={() => setMenu(menu === m.title ? null : m.title)}
              className={`px-4 py-2 text-[15px] font-semibold hover:bg-white/10 ${menu === m.title ? 'bg-white/10' : ''}`}>
              {m.title} ▾
            </button>
            {menu === m.title && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
                <div className="absolute left-0 top-full z-[61] min-w-[260px] py-1 shadow-2xl" style={{ background: '#041F24', border: '1px solid #062A31' }}>
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
                      className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#5C8891]">
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
      <div className="flex items-center gap-2 px-3 py-2 text-white text-[15px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
        <span className="text-[#062A31] inline-flex items-center"><Glyph icon={cur.icon} size={17} /></span>
        {cur.label}{hotelName && ` - ${hotelName}`}
        <button onClick={() => setShowPerms(true)} title="Permissões deste ecrã"
          className="ml-auto w-6 h-6 rounded flex items-center justify-center text-[#CFE3E6] hover:text-white hover:bg-white/10">
          <Users size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Comp onDesktop={onDesktop} onNavigate={setSection} />
      </div>

      {/* Barra 1 — ação do ecrã + hora + fechar */}
      <div className="h-8 flex items-center justify-between px-3 flex-shrink-0 border-t border-[#CFE3E6] text-[11px]" style={{ background: '#F7FAFA' }}>
        <span className="text-[#062A31]">Atualizado em {clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <button onClick={() => { localStorage.removeItem('ui_shell'); onDesktop?.(); }}
          className="flex items-center gap-1.5 text-[#041F24] font-semibold hover:text-black" title="Fechar (volta ao Ambiente de Trabalho)">
          <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white">
            <X size={10} strokeWidth={3} />
          </span>
          Fechar
        </button>
      </div>

      {/* Barra 2 — separador (tarefa aberta) + versão + hotel ativo */}
      <div className="h-7 flex items-center px-2 gap-2 flex-shrink-0 text-white text-[11px]" style={{ background: '#041F24' }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[#5C8891]">
          <Glyph icon={cur.icon} size={11} /> {cur.label}
        </span>
        <div className="flex-1" />
        <span className="opacity-60">ML · PMS v1.0</span>
        {hotels.length > 1 && (
          <select value={hotelId || String(hotels[0]?.id)} onChange={(e) => { setHotelId(e.target.value); localStorage.setItem('erp_hotel', e.target.value); }}
            className="h-[20px] text-[11px] px-1 border border-[#062A31] bg-[#062A31] text-white">
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
      </div>

      {showPerms && (
        <PmsPermissionsDialog screenId={`pms_${section}`} screenLabel={cur.label} hotelName={hotelName}
          onClose={() => setShowPerms(false)} />
      )}
    </div>
  );
}
