/** Único sítio com o rótulo/cor de cada `Reservation.status` (e a origem
 * `Reservation.source`) — antes havia 4 cópias manuais e DESSINCRONIZADAS
 * (PmsPlanningView, PmsReservationsView, PmsReservationDetailDialog e
 * PmsEntityPickerDialog), cada uma com cores ligeiramente diferentes para o
 * mesmo estado (ex.: CHECKED_IN aparecia escuro num ecrã e claro noutro).
 * Qualquer ecrã do PMS que precise de rótulo/cor de estado de reserva importa
 * daqui — nunca redeclara o mapa. */

export const STATUS_LABEL: Record<string, string> = {
  OPTION: 'Opção', BOOKED: 'Reservada', CHECKED_IN: 'Check-in', CHECKED_OUT: 'Check-out',
  CANCELLED: 'Cancelada', NO_SHOW: 'No-show', WAITLIST: 'Lista de Espera',
};

export const STATUS_COLOR: Record<string, string> = {
  OPTION: '#2E75B6', BOOKED: '#2E75B6', CHECKED_IN: '#17375E', CHECKED_OUT: '#EBEEF0',
  CANCELLED: '#B42318', NO_SHOW: '#B42318', WAITLIST: '#B45309',
};

export const SOURCE_LABEL: Record<string, string> = { DIRECT: 'Normal', ONLINE: 'Online', BLOCK: 'Bloco/Grupo' };
