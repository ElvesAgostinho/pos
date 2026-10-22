import { useRef } from 'react';

/**
 * DIVISOR ARRASTÁVEL — a linha entre dois blocos que se pode puxar.
 *
 * Nasce de um problema concreto: no editor de grupos de utilizadores, o
 * formulário em cima ocupava o espaço que precisasse e a lista de permissões
 * em baixo ficava com a altura que sobrasse — às vezes uma linha. Dava para
 * deslocar, mas ver UMA permissão de cada vez para marcar dezenas não é
 * trabalho que alguém queira fazer.
 *
 * Em vez de escolher eu uma altura fixa (que estaria errada para metade dos
 * ecrãs e dos monitores), fica a decisão com quem está a trabalhar: puxa-se a
 * linha e cada um dá ao bloco de baixo o espaço que precisa.
 *
 * `onMove` recebe a variação em píxeis desde o último movimento; quem usa
 * decide o que fazer com ela e onde estão os limites — este componente não
 * sabe nada sobre o conteúdo que separa.
 */
export default function Divisor({ onMove, titulo = 'Arraste para redimensionar' }: {
  onMove: (delta: number) => void;
  titulo?: string;
}) {
  const ultimo = useRef(0);

  const agarrar = (e: React.MouseEvent) => {
    e.preventDefault();
    ultimo.current = e.clientY;

    const mover = (ev: MouseEvent) => {
      onMove(ev.clientY - ultimo.current);
      ultimo.current = ev.clientY;
    };
    const largar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', largar);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    // O cursor e a selecção ficam travados DURANTE o arrasto: sem isto, o
    // ponteiro muda de forma ao sair da linha e o rato acaba a seleccionar
    // texto do formulário enquanto se puxa.
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', largar);
  };

  return (
    <div onMouseDown={agarrar} title={titulo}
      className="h-[9px] flex-shrink-0 flex items-center justify-center cursor-row-resize
                 bg-[#EEF1F5] hover:bg-[#DBEAFE] transition-colors group">
      {/* A pega: três traços curtos, como nas janelas que se redimensionam.
          Sem marca nenhuma, ninguém descobre que a linha se pode puxar. */}
      <span className="w-10 h-[3px] rounded-full bg-[#C8CDD4] group-hover:bg-[#2563EB] transition-colors" />
    </div>
  );
}
