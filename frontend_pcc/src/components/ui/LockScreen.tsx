import React, { useState } from 'react';
import { Lock, Unlock, User } from 'lucide-react';
import { pccAuth } from '../../api/auth';

interface LockScreenProps {
  onUnlock: () => void;
}

// Quem desbloqueia tem de provar que É o admin com sessão aberta — pede a password
// REAL dele e valida-a contra auth/login/ (o mesmo endpoint do login normal, que
// também exige is_staff). Um PIN fixo aqui seria decoração, não segurança.
export default function LockScreen({ onUnlock }: LockScreenProps) {
  const user = pccAuth.getUser();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user?.username || !password) return;
    setLoading(true);
    setError('');
    try {
      await pccAuth.login(user.username, password);
      onUnlock();
    } catch {
      setError('Password incorreta.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#2b2b2b]">
      <div className="w-80 bg-[#3a3a3a] border border-[#555] rounded-sm p-8 flex flex-col items-center shadow-2xl">
        <Lock size={48} className="text-[#a0a0a0] mb-6" />
        <h2 className="text-white text-lg font-bold mb-1">Consola Bloqueada</h2>
        <p className="text-[#a0a0a0] text-xs mb-4 flex items-center gap-1">
          <User size={12} /> {user?.username || '—'}
        </p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
            placeholder="A sua password"
            className={`w-full h-11 px-3 mb-3 bg-[#4a4a4a] text-white text-sm rounded-sm border ${error ? 'border-red-500' : 'border-[#555]'} focus:outline-none focus:border-[#7aa5d6]`}
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-11 bg-[#1e3f66] text-white text-sm font-medium rounded-sm hover:bg-[#2a5282] border border-[#16304d] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Unlock size={16} /> {loading ? 'A verificar…' : 'Desbloquear'}
          </button>
          {error && <p className="text-red-400 text-xs font-bold mt-3">{error}</p>}
        </form>
      </div>
    </div>
  );
}
