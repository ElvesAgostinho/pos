import { Settings, X, Lock, LogOut } from 'lucide-react';

interface TabsBarProps {
  openTabs: string[];
  activeView: string;
  onSelectTab: (view: string) => void;
  onCloseTab: (view: string) => void;
  viewMetadata: Record<string, { title: string; icon: any }>;
  onLock?: () => void;
  onToggleNotes?: () => void;
  onCloseAllTabs?: () => void;
  onLogout?: () => void;
  userName?: string;
}

export default function TabsBar({ activeView, onCloseTab, viewMetadata, onLock, onLogout, userName }: TabsBarProps) {
  const activeMeta = viewMetadata[activeView] || { title: activeView, icon: Settings };
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="flex items-center justify-between bg-[#4d4d4d] h-7 px-2 select-none border-b border-[#333]">

      {/* Window Title */}
      <div className="flex items-center text-white text-[12px] font-medium">
        <ActiveIcon size={14} className="mr-2" />
        {activeMeta.title}
      </div>

      {/* Sessão + Window Controls (Classic Windows style) */}
      <div className="flex items-center space-x-1">
        {userName && (
          <span className="text-[#cfe3ff] text-[11px] mr-2 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#88ff00] mr-1.5" /> {userName}
          </span>
        )}
        {onLock && (
          <div
            onClick={onLock}
            title="Bloquear ecrã"
            className="w-5 h-5 flex items-center justify-center hover:bg-[#666] cursor-pointer text-white"
          >
            <Lock size={12} />
          </div>
        )}
        {onLogout && (
          <div
            onClick={onLogout}
            title="Terminar sessão"
            className="w-5 h-5 flex items-center justify-center hover:bg-red-600 cursor-pointer text-white mr-1"
          >
            <LogOut size={12} />
          </div>
        )}
        <div className="w-5 h-5 flex items-center justify-center hover:bg-[#666] cursor-pointer text-white">
          <div className="w-2.5 h-0.5 bg-white mb-[-8px]"></div>
        </div>
        <div className="w-5 h-5 flex items-center justify-center hover:bg-[#666] cursor-pointer text-white">
          <div className="w-2.5 h-2.5 border border-white"></div>
        </div>
        <div
          onClick={() => onCloseTab(activeView)}
          className="w-5 h-5 flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer text-[#ffaaaa]"
        >
          <X size={12} strokeWidth={3} />
        </div>
      </div>
    </div>
  );
}
