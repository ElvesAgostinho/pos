import { apiClient } from '../../api/client';

const n = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/**
 * Gera e imprime a fatura fiscal em A4, com todos os elementos legais exigidos pela AGT:
 * cabeçalho da empresa com o logótipo do cliente, dados do adquirente, resumo de IVA
 * por taxa, total por extenso, forma de pagamento, QR Code e a menção "Processado por
 * programa validado".
 *
 * O desenho acompanha a pró-forma (o documento que o hóspede confere antes de sair):
 * são as duas faces do mesmo papel e não podiam sair com ar de terem vindo de dois
 * sistemas diferentes. O que distingue a factura é o que a lei exige e a pró-forma não
 * tem — número de série, assinatura, QR e a menção do programa validado.
 */
export async function printCommercialDocument(docId: number) {
  return printDocumentFrom(`fiscal/commercial-documents/${docId}/printout/`);
}

export async function printFiscalInvoice(docId: number, register = true) {
  return printDocumentFrom(`fiscal/documents/${docId}/printout/`, register ? { register: 1 } : {});
}

/** O HTML da fatura, sem imprimir — para pré-visualizar ou anexar a um e-mail. */
export async function buildInvoiceHtml(docId: number) {
  const { data } = await apiClient.get(`fiscal/documents/${docId}/printout/`);
  return montarHtml(data, false);
}

async function printDocumentFrom(url: string, params: any = {}) {
  const { data } = await apiClient.get(url, { params });
  const html = montarHtml(data, true);
  // Janela própria: imprimir a partir da página do ERP arrastava o cabeçalho e a
  // barra de navegação do browser para dentro do papel.
  const w = window.open('', '_blank', 'width=860,height=1000');
  if (w) { w.document.write(html); w.document.close(); }
}

function montarHtml(p: any, imprimir: boolean) {
  const c = p.company, d = p.document, cust = p.customer, t = p.totals;

  const lines = (p.lines || []).map((l: any) => `
    <tr>
      <td class="num">${Number(l.quantity).toFixed(2)}</td>
      <td>${esc(l.description)}${l.exemption_reason ? `<div class="exempt">${esc(l.exemption_reason)}</div>` : ''}</td>
      <td class="num">${n(l.unit_price)}</td>
      <td class="num">${n(l.discount)}</td>
      <td class="num">${Number(l.tax_percentage).toFixed(2)}%</td>
      <td class="num strong">${n(l.total)}</td>
    </tr>`).join('');

  const vat = (p.tax_summary || []).map((s: any) => `
    <tr><td class="num">${Number(s.rate).toFixed(2)}%</td><td class="num">${n(s.base)}</td><td class="num">${n(s.tax)}</td><td class="num">${n(s.total)}</td></tr>`).join('');

  const pays = (p.payments || []).map((pm: any) => `
    <tr><td>${esc(pm.method)}</td><td class="num">${n(pm.amount)}</td></tr>`).join('');

  // O logótipo é o que o CLIENTE carregou (fiscal/config). Sem logótipo não se
  // põe imagem nenhuma de reserva — o papel do hotel não leva a marca do
  // fornecedor do software.
  const logo = c.logo_url
    ? `<img src="${esc(c.logo_url)}" alt="" class="logo" />`
    : '';

  const copia = (d.copy_label || '').toLowerCase() !== 'original';

  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(d.invoice_no)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11.5px; color: #15232b;
           margin: 0; padding: 18mm 16mm; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* Cabeçalho */
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
            border-bottom: 2px solid #062F35; padding-bottom: 10px; }
    .logo { max-height: 56px; max-width: 200px; display: block; margin-bottom: 6px; }
    .brand { font-size: 19px; font-weight: 700; color: #062F35; letter-spacing: .2px; }
    .company-line { color: #5b6b73; font-size: 10.5px; line-height: 1.45; margin-top: 2px; }
    .party { text-align: right; min-width: 210px; }
    .party-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; color: #4B858E; }
    .party-name { font-weight: 700; font-size: 13px; margin-top: 1px; }
    .party-line { color: #5b6b73; font-size: 10.5px; }

    /* Faixa do documento */
    .docbar { display: flex; justify-content: space-between; align-items: center; gap: 16px;
              background: #F2F7F8; border: 1px solid #D8E7EA; border-radius: 6px;
              padding: 9px 12px; margin-top: 14px; }
    .doc-title { font-size: 15px; font-weight: 700; color: #062F35; }
    .badge { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
             letter-spacing: .6px; padding: 2px 8px; border-radius: 999px; margin-left: 8px;
             background: #062F35; color: #fff; }
    .badge.copy { background: #C94A4A; }
    .meta { display: flex; gap: 18px; font-size: 10.5px; }
    .meta div span { color: #4B858E; display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }

    /* Linhas */
    table { width: 100%; border-collapse: collapse; }
    .items { margin-top: 12px; }
    .items th { background: #062F35; color: #fff; text-align: left; font-weight: 600;
                padding: 6px 8px; font-size: 10.5px; }
    .items td { padding: 6px 8px; border-bottom: 1px solid #E6EFF1; vertical-align: top; }
    .items tbody tr:nth-child(even) td { background: #FAFCFC; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 700; }
    .exempt { font-size: 9.5px; color: #C94A4A; margin-top: 2px; }

    /* IVA + totais */
    .rowbox { display: flex; gap: 20px; margin-top: 14px; align-items: flex-start;
              justify-content: space-between; }
    .vat { width: auto; border: 1px solid #D8E7EA; border-radius: 6px; overflow: hidden; }
    .vat th { background: #F2F7F8; color: #062F35; font-size: 9.5px; font-weight: 700;
              text-transform: uppercase; letter-spacing: .4px; padding: 4px 8px; border-bottom: 1px solid #D8E7EA; }
    .vat td { padding: 4px 8px; font-size: 10.5px; border-bottom: 1px solid #E4E9EB; }
    .totals { width: 258px; }
    .totals td { padding: 4px 10px; font-size: 11.5px; }
    .totals .lbl { color: #5b6b73; }
    .totals .val { text-align: right; font-weight: 600; }
    .totals .grand td { background: #062F35; color: #fff; font-size: 13.5px; font-weight: 700;
                        padding: 8px 10px; }
    .totals .grand td:last-child { text-align: right; }

    .words { margin-top: 10px; font-style: italic; color: #41535c; font-size: 11px; }

    /* Rodapé legal */
    .legal { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px;
             margin-top: 22px; border-top: 1px solid #D8E7EA; padding-top: 10px; }
    .qr { text-align: center; }
    .qr img { width: 96px; height: 96px; display: block; }
    .qr small { font-size: 8.5px; color: #4B858E; }
    .mention { font-size: 9.5px; color: #41535c; line-height: 1.5; flex: 1; }

    /* Bancos */
    .banks { margin-top: 16px; border: 1px solid #D8E7EA; border-radius: 6px; overflow: hidden; }
    .banks-title { background: #F2F7F8; padding: 5px 10px; font-size: 9.5px; font-weight: 700;
                   text-transform: uppercase; letter-spacing: .5px; color: #062F35;
                   border-bottom: 1px solid #D8E7EA; }
    .banks-tbl th { background: #FAFCFC; text-align: left; font-size: 9.5px; color: #5b6b73;
                    padding: 4px 10px; border-bottom: 1px solid #E4E9EB; }
    .banks-tbl td { padding: 4px 10px; font-size: 10.5px; border-bottom: 1px solid #F3F8F9; }
    .mono { font-family: "Courier New", monospace; }

    .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #E4E9EB;
            font-size: 9.5px; color: #7b8a91; line-height: 1.55; text-align: center; }
    @media print { body { padding: 12mm 14mm; } .noprint { display: none; } }
  </style></head><body${imprimir ? ' onload="window.print()"' : ''}>

    <div class="head">
      <div>
        ${logo}
        <div class="brand">${esc(c.trade_name || c.name || '')}</div>
        <div class="company-line">
          ${esc(c.name || '')}${c.nif ? ` · NIF ${esc(c.nif)}` : ''}<br/>
          ${esc(c.address || '')}${c.city ? ' · ' + esc(c.city) : ''}${c.province ? ' · ' + esc(c.province) : ''}<br/>
          ${c.phone ? 'Tel. ' + esc(c.phone) : ''}${c.email ? ' · ' + esc(c.email) : ''}
        </div>
      </div>
      <div class="party">
        <div class="party-label">Exmo.(s) Sr.(s)</div>
        <div class="party-name">${esc(cust.name)}</div>
        <div class="party-line">Nº Contribuinte: ${esc(cust.nif || 'Consumidor Final')}</div>
        ${cust.address ? `<div class="party-line">${esc(cust.address)}</div>` : ''}
      </div>
    </div>

    <div class="docbar">
      <div class="doc-title">${esc(d.type_name)} Nº ${esc(d.invoice_no)}
        <span class="badge${copia ? ' copy' : ''}">${esc(d.copy_label)}</span></div>
      <div class="meta">
        <div><span>Data</span>${esc(d.date)}</div>
        ${d.room ? `<div><span>Quarto</span>${esc(d.room)}</div>` : ''}
        ${d.place ? `<div><span>Mesa</span>${esc(d.place)}</div>` : ''}
        ${d.operator ? `<div><span>Utilizador</span>${esc(d.operator)}</div>` : ''}
      </div>
    </div>

    <table class="items">
      <thead><tr>
        <th class="num" style="width:52px">Qt.</th><th>Descrição</th>
        <th class="num" style="width:92px">Preço Unit.</th><th class="num" style="width:68px">Desc.</th>
        <th class="num" style="width:58px">IVA</th><th class="num" style="width:96px">Total</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>

    <div class="rowbox">
      <table class="vat">
        <thead><tr><th colspan="4">Quadro resumo do IVA</th></tr>
        <tr><th>Taxa</th><th class="num">Incidência</th><th class="num">Valor IVA</th><th class="num">Total</th></tr></thead>
        <tbody>${vat}</tbody>
      </table>
      <table class="totals">
        <tr><td class="lbl">Subtotal</td><td class="val">${n(t.net)}</td></tr>
        <tr><td class="lbl">IVA</td><td class="val">${n(t.tax)}</td></tr>
        ${Number(t.discount) ? `<tr><td class="lbl">Desconto</td><td class="val">− ${n(t.discount)}</td></tr>` : ''}
        <tr class="grand"><td>Total (KZ)</td><td>${n(t.gross)}</td></tr>
      </table>
    </div>

    <div class="words">${esc(p.amount_in_words || '')}</div>

    ${pays ? `<table class="vat" style="width:auto;margin-top:12px">
      <thead><tr><th>Modo de pagamento</th><th class="num">Valor</th></tr></thead>
      <tbody>${pays}</tbody></table>` : ''}

    ${(p.bank_accounts || []).length ? `
    <div class="banks">
      <div class="banks-title">Dados bancários para pagamento</div>
      <table class="banks-tbl">
        <thead><tr><th>Banco</th><th>IBAN</th><th>Conta</th><th>Moeda</th></tr></thead>
        <tbody>
          ${p.bank_accounts.map((b: any) => `<tr>
            <td>${esc(b.bank_name || '')}</td>
            <td class="mono">${esc(b.iban || '')}</td>
            <td class="mono">${esc(b.account_number || '')}</td>
            <td>${esc(b.currency || 'AOA')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${p.bank_accounts[0]?.account_holder ? `<div style="padding:4px 10px;font-size:10px;color:#5b6b73">Titular: ${esc(p.bank_accounts[0].account_holder)}</div>` : ''}
    </div>` : ''}

    <div class="legal">
      ${p.qr_png ? `<div class="qr"><img src="${p.qr_png}" alt="QR Code" /><small>QR AGT</small></div>` : ''}
      <div class="mention">${esc(p.print_mention || '')}</div>
    </div>

    <div class="foot">
      <b>${esc(c.name || '')}</b> · ${esc(c.address || '')}${c.city ? ' · ' + esc(c.city) : ''}
      ${c.phone ? ' · Tel. ' + esc(c.phone) : ''}<br/>
      ${c.share_capital ? 'Capital Social ' + esc(c.share_capital) + ' · ' : ''}${c.crc_number ? esc(c.crc_number) + ' · ' : ''}Contribuinte Nº ${esc(c.nif || '')}
    </div>
  </body></html>`;

  return html;
}
