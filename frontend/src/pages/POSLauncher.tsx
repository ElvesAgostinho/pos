import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Monitor, User, Grip } from 'lucide-react';

const POSLauncher: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pin, setPin] = useState('');

  // Mock selections
  const [area, setArea] = useState('');
  const [terminal, setTerminal] = useState('');
  const [operator, setOperator] = useState('');

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
    }
  };

  const handlePinDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handlePinSubmit = () => {
    if (pin.length === 4) {
      // Simulate POS launch
      navigate('/pos/terminal'); // To be built later
    }
  };

  return (
    <div className="min-h-screen bg-[#2d3436] flex flex-col justify-center items-center p-4 select-none">
      <button 
        onClick={() => {
          if (step === 1) navigate('/');
          else setStep((prev) => (prev - 1) as 1|2|3|4);
        }}
        className="absolute top-6 left-6 flex items-center text-gray-400 hover:text-white"
      >
        <ArrowLeft size={20} className="mr-2" /> Voltar
      </button>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white tracking-widest uppercase">POS Launcher</h1>
        <p className="text-[#90c040] mt-1 font-semibold">Hotel Luanda</p>
      </div>

      <div className="w-full max-w-lg bg-[#353b48] rounded-xl shadow-2xl p-6 border border-[#444]">
        
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center justify-center">
              <MapPin className="mr-2 text-[#90c040]" /> Selecione a Área
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {['Restaurante Principal', 'Bar da Piscina', 'Room Service', 'SPA'].map((a) => (
                <button 
                  key={a}
                  onClick={() => { setArea(a); setStep(2); }}
                  className="py-6 px-4 bg-[#2f3640] border-2 border-[#444] rounded-lg text-white font-bold text-lg hover:border-[#90c040] hover:bg-[#2d3e30] transition-colors"
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center justify-center">
              <Monitor className="mr-2 text-[#90c040]" /> Selecione o Terminal ({area})
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {['Caixa 1', 'Caixa 2', 'Tablet 1 (Mesas)'].map((t) => (
                <button 
                  key={t}
                  onClick={() => { setTerminal(t); setStep(3); }}
                  className="py-6 px-4 bg-[#2f3640] border-2 border-[#444] rounded-lg text-white font-bold text-lg hover:border-[#90c040] hover:bg-[#2d3e30] transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center justify-center">
              <User className="mr-2 text-[#90c040]" /> Selecione o Operador
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {['Carlos Silva', 'Maria Santos', 'João Martins'].map((op) => (
                <button 
                  key={op}
                  onClick={() => { setOperator(op); setStep(4); setPin(''); }}
                  className="py-6 px-4 bg-[#2f3640] border-2 border-[#444] rounded-lg text-white font-bold text-lg hover:border-[#90c040] hover:bg-[#2d3e30] transition-colors"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-fade-in flex flex-col items-center">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center justify-center">
              <Grip className="mr-2 text-[#90c040]" /> Código PIN
            </h2>
            <p className="text-gray-400 mb-6">{operator} • {terminal}</p>

            {/* PIN Dots */}
            <div className="flex space-x-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-6 h-6 rounded-full border-2 ${i < pin.length ? 'bg-[#90c040] border-[#90c040]' : 'border-gray-500'}`}
                />
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3 w-64">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handlePinInput(num.toString())}
                  className="w-full py-4 bg-[#2f3640] border border-[#444] rounded text-2xl font-bold text-white hover:bg-[#444] active:bg-[#90c040]"
                >
                  {num}
                </button>
              ))}
              <button 
                onClick={handlePinDelete}
                className="w-full py-4 bg-red-900/50 border border-red-900 rounded text-xl font-bold text-white hover:bg-red-800"
              >
                C
              </button>
              <button
                onClick={() => handlePinInput('0')}
                className="w-full py-4 bg-[#2f3640] border border-[#444] rounded text-2xl font-bold text-white hover:bg-[#444] active:bg-[#90c040]"
              >
                0
              </button>
              <button 
                onClick={handlePinSubmit}
                disabled={pin.length !== 4}
                className={`w-full py-4 border rounded text-xl font-bold text-white
                  ${pin.length === 4 ? 'bg-[#90c040] border-[#90c040] hover:bg-[#7ba337]' : 'bg-[#2f3640] border-[#444] opacity-50 cursor-not-allowed'}`}
              >
                OK
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mt-6">Pode também utilizar Cartão RFID ou Pulseira NFC.</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default POSLauncher;
