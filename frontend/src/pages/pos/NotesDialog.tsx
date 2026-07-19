import { useState } from 'react';
import TouchKeyboard from './TouchKeyboard';
import { IcoVisto, IcoCruz } from './Icons';

/**
 * OBSERVAÇÕES — a explicação que fica agarrada à conta.
 *
 * "Pagou 5000 e ficou de trazer o resto", "cheque nº 41827", "cortesia autorizada pelo
 * gerente". São as coisas que fazem um pagamento estranho ter sentido três meses depois,
 * quando já ninguém se lembra da noite.
 *
 * Dita ao colega no fim do turno, a explicação perde-se; escrita aqui, sobrevive à
 * auditoria e ao fecho do mês. É por isso que fica na conta, e não num papel ao lado
 * da caixa.
 */
export default function NotesDialog({ titulo = 'Observações', subtitulo = 'Observações de Pagamentos',
  inicial = '', onOk, onClose }: {
  titulo?: string;
  subtitulo?: string;
  inicial?: string;
  onOk: (texto: string) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState(inicial);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-10 z-[60]" onClick={onClose}>
      <div className="w-[920px] max-w-[95vw] bg-[#2b2b2b] border-2 border-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="h-[58px] bg-gradient-to-b from-[#4a4a4a] to-[#2e2e2e] border-b-2 border-black
          flex items-center justify-center">
          <span className="text-white text-[24px] font-bold">{titulo}</span>
        </div>
        <div className="py-3 text-center text-white text-[20px]">{subtitulo}</div>

        <div className="px-2">
          <div className="min-h-[62px] bg-[#8a8a8a]/60 border-2 border-black text-white text-[19px]
            px-4 py-3 mb-1 break-words">
            {texto || <span className="text-white/30">Escreva a observação…</span>}
          </div>
          <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => onOk(texto.trim())} />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-black">
          <button onClick={() => onOk(texto.trim())} title="Gravar na conta"
            className="h-[64px] flex items-center justify-center rounded-[3px] border-2 border-black
              text-[#2ecc40] bg-gradient-to-b from-[#4a4a4a] to-[#242424]
              shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
              active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
            <IcoVisto size={32} />
          </button>
          <button onClick={onClose} title="Fechar sem gravar"
            className="h-[64px] flex items-center justify-center rounded-[3px] border-2 border-black
              text-[#e02020] bg-gradient-to-b from-[#4a4a4a] to-[#242424]
              shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
              active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
            <IcoCruz size={32} />
          </button>
        </div>
      </div>
    </div>
  );
}
