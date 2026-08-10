import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Tab, Box, Row, Check, Toolbar, inputCls, inputStyle, money, GridCheck, Glyph } from './kit';
import { TOKENS } from '../../config/theme';
import ComponentsPicker from './ComponentsPicker';
import ArticleLogs from './ArticleLogs';

type TabKey = 'geral' | 'outros' | 'notas' | 'teclados' | 'composicao' | 'barras' | 'descontos' | 'unidades' | 'armazens' | 'fornecedores' | 'dashboard';

const TABS: [TabKey, string][] = [
  ['geral', 'Geral'], ['outros', 'Outros'], ['notas', 'Notas/Alergénios'], ['teclados', 'Teclados'],
  ['composicao', 'Composição/Unidade'], ['barras', 'Código de Barras'], ['descontos', 'Descontos'],
  ['unidades', 'Unidades'], ['armazens', 'Armazéns'], ['fornecedores', 'Fornecedores'], ['dashboard', 'Dashboard'],
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Imagem por UPLOAD (não por URL escrita à mão — ver core/uploads.py: fica no disco
    do próprio servidor, nunca numa nuvem terceira). Mesmo padrão do logótipo em
    CompanyEditor.tsx. */
function ImagemUpload({ titulo, url, folder, onChange }: {
  titulo: string; url?: string | null; folder: string; onChange: (url: string) => void;
}) {
  return (
    <Box title={titulo}>
      <div className="flex items-center gap-2">
        <label className="flex-1 flex items-center gap-2 cursor-pointer min-w-0">
          <span className={`${inputCls} flex-1 truncate text-[#555] bg-[#f7f7f7]`} style={inputStyle}>
            {url ? url.split('/').pop() : 'Nenhum ficheiro — clique para carregar'}
          </span>
          <span className="px-3 py-1 text-[12px] font-semibold bg-[#3c3c3c] text-white hover:bg-[#4c4c4c] flex-shrink-0">
            Carregar…
          </span>
          <input type="file" accept="image/*" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.append('file', f);
              fd.append('folder', folder);
              try {
                const r = await apiClient.post('platform/upload/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                onChange(r.data.url);
              } catch (err) { notifyError(err); }
              e.target.value = '';
            }} />
        </label>
        {url && (
          <button onClick={() => onChange('')} title="Remover imagem"
            className="px-2 py-1 text-[#a01818] hover:bg-[#fdecea] flex-shrink-0 inline-flex"><Glyph icon="✕" size={13} /></button>
        )}
      </div>
      <div className="mt-2 h-24 flex items-center justify-center border border-[#ddd] bg-white">
        {url
          ? <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          : <span className="text-[11px] text-[#999]">Sem imagem</span>}
      </div>
    </Box>
  );
}

/** FICHA DO ARTIGO — 10 separadores, CRUD real. */
export default function ArticleEditor({ id, onClose, onSaved }: { id: number | 'new'; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const isNew = id === 'new';
  const [tab, setTab] = useState<TabKey>('geral');
  const [d, setD] = useState<any>({ is_active: true, item_type: 'Retail', tax_percentage: 14, is_sold: true, is_purchased: true });
  const [prices, setPrices] = useState<any[]>([]);
  const [newBc, setNewBc] = useState('');
  const [verLogs, setVerLogs] = useState(false);

  // --- Dados de apoio ---
  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'groups'], queryFn: async () => (await apiClient.get('inventory/pos/groups/')).data });
  const { data: families = [] } = useQuery({ queryKey: ['posc', 'families'], queryFn: async () => (await apiClient.get('inventory/pos/families/')).data });
  const { data: subfamilies = [] } = useQuery({ queryKey: ['posc', 'subs'], queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/')).data });
  const { data: printers = [] } = useQuery({ queryKey: ['posc', 'printers'], queryFn: async () => (await apiClient.get('inventory/pos/printers/')).data });
  const { data: uoms = [] } = useQuery({ queryKey: ['posc', 'uoms'], queryFn: async () => { const r = await apiClient.get('inventory/uoms/'); return r.data?.results || r.data || []; } });
  const { data: allergens = [] } = useQuery({ queryKey: ['posc', 'allergens'], queryFn: async () => { try { const r = await apiClient.get('pos/config/allergens/'); return r.data?.results || r.data || []; } catch { return []; } } });
  const { data: promos = [] } = useQuery({ queryKey: ['posc', 'promos'], queryFn: async () => { try { const r = await apiClient.get('commercial/promotions/'); return r.data?.results || r.data || []; } catch { return []; } } });
  const { data: taxes = [] } = useQuery({ queryKey: ['posc', 'taxes'], queryFn: async () => { try { const r = await apiClient.get('fiscal/tax-rates/'); return r.data?.results || r.data || []; } catch { return []; } } });
  const { data: keyboards = [] } = useQuery({ queryKey: ['posc', 'keyboards'], queryFn: async () => (await apiClient.get('pos/config/keyboards/')).data });
  // A conta analítica escolhe-se de uma LISTA (não é texto livre): é ela que reparte
  // a receita da venda pelo centro de custo certo na contabilidade.
  const { data: analytics = [] } = useQuery({ queryKey: ['posc', 'analytic'], queryFn: async () => (await apiClient.get('pos/config/analytic-accounts/')).data });

  // A caixa do separador "Teclados" põe/tira mesmo a tecla do terminal.
  const toggleKb = useMutation({
    mutationFn: ({ kb, on }: { kb: number; on: boolean }) =>
      apiClient.post(`pos/config/keyboards/${kb}/toggle_item/`, { item: id, on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posc', 'keyboards'] }),
    onError: notifyError,
  });

  // --- Ficha ---
  const { data: item } = useQuery({
    queryKey: ['posc', 'article', id],
    queryFn: async () => (await apiClient.get(`inventory/pos/articles/${id}/`)).data,
    enabled: !isNew,
  });
  useEffect(() => {
    if (item) {
      setD(item);
      setPrices(item.prices?.length ? item.prices : [{ level: 1, price: item.sale_price || 0 }]);
    }
  }, [item]);

  // --- Composição/Unidade (ficha técnica) — carregada sempre (não só ao abrir o
  // separador), senão "Gravar" sem nunca ter aberto esta aba apagava a receita
  // que já lá estava.
  const [receita, setReceita] = useState<any>({ pax: 1, doses: 1, instructions: '', ingredients: [] });
  const [selRecIds, setSelRecIds] = useState<number[]>([]);
  const [multiplicador, setMultiplicador] = useState('1');
  const [pickerAberto, setPickerAberto] = useState(false);
  const { data: recipeData } = useQuery({
    queryKey: ['posc', 'recipe', id],
    queryFn: async () => (await apiClient.get(`inventory/pos/articles/${id}/recipe/`)).data,
    enabled: !isNew,
  });
  useEffect(() => { if (recipeData) setReceita(recipeData); }, [recipeData]);

  // --- Separadores que leem doutros módulos ---
  const { data: whs = [] } = useQuery({
    queryKey: ['posc', 'wh', id], enabled: !isNew && tab === 'armazens',
    queryFn: async () => (await apiClient.get(`inventory/pos/articles/${id}/warehouses/`)).data,
  });
  const { data: sups = [] } = useQuery({
    queryKey: ['posc', 'sup', id], enabled: !isNew && tab === 'fornecedores',
    queryFn: async () => (await apiClient.get(`inventory/pos/articles/${id}/suppliers/`)).data,
  });
  const { data: dash } = useQuery({
    queryKey: ['posc', 'dash', id], enabled: !isNew && tab === 'dashboard',
    queryFn: async () => (await apiClient.get(`inventory/pos/articles/${id}/dashboard/`)).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...d };
      delete body.prices; delete body.barcodes; delete body.allergen_ids; delete body.family; delete body.group;
      const r = isNew
        ? await apiClient.post('inventory/pos/articles/', body)
        : await apiClient.patch(`inventory/pos/articles/${id}/`, body);
      const aid = r.data.id;
      await apiClient.post(`inventory/pos/articles/${aid}/set_prices/`, { prices });
      if (d.allergen_ids) await apiClient.post(`inventory/pos/articles/${aid}/set_allergens/`, { allergen_ids: d.allergen_ids });
      // Composição/Unidade — só grava se a ficha JÁ TEM (ou passou a ter) alguma
      // coisa: um artigo sem receita nenhuma não precisa de um PUT vazio a cada
      // "Gravar" (e um `isNew` não tem ainda `id` para as linhas apontarem).
      if (!isNew && (receita.ingredients?.length || recipeData?.ingredients?.length)) {
        await apiClient.put(`inventory/pos/articles/${aid}/recipe/`, receita);
      }
      return r.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Artigo gravado', message: 'A ficha foi gravada. As alterações entram já no POS.' }); onSaved(); },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const toggleList = (k: string, v: number) => {
    const cur: number[] = d[k] || [];
    set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const addBarcode = async () => {
    if (!newBc.trim() || isNew) return;
    try { await apiClient.post(`inventory/pos/articles/${id}/add_barcode/`, { barcode: newBc.trim(), uom: d.sale_uom }); setNewBc(''); qc.invalidateQueries({ queryKey: ['posc', 'article', id] }); }
    catch (e) { notifyError(e); }
  };
  const delBarcode = async (bid: number) => {
    await apiClient.post(`inventory/pos/articles/${id}/remove_barcode/`, { id: bid });
    qc.invalidateQueries({ queryKey: ['posc', 'article', id] });
  };

  const famOfGroup = families.filter((x: any) => !d.group || x.group === Number(d.group));
  const subOfFam = subfamilies.filter((x: any) => !d.family || x.family === Number(d.family));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'A criar novo artigo' : `A editar ${d.name || ''}`}</span>
        <span className="text-[11px] italic text-[#666]">
          {d.updated_by && `Última alteração: ${d.updated_by}`}{d.created_by && ` | Criado por: ${d.created_by}`}
        </span>
      </div>

      {/* Identificação (fixa em todos os separadores) */}
      <div className="px-3 pt-2 pb-1 border-b border-[#d0d0d0] bg-white">
      <Box title="Identificação">
      <div className="grid grid-cols-3 gap-x-6 gap-y-1 pt-1.5">
        <Row label="Código:">
          <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={inputCls} style={inputStyle} />
          <Check checked={d.is_active} onChange={(v) => set('is_active', v)} label="Ativo" />
        </Row>
        <Row label="Sub Família:">
          <select value={d.subfamily || ''} onChange={(e) => set('subfamily', Number(e.target.value) || null)} className={inputCls} style={inputStyle}>
            <option value="">—</option>
            {subOfFam.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Row>
        <Row label="Definição de relatório:" w="w-[130px]">
          <input value={d.report_definition || ''} onChange={(e) => set('report_definition', e.target.value)} placeholder="(nenhum)" className={inputCls} style={inputStyle} />
        </Row>
        <Row label="Descrição:">
          <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={inputCls} style={inputStyle} />
        </Row>
        <Row label="Família:">
          <select value={d.family || ''} onChange={(e) => { set('family', Number(e.target.value) || null); set('subfamily', null); }} className={inputCls} style={inputStyle}>
            <option value="">—</option>
            {famOfGroup.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Row>
        <Row label="Grupo:" w="w-[130px]">
          <select value={d.group || ''} onChange={(e) => { set('group', Number(e.target.value) || null); set('family', null); set('subfamily', null); }} className={inputCls} style={inputStyle}>
            <option value="">—</option>
            {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Row>
      </div>
      </Box>
      </div>

      {/* Separadores */}
      <div className="flex border-b-2 border-[#2b2b2b] bg-[#f7f7f7] px-2">
        {TABS.map(([k, label]) => <Tab key={k} active={tab === k} onClick={() => setTab(k)}>{label}</Tab>)}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto p-3">
        {tab === 'geral' && (
          <div className="grid grid-cols-3 gap-4 items-start">
            <div className="space-y-3 min-w-0">
              <Box title="Geral">
                {/* Cada linha: IVA à esquerda, isenção à direita — em grelha, para nunca se sobreporem. */}
                {[
                  ['Iva 1:', 'tax_percentage', 'exemption_code_1'],
                  ['Iva 2:', 'tax_2_percentage', 'exemption_code_2'],
                  ['Iva - Compra:', 'purchase_tax_percentage', 'purchase_exemption_code'],
                ].map(([label, taxKey, exKey]) => (
                  <div key={taxKey} className="grid grid-cols-[92px_1fr_66px_1fr] items-center gap-2 py-[3px] text-[12px]">
                    <span className="text-[#333]">{label}</span>
                    <select value={d[taxKey] ?? ''} onChange={(e) => set(taxKey, e.target.value)}
                      className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white w-full" style={inputStyle}>
                      <option value="">(nenhum)</option>
                      {taxes.map((t: any) => (
                        <option key={t.id} value={t.rate}>{t.name || t.code} — {Number(t.rate).toFixed(2)}%</option>
                      ))}
                    </select>
                    <span className="text-[#333]">Isenção:</span>
                    <input value={d[exKey] || ''} onChange={(e) => set(exKey, e.target.value)} placeholder="(nenhum)"
                      className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white w-full" style={inputStyle} />
                  </div>
                ))}
                <Check checked={d.allow_tax_change_on_purchase} onChange={(v) => set('allow_tax_change_on_purchase', v)} label="Permitir alterar IVA nas compras" />
              </Box>

              <Box title="Preço">
                <table className="w-full text-[12px]">
                  <thead><tr className="bg-[#eee]"><th className="text-left px-2 py-1 border border-[#ddd]">Preço</th><th className="text-right px-2 py-1 border border-[#ddd] w-[120px]">Valor</th></tr></thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6].map((lvl) => {
                      const p = prices.find((x) => x.level === lvl);
                      return (
                        <tr key={lvl}>
                          <td className="px-2 py-0.5 border border-[#eee] italic text-[#555]">
                            {lvl}{lvl === 1 ? ' (preço base do POS)' : ''}
                          </td>
                          <td className="border border-[#eee]">
                            <input type="number" value={p?.price ?? 0}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPrices((ps) => {
                                  const o = ps.filter((x) => x.level !== lvl);
                                  return [...o, { level: lvl, price: v }].sort((a, b) => a.level - b.level);
                                });
                              }}
                              className="w-full px-2 py-0.5 text-right outline-none" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="text-[10px] text-[#888] mt-1">Cada terminal usa um nível — o mesmo artigo pode custar mais no bar da piscina.</div>
              </Box>
            </div>

            <div className="space-y-3 min-w-0">
              <Box title="Tipo">
                <Row label="Módulo:" w="w-[60px]">
                  <select value={d.item_type || ''} onChange={(e) => set('item_type', e.target.value)} className={inputCls} style={inputStyle}>
                    <option value="Retail">Revenda</option>
                    <option value="RawMaterial">Matéria-Prima</option>
                    <option value="Manufactured">Produzido (Ficha Técnica)</option>
                    <option value="Service">Serviço</option>
                  </select>
                </Row>
                <Check checked={d.is_sold} onChange={(v) => set('is_sold', v)} label="Venda" />
                <Check checked={d.is_purchased} onChange={(v) => set('is_purchased', v)} label="Compra" />
                <Check checked={d.has_recipe} onChange={(v) => set('has_recipe', v)} label="Ficha Técnica" />
                <Check checked={d.is_value_discount} onChange={(v) => set('is_value_discount', v)} label="Desconto em Valor" />
                <Check checked={d.is_menu} onChange={(v) => set('is_menu', v)} label="Menu" />
              </Box>

              <Box title="Tipos de comentários">
                {[1, 2, 3].map((n) => (
                  <Row key={n} label={`${n}:`} w="w-[20px]">
                    <input value={d[`comment_type_${n}`] || ''} onChange={(e) => set(`comment_type_${n}`, e.target.value)}
                      placeholder={n === 1 ? 'TEMP' : n === 2 ? 'GELO' : 'LIMÃO'} className={inputCls} style={inputStyle} />
                  </Row>
                ))}
                <div className="text-[10px] text-[#888]">Sugestões que o POS oferece ao operador ao pedir este artigo.</div>
              </Box>
            </div>

            <Box title="Impressoras" className="min-w-0">
              <div className="text-[11px] text-[#666] mb-1">Onde sai a comanda deste artigo.</div>
              {printers.map((p: any) => (
                <Check key={p.id} checked={(d.printer_ids || []).includes(p.id)}
                  onChange={() => toggleList('printer_ids', p.id)}
                  label={`${p.name} (${p.code})`} />
              ))}
              {printers.length === 0 && <div className="text-[11px] text-[#999]">Sem impressoras configuradas.</div>}
            </Box>
          </div>
        )}

        {tab === 'outros' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-3">
              <Row label="Referência PMS:" w="w-[110px]">
                <input value={d.pms_reference || ''} onChange={(e) => set('pms_reference', e.target.value)} placeholder="Encargo por defeito" className={inputCls} style={inputStyle} />
              </Row>
              <Row label="Código PLU:" w="w-[110px]">
                <input value={d.plu_code || ''} onChange={(e) => set('plu_code', e.target.value)} className={inputCls} style={inputStyle} />
              </Row>
              <Box title="Opções">
                <div className="grid grid-cols-2 gap-x-4">
                  <div>
                    <Check checked={d.scale_interface} onChange={(v) => set('scale_interface', v)} label="Interface Balança" />
                    <Check checked={d.free_text} onChange={(v) => set('free_text', v)} label="Texto Livre" />
                    <Check checked={d.always_ask_quantity} onChange={(v) => set('always_ask_quantity', v)} label="Pede sempre quantidade" />
                    <Check checked={d.manual_price} onChange={(v) => set('manual_price', v)} label="Preço Manual" />
                    <Check checked={d.no_discount} onChange={(v) => set('no_discount', v)} label="Não permitir desconto" />
                  </div>
                  <div className="space-y-1">
                    <Row label="Tempo de preparação (min):" w="w-[150px]">
                      <input type="number" value={d.prep_time_minutes ?? 0} onChange={(e) => set('prep_time_minutes', Number(e.target.value))} className={inputCls} style={inputStyle} />
                    </Row>
                    <Row label="Estação de produção (KDS):" w="w-[150px]">
                      <select value={d.kds_station || 'KITCHEN'} onChange={(e) => set('kds_station', e.target.value)} className={inputCls} style={inputStyle}
                        title="Para onde o pedido vai quando se lança este artigo. Um outlet pode ter uma ficha própria (Configuração POS › Setores) que substitui isto só ali.">
                        <option value="KITCHEN">Cozinha</option>
                        <option value="BAR">Bar</option>
                        <option value="PASTRY">Pastelaria</option>
                        <option value="NONE">Sem produção (não vai a lado nenhum)</option>
                      </select>
                    </Row>
                    <Row label="Conta de Contabilidade:" w="w-[150px]">
                      <input value={d.accounting_account || ''} onChange={(e) => set('accounting_account', e.target.value)} className={inputCls} style={inputStyle} />
                    </Row>
                    <Row label="Conta analítica - Compra:" w="w-[150px]">
                      <select value={d.analytic_account_purchase || ''} onChange={(e) => set('analytic_account_purchase', e.target.value)} className={inputCls} style={inputStyle}>
                        <option value="">—</option>
                        {(analytics as any[]).map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
                      </select>
                    </Row>
                    <Row label="Conta analítica - Venda:" w="w-[150px]">
                      <select value={d.analytic_account_sale || ''} onChange={(e) => set('analytic_account_sale', e.target.value)} className={inputCls} style={inputStyle}>
                        <option value="">—</option>
                        {(analytics as any[]).map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
                      </select>
                    </Row>
                  </div>
                </div>
              </Box>
            </div>
            <Box title="Línguas">
              <div className="text-[11px] text-[#666] mb-1">O nome do artigo no menu para hóspedes estrangeiros.</div>
              {[1, 2, 3].map((n) => (
                <Row key={n} label={`Língua ${n}:`} w="w-[80px]">
                  <input value={d[`name_lang_${n}`] || ''} onChange={(e) => set(`name_lang_${n}`, e.target.value)} className={inputCls} style={inputStyle} />
                </Row>
              ))}
            </Box>
          </div>
        )}

        {tab === 'notas' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ImagemUpload titulo="Imagem - Tecla" url={d.key_image_url} folder="articles"
                  onChange={(url) => set('key_image_url', url)} />
                <ImagemUpload titulo="Imagem - Composição" url={d.composition_image_url} folder="articles"
                  onChange={(url) => set('composition_image_url', url)} />
              </div>
              <Box title="Notas">
                <textarea value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={4} className="w-full border border-[#8a95a3] p-2 text-[12px]" style={inputStyle} />
              </Box>
              <Box title="Notas - Ficha técnica">
                <textarea value={d.recipe_notes || ''} onChange={(e) => set('recipe_notes', e.target.value)} rows={3} className="w-full border border-[#8a95a3] p-2 text-[12px]" style={inputStyle} />
              </Box>
            </div>
            <Box title="Alergénios">
              <div className="text-[11px] text-[#a01818] font-bold mb-1">Esta informação chega à cozinha, ao bar e à pastelaria com o pedido.</div>
              <div className="max-h-[420px] overflow-auto">
                {allergens.map((a: any) => (
                  <Check key={a.id} checked={(d.allergen_ids || []).includes(a.id)}
                    onChange={() => toggleList('allergen_ids', a.id)} label={a.name} />
                ))}
                {allergens.length === 0 && <div className="text-[11px] text-[#999]">Sem alergénios registados.</div>}
              </div>
            </Box>
          </div>
        )}

        {tab === 'teclados' && (
          <Box title="Teclados onde este artigo aparece">
            <table className="w-full text-[12px]">
              <thead><tr className="bg-[#eee]"><th className="text-left px-2 py-1 border border-[#ddd] w-[40px]"></th><th className="text-left px-2 py-1 border border-[#ddd]">Nome</th><th className="text-left px-2 py-1 border border-[#ddd]">Localização</th></tr></thead>
              <tbody>
                {keyboards.map((kb: any) => {
                  const on = (kb.keys || []).some((k: any) => k.item === id);
                  return (
                    <tr key={kb.id}>
                      <td className="px-2 py-1 border border-[#eee] text-center">
                        <GridCheck checked={on} onChange={(v) => toggleKb.mutate({ kb: kb.id, on: v })}
                          title="Ligar põe o artigo neste teclado do terminal; desligar tira-o" />
                      </td>
                      <td className="px-2 py-1 border border-[#eee] font-bold">{kb.name}</td>
                      <td className="px-2 py-1 border border-[#eee] italic text-[#555]">
                        {on
                          ? <>{d.group ? groups.find((g: any) => g.id === Number(d.group))?.name : '—'} ⇒{' '}
                              {d.family ? families.find((x: any) => x.id === Number(d.family))?.name : '—'} ⇒{' '}
                              {d.subfamily ? subfamilies.find((s: any) => s.id === Number(d.subfamily))?.name : '—'} ⇒ <b>{d.name}</b></>
                          : '— não está neste teclado'}
                      </td>
                    </tr>
                  );
                })}
                {keyboards.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-[#999] py-6">Ainda não há teclados. Crie-os em Parâmetros do Sistema → Teclados.</td></tr>
                )}
              </tbody>
            </table>
            <div className="text-[11px] text-[#666] mt-2">
              A caixa põe/tira mesmo a tecla do terminal. Para a desenhar (cor, ordem, tamanho)
              use <b>Parâmetros do Sistema → Teclados</b>.
            </div>
          </Box>
        )}

        {tab === 'composicao' && (
          isNew ? (
            <div className="text-[12px] text-[#a01818] p-4">Grave o artigo antes de montar a ficha técnica.</div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-4 mb-2">
                <Row label="Pax:" w="w-[40px]">
                  <input type="number" min={1} value={receita.pax}
                    onChange={(e) => setReceita((r: any) => ({ ...r, pax: Math.max(1, Number(e.target.value) || 1) }))}
                    className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[70px]" style={inputStyle} />
                </Row>
                <Row label="Doses:" w="w-[50px]">
                  <input type="number" min={1} value={receita.doses}
                    onChange={(e) => setReceita((r: any) => ({ ...r, doses: Math.max(1, Number(e.target.value) || 1) }))}
                    className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[70px]" style={inputStyle} />
                </Row>
                <button onClick={() => setVerLogs(true)}
                  className="flex items-center gap-1 text-[12px] text-[#1f7a34] font-semibold hover:underline">
                  <span className="w-4 h-4 rounded-full bg-[#1f7a34] text-white flex items-center justify-center text-[10px]">↻</span>
                  Histórico
                </button>
              </div>

              <div className="flex-1 overflow-auto" style={{ border: '4px groove #c0c0c0' }}>
                <table className="text-[12px] border-collapse w-full">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: 'linear-gradient(to bottom, #fbfbfc 0%, #eef0f2 55%, #e2e5e9 100%)' }}>
                      <th className="w-[28px] border-b-2" style={{ borderBottomColor: TOKENS.border }}></th>
                      {['Código', 'Descrição', 'Unidade', 'Quantidade', 'Desperdício%', 'Quantidade-',
                        'Custo', 'Custo Total', '%', 'Armazém', 'Tipo', 'Fornecedor', 'Stock Qtd.',
                        'Dose Qtd', 'Custo Dose'].map((h) => (
                        <th key={h} className="text-left px-2 py-1.5 border-b-2 border-l whitespace-nowrap font-semibold"
                          style={{ borderBottomColor: TOKENS.border, borderLeftColor: '#dde1e6', color: TOKENS.selectedText }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(receita.ingredients || []).map((ing: any, i: number) => {
                      const totalCusto = (receita.ingredients || []).reduce(
                        (s: number, x: any) => s + Number(x.line_cost || 0), 0);
                      const pct = totalCusto > 0 ? (Number(ing.line_cost || 0) / totalCusto * 100) : 0;
                      const key = ing._key ?? ing.id;
                      const sel = selRecIds.includes(key);
                      return (
                        <tr key={key} className="border-b" style={{ borderColor: '#eef0f2', background: sel ? TOKENS.warningBg : i % 2 ? '#f7f8fa' : TOKENS.surface }}>
                          <td className="text-center">
                            <input type="checkbox" checked={sel}
                              onChange={() => setSelRecIds((s) => s.includes(key) ? s.filter((x) => x !== key) : [...s, key])} />
                          </td>
                          <td className="px-2 py-1">{ing.item_code}</td>
                          <td className="px-2 py-1">{ing.item_name}</td>
                          <td className="px-2 py-1">{ing.uom_code}</td>
                          <td className="px-1 py-1">
                            <input type="number" step="0.0001" value={ing.quantity}
                              onChange={(e) => setReceita((r: any) => ({ ...r, ingredients: r.ingredients.map((x: any) =>
                                x === ing ? { ...x, quantity: e.target.value } : x) }))}
                              className="w-[80px] border border-[#8a95a3] px-1 py-0.5" style={inputStyle} />
                          </td>
                          <td className="px-1 py-1">
                            <input type="number" step="0.01" value={ing.waste_percentage}
                              onChange={(e) => setReceita((r: any) => ({ ...r, ingredients: r.ingredients.map((x: any) =>
                                x === ing ? { ...x, waste_percentage: e.target.value } : x) }))}
                              className="w-[64px] border border-[#8a95a3] px-1 py-0.5" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1 text-right">
                            {(Number(ing.quantity || 0) * (1 + Number(ing.waste_percentage || 0) / 100)).toFixed(4)}
                          </td>
                          <td className="px-2 py-1 text-right">{money(Number(ing.unit_cost || 0).toFixed(2))}</td>
                          <td className="px-2 py-1 text-right">{money(ing.line_cost)}</td>
                          <td className="px-2 py-1 text-right">{pct.toFixed(1)}%</td>
                          <td className="px-2 py-1">{ing.warehouse_name || '—'}</td>
                          <td className="px-2 py-1">{ing.item_type}</td>
                          <td className="px-2 py-1">{ing.supplier || '—'}</td>
                          <td className="px-2 py-1 text-right">{ing.stock_qty}</td>
                          <td className="px-2 py-1 text-right">{ing.dose_qty}</td>
                          <td className="px-2 py-1 text-right">{money(ing.dose_cost)}</td>
                        </tr>
                      );
                    })}
                    {(receita.ingredients || []).length === 0 && (
                      <tr><td colSpan={15} className="text-center text-[#999] py-8">
                        Sem componentes. Toque em <b>Adicionar</b> para montar a ficha técnica.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 py-2 border-t border-[#c0c0c0] mt-1">
                <button onClick={() => setPickerAberto(true)} title="Adicionar componente à ficha técnica"
                  className="flex items-center gap-1 text-[12px] font-semibold text-[#2b6bff] hover:underline">
                  <span className="w-5 h-5 rounded-full bg-[#2b6bff] text-white flex items-center justify-center text-[13px]">+</span>
                  Adicionar
                </button>
                <button onClick={() => {
                  if (!selRecIds.length) return;
                  setReceita((r: any) => ({ ...r, ingredients: r.ingredients.filter((x: any) => !selRecIds.includes(x._key ?? x.id)) }));
                  setSelRecIds([]);
                }} disabled={!selRecIds.length}
                  className="flex items-center gap-1 text-[12px] font-semibold text-[#c0392b] hover:underline disabled:opacity-30 disabled:no-underline">
                  <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[13px]">−</span>
                  Apagar
                </button>
                <span className="text-[12px] text-[#555] ml-2">Multiplicar:</span>
                <input value={multiplicador} onChange={(e) => setMultiplicador(e.target.value)}
                  className="w-[60px] border border-[#8a95a3] px-2 py-1 text-[12px]" style={inputStyle} />
                <button onClick={() => {
                  const f = Number(multiplicador) || 1;
                  if (!selRecIds.length) return;
                  setReceita((r: any) => ({ ...r, ingredients: r.ingredients.map((x: any) =>
                    selRecIds.includes(x._key ?? x.id) ? { ...x, quantity: (Number(x.quantity) * f).toFixed(4) } : x) }));
                }} disabled={!selRecIds.length}
                  className="flex items-center gap-1 text-[12px] font-semibold text-[#1f7a34] hover:underline disabled:opacity-30 disabled:no-underline">
                  <span className="w-4 h-4 rounded-full bg-[#1f7a34] text-white flex items-center justify-center"><Glyph icon="✔" size={9} /></span>
                  Aplicar
                </button>
                <button onClick={() => {
                  const w = window.open('', '_blank', 'width=700,height=900');
                  if (!w) return;
                  const linhas = (receita.ingredients || []).map((i: any) =>
                    `<tr><td>${i.item_code}</td><td>${i.item_name}</td><td>${i.uom_code}</td>` +
                    `<td style="text-align:right">${i.quantity}</td><td style="text-align:right">${money(i.line_cost)}</td></tr>`).join('');
                  w.document.write(`<html><head><title>Ficha Técnica — ${d.name}</title>
                    <style>body{font-family:sans-serif;font-size:13px} table{width:100%;border-collapse:collapse}
                    th,td{border:1px solid #999;padding:4px 6px;text-align:left}</style></head><body>
                    <h2>${d.name}</h2><div>Pax: ${receita.pax} · Doses: ${receita.doses}</div>
                    <table><thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Qtd</th><th>Custo Total</th></tr></thead>
                    <tbody>${linhas}</tbody></table></body></html>`);
                  w.document.close();
                  w.print();
                }} className="flex items-center gap-1 text-[12px] font-semibold text-[#555] hover:underline">
                  <span className="w-4 h-4 rounded-full bg-[#555] text-white flex items-center justify-center"><Glyph icon="🖶" size={9} /></span>
                  Imprimir
                </button>
                <div className="ml-auto text-[12px] text-[#333] text-right leading-tight">
                  <div>Total Custo: <b>{money((receita.ingredients || []).reduce((s: number, x: any) => s + Number(x.line_cost || 0), 0))}</b></div>
                  <div>Dose: <b>{money((receita.ingredients || []).reduce((s: number, x: any) => s + Number(x.line_cost || 0), 0) / (receita.doses || 1))}</b></div>
                </div>
              </div>

              {pickerAberto && (
                <ComponentsPicker
                  onClose={() => setPickerAberto(false)}
                  onPick={async (picked) => {
                    setPickerAberto(false);
                    try {
                      const full = (await apiClient.get(`inventory/pos/articles/${picked.id}/`)).data;
                      const baseUom = full.sale_uom || full.stock_uom || full.purchase_uom;
                      const uomObj = uoms.find((u: any) => u.id === baseUom);
                      const novaLinha = {
                        _key: `novo-${Date.now()}-${picked.id}`,
                        ingredient_item: full.id, item_code: full.code, item_name: full.name,
                        item_type: full.item_type, uom: baseUom, uom_code: uomObj?.code || '',
                        quantity: '1.0000', waste_percentage: '0.00', warehouse: null, warehouse_name: null,
                        unit_cost: full.current_average_cost || '0.00', stock_qty: '0', supplier: '',
                      };
                      // effective_quantity/line_cost/dose_qty/dose_cost recalculam-se ao gravar
                      // (o servidor é quem manda no custo); aqui mostra-se já uma pré-visualização.
                      const custo = Number(novaLinha.unit_cost);
                      (novaLinha as any).line_cost = custo.toFixed(2);
                      (novaLinha as any).dose_qty = (1 / (receita.doses || 1)).toFixed(4);
                      (novaLinha as any).dose_cost = (custo / (receita.doses || 1)).toFixed(2);
                      setReceita((r: any) => ({ ...r, ingredients: [...(r.ingredients || []), novaLinha] }));
                    } catch (e) { notifyError(e); }
                  }} />
              )}
            </div>
          )
        )}

        {tab === 'barras' && (
          <div>
            <Row label="Valor de Medição Base:" w="w-[150px]">
              <input type="number" value={d.base_measure_value ?? 0} onChange={(e) => set('base_measure_value', e.target.value)} className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[140px]" style={inputStyle} />
              <span className="text-[12px] text-[#555] ml-2">
                1 {d.sale_uom ? uoms.find((u: any) => u.id === d.sale_uom)?.code : 'UNI'} = (1: {money(prices.find((p) => p.level === 1)?.price)})
              </span>
            </Row>
            <Box title="Código de Barras" className="mt-2">
              <div className="flex gap-2 mb-2">
                <input value={newBc} onChange={(e) => setNewBc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBarcode()}
                  placeholder="Ler ou escrever o código de barras…" className="border border-[#8a95a3] px-2 py-1 text-[12px] flex-1" style={inputStyle} />
                <button onClick={addBarcode} disabled={isNew}
                  className="px-3 py-1 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: '#2b2b2b' }}>Adicionar</button>
              </div>
              {isNew && <div className="text-[11px] text-[#a01818]">Grave o artigo antes de acrescentar códigos de barras.</div>}
              <table className="w-full text-[12px]">
                <thead><tr className="bg-[#eee]"><th className="text-left px-2 py-1 border border-[#ddd]">Código</th><th className="text-left px-2 py-1 border border-[#ddd]">Unidade</th><th className="text-left px-2 py-1 border border-[#ddd]">Qt.</th><th className="border border-[#ddd] w-[70px]"></th></tr></thead>
                <tbody>
                  {(d.barcodes || []).map((b: any) => (
                    <tr key={b.id}>
                      <td className="px-2 py-1 border border-[#eee] font-mono">{b.barcode}</td>
                      <td className="px-2 py-1 border border-[#eee]">{b.uom_code || '—'}</td>
                      <td className="px-2 py-1 border border-[#eee]">{b.quantity}</td>
                      <td className="px-2 py-1 border border-[#eee] text-center">
                        <button onClick={() => delBarcode(b.id)} className="text-red-600 font-bold text-[11px]">Remover</button>
                      </td>
                    </tr>
                  ))}
                  {!(d.barcodes || []).length && <tr><td colSpan={4} className="text-center text-[#999] py-6">Sem códigos de barras.</td></tr>}
                </tbody>
              </table>
            </Box>
          </div>
        )}

        {tab === 'descontos' && (
          <Box title="Descontos aplicáveis a este artigo">
            <div className="max-h-[440px] overflow-auto">
              {promos.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 border-b border-[#eee] text-[12px] cursor-pointer hover:bg-[#f7f7f7]">
                  <input type="checkbox" checked={(d.discount_ids || []).includes(p.id)} onChange={() => toggleList('discount_ids', p.id)} className="w-4 h-4" />
                  <div className="flex-1">
                    <div className="italic text-[11px] text-[#888]">{p.discount_type === 'PERCENT' ? 'Desconto Percentagem' : 'Desconto Valor'}</div>
                    <div className="font-semibold">{p.code || ''}{p.code ? ' - ' : ''}{p.name}</div>
                  </div>
                  <span className="text-[11px] italic text-[#888]">{p.value}{p.discount_type === 'PERCENT' ? '%' : ''}</span>
                </label>
              ))}
              {promos.length === 0 && <div className="text-[12px] text-[#999] py-6 text-center">Sem descontos configurados (crie-os em Marketing → Promoções).</div>}
            </div>
          </Box>
        )}

        {tab === 'unidades' && (
          <Box title="Unidades" className="max-w-[520px]">
            {[['purchase_uom', 'Unidade Compra:'], ['stock_uom', 'Unidade de Stock:'], ['sale_uom', 'Unidade Venda:']].map(([k, label]) => (
              <Row key={k} label={label as string} w="w-[130px]">
                <select value={d[k as string] || ''} onChange={(e) => set(k as string, Number(e.target.value) || null)} className={inputCls} style={inputStyle}>
                  <option value="">—</option>
                  {uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code} ({u.name})</option>)}
                </select>
              </Row>
            ))}
            <div className="pt-2">
              <Check checked={d.no_stock_movement} onChange={(v) => set('no_stock_movement', v)} label="Não movimenta stock" />
            </div>
            <div className="text-[11px] text-[#666] pt-2">
              Compra-se à <b>caixa</b>, guarda-se em <b>unidades</b>, vende-se à <b>unidade</b> — o sistema converte sozinho.
            </div>
          </Box>
        )}

        {tab === 'armazens' && (
          <div style={{ border: '4px groove #c0c0c0' }}>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr style={{ background: 'linear-gradient(to bottom, #fbfbfc 0%, #eef0f2 55%, #e2e5e9 100%)' }}>
                {['Armazém', 'Stock Qtd.', 'Pendente', 'Total Custo', 'Mínimo', 'Máximo'].map((h, i) => (
                  <th key={h} className={`text-left px-3 py-1.5 border-b-2 font-semibold ${i > 0 ? 'border-l' : ''}`}
                    style={{ borderBottomColor: TOKENS.border, borderLeftColor: '#dde1e6', color: TOKENS.selectedText }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {whs.map((w: any, i: number) => (
                <tr key={w.warehouse} className="border-b" style={{ borderColor: '#eef0f2', background: i % 2 ? '#f7f8fa' : TOKENS.surface }}>
                  <td className="px-3 py-1">{w.warehouse_name}</td>
                  <td className={`px-3 py-1 text-right ${w.negative ? 'text-red-600 font-bold' : ''}`}>{Number(w.quantity).toFixed(3)}</td>
                  <td className="px-3 py-1 text-right">{Number(w.pending).toFixed(3)}</td>
                  <td className="px-3 py-1 text-right">{money(w.total_cost)}</td>
                  <td className="px-3 py-1 text-right">{Number(w.min_stock).toFixed(3)}</td>
                  <td className="px-3 py-1 text-right">{Number(w.max_stock).toFixed(3)}</td>
                </tr>
              ))}
              {whs.length === 0 && <tr><td colSpan={6} className="text-center text-[#999] py-8">Sem armazéns.</td></tr>}
            </tbody>
          </table>
          </div>
        )}

        {tab === 'fornecedores' && (
          <div style={{ border: '4px groove #c0c0c0' }}>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr style={{ background: 'linear-gradient(to bottom, #fbfbfc 0%, #eef0f2 55%, #e2e5e9 100%)' }}>
                {['Data', 'Fornecedor', 'Documento', 'Quantidade', 'Preço Líquido', 'Unidade', 'Desconto'].map((h, i) => (
                  <th key={h} className={`text-left px-3 py-1.5 border-b-2 font-semibold ${i > 0 ? 'border-l' : ''}`}
                    style={{ borderBottomColor: TOKENS.border, borderLeftColor: '#dde1e6', color: TOKENS.selectedText }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sups.map((s: any, i: number) => (
                <tr key={i} className="border-b" style={{ borderColor: '#eef0f2', background: i % 2 ? '#f7f8fa' : TOKENS.surface }}>
                  <td className="px-3 py-1">{s.date || '—'}</td>
                  <td className="px-3 py-1">{s.supplier}</td>
                  <td className="px-3 py-1">{s.document}</td>
                  <td className="px-3 py-1 text-right">{s.quantity}</td>
                  <td className="px-3 py-1 text-right">{money(s.price_net)}</td>
                  <td className="px-3 py-1">{s.uom}</td>
                  <td className="px-3 py-1 text-right">{s.discount}</td>
                </tr>
              ))}
              {sups.length === 0 && <tr><td colSpan={7} className="text-center text-[#999] py-8">Este artigo ainda não foi comprado a nenhum fornecedor.</td></tr>}
            </tbody>
          </table>
          </div>
        )}

        {tab === 'dashboard' && dash && (
          <div>
            <div className="flex justify-end gap-6 text-[12px] mb-2">
              <div><b>Última compra:</b> {dash.last_purchase?.at || '—'}</div>
              <div><b>Última venda:</b> {dash.last_sale?.at ? new Date(dash.last_sale.at).toLocaleString('pt-PT') : '—'} <span className="text-[#888]">{dash.last_sale?.ref || ''}</span></div>
            </div>
            <Box title={`Vendas e compras — ${dash.year}`}>
              <div className="flex items-end gap-2 h-[240px] pt-4">
                {MESES.map((m, i) => {
                  const maxV = Math.max(1, ...dash.sales_qty, ...dash.purchases_qty);
                  const hs = (dash.sales_qty[i] / maxV) * 200;
                  const hp = (dash.purchases_qty[i] / maxV) * 200;
                  return (
                    <div key={m} className="flex-1 flex flex-col items-center gap-1">
                      <div className="flex items-end gap-0.5 h-[200px]">
                        <div className="w-3" style={{ height: hs, background: '#8bc34a' }} title={`Vendas: ${dash.sales_qty[i]}`} />
                        <div className="w-3" style={{ height: hp, background: '#2b6bff' }} title={`Compras: ${dash.purchases_qty[i]}`} />
                      </div>
                      <span className="text-[10px] text-[#666]">{m}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 justify-center text-[11px] mt-2">
                <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: '#8bc34a' }} /> Vendas</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: '#2b6bff' }} /> Compras</span>
              </div>
            </Box>
          </div>
        )}
      </div>

      {/* Barra inferior — "Visualizar Logs" à esquerda (como na referência), Gravar/Fechar à direita. */}
      <Toolbar
        actions={isNew ? [] : [
          { icon: '☰', label: 'Visualizar Logs', color: '#555', onClick: () => setVerLogs(true) },
        ]}
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="flex items-center gap-2 px-3 py-1 text-[13px] text-[#333] disabled:opacity-35 hover:bg-[#e8e8e8]">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                style={{ background: '#1f7a34' }}><Glyph icon="✔" size={15} /></span>
              {save.isPending ? 'A gravar…' : 'Gravar'}
            </button>
            <span className="w-px h-6 bg-[#d5d5d5]" />
            <button onClick={onClose}
              className="flex items-center gap-2 px-3 py-1 text-[13px] text-[#333] hover:bg-[#e8e8e8]">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                style={{ background: '#c0392b' }}><Glyph icon="✖" size={15} /></span>
              Fechar
            </button>
          </div>
        } />
      {verLogs && !isNew && <ArticleLogs id={id as number} nome={d.name} onClose={() => setVerLogs(false)} />}
    </div>
  );
}
