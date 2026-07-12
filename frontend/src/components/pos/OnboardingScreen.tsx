import React, { useState } from 'react';
import { apiClient as axios } from '../../api/client';
import { Monitor, Key, ShieldCheck, CheckCircle, RefreshCcw } from 'lucide-react';

interface OnboardingScreenProps {
  onSuccess: (token: string, terminalName: string) => void;
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onSuccess }) => {
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await axios.post('http://localhost:8000/api/workforce/workstations/activate_license/', {
        activation_key: activationKey
      });
      
      const { device_token, terminal_name } = res.data;
      onSuccess(device_token, terminal_name);
      
    } catch (err: any) {
      setError(err.response?.data?.error || "Erro ao conectar ao servidor. Verifique a chave ou a rede.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] flex items-center justify-center p-4 font-sans selection:bg-cyan-900">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 p-10 rounded-3xl shadow-2xl w-full max-w-lg text-white relative overflow-hidden">
        
        <div className="absolute top-0 right-0 p-4 opacity-30">
          <ShieldCheck size={120} />
        </div>

        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <div className="bg-white/20 p-4 rounded-full shadow-inner border border-white/30">
              <Monitor size={48} className="text-cyan-300" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-center mb-2 tracking-tight">Setup de Novo Terminal</h1>
          <p className="text-center text-cyan-100/80 mb-10 text-sm">
            Este equipamento não está registado. Insira a Chave de Ativação (Activation Key) fornecida no Platform Control Center para emparelhar.
          </p>

          <form onSubmit={handleActivate} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-cyan-200 mb-2 uppercase tracking-wider">
                Activation Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key size={20} className="text-cyan-600" />
                </div>
                <input 
                  type="text" 
                  required
                  value={activationKey}
                  onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
                  placeholder="EX: A1B2-C3D4-E5F6"
                  className="w-full bg-white/90 text-gray-900 border-0 rounded-xl py-4 pl-12 pr-4 font-mono font-bold text-lg tracking-widest focus:ring-4 focus:ring-cyan-500/50 outline-none transition-all placeholder:text-gray-400 placeholder:font-sans placeholder:tracking-normal shadow-inner"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-100 px-4 py-3 rounded-lg text-sm flex items-start">
                <span className="mr-2">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading || !activationKey}
              className={`w-full flex items-center justify-center space-x-2 py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-lg ${
                loading || !activationKey 
                  ? 'bg-cyan-900/50 text-cyan-400 cursor-not-allowed' 
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 hover:shadow-cyan-500/50 hover:-translate-y-1'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCcw size={24} className="animate-spin" />
                  <span>A Validar Licença...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={24} />
                  <span>Emparelhar Equipamento</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-12 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-cyan-200/50">
              System Mwana Lodge &copy; 2026 - Gestão de Licenciamento Centralizada
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingScreen;
