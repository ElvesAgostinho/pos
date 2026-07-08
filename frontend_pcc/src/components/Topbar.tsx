import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut } from 'lucide-react';

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
            <img src="/logo.png" alt="10i Host" className="h-6 object-contain filter invert opacity-90" />
            <div className="text-[8px] font-normal text-gray-400 tracking-widest mt-[-2px]">Platform Control Center</div>
          </div>
        </div>
        <div className="flex space-x-2 text-gray-300">
          
          {/* Licensing Menu */}
          <div className="relative">
            <div className={`flex items-center cursor-pointer px-3 py-1 text-sm ${openDropdown === 'LIC' ? 'bg-[#555] text-white' : 'hover:bg-[#444]'}`} onClick={() => handleMenuClick('LIC')}>
              Licenciamento <span className="text-[#f1c40f] text-[8px] ml-1.5">▼</span>
            </div>
            {openDropdown === 'LIC' && (
              <div className="absolute top-full left-0 mt-0 w-48 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('clients')}>Listar Clientes</div>
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer" onClick={() => handleItemClick('provisioning')}>Novo Provisionamento</div>
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
                <div className="px-3 py-1.5 hover:bg-[#cce8ff] hover:text-black cursor-pointer">Configurações Base</div>
              </div>
            )}
          </div>

        </div>
      </div>
      <div className="flex items-center space-x-3 text-gray-300 text-[11px]">
        <span className="text-red-400 font-semibold">| Admin Console |</span>
        <div className="flex items-center space-x-1">
          <User size={12} />
          <span>system_admin</span>
        </div>
      </div>
    </div>
  );
}
