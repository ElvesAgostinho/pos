import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ClassicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  iconColor?: string;
  label?: string;
}

export default function ClassicButton({ icon: Icon, iconColor = 'text-gray-700', label, children, className = '', ...props }: ClassicButtonProps) {
  const raised = 'linear-gradient(to bottom, #fdfdfd 0%, #eceef1 48%, #dde1e6 52%, #cfd4da 100%)';
  return (
    <button
      className={`flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-semibold text-[#2a3543] focus:outline-none focus:ring-1 focus:ring-[#1e3f66] transition-none ${props.disabled ? 'opacity-45 cursor-not-allowed' : 'active:translate-y-px'} ${className}`}
      style={{
        background: raised, borderColor: '#7f8b9b',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.18)',
        ...(props.style || {}),
      }}
      {...props}
    >
      {Icon && (
        <div className="flex items-center justify-center rounded-[3px] border border-[#adb5c0] w-[19px] h-[19px]" style={{ background: 'linear-gradient(to bottom, #fff, #e6e9ed)', boxShadow: 'inset 0 1px 0 #fff' }}>
          <Icon size={12} className={iconColor} strokeWidth={2} />
        </div>
      )}
      <span>{label ?? children}</span>
    </button>
  );
}
