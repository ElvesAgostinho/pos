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
      <div className="flex items-center space-x-1 pr-1">
        {userName && (
          <span className="text-[#cfe3ff] text-[11px] mr-2 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#90c040] mr-1.5" /> {userName}
          </span>
        )}
        {onLock && (
          <div
            onClick={onLock}
            title="Bloquear"
            className="w-5 h-4 flex items-center justify-center cursor-pointer text-white hover:bg-[#666]"
          >
            <Lock size={11} />
          </div>
        )}
        {onLogout && (
          <div
            onClick={onLogout}
            title="Terminar sessão"
            className="w-5 h-4 flex items-center justify-center cursor-pointer bg-[#e74c3c] border border-[#c0392b] text-white hover:brightness-110 mr-1"
          >
            <LogOut size={11} />
          </div>
        )}
        <div className="w-5 h-4 flex items-center justify-center cursor-pointer bg-[#f1c40f] border border-[#d4ac0d] hover:brightness-110">
          <div className="w-2 h-[2px] bg-black mb-[-5px]"></div>
        </div>
        <div className="w-5 h-4 flex items-center justify-center cursor-pointer bg-[#f1c40f] border border-[#d4ac0d] hover:brightness-110">
          <div className="w-2 h-2 border border-black"></div>
        </div>
        <div
          onClick={() => onCloseTab(activeView)}
          className="w-5 h-4 flex items-center justify-center cursor-pointer bg-[#e74c3c] border border-[#c0392b] text-white hover:brightness-110"
        >
          <X size={12} strokeWidth={3} />
        </div>
      </div>
    </div>
  );
}
