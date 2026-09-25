import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

/**
 * Variante POR UTILIZADOR do `PmsPermissionsDialog` (que é por ecrã): em vez
 * de "para este ecrã, que perfis podem entrar", mostra "para este
 * utilizador (via o seu perfil), que ecrãs do PMS pode ver" — mesmos dados
 * (`eae.Profile.allowed_screens`), só a matriz virada ao contrário, mais
 * prática para o ecrã de Utilizadores.
 *
 * NOTA para quem ligar isto ao PmsShell: esta lista tem de refletir as keys
 * de `SECTIONS` em PmsShell.tsx (prefixadas com `pms_`) — atualizar aqui
 * sempre que uma secção nova entrar lá.
 */
const PMS_SCREENS = [
  { id: 'pms_availability', label: 'Disponibilidade' },
  { id: 'pms_reservations', label: 'Reservas' },
  { id: 'pms_group_reservations', label: 'Reservas de Grupo' },
  { id: 'pms_blocks', label: 'Blocos' },
  { id: 'pms_rooms', label: 'Mapa de Quartos' },
  { id: 'pms_room_types', label: 'Categorias de Quarto' },
  { id: 'pms_rate_plans', label: 'Tarifas (Rate Codes)' },
  { id: 'pms_rates_calendar', label: 'Calendário de Tarifas' },
  { id: 'pms_rooms_bulk', label: 'Gestão de Quartos' },
  { id: 'pms_guests_companies', label: 'Hóspedes & Empresas' },
  { id: 'pms_finance_pms', label: 'Financeiro' },
  { id: 'pms_reports_pms', label: 'Performance & Ocupação' },
  { id: 'pms_booking_engine', label: 'Booking Engine' },
  { id: 'pms_channel_manager', label: 'Channel Manager' },
  { id: 'pms_chatbot', label: 'Chatbot' },
  { id: 'pms_events', label: 'EMS (Eventos)' },
  { id: 'pms_events_calendar', label: 'Calendário EMS' },
  { id: 'pms_events_forecast', label: 'Previsão EMS' },
  { id: 'pms_users', label: 'Utilizadores (PMS)' },
];

export default function PmsUserAccessDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const profile = user?.profiles?.[0];
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const isChecked = (screenId: string) => {
    if (screenId in overrides) return overrides[screenId];
    return profile?.full_access !== false || (profile?.allowed_screens || []).includes(screenId);
  };
  const toggle = (screenId: string) => setOverrides((o) => ({ ...o, [screenId]: !isChecked(screenId) }));

  const gravar = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const allowed: string[] = profile.allowed_screens || [];
      let next = [...allowed];
      for (const scr of PMS_SCREENS) {
        if (!(scr.id in overrides)) continue;
        const wants = overrides[scr.id];
        const has = allowed.includes(scr.id);
        if (has === wants) continue;
        next = wants ? [...next, scr.id] : next.filter((s) => s !== scr.id);
      }
      await apiClient.patch(`eae/profiles/${profile.id}/`, { allowed_screens: next });
      qc.invalidateQueries({ queryKey: ['eae', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['security', 'users'] });
      qc.invalidateQueries({ queryKey: ['auth', 'access'] });
      onClose();
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-h-[75vh] bg-[#F7FAFA] border border-[#5C8891] shadow-xl flex flex-col">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#041F24' }}>
          Acesso PMS — {user?.username}
          <button onClick={onClose} title="Fechar" className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          {!profile ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Este utilizador ainda não tem um perfil (RBAC) atribuído — atribua um perfil em Segurança → Utilizadores primeiro.</div>
          ) : profile.full_access !== false ? (
            <div className="p-6 text-center text-gray-500 text-[12px]">
              O perfil <b>{profile.name}</b> deste utilizador tem <b>acesso total</b> — vê todos os ecrãs do PMS.
              Para restringir, desmarque "Acesso total" no perfil (Acessos por Perfil) e depois volte aqui.
            </div>
          ) : (
            <table className="w-full text-[12px] border-collapse">
              <thead style={{ background: '#F7FAFA' }}>
                <tr><th className="w-10 border-b border-[#CFE3E6]"></th><th className="text-left px-3 py-1.5 border-b border-[#CFE3E6] font-semibold">Ecrã do PMS</th></tr>
              </thead>
              <tbody>
                {PMS_SCREENS.map((scr) => (
                  <tr key={scr.id} className="border-b border-[#F7FAFA] hover:bg-white">
                    <td className="text-center py-1.5"><input type="checkbox" checked={isChecked(scr.id)} onChange={() => toggle(scr.id)} /></td>
                    <td className="px-3 py-1.5">{scr.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-[#F7FAFA] border-t border-[#CFE3E6] flex-shrink-0">
          <button onClick={gravar} disabled={saving || !profile || profile.full_access !== false}
            className="flex items-center gap-2 text-[12px] font-semibold text-[#041F24] disabled:opacity-50 hover:text-black">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: '#5C8891' }}><Check size={13} /></span>
            {saving ? 'A gravar…' : 'Gravar'}
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#041F24] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#B0392B] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
