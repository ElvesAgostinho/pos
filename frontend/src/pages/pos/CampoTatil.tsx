import { createContext, useContext, useState } from 'react';
import { IcoVisto, IcoCruz, IcoMaiusculas } from './Icons';
import { useArrastar } from './useArrastar';

/**
 * OS CAMPOS DO TERMINAL — tocar num campo abre o teclado certo.
 *
 * Num terminal de balcão não há teclado físico nem rato: se o campo não trouxer o
 * teclado consigo, o campo não se preenche. E o teclado tem de ser o CERTO — pedir um
 * número de contribuinte com um teclado de letras é obrigar a caçar algarismos entre o
 * "q" e o "p", com um cliente à espera.
 *
 * Por isso: campo de texto abre o alfanumérico; campo de número abre o numérico grande.
 *
 * O teclado FLUTUA por cima do formulário e fecha ao confirmar — não empurra o
 * formulário para cima nem tapa o campo que se está a escrever.
 */

type Foco = {
  chave: string; valor: string; tipo: 'texto' | 'numero'; titulo: string;
  aplicar: (v: string) => void;
};
const Ctx = createContext<{ abrir: (f: Foco) => void; ativo: string | null }>({
  abrir: () => {}, ativo: null,
});

const RELEVO = 'border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),'
  + 'inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]';
const CINZA = 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]';
const LETRAS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '7', '8', '9'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç', '4', '5', '6'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '@', ',', '1', '2', '3'],
];

/** Envolve um formulário para que os seus campos tenham teclado. */
export function ComTeclado({ children }: { children: any }) {
  const { ref, pegar, pos } = useArrastar();
  const [foco, setFoco] = useState<Foco | null>(null);
  const [texto, setTexto] = useState('');
  const [maiusc, setMaiusc] = useState(false);

  const abrir = (f: Foco) => { setFoco(f); setTexto(f.valor || ''); setMaiusc(false); };
  const fechar = () => { setFoco(null); setMaiusc(false); };
  const confirmar = () => { foco?.aplicar(texto.trim()); fechar(); };
  const tecla = (t: string) => {
    if (t === 'C') return setTexto('');
    if (t === '⌫') return setTexto(texto.slice(0, -1));
    setTexto(texto + (maiusc ? t.toUpperCase() : t));
    if (maiusc) setMaiusc(false);
  };

  return (
    <Ctx.Provider value={{ abrir, ativo: foco?.chave ?? null }}>
      {children}

      {foco && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
          onClick={fechar}>
          <div ref={ref} className="bg-[#1f1f1f] border-[3px] border-black shadow-2xl"
            style={pos ? { position: 'fixed' as const, left: pos.x, top: pos.y, margin: 0 } : undefined}
            onClick={(e) => e.stopPropagation()}>
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
          <div className="p-2">
            <div className="text-center text-white/70 text-[15px] pb-2">{foco.titulo}</div>
            <div className="min-h-[58px] bg-[#8a8a8a]/60 border-2 border-black text-white
              text-[20px] px-4 py-3 mb-2 break-words min-w-[320px]">
              {texto || <span className="text-white/30">escreva…</span>}
            </div>

            {foco.tipo === 'numero' ? (
              <div className="grid grid-cols-3 gap-1.5 w-[340px]">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', 'C', '0'].map((t) => (
                  <button key={t} onClick={() => tecla(t)}
                    className={`h-[64px] rounded-[3px] text-white text-[24px] font-bold ${RELEVO}
                      ${t === 'C' ? 'bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]' : CINZA}`}>
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {LETRAS.map((linha, i) => (
                  <div key={i} className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${linha.length}, minmax(0,1fr))` }}>
                    {linha.map((t) => (
                      <button key={t} onClick={() => tecla(t)}
                        className={`h-[54px] w-[62px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO} ${CINZA}`}>
                        {maiusc ? t.toUpperCase() : t}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="grid gap-1" style={{ gridTemplateColumns: '1fr 6fr 1fr 1fr 1fr' }}>
                  <button onClick={() => setMaiusc(!maiusc)}
                    className={`h-[54px] rounded-[3px] flex items-center justify-center ${RELEVO}
                      ${maiusc ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white' : `${CINZA} text-white`}`}>
                    <IcoMaiusculas size={20} />
                  </button>
                  <button onClick={() => setTexto(texto + ' ')} className={`h-[54px] rounded-[3px] ${RELEVO} ${CINZA}`} />
                  <button onClick={() => setTexto(texto + '.')}
                    className={`h-[54px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO} ${CINZA}`}>.</button>
                  <button onClick={() => setTexto('')}
                    className={`h-[54px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO}
                      bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]`}>C</button>
                  <button onClick={() => tecla('⌫')}
                    className={`h-[54px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO} ${CINZA}`}>⌫</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <button onClick={confirmar}
                className={`h-[62px] rounded-[3px] flex items-center justify-center text-[#2ecc40] ${RELEVO} ${CINZA}`}>
                <IcoVisto size={30} />
              </button>
              <button onClick={fechar}
                className={`h-[62px] rounded-[3px] flex items-center justify-center text-[#e02020] ${RELEVO} ${CINZA}`}>
                <IcoCruz size={30} />
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/**
 * Um campo com rótulo. Tocar abre o teclado; `obrigatorio` pinta o rótulo de vermelho,
 * como no original — vê-se o que falta sem ter de tentar gravar.
 */
export function CampoTatil({ chave, label, valor, onChange, tipo = 'texto',
  obrigatorio, largura = 'flex-1', rotulo = 'w-[150px]' }: {
  chave: string; label: string; valor: any;
  onChange: (v: string) => void;
  tipo?: 'texto' | 'numero';
  obrigatorio?: boolean;
  largura?: string;
  rotulo?: string;
}) {
  const { abrir, ativo } = useContext(Ctx);
  const v = valor ?? '';
  return (
    <div className={`flex items-stretch ${largura} min-w-0`}>
      <span className={`${rotulo} flex-shrink-0 flex items-center px-3 text-[14px] font-bold
        ${obrigatorio && !String(v).trim()
          ? 'bg-[#a01818] text-white' : 'text-white'}`}>
        {label}
      </span>
      <button
        onClick={() => abrir({ chave, valor: String(v), tipo, titulo: label, aplicar: onChange })}
        className={`flex-1 min-w-0 text-left px-3 py-2 text-white text-[16px] truncate border-2
          ${ativo === chave ? 'bg-[#6e6e6e] border-[#f0c000]' : 'bg-[#8a8a8a]/55 border-black'}`}>
        {String(v) || <span className="text-white/30">—</span>}
      </button>
    </div>
  );
}

/** Uma lista de opções, no mesmo estilo dos campos. */
export function EscolhaTatil({ label, valor, onChange, opcoes, largura = 'flex-1',
  obrigatorio, rotulo = 'w-[150px]' }: {
  label: string; valor: any; onChange: (v: string) => void;
  opcoes: { id: any; label: string }[];
  largura?: string; obrigatorio?: boolean; rotulo?: string;
}) {
  return (
    <div className={`flex items-stretch ${largura} min-w-0`}>
      <span className={`${rotulo} flex-shrink-0 flex items-center px-3 text-[14px] font-bold
        ${obrigatorio && !valor ? 'bg-[#a01818] text-white' : 'text-white'}`}>
        {label}
      </span>
      <select value={valor ?? ''} onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-[#8a8a8a]/55 border-2 border-black text-white text-[16px] px-2">
        <option value="">(nenhum)</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** Uma caixa de sim/não, com o mesmo peso. */
export function CaixaTatil({ label, valor, onChange, largura = 'flex-1' }: {
  label: string; valor: boolean; onChange: (v: boolean) => void; largura?: string;
}) {
  return (
    <button onClick={() => onChange(!valor)}
      className={`flex items-center justify-between px-3 py-2 border-2 border-black
        bg-[#8a8a8a]/25 ${largura} min-w-0`}>
      <span className="text-white text-[14px] font-bold truncate">{label}</span>
      <span className={`w-[30px] h-[30px] flex-shrink-0 flex items-center justify-center border-2 border-black
        ${valor ? 'bg-[#1f7a34]' : 'bg-[#2b2b2b]'}`}>
        {valor && <IcoVisto size={20} />}
      </span>
    </button>
  );
}
