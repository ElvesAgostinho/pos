import { useEffect, useMemo, useState } from 'react';
import { inputStyle, money } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-[2px] text-[11px] bg-white';

/**
 * GRELHA DE RELATÓRIO com FILTROS AVANÇADOS — como no Excel, mas a sério.
 *
 * Um relatório sem filtros obriga a exportar tudo para o Excel e a filtrar lá fora —
 * e a partir daí ninguém sabe de que números se está a falar. Aqui:
 *   · filtro por COLUNA, com operadores (contém, =, ≠, começa, >, <, entre, vazio…);
 *   · CONDIÇÕES compostas com E / OU (todas têm de bater, ou basta uma);
 *   · ordenação por qualquer coluna;
 *   · esconder colunas que não interessam;
 *   · limitar às primeiras N linhas.
 *
 * Os TOTAIS recalculam-se sobre o que está filtrado — senão o rodapé mentia.
 */

type Cond = { col: string; op: string; v1: string; v2: string };

const OPS: [string, string][] = [
  ['contains', 'contém'],
  ['ncontains', 'não contém'],
  ['eq', 'é igual a'],
  ['neq', 'é diferente de'],
  ['starts', 'começa por'],
  ['ends', 'termina em'],
  ['gt', 'maior que'],
  ['gte', 'maior ou igual'],
  ['lt', 'menor que'],
  ['lte', 'menor ou igual'],
  ['between', 'entre'],
  ['empty', 'está vazio'],
  ['nempty', 'não está vazio'],
];

const num = (v: any) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

function bate(valor: any, c: Cond) {
  const s = String(valor ?? '').toLowerCase();
  const a = c.v1.toLowerCase();
  switch (c.op) {
    case 'contains': return s.includes(a);
    case 'ncontains': return !s.includes(a);
    case 'eq': return s === a;
    case 'neq': return s !== a;
    case 'starts': return s.startsWith(a);
    case 'ends': return s.endsWith(a);
    case 'empty': return s === '';
    case 'nempty': return s !== '';
    case 'gt': case 'gte': case 'lt': case 'lte': case 'between': {
      const x = num(valor), y = num(c.v1), z = num(c.v2);
      // Datas e textos comparam-se como texto; números, como números.
      if (x === null || y === null) {
        if (c.op === 'gt') return s > a;
        if (c.op === 'gte') return s >= a;
        if (c.op === 'lt') return s < a;
        if (c.op === 'lte') return s <= a;
        if (c.op === 'between') return s >= a && s <= c.v2.toLowerCase();
      }
      if (c.op === 'gt') return x! > y!;
      if (c.op === 'gte') return x! >= y!;
      if (c.op === 'lt') return x! < y!;
      if (c.op === 'lte') return x! <= y!;
      if (c.op === 'between') return z !== null && x! >= y! && x! <= z;
      return true;
    }
    default: return true;
  }
}

export default function ReportGrid({ d, onView }: { d: any; onView?: (r: any[], c: any[]) => void }) {
  const cols: any[] = d.columns;
  const [rapido, setRapido] = useState<Record<string, string>>({});   // filtro por coluna
  const [conds, setConds] = useState<Cond[]>([]);                     // filtros avançados
  const [modo, setModo] = useState<'AND' | 'OR'>('AND');
  const [painel, setPainel] = useState(false);
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean } | null>(null);
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [limite, setLimite] = useState(0);                            // 0 = todas
  const [colsPainel, setColsPainel] = useState(false);

  const visiveis = cols.filter((c) => !ocultas.includes(c[0]));
  const isMoney = (c: any) => c[2] === 'money';
  const fmt = (c: any, v: any) => (isMoney(c) ? money(v) : (v ?? ''));

  const linhas = useMemo(() => {
    let out = d.rows as any[];

    // 1) filtro rápido por coluna (contém)
    const rapidos = Object.entries(rapido).filter(([, v]) => v.trim());
    if (rapidos.length) {
      out = out.filter((r) => rapidos.every(([k, v]) =>
        String(r[k] ?? '').toLowerCase().includes(v.toLowerCase())));
    }

    // 2) condições compostas (E / OU)
    if (conds.length) {
      out = out.filter((r) => {
        const res = conds.map((c) => bate(r[c.col], c));
        return modo === 'AND' ? res.every(Boolean) : res.some(Boolean);
      });
    }

    // 3) ordenação
    if (ordem) {
      const c = cols.find((x) => x[0] === ordem.col);
      out = [...out].sort((a, b) => {
        const x = a[ordem.col], y = b[ordem.col];
        const nx = num(x), ny = num(y);
        let cmp: number;
        if (isMoney(c) || (nx !== null && ny !== null)) cmp = (nx ?? 0) - (ny ?? 0);
        else cmp = String(x ?? '').localeCompare(String(y ?? ''), 'pt');
        return ordem.asc ? cmp : -cmp;
      });
    }

    return out;
  }, [d.rows, rapido, conds, modo, ordem, cols]);

  const vista = limite ? linhas.slice(0, limite) : linhas;

  // Imprimir e exportar levam o que está NO ECRÃ — com os filtros aplicados e sem as
  // colunas escondidas. Exportar tudo quando se vê metade é a origem de metade dos
  // mal-entendidos com relatórios.
  useEffect(() => { onView?.(vista, visiveis); }, [vista, ocultas]);

  // Os totais são os das linhas FILTRADAS — o rodapé tem de falar do que está no ecrã.
  const totais = useMemo(() => {
    const t: Record<string, number> = {};
    cols.forEach((c) => {
      if (isMoney(c) || d.totals?.[c[0]] !== undefined) {
        t[c[0]] = linhas.reduce((s, r) => s + (num(r[c[0]]) ?? 0), 0);
      }
    });
    return t;
  }, [linhas, cols]);

  const filtrado = linhas.length !== d.rows.length;

  return (
    <>
      {/* ── barra de filtros ── */}
      <div className="flex items-center gap-2 mb-2 text-[12px]">
        <button onClick={() => setPainel(!painel)}
          className={`px-3 py-1 border ${conds.length ? 'border-[#1a73c8] bg-[#e8f0fe] text-[#1a4f8a] font-semibold' : 'border-[#b0b0b0] bg-white'}`}>
          ⚙ Filtros avançados{conds.length ? ` (${conds.length})` : ''}
        </button>
        <button onClick={() => setColsPainel(!colsPainel)}
          className="px-3 py-1 border border-[#b0b0b0] bg-white">
          ▦ Colunas{ocultas.length ? ` (${ocultas.length} ocultas)` : ''}
        </button>
        <span className="ml-2">Mostrar:</span>
        <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}
          className={`${inp} w-[110px]`} style={inputStyle}>
          <option value={0}>Todas</option>
          {[1, 5, 10, 25, 50, 100, 500].map((n) => <option key={n} value={n}>Primeiras {n}</option>)}
        </select>
        {(filtrado || ordem || ocultas.length) && (
          <button onClick={() => { setRapido({}); setConds([]); setOrdem(null); setOcultas([]); setLimite(0); }}
            className="px-3 py-1 border border-[#c0392b] text-[#c0392b] bg-white">Limpar filtros</button>
        )}
        <span className="ml-auto text-[#666]">
          {filtrado
            ? <><b className="text-[#1a4f8a]">{linhas.length}</b> de {d.rows.length} linha(s)</>
            : <>{d.rows.length} linha(s)</>}
          {limite ? ` · a mostrar ${vista.length}` : ''}
        </span>
      </div>

      {colsPainel && (
        <div className="mb-2 p-2 border border-[#d0d0d0] bg-[#fafafa] flex flex-wrap gap-3">
          {cols.map((c) => (
            <label key={c[0]} className="flex items-center gap-1.5 text-[12px] cursor-pointer">
              <input type="checkbox" checked={!ocultas.includes(c[0])}
                onChange={(e) => setOcultas(e.target.checked
                  ? ocultas.filter((x) => x !== c[0]) : [...ocultas, c[0]])}
                className="w-4 h-4" />
              {c[1]}
            </label>
          ))}
        </div>
      )}

      {painel && (
        <div className="mb-2 p-3 border border-[#c0d4ea] bg-[#f5f9ff]">
          <div className="flex items-center gap-3 mb-2 text-[12px]">
            <span className="font-semibold">Mostrar as linhas em que</span>
            <select value={modo} onChange={(e) => setModo(e.target.value as any)}
              className={`${inp} w-[130px]`} style={inputStyle}>
              <option value="AND">TODAS as condições</option>
              <option value="OR">QUALQUER condição</option>
            </select>
            <span>se verificam:</span>
            <button onClick={() => setConds([...conds, { col: cols[0][0], op: 'contains', v1: '', v2: '' }])}
              className="ml-auto px-3 py-1 bg-[#3d6ea5] text-white">+ Condição</button>
          </div>

          {conds.length === 0 && (
            <div className="text-[11px] text-[#666]">
              Sem condições. Clique em <b>+ Condição</b> — por exemplo: <i>Total</i> maior que <i>10000</i>
              {' '}E <i>Operador</i> contém <i>ana</i>.
            </div>
          )}

          {conds.map((c, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-[11px] text-[#666] w-[26px]">{i === 0 ? '' : (modo === 'AND' ? 'E' : 'OU')}</span>
              <select value={c.col}
                onChange={(e) => setConds(conds.map((x, k) => k === i ? { ...x, col: e.target.value } : x))}
                className={`${inp} w-[180px]`} style={inputStyle}>
                {cols.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}
              </select>
              <select value={c.op}
                onChange={(e) => setConds(conds.map((x, k) => k === i ? { ...x, op: e.target.value } : x))}
                className={`${inp} w-[140px]`} style={inputStyle}>
                {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {!['empty', 'nempty'].includes(c.op) && (
                <input value={c.v1}
                  onChange={(e) => setConds(conds.map((x, k) => k === i ? { ...x, v1: e.target.value } : x))}
                  className={`${inp} w-[150px]`} style={inputStyle} />
              )}
              {c.op === 'between' && (<>
                <span className="text-[11px]">e</span>
                <input value={c.v2}
                  onChange={(e) => setConds(conds.map((x, k) => k === i ? { ...x, v2: e.target.value } : x))}
                  className={`${inp} w-[150px]`} style={inputStyle} />
              </>)}
              <button onClick={() => setConds(conds.filter((_, k) => k !== i))}
                className="text-[#c0392b] font-bold px-2">×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── grelha ── */}
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[#e9e9e9]">
            {visiveis.map((c) => (
              <th key={c[0]}
                onClick={() => setOrdem(ordem?.col === c[0]
                  ? { col: c[0], asc: !ordem.asc } : { col: c[0], asc: true })}
                className={`font-bold px-2 py-1.5 border border-[#ccc] cursor-pointer select-none hover:bg-[#dfe7ef]
                  ${isMoney(c) ? 'text-right' : 'text-left'}`}>
                {c[1]}
                {ordem?.col === c[0] && <span className="ml-1 text-[#1a73c8]">{ordem.asc ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
          <tr className="bg-[#f4f4f4]">
            {visiveis.map((c) => (
              <th key={c[0]} className="px-1 py-1 border border-[#e0e0e0]">
                <input value={rapido[c[0]] ?? ''} placeholder="filtrar…"
                  onChange={(e) => setRapido({ ...rapido, [c[0]]: e.target.value })}
                  className="w-full border border-[#c8c8c8] px-1 py-[2px] text-[11px] font-normal" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vista.map((r: any, i: number) => (
            <tr key={i} className={i % 2 ? 'bg-[#fafafa]' : ''}>
              {visiveis.map((c) => (
                <td key={c[0]}
                  className={`px-2 py-1 border border-[#e6e6e6] ${isMoney(c) ? 'text-right' : ''}`}>
                  {fmt(c, r[c[0]])}
                </td>
              ))}
            </tr>
          ))}
          {vista.length === 0 && (
            <tr><td colSpan={visiveis.length} className="text-center text-[#999] py-10 border border-[#e6e6e6]">
              {d.rows.length ? 'Nenhuma linha passa nos filtros.' : 'Não foram encontrados dados no período.'}
            </td></tr>
          )}
        </tbody>
        {Object.keys(totais).length > 0 && (
          <tfoot><tr className="bg-[#f0f0f0] font-bold">
            {visiveis.map((c, i) => (
              <td key={c[0]} className={`px-2 py-1.5 border border-[#ccc] ${isMoney(c) ? 'text-right' : ''}`}>
                {i === 0
                  ? (filtrado ? 'TOTAL (filtrado)' : 'TOTAL')
                  : (totais[c[0]] !== undefined
                    ? (isMoney(c) ? money(totais[c[0]]) : totais[c[0]])
                    : '')}
              </td>
            ))}
          </tr></tfoot>
        )}
      </table>
    </>
  );
}

/** As linhas que estão visíveis (para imprimir/exportar só o que se vê). */
export function filtrarComo(d: any) {
  return d.rows;
}
