import { apiClient } from '../../api/client';

/** "Guest Info" — janela do browser à parte (não modal), como no PMS de
 * referência. Vai buscar o hóspede e as reservas dele a sério; nada de dados
 * inventados no HTML. */
export async function openGuestInfoWindow(reservation: any) {
  const w = window.open('', '_blank', 'width=760,height=640');
  if (!w) return;
  w.document.write('<html><head><title>Guest Info</title></head><body style="background:#1e1e1e;color:#ddd;font-family:sans-serif;padding:20px">A carregar…</body></html>');
  w.document.close();

  let guest: any = null;
  let reservas: any[] = [];
  try {
    const [g, rs] = await Promise.all([
      apiClient.get(`pos/marketing/entities/${reservation.guest}/`),
      apiClient.get('pms/reservations/', { params: { guest: reservation.guest } }),
    ]);
    guest = g.data;
    reservas = Array.isArray(rs.data) ? rs.data : rs.data?.results || [];
  } catch { /* mantém o "A carregar…" se falhar */ return; }

  const today = new Date().toISOString().slice(0, 10);
  const rows = reservas.map((r: any) => {
    const quando = r.check_out < today ? 'Past' : r.check_in > today ? 'Future' : 'Current';
    return `<tr><td>${quando}</td><td>${r.check_in}</td><td>${r.check_out}</td><td>${r.confirmation}</td></tr>`;
  }).join('');

  w.document.open();
  w.document.write(`<!doctype html><html><head><title>Guest Info - ${guest.name}</title><style>
    body{background:#1e1e1e;color:#ddd;font-family:Segoe UI,Arial,sans-serif;margin:0;padding:20px}
    .card{background:#2b2b2b;border-radius:4px;margin-bottom:16px}
    .head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;font-weight:bold;font-size:16px}
    .close{background:#c0392b;color:#fff;border:none;padding:6px 14px;border-radius:3px;cursor:pointer}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 16px}
    .row b{color:#fff}
    table{width:100%;border-collapse:collapse;margin:0 16px 16px;width:calc(100% - 32px)}
    th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #444;font-size:13px}
  </style></head><body>
    <div class="card">
      <div class="head">${guest.name}<button class="close" onclick="window.close()">Close</button></div>
      <div class="grid">
        <div class="row"><b>Name:</b> ${guest.name || ''}</div>
        <div class="row"><b>Guest Number:</b> ${guest.code || ''}</div>
        <div class="row"><b>Country:</b> ${guest.country || guest.nationality || ''}</div>
        <div class="row"><b>Mobile phone:</b> ${guest.phone || ''}</div>
        <div class="row"><b>Email:</b> ${guest.email || ''}</div>
        <div class="row"><b>ID Doc:</b> ${guest.id_number || ''}</div>
      </div>
    </div>
    <div class="card">
      <div class="head">Contracts and Reservations</div>
      <table><thead><tr><th></th><th>Check-In</th><th>Check-Out</th><th>Nº Reserva</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#888">Sem reservas.</td></tr>'}</tbody></table>
    </div>
  </body></html>`);
  w.document.close();
}
