import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { UserPlus, Trash2, KeyRound, Power, ShieldCheck, MonitorSmartphone, History } from 'lucide-react';
import {
  useUsers, useProfiles, useCreateUser, useDeleteUser, useUpdateUser, useSetPassword, useToggleActive,
  useSessions, useRevokeSession, useAuthEvents,
} from '../../hooks/useSecurity';

export function UsersView() {
  const { data: users = [] } = useUsers();
  const { data: profiles = [] } = useProfiles();
  const create = useCreateUser();
  const del = useDeleteUser();
  const upd = useUpdateUser();
  const setPw = useSetPassword();
  const toggle = useToggleActive();
  const empty = { username: '', email: '', password: '', profile_ids: [] as number[], is_staff: true };
  const [d, setD] = useState<any>(empty);

  const add = () => {
    if (!d.username || !d.password) { alert('Utilizador e palavra-passe são obrigatórios.'); return; }
    create.mutate(d, { onSuccess: () => setD(empty), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };
  const changePw = (id: number) => { const p = window.prompt('Nova palavra-passe:'); if (p) setPw.mutate({ id, password: p }); };
  const setProfile = (u: any, pid: string) => upd.mutate({ id: u.id, data: { profile_ids: pid ? [Number(pid)] : [] } });

  return (
    <ClassicWindow title="Utilizadores & Acessos (Security)" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{users.length} utilizador(es) · perfil define o que cada um acede (RBAC)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <input placeholder="Utilizador" value={d.username} onChange={(e) => setD({ ...d, username: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
          <input placeholder="Email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Palavra-passe" type="password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} className="border border-[#a0a0a0] p-1 w-32" />
          <select value={d.profile_ids[0] || ''} onChange={(e) => setD({ ...d, profile_ids: e.target.value ? [Number(e.target.value)] : [] })} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">— perfil —</option>{profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ClassicButton icon={UserPlus} label="Criar Utilizador" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={users} columns={[
            { header: 'Utilizador', accessor: 'username', width: '18%' },
            { header: 'Email', accessor: (r: any) => r.email || '—', width: '20%' },
            { header: 'Perfil (RBAC)', accessor: (r: any) => (
              <select value={r.profiles?.[0]?.id || ''} onChange={(e) => setProfile(r, e.target.value)} className="border border-[#a0a0a0] p-0.5 bg-white text-[11px]">
                <option value="">— sem perfil —</option>{profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>), width: '22%' },
            { header: 'Estado', accessor: (r: any) => <span className={r.is_active ? 'text-green-700 font-bold' : 'text-red-600'}>{r.is_active ? 'Ativo' : 'Inativo'}</span>, width: '10%' },
            { header: 'Admin', accessor: (r: any) => r.is_superuser ? 'Super' : (r.is_staff ? 'Staff' : '—'), width: '10%' },
            { header: 'Ações', accessor: (r: any) => (
              <div className="flex gap-2">
                <button title="Palavra-passe" onClick={() => changePw(r.id)} className="text-[#1e3f66] hover:text-black"><KeyRound size={13} /></button>
                <button title="Ativar/Inativar" onClick={() => toggle.mutate(r.id)} className="text-[#b06a00] hover:text-black"><Power size={13} /></button>
                {!r.is_superuser && <button title="Apagar" onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={13} /></button>}
              </div>), width: '20%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function SessionsView() {
  const { data: sessions = [] } = useSessions();
  const revoke = useRevokeSession();
  return (
    <ClassicWindow title="Sessões Ativas (Security)" icon={<MonitorSmartphone size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{sessions.length} sessão(ões) · atualiza automaticamente</div>}>
      <ClassicGrid rowKey="id" data={sessions} columns={[
        { header: 'Utilizador', accessor: (r: any) => r.user_name || r.operator_name || '—', width: '24%' },
        { header: 'Tipo', accessor: (r: any) => r.operator_name ? 'Operador POS' : 'Backoffice', width: '18%' },
        { header: 'Estado', accessor: (r: any) => <span className={r.status === 'Active' ? 'text-green-700 font-bold' : 'text-gray-500'}>{r.status}</span>, width: '14%' },
        { header: 'Início', accessor: (r: any) => new Date(r.login_time).toLocaleString('pt-PT'), width: '22%' },
        { header: 'Últ. atividade', accessor: (r: any) => new Date(r.last_activity).toLocaleTimeString('pt-PT'), width: '12%' },
        { header: '', accessor: (r: any) => r.status === 'Active' ? <button onClick={() => revoke.mutate(r.id)} className="text-red-600 hover:text-red-800 text-[11px] font-bold">Terminar</button> : null, width: '10%' },
      ]} />
    </ClassicWindow>
  );
}

const EVT: Record<string, string> = { LOGIN_SUCCESS: 'text-green-700', LOGIN_FAILED_PASSWORD: 'text-red-600', LOGIN_FAILED_PIN: 'text-red-600', LOGOUT: 'text-gray-500' };
export function LoginHistoryView() {
  const [t, setT] = useState('');
  const { data: events = [] } = useAuthEvents(t || undefined);
  return (
    <ClassicWindow title="Histórico de Login (Security)" icon={<History size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{events.length} evento(s) de autenticação</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Evento:</label>
          <select value={t} onChange={(e) => setT(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Todos</option><option value="LOGIN_SUCCESS">Sucesso</option>
            <option value="LOGIN_FAILED_PASSWORD">Falha password</option><option value="LOGIN_FAILED_PIN">Falha PIN</option><option value="LOGOUT">Logout</option>
          </select>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={events} columns={[
            { header: 'Data/Hora', accessor: (r: any) => new Date(r.timestamp).toLocaleString('pt-PT'), width: '24%' },
            { header: 'Evento', accessor: (r: any) => <span className={EVT[r.event_type] || ''}>{r.event_type}</span>, width: '24%' },
            { header: 'Identidade', accessor: (r: any) => r.identity_attempt || '—', width: '22%' },
            { header: 'IP', accessor: (r: any) => r.ip_address || '—', width: '15%' },
            { header: 'Detalhes', accessor: (r: any) => r.details || '—', width: '15%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
