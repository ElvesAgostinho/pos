import { useState } from 'react';
import Window from './Window';
import { IcoCruz, IcoVisto } from './Icons';

/**
 * NÚMERO DE CLIENTES — a pergunta que se faz ao sentar a mesa.
 *
 * É o número que divide a receita: sem ele não há "gasto por pessoa", que é o número que
 * diz se o restaurante está a vender bem ou só a encher cadeiras.
 *
 * O TIPO diz o que acontece a seguir: PASSANTE paga no fim; HOTEL pode ir para o folio do
 * quarto; CONSUMO INTERNO é o pessoal — não é venda, é CUSTO. Sem esta distinção, o que o
 * staff come desaparece dentro da receita, e o restaurante parece vender 30% mais do que
 * fatura.
 *
 * (Este ecrã só aparece se o parâmetro 8175 "Perguntar tipo de cliente" estiver ligado.)
 *
 * PASSANTE é um ATALHO, não uma escolha: quem passa não senta mesa — tocar em "Passante"
 * vai LOGO para a venda de balcão (venda direta), sem número de clientes nem "abrir mesa".
 */
export default function GuestsDialog({ mesa, perguntarTipo = true, tiposPermitidos, onConfirm, onPassante, onCancel }: {
  mesa: any;
  perguntarTipo?: boolean;
  // (8581 da ficha do SETOR) que tipos de cliente esta sala aceita
  tiposPermitidos?: string | null;
  onConfirm: (pax: number, tipo: string) => void;
  onPassante?: () => void;
  onCancel: () => void;
}) {
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState(onPassante ? 'HOTEL' : 'PASSANTE');
  const pax = Number(valor || 0);

  const tecla = (t: string) => {
    if (t === 'C') return setValor('');
    if (t === '⌫') return setValor(valor.slice(0, -1));
    setValor((valor + t).slice(0, 3));
  };

  return (
    <Window title={`Clientes — Mesa ${mesa.table_number}`} width={480}
      onClose={onCancel}
      footer={(
        <div className="grid grid-cols-2 gap-1 p-1 bg-black">
          <button onClick={() => pax > 0 && onConfirm(pax, tipo)} disabled={pax <= 0}
            className="h-[56px] bg-[#1f7a34] text-white text-[18px] font-bold rounded-md
              disabled:bg-[#3a3a3a] disabled:text-white/30"><span className="inline-flex items-center gap-2"><IcoVisto size={24} />Abrir mesa</span></button>
          <button onClick={onCancel}
            className="h-[56px] bg-[#3a3a3a] text-white text-[18px] rounded-md"><span className="inline-flex items-center gap-2"><IcoCruz size={24} />Cancelar</span></button>
        </div>
      )}>
      <div className="p-3">
        <div className="text-center text-white/70 text-[16px] mb-2">Número de Clientes</div>

        <div className="h-[58px] bg-black rounded-md text-white text-[30px] font-bold px-4
          flex items-center justify-center border border-[#4a4a4a]">
          {valor || <span className="text-white/25">0</span>}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'].map((t) => (
            <button key={t} onClick={() => tecla(t)}
              className={`h-[52px] rounded-md text-[21px] font-bold active:scale-95 transition ${t === 'C'
                ? 'bg-[#c0140f] text-white' : 'bg-[#1f1f1f] text-white hover:bg-[#2f2f2f]'}`}>
              {t}
            </button>
          ))}
        </div>

        {perguntarTipo && (
          <>
            <div className="text-white/50 text-[13px] mt-3 mb-1">Tipo de cliente</div>
            <div className="grid grid-cols-3 gap-2">
              {[['PASSANTE', 'Passante'], ['HOTEL', 'Hotel'], ['INTERNO', 'Consumo\nInterno']].map(([k, l]) => {
                // (Utilizador POS) "Consumo interno" — sem a caixa na ficha do operador
                // (backoffice), o botão fica apagado: o custo da casa não é para todos.
                const podeInterno = (() => {
                  try {
                    return !!JSON.parse(localStorage.getItem('pos_operator') || '{}')
                      ?.flags?.internal_consumption;
                  } catch { return false; }
                })();
                // (8581) a sala pode aceitar só um tipo — o resto fica apagado
                const foraDoSetor = !!tiposPermitidos && tiposPermitidos !== 'TODOS'
                  && String(tiposPermitidos) !== String(k);
                const bloqueado = (k === 'INTERNO' && !podeInterno) || foraDoSetor;
                return (
                  <button key={k} disabled={bloqueado}
                    title={bloqueado ? 'Sem autorização de consumo interno (ficha do utilizador)' : ''}
                    onClick={() => (k === 'PASSANTE' && onPassante ? onPassante() : setTipo(k))}
                    className={`h-[50px] rounded-md text-[14px] font-bold whitespace-pre-line transition
                      disabled:opacity-30 ${tipo === k
                      ? 'bg-[#0f8b8d] text-white ring-2 ring-white/70' : 'bg-[#1f1f1f] text-white/80'}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Window>
  );
}
