import { useState } from 'react';
import { inputStyle, Glyph } from './kit';

/**
 * ADICIONAR PÁGINA / SUBPÁGINA — a ficha que se preenche ANTES de a tecla existir.
 *
 * Criava-se a página logo, com o nome "NOVA PÁGINA", cor castanha e a grelha do teclado.
 * Depois havia que renomear, e a cor e o tamanho ou ficavam como estavam ou obrigavam a
 * ir a outro sítio. Quem monta um teclado cria dez páginas de seguida: são dez teclas
 * iguais chamadas "NOVA PÁGINA" à espera de serem arranjadas, e basta uma distração
 * para ficar uma por corrigir no teclado que o empregado vai usar todos os dias.
 *
 * Aqui pergunta-se tudo de uma vez — e o que se cria já sai pronto.
 *
 * A GRELHA (Horizontal × Vertical) é por PÁGINA, não do teclado inteiro: a página das
 * bebidas pode ter 5 colunas de garrafas e a dos pratos 3 colunas largas. Herda a do
 * teclado como ponto de partida, que é o que acontece em 9 de 10 páginas.
 */
export default function PageDialog({ podeSubpagina, corDefeito, textoDefeito,
  colsDefeito, rowsDefeito, precoDefeito, onOk, onClose }: {
  /** só se pode criar subpágina quando há uma página aberta onde a pôr */
  podeSubpagina: boolean;
  corDefeito: string;
  textoDefeito: string;
  colsDefeito: number;
  rowsDefeito: number;
  precoDefeito: number;
  onOk: (d: {
    tipo: 'PAGE' | 'FOLDER'; label: string; price_level: number;
    color: string; text_color: string; cols: number; rows: number;
  }) => void;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<'PAGE' | 'FOLDER'>('PAGE');
  const [label, setLabel] = useState('');
  const [preco, setPreco] = useState(precoDefeito || 1);
  const [cor, setCor] = useState(corDefeito);
  const [texto, setTexto] = useState(textoDefeito);
  const [cols, setCols] = useState(colsDefeito || 4);
  const [rows, setRows] = useState(rowsDefeito || 4);

  const inp = 'border border-[#8a95a3] px-2 py-1 text-[13px] bg-white';

  const Linha = ({ label: t, children }: { label: string; children: any }) => (
    <div className="flex items-center gap-3 mb-3">
      <span className="w-[130px] text-[13px] text-[#333] flex-shrink-0">{t}</span>
      {children}
    </div>
  );

  // Um número com setas, como no original — teclas de +/− valem mais que escrever.
  const Numero = ({ v, set, min = 1, max = 12 }: {
    v: number; set: (n: number) => void; min?: number; max?: number;
  }) => (
    <div className="flex">
      <input type="number" value={v} min={min} max={max}
        onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className={`${inp} w-[110px]`} style={inputStyle} />
      <div className="flex flex-col border border-l-0 border-[#8a95a3]">
        <button onClick={() => set(Math.min(max, v + 1))}
          className="h-[13px] w-[20px] text-[9px] leading-none bg-[#f0f0f0] hover:bg-[#e0e0e0]">▲</button>
        <button onClick={() => set(Math.max(min, v - 1))}
          className="h-[13px] w-[20px] text-[9px] leading-none bg-[#f0f0f0] hover:bg-[#e0e0e0] border-t border-[#c8c8c8]">▼</button>
      </div>
    </div>
  );

  const Cor = ({ v, set }: { v: string; set: (c: string) => void }) => (
    <div className="flex items-center gap-2">
      <input value={v} onChange={(e) => set(e.target.value)} className={`${inp} w-[130px] font-mono`} style={inputStyle} />
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#333333'}
        onChange={(e) => set(e.target.value.toUpperCase())}
        className="w-[38px] h-[26px] border border-[#8a95a3] p-0 bg-white cursor-pointer" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[75]" onClick={onClose}>
      <div className="bg-[#f4f4f4] border border-[#888] w-[720px] max-w-[95vw] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        <div className="h-[40px] bg-[#242428] flex items-center justify-end px-2">
          <button onClick={onClose}
            className="w-[26px] h-[22px] bg-[#c0392b] text-white font-bold leading-none flex items-center justify-center"><Glyph icon="✕" size={13} /></button>
        </div>

        <div className="bg-white p-5 border-y border-[#d0d0d0]">
          <Linha label="Tipo:">
            <label className="flex items-center gap-2 text-[13px] mr-8 cursor-pointer">
              <input type="radio" checked={tipo === 'PAGE'} onChange={() => setTipo('PAGE')} className="w-4 h-4" />
              Adicionar Página
            </label>
            {/* SUBPÁGINA sem página aberta não tem onde entrar — fica apagada, e diz
                porquê, em vez de criar uma pasta órfã que ninguém encontra depois. */}
            <label className={`flex items-center gap-2 text-[13px] ${podeSubpagina
              ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
              title={podeSubpagina ? '' : 'Abra primeiro uma página — a subpágina vive dentro dela.'}>
              <input type="radio" disabled={!podeSubpagina}
                checked={tipo === 'FOLDER'} onChange={() => setTipo('FOLDER')} className="w-4 h-4" />
              Adicionar Subpágina
            </label>
          </Linha>

          <Linha label="Descrição:">
            <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
              placeholder="BEBIDAS, COMIDAS, CAFETARIA…"
              className={`${inp} flex-1`} style={inputStyle} />
          </Linha>

          <Linha label="Tipo Preço:"><Numero v={preco} set={setPreco} min={1} max={6} /></Linha>
          <Linha label="Cor de Fundo:"><Cor v={cor} set={setCor} /></Linha>
          <Linha label="Cor do texto:"><Cor v={texto} set={setTexto} /></Linha>
          <Linha label="Horizontal:"><Numero v={cols} set={setCols} /></Linha>
          <Linha label="Vertical:"><Numero v={rows} set={setRows} /></Linha>

          {/* a pré-visualização da tecla: vê-se a cor antes de a criar */}
          <div className="flex items-center gap-3 mt-4">
            <span className="w-[130px] text-[13px] text-[#333]">Fica assim:</span>
            <div className="w-[150px] h-[54px] flex items-center justify-center font-bold text-[15px]
              border-2 border-black rounded-[3px]
              shadow-[inset_0_2px_0_rgba(255,255,255,0.28),inset_0_-3px_0_rgba(0,0,0,0.4)]"
              style={{ background: cor, color: texto }}>
              {label || (tipo === 'PAGE' ? 'PÁGINA' : 'SUBPÁGINA')}
            </div>
            <span className="text-[12px] text-[#666]">grelha {cols} × {rows}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-6 px-5 py-3">
          <button onClick={() => onOk({
            tipo, label: label.trim() || (tipo === 'PAGE' ? 'NOVA PÁGINA' : 'NOVA SUBPÁGINA'),
            price_level: preco, color: cor, text_color: texto, cols, rows,
          })}
            className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#eaeaea] px-3 py-1.5">
            <span className="w-6 h-6 rounded-full bg-[#1f7a34] text-white flex items-center justify-center"><Glyph icon="✔" size={13} /></span>
            OK
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#eaeaea] px-3 py-1.5">
            <span className="w-6 h-6 rounded-full bg-[#c0392b] text-white flex items-center justify-center"><Glyph icon="✕" size={13} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
