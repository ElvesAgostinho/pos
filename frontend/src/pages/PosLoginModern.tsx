import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Monitor, User, XCircle, Keyboard, Check, RotateCcw, Power, ChevronDown } from 'lucide-react';

const PROPERTIES = [
  { id: '1', name: 'HOTEL1' },
  { id: '2', name: 'RESORT MWANA' }
];

const AREAS = [
  { id: 'restaurante', name: 'Restaurante' },
  { id: 'esplanada', name: 'Esplanada' },
  { id: 'bar', name: 'Lobby Bar' }
];

const PosLoginModern: React.FC = () => {
  const [property, setProperty] = useState(PROPERTIES[0].id);
  const [area, setArea] = useState(AREAS[0].id);
  const [pin, setPin] = useState('');
  const [showNumpad, setShowNumpad] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleLogin = () => {
    if (pin.length > 0) {
      alert(`Login submetido!\nPropriedade: ${PROPERTIES.find(p => p.id === property)?.name}\nÁrea: ${AREAS.find(a => a.id === area)?.name}`);
      navigate('/pos/terminal');
    }
  };

  const handleNumpad = (num: string) => {
    if (num === 'C') setPin('');
    else if (num === 'DEL') setPin(prev => prev.slice(0, -1));
    else setPin(prev => prev + num);
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4 font-sans select-none">
      {/* Main Terminal Window */}
      <div className="w-full max-w-4xl bg-[#3a3a3a] border-8 border-black rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
        
        {/* Header */}
        <div className="bg-gradient-to-b from-[#2a2a2a] to-[#000000] p-4 flex justify-between items-center border-b-4 border-[#111]">
          <div className="flex items-center">
             {/* Fake Logo imitating "10i host Hotel Systems" */}
             <div className="text-[#88c540] text-5xl font-extrabold tracking-tighter flex items-center">
               10i
               <div className="ml-2 flex flex-col justify-center">
                 <span className="text-white text-3xl font-bold leading-none tracking-tight">host</span>
                 <span className="text-white text-[10px] uppercase leading-none tracking-widest mt-1">Hotel Systems</span>
               </div>
             </div>
          </div>
          <div className="text-right text-white">
             <div className="text-2xl italic font-bold tracking-wider">HOST POS 10.0.975</div>
             <div className="text-xl font-medium mt-1">{formatTime(currentTime)}</div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-10 space-y-8">
          
          {/* Property Row */}
          <div className="flex items-center space-x-6">
            <div className="w-16 flex justify-center">
              <Home className="text-white w-12 h-12" />
            </div>
            <div className="flex-1 relative">
              <select 
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                className="w-full h-20 bg-[#666666] border border-[#555] rounded-xl text-[#ddd] text-3xl px-6 appearance-none focus:outline-none focus:ring-2 focus:ring-[#88c540] shadow-inner font-semibold"
              >
                {PROPERTIES.map(p => <option key={p.id} value={p.id} className="text-xl">{p.name}</option>)}
              </select>
              <div className="absolute right-6 top-0 bottom-0 flex items-center pointer-events-none">
                <ChevronDown className="text-white w-10 h-10" />
              </div>
            </div>
          </div>

          {/* Area Row */}
          <div className="flex items-center space-x-6">
            <div className="w-16 flex justify-center">
              <Monitor className="text-white w-12 h-12" />
            </div>
            <div className="flex-1 relative">
              <select 
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full h-20 bg-[#666666] border border-[#555] rounded-xl text-[#ddd] text-3xl px-6 appearance-none focus:outline-none focus:ring-2 focus:ring-[#88c540] shadow-inner font-semibold"
              >
                {AREAS.map(a => <option key={a.id} value={a.id} className="text-xl">{a.name}</option>)}
              </select>
              <div className="absolute right-6 top-0 bottom-0 flex items-center pointer-events-none">
                <ChevronDown className="text-white w-10 h-10" />
              </div>
            </div>
          </div>

          {/* User/PIN Row */}
          <div className="flex items-center space-x-6">
            <div className="w-16 flex justify-center">
              <User className="text-white w-12 h-12" />
            </div>
            
            {/* Input Container */}
            <div className="flex-1 flex items-center space-x-4">
              <div className="flex-1 h-20 bg-[#666666] border border-[#555] shadow-inner rounded-xl flex items-center px-6 relative">
                <input 
                  type="password" 
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="bg-transparent w-full h-full text-white text-5xl tracking-[0.5em] font-bold outline-none"
                  placeholder="••••"
                />
                <button 
                  onClick={() => setPin('')}
                  className="w-12 h-12 rounded-full bg-[#888] flex justify-center items-center hover:bg-[#999] transition-colors flex-shrink-0 shadow-sm"
                >
                  <XCircle className="text-[#eee] w-10 h-10" />
                </button>
              </div>

              {/* Virtual Keyboard Button */}
              <button 
                onClick={() => setShowNumpad(!showNumpad)}
                className="w-24 h-20 bg-gradient-to-b from-[#222] to-[#000] border-2 border-[#111] rounded-xl flex justify-center items-center shadow-lg hover:from-[#333] hover:to-[#111] transition-colors"
              >
                <Keyboard className="text-white w-12 h-12" />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex justify-end">
            <button 
              onClick={handleLogin}
              disabled={pin.length === 0}
              className={`w-[calc(100%-5.5rem)] ml-auto h-24 rounded-2xl flex justify-center items-center shadow-[inset_0_2px_10px_rgba(255,255,255,0.3)] transition-colors border border-[#6aa80f] ${
                pin.length > 0 ? 'bg-[#88c540] hover:bg-[#98d550] cursor-pointer' : 'bg-[#6a9535] opacity-90 cursor-not-allowed'
              }`}
            >
              <Check className="text-white w-20 h-20" strokeWidth={5} />
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-8 pt-4 flex justify-between items-end bg-[#3a3a3a]">
          <div>
            <div className="text-white font-bold text-3xl uppercase tracking-wider">{PROPERTIES.find(p => p.id === property)?.name}</div>
            <div className="text-gray-400 text-xl uppercase mt-2">HHS-DEMO ; {PROPERTIES.find(p => p.id === property)?.name}</div>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex space-x-8 mb-3">
              <Monitor className="text-[#00ff00] w-16 h-16 drop-shadow-[0_0_12px_rgba(0,255,0,0.4)]" />
              <RotateCcw className="text-[#0055ff] w-16 h-16 drop-shadow-[0_0_12px_rgba(0,85,255,0.4)]" />
              <Power className="text-[#ff0000] w-16 h-16 drop-shadow-[0_0_12px_rgba(255,0,0,0.4)]" />
            </div>
            <div className="text-gray-400 text-base italic pr-2 font-medium">Certified program no. 0751 / AT</div>
          </div>
        </div>

        {/* Absolute Numpad Popover */}
        {showNumpad && (
          <div className="absolute top-[340px] right-12 w-80 bg-[#222] border-4 border-black rounded-xl p-5 shadow-2xl z-50">
            <div className="grid grid-cols-3 gap-3">
              {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => (
                <button 
                  key={n}
                  onClick={() => handleNumpad(n.toString())}
                  className="h-20 bg-[#444] text-white text-3xl font-bold rounded-lg hover:bg-[#555] active:bg-[#666] shadow-sm"
                >
                  {n}
                </button>
              ))}
              <button onClick={() => handleNumpad('C')} className="h-20 bg-red-800 text-white text-2xl font-bold rounded-lg hover:bg-red-700 shadow-sm">C</button>
              <button onClick={() => handleNumpad('0')} className="h-20 bg-[#444] text-white text-3xl font-bold rounded-lg hover:bg-[#555] shadow-sm">0</button>
              <button onClick={() => handleNumpad('DEL')} className="h-20 bg-yellow-700 text-white text-xl font-bold rounded-lg hover:bg-yellow-600 shadow-sm">DEL</button>
            </div>
            <button 
              onClick={() => setShowNumpad(false)}
              className="w-full mt-4 h-14 bg-[#111] text-gray-400 font-bold rounded-lg hover:bg-[#333] border border-[#444]"
            >
              FECHAR TECLADO
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default PosLoginModern;
