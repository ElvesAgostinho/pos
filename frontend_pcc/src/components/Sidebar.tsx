import { useState } from 'react';

interface SidebarProps {
  activeView?: string;
  onSelectView?: (view: string) => void;
}

export default function Sidebar({ activeView = 'dashboard', onSelectView }: SidebarProps) {
  const [clmOpen, setClmOpen] = useState(true);

  const clmItems = [
    { name: 'Dashboard PCC', id: 'dashboard' },
    { name: 'Gestão de Clientes', id: 'clients' },
    { name: 'Novo Provisionamento', id: 'provisioning' },
    { name: 'Certificação AGT', id: 'agt' },
  ];

  const renderSection = (title: string, items: {name: string, id: string}[], isOpen: boolean, setOpen: (v: boolean) => void) => (
    <div className="mb-0">
      <div 
        className="flex items-center px-2 py-1 bg-[#f0f0f0] border-b border-[#d0d0d0] border-t border-t-[#ffffff] cursor-pointer hover:bg-[#e8e8e8]"
        onClick={() => setOpen(!isOpen)}
      >
        <span className="mr-2 text-gray-500 font-monospace text-xs w-3 text-center">{isOpen ? '-' : '+'}</span>
        <span className="text-[#333333] text-[11px] flex-1 font-medium">{title}</span>
      </div>
      
      {isOpen && (
        <div className="py-0 bg-white">
          {items.map((item) => {
            const isActive = activeView === item.id;
            return (
              <div 
                key={item.id} 
                onClick={() => onSelectView && onSelectView(item.id)}
                className={`flex items-center px-6 py-1 cursor-pointer border-b border-transparent ${isActive ? 'bg-[#cce8ff] border-b-[#99ccff]' : 'hover:bg-[#f5f5f5]'}`}
              >
                <div className="w-1 h-1 rounded-full bg-gray-600 mr-2"></div>
                <span className={isActive ? 'text-black font-medium' : 'text-gray-800'}>{item.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-64 bg-[#f0f0f0] border-r border-[#a0a0a0] flex flex-col text-[11px] font-sans select-none overflow-y-auto">
      {renderSection('Customer Lifecycle Management', clmItems, clmOpen, setClmOpen)}
    </div>
  );
}
