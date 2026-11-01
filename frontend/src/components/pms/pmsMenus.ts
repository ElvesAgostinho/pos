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
/**
 * `needs` — o módulo que ESTE item exige. Sem ele, o item não aparece.
 *
 * Os módulos vendem-se separados: quem comprou só o PMS não pode ver o Terminal
 * do POS, o Fecho do Dia do POS nem o Diagnóstico dos terminais — são coisas de
 * um produto que não tem. O que FICA, mesmo sem POS, é o que um hotel é
 * obrigado a ter por lei ou por natureza do negócio e que por acaso nasceu do
 * lado do POS:
 *
 *   · FACTURAÇÃO e AGT — SAF-T, documentos fiscais, contas correntes. Um hotel
 *     em Angola emite facturas certificadas tenha ou não restaurante.
 *   · CLIENTES — a mesma ficha que assina a factura (mdm.Customer).
 *   · UTILIZADORES — quem entra no sistema; sem isto o hotel não cria o seu
 *     próprio pessoal.
 *   · DESCONTOS e tabelas de preço — regras comerciais do alojamento também.
 *
 * Esses não levam `needs`: são do sistema, não do POS, e estão no mesmo sítio
 * para os dois módulos em vez de duplicados (ver components/shared/).
 */
/**
 * `grupo` — o NOME DA SECÇÃO DENTRO DO SEPARADOR DO RIBBON.
 *
 * Um separador com dez comandos seguidos é uma fila de dez ícones iguais: para
 * encontrar um é preciso ler as dez legendas, todas as vezes. Agrupados e com
 * o nome do grupo por baixo, procura-se primeiro o grupo ("Quartos") e só
 * depois o comando — que é como se procura num ERP a sério, e porque é que
 * todos eles são assim.
 *
 * Os grupos são RUNS CONTÍGUOS: o primeiro item com um nome novo abre um grupo
 * e os seguintes com o mesmo nome entram nele. Por isso a ordem dos comandos
 * NÃO muda — quem já sabe onde está uma coisa continua a encontrá-la no mesmo
 * sítio.
 */
export const MENUS: { title: string; items: { icon: string; label: string; grupo?: string; section?: string; url?: string; soon?: boolean; needs?: string }[] }[] = [
  { title: 'Reserva', items: [
    { icon: '📊', label: 'Disponibilidade', grupo: 'Disponibilidade', section: 'availability' },
    { icon: '🔍', label: 'Reservas', grupo: 'Reservas', section: 'reservations' },
    { icon: '👥', label: 'Reservas de Grupo', grupo: 'Reservas', section: 'group_reservations' },
    { icon: '🗂', label: 'Blocos', grupo: 'Blocos', section: 'blocks' },
    { icon: '📊', label: 'Blocos (disponibilidade)', grupo: 'Blocos', section: 'blocks' },
  ] },
  { title: 'Front Desk', items: [
    { icon: '🏛', label: 'Estado Hotel', grupo: 'Hoje', section: 'hotel_status' },
    { icon: '🔍', label: 'Reservas', grupo: 'Hoje', section: 'reservations' },
    { icon: '🕐', label: 'Planning', grupo: 'Hoje', section: 'planning' },
    { icon: '🛏', label: 'Quartos Livres / Mapa de Quartos', grupo: 'Quartos', section: 'rooms' },
    { icon: '👤', label: 'Hóspedes & Empresas', grupo: 'Hóspedes', section: 'guests_companies' },
    { icon: '📦', label: 'Perdidos e Achados', grupo: 'Hóspedes', section: 'lost_found' },
    { icon: '🏢', label: 'Gestão de Quartos', grupo: 'Gestão', section: 'rooms_bulk' },
    { icon: '✔', label: 'Tarefas', grupo: 'Gestão', section: 'tasks' },
    { icon: '🪪', label: 'Leitor de Documentos', grupo: 'Gestão', section: 'document_scan' },
    { icon: '☎', label: 'Lista telefónica', grupo: 'Gestão', section: 'phone_directory' },
  ] },
  { title: 'Contas', items: [
    { icon: '🧾', label: 'Check-Out', grupo: 'Saída', section: 'checkout' },
    { icon: '📋', label: 'Financeiro (Receitas/Despesas)', grupo: 'Dinheiro', section: 'finance_pms' },
    { icon: '💰', label: 'Contas Correntes', grupo: 'Dinheiro', section: 'current_accounts' },
    { icon: '💳', label: 'Depósitos de Reservas Online', grupo: 'Dinheiro', section: 'booking_deposits' },
  ] },
  { title: 'Gestão de Canais', items: [
    { icon: '📊', label: 'Calendário de Tarifas', grupo: 'Tarifas', section: 'rates_calendar' },
    { icon: '💰', label: 'Rate Codes', grupo: 'Tarifas', section: 'rate_plans' },
    { icon: '📦', label: 'Produtos & Serviços', grupo: 'Catálogo', section: 'products_services' },
    { icon: '🔗', label: 'Booking Engine', grupo: 'Canais', section: 'booking_engine' },
    { icon: '🔗', label: 'Channel Manager', grupo: 'Canais', section: 'channel_manager' },
    { icon: '✉', label: 'Chatbot', grupo: 'Canais', section: 'chatbot' },
  ] },
  { title: 'Marketing', items: [
    { icon: '🔎', label: 'Pesquisa de Entidades', section: 'entity_search' },
    { icon: '🎉', label: 'Lista de Eventos', section: 'event_list', needs: 'pos' },
    { icon: '⭐', label: 'Gestão de Pontos', section: 'membership_points' },
  ] },
  { title: 'Reporting', items: [
    { icon: '📊', label: 'Performance & Ocupação', section: 'reports_pms' },
    { icon: '🖨', label: 'Relatórios', section: 'reports' },
    { icon: '📈', label: 'Informação Online', section: 'online', needs: 'pos' },
  ] },
  { title: 'Utilitários', items: [
    { icon: '🌙', label: 'Auditoria da Noite', grupo: 'Fecho', section: 'night_audit' },
    { icon: '🖥', label: 'POS Front Office', grupo: 'POS', url: '/pos/terminal', needs: 'pos' },
    { icon: '🌙', label: 'Fecho do dia POS', grupo: 'POS', section: 'dayclose_pos', needs: 'pos' },
    { icon: '🧾', label: 'SAFT-AO (AGT)', grupo: 'Fiscal', section: 'saft_pos' },
    { icon: '🛏', label: 'Categorias de Quarto', grupo: 'Tabelas', section: 'room_types' },
    { icon: '💰', label: 'Tarifas (Rate Codes)', grupo: 'Tabelas', section: 'rate_plans' },
    { icon: '⚙', label: 'Diagnóstico', grupo: 'Sistema', section: 'diag_pos', needs: 'pos' },
    { icon: '📋', label: 'Visualizar Logs', grupo: 'Sistema', section: 'sys_logs_pms' },
    { icon: '🖼', label: 'Papel de Parede', grupo: 'Sistema', section: 'wallpaper' },
  ] },
  { title: 'Gestão de Utilizadores', items: [
    { icon: '👥', label: 'Grupos de Utilizadores', grupo: 'Contas', section: 'user_groups' },
    { icon: '👤', label: 'Utilizadores', grupo: 'Contas', section: 'user_list' },
    { icon: '●', label: 'Tipo R.H.', grupo: 'Pessoal', section: 'hr_types' },
    { icon: '🧑', label: 'Recursos Humanos', grupo: 'Pessoal', section: 'hr_people' },
    { icon: '🛡', label: 'Acesso aos ecrãs do PMS', grupo: 'Permissões', section: 'users' },
  ] },
  { title: 'EMS', items: [
    { icon: '🎉', label: 'EMS (Eventos)', grupo: 'Eventos', section: 'events' },
    { icon: '🔍', label: 'Pesquisar EMS', grupo: 'Eventos', section: 'events' },
    { icon: '🕐', label: 'Calendário EMS', grupo: 'Planeamento', section: 'events_calendar' },
    { icon: '📈', label: 'Previsão EMS', grupo: 'Planeamento', section: 'events_forecast' },
  ] },
];
