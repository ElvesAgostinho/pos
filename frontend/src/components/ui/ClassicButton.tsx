import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TOKENS } from '../../config/theme';

interface ClassicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  iconColor?: string;
  label?: string;
}

/**
 * O BOTÃO das barras de ferramentas — um só, usado por meia centena de ecrãs.
 *
 * ─── O QUE TINHA, E PORQUE SAIU ───────────────────────────────────────────
 * Três coisas empilhadas a pedir atenção: uma moldura AZUL (a cor da marca, à
 * volta de um botão que não é a acção principal de nada), um relevo feito de
 * três sombras interiores, e o ícone metido DENTRO DE UMA CAIXINHA própria —
 * um botão dentro de um botão. Ao lado de uma grelha de linhas finas e de um
 * ribbon plano, era o objecto mais desenhado do ecrã, e o que menos tinha para
 * dizer.
 *
 * Fica o que um botão de barra precisa: uma superfície clara, uma linha de 1px
 * à volta, o ícone na sua cor e a palavra. O realce de quem passa por cima é
 * âmbar, a mesma convenção do ribbon e das grelhas — âmbar é "o rato está
 * aqui", azul é "isto está escolhido". Duas coisas diferentes, duas cores.
 *
 * `iconColor` continua aceite porque meia centena de chamadas o passam; agora
 * só se aplica quando é uma classe de cor (os ecrãs passam `text-...`).
 */
export default function ClassicButton({
  icon: Icon, iconColor = 'text-[#4A6B8A]', label, children, className = '', ...props
}: ClassicButtonProps) {
  const repouso = 'linear-gradient(to bottom, #FDFDFD, #EDEDED)';
  return (
    <button
      className={`flex items-center gap-1.5 px-2.5 h-[22px] text-[11.5px] font-semibold flex-shrink-0 ${
        props.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
      style={{
        background: repouso,
        border: `1px solid ${TOKENS.chromeLine}`,
        borderRadius: 0,
        color: TOKENS.textOnLight,
        ...(props.style || {}),
      }}
      onMouseEnter={(e) => {
        if (props.disabled) return;
        e.currentTarget.style.background = TOKENS.hoverGold;
        e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = repouso;
        e.currentTarget.style.borderColor = TOKENS.chromeLine;
      }}
      {...props}
    >
      {Icon && <Icon size={13} className={iconColor} strokeWidth={2} />}
      <span>{label ?? children}</span>
    </button>
  );
}
