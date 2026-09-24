import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';

// Marca do sistema: "ML" (M dourado, L branco).
const Brand = ({ size = 'text-xl' }: { size?: string }) => (
  <span className={`font-black tracking-tight ${size}`}><span className="text-[#0B4F5C]">M</span><span className="text-white">L</span></span>
);

// Cor por módulo (usada no ponto do dropdown).
const MOD_COLOR: Record<string, string> = {
  admin: '#7FA9B1', licensing: '#5C8891', security: '#B0392B', hotel: '#5C8891', masterdata: '#5C8891',
  commercial: '#0B4F5C', srm: '#5C8891', procurement: '#5C8891', warehouse: '#5C8891', hospitality: '#5C8891',
  pms: '#5C8891', posmgmt: '#0B4F5C', posfront: '#0B4F5C', financial: '#5C8891', fiscal: '#B0392B',
  reporting: '#0B4F5C', workflow: '#5C8891', documents: '#0B4F5C', notifications: '#7FA9B1',
  integration: '#0B4F5C', system: '#5C8891',
};
const colorOf = (k: string) => MOD_COLOR[k] || '#CFE3E6';

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
    <div className="flex items-center justify-between bg-[#062A31] text-white h-11 px-3 text-sm font-sans select-none relative z-50">
      {/* Switcher escondido no NOME DO SISTEMA */}
      <div ref={ref} className="relative">
        <button onClick={() => licensed.length > 1 && setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#06333C]">
          <Brand />
          <span className="text-gray-400 text-xs font-medium hidden sm:inline">{current?.title.replace(/^\d+\s·\s/, '')}</span>
          {licensed.length > 1 && <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {open && (
          <div className="absolute left-0 top-11 bg-[#062A31] border border-[#06333C] min-w-[280px] shadow-2xl py-1 z-50 max-h-[70vh] overflow-auto">
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[#06333C]"><Brand size="text-base" /><span className="text-[10px] uppercase tracking-widest text-gray-500">Os seus módulos</span></div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => switchTo(m.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[#06333C] ${m.key === moduleKey ? 'bg-[#062A31]' : ''}`}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(m.key) }} />
                <span className="text-gray-200 text-sm text-left flex-1">{m.title.replace(/^\d+\s·\s/, '')}</span>
                {m.key === moduleKey && <span className="w-2 h-2 rounded-full bg-[#5C8891]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-gray-300 text-[11px]">
        <span className="text-[#B0392B] font-semibold">{dateStr}</span>
        <div className="flex items-center gap-1"><User size={13} /><span>{lic ? 'online' : ''}</span></div>
      </div>
    </div>
  );
}
