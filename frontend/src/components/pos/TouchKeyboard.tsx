import { useState } from 'react';

/**
 * Teclados TÁTEIS para o POS (ecrã táctil sem teclado físico).
 * - TouchKeypad: numérico (quantidades, %, valores, PIN).
 * - TouchKeyboard: alfanumérico QWERTY (nomes de cliente, notas, pesquisas).
 */

// Alturas contidas: o teclado tem de caber SEMPRE dentro do popup, sem cortar os botões
// de confirmação (num ecrã de 768px de altura o modal inteiro cabe).
export function TouchKeypad({ value, onChange, decimals = true, compact = false }:
  { value: string; onChange: (v: string) => void; decimals?: boolean; compact?: boolean }) {
  const K = `${compact ? 'h-10 text-base' : 'h-12 text-lg'} rounded-lg font-bold active:translate-y-px select-none`;
  const press = (k: string) => {
    if (k === 'C') return onChange('');
    if (k === '←') return onChange(value.slice(0, -1));
    if (k === ',') { if (!decimals || value.includes('.')) return; return onChange((value || '0') + '.'); }
    onChange((value === '0' ? '' : value) + k);
  };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', decimals ? ',' : '00', '0', '←'];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {keys.map((k, i) => (
        <button key={k} onClick={() => press(k)}
          className={`${K} ${i % 3 === 0 && i > 0 ? '' : ''} ${k === '←' ? 'bg-[#a01818] text-white' : 'bg-[#111a26] text-white border border-[#2a4a66]'} ${'col-span-1'}`}
          style={{ gridColumn: `${(i % 3) + 1} / span 1`, gridRow: `${Math.floor(i / 3) + 1}` }}>{k}</button>
      ))}
      {/* "Limpar" ocupa a 4.ª coluna (à direita), poupando uma linha inteira de altura */}
      <button onClick={() => press('C')}
        className={`${K} bg-[#33415a] text-white text-sm`}
        style={{ gridColumn: '4 / span 1', gridRow: '1 / span 4' }}>Limpar</button>
    </div>
  );
}

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Á', 'É', 'Ó'],
];

export function TouchKeyboard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [caps, setCaps] = useState(true);
  const put = (k: string) => onChange(value + (caps ? k : k.toLowerCase()));
  return (
    <div className="space-y-1">
      {ROWS.map((row, i) => (
        <div key={i} className="grid grid-cols-10 gap-1">
          {row.map((k) => (
            <button key={k} onClick={() => put(k)}
              className="h-10 rounded-md bg-[#111a26] text-white border border-[#2a4a66] font-bold text-sm active:translate-y-px">
              {caps ? k : k.toLowerCase()}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <button onClick={() => setCaps((c) => !c)} className={`px-3 h-10 rounded-md font-bold text-xs ${caps ? 'bg-[#c9a400] text-white' : 'bg-[#33415a] text-white'}`}>⇧ Maiús.</button>
        <button onClick={() => onChange(value + ' ')} className="flex-1 h-10 rounded-md bg-[#111a26] text-white border border-[#2a4a66] font-bold text-xs">Espaço</button>
        <button onClick={() => onChange(value.slice(0, -1))} className="px-4 h-10 rounded-md bg-[#a01818] text-white font-bold text-xs">← Apagar</button>
        <button onClick={() => onChange('')} className="px-3 h-10 rounded-md bg-[#33415a] text-white font-bold text-xs">Limpar</button>
      </div>
    </div>
  );
}
