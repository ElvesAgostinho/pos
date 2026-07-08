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
      <div className="flex items-center space-x-1 pr-1">
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
