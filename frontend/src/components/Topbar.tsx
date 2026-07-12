import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';

// Marca do sistema: "ML" (M dourado, L branco).
const Brand = ({ size = 'text-xl' }: { size?: string }) => (
  <span className={`font-black tracking-tight ${size}`}><span className="text-[#c9a400]">M</span><span className="text-white">L</span></span>
);

// Cor por módulo (usada no ponto do dropdown).
const MOD_COLOR: Record<string, string> = {
  admin: '#9aa7b7', licensing: '#7f8c8d', security: '#e74c3c', hotel: '#27ae60', masterdata: '#3498db',
  commercial: '#16a085', srm: '#9b59b6', procurement: '#e67e22', warehouse: '#a0522d', hospitality: '#f39c12',
  pms: '#2980b9', posmgmt: '#c9a400', posfront: '#c9a400', financial: '#2ecc71', fiscal: '#c0392b',
  reporting: '#34495e', workflow: '#8e44ad', documents: '#16a085', notifications: '#e84393',
  integration: '#00838f', system: '#607d8b',
};
const colorOf = (k: string) => MOD_COLOR[k] || '#bbbbbb';

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
    <div className="flex items-center justify-between bg-[#1b1b1b] text-white h-11 px-3 text-sm font-sans select-none relative z-50">
      {/* Switcher escondido no NOME DO SISTEMA */}
      <div ref={ref} className="relative">
        <button onClick={() => licensed.length > 1 && setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2a2a2a]">
          <Brand />
          <span className="text-gray-400 text-xs font-medium hidden sm:inline">{current?.title.replace(/^\d+\s·\s/, '')}</span>
          {licensed.length > 1 && <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {open && (
          <div className="absolute left-0 top-11 bg-[#111] border border-[#333] min-w-[280px] shadow-2xl py-1 z-50 max-h-[70vh] overflow-auto">
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[#2a2a2a]"><Brand size="text-base" /><span className="text-[10px] uppercase tracking-widest text-gray-500">Os seus módulos</span></div>
            {licensed.map((m) => (
              <button key={m.key} onClick={() => switchTo(m.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[#222] ${m.key === moduleKey ? 'bg-[#1e1e1e]' : ''}`}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(m.key) }} />
                <span className="text-gray-200 text-sm text-left flex-1">{m.title.replace(/^\d+\s·\s/, '')}</span>
                {m.key === moduleKey && <span className="w-2 h-2 rounded-full bg-[#3fd23f]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-gray-300 text-[11px]">
        <span className="text-[#e05555] font-semibold">{dateStr}</span>
        <div className="flex items-center gap-1"><User size={13} /><span>{lic ? 'online' : ''}</span></div>
      </div>
    </div>
  );
}
