import { useState, useRef, useEffect } from 'react';
import { User, LogOut, KeyRound, UserCog } from 'lucide-react';

interface TopbarProps {
  onSelectView?: (view: string) => void;
  userName?: string;
  onChangePassword?: () => void;
  onEditCredentials?: () => void;
  onLogout?: () => void;
}

export default function Topbar({ onSelectView, userName, onChangePassword, onEditCredentials, onLogout }: TopbarProps) {
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
    <div ref={topbarRef} className="flex items-center justify-between bg-[#06333C] text-white h-10 px-4 text-sm font-sans select-none relative z-50">
      <div className="flex items-center space-x-6">
        <div className="flex items-center text-white font-bold text-xl tracking-tight leading-none">
          <div className="flex flex-col items-center">
            <img src="/logo.png" alt="System Mwana Lodge" className="h-6 object-contain filter invert opacity-90" />
            <div className="text-[8px] font-normal text-gray-400 tracking-widest mt-[-2px]">Platform Control Center</div>
          </div>
        </div>
        <div className="flex space-x-2 text-gray-300">
          
          {/* Licensing Menu */}
          <div className="relative">
            <div className={`flex items-center cursor-pointer px-3 py-1 text-sm ${openDropdown === 'LIC' ? 'bg-[#0B4F5C] text-white' : 'hover:bg-[#0B4F5C]'}`} onClick={() => handleMenuClick('LIC')}>
              Licenciamento <span className="text-[#5C8891] text-[8px] ml-1.5">▼</span>
            </div>
            {openDropdown === 'LIC' && (
              <div className="absolute top-full left-0 mt-0 w-48 bg-[#F7FAFA] border border-[#7FA9B1] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
                <div className="px-3 py-1.5 hover:bg-[#F7FAFA] hover:text-black cursor-pointer" onClick={() => handleItemClick('clients')}>Listar Clientes</div>
                <div className="px-3 py-1.5 hover:bg-[#F7FAFA] hover:text-black cursor-pointer" onClick={() => handleItemClick('provisioning')}>Novo Provisionamento</div>
              </div>
            )}
          </div>

        </div>
      </div>
      <div className="flex items-center space-x-3 text-gray-300 text-[11px]">
        <span className="text-[#B0392B] font-semibold">| Admin Console |</span>
        <div className="relative">
          <div
            className={`flex items-center space-x-1 cursor-pointer px-2 py-1 rounded ${openDropdown === 'USR' ? 'bg-[#0B4F5C] text-white' : 'hover:bg-[#0B4F5C]'}`}
            onClick={() => handleMenuClick('USR')}
          >
            <User size={12} />
            <span>{userName || 'utilizador'}</span>
            <span className="text-[#5C8891] text-[8px] ml-1">▼</span>
          </div>
          {openDropdown === 'USR' && (
            <div className="absolute top-full right-0 mt-0 w-52 bg-[#F7FAFA] border border-[#7FA9B1] shadow-[2px_2px_5px_rgba(0,0,0,0.5)] text-gray-800 text-[11px] py-1 z-50">
              <div className="px-3 py-1.5 text-gray-500 border-b border-[#EEF4F5] flex items-center">
                <User size={11} className="mr-2" /> Sessão: <b className="ml-1 text-gray-700">{userName || '—'}</b>
              </div>
              <div
                className="px-3 py-1.5 hover:bg-[#F7FAFA] hover:text-black cursor-pointer flex items-center"
                onClick={() => { setOpenDropdown(null); onEditCredentials && onEditCredentials(); }}
              >
                <UserCog size={11} className="mr-2" /> As minhas credenciais
              </div>
              <div
                className="px-3 py-1.5 hover:bg-[#F7FAFA] hover:text-black cursor-pointer flex items-center"
                onClick={() => { setOpenDropdown(null); onChangePassword && onChangePassword(); }}
              >
                <KeyRound size={11} className="mr-2" /> Alterar palavra-passe
              </div>
              <div
                className="px-3 py-1.5 hover:bg-[#FDECEA] hover:text-[#8C2B1F] cursor-pointer flex items-center text-[#8C2B1F]"
                onClick={() => { setOpenDropdown(null); onLogout && onLogout(); }}
              >
                <LogOut size={11} className="mr-2" /> Terminar sessão
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
