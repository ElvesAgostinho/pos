import React, { useState, useRef, useEffect } from 'react';
import { User } from 'lucide-react';

interface TopbarProps {
  onSelectView?: (view: string) => void;
}

export default function Topbar({ onSelectView }: TopbarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const topbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (topbarRef.current && !topbarRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menu: string) => {
    setOpenDropdown(openDropdown === menu ? null : menu);
  };

  const handleItemClick = (view: string) => {
    if (onSelectView) {
      onSelectView(view);
    }
    setOpenDropdown(null);
  };

  return (
    <div ref={topbarRef} className="flex items-center justify-between bg-[#333333] text-white h-10 px-4 text-sm font-sans select-none relative z-50">
      <div className="flex items-center space-x-6">
        <div className="flex items-center text-white font-bold text-xl tracking-tight leading-none">
          <div className="flex flex-col items-center">
            <img src="/logo.png" alt="System Mwana Lodge" className="h-6 object-contain filter invert opacity-90" />
          </div>
        </div>
        <div className="flex space-x-2 text-gray-300">
          
          {/* F&B Menu */}
          <div className="relative">
            <div className={`flex items-center cursor-pointer px-3 py-1 text-sm ${openDropdown === 'FB' ? 'bg-[#555] text-white' : 'hover:bg-[#444]'}`} onClick={() => handleMenuClick('FB')}>
              F&B <span className="text-[#f1c40f] text-[8px] ml-1.5">▼</span>
            </div>
            {openDropdown === 'FB' && (
              <div className="absolute top-full left-0 mt-0 w-48 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('pos_terminal')}>Terminal POS (Frente de Loja)</div>
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('outlets')}>Gestão de Outlets</div>
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('operation_config')}>Motor de Operação</div>
              </div>
            )}
          </div>

          {/* Marketing Menu */}
          <div className="relative">
            <div className={`flex items-center cursor-pointer px-3 py-1 text-sm ${openDropdown === 'MKT' ? 'bg-[#555] text-white' : 'hover:bg-[#444]'}`} onClick={() => handleMenuClick('MKT')}>
              Marketing
            </div>
            {openDropdown === 'MKT' && (
              <div className="absolute top-full left-0 mt-0 w-48 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
                <div className="px-3 py-1.5 text-gray-500 italic">Módulo em Breve</div>
              </div>
            )}
          </div>

          {/* Reporting Menu */}
          <div className="relative">
            <div className={`flex items-center cursor-pointer px-3 py-1 text-sm ${openDropdown === 'REP' ? 'bg-[#555] text-white' : 'hover:bg-[#444]'}`} onClick={() => handleMenuClick('REP')}>
              Reporting <span className="text-[#f1c40f] text-[8px] ml-1.5">▼</span>
            </div>
            {openDropdown === 'REP' && (
              <div className="absolute top-full left-0 mt-0 w-48 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('reports_sales')}>Vendas Diárias</div>
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('reports_stock')}>Stock Atual (WMS)</div>
              </div>
            )}
          </div>

          {/* Utilitários Menu */}
          <div className="relative">
            <div className={`flex items-center cursor-pointer px-3 py-1 text-sm ${openDropdown === 'UTL' ? 'bg-[#555] text-white' : 'hover:bg-[#444]'}`} onClick={() => handleMenuClick('UTL')}>
              Utilitários <span className="text-[#f1c40f] text-[8px] ml-1.5">▼</span>
            </div>
            {openDropdown === 'UTL' && (
              <div className="absolute top-full left-0 mt-0 w-48 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('edc_inbox')}>EDC - Caixa de Entrada</div>
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('settings')}>Configurações do Sistema</div>
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer">Terminar Sessão</div>
              </div>
            )}
          </div>

        </div>
      </div>
      <div className="flex items-center space-x-3 text-gray-300 text-[11px]">
        <span className="text-red-400 font-semibold">| Qui 10 Abr 2025 |</span>
        <div className="flex items-center space-x-1">
          <User size={12} />
          <span>hhs</span>
        </div>
      </div>
    </div>
  );
}
