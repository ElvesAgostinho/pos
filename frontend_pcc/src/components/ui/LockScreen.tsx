import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handlePinEnter = (digit: string) => {
    if (error) setError(false);
    if (pin.length < 4) {
      setPin(prev => prev + digit);
    }
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin === '1234') {
      onUnlock();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#2b2b2b]">
      <div className="w-80 bg-[#3a3a3a] border border-[#555] rounded-sm p-8 flex flex-col items-center shadow-2xl">
        <Lock size={48} className="text-[#a0a0a0] mb-6" />
        <h2 className="text-white text-lg font-bold mb-1">Sessão Bloqueada</h2>
        <p className="text-[#a0a0a0] text-xs mb-6">Insira o seu PIN para desbloquear</p>
        
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <div className="flex space-x-3 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i} 
                className={`w-4 h-4 rounded-full border-2 ${
                  pin.length > i 
                    ? 'bg-white border-white' 
                    : error ? 'border-red-500' : 'border-[#666]'
                }`}
              />
            ))}
          </div>
          
          <div className="grid grid-cols-3 gap-3 mb-6 w-full px-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handlePinEnter(num.toString())}
                className="h-12 bg-[#4a4a4a] text-white text-xl font-medium rounded-sm hover:bg-[#5a5a5a] active:bg-[#666] border border-[#555] flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-12 bg-[#333] text-[#a0a0a0] text-sm font-medium rounded-sm hover:bg-[#2b2b2b] border border-[#444] flex items-center justify-center"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handlePinEnter('0')}
              className="h-12 bg-[#4a4a4a] text-white text-xl font-medium rounded-sm hover:bg-[#5a5a5a] active:bg-[#666] border border-[#555] flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="h-12 bg-[#1e3f66] text-white text-sm font-medium rounded-sm hover:bg-[#2a5282] border border-[#16304d] flex items-center justify-center"
            >
              <Unlock size={16} />
            </button>
          </div>

          {error && <p className="text-red-400 text-xs font-bold">PIN Incorreto. O PIN de teste é 1234.</p>}
        </form>
      </div>
    </div>
  );
}
