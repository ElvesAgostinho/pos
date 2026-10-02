import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';

// Marca do sistema: "ML" (M dourado, L branco).
const Brand = ({ size = 'text-xl' }: { size?: string }) => (
  <span className={`font-black tracking-tight ${size}`}><span className="text-[#1F292C]">M</span><span className="text-white">L</span></span>
);

// Cor por módulo (usada no ponto do dropdown).
const MOD_COLOR: Record<string, string> = {
  admin: '#4B858E', licensing: '#4B858E', security: '#C94A4A', hotel: '#4B858E', masterdata: '#4B858E',
  commercial: '#062F35', srm: '#4B858E', procurement: '#4B858E', warehouse: '#4B858E', hospitality: '#4B858E',
  pms: '#4B858E', posmgmt: '#062F35', posfront: '#062F35', financial: '#4B858E', fiscal: '#C94A4A',
  reporting: '#062F35', workflow: '#4B858E', documents: '#062F35', notifications: '#4B858E',
  integration: '#062F35', system: '#4B858E',
};
const colorOf = (k: string) => MOD_COLOR[k] || '#C8D2D5';

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
    <div className="flex items-center justify-between bg-[#062F35] text-white h-11 px-3 text-sm font-sans select-none relative z-50">
      {/* Switcher escondido no NOME DO SISTEMA */}
      <div ref={ref} className="relative">
        <button onClick={() => licensed.length > 1 && setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#062F35]">
          <Brand />
          <span className="text-gray-400 text-xs font-medium hidden sm:inline">{current?.title.replace(/^\d+\s·\s/, '')}</span>
          {licensed.length > 1 && <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {open && (
          <div className="absolute left-0 top-11 bg-[#062F35] border border-[#062F35] min-w-[280px] shadow-2xl py-1 z-50 max-h-[70vh] overflow-auto">
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[#062F35]"><Brand size="text-base" /><span className="text-[10px] uppercase tracking-widest text-gray-500">Os seus módulos</span></div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => switchTo(m.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[#062F35] ${m.key === moduleKey ? 'bg-[#062F35]' : ''}`}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(m.key) }} />
                <span className="text-gray-200 text-sm text-left flex-1">{m.title.replace(/^\d+\s·\s/, '')}</span>
                {m.key === moduleKey && <span className="w-2 h-2 rounded-full bg-[#4B858E]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-gray-300 text-[11px]">
        <span className="text-[#C94A4A] font-semibold">{dateStr}</span>
        <div className="flex items-center gap-1"><User size={13} /><span>{lic ? 'online' : ''}</span></div>
      </div>
    </div>
  );
}
