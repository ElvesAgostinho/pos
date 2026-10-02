import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Printer, Send } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso, confirmar, pedir } from '../../ui/dialogo';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
const inp = 'border border-[#7FA9B1] rounded-[6px] px-2 py-1 text-[12px]';
const btn = 'px-3 py-1.5 text-[12px] border border-[#CFE3E6] rounded-[6px] bg-gradient-to-b from-white to-[#EEF4F5] hover:to-[#E3EDEE] active:translate-y-px inline-flex items-center gap-1.5 disabled:opacity-40';

/** Moldura comum dos painéis das Funções da reserva. */
export function Painel({ titulo, onClose, children, rodape }: any) {
  return (
    <div className="fixed inset-0 z-[9400] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[10px] shadow-xl w-full max-w-2xl max-h-[86vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 text-white"
             style={{ background: 'linear-gradient(to bottom, #0B3A43, #062A31)' }}>
          <span className="font-bold text-[13px]">{titulo}</span>
          <button onClick={onClose} className="hover:bg-white/15 rounded px-1.5"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto bg-[#F7FAFA] flex-1 min-h-0 text-[12px]">{children}</div>
        <div className="px-4 py-2 border-t border-[#EEF4F5] bg-white flex items-center justify-between">
          <div>{rodape}</div>
          <button className={btn} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════ ENCARGOS FIXOS */
/**
 * O que esta reserva paga todos os dias além da diária: estacionamento, cama
 * extra, taxa de resort. Quem os lança é a Auditoria da Noite — aqui só se diz
 * quais são. Sem isto a recepção tinha de se lembrar de os lançar à mão em
 * cada noite de cada estadia.
 */
export function EncargosFixos({ reserva, onClose }: any) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState<any>({ description: '', amount: '', charge_type: 'MISC', per_night: true });
  const chave = ['pms', 'fixed-charges', reserva.id];
  const { data: linhas = [] } = useQuery({
    queryKey: chave,
    queryFn: async () => (await apiClient.get('pms/fixed-charges/', { params: { reservation: reserva.id } })).data,
  });
  const inval = () => qc.invalidateQueries({ queryKey: ['pms'] });

  const criar = async () => {
    try {
      await apiClient.post('pms/fixed-charges/', {
        reservation: reserva.id, description: novo.description.trim(),
        amount: novo.amount, charge_type: novo.charge_type, per_night: novo.per_night,
      });
      setNovo({ description: '', amount: '', charge_type: 'MISC', per_night: true });
      inval();
    } catch (e) { notifyError(e); }
  };
  const apagar = async (id: number) => {
    if (!(await confirmar('Remover este encargo fixo? As noites já lançadas na conta não são afetadas.'))) return;
    try { await apiClient.delete(`pms/fixed-charges/${id}/`); inval(); } catch (e) { notifyError(e); }
  };

  const totalEstadia = linhas.reduce((t: number, l: any) => t + Number(l.total_estimado || 0), 0);

  return (
    <Painel titulo={`Encargos fixos — ${reserva.confirmation}`} onClose={onClose}
      rodape={<span className="text-gray-600">Total estimado para a estadia: <b>{money(totalEstadia)} Kz</b></span>}>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] overflow-hidden mb-3">
        <div className="grid grid-cols-[1fr_120px_110px_90px_36px] gap-2 px-3 py-1.5 bg-[#F7FAFA] border-b border-[#EEF4F5] text-[11px] font-bold text-[#5C8891]">
          <span>Descrição</span><span>Tipo</span><span className="text-right">Valor</span><span>Frequência</span><span />
        </div>
        {linhas.map((l: any) => (
          <div key={l.id} className="grid grid-cols-[1fr_120px_110px_90px_36px] gap-2 px-3 py-1.5 border-b border-[#F7FAFA] items-center">
            <span className="font-semibold">{l.description}</span>
            <span className="text-gray-600">{l.charge_type_display}</span>
            <span className="text-right">{money(l.amount)}</span>
            <span className="text-gray-600">{l.per_night ? 'Por noite' : 'Uma vez'}</span>
            <button className="text-[#B0392B] hover:bg-[#B0392B]/10 rounded p-1" onClick={() => apagar(l.id)}><Trash2 size={13} /></button>
          </div>
        ))}
        {linhas.length === 0 && <div className="px-3 py-3 text-gray-500">Sem encargos fixos nesta reserva.</div>}
      </div>

      <div className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col flex-1 min-w-[180px]">Descrição
          <input className={inp} value={novo.description} placeholder="Ex: Estacionamento"
                 onChange={(e) => setNovo({ ...novo, description: e.target.value })} /></label>
        <label className="flex flex-col">Tipo
          <select className={inp} value={novo.charge_type} onChange={(e) => setNovo({ ...novo, charge_type: e.target.value })}>
            <option value="MISC">Diversos</option><option value="ROOM">Alojamento</option>
            <option value="FNB">F&amp;B</option><option value="LAUNDRY">Lavandaria</option>
            <option value="MINIBAR">Minibar</option><option value="SPA">Spa</option>
            <option value="TAX">Taxa</option>
          </select></label>
        <label className="flex flex-col">Valor
          <input type="number" min={0} className={inp + ' w-28'} value={novo.amount}
                 onChange={(e) => setNovo({ ...novo, amount: e.target.value })} /></label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={novo.per_night} onChange={(e) => setNovo({ ...novo, per_night: e.target.checked })} />
          Por noite</label>
        <button className={btn} disabled={!novo.description.trim() || !novo.amount} onClick={criar}>
          <Plus size={13} />Acrescentar</button>
      </div>
      <div className="text-[11px] text-gray-500 mt-2">
        "Por noite" é lançado pela Auditoria da Noite, uma vez por cada noite da estadia.
        Sem essa marca, é lançado uma só vez, no check-in.
      </div>
    </Painel>
  );
}

/* ═══════════════════════════════════════════════════════ DEPÓSITOS */
/** Os adiantamentos desta reserva — o mesmo registo que o ecrã Depósitos de
 *  Reservas Online usa; aqui filtrado por esta reserva. */
export function Depositos({ reserva, onClose }: any) {
  const qc = useQueryClient();
  const { data: linhas = [] } = useQuery({
    queryKey: ['pms', 'booking-payments', 'res', reserva.id],
    queryFn: async () => (await apiClient.get('pms/booking-payments/', { params: { reservation: reserva.id } })).data,
  });
  const confirmarEntrada = async (p: any) => {
    const ref = await pedir({ titulo: 'Confirmar depósito', mensagem: 'Referência do pagamento (opcional):', valor: '' });
    if (ref === null) return;
    try {
      const { data } = await apiClient.post(`pms/booking-payments/${p.id}/mark-paid/`, { method: 'TRANSFER', reference: ref });
      qc.invalidateQueries({ queryKey: ['pms'] });
      aviso(data.detail, 'Depósito confirmado');
    } catch (e) { notifyError(e); }
  };
  return (
    <Painel titulo={`Depósitos — ${reserva.confirmation}`} onClose={onClose}>
      {linhas.length === 0 ? (
        <div className="text-gray-500">
          Esta reserva não tem depósitos. Os adiantamentos nascem das reservas feitas no site,
          quando o Booking Engine tem uma percentagem de depósito definida.
        </div>
      ) : linhas.map((p: any) => (
        <div key={p.id} className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 mb-2 flex items-center justify-between">
          <div>
            <div className="font-bold">{money(p.amount)} {p.currency} · {p.status_display}</div>
            <div className="text-[11px] text-gray-500">
              {p.method_display}{p.reference ? ` · ${p.reference}` : ''}
              {p.confirmed_by ? ` · confirmado por ${p.confirmed_by}` : ''}
              {p.status === 'PAID' && (p.posted_to_folio ? ' · lançado na conta' : ' · por lançar na conta')}
            </div>
            {p.message && <div className="text-[11px] text-gray-500 mt-0.5">{p.message}</div>}
          </div>
          {p.status === 'PENDING' && (
            <button className={btn} onClick={() => confirmarEntrada(p)}>Confirmar entrada</button>
          )}
        </div>
      ))}
    </Painel>
  );
}

/* ═══════════════════════════════════════════════════════ VOUCHER */
/** O número do voucher da agência/operador desta reserva — é o campo que a
 *  recepção confere contra o papel que o hóspede traz na mão. */
export function Voucher({ reserva, onClose, onSaved }: any) {
  const [valor, setValor] = useState(reserva.voucher || '');
  const [gravando, setGravando] = useState(false);
  const gravar = async () => {
    setGravando(true);
    try {
      await apiClient.patch(`pms/reservations/${reserva.id}/`, { voucher: valor.trim() || null });
      onSaved?.(); onClose();
    } catch (e) { notifyError(e); } finally { setGravando(false); }
  };
  return (
    <Painel titulo={`Voucher — ${reserva.confirmation}`} onClose={onClose}
      rodape={<button className={btn} disabled={gravando} onClick={gravar}>Gravar</button>}>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 space-y-2">
        <label className="flex flex-col gap-1">Nº do voucher da agência / operador
          <input className={inp} value={valor} onChange={(e) => setValor(e.target.value)}
                 placeholder="Ex: BK-884512" /></label>
        <div className="text-[11px] text-gray-500">
          É o número que a agência emitiu e que o hóspede traz consigo. Serve para a recepção
          conferir a reserva à chegada e para a faturação à agência no fim do mês.
        </div>
        <div className="text-[11px] text-gray-600 border-t border-[#EEF4F5] pt-2">
          Origem: <b>{reserva.source_display || reserva.source}</b>
          {reserva.channel_name ? ` · Canal: ${reserva.channel_name}` : ''}
          {reserva.block_code ? ` · Bloco: ${reserva.block_code}` : ''}
        </div>
      </div>
    </Painel>
  );
}

/* ═══════════════════════════════════════════════════════ COMISSÕES */
/**
 * Quanto é que esta reserva deixa de margem depois da comissão de quem a
 * trouxe. A percentagem vem do canal (Channel Manager) ou da ficha da entidade
 * — não se inventa nenhum valor aqui.
 */
export function Comissoes({ reserva, onClose }: any) {
  const { data: canais = [] } = useQuery({
    queryKey: ['pms', 'channels'],
    queryFn: async () => (await apiClient.get('pms/channels/')).data,
  });
  const { data: hospede } = useQuery({
    queryKey: ['pms', 'guest', reserva.guest],
    queryFn: async () => (await apiClient.get(`mdm/customers/${reserva.guest}/`)).data,
    enabled: !!reserva.guest,
  });

  const noites = reserva.nights || 0;
  const tarifa = Number(reserva.rate || reserva.effective_rate || 0);
  const valorEstadia = tarifa * noites;

  // O canal é o do Channel Manager com o mesmo nome do canal de distribuição
  // da reserva; sem correspondência, vale a comissão da ficha da entidade.
  const canal = canais.find((c: any) => c.name === reserva.channel_name
    || c.provider_display === reserva.channel_name);
  const pctCanal = canal ? Number(canal.commission_percent || 0) : 0;
  const pctEntidade = Number(hospede?.commission_pct || 0);
  const pct = pctCanal || pctEntidade;
  const comissao = valorEstadia * pct / 100;

  return (
    <Painel titulo={`Comissões — ${reserva.confirmation}`} onClose={onClose}>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 space-y-1.5">
        <Linha l="Valor da estadia" v={`${money(valorEstadia)} Kz`} nota={`${noites} noite(s) × ${money(tarifa)}`} />
        <Linha l="Origem da comissão"
               v={canal ? `Canal ${canal.name}` : (pctEntidade ? `Ficha de ${hospede?.name}` : '—')} />
        <Linha l="Percentagem" v={`${pct.toFixed(2)} %`} />
        <div className="border-t border-[#EEF4F5] pt-1.5">
          <Linha l="Comissão a pagar" v={`${money(comissao)} Kz`} forte />
          <Linha l="Receita líquida" v={`${money(valorEstadia - comissao)} Kz`} forte />
        </div>
      </div>
      {pct === 0 && (
        <div className="text-[11px] text-gray-500 mt-2">
          Esta reserva não tem comissão: nem o canal que a trouxe nem a ficha do hóspede têm
          percentagem definida. Define-se no <b>Channel Manager</b> (por canal) ou na ficha da
          entidade (<b>Comissões</b>).
        </div>
      )}
    </Painel>
  );
}
function Linha({ l, v, nota, forte }: any) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-gray-600">{l}{nota && <span className="text-[10px] text-gray-400"> · {nota}</span>}</span>
      <span className={forte ? 'font-bold text-[#062A31]' : ''}>{v}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════ E-MAIL (mensagem / carta) */
/**
 * Mensagem e Carta de Confirmação — as duas são o MESMO envio, com um tipo
 * diferente. O motor é o do POS (`pos/mailer.py` + EmailOutbox), o mesmo que
 * manda a factura do terminal; o PMS não tem carteiro próprio.
 */
export function EnviarEmail({ reserva, tipo, onClose }: any) {
  const titulo = tipo === 'CONFIRMATION' ? 'Carta de Confirmação' : 'Mensagem ao hóspede';
  const [para, setPara] = useState(reserva.guest_email || '');
  const [assunto, setAssunto] = useState('');
  const [texto, setTexto] = useState('');
  const [modelo, setModelo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { data: modelos = [] } = useQuery({
    queryKey: ['pos', 'email-templates'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/config/email-templates/');
        return ((r.data?.results || r.data || []) as any[]).filter((t) => t.source === 'Reservations' && !t.is_sms);
      } catch { return []; }
    },
  });

  const enviar = async () => {
    setEnviando(true);
    try {
      const { data } = await apiClient.post(`pms/reservations/${reserva.id}/send-email/`, {
        kind: tipo, to: para.trim() || undefined,
        subject: assunto.trim() || undefined,
        body: texto.trim() ? `<p>${esc(texto).replace(/\n/g, '<br/>')}</p>` : undefined,
        template: modelo || undefined,
      });
      aviso(data.detail, 'E-mail');
      onClose();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  };

  return (
    <Painel titulo={`${titulo} — ${reserva.confirmation}`} onClose={onClose}
      rodape={<button className={btn} disabled={enviando || !para.trim()} onClick={enviar}>
        <Send size={13} />{enviando ? 'A enviar…' : 'Enviar'}</button>}>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 space-y-2">
        <label className="flex flex-col gap-1">Para
          <input className={inp} value={para} onChange={(e) => setPara(e.target.value)}
                 placeholder="endereco@exemplo.ao" /></label>
        {modelos.length > 0 && (
          <label className="flex flex-col gap-1">Modelo (opcional)
            <select className={inp} value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">— escrever aqui em baixo —</option>
              {modelos.map((t: any) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <span className="text-[11px] text-gray-500">
              Os modelos são os do Marketing, com o texto na língua do hóspede. Escolhido um
              modelo, o assunto e o texto abaixo são ignorados.
            </span>
          </label>
        )}
        {!modelo && (<>
          <label className="flex flex-col gap-1">Assunto (vazio = automático)
            <input className={inp} value={assunto} onChange={(e) => setAssunto(e.target.value)} /></label>
          <label className="flex flex-col gap-1">Mensagem (vazia = resumo da reserva)
            <textarea className={inp + ' h-28 resize-none'} value={texto}
                      onChange={(e) => setTexto(e.target.value)} /></label>
        </>)}
        <div className="text-[11px] text-gray-500">
          Todos os envios ficam registados na caixa de saída (Marketing). Sem servidor de e-mail
          configurado, o envio fica em modo simulado e é dito aqui.
        </div>
      </div>
    </Painel>
  );
}

/* ═══════════════════════════════════════════ CARTÃO DE HÓSPEDE */
/**
 * O cartão que o hóspede assina no balcão à chegada (ficha de registo). Sai em
 * papel pelo mesmo caminho da pró-forma — iframe escondido, para o cabeçalho do
 * navegador não entrar no documento.
 */
export function CartaoHospede({ reserva, onClose }: any) {
  const { data: cfg } = useQuery({
    queryKey: ['fiscal', 'config'],
    queryFn: async () => {
      const d = (await apiClient.get('fiscal/config/')).data;
      return Array.isArray(d) ? d[0] : (d?.results?.[0] || d);
    },
  });
  const { data: hospede } = useQuery({
    queryKey: ['pms', 'guest', reserva.guest],
    queryFn: async () => (await apiClient.get(`mdm/customers/${reserva.guest}/`)).data,
    enabled: !!reserva.guest,
  });

  const campo = (l: string, v: any) =>
    `<tr><td class="l">${esc(l)}</td><td class="v">${esc(v || '')}</td></tr>`;

  const imprimir = () => {
    const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
    <title>Ficha de registo — ${esc(reserva.confirmation)}</title><style>
      @page { size: A4; margin: 0; }
      body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; color: #15232b; padding: 18mm 16mm; }
      .top { display:flex; justify-content:space-between; align-items:flex-start;
             border-bottom:2px solid #062A31; padding-bottom:10px; }
      .logo { max-height:52px; max-width:190px; display:block; margin-bottom:6px; }
      .brand { font-size:18px; font-weight:700; color:#062A31; }
      .sub { color:#5b6b73; font-size:10.5px; }
      h1 { font-size:15px; margin:16px 0 10px; color:#062A31; }
      table { width:100%; border-collapse:collapse; }
      td { padding:5px 8px; border-bottom:1px solid #EEF4F5; }
      td.l { color:#5b6b73; width:170px; }
      td.v { font-weight:600; }
      .nota { margin-top:14px; font-size:10px; color:#5b6b73; line-height:1.6;
              background:#F7FAFA; border:1px solid #D8E7EA; border-radius:6px; padding:10px; }
      .assin { margin-top:34px; display:flex; justify-content:space-between; gap:40px; }
      .assin div { flex:1; border-top:1px solid #15232b; text-align:center; font-size:10px;
                   color:#5b6b73; padding-top:4px; }
    </style></head><body onload="window.print()">
      <div class="top">
        <div>
          ${cfg?.logo_url ? `<img class="logo" src="${esc(cfg.logo_url)}" alt="" />` : ''}
          <div class="brand">${esc(cfg?.trade_name || cfg?.company_name || '')}</div>
          <div class="sub">${esc(cfg?.address_line || '')}${cfg?.city ? ' · ' + esc(cfg.city) : ''}
            ${cfg?.phone ? ' · Tel. ' + esc(cfg.phone) : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="sub">Reserva</div>
          <div style="font-size:15px;font-weight:700">${esc(reserva.confirmation)}</div>
        </div>
      </div>

      <h1>Ficha de registo do hóspede</h1>
      <table>
        ${campo('Nome', hospede?.name || reserva.guest_name)}
        ${campo('Documento de identificação', hospede?.id_number)}
        ${campo('Nacionalidade', hospede?.nationality)}
        ${campo('Data de nascimento', hospede?.birth_date)}
        ${campo('Morada', hospede?.address)}
        ${campo('Telefone', hospede?.phone || hospede?.mobile)}
        ${campo('E-mail', hospede?.email)}
        ${campo('NIF', hospede?.tax_id)}
      </table>

      <h1>Estadia</h1>
      <table>
        ${campo('Entrada', reserva.check_in)}
        ${campo('Saída', reserva.check_out)}
        ${campo('Noites', reserva.nights)}
        ${campo('Quarto', reserva.room_number || '— por atribuir —')}
        ${campo('Categoria', reserva.room_type_name)}
        ${campo('Hóspedes', `${reserva.adults} adulto(s)${reserva.children ? ` · ${reserva.children} criança(s)` : ''}`)}
      </table>

      <div class="nota">
        Declaro que os dados acima estão correctos e aceito as condições de alojamento do
        estabelecimento. Autorizo o tratamento dos meus dados pessoais para efeitos de registo
        de hóspedes e cumprimento das obrigações legais aplicáveis.
      </div>

      <div class="assin">
        <div>Assinatura do hóspede</div>
        <div>Data</div>
        <div>Recepção</div>
      </div>
    </body></html>`;

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

  return (
    <Painel titulo={`Cartão de hóspede — ${reserva.confirmation}`} onClose={onClose}
      rodape={<button className={btn} onClick={imprimir}><Printer size={13} />Imprimir</button>}>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 space-y-1.5">
        <Linha l="Hóspede" v={hospede?.name || reserva.guest_name} />
        <Linha l="Documento" v={hospede?.id_number || '— em falta na ficha —'} />
        <Linha l="Nacionalidade" v={hospede?.nationality || '— em falta na ficha —'} />
        <Linha l="Quarto" v={reserva.room_number || '— por atribuir —'} />
        <Linha l="Estadia" v={`${reserva.check_in} → ${reserva.check_out} (${reserva.nights} noites)`} />
      </div>
      <div className="text-[11px] text-gray-500 mt-2">
        É a ficha que o hóspede assina no balcão. Os dados em falta preenchem-se na ficha do
        cliente (Hóspedes &amp; Empresas) ou pelo Leitor de Documentos.
      </div>
    </Painel>
  );
}

/* ═══════════════════════════════════════════ TIPOS DE LIMPEZA */
/**
 * Pedir uma limpeza (ou manutenção) para o quarto desta reserva. Não há motor
 * próprio: cria uma tarefa de governanta — a mesma de PMS → Tarefas, que já
 * sabe libertar o quarto quando é concluída.
 */
export function TiposLimpeza({ reserva, onClose }: any) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState('CLEANING');
  const [titulo, setTitulo] = useState('');
  const [criando, setCriando] = useState(false);

  const { data: tarefas = [] } = useQuery({
    queryKey: ['pms', 'tasks', 'room', reserva.room],
    queryFn: async () => {
      const r = await apiClient.get('pms/tasks/', { params: { room: reserva.room } });
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: !!reserva.room,
  });

  const criar = async () => {
    setCriando(true);
    try {
      await apiClient.post('pms/tasks/', {
        room: reserva.room, task_type: tipo,
        title: titulo.trim() || (tipo === 'CLEANING' ? `Limpeza do quarto ${reserva.room_number}`
          : `Manutenção do quarto ${reserva.room_number}`),
      });
      setTitulo('');
      qc.invalidateQueries({ queryKey: ['pms'] });
      aviso('Tarefa criada. Aparece em PMS → Tarefas.', 'Governanta');
    } catch (e) { notifyError(e); } finally { setCriando(false); }
  };

  if (!reserva.room) {
    return (
      <Painel titulo="Tipos de limpeza" onClose={onClose}>
        <div className="text-gray-500">
          Esta reserva ainda não tem quarto atribuído — atribua um quarto antes de pedir limpeza.
        </div>
      </Painel>
    );
  }

  return (
    <Painel titulo={`Limpeza / manutenção — Quarto ${reserva.room_number}`} onClose={onClose}
      rodape={<button className={btn} disabled={criando} onClick={criar}><Plus size={13} />Criar tarefa</button>}>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] p-3 flex flex-wrap items-end gap-2 mb-3">
        <label className="flex flex-col">Tipo
          <select className={inp} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="CLEANING">Limpeza</option>
            <option value="MAINTENANCE">Manutenção</option>
            <option value="OTHER">Outra</option>
          </select></label>
        <label className="flex flex-col flex-1 min-w-[200px]">Descrição (vazia = automática)
          <input className={inp} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
      </div>
      <div className="bg-white border border-[#CFE3E6] rounded-[8px] overflow-hidden">
        <div className="px-3 py-1.5 bg-[#F7FAFA] border-b border-[#EEF4F5] text-[11px] font-bold text-[#5C8891]">
          Tarefas deste quarto
        </div>
        {tarefas.map((t: any) => (
          <div key={t.id} className="px-3 py-1.5 border-b border-[#F7FAFA] flex justify-between">
            <span>{t.title}</span>
            <span className="text-gray-500">{t.status_display || t.status}</span>
          </div>
        ))}
        {tarefas.length === 0 && <div className="px-3 py-3 text-gray-500">Sem tarefas para este quarto.</div>}
      </div>
      <div className="text-[11px] text-gray-500 mt-2">
        Concluir uma tarefa de <b>limpeza</b> devolve o quarto a Livre/Limpo. Uma de manutenção não —
        reparar o chuveiro não é limpar o quarto.
      </div>
    </Painel>
  );
}

export { money as _money };
