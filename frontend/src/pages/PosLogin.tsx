import React, { useState } from 'react';

const PosLogin: React.FC = () => {
  const [pin, setPin] = useState('');

  const handleKeyPress = (val: string) => {
    if (val === 'C') {
      setPin('');
    } else {
      if (pin.length < 8) { // Max pin length
        setPin(prev => prev + val);
      }
    }
  };

  const handleConfirm = () => {
    console.log('Attempting POS Login with PIN:', pin);
    // Future: hook up to backend authentication
  };

  const handleCancel = () => {
    setPin('');
  };

  // Skeuomorphic button style
  const baseBtnClass = "flex items-center justify-center text-white font-bold text-2xl rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_6px_rgba(0,0,0,0.4)] active:shadow-[inset_0_3px_5px_rgba(0,0,0,0.5),0_1px_1px_rgba(0,0,0,0.2)] active:translate-y-1 transition-all h-20";
  const numBtnClass = `${baseBtnClass} bg-gradient-to-b from-[#4a4a4a] to-[#1a1a1a] border border-[#111]`;
  const clearBtnClass = `${baseBtnClass} bg-gradient-to-b from-[#e60000] to-[#990000] border border-[#660000] text-3xl`;
  
  // Bottom action buttons
  const actionBtnClass = "flex-1 flex items-center justify-center text-white font-bold text-sm rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_6px_rgba(0,0,0,0.4)] active:shadow-[inset_0_3px_5px_rgba(0,0,0,0.5),0_1px_1px_rgba(0,0,0,0.2)] active:translate-y-1 transition-all h-14 bg-gradient-to-b from-[#3a3a3a] to-[#0a0a0a] border border-[#000]";
  
  // Footer confirm/cancel
  const footerBtnClass = "flex-1 flex items-center justify-center rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_6px_rgba(0,0,0,0.4)] active:shadow-[inset_0_3px_5px_rgba(0,0,0,0.5),0_1px_1px_rgba(0,0,0,0.2)] active:translate-y-1 transition-all h-16 bg-gradient-to-b from-[#3a3a3a] to-[#111] border border-[#000]";

  return (
    <div className="min-h-screen bg-[#c8c8c8] flex items-center justify-center p-4 select-none">
      
      {/* Background decoration (similar to the green/teal circles in the reference image) */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-[#006666] -translate-x-16 -translate-y-16 rounded-full opacity-80"></div>
      <div className="absolute top-40 left-0 w-24 h-24 bg-[#006666] -translate-x-12 rounded-full opacity-80"></div>
      
      {/* Main Terminal Box */}
      <div className="w-[450px] bg-[#333] border-4 border-[#1a1a1a] rounded-lg shadow-2xl overflow-hidden relative z-10 flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-b from-[#4a4a4a] to-[#2a2a2a] text-center py-4 border-b border-[#111]">
          <h1 className="text-white text-2xl font-bold tracking-wide">Terminal POS</h1>
        </div>

        {/* Inner Content Padding */}
        <div className="p-4 bg-[#2a2a2a] flex flex-col gap-4">
          
          <h2 className="text-white text-center text-xl font-medium tracking-wide">Introduza o seu PIN</h2>
          
          {/* Input Area */}
          <div className="flex items-center gap-2">
            <span className="text-white font-bold w-12">PIN</span>
            <div className="flex-1 bg-[#555] shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] h-14 rounded border border-[#222] flex items-center px-4 overflow-hidden">
              <span className="text-3xl text-white tracking-[0.5em] mt-2">
                {'*'.repeat(pin.length)}
              </span>
            </div>
            {/* Keyboard Icon Button (Disabled styling) */}
            <button className="w-14 h-14 bg-gradient-to-b from-[#3a3a3a] to-[#1a1a1a] rounded border border-[#111] flex items-center justify-center shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>

          {/* Numpad Grid */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
              <button 
                key={num} 
                className={numBtnClass}
                onClick={() => handleKeyPress(num.toString())}
              >
                {num}
              </button>
            ))}
            <button className={numBtnClass} disabled>.</button>
            <button className={clearBtnClass} onClick={() => handleKeyPress('C')}>C</button>
            <button className={numBtnClass} onClick={() => handleKeyPress('0')}>0</button>
          </div>

          {/* Middle Action Row (Preserved aesthetic from image) */}
          <div className="flex gap-2 mt-2">
            <button className={actionBtnClass}>Restaurante</button>
            <button className={actionBtnClass}>Balcão</button>
            <button className={actionBtnClass}>Take Away</button>
          </div>

          {/* Footer Validation Row */}
          <div className="flex gap-2 mt-2">
            <button className={footerBtnClass} onClick={handleConfirm}>
              {/* Green Tick */}
              <svg className="w-10 h-10 text-[#88ff00]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
              </svg>
            </button>
            <button className={footerBtnClass} onClick={handleCancel}>
              {/* Red Cross */}
              <svg className="w-10 h-10 text-[#ff3333]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default PosLogin;
