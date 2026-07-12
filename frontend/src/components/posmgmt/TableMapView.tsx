import { useState, useRef, useEffect } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { Map, Square, Circle, Save } from 'lucide-react';
import { useOutlets, useTables, useCreateTable, useUpdateTable } from '../../hooks/usePosMgmt';

const STATUS_COLOR: Record<string, string> = {
  FREE: '#3a9d3a', OCCUPIED: '#1e3f66', RESERVED: '#c67a00', DIRTY: '#8a8a8a',
};
const TABLE = 76; // tamanho do ícone da mesa (px)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-gray-600 block mb-0.5">{label}</span>{children}</label>;
}

export default function TableMapView() {
  const { data: outlets = [] } = useOutlets();
  const [outlet, setOutlet] = useState<number | undefined>();
  useEffect(() => { if (!outlet && outlets.length) setOutlet(outlets[0].id); }, [outlets, outlet]);
  const { data: tables = [] } = useTables(outlet);
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();

  const areaRef = useRef<HTMLDivElement>(null);
  // Posições locais durante o arrasto (para movimento fluido).
  const [pos, setPos] = useState<Record<number, { x: number; y: number }>>({});
  const drag = useRef<{ id: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [selId, setSelId] = useState<number | null>(null);   // mesa selecionada (painel de propriedades)
  const sel = tables.find((t: any) => t.id === selId) || null;

  useEffect(() => {
    const map: Record<number, { x: number; y: number }> = {};
    tables.forEach((t: any) => { map[t.id] = { x: t.pos_x ?? 40, y: t.pos_y ?? 40 }; });
    setPos((prev) => ({ ...map, ...Object.fromEntries([...dirty].map((id) => [id, prev[id]])) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  const onDown = (e: React.MouseEvent, t: any) => {
    // Fallback robusto: nunca deixar a posição ficar undefined/NaN (senão a mesa "salta"/desaparece).
    const p = pos[t.id] || { x: Number(t.pos_x) || 40, y: Number(t.pos_y) || 40 };
    drag.current = { id: t.id, dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current || !areaRef.current) return;
    const r = areaRef.current.getBoundingClientRect();
    let x = e.clientX - drag.current.dx;
    let y = e.clientY - drag.current.dy;
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    x = Math.max(0, Math.min(x, r.width - TABLE));
    y = Math.max(0, Math.min(y, r.height - TABLE));
    const id = drag.current.id;
    drag.current.moved = true;          // houve arrasto (não é um simples clique)
    setPos((prev) => ({ ...prev, [id]: { x, y } }));
  };
  const onUp = () => {
    // Capturar o valor ANTES de limpar a ref: o updater do setState corre depois e, se lesse
    // drag.current, encontrava null ("Cannot read properties of null (reading 'id')").
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.moved) setDirty((prev) => new Set(prev).add(d.id));   // arrastou → posição por guardar
    else setSelId(d.id);                                        // clique simples → seleciona a mesa
  };

  const saveAll = () => {
    dirty.forEach((id) => {
      const p = pos[id];
      if (p) updateTable.mutate({ id, data: { pos_x: Math.round(p.x), pos_y: Math.round(p.y) } });
    });
    setDirty(new Set());
  };

  const addTable = (shape: string) => {
    if (!outlet) return;
    // Número único mesmo após remoções (maior nº existente + 1).
    const maxNum = tables.reduce((m: number, t: any) => Math.max(m, Number(t.table_number) || 0), 0);
    // Sem pos_x/pos_y: o servidor posiciona sem sobreposição.
    createTable.mutate({ outlet, table_number: String(maxNum + 1), seats: 4, shape });
  };

  return (
    <ClassicWindow title="Mapa de Mesas (POS · Motor 3)" icon={<Map size={14} className="text-gray-300" />}
      footer={<div className="flex items-center justify-between w-full text-gray-600">
        <span>{tables.length} mesa(s){dirty.size > 0 && <span className="text-[#b06a00] font-bold"> · {dirty.size} posição(ões) por guardar</span>}</span>
        <span className="flex gap-3">
          {Object.entries(STATUS_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: c }} />{k}</span>)}
        </span>
      </div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <select value={outlet || ''} onChange={(e) => setOutlet(Number(e.target.value))} className="border border-[#a0a0a0] p-1 bg-white">
            {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <ClassicButton icon={Square} label="Mesa quadrada" onClick={() => addTable('SQUARE')} />
          <ClassicButton icon={Circle} label="Mesa redonda" onClick={() => addTable('ROUND')} />
          <ClassicButton icon={Save} label="Guardar posições" onClick={saveAll} disabled={dirty.size === 0} />
          <span className="text-gray-500 ml-auto"><b>Clique</b> numa mesa para ver/editar · <b>Arraste</b> para a posicionar</span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div ref={areaRef} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            className="flex-1 relative overflow-hidden"
            style={{ background: 'repeating-linear-gradient(0deg,#fafafa 0 24px,#f2f2f2 24px 25px), repeating-linear-gradient(90deg,#fafafa 0 24px,#f2f2f2 24px 25px)' }}>
            {tables.map((t: any) => {
              const p = pos[t.id] || { x: t.pos_x ?? 40, y: t.pos_y ?? 40 };
              const color = STATUS_COLOR[t.status] || '#8a8a8a';
              const isSel = t.id === selId;
              return (
                <div key={t.id} onMouseDown={(e) => onDown(e, t)} title={`Mesa ${t.table_number} · ${t.status_display}`}
                  className="absolute flex flex-col items-center justify-center text-white cursor-move shadow-md select-none"
                  style={{ left: p.x, top: p.y, width: TABLE, height: TABLE, background: color,
                    borderRadius: t.shape === 'ROUND' ? '50%' : 8,
                    border: isSel ? '3px solid #c9a400' : '2px solid rgba(0,0,0,0.25)',
                    boxShadow: isSel ? '0 0 0 3px rgba(201,164,0,0.35), 0 3px 8px rgba(0,0,0,0.35)' : '0 2px 5px rgba(0,0,0,0.3)' }}>
                  <span className="font-bold text-lg leading-none">{t.table_number}</span>
                  <span className="text-[10px] opacity-90 mt-0.5">{t.seats}p</span>
                </div>
              );
            })}
            {tables.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Sem mesas — adicione com os botões acima.</div>}
          </div>

          {/* Painel de propriedades da mesa selecionada */}
          {sel && (
            <div className="w-64 flex-shrink-0 border-l border-[#a0a0a0] bg-[#f7f8fa] flex flex-col text-[11px]">
              <div className="px-3 py-2 bg-[#1e3f66] text-white font-bold flex items-center justify-between">
                <span>Mesa {sel.table_number}</span>
                <button onClick={() => setSelId(null)} className="hover:text-[#ffd1d1] text-[14px] leading-none">×</button>
              </div>
              <div className="p-3 space-y-2 flex-1 overflow-auto">
                <Row label="Nome"><input defaultValue={sel.name || ''} onBlur={(e) => updateTable.mutate({ id: sel.id!, data: { name: e.target.value } })} className="border border-[#a0a0a0] p-1 w-full bg-white" /></Row>
                <Row label="Zona"><input defaultValue={sel.zone || ''} onBlur={(e) => updateTable.mutate({ id: sel.id!, data: { zone: e.target.value } })} className="border border-[#a0a0a0] p-1 w-full bg-white" /></Row>
                <Row label="Lugares"><input type="number" defaultValue={sel.seats} onBlur={(e) => updateTable.mutate({ id: sel.id!, data: { seats: Number(e.target.value) || 1 } })} className="border border-[#a0a0a0] p-1 w-full bg-white" /></Row>
                <Row label="Forma">
                  <select defaultValue={sel.shape} onChange={(e) => updateTable.mutate({ id: sel.id!, data: { shape: e.target.value } })} className="border border-[#a0a0a0] p-1 w-full bg-white">
                    <option value="SQUARE">Quadrada</option><option value="ROUND">Redonda</option><option value="RECT">Retangular</option><option value="BAR">Balcão</option><option value="SOFA">Sofá</option>
                  </select>
                </Row>
                <Row label="Estado">
                  <select value={sel.status} onChange={(e) => updateTable.mutate({ id: sel.id!, data: { status: e.target.value } })} className="border border-[#a0a0a0] p-1 w-full bg-white">
                    {Object.keys(STATUS_COLOR).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Row>
                <div className="pt-2 text-[10px] text-gray-500 border-t border-[#e0e0e0]">
                  As alterações gravam-se ao sair do campo. Arraste a mesa no mapa para a mover e clique em <b>Guardar posições</b>.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
