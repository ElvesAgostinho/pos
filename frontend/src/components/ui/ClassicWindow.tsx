import React from 'react';
import { TOKENS, RADIUS, SHADOW } from '../../config/theme';

interface ClassicWindowProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  width?: string;
}

/**
 * Janela clássica — barra de título, corpo e barra de estado. Dá a 75 ecrãs a
 * mesma moldura sem cada um a ter de desenhar.
 *
 * ─── PORQUE É QUE A BARRA DEIXOU DE SER AZUL ──────────────────────────────
 * Era uma faixa de 36 pixéis na cor da marca, com o título a branco a 14px.
 * Vista sozinha não ofendia; vista a seguir ao ribbon e aos separadores — que
 * são cinzentos — ficava a terceira barra colorida empilhada no topo do mesmo
 * ecrã, e a mais gritante das três. O olho ia para ela, que é o sítio onde não
 * está nada: o título de um ecrã é a informação menos útil de um ecrã, porque
 * quem lá chegou já sabe onde está.
 *
 * Passa a uma tira de 24px no cinzento da moldura, com o nome em escuro. São 12
 * pixéis devolvidos ao conteúdo em cada um dos 75 ecrãs, e a cor volta a querer
 * dizer alguma coisa: no ecrã inteiro, o que está colorido são os ícones e os
 * estados.
 *
 * O mesmo para a barra de baixo — tinha 52 pixéis de altura mínima para mostrar
 * uma linha de texto.
 */
export default function ClassicWindow({ title, icon, children, footer, width, onClose }: ClassicWindowProps) {
  // O ÍCONE VINHA PINTADO PARA O FUNDO AZUL. Quase todos os ecrãs passam-no com
  // `className="text-gray-300"`, que sobre o cinzento claro desaparece. Em vez
  // de ir corrigir 75 ficheiros — e deixar um por corrigir —, a cor é imposta
  // aqui, que é onde se sabe qual é o fundo.
  const icone = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<any>, { className: 'flex-shrink-0', color: '#2F6FB5' })
    : icon;

  return (
    <div
      className="flex flex-col font-sans text-xs overflow-hidden flex-1 h-full relative"
      style={{
        background: TOKENS.chrome,
        ...(width ? { maxWidth: width, borderRadius: RADIUS.lg, boxShadow: SHADOW.panel } : {}),
      }}
    >
      {/* Barra de título */}
      {title && (
        <div
          className="h-[24px] flex items-center justify-between px-2 flex-shrink-0 select-none border-b"
          style={{
            background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)',
            borderColor: TOKENS.chromeLine,
            color: TOKENS.textOnLight,
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {icone}
            <span className="font-bold text-[12px] truncate">{title}</span>
          </div>
          {onClose && (
            <button onClick={onClose} title="Fechar"
              className="w-[18px] h-[18px] flex items-center justify-center text-[14px] leading-none hover:bg-[#DC2626] hover:text-white"
              style={{ color: TOKENS.textMuted }}>×</button>
          )}
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 overflow-auto bg-white relative">
          {children}
        </div>

        {/* Barra de estado / ações */}
        {footer && (
          <div className="h-[24px] flex items-center justify-between px-2 flex-shrink-0 gap-2 text-[11.5px] border-t"
            style={{ background: 'linear-gradient(to bottom, #FDFDFD, #F0F0F0)', borderColor: TOKENS.chromeLine }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
