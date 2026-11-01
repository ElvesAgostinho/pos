import { apiClient } from '../../api/client';

/**
 * O DINHEIRO NO PAPEL. Agrupado SEMPRE em milhares, com duas casas.
 *
 * `toLocaleString('pt-PT')` parece a escolha óbvia e está errada aqui: a regra
 * portuguesa só agrupa a partir de cinco algarismos, e na mesma coluna saía
 * "45 000,00" ao lado de "7500,00". Numa coluna de dinheiro isso lê-se como
 * erro de quem escreveu a factura, não como regra de tipografia.
 *
 * Feito à mão e não por `Intl`, porque num documento fiscal o que sai no papel
 * não pode depender do idioma do computador onde se imprime.
 */
const n = (v: any) => {
  const x = Math.abs(Number(v) || 0);
  const [inteiro, decimal] = x.toFixed(2).split('.');
  // ESPAÇO QUE NÃO QUEBRA: com um espaço normal, "119 985,00" podia partir-se
  // ao fim da célula e deixar "119" numa linha e "985,00" na seguinte.
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${(Number(v) || 0) < 0 ? '-' : ''}${agrupado},${decimal}`;
};
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

/**
 * O MESMO DESENHADOR, com um modelo por cima.
 *
 * É o que o ecrã de Modelos de Impressão usa para a pré-visualização. Tinha de
 * ser esta função e não uma parecida: uma pré-visualização desenhada à parte
 * mostra o que o programador acha que vai sair, e no dia em que o papel mudar
 * passa a mentir. Aqui, o que se vê no ecrã é literalmente o que sai na
 * impressora — é o mesmo código a correr.
 */
export function previewComModelo(dados: any, modelo: any) {
  return montarHtml({ ...dados, template: { ...(dados?.template || {}), ...(modelo || {}) } }, false);
}

async function printDocumentFrom(url: string, params: any = {}) {
  const { data } = await apiClient.get(url, { params });
  const html = montarHtml(data, true);
  // Janela própria: imprimir a partir da página do ERP arrastava o cabeçalho e a
  // barra de navegação do browser para dentro do papel.
  const w = window.open('', '_blank', 'width=860,height=1000');
  if (w) { w.document.write(html); w.document.close(); }
}


/**
 * O PAPEL.
 *
 * ─── O REGISTO, E PORQUÊ ESTE ─────────────────────────────────────────────
 * Era azul de ponta a ponta: cabeçalho azul, faixa azul, cabeçalho da tabela
 * azul cheio, totais numa barra azul, rodapé azul, cantos redondos. Lia-se
 * como um recibo de aplicação de telemóvel — e a factura é o documento que o
 * hotel entrega na mão do hóspede, muitas vezes a única coisa impressa que ele
 * leva da casa.
 *
 * O registo agora é o da PAPELARIA DE HOTEL: tinta escura sobre branco, muito
 * espaço, traços de meio ponto, maiúsculas pequenas e espaçadas nos rótulos, e
 * a cor da casa em três sítios e mais nenhum — o fio por baixo do cabeçalho, o
 * filete do quadro de totais e a barra do total. O nome do hotel e o título do
 * documento em serifa, que é o que distingue papel de hotel de papel de loja.
 *
 * ─── O QUE SAI SEMPRE, HAJA MODELO OU NÃO ─────────────────────────────────
 * Tudo o que a lei exige: número, data, NIF das duas partes, o quadro resumo
 * do IVA por taxa, o total por extenso, o QR da AGT e a menção "Processado por
 * programa validado". Não há caixa para os desligar — uma factura sem eles não
 * é uma factura mal desenhada, é uma factura inválida, e quem responde por
 * isso é o hotel.
 *
 * O MODELO (Configuração › Modelos de Impressão) manda no resto: a cor, a
 * altura do logótipo, o texto que a casa acrescenta, e o que se mostra por
 * conveniência. Sem modelo vêm os valores de fábrica, e nada muda para quem
 * nunca criar um.
 */
function montarHtml(p: any, imprimir: boolean) {
  const c = p.company || {}, d = p.document || {}, cust = p.customer || {}, t = p.totals || {};
  const m = p.template || {};
  const cor = m.accent_color || '#1F3A5F';
  const ligado = (chave: string, porDefeito: boolean) => (m[chave] === undefined ? porDefeito : !!m[chave]);

  const lines = (p.lines || []).map((l: any) => `
    <tr>
      <td class="num">${Number(l.quantity).toFixed(2)}</td>
      <td>${esc(l.description)}${l.exemption_reason ? `<div class="exempt">${esc(l.exemption_reason)}</div>` : ''}</td>
      <td class="num">${n(l.unit_price)}</td>
      <td class="num">${Number(l.discount) ? n(l.discount) : '&mdash;'}</td>
      <td class="num">${Number(l.tax_percentage).toFixed(0)}%</td>
      <td class="num strong">${n(l.total)}</td>
    </tr>`).join('');

  const vat = (p.tax_summary || []).map((s: any) => `
    <tr><td>${Number(s.rate).toFixed(0)}%</td><td class="num">${n(s.base)}</td>
    <td class="num">${n(s.tax)}</td><td class="num">${n(s.total)}</td></tr>`).join('');

  const pays = (p.payments || []).map((pm: any) => `
    <tr><td>${esc(pm.method)}</td><td class="num">${n(pm.amount)}</td></tr>`).join('');

  // O logótipo é o que o CLIENTE carregou. Sem logótipo não se põe imagem
  // nenhuma de reserva — o papel do hotel não leva a marca do fornecedor do
  // software, e um quadrado cinzento a dizer "logo" é pior do que nada.
  const alturaLogo = Number(m.logo_height_mm || 16);
  const logo = (c.logo_url && ligado('show_logo', true))
    ? `<img src="${esc(c.logo_url)}" alt="" class="logo" style="max-height:${alturaLogo}mm" />`
    : '';

  const copia = (d.copy_label || '').toLowerCase() !== 'original';

  // Os dados bancários: as contas da FICHA DA EMPRESA (com IBAN) e, se o modelo
  // tiver texto próprio, também esse. Não é ou-ou — uma casa pode ter as contas
  // registadas E uma instrução de pagamento à parte.
  const contas = (p.bank_accounts || []);
  const mostraBanco = ligado('show_bank_details', false) || contas.length > 0;

  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(d.invoice_no)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: ${m.page_format === 'A5' ? 'A5' : 'A4'}; margin: 0; }
    body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5px; color: #1A1A1A;
           margin: 0; padding: 16mm 15mm 14mm; background: #fff; line-height: 1.45;
           -webkit-print-color-adjust: exact; print-color-adjust: exact;
           font-variant-numeric: tabular-nums; }
    .serif { font-family: Georgia, "Times New Roman", serif; }

    /* RÓTULO — maiúsculas pequenas e espaçadas. É o que separa "o que isto é"
       de "o que isto diz", sem precisar de uma cor nem de uma caixa. */
    .lbl { font-size: 7.5px; letter-spacing: 1.1px; text-transform: uppercase; color: #8A8A8A; }

    /* ═══ CABEÇALHO ═══ */
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; }
    .logo { max-width: 56mm; display: block; margin-bottom: 4mm; }
    .brand { font-size: 17px; font-weight: 600; letter-spacing: .3px; color: #1A1A1A; }
    .company-line { color: #6E6E6E; font-size: 9px; line-height: 1.6; margin-top: 3px; }
    .party { text-align: right; min-width: 62mm; }
    .party-name { font-weight: 600; font-size: 12px; margin-top: 2px; }
    .party-line { color: #6E6E6E; font-size: 9.5px; }
    /* O FIO. Na cor da casa — o primeiro dos três sítios onde ela aparece. Uma
       linha fina lê-se como gravura; uma grossa, como aviso. */
    .rule { height: 1.4px; background: ${cor}; margin: 5mm 0 0; }

    /* ═══ O DOCUMENTO ═══ */
    .docbar { display: flex; justify-content: space-between; align-items: flex-end;
              gap: 16px; margin-top: 5mm; }
    .doc-title { font-size: 19px; font-weight: 400; letter-spacing: .5px; color: #1A1A1A; }
    .doc-no { font-size: 12px; color: #4A4A4A; margin-top: 1px; letter-spacing: .4px; }
    .copy { display: inline-block; font-size: 8px; letter-spacing: 1px; text-transform: uppercase;
            padding: 1.5px 6px; border: .5px solid #B03A2E; color: #B03A2E; margin-left: 7px;
            vertical-align: 3px; }
    .meta { display: flex; gap: 9mm; text-align: right; }
    .meta div b { display: block; font-weight: 600; font-size: 10.5px; margin-top: 1px; }

    /* ═══ LINHAS ═══ */
    table { width: 100%; border-collapse: collapse; }
    .items { margin-top: 5mm; }
    /* Sem cabeçalho de cor cheia: um filete em cima, outro em baixo, e o rótulo
       entre os dois. É o quadro de uma pauta, não um botão. */
    .items thead th { text-align: left; padding: 2mm 2.5mm; font-size: 7.5px; letter-spacing: 1.1px;
                      text-transform: uppercase; color: #6E6E6E; font-weight: 600;
                      border-top: .8px solid #1A1A1A; border-bottom: .5px solid #C8C8C8; }
    .items td { padding: 2.2mm 2.5mm; border-bottom: .5px solid #EDEDED; vertical-align: top; }
    .items tbody tr:last-child td { border-bottom: .8px solid #1A1A1A; }
    .num { text-align: right; white-space: nowrap; }
    .strong { font-weight: 600; }
    .exempt { font-size: 8.5px; color: #B03A2E; margin-top: 1px; font-style: italic; }

    /* ═══ IVA E TOTAIS ═══ */
    .rowbox { display: flex; gap: 10mm; margin-top: 4mm; align-items: flex-start;
              justify-content: space-between; }
    .vat { width: auto; }
    .vat caption { text-align: left; font-size: 7.5px; letter-spacing: 1.1px; text-transform: uppercase;
                   color: #8A8A8A; padding-bottom: 1.5mm; }
    .vat th { text-align: left; font-size: 8px; color: #6E6E6E; font-weight: 600;
              padding: 1.4mm 4mm 1.4mm 0; border-bottom: .5px solid #C8C8C8; }
    /* O ESPAÇO ENTRE COLUNAS. Com "padding-right: 0" nas colunas numéricas,
       os três números do quadro do IVA saíam colados num só: lia-se
       "105 250,0014 735,00119 985,00". Num quadro fiscal isso não é feio —
       é ilegível, e é o quadro que a AGT exige. */
    .vat th.num, .vat td.num { text-align: right; padding: 1.4mm 0 1.4mm 7mm; }
    .vat th:first-child, .vat td:first-child { padding-left: 0; }
    .vat td { padding: 1.4mm 4mm 1.4mm 0; font-size: 9.5px; border-bottom: .5px solid #EDEDED; }

    .totals { width: 72mm; border-top: 1.4px solid ${cor}; }
    .totals td { padding: 1.6mm 0; font-size: 10.5px; }
    .totals .k { color: #6E6E6E; }
    .totals .v { text-align: right; }
    /* A BARRA DO TOTAL — o terceiro e último sítio com a cor da casa. É o
       número que o hóspede procura primeiro, e o único que tem de saltar. */
    .totals .grand td { background: ${cor}; color: #fff; font-size: 13px; font-weight: 600;
                        padding: 2.6mm 3mm; letter-spacing: .3px; }
    .totals .grand td:last-child { text-align: right; }

    .words { margin-top: 3mm; color: #4A4A4A; font-size: 9.5px; }
    .words i { color: #8A8A8A; font-style: normal; }

    /* ═══ BLOCOS DO FIM ═══ */
    .cols { display: flex; gap: 10mm; margin-top: 5mm; }
    .col { flex: 1; }
    .mono { font-family: "Courier New", monospace; font-size: 9.5px; letter-spacing: -.2px; }
    .note { font-size: 9px; color: #6E6E6E; line-height: 1.6; white-space: pre-line; }

    .sign { margin-top: 12mm; display: flex; gap: 14mm; }
    .sign div { flex: 1; border-top: .5px solid #8A8A8A; padding-top: 1.5mm;
                font-size: 8px; letter-spacing: 1px; text-transform: uppercase; color: #8A8A8A; }

    .legal { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm;
             margin-top: 6mm; padding-top: 3mm; border-top: .5px solid #D8D8D8; }
    .qr img { width: 22mm; height: 22mm; display: block; }
    .mention { font-size: 8.5px; color: #6E6E6E; line-height: 1.6; flex: 1; }

    .foot { margin-top: 5mm; padding-top: 2.5mm; border-top: .5px solid #EDEDED;
            font-size: 8px; color: #8A8A8A; line-height: 1.6; text-align: center; letter-spacing: .2px; }
    @media print { body { padding: 14mm 14mm 10mm; } .noprint { display: none; } }
  </style></head><body${imprimir ? ' onload="window.print()"' : ''}>

    <div class="head">
      <div>
        ${logo}
        <div class="brand serif">${esc(c.trade_name || c.name || '')}</div>
        <div class="company-line">
          ${esc(c.name || '')}${c.nif ? ` &middot; NIF ${esc(c.nif)}` : ''}<br/>
          ${esc(c.address || '')}${c.city ? ' &middot; ' + esc(c.city) : ''}${c.province ? ' &middot; ' + esc(c.province) : ''}<br/>
          ${c.phone ? 'Tel. ' + esc(c.phone) : ''}${c.email ? ' &middot; ' + esc(c.email) : ''}
        </div>
      </div>
      <div class="party">
        <div class="lbl">Exmo.(s) Sr.(s)</div>
        <div class="party-name">${esc(cust.name)}</div>
        <div class="party-line">Contribuinte ${esc(cust.nif || 'Consumidor Final')}</div>
        ${cust.address ? `<div class="party-line">${esc(cust.address)}</div>` : ''}
      </div>
    </div>
    <div class="rule"></div>

    ${m.header ? `<div class="note" style="margin-top:3mm">${esc(m.header)}</div>` : ''}

    <div class="docbar">
      <div>
        <div class="doc-title serif">${esc(d.type_name)}${copia ? `<span class="copy">${esc(d.copy_label)}</span>` : ''}</div>
        <div class="doc-no">N.&ordm; ${esc(d.invoice_no)}</div>
      </div>
      <div class="meta">
        <div><span class="lbl">Data</span><b>${esc(d.date)}</b></div>
        ${d.room ? `<div><span class="lbl">Quarto</span><b>${esc(d.room)}</b></div>` : ''}
        ${d.place ? `<div><span class="lbl">Mesa</span><b>${esc(d.place)}</b></div>` : ''}
        ${d.operator ? `<div><span class="lbl">Operador</span><b>${esc(d.operator)}</b></div>` : ''}
      </div>
    </div>

    <table class="items">
      <thead><tr>
        <th class="num" style="width:14mm">Qt.</th><th>Descrição</th>
        <th class="num" style="width:24mm">Preço unit.</th><th class="num" style="width:18mm">Desc.</th>
        <th class="num" style="width:13mm">IVA</th><th class="num" style="width:26mm">Total</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>

    <div class="rowbox">
      <table class="vat">
        <caption>Quadro resumo do IVA</caption>
        <thead><tr><th>Taxa</th><th class="num">Incidência</th><th class="num">Valor</th><th class="num">Total</th></tr></thead>
        <tbody>${vat}</tbody>
      </table>
      <table class="totals">
        <tr><td class="k">Subtotal</td><td class="v">${n(t.net)}</td></tr>
        ${Number(t.discount) ? `<tr><td class="k">Desconto</td><td class="v">&minus; ${n(t.discount)}</td></tr>` : ''}
        <tr><td class="k">IVA</td><td class="v">${n(t.tax)}</td></tr>
        <tr class="grand"><td>Total&nbsp;&nbsp;KZ</td><td>${n(t.gross)}</td></tr>
      </table>
    </div>

    <div class="words"><i>Valor por extenso:</i> ${esc(p.amount_in_words || '')}</div>

    <div class="cols">
      ${(pays && ligado('show_payments', true)) ? `<div class="col">
        <table class="vat"><caption>Forma de pagamento</caption>
          <tbody>${pays}</tbody></table>
        ${m.payment_terms ? `<div class="note" style="margin-top:2mm">${esc(m.payment_terms)}</div>` : ''}
      </div>` : (m.payment_terms ? `<div class="col"><div class="lbl">Condições</div><div class="note">${esc(m.payment_terms)}</div></div>` : '')}

      ${mostraBanco ? `<div class="col">
        <div class="lbl">Pagamento por transferência</div>
        ${contas.length ? `<table class="vat"><tbody>
          ${contas.map((b: any) => `<tr>
            <td>${esc(b.bank_name || '')}</td>
            <td class="mono">${esc(b.iban || b.account_number || '')}</td>
            <td>${esc(b.currency || 'AOA')}</td></tr>`).join('')}
        </tbody></table>` : ''}
        ${m.bank_details ? `<div class="note" style="margin-top:2mm">${esc(m.bank_details)}</div>` : ''}
        ${contas[0]?.account_holder ? `<div class="note">Titular: ${esc(contas[0].account_holder)}</div>` : ''}
      </div>` : ''}
    </div>

    ${m.legal_notes ? `<div class="note" style="margin-top:4mm">${esc(m.legal_notes)}</div>` : ''}

    ${ligado('show_signature_line', false) ? `<div class="sign">
      <div>${esc(m.signature_label || 'O prestador')}</div>
      <div>O adquirente</div>
    </div>` : ''}

    <div class="legal">
      ${(p.qr_png && ligado('show_qr', true)) ? `<div class="qr"><img src="${p.qr_png}" alt="QR AGT" /></div>` : ''}
      <div class="mention">${esc(p.print_mention || '')}</div>
    </div>

    <div class="foot">
      ${esc(c.name || '')}${c.address ? ' &middot; ' + esc(c.address) : ''}${c.city ? ' &middot; ' + esc(c.city) : ''}${c.phone ? ' &middot; Tel. ' + esc(c.phone) : ''}<br/>
      ${c.share_capital ? 'Capital Social ' + esc(c.share_capital) + ' &middot; ' : ''}${c.crc_number ? esc(c.crc_number) + ' &middot; ' : ''}Contribuinte n.&ordm; ${esc(c.nif || '')}
      ${m.footer ? `<br/>${esc(m.footer)}` : ''}
    </div>
  </body></html>`;

  return html;
}
