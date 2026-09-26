/**
 * Menus do PMS — dados puros (nenhum componente React aqui de propósito).
 *
 * Estava dentro de PmsShell.tsx, exportado ao lado do componente. O Fast
 * Refresh do Vite exige que um ficheiro .tsx exporte SÓ componentes para
 * poder trocar a quente; um ficheiro a exportar um componente E uma lista
 * de dados invalida o módulo inteiro a cada edição — e como o Ambiente de
 * Trabalho (EnterpriseDesktop.tsx) importava MENUS DAQUI, cada edição a
 * PmsShell.tsx obrigava a recarregar EnterpriseDesktop.tsx, DesktopShell.tsx
 * e tudo o que estes importam, uma cascata que se manifestava como o aviso
 * "Encountered two children with the same key" visto várias vezes nesta
 * sessão (não corrupção aleatória do HMR, um efeito lateral real e
 * reproduzível desta mistura). Um ficheiro .ts (sem JSX) nunca entra no
 * Fast Refresh, por isso nunca mais invalida nada — MENUS continua a ser a
 * ÚNICA fonte, só que agora num sítio que não força PmsShell.tsx a recarregar
 * o resto do sistema sempre que se lhe mexe.
 */
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
