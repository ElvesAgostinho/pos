import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';
type Bottom = 'license' | 'member' | 'texts' | 'bank';

function Row({ label, children, w = 'w-[110px]' }: any) {
  return (
    <label className="flex items-center gap-2 text-[12px] min-w-0">
      <span className={`${w} flex-shrink-0 text-[#333]`}>{label}</span>
      {children}
    </label>
  );
}

/**
 * EMPRESA — o hotel visto pelo POS.
 * Identificação técnica, contactos, aparência nos terminais, e quatro áreas em baixo:
 * Dados da Licença · Membro de · Textos dos documentos · Informação bancária.
 */
export default function CompanyEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'main' | 'sec'>('main');
  const [bottom, setBottom] = useState<Bottom>('license');
  const [d, setD] = useState<any>({ ...row });
  const [popup, setPopup] = useState<any>(null);   // popup "Membro de"

  const { data: full } = useQuery({
    queryKey: ['posc', 'company', row?.id],
    queryFn: async () => (await apiClient.get(`org/pos/companies/${row.id}/`)).data,
    enabled: !!row?.id,
  });
  // O `onSuccess` do useQuery deixou de existir nesta versão do React Query — sem isto,
  // a ficha nunca era carregada e o que se gravava ia incompleto.
  useEffect(() => { if (full) setD(full); }, [full]);
  const src = full || d;
  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'orggroups'], queryFn: async () => (await apiClient.get('org/pos/groups/')).data });

  // Contas bancárias — CRUD real (saem impressas no rodapé da fatura).
  const invalBanks = () => qc.invalidateQueries({ queryKey: ['posc', 'company', row?.id] });
  const addBank = useMutation({
    mutationFn: () => apiClient.post('fiscal/bank-accounts/', { bank_name: 'Novo banco', currency: 'AOA' }),
    onSuccess: invalBanks, onError: notifyError,
  });
  const updBank = useMutation({
    mutationFn: ({ id, data }: any) => apiClient.patch(`fiscal/bank-accounts/${id}/`, data),
    onSuccess: invalBanks, onError: notifyError,
  });
  const delBank = useMutation({
    mutationFn: (id: number) => apiClient.delete(`fiscal/bank-accounts/${id}/`),
    onSuccess: invalBanks, onError: notifyError,
  });

  const save = useMutation({
    mutationFn: () => apiClient.patch(`org/pos/companies/${row.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Empresa gravada', message: 'Os dados passam a sair nos documentos e nos terminais.' }); onClose(); },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const mems: any[] = d.memberships ?? src?.memberships ?? [];
  const texts: any[] = d.custom_texts ?? src?.custom_texts ?? [];
  const banks: any[] = full?.bank_accounts || [];
  const lic = src?.license;

  const setText = (i: number, k: string, v: any) =>
    set('custom_texts', texts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const saveMem = (m: any) => {
    const list = m.id != null && mems.some((x) => x.id === m.id)
      ? mems.map((x) => x.id === m.id ? m : x)
      : [...mems, m];
    set('memberships', list);
    setPopup(null);
  };

  const BTab = ({ id, label }: any) => (
    <button onClick={() => setBottom(id)}
      className={`px-6 py-2 text-[13px] font-semibold ${bottom === id ? 'bg-[#3c3c3c] text-white' : 'bg-[#e8e8e8] text-[#555] hover:bg-[#ddd]'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">A editar {src?.name}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-[1fr_340px] gap-4">
          {/* --------- Identificação + contactos --------- */}
          <div className="space-y-2 min-w-0">
            <Row label="Platform ID:">
              <input value={src?.platform_id || ''} readOnly className={`${inp} flex-1 bg-[#eef0f2] text-[#666]`} style={inputStyle} />
            </Row>
            <Row label="NIF:">
              <input value={d.nif || ''} onChange={(e) => set('nif', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Id do hotel:"><input value={d.external_id || ''} onChange={(e) => set('external_id', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
              <Row label="Código Hotel:" w="w-[100px]"><input value={d.hotel_code || ''} onChange={(e) => set('hotel_code', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
              <Row label="Nome Hotel:"><input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
              <Row label="Nome do Hotel 2:" w="w-[100px]"><input value={d.name2 || ''} onChange={(e) => set('name2', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
            </div>

            {/* Contactos */}
            <div className="flex mt-2">
              {([['main', 'Main contacts'], ['sec', 'Secondary contacts']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-6 py-2 text-[13px] font-semibold ${tab === k ? 'bg-[#3c3c3c] text-white' : 'bg-[#e8e8e8] text-[#555] hover:bg-[#ddd]'}`}>{label}</button>
              ))}
            </div>
            <div className="border border-[#c0c0c0] p-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {tab === 'main' ? (
                <>
                  <Row label="Morada 1:"><input value={d.address || ''} onChange={(e) => set('address', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Telefone:"><input value={d.phone || ''} onChange={(e) => set('phone', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Morada 2:"><input value={d.address2 || ''} onChange={(e) => set('address2', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Fax:"><input value={d.fax || ''} onChange={(e) => set('fax', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Cód. Postal:"><input value={d.postal_code || ''} onChange={(e) => set('postal_code', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="E-Mail:"><input value={d.email || ''} onChange={(e) => set('email', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Cidade:"><input value={d.city || ''} onChange={(e) => set('city', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="WebSite:"><input value={d.website || ''} onChange={(e) => set('website', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="País:"><input value={d.country_code || ''} onChange={(e) => set('country_code', e.target.value.toUpperCase())} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Specific Timezone:" w="w-[120px]">
                    <input type="checkbox" checked={!!d.specific_timezone} onChange={(e) => set('specific_timezone', e.target.checked)} className="w-4 h-4" />
                  </Row>
                  <Row label="Country description:" w="w-[110px]"><input value={d.country || ''} onChange={(e) => set('country', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Timezone:">
                    <input value={d.timezone || ''} disabled={!d.specific_timezone} onChange={(e) => set('timezone', e.target.value)}
                      className={`${inp} flex-1 disabled:bg-[#eef0f2]`} style={inputStyle} />
                  </Row>
                </>
              ) : (
                <>
                  <Row label="Morada:"><input value={d.sec_address || ''} onChange={(e) => set('sec_address', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="Telefone:"><input value={d.sec_phone || ''} onChange={(e) => set('sec_phone', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                  <Row label="E-Mail:"><input value={d.sec_email || ''} onChange={(e) => set('sec_email', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></Row>
                </>
              )}
            </div>
          </div>

          {/* --------- Aparência + logótipo --------- */}
          <div className="space-y-2">
            <Row label="Cor de Fundo:" w="w-[100px]">
              <input type="color" value={d.bg_color || '#808080'} onChange={(e) => set('bg_color', e.target.value)} className="w-10 h-7 border border-[#8a95a3]" />
              <input value={d.bg_color || ''} onChange={(e) => set('bg_color', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Cor do Texto:" w="w-[100px]">
              <input value={d.text_color || ''} onChange={(e) => set('text_color', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Imagem do Hotel:" w="w-[100px]">
              <input value={d.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} placeholder="URL ou carregue um ficheiro" className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            {/* Carregar o logótipo do disco — fica no servidor do hotel, não numa nuvem terceira. */}
            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
              <span className="w-[100px] flex-shrink-0 text-[#333]">Carregar:</span>
              <input type="file" accept="image/*" className="text-[11px]"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.append('file', f);
                  fd.append('folder', 'logos');
                  try {
                    const r = await apiClient.post('platform/upload/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    set('logo_url', r.data.url);
                    notifyGuide({ title: 'Logótipo carregado', message: 'Carregue em Gravar para o aplicar nos documentos e nos terminais.' });
                  } catch (err) { notifyError(err); }
                }} />
            </label>
            <div className="border border-[#d0d0d0] h-[190px] flex items-center justify-center p-3"
              style={{ background: d.bg_color || '#fff' }}>
              {d.logo_url
                ? <img src={d.logo_url} alt="" className="max-h-full max-w-full object-contain" />
                : <span className="text-[12px]" style={{ color: d.text_color || '#888' }}>Sem logótipo</span>}
            </div>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_master} onChange={(e) => set('is_master', e.target.checked)} className="w-4 h-4" />
              Master (hotel principal desta instalação)
            </label>
          </div>
        </div>

        {/* --------- Abas de baixo --------- */}
        <div className="flex mt-3">
          <BTab id="license" label="Dados da Licença" />
          <BTab id="member" label="Membro de" />
          <BTab id="texts" label="Custom texts" />
          <BTab id="bank" label="Informação bancária" />
        </div>

        <div className="border border-[#c0c0c0] p-3 min-h-[220px]">
          {bottom === 'license' && lic && (() => {
            // Os campos cinzentos vêm do ficheiro de licença ASSINADO — não se escrevem
            // aqui de propósito: se bastasse escrever "Máx. Terminais = 99", a licença
            // não valia nada. Editáveis: Contacto e POS Location Name (são do cliente).
            const RO = ({ label, value, w = 'w-[130px]' }: any) => (
              <Row label={label} w={w}><input value={value ?? '—'} readOnly className={`${inp} flex-1 bg-[#eef0f2] text-[#555]`} /></Row>
            );
            return (
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12px]">
                <div className="space-y-2">
                  <Row label="Contacto:">
                    <input value={d.license_contact || ''} onChange={(e) => set('license_contact', e.target.value)}
                      className={`${inp} flex-1`} style={inputStyle} />
                  </Row>
                  <RO label="Licença Válida Até:" value={lic.valid_until} />
                  <RO label="Módulos Flag 1:" value={lic.modules_flag_1} />
                  <RO label="Módulos Flag 2:" value={lic.modules_flag_2} />
                  <RO label="Versão:" value={lic.version} />
                  <RO label="Max Quartos:" value={lic.max_rooms} />
                  <RO label="Características:" value={lic.features} />
                  <RO label="Código Licença:" value={lic.license_code} />
                </div>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-[12px]">
                    <span className="w-[150px] flex-shrink-0 text-[#333]">POS Location Name:</span>
                    <textarea value={d.pos_location_name || ''} onChange={(e) => set('pos_location_name', e.target.value)}
                      rows={3} className={`${inp} flex-1`} style={inputStyle} />
                  </label>
                  <RO label="Máx. Terminais (interno):" value={lic.max_terminals_internal} w="w-[150px]" />
                  <RO label="Máx. Terminais (externo):" value={lic.max_terminals_external} w="w-[150px]" />
                  <RO label="Máx. Terminais (Portátil):" value={lic.max_terminals_mobile} w="w-[150px]" />
                  <div className="pt-2 border-t border-[#eee] space-y-1">
                    {Object.entries(lic.limits || {}).map(([k, v]: any) => (
                      <div key={k} className={`text-[11px] ${v.available === 0 ? 'text-[#a01818] font-bold' : 'text-[#555]'}`}>
                        {v.label}: <b>{v.used}</b> em uso de <b>{v.licensed}</b> licenciado(s)
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-2 text-[11px] text-[#666] border-t border-[#eee] pt-2">
                  <span className="w-6 h-6 rounded-full bg-[#3c3c3c] text-white flex items-center justify-center">🔑</span>
                  <span>
                    <b>Gestor de licenças</b> — os campos a cinzento vêm do ficheiro de licença assinado pelo fornecedor
                    e não são editáveis. Para alargar módulos, terminais ou validade, contacte o fornecedor.
                  </span>
                </div>
              </div>
            );
          })()}

          {bottom === 'member' && (
            <div className="flex gap-3">
              <table className="flex-1 text-[12px] border-collapse">
                <thead><tr className="bg-[#f4f4f4]">
                  <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Grupo</th>
                  <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] w-[100px]">Ordem</th>
                  <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] w-[80px]">Ativo</th>
                </tr></thead>
                <tbody>
                  {mems.map((m, i) => (
                    <tr key={i} onDoubleClick={() => setPopup({ ...m, _i: i })} className="border-b border-[#eee] cursor-pointer hover:bg-[#f5f9ff]">
                      <td className="px-2 py-1.5">{m.group_name || groups.find((g: any) => g.id === m.group)?.name}</td>
                      <td className="px-2 py-1.5">{m.sort_order}</td>
                      <td className="px-2 py-1.5">
                        <GridCheck checked={m.is_active}
                          onChange={(v) => set('memberships', mems.map((x, j) => j === i ? { ...x, is_active: v } : x))}
                          title="Pertence a este grupo (desligar não apaga — suspende)" />
                      </td>
                    </tr>
                  ))}
                  {mems.length === 0 && <tr><td colSpan={3} className="text-center text-[#999] py-6">Não pertence a nenhum grupo.</td></tr>}
                </tbody>
              </table>
              <div className="w-[170px] space-y-1">
                {[['＋', 'Adicionar', '#2b2b2b', () => setPopup({ group: groups[0]?.id, sort_order: 100, is_active: true })],
                  ['✎', 'Editar', '#1a73c8', () => mems[0] && setPopup({ ...mems[0], _i: 0 })],
                  ['−', 'Apagar', '#c0392b', () => set('memberships', mems.slice(0, -1))]].map(([ic, lb, c, fn]: any) => (
                  <button key={lb} onClick={fn} className="flex items-center gap-2 w-full px-2 py-1.5 bg-[#3c3c3c] text-white text-[13px] hover:bg-[#4c4c4c]">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: c }}>{ic}</span>{lb}
                  </button>
                ))}
              </div>
            </div>
          )}

          {bottom === 'texts' && (
            <div className="overflow-auto max-h-[300px]">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0"><tr className="bg-[#f4f4f4]">
                  {['Código', 'Descrição', 'TEXT', 'Ativo', 'Source', 'Bold', 'Italic', 'Font Size', 'Font Name', 'Alignment'].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {texts.map((t, i) => (
                    <tr key={i} className="border-b border-[#eee]">
                      <td className="px-2 py-1 border border-[#eee] font-mono text-[11px]">{t.code}</td>
                      <td className="px-2 py-1 border border-[#eee]">{t.description}</td>
                      <td className="p-0.5 border border-[#eee]"><input value={t.text || ''} onChange={(e) => setText(i, 'text', e.target.value)} className={cell} /></td>
                      <td className="text-center border border-[#eee]"><input type="checkbox" checked={!!t.is_active} onChange={(e) => setText(i, 'is_active', e.target.checked)} className="w-4 h-4" /></td>
                      <td className="px-2 py-1 border border-[#eee] text-[11px] text-[#1565c0]">{t.source}</td>
                      <td className="text-center border border-[#eee]"><input type="checkbox" checked={!!t.bold} onChange={(e) => setText(i, 'bold', e.target.checked)} className="w-4 h-4" /></td>
                      <td className="text-center border border-[#eee]"><input type="checkbox" checked={!!t.italic} onChange={(e) => setText(i, 'italic', e.target.checked)} className="w-4 h-4" /></td>
                      <td className="p-0.5 border border-[#eee] w-[80px]"><input type="number" value={t.font_size} onChange={(e) => setText(i, 'font_size', Number(e.target.value))} className={cell} /></td>
                      <td className="p-0.5 border border-[#eee] w-[100px]"><input value={t.font_name} onChange={(e) => setText(i, 'font_name', e.target.value)} className={cell} /></td>
                      <td className="p-0.5 border border-[#eee] w-[100px]">
                        <select value={t.alignment} onChange={(e) => setText(i, 'alignment', e.target.value)} className={cell}>
                          <option value="LEFT">LEFT</option><option value="CENTER">CENTER</option><option value="RIGHT">RIGHT</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11px] text-[#666] mt-2">
                A <b>Source</b> diz de onde o valor é lido (ex.: <code>T_HOTEL.Name1</code>). Mudar o NIF na ficha muda-o em
                todos os documentos — não há dois sítios a discordar um do outro.
              </div>
            </div>
          )}

          {bottom === 'bank' && (
            <div>
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="bg-[#f4f4f4]">
                  {['Nome', 'Balcão', 'Conta', 'NIB', 'IBAN', 'SWIFT', 'BIC', 'SEPA', 'Por defeito', ''].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5]">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {banks.map((b) => {
                    const F = ({ k, mono }: any) => (
                      <td className="p-0.5 border border-[#eee]">
                        <input defaultValue={b[k] || ''} onBlur={(e) => e.target.value !== (b[k] || '') && updBank.mutate({ id: b.id, data: { [k]: e.target.value } })}
                          className={`${cell} ${mono ? 'font-mono text-[11px]' : ''}`} />
                      </td>
                    );
                    return (
                      <tr key={b.id} className="border-b border-[#eee]">
                        <F k="bank_name" /><F k="branch" /><F k="account_number" mono /><F k="nib" mono />
                        <F k="iban" mono /><F k="swift" /><F k="bic" />
                        <td className="text-center border border-[#eee]">
                          <input type="checkbox" checked={!!b.sepa} onChange={(e) => updBank.mutate({ id: b.id, data: { sepa: e.target.checked } })} className="w-4 h-4" />
                        </td>
                        <td className="text-center border border-[#eee]">
                          <input type="radio" name="bankdef" checked={!!b.is_default} onChange={() => updBank.mutate({ id: b.id, data: { is_default: true } })} className="w-4 h-4" />
                        </td>
                        <td className="text-center border border-[#eee]">
                          <button onClick={() => confirm(`Apagar a conta "${b.bank_name}"?`) && delBank.mutate(b.id)}
                            className="text-red-600 font-bold text-[11px]">Apagar</button>
                        </td>
                      </tr>
                    );
                  })}
                  {banks.length === 0 && <tr><td colSpan={10} className="text-center text-[#999] py-6">Sem contas bancárias — as faturas saem sem indicação de pagamento.</td></tr>}
                </tbody>
              </table>
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[#e0e0e0]">
                <button onClick={() => addBank.mutate()} className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#f0f0f0] px-1 py-1">
                  <span className="w-6 h-6 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center">＋</span> Adicionar
                </button>
                <span className="w-px h-6 bg-[#d5d5d5]" />
                <button onClick={() => banks.length && confirm('Apagar a última conta?') && delBank.mutate(banks[banks.length - 1].id)}
                  disabled={!banks.length} className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#f0f0f0] px-1 py-1 disabled:opacity-35">
                  <span className="w-6 h-6 rounded-full bg-[#c0392b] text-white flex items-center justify-center">−</span> Apagar
                </button>
                <span className="ml-auto text-[11px] text-[#666]">Estas contas saem impressas no rodapé da fatura — é por aqui que o cliente paga.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popup "Membro de" */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setPopup(null)}>
          <div className="bg-white border border-[#888] w-[560px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
              <span>A editar {groups.find((g: any) => g.id === popup.group)?.name || 'grupo'}</span>
              <button onClick={() => setPopup(null)} className="text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <Row label="Group Id:"><select value={popup.group || ''} onChange={(e) => setPopup({ ...popup, group: Number(e.target.value) })} className={`${inp} flex-1`} style={inputStyle}>
                {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select></Row>
              <Row label="Ordem:"><input type="number" value={popup.sort_order ?? 100} onChange={(e) => setPopup({ ...popup, sort_order: Number(e.target.value) })} className={`${inp} flex-1`} style={inputStyle} /></Row>
              <Row label="Ativo:"><input type="checkbox" checked={!!popup.is_active} onChange={(e) => setPopup({ ...popup, is_active: e.target.checked })} className="w-4 h-4" /></Row>
            </div>
            <Toolbar actions={[
              { icon: '✔', label: 'Gravar', color: '#1f7a34', onClick: () => saveMem({ group: popup.group, sort_order: popup.sort_order, is_active: popup.is_active, id: popup.id }) },
              { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: () => setPopup(null) },
            ]} />
          </div>
        </div>
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
