import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Controlo de paginação server-side reutilizável.
 * Usa-se com endpoints que suportam ?page=&page_size= (paginação opcional do backend).
 */
export default function Pagination({ page, pageSize, count, onPage }: {
  page: number; pageSize: number; count: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <div className="flex items-center justify-between text-[11px] text-gray-600 px-2 py-1.5 bg-[#f4f4f4] border-t border-[#ddd]">
      <span>{from}–{to} de {count}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="px-2 py-0.5 border border-[#c0c0c0] bg-white disabled:opacity-40 flex items-center gap-0.5"><ChevronLeft size={12} /> Anterior</button>
        <span className="px-2">Página {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="px-2 py-0.5 border border-[#c0c0c0] bg-white disabled:opacity-40 flex items-center gap-0.5">Seguinte <ChevronRight size={12} /></button>
      </div>
    </div>
  );
}
