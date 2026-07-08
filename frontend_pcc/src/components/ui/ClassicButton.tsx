import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ClassicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  iconColor?: string;
  label: string;
}

export default function ClassicButton({ icon: Icon, iconColor = 'text-gray-700', label, className = '', ...props }: ClassicButtonProps) {
  return (
    <button 
      className={`flex items-center space-x-1.5 px-3 py-1.5 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[inset_1px_1px_0px_#ffffff] text-[11px] font-sans focus:outline-none focus:ring-1 focus:ring-black ${props.disabled ? 'opacity-50 cursor-not-allowed text-gray-500' : 'hover:bg-[#e8e8e8] active:bg-[#d0d0d0] active:shadow-[inset_1px_1px_2px_rgba(0,0,0,0.2)] text-gray-800'} ${className}`}
      {...props}
    >
      {Icon && (
        <div className="flex items-center justify-center bg-white rounded-full border border-gray-300 w-5 h-5 shadow-sm">
           <Icon size={12} className={iconColor} />
        </div>
      )}
      <span>{label}</span>
    </button>
  );
}
