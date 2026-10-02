import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#C8D2D5] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#E4E9EB] px-1.5 py-1 text-[12px] bg-white';

/**
 * HORÁRIO-PERÍODO — a faixa horária (ex.: "08:01 as 10:00").
 *
 * É a unidade com que o sistema fala de tempo: os relatórios agrupam vendas por
 * faixa (para se saber a que horas a casa enche), o happy hour aplica-se a faixas,
 * e os turnos encaixam nelas. A COR é a que aparece nos gráficos.
 *
 * Uma faixa pode ter VÁRIOS intervalos — o almoço, por exemplo, corta a meio para
 * o serviço de esplanada.
 */
export default function TimeBandEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ color: '#4B858E', sort_order: 0, is_active: true, slots: [], ...row });
  const [sel, setSel] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/time-bands/', d)
      : apiClient.patch(`pos/config/time-bands/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Período gravado', message: 'Passa a valer nos relatórios, no happy hour e nos turnos.' });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const slots: any[] = d.slots || [];
  const setSlot = (i: number, k: string, v: any) => set('slots', slots.map((s, j) => j === i ? { ...s, [k]: v } : s));
  const addSlot = () => set('slots', [...slots, { time_from: '08:00', time_to: '10:00' }]);
  const delSlot = () => {
    if (sel === null) return;
    set('slots', slots.filter((_, j) => j !== sel));
    setSel(null);
  };

  // Aviso honesto: intervalos sobrepostos dão relatórios com vendas contadas duas vezes.
  const overlap = slots.some((a, i) => slots.some((b, j) =>
    i !== j && a.time_from < b.time_to && b.time_from < a.time_to));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F4F6F7] border-b border-[#E4E9EB]">
        <span className="text-[13px] font-bold text-[#1F292C]">{isNew ? 'Novo período' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#657377] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Identificação */}
        <div className="w-[52%] p-6 space-y-3 border-r border-[#E4E9EB]">
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#1F292C]">Código:<span className="text-[#C94A4A]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={`${inp} w-[290px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#1F292C]">Descrição:<span className="text-[#C94A4A]">*</span></span>
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="08:01 as 10:00"
              className={`${inp} w-[290px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#1F292C]">Cor:</span>
            <input type="color" value={d.color || '#4B858E'} onChange={(e) => set('color', e.target.value)}
              className="w-10 h-8 border border-[#C8D2D5]" />
            <input value={d.color || ''} onChange={(e) => set('color', e.target.value)}
              className={`${inp} w-[230px] font-mono`} style={{ ...inputStyle, background: d.color, color: '#FFFFFF' }} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#1F292C]">Ordem:</span>
            <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
              className={`${inp} w-[290px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-2 text-[13px] pt-1">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>

          <div className="text-[11px] text-[#657377] pt-3 border-t border-[#E4E9EB]">
            A cor é a que aparece nos gráficos de ocupação e nos relatórios por faixa horária.
          </div>
        </div>

        {/* Períodos */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-1.5 bg-[#F4F6F7] text-[13px] font-bold text-[#1F292C] border-b border-[#E4E9EB]">Períodos</div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-[#F4F6F7] text-[#1F292C]">
                  <th className="text-left font-normal px-3 py-1.5 border-b border-[#E4E9EB]">De</th>
                  <th className="text-left font-normal px-3 py-1.5 border-b border-[#E4E9EB]">Até</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s, i) => (
                  <tr key={i} onClick={() => setSel(i)}
                    className={`border-b border-[#E4E9EB] cursor-pointer ${sel === i ? 'bg-[#F4F6F7]' : 'hover:bg-[#FFFFFF]'}`}>
                    <td className="p-0.5"><input type="time" value={(s.time_from || '').slice(0, 5)} onChange={(e) => setSlot(i, 'time_from', e.target.value)} className={cell} /></td>
                    <td className="p-0.5"><input type="time" value={(s.time_to || '').slice(0, 5)} onChange={(e) => setSlot(i, 'time_to', e.target.value)} className={cell} /></td>
                  </tr>
                ))}
                {slots.length === 0 && (
                  <tr><td colSpan={2} className="text-center text-[#657377] py-8">Sem períodos. Carregue em "Adicionar".</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {overlap && (
            <div className="px-3 py-2 bg-[#F4F6F7] border-t border-[#C8D2D5] text-[11px] text-[#1F292C]">
              <b>Atenção:</b> há períodos sobrepostos. Nos relatórios, as vendas dessas horas
              seriam contadas duas vezes.
            </div>
          )}

          <div className="flex items-center gap-4 px-3 py-2 border-t border-[#E4E9EB] bg-[#F4F6F7]">
            <button onClick={addSlot} className="flex items-center gap-2 text-[13px] text-[#1F292C] hover:bg-[#F4F6F7] px-1 py-1">
              <span className="w-6 h-6 rounded-full bg-[#062F35] text-white flex items-center justify-center">＋</span> Adicionar
            </button>
            <span className="w-px h-6 bg-[#F4F6F7]" />
            <button onClick={delSlot} disabled={sel === null}
              className="flex items-center gap-2 text-[13px] text-[#1F292C] hover:bg-[#F4F6F7] px-1 py-1 disabled:opacity-35">
              <span className="w-6 h-6 rounded-full bg-[#C94A4A] text-white flex items-center justify-center">−</span> Apagar
            </button>
          </div>
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#062F35', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#C94A4A', onClick: onClose },
      ]} />
    </div>
  );
}
