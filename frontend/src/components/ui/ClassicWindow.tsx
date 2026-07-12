import React from 'react';

interface ClassicWindowProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  width?: string;
}

/**
 * Janela clássica empresarial — barra de título enquadrada (ícone + título),
 * corpo e barra de estado. Dá a TODOS os ecrãs o aspeto sólido/enquadrado
 * (estilo Primavera/PHC/Office) sem cada ecrã ter de o desenhar.
 */
export default function ClassicWindow({ title, icon, children, footer, width, onClose }: ClassicWindowProps) {
  return (
    <div
      className="flex flex-col bg-[#e6e6e6] font-sans text-xs overflow-hidden flex-1 h-full relative"
      style={width ? { maxWidth: width } : undefined}
    >
      {/* Barra de título */}
      {title && (
        <div
          className="h-8 flex items-center justify-between px-3 flex-shrink-0 border border-b-0 border-[#2a4a66] text-white select-none"
          style={{ background: 'linear-gradient(to bottom, #2a5488 0%, #1e3f66 55%, #183453 100%)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <span className="font-bold text-[12px] tracking-tight truncate drop-shadow-sm">{title}</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="w-5 h-5 flex items-center justify-center bg-white/10 hover:bg-[#c0392b] rounded-sm text-white text-[13px] leading-none">×</button>
          )}
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white border-x border-b border-[#8fa4bb] shadow-[inset_0_1px_0_#fff]">
        <div className="flex-1 overflow-auto bg-white relative">
          {children}
        </div>

        {/* Barra de estado / ações */}
        {footer && (
          <div className="min-h-[40px] bg-gradient-to-b from-[#f4f4f4] to-[#e8e8e8] border-t border-[#c0c0c0] flex items-center justify-between px-4 py-1.5 flex-shrink-0 gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
