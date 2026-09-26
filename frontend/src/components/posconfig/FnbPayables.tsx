import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money, Glyph, SearchButton } from './kit';

const inp = 'border border-[#7FA9B1] px-2 py-[3px] text-[12px] bg-white';
const L = ({ w = 'w-[100px]', children }: any) => (
  <span className={`text-[12px] text-[#041F24] ${w} flex-shrink-0`}>{children}</span>
);

/**
 * CONTAS A PAGAR — a quem devemos, e quanto.
 *
 * Não é uma lista nova: são as COMPRAS (documentos de séries marcadas como "Documento
 * a pagar") que ainda não foram pagas, agrupadas pela ENTIDADE do cadastro. Muda-se a
 * caixa da série e o documento entra — ou sai — daqui. Não há regra escondida no código.
 */
export default function FnbPayables() {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const [aplicado, setAplicado] = useState<any>({});
  const [sel, setSel] = useState<number | null>(null);
  const [aberta, setAberta] = useState<any | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['pay', aplicado],
    queryFn: async () => {
      const params: any = {};
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      return (await apiClient.get('pos/fnb/payables/', { params })).data;
    },
  });

  // (10537) "Recibo de pagamento" — nativo, sem SSRS nem modelo a escolher: o mesmo
  // padrão de impressão já usado na Ficha Técnica e nos talões do POS.
  const imprimirRecibo = (doc: any) => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.write(`<html><head><title>Recibo de Pagamento — ${doc.number}</title>
      <style>body{font-family:sans-serif;font-size:13px;padding:16px}
      h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}
      td{padding:4px 0}.tot{font-weight:bold;font-size:16px;border-top:1px solid #7FA9B1;padding-top:6px}</style>
      </head><body>
      <h2>Recibo de Pagamento</h2>
      <div>${aberta?.name || ''}${aberta?.other ? ` — NIF ${aberta.other}` : ''}</div>
      <table>
        <tr><td>Documento</td><td style="text-align:right">${doc.number}</td></tr>
        <tr><td>Data do documento</td><td style="text-align:right">${doc.date}</td></tr>
        <tr><td>Referência do fornecedor</td><td style="text-align:right">${doc.external_ref || '—'}</td></tr>
        <tr><td>Pago em</td><td style="text-align:right">${new Date().toLocaleString('pt-PT')}</td></tr>
        <tr class="tot"><td>Valor pago</td><td style="text-align:right">${money(doc.total)} Kz</td></tr>
      </table></body></html>`);
    w.document.close();
    w.print();
  };

  const pagar = useMutation({
    mutationFn: (id: number) => apiClient.post(`pos/fnb/documents/${id}/pay/`, {}),
    onSuccess: (r: any, id: number) => {
      qc.invalidateQueries({ queryKey: ['pay'] });
      const doc = aberta?.documents?.find((d: any) => d.id === id);
      if (doc) imprimirRecibo(doc);
      setAberta(null);
      notifyGuide({ title: 'Pago', message: r.data.detail });
    },
    onError: notifyError,
  });

  const rows: any[] = data?.rows || [];
  const paginas = Math.max(1, Math.ceil(rows.length / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const selRow = rows.find((r) => r.id === sel);

  const Campo = ({ k, label, w = 'w-[220px]' }: any) => (
    <div className="flex items-center gap-2">
      <L>{label}</L>
      <input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && setAplicado({ ...f })}
        className={`${inp} ${w}`} style={inputStyle} />
    </div>
  );

  // ─────────────── a conta de um fornecedor
  if (aberta) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-3 py-2 bg-[#F7FAFA] text-[#062A31] text-[13px] font-bold border-b border-[#CFE3E6] flex">
          <span>{aberta.name} — NIF {aberta.other || '—'}</span>
          <span className="ml-auto">
            Saldo: <b className="text-[16px] text-[#B0392B]">{money(aberta.balance)} Kz</b>
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0"><tr className="bg-[#F7FAFA]">
              {['Documento', 'Data', 'Vencimento', 'Ref. fornecedor', 'Total', 'Stock', ''].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#EEF4F5]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {aberta.documents.map((d: any) => {
                const vencido = d.due_date && new Date(d.due_date) < new Date();
                return (
                  <tr key={d.id} className="border-b border-[#F7FAFA]">
                    <td className="px-2 py-1 font-mono">{d.number}</td>
                    <td className="px-2 py-1">{d.date}</td>
                    <td className="px-2 py-1 flex items-center gap-1" style={{ color: vencido ? '#B0392B' : undefined }}>
                      {d.due_date || '—'}{vencido && <><Glyph icon="⚠" size={12} /> vencido</>}
                    </td>
                    <td className="px-2 py-1 text-[#5C8891]">{d.external_ref || '—'}</td>
                    <td className="px-2 py-1 text-right font-bold">{money(d.total)}</td>
                    <td className="px-2 py-1">
                      <span className={`px-2 py-0.5 text-[11px] ${d.posted
                        ? 'bg-[#F7FAFA] text-[#062A31]' : 'bg-[#F7FAFA] text-[#062A31]'}`}>
                        {d.posted ? 'Lançado' : 'Por lançar'}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => pagar.mutate(d.id)}
                        className="text-[11px] text-[#062A31] hover:underline">Marcar como pago</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Toolbar actions={[{ label: 'Voltar', icon: '◀', color: '#5C8891', onClick: () => setAberta(null) }]} right={
          <span className="text-[11px] text-[#5C8891]">
            Pagar tira o documento daqui. O que já foi lançado no stock não muda — a mercadoria entrou.
          </span>
        } />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7FAFA]">
      <div className="p-3">
        <fieldset className="bg-white px-3 pb-3" style={{ border: '1px solid #CFE3E6', borderRadius: '10px', boxShadow: '0 1px 2px rgba(6,42,49,0.06), 0 2px 8px rgba(6,42,49,0.06)' }}>
          <legend className="text-[12px] px-1">Critérios de pesquisa</legend>
          <div className="flex gap-10">
            <div className="space-y-2">
              <Campo k="id" label="ID:" w="w-[100px]" />
              <Campo k="name" label="Nome:" />
              <Campo k="q" label="Pesquisa livre:" />
            </div>
            <div className="space-y-2">
              <Campo k="tax_id" label="Nr. contrib.:" />
              <Campo k="phone" label="Telefone:" />
              <Campo k="address" label="Morada:" />
            </div>
            <SearchButton onClick={() => { setAplicado({ ...f }); setPage(1); }} className="ml-auto" />
          </div>
        </fieldset>
      </div>

      <div className="flex-1 overflow-auto bg-white border-t border-[#EEF4F5]">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#F7FAFA]">
            {['Principal', 'Morada', 'Contacto', 'Outra', 'Documentos', 'Saldo'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#EEF4F5] border-r border-r-[#F7FAFA]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {vista.map((r) => (
              <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setAberta(r)}
                className={`border-b border-[#F7FAFA] cursor-pointer ${sel === r.id ? 'bg-[#F7FAFA]' : 'hover:bg-[#FFFFFF]'}`}>
                <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                <td className="px-2 py-1.5">{r.address || '—'}</td>
                <td className="px-2 py-1.5">{r.contact || '—'}</td>
                <td className="px-2 py-1.5 text-[#5C8891]">{r.other || '—'}</td>
                <td className="px-2 py-1.5 text-right">{r.documents.length}</td>
                <td className="px-2 py-1.5 text-right font-bold text-[#B0392B]">{money(r.balance)}</td>
              </tr>
            ))}
            {vista.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#7FA9B1] py-12">Não foram encontrados dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F7FAFA] border-t border-[#EEF4F5] text-[12px]">
        <span>Nº registos a visualizar:</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className={`${inp} w-[70px]`} style={inputStyle}>
          {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30">◀</button>
        <span>Página {page} de {paginas}</span>
        <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30">▶</button>
        <span className="ml-auto">
          Total a pagar: <b className="text-[#B0392B] text-[14px]">{money(data?.total_due || 0)} Kz</b>
        </span>
      </div>

      <Toolbar actions={[
        { label: 'Abrir', icon: '▸', color: '#5C8891', disabled: !sel, onClick: () => setAberta(selRow) },
      ]} right={
        <span className="text-[11px] text-[#5C8891]">
          Vem das Compras: só entram as séries marcadas como "Documento a pagar".
        </span>
      } />
    </div>
  );
}
