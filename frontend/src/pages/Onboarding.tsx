import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, MonitorSmartphone, ShieldCheck, CheckCircle, Fingerprint } from 'lucide-react';
import { getHardwareFingerprint } from '../engine/hardware';

const Onboarding: React.FC = () => {
  const [terminalId, setTerminalId] = useState('');
  const [activationKey, setActivationKey] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Read hardware fingerprint on mount
    setFingerprint(getHardwareFingerprint());
  }, []);

  const handleActivate = async () => {
    setLoading(true);
    setErrorMsg('');
    
    try {
      const response = await fetch('http://localhost:8000/api/clm/terminals/activate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminal_id: terminalId,
          activation_key: activationKey,
          fingerprint: fingerprint
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        // Store the signed JWT token tied to this hardware
        localStorage.setItem('ERP_TERMINAL_TOKEN', data.token);
        localStorage.setItem('ERP_LICENSED', 'true');
      } else {
        setErrorMsg(data.error || 'Erro na ativação do terminal.');
      }
    } catch (error) {
      setErrorMsg('Não foi possível contactar o servidor de licenciamento.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded shadow-2xl p-8 text-center border-t-4 border-[#90c040]">
          <div className="w-20 h-20 bg-[#f0fdf4] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-[#90c040]" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Terminal Ativado!</h2>
          <p className="text-gray-600 mb-8">
            O certificado de hardware foi gerado. Este POS está agora associado à sua licença.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-3 bg-[#111827] text-white rounded font-bold hover:bg-[#1f2937] transition-colors"
          >
            Aceder ao Sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full flex shadow-2xl overflow-hidden rounded">
        {/* Left Sidebar */}
        <div className="w-1/3 bg-[#1f2937] text-white p-8 flex flex-col justify-between hidden md:flex">
          <div>
            <h1 className="text-2xl font-bold mb-8 tracking-tight">Hospitality<br/><span className="text-[#90c040]">ERP</span></h1>
            
            <div className="space-y-6">
              <div className="flex items-start opacity-100">
                <MonitorSmartphone size={20} className="text-[#90c040] mt-1 mr-3" />
                <div>
                  <h3 className="font-bold text-sm">1. Terminal</h3>
                  <p className="text-xs text-gray-400 mt-1">Identificação do POS</p>
                </div>
              </div>
              <div className="flex items-start opacity-50">
                <KeyRound size={20} className="mt-1 mr-3" />
                <div>
                  <h3 className="font-bold text-sm">2. Ativação</h3>
                  <p className="text-xs text-gray-400 mt-1">Validação de Chave</p>
                </div>
              </div>
              <div className="flex items-start opacity-50">
                <ShieldCheck size={20} className="mt-1 mr-3" />
                <div>
                  <h3 className="font-bold text-sm">3. Registo</h3>
                  <p className="text-xs text-gray-400 mt-1">Hardware Fingerprint</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-[10px] text-gray-500">
            System Mwana Lodge<br/>
            Enterprise Management Suite
          </div>
        </div>

        {/* Right Content */}
        <div className="w-full md:w-2/3 p-8 flex flex-col">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800">Ativação de Terminal</h2>
            <p className="text-gray-500 text-sm mt-1">Associe este hardware à licença do Cliente.</p>
          </div>

          <div className="flex-1">
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
                {errorMsg}
              </div>
            )}
            
            <div className="mb-5">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Terminal ID
              </label>
              <input 
                type="text"
                className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#90c040] focus:border-transparent font-mono"
                placeholder="POS-00000000"
                value={terminalId}
                onChange={(e) => setTerminalId(e.target.value)}
              />
            </div>
            
            <div className="mb-5">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Activation Key
              </label>
              <input 
                type="text"
                className="w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-[#90c040] focus:border-transparent font-mono tracking-widest uppercase"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={activationKey}
                onChange={(e) => setActivationKey(e.target.value)}
              />
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded border border-gray-100 flex items-center">
              <Fingerprint className="text-gray-400 mr-3" size={24} />
              <div>
                <p className="text-xs font-bold text-gray-600">Hardware Fingerprint</p>
                <p className="text-[10px] text-gray-500 font-mono mt-1">{fingerprint || 'A gerar...'}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-gray-100">
            <button 
              onClick={handleActivate}
              disabled={!terminalId || !activationKey || loading}
              className={`px-6 py-2 bg-[#90c040] text-white rounded font-bold transition-all
                ${!terminalId || !activationKey || loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#7aa636]'}`}
            >
              {loading ? 'A contactar servidor...' : 'Ativar Terminal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
