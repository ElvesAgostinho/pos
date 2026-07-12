import { Settings } from 'lucide-react';

interface StatusBarProps {
  openTabs?: string[];
  activeView?: string;
  onSelectTab?: (view: string) => void;
  viewMetadata?: Record<string, { title: string; icon: any }>;
}

export default function StatusBar({ openTabs = [], activeView = '', onSelectTab, viewMetadata = {} }: StatusBarProps) {
  return (
    <div className="bg-[#2d2d2d] text-[#b0b0b0] h-7 flex items-center justify-between px-2 text-[10px] select-none border-t border-black">
      
      {/* Left side: Taskbar tabs */}
      <div className="flex items-center h-full space-x-0.5">
        {openTabs.map(tab => {
          const isActive = activeView === tab;
          const meta = viewMetadata[tab] || { title: tab, icon: Settings };
          const Icon = meta.icon;

          return (
            <div 
              key={tab}
              onClick={() => onSelectTab && onSelectTab(tab)}
              className={`flex items-center px-2 py-1 h-full max-w-[150px] cursor-pointer hover:bg-[#404040] border-t-2 ${
                isActive 
                  ? 'bg-[#404040] text-white border-white' 
                  : 'bg-transparent text-gray-400 border-transparent'
              }`}
            >
              <Icon size={12} className="mr-1.5 flex-shrink-0" />
              <span className="truncate">{meta.title}</span>
            </div>
          );
        })}
      </div>

      {/* Right side: System info */}
      <div className="flex items-center flex-shrink-0">
        <span>
          System Mwana Lodge PCC v1.0 | Platform Control Center |
        </span>
        <span className="ml-1 bg-white text-black px-1 font-bold">HQ</span>
      </div>
    </div>
  );
}
