import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

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
  selectedRowId?: string | number;
  rowKey?: string;
  filterable?: boolean;   // default: ativa filtro rápido quando há muitas linhas
}

export default function ClassicGrid({ columns, data, onRowClick, onRowDoubleClick, selectedRowId, rowKey = 'id', filterable }: ClassicGridProps) {
  // Seleção interna: destaca a linha clicada mesmo quando o ecrã não gere a seleção.
  const [innerSel, setInnerSel] = useState<string | number | undefined>(undefined);
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
    <div className="w-full bg-white border border-[#a0a0a0] overflow-auto h-full text-[11px] font-sans flex flex-col">
      {showFilter && (
        <div className="flex items-center gap-1 px-2 py-1 bg-[#f7f7f7] border-b border-[#e0e0e0] sticky top-0 z-20">
          <Search size={12} className="text-gray-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar nesta lista…"
            className="flex-1 bg-transparent outline-none text-[11px] py-0.5" />
          {filter && <><span className="text-gray-400 text-[10px]">{rows.length}/{data.length}</span>
            <button onClick={() => setFilter('')} className="text-gray-400 hover:text-gray-700 text-[11px]">✕</button></>}
        </div>
      )}
      <table className="w-full min-w-max border-collapse">
        <thead className="sticky z-10" style={{ top: showFilter ? 25 : 0 }}>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="text-left py-1.5 px-2 border-r border-b border-[#9aa6b6] font-bold text-[#25405e] uppercase tracking-tight text-[10.5px]"
                style={{ width: col.width, background: 'linear-gradient(to bottom, #f7f9fb 0%, #e4e9ef 60%, #d5dbe3 100%)', boxShadow: 'inset 0 1px 0 #fff' }}
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
                className={`border-b border-[#e0e0e0] cursor-pointer ${
                  isSelected ? 'bg-[#cce8ff] text-black' : idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                } hover:bg-[#e6f3ff]`}
              >
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className="py-1 px-2 border-r border-[#e0e0e0] truncate">
                    {typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-4 text-center text-gray-500 bg-white">
                {baseData.length === 0 ? 'Nenhum registo encontrado.' : 'Sem resultados para o filtro.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
