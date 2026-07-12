import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-start gap-3 text-[12px]">
      <span className="w-[130px] flex-shrink-0 text-[#333] pt-1">{label}</span>
      {children}
    </label>
  );
}

/**
 * DOCUMENTO / SÉRIE — a numeração das faturas. É a coisa mais sensível do sistema.
 *
 * A série é a MESMA que assina, encadeia por hash e vai no SAF-T. Não existe uma
 * "série do POS" à parte — se existisse, sairiam documentos com número que a AGT
 * não reconhece.
 *
 * Por isso o "Número" (o último emitido) é SÓ DE LEITURA: reescrevê-lo partia a
 * sequência, e a sequência é exatamente o que a AGT confere. Para mudar de
 * exercício, fecha-se a série e abre-se outra — não se mexe no contador.
 */
export default function DocumentEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<'models' | 'copies'>('models');
  const [sel, setSel] = useState<number | null>(null);
  const [d, setD] = useState<any>({
    year: new Date().getFullYear(), is_active: true, is_closed: false, einvoice: false,
    print_models: [], copy_texts: ['Original', '2ª Via', '3ª Via', '4ª Via', '5ª Via'], ...row,
  });

  const { data: types = [] } = useQuery({
    queryKey: ['posc', 'doctypes'],
    queryFn: async () => (await apiClient.get('pos/config/documents/doc_types/')).data,
  });
  const { data: series = [] } = useQuery({
    queryKey: ['posc', 'documents'],
    queryFn: async () => (await apiClient.get('pos/config/documents/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/documents/', d)
      : apiClient.patch(`pos/config/documents/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Série gravada',
        message: 'É esta a numeração que assina e vai no SAF-T. O contador não se mexe à mão — para mudar de exercício, feche a série e abra outra.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const pms: any[] = d.print_models || [];
  const setPm = (i: number, k: string, v: any) => set('print_models', pms.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const addPm = () => set('print_models', [...pms, {
    kind: 'RECEIPT', code: String(pms.length + 1), description: String(pms.length + 1),
    model_name: 'ML.INVOICE', copies: 1, max_copies: 3, sort_order: pms.length + 1,
    is_default: pms.length === 0, is_active: true,
  }]);
  const copyPm = () => {
    if (sel === null) return;
    set('print_models', [...pms, { ...pms[sel], is_default: false, sort_order: pms.length + 1 }]);
  };
  const delPm = () => {
    if (sel === null) return;
    set('print_models', pms.filter((_, j) => j !== sel));
    setSel(null);
  };
  const texts: string[] = d.copy_texts?.length ? d.copy_texts : ['Original', '2ª Via', '3ª Via', '4ª Via', '5ª Via'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">
          {isNew ? 'Nova série' : `A editar ${d.name || d.type_name || d.code}`}
        </span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Ficha da série */}
        <div className="w-[46%] p-4 space-y-2 overflow-auto border-r border-[#e0e0e0]">
          <div className="flex items-start gap-4">
            <Row label="Código:">
              <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                className={`${inp} w-[180px]`} style={inputStyle} />
            </Row>
            <label className="flex items-center gap-2 text-[12px] pt-1">
              <input type="checkbox" checked={!!d.is_closed} onChange={(e) => set('is_closed', e.target.checked)} className="w-4 h-4" />
              Série fechada
            </label>
          </div>

          <Row label="Nº Série:">
            <input value={d.prefix || ''} onChange={(e) => set('prefix', e.target.value)}
              placeholder="2026005" className={`${inp} w-[240px]`} style={inputStyle} />
          </Row>
          <Row label="Ano:">
            <input type="number" value={d.year ?? 0} onChange={(e) => set('year', Number(e.target.value))}
              className={`${inp} w-[240px]`} style={inputStyle} />
          </Row>
          <Row label="Número:">
            <div>
              <input value={d.current_number ?? 0} readOnly
                className={`${inp} w-[240px] bg-[#f0f0f0] text-[#666]`} style={inputStyle} />
              <div className="text-[11px] text-[#8a6100] mt-1 max-w-[240px]">
                Só de leitura: é o último nº emitido. Reescrevê-lo <b>partia a sequência</b>,
                que é o que a AGT confere.
              </div>
            </div>
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} w-[300px]`} style={inputStyle} />
          </Row>
          <Row label="Tipo:">
            <select value={d.doc_type || ''} onChange={(e) => set('doc_type', Number(e.target.value) || null)}
              className={`${inp} w-[240px]`} style={inputStyle}>
              <option value="">—</option>
              {(types as any[]).map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select>
          </Row>

          <div className="flex items-start gap-3">
            <label className="flex items-center gap-2 text-[12px] w-[130px] pt-1">
              <input type="checkbox" checked={!!d.recovery_series} className="w-4 h-4"
                onChange={(e) => set('recovery_series', e.target.checked ? (series as any[])[0]?.id ?? null : null)} />
              Série de Recuperação
            </label>
            <select value={d.recovery_series || ''} disabled={!d.recovery_series}
              onChange={(e) => set('recovery_series', Number(e.target.value) || null)}
              className={`${inp} w-[240px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle}>
              <option value="">(nenhum)</option>
              {(series as any[]).filter((s) => s.id !== row?.id).map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.name || s.type_name}</option>
              ))}
            </select>
          </div>

          <Row label="Tipo das Séries:">
            <input value={d.series_type || ''} onChange={(e) => set('series_type', e.target.value)}
              placeholder="(nenhum)" className={`${inp} w-[300px]`} style={inputStyle} />
          </Row>
          <Row label="Tipo das Séries:">
            <input value={d.series_type_2 || ''} onChange={(e) => set('series_type_2', e.target.value)}
              placeholder="(nenhum)" className={`${inp} w-[300px]`} style={inputStyle} />
          </Row>
          <Row label="Classe do Documento:">
            <input value={d.document_class || ''} onChange={(e) => set('document_class', e.target.value)}
              placeholder="(nenhum)" className={`${inp} w-[300px]`} style={inputStyle} />
          </Row>
          <Row label="AT Processing Mean:">
            <input value={d.at_processing_mean || ''} onChange={(e) => set('at_processing_mean', e.target.value)}
              placeholder="(nenhum)" className={`${inp} w-[300px]`} style={inputStyle} />
          </Row>
          <Row label="Data Início:">
            <input type="date" value={(d.start_date || '').slice(0, 10)}
              onChange={(e) => set('start_date', e.target.value || null)}
              className={`${inp} w-[240px]`} style={inputStyle} />
          </Row>
          <Row label="Código de Validação:">
            <input value={d.validation_code || ''} onChange={(e) => set('validation_code', e.target.value)}
              placeholder="atribuído pela AGT" className={`${inp} w-[300px]`} style={inputStyle} />
          </Row>

          <div className="border-t border-[#e0e0e0] pt-2 mt-2 space-y-2">
            <Row label="Fatura Electrónica:">
              <select value={d.einvoice ? '1' : '0'} onChange={(e) => set('einvoice', e.target.value === '1')}
                className={`${inp} w-[140px]`} style={inputStyle}>
                <option value="0">Não</option>
                <option value="1">Sim</option>
              </select>
            </Row>
            <Row label="Fat. Elect. - Referência:">
              <input value={d.einvoice_reference || ''} disabled={!d.einvoice}
                onChange={(e) => set('einvoice_reference', e.target.value)}
                placeholder="(nenhum)" className={`${inp} w-[240px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle} />
            </Row>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
              Ativo
            </label>
          </div>

          {d.is_closed && (
            <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1">
              Série <b>fechada</b>: o servidor recusa emitir nela. Abra uma nova série para continuar.
            </div>
          )}
        </div>

        {/* Separadores */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b-2 border-[#2b2b2b] px-2">
            {([['models', 'Modelo de Impressão'], ['copies', 'Texto das Vias']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-1.5 text-[12px] font-semibold border-b-[3px] ${tab === k ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'models' ? (
            <>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
                    {['Tipo', 'Código', 'Descrição', 'Modelo', 'Vias', 'Max. Vias', 'Ordem', 'Modelo defeito', 'Ativo'].map((h) => (
                      <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {pms.map((m, i) => (
                      <tr key={i} onClick={() => setSel(i)}
                        className={`border-b border-[#eee] cursor-pointer ${sel === i ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                        <td className="p-0.5 w-[100px]">
                          <select value={m.kind} onChange={(e) => setPm(i, 'kind', e.target.value)} className={cell}>
                            <option value="RECEIPT">Talão</option>
                            <option value="INVOICE">Fatura</option>
                            <option value="REPORT">Relatório</option>
                          </select>
                        </td>
                        <td className="p-0.5 w-[70px]"><input value={m.code} onChange={(e) => setPm(i, 'code', e.target.value)} className={cell} /></td>
                        <td className="p-0.5"><input value={m.description || ''} onChange={(e) => setPm(i, 'description', e.target.value)} className={cell} /></td>
                        <td className="p-0.5 w-[150px]"><input value={m.model_name} onChange={(e) => setPm(i, 'model_name', e.target.value)} className={`${cell} text-[#1a4f8a]`} /></td>
                        <td className="p-0.5 w-[60px]"><input type="number" value={m.copies} onChange={(e) => setPm(i, 'copies', Number(e.target.value))} className={cell} /></td>
                        <td className="p-0.5 w-[70px]"><input type="number" value={m.max_copies} onChange={(e) => setPm(i, 'max_copies', Number(e.target.value))} className={cell} /></td>
                        <td className="p-0.5 w-[60px]"><input type="number" value={m.sort_order} onChange={(e) => setPm(i, 'sort_order', Number(e.target.value))} className={cell} /></td>
                        <td className="text-center w-[90px]">
                          {/* Um só modelo por defeito: ligar um desliga os outros. */}
                          <GridCheck checked={m.is_default} title="O modelo que sai por defeito"
                            onChange={(v) => set('print_models', pms.map((x, j) => ({ ...x, is_default: v && j === i })))} />
                        </td>
                        <td className="text-center w-[60px]">
                          <GridCheck checked={m.is_active} onChange={(v) => setPm(i, 'is_active', v)} />
                        </td>
                      </tr>
                    ))}
                    {pms.length === 0 && (
                      <tr><td colSpan={9} className="text-center text-[#999] py-10">Sem modelos de impressão.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d0d0d0]">
                <button onClick={addPm} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
                  <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
                </button>
                <button onClick={copyPm} disabled={sel === null}
                  className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
                  <span className="w-5 h-5 rounded-full bg-[#5d4037] text-white flex items-center justify-center text-[11px]">⧉</span> Copiar
                </button>
                <button onClick={delPm} disabled={sel === null}
                  className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
                  <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Apagar
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <label key={i} className="flex items-center gap-3 text-[13px]">
                  <span className="w-[24px] text-[#333]">{i + 1}:</span>
                  <input value={texts[i] || ''} className={`${inp} flex-1`} style={inputStyle}
                    onChange={(e) => {
                      const t = [...texts];
                      t[i] = e.target.value;
                      set('copy_texts', t);
                    }} />
                </label>
              ))}
              <div className="text-[11px] text-[#666] pt-2 border-t border-[#eee]">
                É o que sai impresso em cada cópia. A 1ª via é o <b>Original</b> (a do cliente);
                as outras vão para o arquivo e para a contabilidade.
              </div>
            </div>
          )}
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
