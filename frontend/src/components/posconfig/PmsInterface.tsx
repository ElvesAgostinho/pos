import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border-0 px-1.5 py-1 text-[12px] bg-transparent outline-none';

type Tab = 'map' | 'multi' | 'ext';

/**
 * INTERFACE COM PMS — como o consumo do hóspede chega ao folio do quarto.
 *
 * É a ponte entre o restaurante e a receção. Se estiver mal, o hóspede janta e a
 * conta não aparece no quarto — ou aparece com o encargo errado, e leva a taxa errada.
 *
 *  · Mapeamentos        — que ENCARGO usar por sub-família e por ponto de venda;
 *  · Ligações Multi Hotel — falar com o PMS de OUTRO hotel da rede;
 *  · Ligações externas  — cada setor pode ir buscar as contas a um servidor diferente.
 */
export default function PmsInterface() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('map');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex border-b-2 border-[#2b2b2b] px-3 bg-[#f7f7f7]">
        {([['map', 'Mapeamentos'], ['multi', 'Ligações Multi Hotel'], ['ext', 'Ligações externas']] as const)
          .map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-[13px] font-semibold border-b-[3px] ${tab === k ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
              {l}
            </button>
          ))}
      </div>

      {tab === 'map' && <Mapeamentos qc={qc} />}
      {tab === 'multi' && <MultiHotel />}
      {tab === 'ext' && <Externas />}
    </div>
  );
}

// ------------------------------------------------------------------ Mapeamentos
function Mapeamentos({ qc }: { qc: any }) {
  const [d, setD] = useState<any>({ outlets: [], sectors: [], rows: [] });
  const [q, setQ] = useState('');
  const [encargo, setEncargo] = useState('');
  const [sel, setSel] = useState<number[]>([]);
  const [showDesc, setShowDesc] = useState(false);
  const [dirty, setDirty] = useState<Record<string, any>>({});

  const { data } = useQuery({
    queryKey: ['posc', 'pms-map'],
    queryFn: async () => (await apiClient.get('pos/config/pms-mappings/')).data,
  });
  useEffect(() => { if (data) setD(data); }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.post('pos/config/pms-mappings/', {
      sectors: d.sectors,
      cells: Object.values(dirty),
    }),
    onSuccess: () => {
      setDirty({});
      qc.invalidateQueries({ queryKey: ['posc', 'pms-map'] });
      notifyGuide({
        title: 'Mapeamentos gravados',
        message: 'O consumo do hóspede passa a entrar no folio com o encargo certo de cada ponto de venda.',
      });
    },
    onError: notifyError,
  });

  const setCell = (sf: number, outlet: number, k: 'charge' | 'tax', v: string) => {
    setD((o: any) => ({
      ...o,
      rows: o.rows.map((r: any) => r.id !== sf ? r : {
        ...r, cells: { ...r.cells, [outlet]: { ...r.cells[outlet], [k]: v } },
      }),
    }));
    const key = `${sf}-${outlet}`;
    const row = d.rows.find((r: any) => r.id === sf);
    const cur = row?.cells?.[outlet] || {};
    setDirty((o) => ({ ...o, [key]: { subfamily: sf, outlet, ...cur, [k]: v } }));
  };

  const setSector = (id: number, k: string, v: any) =>
    setD((o: any) => ({ ...o, sectors: o.sectors.map((s: any) => s.id === id ? { ...s, [k]: v } : s) }));

  const rows = (d.rows || []).filter((r: any) =>
    !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()));

  /** Aplica o encargo escolhido às linhas selecionadas, em TODOS os pontos de venda. */
  const aplicar = () => {
    if (!encargo || sel.length === 0) return;
    sel.forEach((sf) => (d.outlets || []).forEach((o: any) => setCell(sf, o.id, 'charge', encargo)));
    notifyGuide({ title: 'Encargo aplicado', message: `${sel.length} sub-família(s). Carregue em Gravar para confirmar.` });
  };

  return (
    <>
      <div className="flex-1 overflow-auto">
        {/* Mapeamento de parâmetros (setores) */}
        <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#d0d0d0]">
          Mapeamento de Parâmetros
        </div>
        <table className="w-full text-[12px] border-collapse">
          <thead><tr className="bg-[#f4f4f4]">
            {['Setor', 'Descrição', 'Departamento', 'Conta por defeito', 'Paymaster', 'Visível'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(d.sectors || []).map((s: any) => (
              <tr key={s.id} className="border-b border-[#eee]">
                <td className="px-2 py-1">{s.name}</td>
                <td className="p-0.5"><input value={s.pms_department || ''} placeholder={s.name}
                  onChange={(e) => setSector(s.id, 'pms_department', e.target.value)} className={`${cell} border border-[#e0e0e0] bg-white`} /></td>
                <td className="p-0.5"><input value={s.pms_department || ''} readOnly className={`${cell} bg-[#f7f7f7] text-[#666]`} /></td>
                <td className="p-0.5"><input value={s.pms_default_account || ''} placeholder="REST_COM"
                  onChange={(e) => setSector(s.id, 'pms_default_account', e.target.value)} className={`${cell} border border-[#e0e0e0] bg-white`} /></td>
                <td className="p-0.5"><input value={s.pms_paymaster || ''} placeholder="9000"
                  onChange={(e) => setSector(s.id, 'pms_paymaster', e.target.value)} className={`${cell} border border-[#e0e0e0] bg-white`} /></td>
                <td className="text-center">
                  <GridCheck checked={s.pms_visible} onChange={(v) => setSector(s.id, 'pms_visible', v)}
                    title="Visível no PMS — desligado, a receção não vê este setor" />
                </td>
              </tr>
            ))}
            {(d.sectors || []).length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#999] py-6">Sem setores. Crie-os em Parâmetros do Sistema → Setores.</td></tr>
            )}
          </tbody>
        </table>

        {/* Mapeamento de sub-famílias */}
        <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-y border-[#d0d0d0] mt-2">
          Mapeamento de sub-famílias
        </div>
        <div className="flex items-center gap-3 px-3 py-2 bg-[#f7f7f7] border-b border-[#d0d0d0] text-[12px]">
          <span>Pesquisar:</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} w-[200px]`} style={inputStyle} />
          <span className="ml-2">Encargo:</span>
          <input value={encargo} onChange={(e) => setEncargo(e.target.value)} placeholder="(nenhum)"
            className={`${inp} w-[240px]`} style={inputStyle} />
          <button onClick={aplicar} disabled={!encargo || sel.length === 0}
            className="flex items-center gap-2 px-2 py-1 hover:bg-[#e8e8e8] disabled:opacity-35">
            <span className="w-5 h-5 rounded-full bg-[#1f7a34] text-white flex items-center justify-center text-[11px]">✔</span>
            Aplicar à seleção ({sel.length})
          </button>
          <label className="flex items-center gap-2 ml-auto">
            <input type="checkbox" checked={showDesc} onChange={(e) => setShowDesc(e.target.checked)} className="w-4 h-4" />
            Visualizar descrição
          </label>
        </div>

        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            <th className="w-[36px] border-b border-[#d0d0d0]" />
            <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Descrição</th>
            {(d.outlets || []).map((o: any) => (
              <th key={o.id} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{o.name}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#eee]">
                <td className="text-center">
                  <input type="checkbox" checked={sel.includes(r.id)} className="w-4 h-4"
                    onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {r.code} - {r.name} {showDesc && <span className="text-[#888]">({r.id})</span>}
                </td>
                {(d.outlets || []).map((o: any) => {
                  const c = r.cells?.[o.id] || {};
                  const vazio = !c.charge;
                  return (
                    <td key={o.id} className="p-0" style={{ background: vazio ? '#ffe0b2' : undefined }}>
                      <div className="flex items-center">
                        <input value={c.charge || ''} placeholder="sem encargo"
                          onChange={(e) => setCell(r.id, o.id, 'charge', e.target.value)}
                          className={cell} />
                        <input value={c.tax || ''} placeholder="—" title="Taxa do encargo"
                          onChange={(e) => setCell(r.id, o.id, 'tax', e.target.value)}
                          className="w-[54px] border-0 px-1 py-1 text-[12px] bg-transparent outline-none text-[#1a4f8a]" />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={2 + (d.outlets?.length || 0)} className="text-center text-[#999] py-8">Sem sub-famílias.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1 text-[11px] text-[#8a6100] bg-[#fff7e6] border-t border-[#e0c080]">
        As células a <b>laranja</b> não têm encargo: nesse ponto de venda, o consumo do hóspede
        <b> não consegue entrar no folio</b>.
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : `Gravar${Object.keys(dirty).length ? ` (${Object.keys(dirty).length})` : ''}`,
          color: '#1f7a34', onClick: () => save.mutate() },
      ]} />
    </>
  );
}

// -------------------------------------------------------------- Multi Hotel
function MultiHotel() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const { data: links = [] } = useQuery({
    queryKey: ['posc', 'pms-hotels'],
    queryFn: async () => (await apiClient.get('pos/config/pms-hotels/')).data,
  });
  const del = useMutation({
    mutationFn: (id: number) => apiClient.delete(`pos/config/pms-hotels/${id}/`),
    onSuccess: () => { setSel(null); qc.invalidateQueries({ queryKey: ['posc', 'pms-hotels'] }); },
    onError: notifyError,
  });

  if (edit) return <LinkForm row={edit} kind="hotel" onClose={() => setEdit(null)} />;

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead><tr className="bg-[#f0f0f0]">
            {['Ativo', 'Por defeito', 'Id do Hotel', 'Descrição', 'Servidor', 'Base de dados', 'Utilizador', 'Password', 'Modo', 'Último teste'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(links as any[]).map((l) => (
              <tr key={l.id} onClick={() => setSel(l.id)} onDoubleClick={() => setEdit(l)}
                className={`border-b border-[#eee] cursor-pointer ${sel === l.id ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                <td className="text-center"><GridCheck checked={l.is_active} /></td>
                <td className="text-center"><GridCheck checked={l.is_default} /></td>
                <td className="px-2 py-1.5">{l.hotel_id}</td>
                <td className="px-2 py-1.5">{l.description}</td>
                <td className="px-2 py-1.5">{l.server || '—'}</td>
                <td className="px-2 py-1.5">{l.database || '—'}</td>
                <td className="px-2 py-1.5">{l.trusted ? '(trusted)' : (l.username || '—')}</td>
                <td className="px-2 py-1.5 text-[#888]">{l.has_password ? '- - - - -' : '—'}</td>
                <td className="px-2 py-1.5">{l.mode === 'FULL' ? 'Completo' : 'Simples'}</td>
                <td className="px-2 py-1.5">
                  {!l.last_test_at ? <span className="text-[#888]">Desconhecido</span>
                    : l.last_test_ok ? <span className="text-[#1f7a34] font-bold">Ligado</span>
                      : <span className="text-[#c0392b] font-bold">Sem resposta</span>}
                </td>
              </tr>
            ))}
            {(links as any[]).length === 0 && (
              <tr><td colSpan={10} className="text-center text-[#999] py-10">
                Sem ligações. Só são precisas se este hotel fizer parte de uma rede.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toolbar actions={[
        { icon: '＋', label: 'Adicionar', color: '#2b2b2b', onClick: () => setEdit({ is_active: true, hotel_id: '0', mode: 'SIMPLE' }) },
        { icon: '✎', label: 'Editar', color: '#1a73c8', disabled: !sel, onClick: () => setEdit((links as any[]).find((l) => l.id === sel)) },
        { icon: '−', label: 'Apagar', color: '#c0392b', disabled: !sel, onClick: () => confirm('Apagar esta ligação?') && del.mutate(sel!) },
      ]} />
    </>
  );
}

// -------------------------------------------------------------- Ligações externas
function Externas() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);

  const { data: links = [] } = useQuery({
    queryKey: ['posc', 'pms-ext'],
    queryFn: async () => (await apiClient.get('pos/config/pms-external/by_sector/')).data,
  });
  void qc;

  if (edit) return <LinkForm row={edit} kind="ext" onClose={() => setEdit(null)} />;

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead><tr className="bg-[#f0f0f0]">
            {['Ativo', 'Company Id', 'Descrição', 'Servidor', 'Base de dados', 'Utilizador', 'Password', 'Trusted', 'Status'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(links as any[]).map((l) => (
              <tr key={l.id} onDoubleClick={() => setEdit(l)} onClick={() => setEdit(l)}
                className="border-b border-[#eee] cursor-pointer hover:bg-[#f5f9ff]">
                <td className="text-center"><GridCheck checked={l.is_active} /></td>
                <td className="px-2 py-1.5">{l.company_id}</td>
                <td className="px-2 py-1.5">{l.sector_name}</td>
                <td className="px-2 py-1.5">{l.server || ''}</td>
                <td className="px-2 py-1.5">{l.database || ''}</td>
                <td className="px-2 py-1.5">{l.username || ''}</td>
                <td className="px-2 py-1.5 text-[#888]">{l.has_password ? '- - - - -' : '—'}</td>
                <td className="text-center"><GridCheck checked={l.trusted} /></td>
                <td className="px-2 py-1.5">
                  {l.status === 'Ligado' ? <span className="text-[#1f7a34] font-bold">Ligado</span>
                    : l.status === 'Sem resposta' ? <span className="text-[#c0392b] font-bold">Sem resposta</span>
                      : <span className="text-[#888]">Desconhecido</span>}
                </td>
              </tr>
            ))}
            {(links as any[]).length === 0 && (
              <tr><td colSpan={9} className="text-center text-[#999] py-10">Sem setores ativos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1 text-[11px] text-[#666] bg-[#f7f7f7] border-t border-[#e0e0e0]">
        Um setor só precisa de ligação externa se as contas dos quartos viverem noutro servidor.
        Clique na linha para editar.
      </div>
      <Toolbar actions={[{ icon: '✎', label: 'Editar', color: '#1a73c8', disabled: true, onClick: () => {} }]} />
    </>
  );
}

// -------------------------------------------------------------- Formulário comum
function LinkForm({ row, kind, onClose }: { row: any; kind: 'hotel' | 'ext'; onClose: () => void }) {
  const qc = useQueryClient();
  const isHotel = kind === 'hotel';
  const base = isHotel ? 'pos/config/pms-hotels/' : 'pos/config/pms-external/';
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ ...row });
  const [pw, setPw] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const body = { ...d };
      if (pw) body.password = pw; else delete body.password;
      return isNew ? apiClient.post(base, body) : apiClient.patch(`${base}${row.id}/`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Ligação gravada',
        message: 'A password é guardada e nunca mais é devolvida pela API — só se substitui. Use "Testar Ligação" para confirmar.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const test = useMutation({
    mutationFn: () => apiClient.post(`${base}${row.id}/test/`),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: r.data.ok ? 'Servidor respondeu' : 'Sem resposta',
        message: r.data.detail,
      });
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const Row = ({ label, children }: any) => (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[120px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 text-white text-[14px] font-bold" style={{ background: '#3c3c3c' }}>
        <span>
          {isHotel
            ? `Ligações Multi Hotel - ${isNew ? 'Adicionar' : `Editar ${d.description || ''}`}`
            : `Ligações externas - Editar ${d.sector_name || ''}`}
        </span>
        <button onClick={onClose} className="w-5 h-5 bg-[#c0392b] text-[12px] leading-none">✕</button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-2 max-w-[720px]">
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
          Ativo
        </label>
        {isHotel && (
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={!!d.is_default} onChange={(e) => set('is_default', e.target.checked)} className="w-4 h-4" />
            Por defeito <span className="text-[#888]">(só uma pode sê-lo)</span>
          </label>
        )}

        <Row label={isHotel ? 'Id do Hotel:' : 'Id do Hotel:'}>
          <input value={isHotel ? (d.hotel_id ?? '0') : (d.company_id ?? '0')}
            onChange={(e) => set(isHotel ? 'hotel_id' : 'company_id', e.target.value)}
            className={`${inp} w-[280px]`} style={inputStyle} />
        </Row>
        {isHotel && (
          <Row label="Descrição:">
            <input value={d.description || ''} onChange={(e) => set('description', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
        )}
        <Row label="Servidor:">
          <input value={d.server || ''} onChange={(e) => set('server', e.target.value)}
            placeholder="192.168.1.10  ou  SRV-PMS,1433" className={`${inp} flex-1`} style={inputStyle} />
        </Row>
        <Row label="Base de dados:">
          <input value={d.database || ''} onChange={(e) => set('database', e.target.value)}
            className={`${inp} flex-1`} style={inputStyle} />
        </Row>

        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={!!d.trusted} onChange={(e) => set('trusted', e.target.checked)} className="w-4 h-4" />
          Trusted <span className="text-[#888]">(autenticação integrada — dispensa utilizador/password)</span>
        </label>

        <div className={d.trusted ? 'opacity-45 pointer-events-none' : ''}>
          <Row label="Utilizador:">
            <input value={d.username || ''} onChange={(e) => set('username', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Password:">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder={d.has_password ? '(guardada — escreva para substituir)' : ''}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
        </div>

        {isHotel && (
          <>
            <Row label="Encargo:">
              <input value={d.charge_code || ''} onChange={(e) => set('charge_code', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Paymaster:">
              <input value={d.paymaster || ''} onChange={(e) => set('paymaster', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Taxas a aplicar:">
              <input value={d.taxes || ''} onChange={(e) => set('taxes', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Modo:">
              <select value={d.mode || 'SIMPLE'} onChange={(e) => set('mode', e.target.value)}
                className={`${inp} w-[280px]`} style={inputStyle}>
                <option value="SIMPLE">Simples</option>
                <option value="FULL">Completo</option>
              </select>
            </Row>
          </>
        )}

        {!isNew && d.last_test_detail && (
          <div className={`text-[11px] px-2 py-1 border mt-2 ${d.last_test_ok
            ? 'bg-[#e8f5e9] border-[#b6d7b9] text-[#1f7a34]'
            : 'bg-[#fdecea] border-[#e6b0aa] text-[#a01818]'}`}>
            Último teste: {d.last_test_detail}
          </div>
        )}
        <div className="text-[11px] text-[#666] pt-2 border-t border-[#eee] mt-2">
          A password é de um utilizador de <b>serviço</b> (base de dados), não de uma pessoa.
          Fica guardada e a API <b>nunca a devolve</b> — só se pode substituir.
        </div>
      </div>

      <Toolbar actions={[
        { icon: '⟳', label: test.isPending ? 'A testar…' : 'Testar Ligação', color: '#5d4037',
          disabled: isNew, onClick: () => test.mutate() },
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
