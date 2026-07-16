import { useState } from 'react';
import { apiClient } from '../../api/client';
import Window from './Window';

/**
 * TROCA DE PIN OBRIGATÓRIA — a caixa "Obrigar a mudar o PIN" da ficha do operador.
 *
 * O gestor entrega o operador novo com um PIN provisório e a caixa marcada; ao primeiro
 * login o terminal para AQUI, antes das mesas e antes de vender. Não é opcional e não
 * se fecha — um PIN provisório partilhado é uma auditoria que não vale nada.
 */
export default function PinChange({ operador, onDone }: {
  operador: any; onDone: () => void;
}) {
  const [atual, setAtual] = useState('');
  const [novo, setNovo] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [campo, setCampo] = useState<'A' | 'N' | 'C'>('A');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  const valor = campo === 'A' ? atual : campo === 'N' ? novo : confirmar;
  const setValor = campo === 'A' ? setAtual : campo === 'N' ? setNovo : setConfirmar;

  const tecla = (t: string) => {
    setErro('');
    if (t === 'C') return setValor('');
    if (t === '⌫') return setValor(valor.slice(0, -1));
    if (valor.length < 8) setValor(valor + t);
  };

  const gravar = async () => {
    if (novo !== confirmar) return setErro('O PIN novo e a confirmação não coincidem.');
    setBusy(true);
    try {
      await apiClient.post('pos/terminal/change-pin/', {
        operator: operador.id, current_pin: atual, new_pin: novo,
      });
      onDone();
    } catch (e: any) {
      setErro(e?.response?.data?.detail || 'Não foi possível mudar o PIN.');
      setBusy(false);
    }
  };

  const Campo = ({ id, label, v }: { id: 'A' | 'N' | 'C'; label: string; v: string }) => (
    <button onClick={() => setCampo(id)}
      className={`flex items-center justify-between px-3 h-[46px] rounded border-2 text-left
        ${campo === id ? 'border-[#c9a400] bg-[#2a2a2a]' : 'border-[#3a3a3a] bg-[#222]'}`}>
      <span className="text-white/70 text-[14px]">{label}</span>
      <span className="text-white text-[22px] tracking-[6px]">{'●'.repeat(v.length) || '—'}</span>
    </button>
  );

  return (
    <Window title="Mudar o PIN (obrigatório)" width={430}>
      <div className="p-3 flex flex-col gap-2 bg-[#1a1a1a]">
        <div className="text-white/80 text-[14px]">
          {operador?.name} — o gestor marcou a sua ficha para <b>mudar o PIN</b> antes de trabalhar.
        </div>
        <Campo id="A" label="PIN atual" v={atual} />
        <Campo id="N" label="PIN novo (mín. 4 dígitos)" v={novo} />
        <Campo id="C" label="Confirmar o PIN novo" v={confirmar} />

        <div className="grid grid-cols-3 gap-1 mt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((t) => (
            <button key={t} onClick={() => tecla(t)}
              className="h-[52px] bg-[#2e2e2e] text-white text-[22px] font-bold rounded hover:bg-[#3a3a3a]">
              {t}
            </button>
          ))}
        </div>

        {erro && <div className="text-[#ff6b60] text-[13px] font-semibold">{erro}</div>}
        <button onClick={gravar} disabled={busy || atual.length < 4 || novo.length < 4 || confirmar.length < 4}
          className="h-[52px] bg-[#0f8b8d] text-white text-[18px] font-bold rounded disabled:opacity-40">
          Gravar o PIN novo
        </button>
      </div>
    </Window>
  );
}
