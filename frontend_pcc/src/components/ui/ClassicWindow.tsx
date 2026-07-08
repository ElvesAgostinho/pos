import React, { useState, useContext } from 'react';
import { X, Wrench } from 'lucide-react';
import { TabContext } from '../MainContent';

interface ClassicWindowProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
}

export default function ClassicWindow({ title, icon, children, onClose, footer }: ClassicWindowProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const tabContext = useContext(TabContext);

  const handleClose = () => {
    if (onClose) onClose();
    else if (tabContext?.onClose) tabContext.onClose();
  };

  return (
    <div className={`flex flex-col bg-[#e6e6e6] font-sans text-xs overflow-hidden ${
      isMaximized ? 'fixed inset-0 z-[100]' : 'flex-1 h-full relative'
    }`}>

      {/* Content Area */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden flex flex-col bg-white border-x border-b border-[#a0a0a0]">
          <div className="flex-1 overflow-auto bg-white relative">
            {children}
          </div>
          
          {/* Footer Toolbar */}
          {footer && (
            <div className="h-12 bg-[#f0f0f0] border-t border-[#c0c0c0] flex items-center justify-between px-4 flex-shrink-0">
               {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
