import React, { useState, useRef, useEffect } from 'react';
import { Settings, X, Lock, FileText, ChevronDown } from 'lucide-react';

interface TabsBarProps {
  openTabs: string[];
  activeView: string;
  onSelectTab: (view: string) => void;
  onCloseTab: (view: string) => void;
  viewMetadata: Record<string, { title: string; icon: any }>;
  onLock?: () => void;
  onToggleNotes?: () => void;
  onCloseAllTabs?: () => void;
}

export default function TabsBar({ openTabs, activeView, onSelectTab, onCloseTab, viewMetadata, onLock, onToggleNotes, onCloseAllTabs }: TabsBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeMeta = viewMetadata[activeView] || { title: activeView, icon: Settings };
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="flex items-center justify-between bg-[#4d4d4d] h-7 px-2 select-none border-b border-[#333]">
      
      {/* Window Title */}
      <div className="flex items-center text-white text-[12px] font-medium">
        <ActiveIcon size={14} className="mr-2" />
        {activeMeta.title}
      </div>

      {/* Window Controls (Classic Windows style) */}
      <div className="flex items-center space-x-1">
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
