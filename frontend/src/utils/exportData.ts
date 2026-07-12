/**
 * Exportação multi-formato SEM dependências externas.
 * Excel/Word usam o truque HTML-table (o Office abre-os nativamente);
 * PDF usa a impressão do browser (guardar como PDF).
 */
export interface Exportcol { header: string; get: (row: any) => any; }

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCSV(rows: any[], cols: ExportcolList, name: string) {
  const head = cols.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(';');
  const body = rows.map((r) => cols.map((c) => `"${String(c.get(r) ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  download(new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' }), `${name}_${stamp()}.csv`);
}

function htmlTable(rows: any[], cols: ExportcolList, title: string) {
  const th = cols.map((c) => `<th style="background:#1e3f66;color:#fff;border:1px solid #999;padding:6px;text-align:left">${esc(c.header)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${cols.map((c) => `<td style="border:1px solid #ccc;padding:5px">${esc(c.get(r))}</td>`).join('')}</tr>`).join('');
  return `<html><head><meta charset="utf-8"></head><body>
    <h2 style="font-family:Arial">${esc(title)}</h2>
    <table style="border-collapse:collapse;font-family:Arial;font-size:12px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
    </body></html>`;
}

export function exportExcel(rows: any[], cols: ExportcolList, name: string, title = name) {
  download(new Blob(['﻿' + htmlTable(rows, cols, title)], { type: 'application/vnd.ms-excel' }), `${name}_${stamp()}.xls`);
}

export function exportWord(rows: any[], cols: ExportcolList, name: string, title = name) {
  download(new Blob(['﻿' + htmlTable(rows, cols, title)], { type: 'application/msword' }), `${name}_${stamp()}.doc`);
}

export function exportJSON(rows: any[], cols: ExportcolList, name: string) {
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.header, c.get(r)])));
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${name}_${stamp()}.json`);
}

export function exportPDF(rows: any[], cols: ExportcolList, name: string, title = name) {
  // Abre uma janela imprimível — o utilizador escolhe "Guardar como PDF".
  const w = window.open('', '_blank', 'width=900,height=650');
  if (!w) { alert('Permita popups para exportar em PDF.'); return; }
  w.document.write(htmlTable(rows, cols, title) + '<script>window.onload=function(){window.print();}<\/script>');
  w.document.close();
}

type ExportcolList = Exportcol[];

/** Exporta a tabela VISÍVEL (DOM) em qualquer formato — usado pelo ribbon (todos os ecrãs). */
export function exportDomTable(table: HTMLTableElement, format: 'pdf' | 'excel' | 'word' | 'csv' | 'json', name: string, title = name) {
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
  const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
    .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.replace(/\s+/g, ' ').trim()))
    .filter((r) => r.length > 0);
  const cols: ExportcolList = (headers.length ? headers : bodyRows[0]?.map((_, i) => `Col ${i + 1}`) || [])
    .map((h, i) => ({ header: h || `Col ${i + 1}`, get: (r: any) => r[i] }));
  const rows = bodyRows;
  if (format === 'pdf') return exportPDF(rows, cols, name, title);
  if (format === 'excel') return exportExcel(rows, cols, name, title);
  if (format === 'word') return exportWord(rows, cols, name, title);
  if (format === 'json') return exportJSON(rows, cols, name);
  return exportCSV(rows, cols, name);
}

export const EXPORT_FORMATS = [
  { key: 'pdf', label: 'PDF', run: exportPDF },
  { key: 'excel', label: 'Excel', run: exportExcel },
  { key: 'word', label: 'Word', run: exportWord },
  { key: 'csv', label: 'CSV', run: exportCSV },
  { key: 'json', label: 'JSON', run: exportJSON },
] as const;
