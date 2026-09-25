import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ClassicGrid from '../ui/ClassicGrid';
import { useUsers } from '../../hooks/useSecurity';
import { apiClient } from '../../api/client';
import PmsUserAccessDialog from './PmsUserAccessDialog';
import { ShieldCheck } from 'lucide-react';

/**
 * Utilizadores (PMS) — ecrã FINO: a gestão de utilizadores (criar, senha,
 * ativar/inativar, hotéis) JÁ EXISTE por inteiro em Segurança → Utilizadores
 * (`useUsers`/`useCreateUser`/… de `hooks/useSecurity.ts`, endpoint
 * `auth/users/`) — não se duplica aqui nada disso. Este ecrã só lista os
 * utilizadores dentro da moldura do PMS, com uma coluna de "Acesso PMS" e um
 * botão que abre `PmsUserAccessDialog` (o mesmo mecanismo de permissões por
 * ecrã que `PmsPermissionsDialog` já usa, `eae.Profile.allowed_screens`,
 * só que virado por utilizador).
 */
export default function PmsUsersView() {
  const { data: users = [] } = useUsers();
  const [target, setTarget] = useState<any>(null);

  // `u.profiles[0]` (de `auth/users/`) é só um resumo {id,code,name} — sem
  // `full_access`/`allowed_screens`. Para mostrar o nível de acesso a sério
  // é preciso ir buscar o perfil completo à lista de `eae/profiles/` (mesmo
  // endpoint que `PmsPermissionsDialog`/`PmsUserAccessDialog` já usam).
  const { data: profiles } = useQuery({ queryKey: ['eae', 'profiles'], queryFn: async () => (await apiClient.get('eae/profiles/')).data });
  const profileRows: any[] = Array.isArray(profiles) ? profiles : profiles?.results || [];
  const fullProfileOf = (u: any) => {
    const summary = u.profiles?.[0];
    return summary ? profileRows.find((p) => p.id === summary.id) : null;
  };

  const accessLabel = (u: any) => {
    if (u.is_superuser) return 'Total (dono)';
    const p = fullProfileOf(u);
    if (!u.profiles?.[0]) return 'Sem perfil';
    if (!p) return '…';
    if (p.full_access !== false) return 'Total';
    const n = (p.allowed_screens || []).filter((s: string) => s.startsWith('pms_')).length;
    return n > 0 ? `${n} ecrã(s) PMS` : 'Sem ecrãs PMS';
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#F7FAFA] border-b border-[#7FA9B1] text-[12px] text-[#5C8891]">
        <ShieldCheck size={14} />
        A criação de utilizadores, senha e acesso a hotéis é feita em Segurança → Utilizadores. Aqui só se ajusta o acesso aos ecrãs do PMS.
      </div>
      <div className="flex-1 overflow-hidden">
        <ClassicGrid rowKey="id" data={users} columns={[
          { header: 'Utilizador', accessor: 'username', width: '20%' },
          { header: 'Email', accessor: (r: any) => r.email || '—', width: '25%' },
          { header: 'Perfil', accessor: (r: any) => r.profiles?.[0]?.name || '—', width: '20%' },
          { header: 'Estado', accessor: (r: any) => <span className={r.is_active ? 'text-[#062A31] font-bold' : 'text-[#8C2B1F]'}>{r.is_active ? 'Ativo' : 'Inativo'}</span>, width: '10%' },
          { header: 'Acesso PMS', accessor: (r: any) => <span className="text-[#062A31]">{accessLabel(r)}</span>, width: '15%' },
          { header: 'Ações', accessor: (r: any) => (
            <button onClick={() => setTarget(r)} disabled={r.is_superuser}
              className="text-[11px] text-[#5C8891] hover:underline disabled:opacity-40 disabled:no-underline">
              Permissões PMS…
            </button>
          ), width: '10%' },
        ]} />
      </div>
      {target && <PmsUserAccessDialog user={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
