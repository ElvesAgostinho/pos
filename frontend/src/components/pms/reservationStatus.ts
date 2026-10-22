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
  OPTION: '#3B82F6', BOOKED: '#3B82F6', CHECKED_IN: '#2563EB', CHECKED_OUT: '#F1F2F4',
  CANCELLED: '#DC2626', NO_SHOW: '#DC2626', WAITLIST: '#D97706',
};

export const SOURCE_LABEL: Record<string, string> = { DIRECT: 'Normal', ONLINE: 'Online', BLOCK: 'Bloco/Grupo' };
