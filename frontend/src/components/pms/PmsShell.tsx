import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Users } from 'lucide-react';
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
// Estes 4 já existem no POS (Configuração POS) — ligamos ao MESMO componente
// (mesmos dados, mesma lógica), só com a moldura do PMS à volta, para não
// parecer que se está a saltar de módulo.
import PosReports from '../posconfig/PosReports';
import PosOnline from '../posconfig/PosOnline';
import { PosDayClose, PosSaft } from '../posconfig/PosOps';

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
  reports: { label: 'Relatórios', icon: '🖨', Comp: PosReports },
  online: { label: 'Informação Online', icon: '📈', Comp: PosOnline },
  dayclose_pos: { label: 'Fecho do dia POS', icon: '🌙', Comp: PosDayClose },
  saft_pos: { label: 'SAFT-AO', icon: '🧾', Comp: PosSaft },
};

// Só glifos que existem em ICON_MAP (posconfig/kit.tsx) — nunca emoji cru no ecrã.
const MENUS: { title: string; items: { icon: string; label: string; section?: string; url?: string; soon?: boolean }[] }[] = [
  { title: 'Reserva', items: [
    { icon: '📊', label: 'Disponibilidade', section: 'availability' },
    { icon: '🔍', label: 'Reservas', section: 'reservations' },
    { icon: '👥', label: 'Reservas de Grupo', section: 'group_reservations' },
    { icon: '🗂', label: 'Blocos', section: 'blocks' },
    { icon: '📊', label: 'Blocos (disponibilidade)', soon: true },
  ] },
  { title: 'Front Desk', items: [
    { icon: '🏛', label: 'Estado Hotel', soon: true },
    { icon: '🔍', label: 'Reservas', section: 'reservations' },
    { icon: '🕐', label: 'Planning', soon: true },
    { icon: '🛏', label: 'Quartos Livres / Mapa de Quartos', section: 'rooms' },
    { icon: '🔍', label: 'Pesquisa de Entidades', soon: true },
    { icon: '📦', label: 'Perdidos e Achados', soon: true },
    { icon: '🏢', label: 'Gestão de Quartos', soon: true },
    { icon: '✔', label: 'Tarefas', soon: true },
    { icon: '🪪', label: 'Leitor de Documentos', soon: true },
    { icon: '☎', label: 'Lista telefónica', soon: true },
  ] },
  { title: 'Contas', items: [
    { icon: '🧾', label: 'Check-Out', soon: true },
    { icon: '📋', label: 'Lançamentos Gerais', soon: true },
    { icon: 'ℹ', label: 'Extrato Mobile', soon: true },
    { icon: '💰', label: 'Contas Correntes (ver folio de uma reserva)', section: 'reservations' },
  ] },
  { title: 'Gestão de Canais', items: [
    { icon: '💰', label: 'Rate Codes', section: 'rate_plans' },
    { icon: '⚙', label: 'Configuração Guest Experience', soon: true },
    { icon: '🔗', label: 'Booking Engine', soon: true },
  ] },
  { title: 'Marketing', items: [
    { icon: '🔍', label: 'Pesquisa de Entidades', soon: true },
    { icon: '🎉', label: 'Lista de Eventos', soon: true },
    { icon: '⭐', label: 'Gestão de Pontos', soon: true },
  ] },
  { title: 'Reporting', items: [
    { icon: '🖨', label: 'Relatórios', section: 'reports' },
    { icon: '📈', label: 'Informação Online', section: 'online' },
  ] },
  { title: 'Utilitários', items: [
    { icon: '🌙', label: 'Auditoria da Noite', soon: true },
    { icon: '🖥', label: 'POS Front Office', url: '/pos/terminal' },
    { icon: '🌙', label: 'Fecho do dia POS', section: 'dayclose_pos' },
    { icon: '🧾', label: 'SAFT-AO', section: 'saft_pos' },
    { icon: '🛏', label: 'Categorias de Quarto', section: 'room_types' },
    { icon: '💰', label: 'Tarifas (Rate Codes)', section: 'rate_plans' },
    { icon: '⚙', label: 'Diagnóstico', soon: true },
    { icon: '📋', label: 'Visualizar Logs', soon: true },
  ] },
  { title: 'EMS', items: [
    { icon: '🎉', label: 'EMS (Eventos)', soon: true },
    { icon: '🔍', label: 'Pesquisar EMS', soon: true },
    { icon: '🕐', label: 'Calendário EMS', soon: true },
    { icon: '📈', label: 'Previsão EMS', soon: true },
  ] },
];

export default function PmsShell({ onDesktop }: { onBack?: () => void; onOpen?: (id: string) => void; onDesktop?: () => void }) {
  // A secção com que se abre: quem manda abrir o PMS (o Ambiente de Trabalho, um
  // atalho dos seus próprios menus) deixa-a aqui — mesmo padrão do posc_section
  // que a Configuração POS já usa.
  const [section, setSection] = useState(() => {
    const pedida = localStorage.getItem('pms_section');
    if (pedida) localStorage.removeItem('pms_section');
    return pedida || 'availability';
  });
  const [menu, setMenu] = useState<string | null>(null);
  const [showPerms, setShowPerms] = useState(false);
  const cur = SECTIONS[section];
  const Comp = cur.Comp;
  const [clock] = useState(() => new Date());

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
    <div className="h-full flex flex-col" style={{ background: '#f0f0f0', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      {/* Barra de menus (topo escuro) — cabeçalho próprio do PMS */}
      <div className="flex items-center gap-1 px-3 flex-shrink-0 text-white" style={{ background: '#2b2b2b', height: 56 }}>
        <div className="relative pr-4 mr-2">
          <button onClick={() => setMenu(menu === '__ml' ? null : '__ml')} title="Trocar de módulo"
            className={`flex items-center gap-2 px-2 py-1 leading-none ${menu === '__ml' ? 'bg-white/15' : 'hover:bg-white/10'}`}>
            <span className="text-[30px] font-black tracking-tight select-none"
              style={{
                background: 'linear-gradient(180deg,#ffd75e 0%,#c9a400 55%,#8a6f00 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                textShadow: '0 1px 0 rgba(255,255,255,.35), 0 3px 6px rgba(0,0,0,.55)',
                filter: 'drop-shadow(0 2px 1px rgba(0,0,0,.6))',
              }}>
              ML
            </span>
            <span className="text-[10px] text-[#9a9a9a] pb-1">Mwana Lodge ▾</span>
          </button>
          {menu === '__ml' && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-full z-[61] min-w-[230px] py-1 shadow-2xl" style={{ background: '#2b2b2b', border: '1px solid #444' }}>
                <button onClick={() => { setMenu(null); localStorage.removeItem('ui_shell'); onDesktop?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#3d6ea5]">
                  <span className="w-5 flex items-center justify-center opacity-80"><Glyph icon="🖥" size={15} /></span>
                  Ambiente de Trabalho
                </button>
              </div>
            </>
          )}
        </div>

        {MENUS.map((m) => (
          <div key={m.title} className="relative">
            <button onClick={() => setMenu(menu === m.title ? null : m.title)}
              onMouseEnter={() => menu && setMenu(m.title)}
              className={`px-4 py-2 text-[15px] font-semibold hover:bg-white/10 ${menu === m.title ? 'bg-white/10' : ''}`}>
              {m.title} ▾
            </button>
            {menu === m.title && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
                <div className="absolute left-0 top-full z-[61] min-w-[260px] py-1 shadow-2xl" style={{ background: '#2b2b2b', border: '1px solid #444' }}>
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
                      className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#3d6ea5]">
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
      <div className="flex items-center gap-2 px-3 py-2 text-white text-[15px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
        <span className="text-[#c9a400] inline-flex items-center"><Glyph icon={cur.icon} size={17} /></span>
        {cur.label}{hotelName && ` - ${hotelName}`}
        <button onClick={() => setShowPerms(true)} title="Permissões deste ecrã"
          className="ml-auto w-6 h-6 rounded flex items-center justify-center text-[#c9c9c9] hover:text-white hover:bg-white/10">
          <Users size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Comp onDesktop={onDesktop} />
      </div>

      {/* Barra 1 — ação do ecrã + hora + fechar */}
      <div className="h-8 flex items-center justify-between px-3 flex-shrink-0 border-t border-[#c0c0c0] text-[11px]" style={{ background: '#e8e8e8' }}>
        <span className="text-[#555]">Atualizado em {clock.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <button onClick={() => { localStorage.removeItem('ui_shell'); onDesktop?.(); }}
          className="flex items-center gap-1.5 text-[#333] font-semibold hover:text-black" title="Fechar (volta ao Ambiente de Trabalho)">
          <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white">
            <X size={10} strokeWidth={3} />
          </span>
          Fechar
        </button>
      </div>

      {/* Barra 2 — separador (tarefa aberta) + versão + hotel ativo */}
      <div className="h-7 flex items-center px-2 gap-2 flex-shrink-0 text-white text-[11px]" style={{ background: '#2b2b2b' }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[#3d6ea5]">
          <Glyph icon={cur.icon} size={11} /> {cur.label}
        </span>
        <div className="flex-1" />
        <span className="opacity-60">ML · PMS v1.0</span>
        {hotels.length > 1 && (
          <select value={hotelId || String(hotels[0]?.id)} onChange={(e) => { setHotelId(e.target.value); localStorage.setItem('erp_hotel', e.target.value); }}
            className="h-[20px] text-[11px] px-1 border border-[#555] bg-[#1e1e1e] text-white">
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
