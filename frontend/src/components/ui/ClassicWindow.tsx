import React from 'react';
import { accentGradient, RADIUS, SHADOW } from '../../config/theme';

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
      className="flex flex-col bg-[#F7FAFA] font-sans text-xs overflow-hidden flex-1 h-full relative"
      style={width ? { maxWidth: width, borderRadius: RADIUS.lg, boxShadow: SHADOW.panel } : undefined}
    >
      {/* Barra de título */}
      {title && (
        <div
          className="h-9 flex items-center justify-between px-3.5 flex-shrink-0 text-white select-none"
          style={{ background: accentGradient(), borderTopLeftRadius: width ? RADIUS.lg : 0, borderTopRightRadius: width ? RADIUS.lg : 0 }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <span className="font-bold text-[12px] tracking-tight truncate">{title}</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center bg-white/10 hover:bg-[#B0392B] text-white text-[13px] leading-none transition-colors" style={{ borderRadius: RADIUS.sm }}>×</button>
          )}
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white"
        style={width ? { borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg } : undefined}>
        <div className="flex-1 overflow-auto bg-white relative">
          {children}
        </div>

        {/* Barra de estado / ações */}
        {footer && (
          <div className="min-h-[44px] bg-[#F7FAFA] border-t border-[#EEF4F5] flex items-center justify-between px-4 py-1.5 flex-shrink-0 gap-2"
            style={width ? { borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg } : undefined}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
