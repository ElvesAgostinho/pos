import React, { useState } from 'react';
import { UserCog, X } from 'lucide-react';
import { pccAuth } from '../api/auth';

interface Props {
  onClose: () => void;
  onSaved?: (username: string) => void;
}

const MyCredentials: React.FC<Props> = ({ onClose, onSaved }) => {
  const user = pccAuth.getUser();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await pccAuth.updateCredentials(username.trim(), email.trim(), currentPassword);
      setOk(true);
      onSaved && onSaved(data.username);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Não foi possível alterar as credenciais.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full border border-[#a0a0a0] p-1.5 text-[12px] focus:outline-none bg-white';

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center">
      <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[400px] shadow-[4px_4px_10px_rgba(0,0,0,0.35)]">
        <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
          <div className="flex items-center">
            <UserCog size={13} className="mr-2 text-[#f1c40f]" />
            <span className="font-bold text-[11px]">As Minhas Credenciais</span>
          </div>
          <button onClick={onClose} className="hover:text-red-400 font-bold">
            <X size={14} />
          </button>
        </div>

        <div className="p-4">
          {ok ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-[#90c040] text-white flex items-center justify-center text-2xl font-bold border border-black mx-auto mb-3">
                ✓
              </div>
              <p className="font-bold text-green-800 text-[12px]">Credenciais alteradas com sucesso!</p>
              <p className="text-[10px] text-gray-600 mt-1">Use o novo nome de utilizador no próximo login.</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-1 border border-[#333] bg-[#333] text-white hover:bg-[#444] text-[11px]"
              >
                Concluir
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 text-[11px]">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome de utilizador (login)</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Palavra-passe atual (para confirmar)</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} required />
                <p className="text-[10px] text-gray-500 mt-0.5">Trocar o nome de utilizador troca a chave de entrada — por isso pede-se a password atual, a mesma exigência de "Alterar palavra-passe".</p>
              </div>

              {error && (
                <div className="bg-[#ffecec] border border-[#f0b0b0] text-red-700 px-2 py-1.5">{error}</div>
              )}

              <div className="flex justify-end space-x-2 pt-1">
                <button type="button" onClick={onClose} className="px-3 py-1 border border-[#a0a0a0] bg-white hover:bg-[#e8e8e8]">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1 bg-[#5cb85c] hover:bg-[#4cae4c] disabled:opacity-60 text-white font-bold border border-[#4a8f4a]"
                >
                  {loading ? 'A gravar…' : 'Gravar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyCredentials;
