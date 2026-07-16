import { useState } from 'react';

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
          className={`w-[60px] h-[46px] rounded text-[20px] ${aberto
            ? 'bg-[#0f8b8d] text-white' : 'bg-[#3a3a3a] text-white'}`} title="Teclado">⌨</button>
        <button onClick={onOk}
          className="w-[60px] h-[46px] bg-[#1f7a34] text-white text-[20px] rounded">🔍</button>
      </div>

      {aberto && (
        <div className="space-y-1 mt-2">
          {LINHAS.map((linha, i) => (
            <div key={i} className="flex gap-1">
              {linha.map((t) => (
                <button key={t} onClick={() => setValor(valor + (maiusc ? t.toUpperCase() : t))}
                  className="flex-1 h-[42px] bg-[#3a3a3a] text-white text-[16px] rounded active:bg-[#0f8b8d]">
                  {maiusc ? t.toUpperCase() : t}
                </button>
              ))}
            </div>
          ))}
          <div className="flex gap-1">
            <button onClick={() => setMaiusc(!maiusc)}
              className={`w-[90px] h-[42px] rounded text-[16px] ${maiusc
                ? 'bg-[#0f8b8d] text-white' : 'bg-[#3a3a3a] text-white'}`}>⬆</button>
            <button onClick={() => setValor(valor + ' ')} className="flex-1 h-[42px] bg-[#3a3a3a] rounded" />
            <button onClick={() => setValor('')}
              className="w-[80px] h-[42px] bg-[#c0140f] text-white text-[16px] font-bold rounded">C</button>
            <button onClick={() => setValor(valor.slice(0, -1))}
              className="w-[80px] h-[42px] bg-[#3a3a3a] text-white text-[16px] rounded">⌫</button>
            <button onClick={() => { onOk(); setAberto(false); }}
              className="w-[90px] h-[42px] bg-[#1f7a34] text-white text-[18px] rounded">✔</button>
          </div>
        </div>
      )}
    </div>
  );
}
