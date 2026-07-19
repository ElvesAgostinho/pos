import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { aviso } from '../../ui/dialogo';
import { IcoCruz, IcoVisto } from './Icons';

/**
 * RESERVAS DE MESA — o livro de reservas do restaurante, no terminal.
 *
 * O fluxo do ofício: CONFIRMADA → o cliente CHEGOU (espera na entrada) → SENTAR
 * (escolhe-se a mesa, a mesa fica ocupada e a CONTA ABRE-SE sozinha com o nº de
 * pessoas). É o motor POSReservation do backoffice — o mapa já pinta a mesa de
 * amarelo quando está reservada.
 */
export default function ReservationsPanel({ setor, onOpenTicket, onClose }: {
  setor: any; onOpenTicket: (id: number) => void; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nova, setNova] = useState<any | null>(null);
  const [sentar, setSentar] = useState<any | null>(null);

  const { data: reservas = [] } = useQuery({
    queryKey: ['pos-reservas', setor?.outlet],
    queryFn: async () => {
      const r = await apiClient.get('pos/reservations/', { params: { outlet: setor?.outlet } });
      return ((r.data?.results || r.data || []) as any[])
        .filter((x) => ['BOOKED', 'ARRIVED'].includes(x.status));
    },
    refetchInterval: 15000,
  });
  const { data: mesas = [] } = useQuery({
    queryKey: ['pos-tables', setor?.id],
    queryFn: async () => {
      const r = await apiClient.get('pos/tables/', { params: { sector: setor.id } });
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: !!sentar,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['pos-reservas'] });
  const hora = (t: string) => new Date(t).toLocaleString('pt-PT',
    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const chegou = async (r: any) => {
    try { await apiClient.post(`pos/reservations/${r.id}/arrive/`, {}); inval(); }
    catch (e: any) { aviso(e?.response?.data?.detail || 'Erro.'); }
  };

  const sentarNa = async (r: any, mesaId: number) => {
    try {
      const resp = await apiClient.post(`pos/reservations/${r.id}/seat/`, { table: mesaId });
      setSentar(null); inval();
      qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
      const tid = resp.data?.ticket_id || resp.data?.ticket;
      if (tid) { onClose(); onOpenTicket(tid); }
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível sentar.'); }
  };

  const criar = async () => {
    if (!nova?.guest_name || !nova?.reserved_for) return aviso('Nome e data/hora são obrigatórios.');
    try {
      await apiClient.post('pos/reservations/', {
        outlet: setor.outlet, guest_name: nova.guest_name, phone: nova.phone || null,
        party_size: Number(nova.party_size || 2), reserved_for: nova.reserved_for,
        notes: nova.notes || null,
      });
      setNova(null); inval();
    } catch (e: any) {
      const d = e?.response?.data;
      aviso(typeof d === 'object' ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('\n') : 'Erro.');
    }
  };

  return (
    <Window title="Reservas de Mesa" width={860} onClose={onClose} tone="#b39100">
      <div className="flex flex-col bg-[#1a1a1a]" style={{ maxHeight: '70vh' }}>
        <div className="grid grid-cols-[130px_1fr_70px_110px_90px_190px] bg-[#2b2b2b] text-white
          text-[13px] font-bold px-3 py-2">
          <span>Quando</span><span>Cliente</span><span>Pax</span><span>Mesa</span><span>Estado</span><span />
        </div>
        <div className="flex-1 overflow-auto">
          {reservas.map((r: any) => (
            <div key={r.id} className="grid grid-cols-[130px_1fr_70px_110px_90px_190px] px-3 py-2
              text-white text-[14px] border-b border-black/30 items-center">
              <span>{hora(r.reserved_for)}</span>
              <span className="truncate">{r.guest_name}<span className="text-white/40 text-[12px]"> {r.phone || ''}</span></span>
              <span>{r.party_size}</span>
              <span className="text-white/60">{r.table_label || '—'}</span>
              <span className={r.status === 'ARRIVED' ? 'text-[#9dffb0] font-bold' : 'text-white/60'}>
                {r.status_display}
              </span>
              <span className="flex gap-1 justify-end">
                {r.status === 'BOOKED' && (
                  <button onClick={() => chegou(r)}
                    className="h-[36px] px-3 bg-[#1a4f8a] text-white text-[13px] font-bold rounded">Chegou</button>
                )}
                <button onClick={() => setSentar(r)}
                  className="h-[36px] px-3 bg-[#1f7a34] text-white text-[13px] font-bold rounded">Sentar</button>
              </span>
            </div>
          ))}
          {reservas.length === 0 && (
            <div className="text-white/50 text-center py-8 text-[14px]">Sem reservas pendentes.</div>
          )}
        </div>
        <button onClick={() => setNova({ party_size: 2 })}
          className="h-[50px] m-2 bg-[#0f8b8d] text-white font-bold rounded">＋ Nova reserva</button>
      </div>

      {/* sentar: escolher a mesa (livres primeiro) */}
      {sentar && (
        <Window title={`Sentar ${sentar.guest_name} (${sentar.party_size} pax) — escolha a mesa`}
          width={520} onClose={() => setSentar(null)} tone="#1f7a34">
          <div className="p-3 bg-[#1a1a1a] grid grid-cols-4 gap-2 max-h-[50vh] overflow-auto">
            {(mesas as any[]).map((m: any) => (
              <button key={m.id} onClick={() => sentarNa(sentar, m.id)}
                className={`h-[70px] rounded font-bold text-white text-[16px]
                  ${m.status === 'FREE' ? 'bg-[#0f8b8d]' : 'bg-[#5a5a5a]'}`}>
                {m.table_number}
                <span className="block text-[11px] font-normal opacity-80">
                  {m.status === 'FREE' ? `${m.seats} lug.` : m.status_display || m.status}
                </span>
              </button>
            ))}
          </div>
        </Window>
      )}

      {/* nova reserva */}
      {nova && (
        <Window title="Nova reserva" width={430} onClose={() => setNova(null)} tone="#b39100">
          <div className="p-3 bg-[#1a1a1a] flex flex-col gap-2">
            {[['guest_name', 'Nome *', 'text'], ['phone', 'Telefone', 'text'],
              ['party_size', 'Pessoas', 'number'], ['reserved_for', 'Data e hora *', 'datetime-local'],
              ['notes', 'Notas', 'text']].map(([k, label, tipo]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-white/60 text-[13px]">{label}</span>
                <input type={tipo} value={nova[k] || ''}
                  onChange={(e) => setNova({ ...nova, [k]: e.target.value })}
                  className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
                    focus:border-[#b39100] outline-none text-[15px]" />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-1">
              <button onClick={criar} className="h-[50px] bg-[#1f7a34] text-white font-bold rounded"><span className="inline-flex items-center gap-2"><IcoVisto size={24} />Reservar</span></button>
              <button onClick={() => setNova(null)} className="h-[50px] bg-[#3a3a3a] text-white rounded"><IcoCruz size={24} /></button>
            </div>
          </div>
        </Window>
      )}
    </Window>
  );
}
