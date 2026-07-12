import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { pccAuth } from '../api/auth';

interface Props {
  onClose: () => void;
}

const ChangePassword: React.FC<Props> = ({ onClose }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('A confirmação não coincide com a nova palavra-passe.');
      return;
    }
    setLoading(true);
    try {
      await pccAuth.changePassword(current, next);
      setOk(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Não foi possível alterar a palavra-passe.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full border border-[#a0a0a0] p-1.5 text-[12px] focus:outline-none bg-white';

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center">
      <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[400px] shadow-[4px_4px_10px_rgba(0,0,0,0.35)]">
        {/* Barra de título */}
        <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
          <div className="flex items-center">
            <KeyRound size={13} className="mr-2 text-[#f1c40f]" />
            <span className="font-bold text-[11px]">Alterar Palavra-passe</span>
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
              <p className="font-bold text-green-800 text-[12px]">Palavra-passe alterada com sucesso!</p>
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
                <label className="block font-bold text-gray-700 mb-1">Palavra-passe atual</label>
                <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nova palavra-passe</label>
                <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} required />
                <p className="text-[10px] text-gray-500 mt-0.5">Mínimo 6 caracteres.</p>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Confirmar nova palavra-passe</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
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
                  {loading ? 'A gravar…' : 'Alterar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
