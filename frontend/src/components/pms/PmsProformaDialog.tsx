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
      return `<tr><td colspan="3" style="text-align:center;color:#888;padding:18px">Sem consumos lançados nesta conta.</td></tr>`;
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
        `<tr><td>${esc(g.label)}</td><td style="text-align:center">${g.qt}</td>` +
        `<td style="text-align:right">${money(g.total)}</td></tr>`).join('');
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
        `<tr><td>${esc(d)}</td><td style="text-align:center">${g.qt}</td>` +
        `<td style="text-align:right">${money(g.total)}</td></tr>`).join('');
    }
    return encargos.map((c: any) =>
      `<tr><td>${esc(c.description)}` +
      `<div style="font-size:10px;color:#777">${esc(c.charge_type_display || c.charge_type)}` +
      `${c.posted_at ? ` · ${esc(String(c.posted_at).slice(0, 10))}` : ''}</div></td>` +
      `<td style="text-align:center">1</td>` +
      `<td style="text-align:right">${money(c.amount)}</td></tr>`).join('');
  };

  const montarHtml = () => `<html><head><meta charset="utf-8"><title>Pró-forma — ${esc(r.confirmation)}</title><style>
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Tahoma,sans-serif;color:#062F35;margin:0;padding:28px;font-size:12px}
      .topo{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;
            border-bottom:2px solid #062F35;padding-bottom:14px}
      .empresa{font-size:11px;line-height:1.5}
      .empresa .nome{font-size:16px;font-weight:700;color:#062F35;margin-bottom:2px}
      .logo{max-height:64px;max-width:190px;object-fit:contain}
      .titulo{text-align:right}
      .titulo h1{margin:0;font-size:19px;letter-spacing:1px;color:#062F35}
      .titulo .sub{font-size:11px;color:#4B858E;margin-top:2px}
      .caixas{display:flex;gap:14px;margin:16px 0}
      .caixa{flex:1;border:1px solid #C8D2D5;border-radius:8px;padding:10px}
      .caixa h4{margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#4B858E}
      .caixa .l{display:flex;justify-content:space-between;gap:10px;padding:1px 0}
      table{border-collapse:collapse;width:100%;margin-top:6px}
      th{background:#E4E9EB;color:#062F35;text-align:left;font-size:10px;text-transform:uppercase;
         letter-spacing:.5px;padding:7px 8px;border-bottom:1px solid #C8D2D5}
      td{padding:7px 8px;border-bottom:1px solid #E4E9EB;vertical-align:top}
      .totais{margin-left:auto;width:290px;margin-top:12px}
      .totais .l{display:flex;justify-content:space-between;padding:4px 8px}
      .totais .grande{border-top:2px solid #062F35;margin-top:4px;padding-top:8px;
                      font-size:15px;font-weight:700;color:#062F35}
      .aviso{margin-top:22px;border:1px solid #C94A4A;background:#FDECEA;color:#A83A3A;
             border-radius:8px;padding:10px 12px;font-size:11px}
      .rodape{margin-top:14px;font-size:10px;color:#7d8f92;text-align:center;
              border-top:1px solid #E4E9EB;padding-top:8px}
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
          <div class="sub">Reserva ${esc(r.confirmation)}</div>
          <div class="sub">Emitida em ${new Date().toLocaleString('pt-PT')}</div>
          <div class="sub">${esc(formato)}</div>
        </div>
      </div>

      <div class="caixas">
        <div class="caixa">
          <h4>Hóspede</h4>
          <div class="l"><span>Nome</span><b>${esc(r.guest_name || '—')}</b></div>
          <div class="l"><span>NIF</span><span>${esc(r.guest_tax_id || '—')}</span></div>
          ${folio?.payer_name ? `<div class="l"><span>A pagar por</span><span>${esc(folio.payer_name)}</span></div>` : ''}
        </div>
        <div class="caixa">
          <h4>Estadia</h4>
          <div class="l"><span>Quarto</span><b>${esc(r.room_number || '—')}</b></div>
          <div class="l"><span>Categoria</span><span>${esc(r.room_type_name || '—')}</span></div>
          <div class="l"><span>Entrada</span><span>${esc(r.check_in || '—')}</span></div>
          <div class="l"><span>Saída</span><span>${esc(r.check_out || '—')}</span></div>
          <div class="l"><span>Noites</span><span>${esc(r.nights ?? '—')}</span></div>
        </div>
      </div>

      <table>
        <thead><tr><th>Descrição</th><th style="text-align:center;width:70px">Qt.</th>
          <th style="text-align:right;width:130px">Valor (Kz)</th></tr></thead>
        <tbody>${linhasHtml()}</tbody>
      </table>

      <div class="totais">
        <div class="l"><span>Base tributável</span><span>${money(base)}</span></div>
        <div class="l"><span>IVA (${pct}%)</span><span>${money(iva)}</span></div>
        ${semImposto > 0 ? `<div class="l"><span>Taxas (sem IVA)</span><span>${money(semImposto)}</span></div>` : ''}
        <div class="l grande"><span>TOTAL</span><span>${money(total)} Kz</span></div>
        ${totalPago > 0 ? `<div class="l"><span>Já pago</span><span>− ${money(totalPago)}</span></div>
          <div class="l grande"><span>POR PAGAR</span><span>${money(total - totalPago)} Kz</span></div>` : ''}
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
      <div className="w-[560px] bg-[#F4F6F7] border border-[#C8D2D5] shadow-xl rounded-[16px] overflow-hidden">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold" style={{ background: '#062F35' }}>
          Fatura Proforma para a reserva {r.confirmation}
          <button onClick={onClose} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#C94A4A] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 flex flex-col gap-2 text-[12px]">
          <label className="flex flex-col gap-0.5">Entidade:
            <select disabled className="border border-[#C8D2D5] p-1.5 bg-[#F4F6F7] rounded-[6px]"><option>{r.guest_name}</option></select>
          </label>
          <label className="flex flex-col gap-0.5">Formato:
            <select value={formato} onChange={(e) => setFormato(e.target.value)} className="border border-[#C8D2D5] p-1.5 bg-white rounded-[6px]">
              {FORMATOS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          {/* Pré-visualização dos números — o que vai sair no papel, antes de imprimir. */}
          <div className="border border-[#C8D2D5] rounded-[8px] bg-white p-2.5 text-[11px]">
            <div className="flex justify-between"><span className="text-[#657377]">Consumos</span><span>{encargos.length}</span></div>
            <div className="flex justify-between"><span className="text-[#657377]">Base tributável</span><span>{money(base)}</span></div>
            <div className="flex justify-between"><span className="text-[#657377]">IVA ({pct}%)</span><span>{money(iva)}</span></div>
            <div className="flex justify-between font-bold text-[#1F292C] border-t border-[#E4E9EB] mt-1 pt-1">
              <span>Total</span><span>{money(total)} Kz</span>
            </div>
            {totalPago > 0 && (
              <div className="flex justify-between text-[#A83A3A]"><span>Por pagar</span><span>{money(total - totalPago)} Kz</span></div>
            )}
          </div>
          <div className="text-[10px] text-[#A83A3A] leading-snug">
            A pró-forma não é documento fiscal — a factura AGT sai no check-out.
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 bg-[#F4F6F7] border-t border-[#C8D2D5]">
          <button onClick={imprimir} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1F292C] hover:text-black"><Printer size={14} /> Imprimir</button>
          <button onClick={enviarEmail} disabled={enviando}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1F292C] hover:text-black disabled:text-gray-400">
            <Mail size={14} /> {enviando ? 'A enviar…' : 'Enviar E-mail'}</button>
          <button onClick={onClose} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1F292C] hover:text-black ml-auto">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#C94A4A] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
