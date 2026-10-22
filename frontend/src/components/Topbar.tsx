import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';

// Marca do sistema: "ML" (M dourado, L branco).
const Brand = ({ size = 'text-xl' }: { size?: string }) => (
  <span className={`font-black tracking-tight ${size}`}><span className="text-[#111827]">M</span><span className="text-white">L</span></span>
);

// Cor por módulo (usada no ponto do dropdown).
const MOD_COLOR: Record<string, string> = {
  admin: '#3B82F6', licensing: '#3B82F6', security: '#DC2626', hotel: '#3B82F6', masterdata: '#3B82F6',
  commercial: '#1E2A44', srm: '#3B82F6', procurement: '#3B82F6', warehouse: '#3B82F6', hospitality: '#3B82F6',
  pms: '#3B82F6', posmgmt: '#1E2A44', posfront: '#1E2A44', financial: '#3B82F6', fiscal: '#DC2626',
  reporting: '#1E2A44', workflow: '#3B82F6', documents: '#1E2A44', notifications: '#3B82F6',
  integration: '#1E2A44', system: '#3B82F6',
};
const colorOf = (k: string) => MOD_COLOR[k] || '#E6E8EC';

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
    <div className="flex items-center justify-between bg-[#1E2A44] text-white h-11 px-3 text-sm font-sans select-none relative z-50">
      {/* Switcher escondido no NOME DO SISTEMA */}
      <div ref={ref} className="relative">
        <button onClick={() => licensed.length > 1 && setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1E2A44]">
          <Brand />
          <span className="text-gray-400 text-xs font-medium hidden sm:inline">{current?.title.replace(/^\d+\s·\s/, '')}</span>
          {licensed.length > 1 && <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {open && (
          <div className="absolute left-0 top-11 bg-[#1E2A44] border border-[#1E2A44] min-w-[280px] shadow-2xl py-1 z-50 max-h-[70vh] overflow-auto">
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[#1E2A44]"><Brand size="text-base" /><span className="text-[11.5px] uppercase tracking-widest text-gray-500">Os seus módulos</span></div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => switchTo(m.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[#1E2A44] ${m.key === moduleKey ? 'bg-[#1E2A44]' : ''}`}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(m.key) }} />
                <span className="text-gray-200 text-sm text-left flex-1">{m.title.replace(/^\d+\s·\s/, '')}</span>
                {m.key === moduleKey && <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-gray-300 text-[12.5px]">
        <span className="text-[#DC2626] font-semibold">{dateStr}</span>
        <div className="flex items-center gap-1"><User size={13} /><span>{lic ? 'online' : ''}</span></div>
      </div>
    </div>
  );
}
