import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

/**
 * HORÁRIO — junta FAIXAS HORÁRIAS a DIAS DA SEMANA.
 *
 * "Happy Hour de Verão" = faixa 16:01-19:00, de segunda a sexta. É o que o motor de
 * promoções e os turnos consultam para saber se estão em vigor neste momento.
 */
export default function ScheduleEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ is_active: true, lines: [], ...row });

  const { data: bands = [] } = useQuery({
    queryKey: ['posc', 'bands'],
    queryFn: async () => (await apiClient.get('pos/config/time-bands/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/schedules/', d)
      : apiClient.patch(`pos/config/schedules/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Horário gravado', message: 'Passa a valer nas promoções (happy hour) e nos turnos.' });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const lines: any[] = d.lines || [];
  const has = (wd: number, band: number) => lines.some((l) => l.weekday === wd && l.band === band);
  const toggle = (wd: number, band: number) => set('lines', has(wd, band)
    ? lines.filter((l) => !(l.weekday === wd && l.band === band))
    : [...lines, { weekday: wd, band }]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo horário' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="p-4 space-y-2 border-b border-[#e0e0e0]">
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[90px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
          <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={`${inp} w-[290px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[90px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
          <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Happy Hour de Verão"
            className={`${inp} w-[420px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
          Ativo
        </label>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="text-[12px] text-[#666] mb-2">
          Marque em que <b>dias</b> cada <b>faixa horária</b> está em vigor.
        </div>
        <table className="text-[12px] border-collapse">
          <thead>
            <tr className="bg-[#f0f0f0]">
              <th className="text-left px-2 py-1.5 border border-[#d5d5d5] font-normal">Faixa horária</th>
              {DAYS.map((x) => <th key={x} className="px-3 py-1.5 border border-[#d5d5d5] font-normal">{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {bands.map((b: any) => (
              <tr key={b.id} className="border-b border-[#eee]">
                <td className="px-2 py-1.5 border border-[#eee] whitespace-nowrap">
                  <span className="inline-block w-4 h-4 mr-2 align-middle" style={{ background: b.color }} />
                  {b.code} · {b.name}
                </td>
                {DAYS.map((_, wd) => (
                  <td key={wd} className="text-center border border-[#eee]">
                    <input type="checkbox" checked={has(wd, b.id)} onChange={() => toggle(wd, b.id)} className="w-4 h-4" />
                  </td>
                ))}
              </tr>
            ))}
            {bands.length === 0 && (
              <tr><td colSpan={8} className="text-center text-[#999] py-8">
                Sem faixas horárias — crie-as primeiro em "Horários - Períodos".
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
