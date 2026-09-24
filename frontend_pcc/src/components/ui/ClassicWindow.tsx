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
    <div className="flex flex-col bg-[#F7FAFA] font-sans text-xs overflow-hidden flex-1 h-full relative"
      style={width ? { maxWidth: width } : undefined}>
      <div className="flex-1 overflow-hidden flex flex-col bg-white border-x border-b border-[#7FA9B1]">
        <div className="flex-1 overflow-auto bg-white relative">
          {children}
        </div>
        {footer && (
          <div className="h-12 bg-[#F7FAFA] border-t border-[#CFE3E6] flex items-center justify-between px-4 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
