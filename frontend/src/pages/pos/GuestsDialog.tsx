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
 * "Passante" É UM TIPO, não um atalho. Era um atalho: tocar nele largava a mesa e abria
 * uma venda de BALCÃO. Como Passante é o que se escolhe em quase todas as mesas, o
 * resultado era que a conta NUNCA ficava ligada à mesa — abria-se a mesa, escolhia-se
 * Passante, e a venda ia para uma conta de balcão sem mesa nenhuma. A mesa continuava
 * verde, e ao voltar lá o terminal perguntava tudo outra vez, como se nada tivesse
 * acontecido. Era este o "não guarda nada".
 */
export default function GuestsDialog({ mesa, perguntarTipo = true, tiposPermitidos, onConfirm, onCancel }: {
  mesa: any;
  perguntarTipo?: boolean;
  // (8581 da ficha do SETOR) que tipos de cliente esta sala aceita
  tiposPermitidos?: string | null;
  onConfirm: (pax: number, tipo: string) => void;
  onCancel: () => void;
}) {
  // O VISOR MOSTRAVA "1" MAS VALIA ZERO: o campo estava vazio e o "1" era só um
  // texto de recheio. O botão de abrir ficava apagado e, para o empregado, o ecrã
  // mentia — dizia uma pessoa e recusava-se a abrir a mesa.
  // Agora o 1 é MESMO um: a mesa abre sem tocar em nada, que é o caso mais comum.
  const [valor, setValor] = useState('1');
  // Enquanto ninguém tocou no teclado, o primeiro algarismo SUBSTITUI o 1 (não fica
  // "12" quando se quer 2). Depois disso escreve-se normalmente.
  const [virgem, setVirgem] = useState(true);
  const [tipo, setTipo] = useState('PASSANTE');
  const pax = Number(valor || 0);

  const tecla = (t: string) => {
    if (t === 'C') { setVirgem(false); return setValor(''); }
    if (t === '⌫') { setVirgem(false); return setValor(valor.slice(0, -1)); }
    if (t === '.') return;                       // pessoas não têm decimais
    setValor(((virgem ? '' : valor) + t).slice(0, 3));
    setVirgem(false);
  };

  return (
    <Window title={`Clientes — Mesa ${mesa.table_number}`} width={480}
      onClose={onCancel}
      footer={(
        <div className="grid grid-cols-2 gap-1 p-1 bg-black">
          <button onClick={() => pax > 0 && onConfirm(pax, tipo)} disabled={pax <= 0}
            className="h-[64px] rounded-[3px] flex items-center justify-center text-[#2ecc40]
              border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] bg-gradient-to-b from-[#4a4a4a] to-[#242424] disabled:opacity-25"><IcoVisto size={30} /></button>
          <button onClick={onCancel}
            className="h-[64px] rounded-[3px] flex items-center justify-center text-[#e02020]
              border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] bg-gradient-to-b from-[#4a4a4a] to-[#242424]"><IcoCruz size={30} /></button>
        </div>
      )}>
      <div className="p-2">
        <div className="text-center text-white text-[19px] mb-2">Número de Clientes</div>

        {/* VALOR + limpar, como no original: o visor é uma linha só, não um bloco. */}
        <div className="flex items-stretch gap-1 mb-2">
          <span className="w-[92px] flex items-center px-3 text-white text-[16px] font-bold">Valor</span>
          <div className="flex-1 bg-[#8a8a8a] border-2 border-black text-white text-[24px] font-bold
            px-4 flex items-center">
            {valor || <span className="text-black/30">0</span>}
          </div>
          <button onClick={() => setValor('')} title="Limpar"
            className="w-[58px] flex items-center justify-center text-white rounded-[3px] border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] bg-gradient-to-b from-[#4a4a4a] to-[#242424]">
            <IcoCruz size={22} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', 'C', '0'].map((t) => (
            <button key={t} onClick={() => tecla(t)}
              className={`h-[62px] rounded-[3px] text-[24px] font-bold text-white border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] ${t === 'C'
                ? 'bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]' : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* OS TRÊS TIPOS, logo por baixo do teclado e SEMPRE à vista — como no original.
            É esta a escolha que decide o que acontece à conta, e estava escondida por
            baixo de um rótulo pequeno, como se fosse um detalhe. */}
        {perguntarTipo && (
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {[['PASSANTE', 'Passante'], ['HOTEL', 'Hotel'], ['INTERNO', 'Consumo Interno']].map(([k, l]) => {
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
                  onClick={() => setTipo(k)}
                  className={`h-[62px] rounded-[3px] text-[15px] font-bold whitespace-pre-line
                    text-white border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] disabled:opacity-25 ${tipo === k
                    ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] ring-[3px] ring-white/80 ring-inset'
                    : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]'}`}>
                  {l}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Window>
  );
}
