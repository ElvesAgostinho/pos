import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { inputStyle } from './kit';

/**
 * NOVA ENTIDADE — o editor COMPLETO da ficha (clone do HOST), em janela:
 * navegação à esquerda (Perfil → Proteção de Dados), rodapé com Gravar/Fechar.
 * Cada aba fala com o motor real: os campos gravam na ficha (mdm.Customer),
 * as listas (notas, ligações, redes sociais, documentos, acordos, consentimentos,
 * crianças…) gravam nos REGISTOS da entidade; o Histórico lê as reservas e a
 * faturação POS; a Proteção de Dados exporta (portabilidade) e remove (RGPD).
 */
const inp = 'h-7 px-2 text-[12px] border border-[#7f9db9] bg-white flex-1 min-w-0';
const NAV = [
  ['perfil', '👤', 'Perfil'], ['ident', '🪪', 'Dados de identificação'],
  ['contactos', '☎', 'Contactos/Redes Sociais'], ['cartoes', '⭐', 'Cartões de membro'],
  ['info', 'ℹ', 'Informação'], ['ligacoes', '🔗', 'Ligações'], ['reserva', '🛏', 'Reserva'],
  ['acordos', '🤝', 'Acordos'], ['salesmk', '📈', 'Sales & Marketing'],
  ['comissoes', '💰', 'Comissões'], ['pagperm', '💳', 'Pagamentos / Permissões'],
  ['historico', '🕓', 'Histórico'], ['protecao', '🔒', 'Proteção Dados'],
] as const;

function Row({ l, children, w = 110 }: any) {
  return <label className="flex items-center gap-2 text-[12px]">
    <span className="text-[#333] flex-shrink-0 text-right" style={{ width: w }}>{l}</span>{children}</label>;
}

/** Grelha genérica dos SATÉLITES (registos): colunas + Adicionar/Apagar. */
function RecGrid({ eid, kind, cols, titulo }: { eid: number; kind: string; cols: [string, string][]; titulo: string }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ['ent-rec', eid, kind],
    queryFn: async () => (await apiClient.get(`pos/marketing/entities/${eid}/records/`, { params: { kind } })).data,
    enabled: !!eid,
  });
  const inval = () => qc.invalidateQueries({ queryKey: ['ent-rec', eid, kind] });
  const add = async () => {
    const data: any = {};
    for (const [k, label] of cols) {
      const v = window.prompt(`${titulo} — ${label}:`);
      if (v === null) return;
      data[k] = v;
    }
    await apiClient.post(`pos/marketing/entities/${eid}/records/`, { kind, data });
    inval();
  };
  const del = async (r: any) => {
    if (!window.confirm('Apagar este registo?')) return;
    await apiClient.post(`pos/marketing/entities/${eid}/records/${r.id}/delete/`, {});
    inval();
  };
  if (!eid) return <div className="text-[12px] text-[#888] p-3">Grave primeiro a ficha — as listas ligam-se à entidade criada.</div>;
  return (
    <div className="border border-[#d0d0d0]">
      <div className="px-2 py-1 bg-[#e9e9e9] text-[12px] font-bold flex justify-between">
        <span>{titulo}</span>
        <span className="flex gap-2">
          <button onClick={add} className="text-[#1a4f8a]">⊕ Adicionar</button>
        </span>
      </div>
      <table className="w-full text-[12px]">
        <thead><tr className="bg-[#f4f4f4]">
          {cols.map(([k, l]) => <th key={k} className="text-left font-normal px-2 py-1 border-b border-[#d0d0d0]">{l}</th>)}
          <th className="w-[60px] border-b border-[#d0d0d0]" />
        </tr></thead>
        <tbody>
          {(rows as any[]).map((r) => (
            <tr key={r.id} className="border-b border-[#eee]">
              {cols.map(([k]) => <td key={k} className="px-2 py-1">{String(r.data?.[k] ?? '')}</td>)}
              <td className="px-2 py-1 text-center"><button onClick={() => del(r)} className="text-[#c0392b]">✖</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="text-center text-[#999] py-4">Não foram encontrados dados.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function EntityEditor({ entity, onClose, onSaved }: {
  entity: any; onClose: () => void; onSaved: () => void;
}) {
  const [sec, setSec] = useState<string>('perfil');
  const [histTab, setHistTab] = useState<'passadas' | 'futuras' | 'journey' | 'pos'>('futuras');
  const [d, setD] = useState<any>({ ...entity });
  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const eid = d.id;

  const { data: tipos = [] } = useQuery({ queryKey: ['ent-tipos'], queryFn: async () => (await apiClient.get('pos/config/customer-types/')).data?.results || (await apiClient.get('pos/config/customer-types/')).data || [] });
  const { data: cartoes = [] } = useQuery({ queryKey: ['ent-cards'], queryFn: async () => { const r = await apiClient.get('pos/config/member-cards/'); return r.data?.results || r.data || []; } });
  const { data: segs = [] } = useQuery({ queryKey: ['ent-segs'], queryFn: async () => { const r = await apiClient.get('pos/config/segments/'); return r.data?.results || r.data || []; } });
  const { data: subsegs = [] } = useQuery({ queryKey: ['ent-subsegs'], queryFn: async () => { try { const r = await apiClient.get('pos/config/sub-segments/'); return r.data?.results || r.data || []; } catch { return []; } } });
  const { data: canais = [] } = useQuery({ queryKey: ['ent-canais'], queryFn: async () => { try { const r = await apiClient.get('pos/config/channels/'); return r.data?.results || r.data || []; } catch { return []; } } });
  const { data: hist } = useQuery({
    queryKey: ['ent-hist', eid],
    queryFn: async () => (await apiClient.get(`pos/marketing/entities/${eid}/history/`)).data,
    enabled: !!eid && sec === 'historico',
  });

  const gravar = async () => {
    try {
      const body: any = {};
      for (const [k, v] of Object.entries(d)) {
        if (['contact', 'spent', 'documents', 'events', 'entity_type_name', 'card_name', 'custom_columns'].includes(k)) continue;
        body[k] = v === '' ? null : v;
      }
      if (!body.code) body.code = `CL${Date.now().toString().slice(-8)}`;
      const r = eid
        ? await apiClient.patch(`pos/marketing/entities/${eid}/`, body)
        : await apiClient.post('pos/marketing/entities/', body);
      setD({ ...d, ...r.data });
      onSaved();
      alert(`Gravado: ${r.data.name} (${r.data.code})`);
    } catch (e: any) {
      const x = e?.response?.data;
      alert(typeof x === 'object' ? Object.entries(x).map(([k, v]) => `${k}: ${v}`).join('\n') : 'Erro ao gravar.');
    }
  };

  const T = ({ k, l, w, tipo = 'text' }: any) => (
    <Row l={l} w={w}><input type={tipo} value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={inp} style={inputStyle} /></Row>);
  const S = ({ k, l, opts, w }: any) => (
    <Row l={l} w={w}><select value={d[k] ?? ''} onChange={(e) => set(k, e.target.value || null)} className={inp} style={inputStyle}>
      <option value="">- Outro -</option>{(opts as any[]).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Row>);
  const C = ({ k, l }: any) => (
    <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={!!d[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4" />{l}</label>);
  // P/Cx agora são COLUNAS REAIS da ficha (mdm.Customer) — nada em JSON.
  const P = T;
  const Cx = C;

  return (
    <div className="fixed inset-0 bg-black/45 z-[300] flex items-center justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-[1200px] max-w-[96vw] bg-[#f0f0f0] border border-[#333] shadow-2xl flex flex-col"
        style={{ height: 'min(86vh, 760px)', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold bg-[#3c3c3c]">
          <span>{eid ? `Entidade — ${d.name || d.code}` : 'Nova entidade'}</span>
          <button onClick={onClose} className="w-6 h-6 bg-[#c0140f] text-white text-[12px]">✕</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* navegação à esquerda — as abas do HOST */}
          <div className="w-[215px] flex-shrink-0 border-r border-[#c0c0c0] bg-white overflow-auto">
            {NAV.map(([k, ico, l]) => (
              <button key={k} onClick={() => setSec(k)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left border-b border-[#eee]
                  ${sec === k ? 'bg-[#dce9f7] font-bold text-[#0b4a8f]' : 'hover:bg-[#f5f5f5]'}`}>
                <span className="w-6 text-center">{ico}</span>{l}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {sec === 'perfil' && (<div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <T k="code" l="Nr. cliente:" /> <P k="internal_id" l="Id Interno:" />
              <S k="entity_type" l="Tipo de entidade:" opts={tipos} />
              <div className="flex gap-4 items-center"><C k="is_supplier" l="É fornecedor" /><Cx k="sync_enabled" l="Sincronizar" /><C k="is_active" l="Ativo" /></div>
              <T k="title" l="Título:" /> <P k="online_checkin_pct" l="Preench. Online Check-in (%):" w={190} />
              <P k="long_title" l="Tít. longo:" /> <P k="prefix" l="Prefixo:" />
              <P k="short_title" l="Título curto:" /> <T k="language" l="Língua:" />
              <T k="last_name" l="Apelido:" /> <P k="mailing_language" l="Língua mailing:" />
              <T k="name" l="Nome:" /> <P k="stat_aggregator" l="Agregador Estatístico:" />
              <T k="other_names" l="Outros nomes:" /> <P k="planning_color" l="Cor para planning:" />
              <div className="col-span-2 border-t border-[#ddd] pt-1 text-[12px] font-bold">Morada principal</div>
              <T k="address" l="Morada 1:" /> <T k="address2" l="Morada 2:" />
              <P k="address3" l="Morada 3:" /> <T k="postal_code" l="Cód. Postal:" />
              <T k="city" l="Cidade:" /> <T k="country" l="País:" />
              <P k="phone_prefix" l="Prefixo telefónico:" /> <P k="region" l="Região:" />
              <P k="district" l="Distrito:" />
              <div className="col-span-2 border-t border-[#ddd] pt-1 text-[12px] font-bold">Morada de Faturação</div>
              <T k="billing_address" l="Morada 1:" /> <P k="billing_address2" l="Morada 2:" />
              <P k="billing_postal" l="Cód. Postal:" /> <P k="billing_city" l="Cidade:" />
              <P k="billing_country" l="País:" />
            </div>)}

            {sec === 'ident' && (<div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <T k="birth_date" l="Data de nasc.:" tipo="date" /> <T k="doc_type" l="Tipo de doc.:" />
              <T k="birth_place" l="Local de nasc.:" /> <T k="id_number" l="Nr. de identif.:" />
              <T k="nationality" l="Nacionalidade:" /> <T k="doc_issue_date" l="Data emissão:" tipo="date" />
              <T k="gender" l="Género:" /> <T k="doc_valid_until" l="Validade:" tipo="date" />
              <T k="iata" l="IATA:" /> <T k="doc_issue_place" l="Local emissão:" />
              <T k="tax_id" l="Nr. contrib.:" /> <T k="doc_issued_by" l="Emitido por:" />
              <T k="account_number" l="Nº de conta:" /> <T k="position" l="Cargo:" />
              <div className="col-span-2 border-t border-[#ddd] pt-1 text-[12px] font-bold">Outra informação</div>
              <T k="other_number" l="Número:" /> <T k="internal_status" l="Status interno:" />
              <T k="portal_password" l="Password:" tipo="password" /> <T k="plate" l="Matrícula:" />
              <T k="brand" l="Marca:" />
              <div className="col-span-2 border-t border-[#ddd] pt-1 text-[12px] font-bold">Foto / Assinatura</div>
              <T k="photo_url" l="Foto (URL):" /> <T k="signature_url" l="Assinatura (URL):" />
              <div className="col-span-2 text-[11px] text-[#c0392b]">Por favor evitar imagens com tamanho superior a 200 KB.</div>
            </div>)}

            {sec === 'contactos' && (<>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                <T k="phone" l="Telefone 1:" /> <T k="phone2" l="Telefone 2:" />
                <T k="fax" l="Fax 1:" /> <T k="fax2" l="Fax 2:" />
                <T k="mobile" l="Telemóvel 1:" /> <T k="mobile2" l="Telemóvel 2:" />
                <T k="email" l="E-mail 1:" /> <T k="email2" l="E-mail 2:" />
                <T k="site" l="Site 1:" /> <T k="site2" l="Site 2:" />
              </div>
              <RecGrid eid={eid} kind="SOCIAL" titulo="Redes Sociais"
                cols={[['janela', 'Abrir nova janela'], ['descricao', 'Descrição'],
                       ['nome', 'Nome na rede social'], ['notas', 'Notas']]} />
            </>)}

            {sec === 'cartoes' && (<>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-2">
                <S k="member_card" l="Cartão principal:" opts={cartoes} />
                <T k="member_card_number" l="Número do cartão:" />
              </div>
              <RecGrid eid={eid} kind="CARD" titulo="Cartões de membro (todos)"
                cols={[['nome', 'Nome'], ['numero', 'Número'], ['valido_de', 'Válido de'], ['valido_ate', 'Válido até'],
                       ['notas', 'Notas'], ['origem', 'Origem'], ['ordem', 'Ordem'], ['ativo', 'Ativo (s/n)']]} />
              <div className="text-[11px] text-[#666] mt-1">O saldo/pontos vivem no motor de cartões (ledger); o principal é o que o POS usa.</div>
            </>)}

            {sec === 'info' && (<>
              <Row l="Informação geral:" w={120}>
                <textarea value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3}
                  className="flex-1 border border-[#7f9db9] text-[12px] p-1" style={inputStyle} />
              </Row>
              <RecGrid eid={eid} kind="INFO" titulo="Informação para secção (Administração | Front Office | Governanta | F&B | TECH_SUPP | Finance)"
                cols={[['seccao', 'Secção'], ['texto', 'Informação']]} />
              <RecGrid eid={eid} kind="NOTE" titulo="Notas"
                cols={[['categoria', 'Categoria'], ['ordem', 'Ordem'], ['assunto', 'Assunto'],
                       ['nota', 'Nota'], ['visivel', 'Visível p/ hóspede (s/n)']]} />
              <RecGrid eid={eid} kind="CUSTOM" titulo="Campos personalizados"
                cols={[['descricao', 'Descrição'], ['valor', 'Valor']]} />
              <RecGrid eid={eid} kind="DOC" titulo="Documentos"
                cols={[['ficheiro', 'Ficheiro (URL)'], ['descricao', 'Descrição'], ['observacoes', 'Observações']]} />
            </>)}

            {sec === 'ligacoes' && <RecGrid eid={eid} kind="LINK" titulo="Ligações (entidades relacionadas)"
              cols={[['nome', 'Nome'], ['tipo', 'Tipo'], ['subtipo', 'Sub tipo'], ['genero', 'Género'],
                     ['profissao', 'Profissão'], ['nascimento', 'Data de nasc.'], ['cidade', 'Cidade'], ['pais', 'País']]} />}

            {sec === 'reserva' && (<div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <div className="col-span-2 text-[12px] font-bold">Preferências do hóspede</div>
              <T k="pref_complex" l="Complexo:" /> <T k="pref_price_list" l="Lista Preços:" />
              <T k="pref_category" l="Categoria:" /> <T k="pref_package" l="Package:" />
              <T k="pref_meals" l="Refeições:" /> <T k="pref_pos_price" l="Preço POS:" tipo="number" />
              <T k="pref_rest_table" l="Mesa Rest.:" /> <T k="pref_meal_type" l="Tipo de Refeição:" />
              <div className="col-span-2 text-[12px] font-bold border-t border-[#ddd] pt-1">Informação da reserva</div>
              <C k="suggest_on_reservation" l="Sugerir por omissão na reserva" /> <T k="pref_room" l="Quarto:" />
              <Row l="Texto da sugestão:" w={120}><textarea value={d.suggestion_text ?? ''} onChange={(e) => set('suggestion_text', e.target.value)} rows={2} className="flex-1 border border-[#7f9db9] text-[12px] p-1" style={inputStyle} /></Row>
              <div className="space-y-1.5"><T k="pref_discount" l="Desconto:" /><T k="pref_discount_rule" l="Regra de Desc.:" /></div>
              <div className="col-span-2 text-[12px] font-bold border-t border-[#ddd] pt-1">Aviso / Bloqueio</div>
              <C k="has_warnings" l="Hóspede com avisos" /> <C k="only_cash" l="Apenas cash" />
              <Row l="Texto do aviso:" w={120}><textarea value={d.warning_text ?? ''} onChange={(e) => set('warning_text', e.target.value)} rows={2} className="flex-1 border border-[#7f9db9] text-[12px] p-1" style={inputStyle} /></Row>
              <div className="space-y-1.5">
                <C k="is_blocked" l="Bloquear reserva e contas" />
                <Row l="Modo:" w={60}><select value={d.block_mode ?? ''} onChange={(e) => set('block_mode', e.target.value || null)} className={inp} style={inputStyle}><option value="">—</option><option value="AVISO">Aviso</option><option value="BLOQUEIO">Bloqueio</option></select></Row>
                <T k="block_from" l="Bloquear de:" tipo="date" /> <T k="block_to" l="Até:" tipo="date" />
              </div>
              <div className="col-span-2 text-[12px] font-bold border-t border-[#ddd] pt-1">Interfaces externos</div>
              <T k="pay_tv" l="Pay-TV:" /> <T k="video" l="Video:" />
              <T k="minibar" l="Minibar:" />
              <div className="text-[11px] text-[#666]">Se "(nenhum)", usam-se os valores por defeito da interface.</div>
            </div>)}

            {sec === 'acordos' && (<>
              <RecGrid eid={eid} kind="AGREEMENT" titulo="Entidades associadas"
                cols={[['nome', 'Nome'], ['tipo', 'Tipo'], ['morada', 'Morada'], ['cidade', 'Cidade'], ['pais', 'País']]} />
              <RecGrid eid={eid} kind="BILLING" titulo="Instruções de Faturação"
                cols={[['nome', 'Nome'], ['instrucao', 'Instrução'], ['por', 'Por']]} />
            </>)}

            {sec === 'salesmk' && (<div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <div className="col-span-2 flex gap-5"><C k="include_mailings" l="Incluir nos mailings" /></div>
              <div className="col-span-2 text-[12px] font-bold">Tipos de mailings</div>
              <div className="col-span-2 flex gap-5"><C k="mailing_general" l="Mailing Geral" /><C k="mailing_events" l="Mailing de Eventos" /><C k="mailing_birthday" l="Mailing de Aniversário" /></div>
              <div className="col-span-2"><RecGrid eid={eid} kind="SELCODE" titulo="Códigos de seleção"
                cols={[['codigo', 'Código'], ['descricao', 'Descrição']]} /></div>
              <div className="col-span-2 text-[12px] font-bold border-t border-[#ddd] pt-1">Códigos de Sales & Marketing</div>
              <S k="segment" l="Segmento:" opts={segs} /> <T k="vip_code" l="Código VIP:" />
              <S k="sub_segment" l="Sub-Segmento:" opts={subsegs} /> <S k="channel" l="Canal de Dist.:" opts={canais} />
              <T k="vip_discount_percent" l="Desc. VIP (%):" />
              <div className="flex gap-4"><C k="is_vip" l="É VIP" /><C k="distinction_program" l="Incluído no programa de distinção" /></div>
            </div>)}

            {sec === 'comissoes' && (<>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-2">
                <T k="commission_code" l="Cód. Comissão:" /> <T k="commission_pct" l="Percent. comissão:" tipo="number" />
              </div>
              <RecGrid eid={eid} kind="COMMISSION" titulo="Outras Comissões"
                cols={[['codigo', 'Cód. comissão'], ['de', 'De data'], ['ate', 'Até à data'], ['ativo', 'Ativo (s/n)']]} />
            </>)}

            {sec === 'pagperm' && (<div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <div className="col-span-2 text-[12px] font-bold">Contas correntes</div>
              <C k="allow_cc_checkout" l="Permitir check-out para contas correntes" /> <T k="financial_number" l="Nº financeiro:" />
              <T k="cc_by" l="C. correntes por:" /> <T k="credit_days" l="Cond. crédito (dias):" tipo="number" />
              <div className="col-span-2 text-[12px] font-bold border-t border-[#ddd] pt-1">Limite de Crédito (Em aberto)</div>
              <T k="credit_limit" l="Limite crédito:" /> <T k="credit_limit_mode" l="Restrições:" />
              <C k="credit_limit_pos_enabled" l="Limite crédito (POS)" /> <T k="credit_limit_pos" l="Valor (POS):" />
              <div className="col-span-2 text-[12px] font-bold border-t border-[#ddd] pt-1">Fatura Electrónica / Imposto Retido</div>
              <T k="einvoice_mode" l="Fatura Electrónica:" /> <T k="withholding_tax" l="Imposto Retido:" />
              <div className="col-span-2 text-[11px] text-[#666]">O limite é IMPOSTO pelo motor ao cobrar em conta corrente; bloqueada = crédito recusado.</div>
            </div>)}

            {sec === 'historico' && (<>
              <div className="flex gap-1 mb-2">
                {(['passadas', 'futuras', 'journey', 'pos'] as const).map((t) => (
                  <button key={t} onClick={() => setHistTab(t)}
                    className={`px-3 py-1.5 text-[12px] font-bold border border-[#c0c0c0] ${histTab === t ? 'bg-[#3c3c3c] text-white' : 'bg-white'}`}>
                    {{ passadas: 'Reservas passadas', futuras: 'Reservas futuras', journey: 'Guest Journey', pos: 'Faturação - POS' }[t]}
                  </button>))}
              </div>
              {histTab === 'journey' && <RecGrid eid={eid} kind="JOURNEY" titulo="Guest Journey"
                cols={[['data', 'Data'], ['descricao', 'Descrição'], ['visivel', 'Visível p/ hóspede (s/n)']]} />}
              {histTab === 'pos' && (<table className="w-full text-[12px] border border-[#d0d0d0]"><thead><tr className="bg-[#f4f4f4]">
                {['Número', 'Data', 'Tipo', 'Total', 'Anulado', ''].map((h, i) => <th key={i} className="text-left font-normal px-2 py-1 border-b border-[#d0d0d0]">{h}</th>)}</tr></thead>
                <tbody>{(hist?.invoices || []).map((f: any, i: number) => (
                  <tr key={i} className="border-b border-[#eee]"><td className="px-2 py-1">{f.number}</td><td className="px-2 py-1">{f.date}</td><td className="px-2 py-1">{f.type}</td><td className="px-2 py-1 text-right">{f.total}</td><td className="px-2 py-1">{f.voided ? 'Sim' : ''}</td>
                    <td className="px-2 py-1 flex gap-2">
                      <button className="text-[#1a4f8a]" onClick={async () => { const r = await apiClient.get(`pos/reports/documents/${f.id}/`); alert(JSON.stringify(r.data, null, 1).slice(0, 1200)); }}>🔍 Pré-visualizar</button>
                      <button className="text-[#1a4f8a]" onClick={async () => { const r = await apiClient.post(`pos/reports/documents/${f.id}/`, { action: 'print' }); alert(r.data.detail); }}>🖨 Imprimir</button>
                      {!f.voided && <button className="text-[#c0392b]" onClick={async () => { const m = window.prompt('Anular emite NOTA DE CRÉDITO. Motivo:'); if (!m) return; const r = await apiClient.post(`pos/reports/documents/${f.id}/`, { action: 'void', reason: m }); alert(r.data.detail); }}>✖ Anular</button>}
                    </td></tr>))}
                  {!(hist?.invoices || []).length && <tr><td colSpan={6} className="text-center text-[#999] py-3">Não foram encontrados dados.</td></tr>}
                </tbody></table>)}
              {(histTab === 'passadas' || histTab === 'futuras') && (<>
              <div className="text-[12px] font-bold">Reservas (PMS)</div>
              <table className="w-full text-[12px] border border-[#d0d0d0]"><thead><tr className="bg-[#f4f4f4]">
                {['Nº', 'Estado', 'Check-In', 'Check-Out', 'Quarto'].map((h) => <th key={h} className="text-left font-normal px-2 py-1 border-b border-[#d0d0d0]">{h}</th>)}</tr></thead>
                <tbody>{(hist?.reservations || [])
                  .filter((r: any) => histTab === 'futuras'
                    ? String(r.check_out || '') >= new Date().toISOString().slice(0, 10)
                    : String(r.check_out || '') < new Date().toISOString().slice(0, 10))
                  .map((r: any, i: number) => (
                  <tr key={i} className="border-b border-[#eee]"><td className="px-2 py-1">{r.number}</td><td className="px-2 py-1">{r.status}</td><td className="px-2 py-1">{r.check_in}</td><td className="px-2 py-1">{r.check_out}</td><td className="px-2 py-1">{r.room}</td></tr>))}
                  {!(hist?.reservations || []).length && <tr><td colSpan={5} className="text-center text-[#999] py-3">Não foram encontrados dados.</td></tr>}
                </tbody></table>
              </>)}
            </>)}

            {sec === 'protecao' && (<>
              <RecGrid eid={eid} kind="CONSENT" titulo="Consentimentos (RGPD)"
                cols={[['codigo', 'Código'], ['descricao', 'Descrição'], ['dias', 'Duração (dias)'], ['metodo', 'Método']]} />
              <RecGrid eid={eid} kind="CHILD" titulo="Crianças"
                cols={[['nome', 'Nome'], ['nascimento', 'Data de nasc.'], ['info', 'Informações']]} />
              <RecGrid eid={eid} kind="LOG" titulo="Log (RGPD)"
                cols={[['mensagem_id', 'Mensagem Id'], ['mensagem', 'Mensagem']]} />
              <div className="flex gap-2 mt-2">
                <button onClick={async () => {
                  const r = await apiClient.get(`pos/marketing/entities/${eid}/export/`, { responseType: 'blob' });
                  const url = URL.createObjectURL(r.data); const a = document.createElement('a');
                  a.href = url; a.download = `entidade_${d.code}.json`; a.click(); URL.revokeObjectURL(url);
                }} disabled={!eid}
                  className="h-9 px-4 text-[13px] font-bold bg-[#3c3c3c] text-white disabled:opacity-40">Portabilidade de Dados</button>
                <button onClick={async () => {
                  if (!window.confirm('ATENÇÃO! Remoção IRREVERSÍVEL (RGPD): os dados pessoais apagam-se e o nome vira um código anónimo. Os documentos fiscais mantêm-se, como a AGT exige. Continuar?')) return;
                  const r = await apiClient.post(`pos/marketing/entities/${eid}/anonymize/`, {});
                  alert(r.data.detail); onSaved(); onClose();
                }} disabled={!eid}
                  className="h-9 px-4 text-[13px] font-bold bg-[#8a0f0f] text-white disabled:opacity-40">Iniciar Processo de Remoção</button>
              </div>
            </>)}
          </div>
        </div>

        {/* rodapé clássico */}
        <div className="h-12 flex items-center gap-5 px-4 bg-[#e4e4e4] border-t border-[#c0c0c0] text-[13px]">
          <span className="text-[#888]">👤 Guest Info</span>
          <span className="text-[#888]">⎇ Sincronizar</span>
          <button onClick={() => window.print()} className="hover:underline">🖨 Imprimir</button>
          <div className="flex-1" />
          <button onClick={gravar} className="flex items-center gap-1.5 font-bold"><span className="w-5 h-5 rounded-full bg-[#1f7a34] text-white text-[11px] flex items-center justify-center">✔</span> Gravar</button>
          <button onClick={onClose} className="flex items-center gap-1.5 font-bold"><span className="w-5 h-5 rounded-full bg-[#c0140f] text-white text-[11px] flex items-center justify-center">✕</span> Fechar</button>
        </div>
      </div>
    </div>
  );
}
