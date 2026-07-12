import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';
import { ItemPicker, SubFamilyPicker } from './Pickers';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[100px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * CARTÃO DE MEMBRO — o cartão do sócio, do all-inclusive, do cliente frequente.
 *
 * As quatro caixas dizem o que o cartão FAZ, e não são etiquetas:
 *   · Crédito  — tem saldo e paga (pré-pago / all-inclusive);
 *   · Débito   — acumula dívida para pagar no fim;
 *   · Pontos   — acumula pontos por consumo;
 *   · Desconto — dá desconto nos artigos da lista de baixo.
 *
 * Os PACOTES são os artigos que o cartão inclui — esses ficam a zero. E o HAPPY
 * HOUR ligado ao cartão é o que faz o all-inclusive de verdade: das 10h às 18h os
 * artigos incluídos não se pagam, mas só para quem tem o cartão.
 */
export default function MemberCardEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    is_active: true, price: 0, has_credit: false, has_debit: false,
    has_points: false, has_discount: false, package_ids: [], discounts: [], ...row,
  });
  const [picker, setPicker] = useState<'pack' | 'item' | 'sub' | null>(null);
  const [q, setQ] = useState('');
  const [sim, setSim] = useState<any>(null);

  const { data: happys = [] } = useQuery({
    queryKey: ['posc', 'happy'],
    queryFn: async () => (await apiClient.get('pos/config/happy-hours/')).data,
  });
  const { data: articles = [] } = useQuery({
    queryKey: ['posc', 'articles-all'],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/');
      return r.data?.results || r.data || [];
    },
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/member-cards/', d)
      : apiClient.patch(`pos/config/member-cards/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Cartão gravado',
        message: 'O POS passa a saber o que fazer quando o cliente encostar este cartão ao leitor.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const simular = useMutation({
    mutationFn: (item: number) => apiClient.post(`pos/config/member-cards/${row.id}/simulate/`, { item }),
    onSuccess: (r: any) => setSim(r.data),
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const ds: any[] = d.discounts || [];
  const packs: number[] = d.package_ids || [];
  const setDisc = (i: number, v: any) =>
    set('discounts', ds.map((x, j) => j === i ? { ...x, discount_percent: v } : x));
  const addDiscs = (rows: any[], tipo: 'item' | 'sub') => {
    set('discounts', [...ds, ...rows.map((r) => ({
      [tipo === 'item' ? 'item' : 'subfamily']: r.id,
      code: r.code, target: r.name,
      family: r.family_name || '', subfamily_name: r.subfamily_name || (tipo === 'sub' ? r.name : ''),
      discount_percent: 0,
    }))]);
    setPicker(null);
  };
  const visiveis = ds.filter((x) => !q || `${x.code} ${x.target}`.toLowerCase().includes(q.toLowerCase()));
  const packArtigos = (articles as any[]).filter((a) => packs.includes(a.id));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo cartão' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Esquerda: a ficha */}
        <div className="w-[58%] flex flex-col overflow-auto border-r border-[#e0e0e0]">
          <div className="p-4 space-y-2">
            <Row label="Ativo:">
              <input type="checkbox" checked={!!d.is_active}
                onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            </Row>
            <Row label="Código:">
              <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                className={`${inp} w-[290px]`} style={inputStyle} />
            </Row>
            <Row label="Descrição:">
              <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Preço:">
              <input type="number" step="any" value={d.price ?? 0}
                onChange={(e) => set('price', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
            </Row>
            <Row label="Obs:">
              <input value={d.notes || ''} onChange={(e) => set('notes', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </Row>

            <div className="pt-1 space-y-1">
              {([['has_credit', 'Crédito', 'tem saldo e paga (pré-pago)'],
                 ['has_debit', 'Débito', 'acumula dívida para pagar no fim'],
                 ['has_points', 'Pontos', 'acumula pontos por consumo'],
                 ['has_discount', 'Desconto', 'desconta nos artigos da lista abaixo']] as const).map(([k, l, ajuda]) => (
                <label key={k} className="flex items-center gap-3 text-[12px]">
                  <span className="w-[100px] text-[#333]">{l}:</span>
                  <input type="checkbox" checked={!!d[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4" />
                  <span className="text-[11px] text-[#888]">{ajuda}</span>
                </label>
              ))}
            </div>

            <Row label="Packages:">
              <div className={`${inp} flex-1 flex items-center gap-2 min-h-[28px]`} style={inputStyle}>
                <span className="flex-1 truncate">
                  {packArtigos.length
                    ? packArtigos.map((a) => a.name).join(', ')
                    : <span className="text-[#999]">nenhum artigo incluído</span>}
                </span>
              </div>
              <button onClick={() => setPicker('pack')} title="Escolher os artigos incluídos"
                className="w-9 h-[28px] bg-[#3c3c3c] text-white flex items-center justify-center">👁</button>
            </Row>

            <Row label="Happy Hour:">
              <select value={d.happy_hour || ''} onChange={(e) => set('happy_hour', Number(e.target.value) || null)}
                className={`${inp} w-[240px]`} style={inputStyle}>
                <option value="">Nenhum</option>
                {(happys as any[]).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Row>

            {d.has_discount && ds.length === 0 && (
              <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1">
                "Desconto" ligado mas sem artigos na lista — o cartão não vai descontar nada.
              </div>
            )}
          </div>

          {/* Lista de descontos */}
          <div className="flex items-center gap-3 px-3 py-2 bg-[#f4f4f4] border-y border-[#d0d0d0] text-[12px]">
            <span>Pesquisar:</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} w-[200px]`} style={inputStyle} />
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
                {['Código', 'Descrição', 'Família', 'Sub Família', 'Desconto', ''].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {visiveis.map((x, i) => (
                  <tr key={i} className="border-b border-[#eee]">
                    <td className="px-2 py-1 font-mono">{x.code}</td>
                    <td className="px-2 py-1">{x.target}</td>
                    <td className="px-2 py-1">{x.family}</td>
                    <td className="px-2 py-1">{x.subfamily_name}</td>
                    <td className="p-0.5 w-[90px]">
                      <input type="number" value={x.discount_percent ?? 0}
                        onChange={(e) => setDisc(ds.indexOf(x), e.target.value)}
                        className={`${cell} text-right`} />
                    </td>
                    <td className="text-center w-[60px]">
                      {row?.id && x.item && (
                        <button onClick={() => simular.mutate(x.item)} title="Quanto fica este artigo com o cartão?"
                          className="text-[#1a4f8a] text-[11px] font-bold">Simular</button>
                      )}
                      <button onClick={() => set('discounts', ds.filter((_, j) => j !== ds.indexOf(x)))}
                        className="text-[#c0392b] text-[11px] font-bold ml-2">×</button>
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-[#999] py-8">Não foram encontrados dados.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d0d0d0]">
            <button onClick={() => setPicker('sub')} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
              <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Sub-Famílias
            </button>
            <button onClick={() => setPicker('item')} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
              <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Artigos
            </button>
          </div>
        </div>

        {/* Direita: agenda do happy hour + simulação */}
        <div className="flex-1 flex flex-col overflow-auto">
          <div className="px-3 py-1.5 bg-[#dbe7f3] text-[12px] font-bold text-[#1a4f8a] border-b border-[#c8c8c8]">
            Agenda (Happy Hour)
          </div>
          <div className="p-3">
            {d.happy_hour ? (
              <div className="text-[12px] text-[#333]">
                <b>{(happys as any[]).find((h) => h.id === Number(d.happy_hour))?.name}</b>
                <div className="text-[11px] text-[#666] mt-1">
                  As horas marcadas nesse Happy Hour valem para quem tem este cartão.
                  Edite a grelha em <b>Outros → Happy Hour</b>.
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-[#999]">Sem agenda. Escolha um Happy Hour à esquerda.</div>
            )}
          </div>

          {sim && (
            <div className="m-3 border border-[#c8c8c8]">
              <div className="px-3 py-1.5 bg-[#e8f5e9] text-[12px] font-bold text-[#1f7a34] border-b border-[#c8c8c8]">
                Com este cartão…
              </div>
              <div className="p-3 text-[12px] space-y-1">
                <div><b>{sim.item}</b></div>
                <div>
                  Preço normal: <b className="line-through text-[#999]">{Number(sim.base_price).toFixed(2)}</b>
                  {' → '}
                  <b className="text-[15px] text-[#1f7a34]">{Number(sim.final_price).toFixed(2)}</b>
                </div>
                <div className="text-[11px] text-[#666]">{sim.detail}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {picker === 'pack' && (
        <ItemPicker exclude={packs} title="Packages — artigos incluídos no cartão"
          onPick={(rows) => { set('package_ids', [...packs, ...rows.map((r) => r.id)]); setPicker(null); }}
          onClose={() => setPicker(null)} />
      )}
      {picker === 'item' && (
        <ItemPicker exclude={ds.filter((x) => x.item).map((x) => x.item)}
          onPick={(rows) => addDiscs(rows, 'item')} onClose={() => setPicker(null)} />
      )}
      {picker === 'sub' && (
        <SubFamilyPicker exclude={ds.filter((x) => x.subfamily).map((x) => x.subfamily)}
          onPick={(rows) => addDiscs(rows, 'sub')} onClose={() => setPicker(null)} />
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
