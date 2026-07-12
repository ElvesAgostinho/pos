import React from 'react';

interface ClassicWindowProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  width?: string;
}

export default function ClassicWindow({ children, footer, width }: ClassicWindowProps) {
  return (
    <div className="flex flex-col bg-[#e6e6e6] font-sans text-xs overflow-hidden flex-1 h-full relative"
      style={width ? { maxWidth: width } : undefined}>
      <div className="flex-1 overflow-hidden flex flex-col bg-white border-x border-b border-[#a0a0a0]">
        <div className="flex-1 overflow-auto bg-white relative">
          {children}
        </div>
        {footer && (
          <div className="h-12 bg-[#f0f0f0] border-t border-[#c0c0c0] flex items-center justify-between px-4 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
