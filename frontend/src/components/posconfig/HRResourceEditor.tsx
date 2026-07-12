import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';
import { SubFamilyPicker, ItemPicker } from './Pickers';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Tab = 'services' | 'schedule' | 'commissions';

/**
 * RECURSO HUMANO — a pessoa que EXECUTA o serviço (a terapeuta, o massagista).
 *
 * Não é um login: é quem o POS pergunta "quem fez este tratamento?". Dessa resposta
 * saem três coisas reais:
 *   · Serviços  — que tratamentos esta pessoa está habilitada a fazer (o POS não
 *                 deixa marcar um serviço a quem não o sabe fazer);
 *   · Horário   — quando é que ela trabalha (não se marca em dia de folga);
 *   · Comissões — quanto ganha por cada venda.
 *
 * O calendário à direita é DERIVADO do horário — não é decoração: cada dia real
 * entre "De" e "Até" que caia num dia da semana com turno fica marcado a trabalhar.
 */
export default function HRResourceEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<Tab>('services');
  const [picker, setPicker] = useState<'sub' | 'item' | null>(null);
  const [d, setD] = useState<any>({
    is_active: true, is_front_office_user: false, sort_order: 0,
    service_ids: [], schedule: [], commissions: [], ...row,
  });
  const [srvFilter, setSrvFilter] = useState('');
  const [selLine, setSelLine] = useState<number | null>(null);

  const { data: types = [] } = useQuery({
    queryKey: ['posc', 'hrtypes'],
    queryFn: async () => (await apiClient.get('pos/config/hr-types/')).data,
  });
  const { data: sectors = [] } = useQuery({
    queryKey: ['posc', 'sectors'],
    queryFn: async () => (await apiClient.get('pos/config/sectors/')).data,
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
      ? apiClient.post('pos/config/human-resources/', d)
      : apiClient.patch(`pos/config/human-resources/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Recurso gravado',
        message: 'Passa a poder ser escolhido no POS ao lançar os serviços que sabe fazer — e nas horas em que trabalha.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));

  // ---- Serviços
  const svc: number[] = d.service_ids || [];
  const svcRows = useMemo(() => (articles as any[]).filter((a) =>
    !srvFilter || `${a.code} ${a.name}`.toLowerCase().includes(srvFilter.toLowerCase())), [articles, srvFilter]);
  const allSvc = svcRows.length > 0 && svcRows.every((a) => svc.includes(a.id));
  const toggleSvc = (id: number) => set('service_ids', svc.includes(id) ? svc.filter((x) => x !== id) : [...svc, id]);

  // ---- Horário
  const lines: any[] = d.schedule || [];
  const setLine = (i: number, k: string, v: any) => set('schedule', lines.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const addLine = () => set('schedule', [...lines, { weekday: 1, time_from: '09:00', time_to: '17:00' }]);
  const delLine = () => {
    if (selLine === null) return;
    set('schedule', lines.filter((_, j) => j !== selLine));
    setSelLine(null);
  };
  const workDays = new Set(lines.map((l) => Number(l.weekday)));

  // Calendário derivado: meses entre De e Até
  const months = useMemo(() => {
    const from = d.schedule_from ? new Date(d.schedule_from) : new Date();
    const to = d.schedule_to ? new Date(d.schedule_to) : new Date(from.getFullYear(), from.getMonth() + 2, 1);
    const out: { label: string; year: number; month: number; days: number; first: number }[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    let guard = 0;
    while (cur <= to && guard++ < 24) {
      const y = cur.getFullYear(), m = cur.getMonth();
      out.push({
        label: cur.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' }),
        year: y, month: m,
        days: new Date(y, m + 1, 0).getDate(),
        first: new Date(y, m, 1).getDay(),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [d.schedule_from, d.schedule_to]);

  // ---- Comissões
  const comms: any[] = d.commissions || [];
  const setComm = (i: number, k: string, v: any) => set('commissions', comms.map((c, j) => j === i ? { ...c, [k]: v } : c));
  const addComms = (rows: any[], kind: 'sub' | 'item') => {
    set('commissions', [...comms, ...rows.map((t) => ({
      [kind === 'sub' ? 'subfamily' : 'item']: t.id,
      code: t.code, target: t.name, commission_type: 'PERCENT', value: 0,
    }))]);
    setPicker(null);
  };

  const TABS: [Tab, string][] = [['services', 'Serviços'], ['schedule', 'Horário'], ['commissions', 'Comissões']];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">
          {isNew ? 'Novo recurso' : `A editar ${d.first_name || ''}`}
        </span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Cabeçalho */}
        <div className="flex gap-6 p-4">
          <div className="w-[52%] space-y-2">
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
              <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                className={`${inp} w-[290px]`} style={inputStyle} />
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Nome:<span className="text-[#a01818]">*</span></span>
              <input value={d.first_name || ''} onChange={(e) => set('first_name', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Apelido:</span>
              <input value={d.last_name || ''} onChange={(e) => set('last_name', e.target.value)}
                className={`${inp} flex-1`} style={inputStyle} />
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Tipo:<span className="text-[#a01818]">*</span></span>
              <select value={d.hr_type || ''} onChange={(e) => set('hr_type', Number(e.target.value) || null)}
                className={`${inp} w-[290px]`} style={inputStyle}>
                <option value="">(nenhum)</option>
                {(types as any[]).filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Género:</span>
              <select value={d.gender || ''} onChange={(e) => set('gender', e.target.value || null)}
                className={`${inp} w-[290px]`} style={inputStyle}>
                <option value="">—</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
                <option value="O">Outro</option>
              </select>
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Ordem:</span>
              <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
                className={`${inp} w-[290px]`} style={inputStyle} />
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Código Licença:</span>
              <input value={d.license_code || ''} onChange={(e) => set('license_code', e.target.value)}
                placeholder="cédula profissional" className={`${inp} w-[290px]`} style={inputStyle} />
            </label>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[100px] text-[#333]">Espaço:</span>
              <select value={d.space || ''} onChange={(e) => set('space', Number(e.target.value) || null)}
                className={`${inp} w-[290px]`} style={inputStyle}>
                <option value="">(nenhum)</option>
                {(sectors as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <div className="flex-1 flex items-start gap-10 pt-1">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
              Ativo
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={!!d.is_front_office_user}
                onChange={(e) => set('is_front_office_user', e.target.checked)} className="w-4 h-4" />
              Utilizador Front Office
            </label>
          </div>
        </div>

        {/* Separadores */}
        <div className="flex border-b-2 border-[#2b2b2b] px-3">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-1.5 text-[12px] font-semibold border-b-[3px] ${tab === k ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-3">
          {/* ---------------- Serviços ---------------- */}
          {tab === 'services' && (
            <div className="border border-[#d5d5d5]">
              <div className="flex items-center gap-3 px-3 py-2 bg-[#f4f4f4] border-b border-[#d5d5d5]">
                <span className="text-[12px]">Filtro:</span>
                <input value={srvFilter} onChange={(e) => setSrvFilter(e.target.value)} className={`${inp} w-[260px]`} style={inputStyle} />
                <label className="flex items-center gap-2 text-[12px] ml-3">
                  <input type="checkbox" checked={allSvc}
                    onChange={(e) => set('service_ids', e.target.checked
                      ? Array.from(new Set([...svc, ...svcRows.map((a) => a.id)]))
                      : svc.filter((id) => !svcRows.some((a) => a.id === id)))}
                    className="w-4 h-4" />
                  Selecionar Tudo
                </label>
                <span className="ml-auto text-[11px] text-[#666]">{svc.length} serviço(s) atribuído(s)</span>
              </div>
              <div className="h-[300px] overflow-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
                    <th className="w-[42px] border-b border-[#d0d0d0]" />
                    <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Serviço</th>
                  </tr></thead>
                  <tbody>
                    {svcRows.map((a: any) => (
                      <tr key={a.id} onClick={() => toggleSvc(a.id)}
                        className={`border-b border-[#eee] cursor-pointer ${svc.includes(a.id) ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                        <td className="text-center py-1.5">
                          <input type="checkbox" checked={svc.includes(a.id)} onChange={() => toggleSvc(a.id)}
                            onClick={(e) => e.stopPropagation()} className="w-4 h-4" />
                        </td>
                        <td className="px-2 py-1.5"><b className="font-mono">{a.code}</b> · {a.name}</td>
                      </tr>
                    ))}
                    {svcRows.length === 0 && <tr><td colSpan={2} className="text-center text-[#999] py-10">Sem artigos.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-1.5 bg-[#f9f9f9] border-t border-[#e5e5e5] text-[11px] text-[#666]">
                No POS, esta pessoa só pode ser escolhida nos serviços que aqui estiverem marcados.
              </div>
            </div>
          )}

          {/* ---------------- Horário ---------------- */}
          {tab === 'schedule' && (
            <div>
              <div className="flex items-center gap-3 mb-2 text-[13px]">
                <span>De:</span>
                <input type="month" value={(d.schedule_from || '').slice(0, 7)}
                  onChange={(e) => set('schedule_from', e.target.value ? `${e.target.value}-01` : null)}
                  className={`${inp} w-[160px]`} style={inputStyle} />
                <span className="ml-3">Até:</span>
                <input type="month" value={(d.schedule_to || '').slice(0, 7)}
                  onChange={(e) => set('schedule_to', e.target.value ? `${e.target.value}-01` : null)}
                  className={`${inp} w-[160px]`} style={inputStyle} />
              </div>

              <div className="flex gap-3">
                {/* Turnos */}
                <div className="w-[420px] border border-[#d5d5d5] flex flex-col">
                  <div className="px-2 py-1.5 bg-[#e9e9e9] text-[12px] font-bold border-b border-[#d5d5d5]">
                    Dias: {lines.length ? Array.from(workDays).sort().map((w) => DAYS[w]).join(', ') : '—'}
                  </div>
                  <div className="h-[240px] overflow-auto">
                    <table className="w-full text-[12px] border-collapse">
                      <thead className="sticky top-0"><tr className="bg-[#f4f4f4]">
                        <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Dia</th>
                        <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">De</th>
                        <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Até</th>
                      </tr></thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i} onClick={() => setSelLine(i)}
                            className={`border-b border-[#eee] cursor-pointer ${selLine === i ? 'bg-[#cfe2f3]' : ''}`}>
                            <td className="p-0.5">
                              <select value={l.weekday} onChange={(e) => setLine(i, 'weekday', Number(e.target.value))} className={cell}>
                                {DAYS_LONG.map((n, w) => <option key={w} value={w}>{n}</option>)}
                              </select>
                            </td>
                            <td className="p-0.5"><input type="time" value={(l.time_from || '').slice(0, 5)} onChange={(e) => setLine(i, 'time_from', e.target.value)} className={cell} /></td>
                            <td className="p-0.5"><input type="time" value={(l.time_to || '').slice(0, 5)} onChange={(e) => setLine(i, 'time_to', e.target.value)} className={cell} /></td>
                          </tr>
                        ))}
                        {lines.length === 0 && <tr><td colSpan={3} className="text-center text-[#999] py-10">Sem turnos.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-4 px-2 py-2 border-t border-[#d5d5d5] bg-[#f4f4f4]">
                    <button onClick={addLine} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
                      <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
                    </button>
                    <button onClick={delLine} disabled={selLine === null}
                      className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
                      <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Apagar
                    </button>
                  </div>
                </div>

                {/* Calendário derivado */}
                <div className="flex-1 border border-[#d5d5d5] overflow-auto">
                  <table className="text-[11px] border-collapse">
                    <thead><tr className="bg-[#f0f0f0]">
                      <th className="text-left font-normal px-2 py-1 border border-[#d5d5d5] sticky left-0 bg-[#f0f0f0] w-[90px]">Mês</th>
                      {Array.from({ length: 31 }, (_, i) => (
                        <th key={i} className="font-normal border border-[#d5d5d5] w-[22px]">{i + 1}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={`${m.year}-${m.month}`}>
                          <td className="px-2 py-2 border border-[#d5d5d5] sticky left-0 bg-white whitespace-nowrap">{m.label}</td>
                          {Array.from({ length: 31 }, (_, i) => {
                            const day = i + 1;
                            if (day > m.days) return <td key={i} className="border border-[#d5d5d5] bg-[#8a8a8a]" />;
                            const wd = new Date(m.year, m.month, day).getDay();
                            const on = workDays.has(wd);
                            return (
                              <td key={i} title={`${day} · ${DAYS_LONG[wd]}${on ? ' — trabalha' : ' — folga'}`}
                                className="text-center border border-[#d5d5d5]"
                                style={{ background: on ? '#ffd479' : '#fff', color: '#333' }}>
                                {String(day).padStart(2, '0')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-2 py-1.5 text-[11px] text-[#666] border-t border-[#e5e5e5]">
                    <span className="inline-block w-3 h-3 align-middle mr-1" style={{ background: '#ffd479' }} /> dia de trabalho ·
                    o calendário sai dos turnos da esquerda — mude o turno e ele muda.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- Comissões ---------------- */}
          {tab === 'commissions' && (
            <div className="border border-[#d5d5d5]">
              <div className="h-[280px] overflow-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="sticky top-0"><tr className="bg-[#e9e9e9]">
                    {['Código', 'Descrição', 'Tipo', 'Valor', ''].map((h) => (
                      <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {comms.map((c, i) => (
                      <tr key={i} className="border-b border-[#eee]">
                        <td className="px-2 py-1.5 border border-[#eee] font-mono">{c.code}</td>
                        <td className="px-2 py-1.5 border border-[#eee]">{c.target}</td>
                        <td className="p-0.5 border border-[#eee] w-[160px]">
                          <select value={c.commission_type} onChange={(e) => setComm(i, 'commission_type', e.target.value)} className={cell}>
                            <option value="PERCENT">Percentagem</option>
                            <option value="VALUE">Valor fixo</option>
                          </select>
                        </td>
                        <td className="p-0.5 border border-[#eee] w-[120px]">
                          <input type="number" value={c.value} onChange={(e) => setComm(i, 'value', e.target.value)} className={`${cell} text-right`} />
                        </td>
                        <td className="text-center border border-[#eee] w-[70px]">
                          <button onClick={() => set('commissions', comms.filter((_, j) => j !== i))}
                            className="text-red-600 font-bold text-[11px]">Apagar</button>
                        </td>
                      </tr>
                    ))}
                    {comms.length === 0 && <tr><td colSpan={5} className="text-center text-[#999] py-10">Sem comissões.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d5d5d5]">
                <button onClick={() => setPicker('sub')} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
                  <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar - Sub-Famílias
                </button>
                <button onClick={() => setPicker('item')} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
                  <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar - Artigos
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {picker === 'sub' && (
        <SubFamilyPicker exclude={comms.filter((c) => c.subfamily).map((c) => c.subfamily)}
          onPick={(rows) => addComms(rows, 'sub')} onClose={() => setPicker(null)} />
      )}
      {picker === 'item' && (
        <ItemPicker exclude={comms.filter((c) => c.item).map((c) => c.item)}
          onPick={(rows) => addComms(rows, 'item')} onClose={() => setPicker(null)} />
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
