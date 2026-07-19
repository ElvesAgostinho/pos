import { useState } from 'react';
import { IcoVisto, IcoCruz } from './Icons';

/**
 * TECLADO NUMÉRICO — quantidade, preço, percentagem.
 *
 * É o mesmo gesto do original: título (o que se está a editar), o visor, os números
 * grandes, e o ✔/✖ em baixo. Teclas de dedo, não de rato: quem trabalha ao balcão não
 * acerta em botões pequenos com as mãos molhadas.
 */
export default function NumPad({ titulo, subtitulo = 'Editar quantidade', inicial = '',
  decimais = true, onOk, onClose }: {
  titulo: string;
  subtitulo?: string;
  inicial?: string;
  /** falsa nas quantidades inteiras (pessoas); verdadeira em peso e preço */
  decimais?: boolean;
  onOk: (valor: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(inicial);

  const tecla = (t: string) => {
    if (t === 'C') return setV('');
    if (t === '.') return decimais && !v.includes('.') ? setV((v || '0') + '.') : undefined;
    setV((v + t).slice(0, 9));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-[520px] bg-[#1f1f1f] border-2 border-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="h-[58px] bg-[#3a3a3a] flex items-center justify-center border-b border-black">
          <span className="text-white text-[22px] font-bold">{titulo}</span>
        </div>
        <div className="py-3 text-center text-white text-[20px]">{subtitulo}</div>

        <div className="px-3">
          <div className="h-[62px] bg-[#8a8a8a] rounded text-black text-[30px] font-bold px-4
            flex items-center border border-[#4a4a4a]">
            {v || <span className="text-black/30">|</span>}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', 'C', '0'].map((t) => (
              <button key={t} onClick={() => tecla(t)}
                disabled={t === '.' && !decimais}
                className={`h-[66px] rounded text-[26px] font-bold active:scale-95 transition
                  disabled:opacity-20 ${t === 'C'
                    ? 'bg-[#c0140f] text-white' : 'bg-[#2b2b2b] text-white hover:bg-[#3a3a3a]'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3">
          <button onClick={() => v.trim() && onOk(v.trim())} disabled={!v.trim()}
            className="h-[64px] bg-[#2b2b2b] rounded text-[#2ecc40] text-[34px] font-bold
              disabled:opacity-25"><IcoVisto size={36} /></button>
          <button onClick={onClose}
            className="h-[64px] bg-[#2b2b2b] rounded text-[#e02020] font-bold"><IcoCruz size={34} /></button>
        </div>
      </div>
    </div>
  );
}
