import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Printer, Mail } from 'lucide-react';
import { apiClient } from '../../api/client';
import { aviso, pedir } from '../../ui/dialogo';
import { notifyError } from '../../utils/friendlyError';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const FORMATOS = ['Fatura: Detalhada', 'Fatura: Sumário por Dia', 'Fatura: Sumário por Estadia'];
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/**
 * Pro-forma — o documento que o hóspede confere ANTES do check-out.
 *
 * NÃO é a factura fiscal (essa nasce no check-out, assinada e numerada pela
 * AGT — ver fiscal/integration.py::emit_for_pms_folio). Por isso este papel
 * leva, obrigatoriamente, a advertência de que não serve como documento
 * fiscal: uma pró-forma com ar de factura é a maneira mais rápida de um
 * hotel entregar ao cliente um papel que a AGT não reconhece.
 *
 * Cabeçalho (empresa, NIF, morada, logótipo) vem de `fiscal/config/` — a
 * MESMA fonte que a factura fiscal a sério usa, para os dois documentos
 * nunca divergirem.
 */
export default function PmsProformaDialog({ reservation: r, onClose }: { reservation: any; onClose: () => void }) {
  const [formato, setFormato] = useState('Fatura: Sumário por Estadia');
  const [enviando, setEnviando] = useState(false);

  const { data: folio } = useQuery({
    queryKey: ['pms', 'folios', r.folio_id],
    queryFn: async () => (await apiClient.get(`pms/folios/${r.folio_id}/`)).data,
    enabled: !!r.folio_id,
  });
  const { data: cfg } = useQuery({
    queryKey: ['fiscal', 'config'],
    queryFn: async () => {
      const d = (await apiClient.get('fiscal/config/')).data;
      return Array.isArray(d) ? d[0] : (d?.results?.[0] || d);
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: branding } = useQuery({
    queryKey: ['platform', 'branding'],
    queryFn: async () => (await apiClient.get('platform/branding/')).data,
    staleTime: 5 * 60 * 1000,
  });
  const { data: taxas } = useQuery({
    queryKey: ['fiscal', 'tax-rates'],
    queryFn: async () => (await apiClient.get('fiscal/tax-rates/')).data,
    staleTime: 5 * 60 * 1000,
  });

  const encargos: any[] = (folio?.charges || [])
    .filter((c: any) => !c.is_void && c.charge_type !== 'PAYMENT');
  const pagamentos: any[] = (folio?.charges || [])
    .filter((c: any) => !c.is_void && c.charge_type === 'PAYMENT');

  const totalBruto = encargos.reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalPago = pagamentos.reduce((s, c) => s + Number(c.amount || 0), 0);

  // IVA: com "preços incluem imposto" (regra da hotelaria AO), o valor lançado
  // JÁ traz o imposto dentro — a base tira-se por dentro, não por cima.
  const listaTaxas: any[] = Array.isArray(taxas) ? taxas : taxas?.results || [];
  const taxaDefault = listaTaxas.find((t: any) => t.is_default && t.is_active) || listaTaxas[0];
  const pct = Number(taxaDefault?.percentage || 0);
  // Uma linha de "Taxa" (taxa turística) já É imposto — não leva IVA por cima.
  const baseTributavel = encargos
    .filter((c: any) => c.charge_type !== 'TAX')
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const semImposto = totalBruto - baseTributavel;
  const incluiIva = cfg?.prices_include_tax !== false;
  const base = incluiIva ? baseTributavel / (1 + pct / 100) : baseTributavel;
  const iva = incluiIva ? baseTributavel - base : baseTributavel * (pct / 100);
  const total = incluiIva ? totalBruto : baseTributavel + iva + semImposto;

  const logo = cfg?.logo_url || branding?.logo_url || '';

  const linhasHtml = () => {
    if (!encargos.length) {
      return `<tr><td colspan="3" style="text-align:center;color:#8A8A8A;padding:16px">Sem consumos lançados nesta conta.</td></tr>`;
    }
    if (formato === 'Fatura: Sumário por Estadia') {
      // Agrupa por tipo de encargo — uma linha por família de consumo.
      const porTipo: Record<string, { label: string; qt: number; total: number }> = {};
      for (const c of encargos) {
        const k = c.charge_type_display || c.charge_type;
        porTipo[k] = porTipo[k] || { label: k, qt: 0, total: 0 };
        porTipo[k].qt += 1;
        porTipo[k].total += Number(c.amount || 0);
      }
      return Object.values(porTipo).map((g) =>
        `<tr><td>${esc(g.label)}</td><td class="num" style="text-align:center">${g.qt}</td>` +
        `<td class="num" style="text-align:right">${money(g.total)}</td></tr>`).join('');
    }
    if (formato === 'Fatura: Sumário por Dia') {
      const porDia: Record<string, { qt: number; total: number }> = {};
      for (const c of encargos) {
        const d = (c.posted_at || c.created_at || '').slice(0, 10) || '—';
        porDia[d] = porDia[d] || { qt: 0, total: 0 };
        porDia[d].qt += 1;
        porDia[d].total += Number(c.amount || 0);
      }
      return Object.entries(porDia).sort().map(([d, g]) =>
        `<tr><td>${esc(d)}</td><td class="num" style="text-align:center">${g.qt}</td>` +
        `<td class="num" style="text-align:right">${money(g.total)}</td></tr>`).join('');
    }
    return encargos.map((c: any) =>
      `<tr><td>${esc(c.description)}` +
      `<div style="font-size:10px;color:#777">${esc(c.charge_type_display || c.charge_type)}` +
      `${c.posted_at ? ` · ${esc(String(c.posted_at).slice(0, 10))}` : ''}</div></td>` +
      `<td style="text-align:center">1</td>` +
      `<td class="num" style="text-align:right">${money(c.amount)}</td></tr>`).join('');
  };

  const montarHtml = () => `<html><head><meta charset="utf-8"><title>Pró-forma — ${esc(r.confirmation)}</title><style>
      /* ================= A PRÓ-FORMA =================================
         Era AZUL DE CIMA A BAIXO: o "body" declarava "color:#2563EB", e a partir
         daí tudo o que não tivesse cor própria — o nome do hóspede, as datas, os
         valores, o total — nascia azul. Um papel em que tudo está realçado não
         tem nada realçado: o olho não sabe onde pousar, e o documento lê-se como
         um folheto, não como uma conta.

         Uma factura séria é TEXTO ESCURO SOBRE BRANCO. A hierarquia faz-se com
         tamanho, peso e FILETES; a cor fica para as duas coisas que a merecem: o
         total a pagar e o aviso legal. É assim em qualquer factura de hotel, e
         não por tradição — é porque este papel é conferido linha a linha por
         alguém com pressa ao balcão, e depois arquivado a preto e branco.
         ================================================================= */
      *{box-sizing:border-box}
      @page{size:A4;margin:14mm}
      body{font-family:'Segoe UI',Tahoma,sans-serif;color:#1A1A1A;margin:0;padding:26px;
           font-size:11.5px;line-height:1.45}

      /* OS NÚMEROS EM LARGURA FIXA ("tabular-nums"): sem isto o "1" é mais
         estreito do que o "8" e a coluna de valores fica com as vírgulas
         desalinhadas umas das outras — numa conta, somar com o olho deixa de
         ser possível. É o detalhe que mais distingue um documento financeiro
         bem composto de um mal composto. */
      .num{font-variant-numeric:tabular-nums}

      .topo{display:flex;justify-content:space-between;align-items:flex-start;gap:22px;
            border-bottom:1.5px solid #1A1A1A;padding-bottom:12px}
      .empresa{font-size:10.5px;line-height:1.5;color:#3C3C3C}
      .empresa .nome{font-size:15px;font-weight:700;color:#1A1A1A;margin-bottom:2px;letter-spacing:.2px}
      .logo{max-height:60px;max-width:180px;object-fit:contain;margin-bottom:6px}
      .titulo{text-align:right}
      .titulo h1{margin:0;font-size:17px;letter-spacing:1.5px;color:#1A1A1A;font-weight:700}
      .titulo .sub{font-size:10.5px;color:#4A4A4A;margin-top:3px}
      .titulo .ref{font-size:12px;color:#1A1A1A;font-weight:700;margin-top:4px}

      .caixas{display:flex;gap:12px;margin:14px 0 4px}
      .caixa{flex:1;border:1px solid #C8C8C8;padding:0}
      .caixa h4{margin:0;font-size:9.5px;text-transform:uppercase;letter-spacing:.8px;
                color:#1A1A1A;background:#EFEFEF;border-bottom:1px solid #C8C8C8;padding:3px 8px}
      .caixa .corpo{padding:7px 8px}
      .caixa .l{display:flex;justify-content:space-between;gap:10px;padding:1.5px 0}
      .caixa .l span:first-child{color:#5A5A5A}
      .caixa .l span:last-child,.caixa .l b{color:#1A1A1A}

      table{border-collapse:collapse;width:100%;margin-top:14px}
      th{background:#EFEFEF;color:#1A1A1A;text-align:left;font-size:9.5px;text-transform:uppercase;
         letter-spacing:.6px;padding:5px 8px;border-top:1px solid #C8C8C8;border-bottom:1px solid #C8C8C8}
      td{padding:5px 8px;border-bottom:1px solid #E4E4E4;vertical-align:top;color:#1A1A1A}

      .totais{margin-left:auto;width:270px;margin-top:10px}
      .totais .l{display:flex;justify-content:space-between;padding:3px 8px;color:#3C3C3C}
      /* O FILETE DUPLO por cima do total é a convenção de qualquer documento de
         contas: diz "o que vem a seguir é o resultado", sem precisar de cor. */
      .totais .grande{border-top:3px double #1A1A1A;margin-top:5px;padding-top:7px;
                      font-size:14px;font-weight:700;color:#1A1A1A}
      .totais .pagar{color:#B91C1C}

      /* O AVISO FICA VERMELHO, e é a única cor forte do papel: é a advertência
         legal de que isto não serve como factura. Deixar de o destacar seria o
         caminho mais curto para um hóspede levar para casa um papel que a AGT
         não reconhece. */
      .aviso{margin-top:20px;border:1px solid #C0392B;border-left:4px solid #C0392B;
             background:#FDF4F3;color:#8E2A20;padding:8px 10px;font-size:10.5px}
      .rodape{margin-top:16px;font-size:9.5px;color:#6B6B6B;text-align:center;
              border-top:1px solid #D4D4D4;padding-top:7px}
      @media print{body{padding:0}}
    </style></head><body>

      <div class="topo">
        <div class="empresa">
          ${logo ? `<img class="logo" src="${esc(logo)}" alt="" /><br/>` : ''}
          <div class="nome">${esc(cfg?.trade_name || cfg?.company_name || 'Hotel')}</div>
          ${cfg?.company_name && cfg?.trade_name && cfg.company_name !== cfg.trade_name
            ? `<div>${esc(cfg.company_name)}</div>` : ''}
          ${cfg?.company_nif ? `<div><b>NIF:</b> ${esc(cfg.company_nif)}</div>` : ''}
          ${cfg?.address_line ? `<div>${esc(cfg.address_line)}</div>` : ''}
          ${cfg?.city ? `<div>${esc(cfg.city)}${cfg?.province ? ` · ${esc(cfg.province)}` : ''}</div>` : ''}
          ${cfg?.phone ? `<div>Tel.: ${esc(cfg.phone)}</div>` : ''}
          ${cfg?.email ? `<div>${esc(cfg.email)}</div>` : ''}
        </div>
        <div class="titulo">
          <h1>FATURA PRÓ-FORMA</h1>
          <div class="ref">Reserva ${esc(r.confirmation)}</div>
          <div class="sub">Emitida em ${new Date().toLocaleString('pt-PT')}</div>
          <div class="sub">${esc(formato)}</div>
        </div>
      </div>

      <div class="caixas">
        <div class="caixa">
          <h4>Hóspede</h4>
          <div class="corpo">
            <div class="l"><span>Nome</span><b>${esc(r.guest_name || '—')}</b></div>
            <div class="l"><span>NIF</span><span class="num">${esc(r.guest_tax_id || '—')}</span></div>
            ${folio?.payer_name ? `<div class="l"><span>A pagar por</span><span>${esc(folio.payer_name)}</span></div>` : ''}
          </div>
        </div>
        <div class="caixa">
          <h4>Estadia</h4>
          <div class="corpo">
            <div class="l"><span>Quarto</span><b>${esc(r.room_number || '—')}</b></div>
            <div class="l"><span>Categoria</span><span>${esc(r.room_type_name || '—')}</span></div>
            <div class="l"><span>Entrada</span><span class="num">${esc(r.check_in || '—')}</span></div>
            <div class="l"><span>Saída</span><span class="num">${esc(r.check_out || '—')}</span></div>
            <div class="l"><span>Noites</span><span class="num">${esc(r.nights ?? '—')}</span></div>
          </div>
        </div>
      </div>

      <table>
        <thead><tr><th>Descrição</th><th style="text-align:center;width:70px">Qt.</th>
          <th style="text-align:right;width:130px">Valor (Kz)</th></tr></thead>
        <tbody>${linhasHtml()}</tbody>
      </table>

      <div class="totais">
        <div class="l"><span>Base tributável</span><span class="num">${money(base)}</span></div>
        <div class="l"><span>IVA (${pct}%)</span><span class="num">${money(iva)}</span></div>
        ${semImposto > 0 ? `<div class="l"><span>Taxas (sem IVA)</span><span class="num">${money(semImposto)}</span></div>` : ''}
        <div class="l grande"><span>TOTAL</span><span class="num">${money(total)} Kz</span></div>
        ${totalPago > 0 ? `<div class="l"><span>Já pago</span><span class="num">− ${money(totalPago)}</span></div>
          <div class="l grande pagar"><span>POR PAGAR</span><span class="num">${money(total - totalPago)} Kz</span></div>` : ''}
      </div>

      <div class="aviso">
        <b>Este documento NÃO é uma factura.</b> É uma pró-forma, para conferência do
        hóspede. A factura fiscal (AGT), assinada e numerada, é emitida no check-out.
      </div>

      <div class="rodape">
        ${esc(cfg?.trade_name || cfg?.company_name || '')}
        ${cfg?.share_capital ? ` · Capital Social ${esc(cfg.share_capital)}` : ''}
        ${cfg?.crc_number ? ` · ${esc(cfg.crc_number)}` : ''}
      </div>
    </body></html>`;

  const imprimir = () => {
    const html = montarHtml();
    // Iframe escondido em vez de janela nova: uma janela nova traz a moldura do
    // navegador (barra de endereço) para dentro da pré-visualização de impressão.
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc) { document.body.removeChild(frame); return; }
    doc.open(); doc.write(html); doc.close();
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => document.body.removeChild(frame), 1000);
    };
  };

  // ENVIAR POR E-MAIL — reutiliza o motor do POS (pos/mailer.py + EmailOutbox),
  // o mesmo que manda a factura do terminal; o PMS não tem carteiro próprio.
  // Vai o MESMO HTML que sai na impressora, para o papel e o e-mail nunca
  // mostrarem contas diferentes.
  const enviarEmail = async () => {
    const paraQuem = await pedir({
      titulo: 'Enviar por e-mail', mensagem: 'Enviar a pró-forma para que endereço?',
      valor: r.guest_email || '',
    });
    if (paraQuem === null) return;
    setEnviando(true);
    try {
      const { data } = await apiClient.post(`pms/reservations/${r.id}/send-email/`, {
        kind: 'PROFORMA', to: paraQuem || undefined, body: montarHtml(),
      });
      aviso(data.detail, data.status === 'FAILED' ? 'Não foi possível enviar' : 'E-mail');
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  };

  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-black/40">
      <div className="w-[560px] max-w-full bg-[#EEF1F5] border border-[#E6E8EC] shadow-xl rounded-[16px] overflow-hidden">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#2563EB' }}>
          Fatura Proforma para a reserva {r.confirmation}
          <button onClick={onClose} title="Fechar"
            className="w-6 h-6 rounded-[8px] flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <label className="flex flex-col gap-0.5">Entidade:
            <select disabled className="border border-[#E6E8EC] p-1.5 bg-[#EEF1F5] rounded-[8px]"><option>{r.guest_name}</option></select>
          </label>
          <label className="flex flex-col gap-0.5">Formato:
            <select value={formato} onChange={(e) => setFormato(e.target.value)} className="border border-[#E6E8EC] p-1.5 bg-white rounded-[8px]">
              {FORMATOS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          {/* Pré-visualização dos números — o que vai sair no papel, antes de imprimir. */}
          <div className="border border-[#E6E8EC] rounded-[8px] bg-white p-2.5 text-[11px]">
            <div className="flex justify-between"><span className="text-[#6B7280]">Consumos</span><span>{encargos.length}</span></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">Base tributável</span><span>{money(base)}</span></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">IVA ({pct}%)</span><span>{money(iva)}</span></div>
            <div className="flex justify-between font-bold text-[#111827] border-t border-[#F1F2F4] mt-1 pt-1">
              <span>Total</span><span>{money(total)} Kz</span>
            </div>
            {totalPago > 0 && (
              <div className="flex justify-between text-[#B91C1C]"><span>Por pagar</span><span>{money(total - totalPago)} Kz</span></div>
            )}
          </div>
          <div className="text-[10px] text-[#B91C1C] leading-snug">
            A pró-forma não é documento fiscal — a factura AGT sai no check-out.
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 bg-[#EEF1F5] border-t border-[#E6E8EC]">
          <button onClick={imprimir} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111827] hover:text-black"><Printer size={14} /> Imprimir</button>
          <button onClick={enviarEmail} disabled={enviando}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111827] hover:text-black disabled:text-gray-400">
            <Mail size={14} /> {enviando ? 'A enviar…' : 'Enviar E-mail'}</button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111827] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#DC2626] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
