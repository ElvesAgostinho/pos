import { useState } from 'react';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';
import { LayoutGrid } from 'lucide-react';
import { RADIUS } from '../config/theme';

interface SidebarProps {
  activeView?: string;
  onSelectView?: (view: string) => void;
  scopeKey?: string; // módulo atual — mostra APENAS este módulo (isolamento por janela)
}

export default function Sidebar({ activeView = 'home:admin', onSelectView, scopeKey }: SidebarProps) {
  const { data: lic } = useActiveModules();
  const active = lic?.active || [];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // Isolamento: se houver um módulo em foco, mostra só esse (a sua própria janela).
  // Caso contrário, mostra os módulos ATIVOS pela licença.
  const visible = scopeKey
    ? MODULES.filter((m) => m.key === scopeKey)
    : MODULES.filter((m) => moduleEnabled(m.key, active));

  const singleModule = !!scopeKey;

  return (
    <div className="w-60 bg-[#F7FAFA] border-r border-[#7FA9B1] flex flex-col text-[11px] font-sans select-none overflow-y-auto">
      {/* Voltar ao ambiente de trabalho do módulo */}
      <button onClick={() => onSelectView && onSelectView(`home:${scopeKey || 'admin'}`)}
        className="flex items-center gap-2 px-2 py-1.5 m-1.5 mb-1 bg-[#5C8891] text-white hover:bg-[#062A31] transition-colors"
        style={{ borderRadius: RADIUS.sm }}>
        <LayoutGrid size={13} /> <span className="font-bold">Ambiente de trabalho</span>
      </button>

      <div className="px-1.5">
      {visible.map((mod) => {
        // Em modo módulo-único, começa sempre expandido.
        const isOpen = singleModule ? open[mod.key] !== false : !!open[mod.key];
        const hasActive = mod.items.some((i) => i.id === activeView) || activeView === `home:${mod.key}`;
        return (
          <div key={mod.key} className="mb-0.5">
            <div
              className={`flex items-center px-2 py-1.5 cursor-pointer transition-colors ${hasActive ? 'bg-[#EEF4F5]' : 'hover:bg-[#EEF4F5]'}`}
              style={{ borderRadius: RADIUS.sm }}
              onClick={() => { setOpen((o) => ({ ...o, [mod.key]: true })); onSelectView && onSelectView(`home:${mod.key}`); }}
            >
              <span onClick={(e) => { e.stopPropagation(); toggle(mod.key); }}
                className="mr-2 text-gray-500 font-mono text-xs w-3 text-center hover:text-black">{isOpen ? '−' : '+'}</span>
              <span className="text-[#5C8891] text-[11px] flex-1 font-bold">{mod.title}</span>
            </div>

            {isOpen && (
              <div className="bg-white py-0.5">
                {mod.items.map((item) => {
                  const isActive = activeView === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectView && onSelectView(item.id)}
                      className={`flex items-center pl-7 pr-2 py-1 my-[1px] cursor-pointer transition-colors ${isActive ? 'bg-[#CFE3E6]' : 'hover:bg-[#F7FAFA]'}`}
                      style={{ borderRadius: RADIUS.sm }}
                    >
                      <div className="w-1 h-1 rounded-full bg-gray-500 mr-2" />
                      <span className={isActive ? 'text-black font-medium' : 'text-gray-800'}>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
