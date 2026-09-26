import React, { useState } from 'react';
import { Lock, Unlock, User } from 'lucide-react';
import { authApi, tokenStore } from '../../api/auth';

interface LockScreenProps {
  onUnlock: () => void;
}

// O ecrã bloqueia, mas quem desbloqueia tem de provar que É o utilizador com sessão
// aberta — por isso pede a password REAL dele e valida-a contra auth/login/ (o mesmo
// endpoint do login normal). Um PIN fixo aqui seria decoração, não segurança.
export default function LockScreen({ onUnlock }: LockScreenProps) {
  const user = tokenStore.getUser();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user?.username || !password) return;
    setLoading(true);
    setError('');
    try {
      await authApi.backofficeLogin(user.username, password);
      onUnlock();
    } catch {
      setError('Password incorreta.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#041F24]">
      <div className="w-80 bg-[#041F24] border border-[#062A31] rounded-[16px] p-8 flex flex-col items-center shadow-2xl">
        <Lock size={48} className="text-[#7FA9B1] mb-6" />
        <h2 className="text-white text-lg font-bold mb-1">Sessão Bloqueada</h2>
        <p className="text-[#7FA9B1] text-xs mb-4 flex items-center gap-1">
          <User size={12} /> {user?.username || '—'}
        </p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
            placeholder="A sua password"
            className={`w-full h-11 px-3 mb-3 bg-[#062A31] text-white text-sm rounded-sm border ${error ? 'border-[#B0392B]' : 'border-[#062A31]'} focus:outline-none focus:border-[#7FA9B1]`}
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-11 bg-[#062A31] text-white text-sm font-medium rounded-sm hover:bg-[#062A31] border border-[#041F24] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Unlock size={16} /> {loading ? 'A verificar…' : 'Desbloquear'}
          </button>
          {error && <p className="text-[#B0392B] text-xs font-bold mt-3">{error}</p>}
        </form>
      </div>
    </div>
  );
}
