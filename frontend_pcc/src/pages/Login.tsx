import React, { useState } from 'react';
import { Shield, Lock, User } from 'lucide-react';
import { pccAuth } from '../api/auth';

interface Props {
  onSuccess: () => void;
}

const Login: React.FC<Props> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await pccAuth.login(username, password);
      onSuccess();
    } catch (err: any) {
      setError(
        err?.message === 'Acesso restrito a administradores da plataforma.'
          ? err.message
          : err?.response?.data?.detail || 'Credenciais inválidas.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#008080] flex items-center justify-center font-sans text-[11px] select-none">
      {/* Janela clássica */}
      <div className="w-[380px] bg-[#f0f0f0] border border-[#a0a0a0] shadow-[4px_4px_10px_rgba(0,0,0,0.35)]">
        {/* Barra de título */}
        <div className="bg-gradient-to-b from-[#4a4a4a] to-[#222] text-white px-2 py-1 flex items-center">
          <Shield size={14} className="mr-2 text-[#90c040]" />
          <span className="font-bold text-[12px]">Platform Control Center — Autenticação</span>
        </div>

        <div className="p-5">
          <div className="text-center mb-5">
            <div className="text-[#333] text-2xl font-extrabold tracking-tight">
              PCC<span className="text-[#90c040]">.</span>
            </div>
            <p className="text-gray-500 mt-1">Consola de Licenciamento &amp; Provisionamento</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-700 mb-1">Utilizador Administrador</label>
              <div className="flex items-center bg-white border border-[#999]">
                <User size={13} className="mx-1 text-gray-400" />
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 px-1 py-1.5 text-[12px] outline-none"
                  placeholder="ex: admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-700 mb-1">Palavra-passe</label>
              <div className="flex items-center bg-white border border-[#999]">
                <Lock size={13} className="mx-1 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 px-1 py-1.5 text-[12px] outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="bg-[#ffecec] border border-[#f0b0b0] text-red-700 px-2 py-1.5">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-[#5cb85c] hover:bg-[#4cae4c] disabled:opacity-60 text-white font-bold border border-[#4a8f4a] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
            >
              {loading ? 'A autenticar…' : 'Entrar na Consola'}
            </button>
          </form>
        </div>

        {/* Rodapé */}
        <div className="bg-[#e0e0e0] border-t border-white px-3 py-1.5 text-[10px] text-gray-500 flex justify-between">
          <span>Acesso restrito — Staff da plataforma</span>
          <span>v1.0</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
