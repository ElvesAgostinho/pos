import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { MENUS as PMS_MENU_GROUPS } from './pmsMenus';

/**
 * Variante POR UTILIZADOR do `PmsPermissionsDialog` (que é por ecrã): em vez
 * de "para este ecrã, que perfis podem entrar", mostra "para este
 * utilizador (via o seu perfil), que ecrãs do PMS pode ver" — mesmos dados
 * (`eae.Profile.allowed_screens`), só a matriz virada ao contrário, mais
 * prática para o ecrã de Utilizadores.
 *
 * A lista de ecrãs vem SEMPRE de `MENUS` (pmsMenus.ts, a mesma fonte que o
 * PmsShell.tsx e o Ambiente de Trabalho já usam) — nunca uma cópia à mão.
 * Havia aqui antes uma lista `PMS_SCREENS` escrita à mão que
 * ficou desatualizada e só cobria 19 dos ~37 ecrãs reais do PMS (faltavam
 * Check-Out, Auditoria da Noite, Estado Hotel, Planning, Tarefas, Perdidos e
 * Achados, Lista Telefónica, Leitor de Documentos, Logs, Diagnóstico, SAFT-AO,
 * Fecho do dia POS, Relatórios, Informação Online, Produtos & Serviços,
 * Pesquisa de Entidades, Lista de Eventos, Categorias de Quarto e Início) — um
 * dono que tentasse restringir um rececionista a "só Reservas" não conseguia
 * sequer NEGAR-lhe o Check-Out ou o Financeiro por este ecrã, porque essas
 * entradas nem apareciam na lista para desmarcar. Deriva-se aqui de `MENUS`
 * para nunca mais desincronizar (é o mesmo padrão já corrigido em
 * EnterpriseDesktop.tsx para o Ambiente de Trabalho).
 *
 * `pmsMenus.ts` é um ficheiro de dados puro (sem componentes React), por
 * isso importá-lo aqui não cria nenhum ciclo com PmsShell.tsx — ao contrário
 * de importar `MENUS` do próprio PmsShell.tsx, que passaria pelo componente
 * inteiro só para ler uma lista. `derivePmsScreens()` continua calculada via
 * `useMemo` em tempo de render, simplesmente por não haver razão para a
 * recalcular a cada render.
 */
function derivePmsScreens(): { id: string; label: string }[] {
  const porSeccao = new Map<string, string>();
  for (const grupo of PMS_MENU_GROUPS) {
    for (const it of grupo.items) {
      if (!it.section || porSeccao.has(it.section)) continue;
      porSeccao.set(it.section, it.label);
    }
  }
  // "Início" é o ecrã de arranque do PMS — nunca aparece como item de menu
  // (não há para onde "navegar" a partir dele), mas também é um ecrã que
  // pode ser restringido, por isso entra aqui à parte.
  if (!porSeccao.has('home_dashboard')) porSeccao.set('home_dashboard', 'Início');
  return Array.from(porSeccao, ([section, label]) => ({ id: `pms_${section}`, label }));
}

export default function PmsUserAccessDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const PMS_SCREENS = useMemo(derivePmsScreens, []);
  // `user.profiles[0]` (vindo de `auth/users/`) é só um RESUMO ({id, code,
  // name}) — não traz `full_access`/`allowed_screens`. Esses só vêm da lista
  // completa de perfis (`eae/profiles/`, o mesmo endpoint que
  // `PmsPermissionsDialog.tsx` já usa) — por isso vamos lá buscar o perfil
  // A SÉRIO pelo id, em vez de confiar no resumo.
  const profileSummary = user?.profiles?.[0];
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['eae', 'profiles'],
    queryFn: async () => (await apiClient.get('eae/profiles/')).data,
  });
  const profileRows = Array.isArray(profiles) ? profiles : profiles?.results || [];
  const profile = profileSummary ? profileRows.find((p: any) => p.id === profileSummary.id) : null;
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
          {isLoading ? (
            <div className="p-4 text-gray-400 text-[12px]">A carregar…</div>
          ) : !profileSummary ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Este utilizador ainda não tem um perfil (RBAC) atribuído — atribua um perfil em Segurança → Utilizadores primeiro.</div>
          ) : !profile ? (
            <div className="p-6 text-center text-gray-400 text-[12px]">Não foi possível carregar os dados completos do perfil "{profileSummary.name}".</div>
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
