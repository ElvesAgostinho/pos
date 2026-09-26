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
  OPTION: '#7FA9B1', BOOKED: '#5C8891', CHECKED_IN: '#062A31', CHECKED_OUT: '#B7C6C9',
  CANCELLED: '#B0392B', NO_SHOW: '#B0392B', WAITLIST: '#B08B2C',
};

export const SOURCE_LABEL: Record<string, string> = { DIRECT: 'Normal', ONLINE: 'Online', BLOCK: 'Bloco/Grupo' };
