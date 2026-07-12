import { apiClient } from '../../api/client';

const n = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Gera e imprime a fatura fiscal em A4, com todos os elementos legais exigidos pela AGT:
 * cabeçalho da empresa, cliente, Mesa/Utilizador/Quarto, resumo de IVA por taxa,
 * total por extenso, forma de pagamento e menção "Processado por programa validado".
 */
export async function printCommercialDocument(docId: number) {
  return printDocumentFrom(`fiscal/commercial-documents/${docId}/printout/`);
}

export async function printFiscalInvoice(docId: number, register = true) {
  return printDocumentFrom(`fiscal/documents/${docId}/printout/`, register ? { register: 1 } : {});
}

async function printDocumentFrom(url: string, params: any = {}) {
  const { data: p } = await apiClient.get(url, { params });
  const c = p.company, d = p.document, cust = p.customer, t = p.totals;

  const lines = p.lines.map((l: any) => `
    <tr>
      <td class="num">${Number(l.quantity).toFixed(2)}</td>
      <td>${l.description}</td>
      <td class="num">${n(l.unit_price)}</td>
      <td class="num">${n(l.discount)}</td>
      <td class="num">${Number(l.tax_percentage).toFixed(2)}</td>
      <td class="num">${n(l.total)}</td>
    </tr>`).join('');

  const vat = p.tax_summary.map((s: any) => `
    <tr><td class="num">${Number(s.rate).toFixed(2)}</td><td class="num">${n(s.base)}</td><td class="num">${n(s.tax)}</td><td class="num">${n(s.total)}</td></tr>`).join('');

  const pays = (p.payments || []).map((pm: any) => `
    <tr><td>${pm.method}</td><td class="num">${n(pm.amount)}</td></tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${d.invoice_no}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 24px 32px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 20px; font-weight: bold; }
    .muted { color: #444; }
    .doc-title { font-weight: bold; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    .items { margin-top: 14px; }
    .items th, .items td { border: 1px solid #999; padding: 4px 6px; }
    .items th { background: #f0f0f0; text-align: left; }
    .num { text-align: right; }
    .rowbox { display: flex; gap: 24px; margin-top: 14px; }
    .vat th, .vat td { border: 1px solid #999; padding: 3px 6px; font-size: 11px; }
    .totals td { padding: 3px 8px; }
    .totals .lbl { color: #333; } .totals .val { text-align: right; font-weight: bold; }
    .words { margin-top: 10px; font-style: italic; }
    .mention { margin-top: 18px; font-size: 10px; color: #333; border-top: 1px solid #ccc; padding-top: 6px; }
    .foot { margin-top: 40px; font-size: 10px; color: #333; }
    .sign { margin-top: 34px; border-top: 1px solid #333; width: 240px; text-align: center; font-size: 10px; padding-top: 3px; }
    @media print { body { padding: 10mm; } }
  </style></head><body onload="window.print()">
    <div class="head">
      <div>
        <div class="brand">${c.trade_name || c.name || ''}</div>
        <div class="muted">${c.name || ''}</div>
      </div>
      <div style="text-align:right"><div class="muted">Exmo.(s) Sr.(s)</div><div><b>${cust.name}</b></div>
        <div class="muted">Nº Contribuinte: ${cust.nif || ''}</div>${cust.address ? `<div class="muted">${cust.address}</div>` : ''}</div>
    </div>

    <div class="rowbox" style="justify-content:space-between">
      <div>
        <div class="doc-title">${d.type_name} Nº: ${d.invoice_no} &nbsp; <span>${d.copy_label}</span></div>
        <table style="margin-top:6px">
          <tr><td class="muted">Data:</td><td>${d.date}</td></tr>
          <tr><td class="muted">Mesa:</td><td>${d.place || ''}</td></tr>
          <tr><td class="muted">Utilizador:</td><td>${d.operator || ''}</td></tr>
          <tr><td class="muted">Quarto:</td><td>${d.room || ''}</td></tr>
        </table>
      </div>
    </div>

    <table class="items">
      <thead><tr><th class="num">Qt.</th><th>Descrição</th><th class="num">Preço Unit.</th><th class="num">Desc.</th><th class="num">IVA</th><th class="num">Total</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>

    <div class="rowbox" style="justify-content:space-between">
      <table class="vat" style="width:auto">
        <thead><tr><th colspan="4">Quadro Resumo do IVA</th></tr>
        <tr><th>Taxa</th><th>Incidência</th><th>Valor IVA</th><th>Total</th></tr></thead>
        <tbody>${vat}</tbody>
      </table>
      <table class="totals" style="width:auto">
        <tr><td class="lbl">Subtotal</td><td class="val">${n(t.net)}</td></tr>
        <tr><td class="lbl">IVA</td><td class="val">${n(t.tax)}</td></tr>
        <tr><td class="lbl">Desconto</td><td class="val">${n(t.discount)}</td></tr>
        <tr><td class="lbl"><b>Total (KZ)</b></td><td class="val">${n(t.gross)}</td></tr>
      </table>
    </div>

    <div class="words">${p.amount_in_words || ''}</div>
    ${pays ? `<table class="vat" style="width:auto;margin-top:12px"><thead><tr><th>Modo Pagamento</th><th>Valor</th></tr></thead><tbody>${pays}</tbody></table>` : ''}

    <div class="sign">(assinatura)</div>
    <div class="mention">${p.print_mention || ''} &nbsp;/&nbsp; ${d.invoice_no}${p.qr_data ? `<div style="margin-top:4px;color:#888;word-break:break-all">QR: ${p.qr_data}</div>` : ''}</div>

    ${(p.bank_accounts || []).length ? `
    <div class="banks">
      <div class="banks-title">DADOS BANCÁRIOS PARA PAGAMENTO</div>
      <table class="banks-tbl">
        <thead><tr><th>Banco</th><th>IBAN</th><th>Conta</th><th>Moeda</th></tr></thead>
        <tbody>
          ${p.bank_accounts.map((b: any) => `<tr>
            <td>${b.bank_name || ''}</td>
            <td class="mono">${b.iban || ''}</td>
            <td class="mono">${b.account_number || ''}</td>
            <td>${b.currency || 'AOA'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${p.bank_accounts[0]?.account_holder ? `<div class="muted">Titular: ${p.bank_accounts[0].account_holder}</div>` : ''}
    </div>` : ''}

    <div class="foot">
      <b>${c.name || ''}</b><br/>
      ${c.address || ''} ${c.city ? '· ' + c.city : ''}<br/>
      ${c.phone ? 'Tel. ' + c.phone : ''} ${c.fax ? '| Fax ' + c.fax : ''}<br/>
      ${c.share_capital ? 'Cap. Social ' + c.share_capital + ' - ' : ''}${c.crc_number || ''} · Contribuinte Nº ${c.nif || ''}
    </div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=800,height=1000');
  if (w) { w.document.write(html); w.document.close(); }
}
