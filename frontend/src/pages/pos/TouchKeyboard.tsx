import { useState } from 'react';
import { IcoLupa, IcoMaiusculas, IcoTeclado, IcoVisto } from './Icons';
import { useArrastar } from './useArrastar';

/**
 * PESQUISA COM TECLADO TÁTIL — o teclado abre-se quando é preciso, não antes.
 *
 * Um teclado sempre aberto rouba metade do ecrã à lista que o empregado quer ler. E a
 * lista é que interessa: ele procura o hóspede, não as letras. Toca-se na caixa (ou no
 * ícone do teclado) e ele sobe; escolhe-se e ele desce.
 */
// (Parâmetro 8001) O LAYOUT vem do backoffice: QWERTY para Angola/Portugal, AZERTY
// para equipas francófonas, Numérico para quem só procura por código.
const LAYOUTS: Record<string, string[][]> = {
  'QWERTY (Português)': [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '7', '8', '9'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç', '4', '5', '6'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '@', ',', '1', '2', '3'],
  ],
  AZERTY: [
    ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '7', '8', '9'],
    ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', '4', '5', '6'],
    ['w', 'x', 'c', 'v', 'b', 'n', '-', '@', "'", ',', '1', '2', '3'],
  ],
  'Numérico': [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
  ],
};

export default function TouchKeyboard({ valor, setValor, onOk }: {
  valor: string;
  setValor: (v: string) => void;
  onOk: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const { ref, pegar, pos } = useArrastar();
  const [maiusc, setMaiusc] = useState(false);
  const LINHAS = (() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('pos_cfg') || '{}');
      return LAYOUTS[cfg.keyboard_layout] || LAYOUTS['QWERTY (Português)'];
    } catch { return LAYOUTS['QWERTY (Português)']; }
  })();

  return (
    <div className="bg-[#1f1f1f] p-2 flex-shrink-0 border-t border-black">
      <div className="flex items-center gap-2">
        <button onClick={() => { setValor(''); onOk(); }}
          className="h-[46px] px-3 bg-[#3a3a3a] text-white text-[14px] rounded">(todos)</button>
        <input value={valor} onFocus={() => setAberto(true)}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOk()}
          placeholder="procurar…"
          className="flex-1 h-[46px] bg-[#8a8a8a] text-white text-[18px] px-3 rounded outline-none
            placeholder:text-white/40" />
        <button onClick={() => setAberto(!aberto)}
          className={`w-[60px] h-[46px] rounded-[3px] flex items-center justify-center border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] ${aberto
            ? 'bg-gradient-to-b from-[#17a2a4] to-[#0b6b6d] text-white'
            : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424] text-white'}`}
          title="Teclado"><IcoTeclado size={22} /></button>
        <button onClick={onOk}
          className="w-[60px] h-[46px] rounded-[3px] flex items-center justify-center text-white
            bg-gradient-to-b from-[#2b9c48] to-[#125c26] border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] "><IcoLupa size={22} /></button>
      </div>

      {aberto && (
        <div ref={ref} className="space-y-1 mt-2 relative"
          style={pos ? { position: 'fixed' as const, left: pos.x, top: pos.y, zIndex: 90,
            background: '#1f1f1f', padding: 8, border: '3px solid #000' } : undefined}>
          {/* PEGA — o teclado move-se: fixo, tapava o campo que se esta a preencher. */}
        <div onMouseDown={pegar} onTouchStart={pegar}
          className="h-[34px] flex items-center px-3 gap-1 bg-[#3a3a3a] border-b-2 border-black
            cursor-grab active:cursor-grabbing select-none">
          <span className="w-[42px] flex flex-col gap-[3px] opacity-50">
            <span className="h-[2px] bg-white rounded" />
            <span className="h-[2px] bg-white rounded" />
            <span className="h-[2px] bg-white rounded" />
          </span>
          <span className="flex-1 text-center text-white/70 text-[13px]">arraste para mover</span>
        </div>

          {LINHAS.map((linha, i) => (
            <div key={i} className="flex gap-1">
              {linha.map((t) => (
                <button key={t} onClick={() => setValor(valor + (maiusc ? t.toUpperCase() : t))}
                  className="flex-1 h-[42px] rounded-[3px] text-white text-[17px] font-semibold
                    bg-gradient-to-b from-[#4a4a4a] to-[#242424] border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] ">
                  {maiusc ? t.toUpperCase() : t}
                </button>
              ))}
            </div>
          ))}
          <div className="flex gap-1">
            <button onClick={() => setMaiusc(!maiusc)}
              className={`w-[90px] h-[42px] rounded-[3px] flex items-center justify-center border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] ${maiusc
                ? 'bg-gradient-to-b from-[#17a2a4] to-[#0b6b6d] text-white'
                : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424] text-white'}`}><IcoMaiusculas size={20} /></button>
            <button onClick={() => setValor(valor + ' ')} className="flex-1 h-[42px] bg-[#3a3a3a] rounded" />
            <button onClick={() => setValor('')}
              className="w-[80px] h-[42px] bg-[#c0140f] text-white text-[16px] font-bold rounded">C</button>
            <button onClick={() => setValor(valor.slice(0, -1))}
              className="w-[80px] h-[42px] bg-[#3a3a3a] text-white text-[16px] rounded">⌫</button>
            <button onClick={() => { onOk(); setAberto(false); }}
              className="w-[90px] h-[42px] rounded-[3px] flex items-center justify-center text-white
                bg-gradient-to-b from-[#2b9c48] to-[#125c26] border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] "><IcoVisto size={24} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
