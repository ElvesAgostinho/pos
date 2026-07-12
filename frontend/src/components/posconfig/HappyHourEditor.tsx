import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** As cores dos níveis de preço — as mesmas do original, para o olho reconhecer. */
const NIVEIS = [
  { v: 0, label: 'Preço por Omissão', bg: '#ffffff', fg: '#333' },
  { v: 1, label: 'Preço 1', bg: '#f472b6', fg: '#fff' },
  { v: 2, label: 'Preço 2', bg: '#5eead4', fg: '#0f3b36' },
  { v: 3, label: 'Preço 3', bg: '#86efac', fg: '#14532d' },
  { v: 4, label: 'Preço 4', bg: '#7dd3fc', fg: '#0c3d52' },
  { v: 5, label: 'Preço 5', bg: '#d8b4fe', fg: '#3b0764' },
];

/**
 * HAPPY HOUR — a que horas e em que dias o preço muda, sozinho.
 *
 * Pinta-se a grelha (arrastando) com o nível de preço: às 17h de quinta o gin passa
 * ao Preço 2, às 20h volta ao normal. Não é um aviso no ecrã: é o servidor que troca
 * o preço quando o empregado lança o artigo — ninguém se tem de lembrar de nada.
 *
 * Os níveis de preço (1..5) são os da ficha do artigo, separador Preços.
 */
export default function HappyHourEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    kind: 'PRICE', show_half_hours: false, is_active: true, cells: {}, ...row,
  });
  const [brush, setBrush] = useState(1);
  const [painting, setPainting] = useState(false);

  const { data: outlets = [] } = useQuery({
    queryKey: ['posc', 'outlets'],
    queryFn: async () => { const r = await apiClient.get('pos/outlets/'); return r.data?.results || r.data || []; },
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/happy-hours/', d)
      : apiClient.patch(`pos/config/happy-hours/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Happy Hour gravado',
        message: 'A partir de agora o preço muda sozinho às horas marcadas — o empregado não tem de fazer nada.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const cells: Record<string, any> = d.cells || {};
  const horas = Array.from({ length: 24 }, (_, h) => h);
  const slots = d.show_half_hours
    ? horas.flatMap((h) => [`${h}`, `${h}.5`])
    : horas.map((h) => `${h}`);

  const label = (s: string) => {
    const h = Math.floor(Number(s));
    const meia = s.endsWith('.5');
    const de = `${String(h).padStart(2, '0')}:${meia ? '30' : '00'}`;
    const ate = `${String(h).padStart(2, '0')}:${meia ? '59' : '29'}`;
    return d.show_half_hours ? `${de} - ${ate}` : `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`;
  };

  const pinta = (dia: number, slot: string) => {
    const key = `${dia}-${slot}`;
    const c = { ...cells };
    if (brush === 0) delete c[key];
    else c[key] = d.kind === 'PRICE' ? brush : brush;   // no modo Desconto, o pincel é a %
    set('cells', c);
  };

  const corDe = (v: any) => NIVEIS.find((n) => n.v === Number(v)) || NIVEIS[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white" onMouseUp={() => setPainting(false)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo Happy Hour' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="p-4 space-y-2 border-b border-[#e0e0e0]">
        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-[110px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
          <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
            placeholder="Happy Hour de Verão" className={`${inp} w-[420px]`} style={inputStyle} />
        </label>

        <div className="flex items-center gap-8 text-[12px]">
          <span className="w-[110px] text-[#333]">Tipo:</span>
          <label className="flex items-center gap-2">
            <input type="radio" checked={d.kind === 'PRICE'} onChange={() => set('kind', 'PRICE')} className="w-4 h-4" />
            Preço
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={d.kind === 'DISCOUNT'} onChange={() => set('kind', 'DISCOUNT')} className="w-4 h-4" />
            Desconto
          </label>
        </div>

        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-[110px] text-[#333]">Mostrar Meias Horas:</span>
          <input type="checkbox" checked={!!d.show_half_hours}
            onChange={(e) => set('show_half_hours', e.target.checked)} className="w-4 h-4" />
        </label>

        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-[110px] text-[#333]">Ponto de venda:</span>
          <select value={d.outlet || ''} onChange={(e) => set('outlet', Number(e.target.value) || null)}
            className={`${inp} w-[280px]`} style={inputStyle}>
            <option value="">(todos)</option>
            {(outlets as any[]).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <label className="flex items-center gap-2 ml-4">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>
        </label>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Grelha hora × dia */}
        <div className="flex-1 overflow-auto">
          <table className="text-[12px] border-collapse select-none">
            <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
              <th className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5] w-[130px]">Hora</th>
              {DIAS.map((x) => <th key={x} className="font-normal px-4 py-1.5 border border-[#d5d5d5]">{x}</th>)}
            </tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s}>
                  <td className="px-2 py-1 border border-[#e5e5e5] whitespace-nowrap text-[#555]">{label(s)}</td>
                  {DIAS.map((_, dia) => {
                    const v = cells[`${dia}-${s}`];
                    const c = d.kind === 'PRICE' ? corDe(v) : null;
                    return (
                      <td key={dia}
                        onMouseDown={() => { setPainting(true); pinta(dia, s); }}
                        onMouseEnter={() => painting && pinta(dia, s)}
                        title={v ? (d.kind === 'PRICE' ? `Preço ${v}` : `-${v}%`) : 'Preço normal'}
                        className="border border-[#e5e5e5] cursor-pointer text-center"
                        style={{
                          minWidth: 74, height: 26,
                          background: v ? (c ? c.bg : '#ffd479') : '#fff',
                          color: c ? c.fg : '#333',
                        }}>
                        {v ? (d.kind === 'PRICE' ? '' : `-${v}%`) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paleta */}
        <div className="w-[220px] flex-shrink-0 border-l border-[#d5d5d5] bg-[#fafafa]">
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold text-[#333] border-b border-[#d0d0d0]">
            {d.kind === 'PRICE' ? 'Preço' : 'Desconto'}
          </div>
          {d.kind === 'PRICE' ? (
            NIVEIS.map((n) => (
              <button key={n.v} onClick={() => setBrush(n.v)}
                className={`w-full py-3 text-[13px] font-semibold border-b border-white ${brush === n.v ? 'ring-2 ring-inset ring-[#2b2b2b]' : ''}`}
                style={{ background: n.bg, color: n.fg }}>
                {n.label}
              </button>
            ))
          ) : (
            <div className="p-3 space-y-2">
              <div className="text-[11px] text-[#666]">Percentagem a aplicar nas horas pintadas:</div>
              <input type="number" value={brush} onChange={(e) => setBrush(Number(e.target.value))}
                className={`${inp} w-full`} style={inputStyle} />
              <button onClick={() => setBrush(0)} className="w-full py-2 bg-white border border-[#c8c8c8] text-[12px]">
                Limpar (preço normal)
              </button>
            </div>
          )}

          <div className="p-3 text-[11px] text-[#666] border-t border-[#e5e5e5] mt-2">
            Arraste sobre a grelha para pintar. <b>{Object.keys(cells).length}</b> hora(s) marcada(s).
            <div className="mt-2 pt-2 border-t border-[#eee]">
              Os níveis 1..5 são os <b>preços da ficha do artigo</b>. Sem preço nesse nível,
              o artigo mantém o preço normal.
            </div>
          </div>
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
