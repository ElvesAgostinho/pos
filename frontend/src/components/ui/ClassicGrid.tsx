import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { TOKENS } from '../../config/theme';

interface Column {
  header: string;
  accessor: string | ((row: any) => React.ReactNode);
  width?: string;
}

interface ClassicGridProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  onRowDoubleClick?: (row: any) => void;
  /**
   * A linha escolhida, quando o ECRÃ é que gere a seleção.
   *
   *  · omitido        → a grelha gere-se a si própria (realce interno);
   *  · `null`         → o ecrã gere, e neste momento NÃO há nada escolhido;
   *  · um id          → o ecrã gere, e é esta a linha.
   *
   * A diferença entre omitido e `null` não é um pormenor de tipos. Um ecrã que
   * passava `selId ?? undefined` e depois limpava a seleção caía outra vez no
   * realce INTERNO da grelha — que ainda tinha a linha clicada antes. Via-se
   * uma linha acesa com o formulário ao lado vazio e o botão Eliminar apagado:
   * três sinais a dizerem coisas diferentes ao mesmo tempo.
   */
  selectedRowId?: string | number | null;
  rowKey?: string;
  filterable?: boolean;   // default: ativa filtro rápido quando há muitas linhas
}

export default function ClassicGrid({ columns, data, onRowClick, onRowDoubleClick, selectedRowId, rowKey = 'id', filterable }: ClassicGridProps) {
  // Seleção interna: destaca a linha clicada mesmo quando o ecrã não gere a seleção.
  const [innerSel, setInnerSel] = useState<string | number | undefined>(undefined);
  // `null` conta como "o ecrã manda e não há nada escolhido" — ver a nota na
  // prop. Só `undefined` (prop omitida) devolve o comando à grelha.
  const effectiveSel = selectedRowId !== undefined ? selectedRowId : innerSel;

  // Dados defensivos: aceita array OU objeto paginado ({results}), e ignora linhas nulas
  // (evita "Cannot read properties of null (reading 'id')").
  const baseData: any[] = Array.isArray(data)
    ? data.filter((r) => r != null)
    : (((data as any)?.results as any[]) || []).filter((r) => r != null);

  // Filtro rápido embutido (client-side, sobre todos os campos da linha).
  const [filter, setFilter] = useState('');
  const showFilter = filterable ?? (baseData.length > 8);
  const rows = useMemo(() => {
    if (!filter.trim()) return baseData;
    const q = filter.toLowerCase();
    return baseData.filter((r) => {
      try { return JSON.stringify(r).toLowerCase().includes(q); } catch { return true; }
    });
  }, [baseData, filter]);

  return (
    <div className="w-full bg-white border border-[#C8C8C8] overflow-auto h-full text-[11.5px] font-sans flex flex-col">
      {showFilter && (
        <div className="flex items-center gap-1.5 px-2 py-[3px] bg-white border-b border-[#D4D4D4] sticky top-0 z-20">
          <Search size={12} className="text-gray-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar nesta lista…"
            className="flex-1 bg-transparent outline-none text-[11.5px] py-0" />
          {filter && <><span className="text-gray-400 text-[10px]">{rows.length}/{data.length}</span>
            <button onClick={() => setFilter('')} className="text-gray-400 hover:text-gray-700"><X size={12} /></button></>}
        </div>
      )}
      {/* `table-layout: fixed` — sem isto a grelha mostrava UMA coluna.
          Cada célula tem `truncate`, que inclui `white-space: nowrap`, e a tabela
          tinha `min-w-max`: a tabela crescia até caber o conteúdo mais comprido de
          CADA célula numa só linha — e com um `<select>` lá dentro isso são
          milhares de pixéis. As larguras em percentagem que cada ecrã declara
          nunca chegavam a aplicar-se (numa tabela automática, a largura pedida é
          uma sugestão que o conteúdo atropela), e o utilizador via a primeira
          coluna e uma barra de deslocamento.
          Em modo fixo manda a largura declarada, o `truncate` passa a cortar com
          reticências — que era o que ele queria dizer — e as colunas aparecem
          todas. O `minWidth` garante 90px por coluna: numa grelha de catorze
          colunas vale mais deslizar do que espremer tudo até ficar ilegível. */}
      <table className="w-full border-collapse"
        style={{ tableLayout: 'fixed', minWidth: `${columns.length * 90}px` }}>
        <thead className="sticky z-10" style={{ top: showFilter ? 24 : 0 }}>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="text-left py-[2px] px-1.5 border-b font-semibold text-[11px]"
                style={{
                  width: col.width, borderColor: TOKENS.lineSoft, color: TOKENS.textMuted,
                  background: TOKENS.toolbarBg,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isSelected = effectiveSel !== undefined && row[rowKey] === effectiveSel;
            return (
              <tr
                key={row[rowKey] || idx}
                onClick={() => { setInnerSel(row[rowKey] ?? idx); onRowClick && onRowClick(row); }}
                onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(row)}
                data-sel={isSelected ? '1' : undefined}
                className="border-b border-[#F1F2F4] cursor-pointer transition-colors hover:bg-[#EEF1F5]"
                style={{
                  background: isSelected ? TOKENS.selectedBg : idx % 2 === 0 ? TOKENS.surface : '#FFFFFF',
                  color: isSelected ? TOKENS.textOnSelection : undefined,
                }}
              >
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className="py-[2px] px-1.5 truncate">
                    {typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-3 text-center text-gray-500 bg-white">
                {baseData.length === 0 ? 'Nenhum registo encontrado.' : 'Sem resultados para o filtro.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
