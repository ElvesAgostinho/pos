import React from 'react';

interface Column {
  header: string;
  accessor: string | ((row: any) => React.ReactNode);
  width?: string;
}

interface ClassicGridProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  selectedRowId?: string | number;
  rowKey?: string;
}

export default function ClassicGrid({ columns, data, onRowClick, selectedRowId, rowKey = 'id' }: ClassicGridProps) {
  return (
    <div className="w-full bg-white border border-[#a0a0a0] overflow-auto h-full text-[11px] font-sans">
      <table className="w-full min-w-max border-collapse">
        <thead className="sticky top-0 bg-[#f0f0f0] border-b border-[#a0a0a0] z-10 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={idx} 
                className="text-left py-1 px-2 border-r border-[#d0d0d0] font-normal text-gray-800"
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const isSelected = selectedRowId !== undefined && row[rowKey] === selectedRowId;
            return (
              <tr 
                key={row[rowKey] || idx}
                onClick={() => onRowClick && onRowClick(row)}
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
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-4 text-center text-gray-500 bg-white">
                Nenhum registo encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
