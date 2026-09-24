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
    <div className="w-full bg-white border border-[#7FA9B1] overflow-auto h-full text-[11px] font-sans">
      <table className="w-full min-w-max border-collapse">
        <thead className="sticky top-0 bg-[#F7FAFA] border-b border-[#7FA9B1] z-10 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={idx} 
                className="text-left py-1 px-2 border-r border-[#EEF4F5] font-normal text-gray-800"
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
                className={`border-b border-[#EEF4F5] cursor-pointer ${
                  isSelected ? 'bg-[#F7FAFA] text-black' : idx % 2 === 0 ? 'bg-white' : 'bg-[#FFFFFF]'
                } hover:bg-[#F7FAFA]`}
              >
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className="py-1 px-2 border-r border-[#EEF4F5] truncate">
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
