import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

/**
 * PLANTA DA SALA — desenha-se as mesas onde elas estão de verdade.
 *
 * Arrasta-se, muda-se a forma, o tamanho e a cor. A planta grava-se DE UMA VEZ:
 * arrastar 14 mesas e gravar uma a uma seria 14 pedidos, e se um falhasse ficava
 * um mapa meio gravado.
 *
 * Uma mesa com CONTA ABERTA nunca é apagada — o servidor recusa e diz quais.
 */
export default function TableMapDesigner({ sector, mode, onClose }:
  { sector: any; mode: 'design' | 'online'; onClose: () => void }) {
  const qc = useQueryClient();
  const [tables, setTables] = useState<any[]>([]);
  const [sel, setSel] = useState<number | null>(null);     // índice selecionado
  const [bg, setBg] = useState(sector.map_bg_color || '#fdeef0');
  const [txt, setTxt] = useState(sector.map_text_color || '#ffffff');
  const [showNums, setShowNums] = useState(true);
  const [clip, setClip] = useState<any>(null);
  const drag = useRef<any>(null);
  const canvas = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['posc', 'plan', sector.id],
    queryFn: async () => (await apiClient.get(`pos/config/sectors/${sector.id}/tables/`)).data,
  });
  useEffect(() => { if (data) setTables(data); }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.post(`pos/config/sectors/${sector.id}/tables/`, { tables }),
    onSuccess: (r: any) => {
      setTables(r.data.tables);
      qc.invalidateQueries({ queryKey: ['posc'] });
      const blocked = r.data.blocked || [];
      notifyGuide({
        title: 'Planta gravada',
        message: `${r.data.tables.length} mesa(s) na sala.`,
        hint: blocked.length
          ? `As mesas ${blocked.join(', ')} NÃO foram apagadas: têm conta aberta. Feche a conta primeiro.`
          : undefined,
      });
    },
    onError: notifyError,
  });

  const upd = (i: number, patch: any) => setTables((ts) => ts.map((t, j) => j === i ? { ...t, ...patch } : t));
  const addTable = (shape: string) => {
    const n = tables.length + 1;
    setTables([...tables, {
      table_number: `M${n}`, shape, pos_x: 40, pos_y: 40,
      width: shape === 'ROUND' ? 100 : 90, height: shape === 'ROUND' ? 100 : 110,
      color: '#0f8b8d', text_color: '#ffffff', seats: 4,
      online_reservation: false, min_seats: 0, max_seats: 0, preferred_seats: 0,
    }]);
    setSel(tables.length);
  };
  const delSel = () => { if (sel === null) return; setTables(tables.filter((_, j) => j !== sel)); setSel(null); };
  const copySel = () => sel !== null && setClip({ ...tables[sel] });
  const cutSel = () => { copySel(); delSel(); };
  const paste = () => {
    if (!clip) return;
    const n = tables.length + 1;
    setTables([...tables, { ...clip, id: undefined, table_number: `${clip.table_number}-${n}`, pos_x: clip.pos_x + 20, pos_y: clip.pos_y + 20 }]);
  };
  const align = (dir: string) => {
    if (sel === null) return;
    const s = tables[sel];
    setTables(tables.map((t, j) => {
      if (j === sel) return t;
      if (dir === 'left') return { ...t, pos_x: s.pos_x };
      if (dir === 'top') return { ...t, pos_y: s.pos_y };
      return t;
    }));
  };
  const distribute = (axis: 'V' | 'H') => {
    const sorted = [...tables].sort((a, b) => axis === 'V' ? a.pos_y - b.pos_y : a.pos_x - b.pos_x);
    const step = 140;
    const out = sorted.map((t, i) => axis === 'V' ? { ...t, pos_y: 30 + i * step } : { ...t, pos_x: 30 + i * step });
    setTables(out);
  };

  // Arrastar mesas no plano
  const onDown = (e: React.MouseEvent, i: number) => {
    setSel(i);
    const r = canvas.current!.getBoundingClientRect();
    drag.current = { i, dx: e.clientX - r.left - tables[i].pos_x, dy: e.clientY - r.top - tables[i].pos_y };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d || !canvas.current) return;
      const r = canvas.current.getBoundingClientRect();
      upd(d.i, {
        pos_x: Math.max(0, Math.round(e.clientX - r.left - d.dx)),
        pos_y: Math.max(0, Math.round(e.clientY - r.top - d.dy)),
      });
    };
    const up = () => { drag.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [tables]);

  const S = tables[sel ?? -1];
  const total = tables.length;
  const online = tables.filter((t) => t.online_reservation).length;

  const Btn = ({ onClick, children, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 px-3 py-1.5 bg-[#3c3c3c] text-white text-[12px] hover:bg-[#4c4c4c] disabled:opacity-35">
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-6" onClick={onClose}>
      <div className="bg-[#f0f0f0] w-full max-w-[1400px] h-full max-h-[92vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 text-white text-[15px] font-bold" style={{ background: '#3c3c3c' }}>
          <span>{mode === 'online' ? 'Mesas - Online' : 'Mesas'} — {sector.name}</span>
          <button onClick={onClose} className="text-white text-[16px]">✕</button>
        </div>

        {/* Barra de ferramentas do desenho (só no modo planta) */}
        {mode === 'design' && (
          <div className="flex items-center gap-2 p-2 border-b border-[#c0c0c0] bg-white flex-wrap">
            <Btn onClick={cutSel} disabled={sel === null}>✂ Cortar</Btn>
            <Btn onClick={copySel} disabled={sel === null}>⧉ Copiar</Btn>
            <Btn onClick={delSel} disabled={sel === null}><span className="text-[#ff8a8a]">●</span> Apagar</Btn>
            <Btn onClick={paste} disabled={!clip}>📋 Colar</Btn>
            <span className="w-px h-6 bg-[#d5d5d5] mx-1" />
            <Btn onClick={() => align('top')} disabled={sel === null}>⇥ Alinhar topo</Btn>
            <Btn onClick={() => align('left')} disabled={sel === null}>⇤ Alinhar esquerda</Btn>
            <Btn onClick={() => distribute('V')}>↕ Vertical</Btn>
            <Btn onClick={() => distribute('H')}>↔ Horizontal</Btn>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Formas / propriedades */}
          {mode === 'design' && (
            <div className="w-[250px] flex-shrink-0 border-r border-[#c0c0c0] bg-white overflow-auto">
              <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold border-b border-[#d0d0d0]">Formas</div>
              <div className="flex gap-2 p-3 border-b border-[#e0e0e0]">
                {[['SQUARE', 'rounded-none w-12 h-12'], ['RECT', 'rounded-none w-12 h-9'], ['ROUND', 'rounded-full w-12 h-12']].map(([shape, cls]) => (
                  <button key={shape} onClick={() => addTable(shape)} title="Arraste para a sala"
                    className={`${cls} border border-[#0b6b6d]`} style={{ background: '#0f8b8d' }} />
                ))}
              </div>

              <div className="p-3 space-y-2 text-[12px]">
                <button onClick={() => sel !== null && upd(sel, { table_number: prompt('Número da mesa:', S?.table_number) || S.table_number })}
                  disabled={sel === null} className="w-full py-1.5 bg-[#3c3c3c] text-white disabled:opacity-35">Alterar número</button>
                <button onClick={() => sel !== null && upd(sel, { name: prompt('Texto da mesa:', S?.name || '') || '' })}
                  disabled={sel === null} className="w-full py-1.5 bg-[#3c3c3c] text-white disabled:opacity-35">Alterar texto</button>

                <label className="flex items-center gap-2"><input type="checkbox" checked={showNums} onChange={(e) => setShowNums(e.target.checked)} className="w-4 h-4" />Visualizar números</label>

                <label className="flex items-center gap-2">Cor de Fundo:
                  <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-9 h-7 border border-[#8a95a3]" />
                  <input value={bg} onChange={(e) => setBg(e.target.value)} className={`${inp} flex-1 min-w-0`} />
                </label>
                <label className="flex items-center gap-2">Cor do texto:
                  <input type="color" value={txt} onChange={(e) => setTxt(e.target.value)} className="w-9 h-7 border border-[#8a95a3]" />
                  <input value={txt} onChange={(e) => setTxt(e.target.value)} className={`${inp} flex-1 min-w-0`} />
                </label>

                {S && (
                  <div className="pt-2 border-t border-[#e0e0e0] space-y-1.5">
                    <div className="font-bold text-[#25405e]">Mesa {S.table_number}</div>
                    <label className="flex items-center gap-2">Cor:
                      <input type="color" value={S.color} onChange={(e) => upd(sel!, { color: e.target.value })} className="w-9 h-7 border border-[#8a95a3]" />
                    </label>
                    <label className="flex items-center gap-2">Largura:
                      <input type="number" value={S.width} onChange={(e) => upd(sel!, { width: Number(e.target.value) })} className={`${inp} w-[70px]`} />
                      Altura:
                      <input type="number" value={S.height} onChange={(e) => upd(sel!, { height: Number(e.target.value) })} className={`${inp} w-[70px]`} />
                    </label>
                    <label className="flex items-center gap-2">Lugares:
                      <input type="number" value={S.seats} onChange={(e) => upd(sel!, { seats: Number(e.target.value) })} className={`${inp} w-[70px]`} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Planta */}
          <div ref={canvas} className="flex-1 relative overflow-auto" style={{ background: bg }}>
            {tables.map((t, i) => (
              <div key={i}
                onMouseDown={(e) => mode === 'design' && onDown(e, i)}
                onClick={() => setSel(i)}
                className={`absolute flex items-end justify-start p-1 select-none ${mode === 'design' ? 'cursor-move' : 'cursor-pointer'}`}
                style={{
                  left: t.pos_x, top: t.pos_y, width: t.width, height: t.height,
                  background: t.color,
                  borderRadius: t.shape === 'ROUND' ? '50%' : 0,
                  outline: sel === i ? '3px solid #c9a400' : 'none',
                  color: txt,
                }}>
                {mode === 'design' && (
                  <span className="absolute left-2 top-2 w-4 h-4 rounded-full" style={{ background: '#22e04a' }} />
                )}
                {showNums && <span className="font-bold text-[15px] drop-shadow">{t.table_number}</span>}
              </div>
            ))}
            {tables.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[#999] text-[13px]">
                Sala vazia — escolha uma forma à esquerda para acrescentar mesas.
              </div>
            )}
          </div>

          {/* Lugares / Reservas online */}
          <div className="w-[420px] flex-shrink-0 border-l border-[#c0c0c0] bg-white flex flex-col">
            <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold border-b border-[#d0d0d0]">Lugares</div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-[#f4f4f4]">
                    <th className="px-2 py-1 border-b border-[#d0d0d0] w-[36px]" />
                    <th className="text-left font-normal px-2 py-1 border-b border-[#d0d0d0]">Código</th>
                    <th className="text-center font-normal px-1 py-1 border-b border-[#d0d0d0]">Reservas Online</th>
                    <th className="text-center font-normal px-1 py-1 border-b border-[#d0d0d0]">Mínimo</th>
                    <th className="text-center font-normal px-1 py-1 border-b border-[#d0d0d0]">Máximo</th>
                    <th className="text-center font-normal px-1 py-1 border-b border-[#d0d0d0]">Preferido</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t, i) => (
                    <tr key={i} onClick={() => setSel(i)}
                      className={`border-b border-[#eee] cursor-pointer ${sel === i ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                      <td className="text-center"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: t.color }} /></td>
                      <td className="px-2 py-1 font-bold">{t.table_number}</td>
                      <td className="text-center">
                        <input type="checkbox" checked={!!t.online_reservation} onChange={(e) => upd(i, { online_reservation: e.target.checked })} className="w-4 h-4" />
                      </td>
                      {['min_seats', 'max_seats', 'preferred_seats'].map((k) => (
                        <td key={k} className="p-0.5">
                          <input type="number" value={t[k] ?? 0} onChange={(e) => upd(i, { [k]: Number(e.target.value) })}
                            className="w-full border border-[#dcdcdc] px-1 py-0.5 text-[12px] text-center" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#d0d0d0] p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
              <div className="flex justify-between font-bold"><span>Total:</span><span>{total}</span></div>
              <div className="flex justify-between font-bold"><span>Reservas Online:</span><span>{online}</span></div>
              <div className="flex justify-between"><span>Lugares (mín.):</span><span>{tables.reduce((a, t) => a + (t.min_seats || 0), 0)}</span></div>
              <div className="flex justify-between"><span>Lugares (máx.):</span><span>{tables.reduce((a, t) => a + (t.max_seats || 0), 0)}</span></div>
              <div className="flex justify-between"><span>Preferido:</span><span>{tables.reduce((a, t) => a + (t.preferred_seats || 0), 0)}</span></div>
              <div className="flex justify-between"><span>Lugares (total):</span><span>{tables.reduce((a, t) => a + (t.seats || 0), 0)}</span></div>
            </div>
          </div>
        </div>

        <Toolbar actions={[
          { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
          { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
        ]} />
      </div>
    </div>
  );
}
