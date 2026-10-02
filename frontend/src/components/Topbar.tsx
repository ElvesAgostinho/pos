import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';

// Marca do sistema: "ML" (M dourado, L branco).
const Brand = ({ size = 'text-xl' }: { size?: string }) => (
  <span className={`font-black tracking-tight ${size}`}><span className="text-[#1A1D21]">M</span><span className="text-white">L</span></span>
);

// Cor por módulo (usada no ponto do dropdown).
const MOD_COLOR: Record<string, string> = {
  admin: '#2E75B6', licensing: '#2E75B6', security: '#B42318', hotel: '#2E75B6', masterdata: '#2E75B6',
  commercial: '#17375E', srm: '#2E75B6', procurement: '#2E75B6', warehouse: '#2E75B6', hospitality: '#2E75B6',
  pms: '#2E75B6', posmgmt: '#17375E', posfront: '#17375E', financial: '#2E75B6', fiscal: '#B42318',
  reporting: '#17375E', workflow: '#2E75B6', documents: '#17375E', notifications: '#2E75B6',
  integration: '#17375E', system: '#2E75B6',
};
const colorOf = (k: string) => MOD_COLOR[k] || '#D7DBDF';

interface TopbarProps {
  onSelectView?: (view: string) => void;
  moduleKey?: string;
}

export default function Topbar({ onSelectView, moduleKey = 'admin' }: TopbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: lic } = useActiveModules();
  const active = lic?.active || [];
  const licensed = MODULES.filter((m) => moduleEnabled(m.key, active));
  const current = MODULES.find((m) => m.key === moduleKey);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const switchTo = (k: string) => { onSelectView && onSelectView(`home:${k}`); setOpen(false); };

  return (
    <div className="flex items-center justify-between bg-[#17375E] text-white h-11 px-3 text-sm font-sans select-none relative z-50">
      {/* Switcher escondido no NOME DO SISTEMA */}
      <div ref={ref} className="relative">
        <button onClick={() => licensed.length > 1 && setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#17375E]">
          <Brand />
          <span className="text-gray-400 text-xs font-medium hidden sm:inline">{current?.title.replace(/^\d+\s·\s/, '')}</span>
          {licensed.length > 1 && <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {open && (
          <div className="absolute left-0 top-11 bg-[#17375E] border border-[#17375E] min-w-[280px] shadow-2xl py-1 z-50 max-h-[70vh] overflow-auto">
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[#17375E]"><Brand size="text-base" /><span className="text-[10px] uppercase tracking-widest text-gray-500">Os seus módulos</span></div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => switchTo(m.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[#17375E] ${m.key === moduleKey ? 'bg-[#17375E]' : ''}`}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(m.key) }} />
                <span className="text-gray-200 text-sm text-left flex-1">{m.title.replace(/^\d+\s·\s/, '')}</span>
                {m.key === moduleKey && <span className="w-2 h-2 rounded-full bg-[#2E75B6]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-gray-300 text-[11px]">
        <span className="text-[#B42318] font-semibold">{dateStr}</span>
        <div className="flex items-center gap-1"><User size={13} /><span>{lic ? 'online' : ''}</span></div>
      </div>
    </div>
  );
}
