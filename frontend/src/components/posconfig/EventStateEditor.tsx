import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-start gap-3 text-[12px]">
      <span className="w-[120px] flex-shrink-0 text-[#333] pt-1">{label}</span>
      {children}
    </label>
  );
}

/**
 * ESTADO DA RESERVA DE EVENTO — e a sua COR no planning.
 *
 * A cor não é enfeite: é o que o comercial lê num planning com 40 salas. Azul =
 * Opção (ainda se pode vender a quem confirmar); vermelho = perdido.
 *
 * O ESTADO EQUIVALENTE diz ao motor como tratar um estado inventado pelo hotel:
 * "Pré-reserva de casamento" equivale a Opção — logo, NÃO bloqueia o espaço.
 * É esse campo que evita salões dados como ocupados que ninguém pagou.
 */
export default function EventStateEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    is_active: true, is_system: false, is_auto_reservation: false, sort_order: 0,
    bg_color: '#1a4f8a', text_color: '#ffffff', equivalent: '', ...row,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/event-states/', d)
      : apiClient.patch(`pos/config/event-states/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Estado gravado',
        message: 'A cor passa a valer no planning, e o estado equivalente decide se o espaço fica bloqueado.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const bloqueia = ['NORMAL', 'CHECKIN', 'PENDING'].includes(d.equivalent);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo estado' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-10 items-start max-w-[1000px]">
          <div className="space-y-2">
            <Row label="Código:">
              <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                disabled={d.is_system && !isNew}
                className={`${inp} w-[290px] disabled:bg-[#f0f0f0] disabled:text-[#666]`} style={inputStyle} />
            </Row>
            <Row label="Descrição:">
              <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
                className={`${inp} w-[290px]`} style={inputStyle} />
            </Row>
            <Row label="Estado equivalente:">
              <div>
                <select value={d.equivalent || ''} onChange={(e) => set('equivalent', e.target.value)}
                  className={`${inp} w-[290px]`} style={inputStyle}>
                  <option value="">Nenhum</option>
                  <option value="NORMAL">Normal</option>
                  <option value="OPTION">Opção</option>
                  <option value="WAITLIST">Lista de Espera</option>
                  <option value="PENDING">Pendente</option>
                  <option value="CANCELLED">Cancelamento</option>
                  <option value="NOSHOW">No-show</option>
                  <option value="CHECKIN">Check-in</option>
                  <option value="CHECKOUT">Check-out</option>
                </select>
                <div className={`text-[11px] mt-1 max-w-[290px] ${bloqueia ? 'text-[#a01818]' : 'text-[#1f7a34]'}`}>
                  {bloqueia
                    ? 'Este estado BLOQUEIA o espaço — a sala sai do mercado.'
                    : 'Este estado NÃO bloqueia o espaço — a sala continua a poder ser vendida.'}
                </div>
              </div>
            </Row>
            <Row label="Chave do Texto:">
              <input value={d.text_key || ''} onChange={(e) => set('text_key', e.target.value)}
                className={`${inp} w-[290px]`} style={inputStyle} />
            </Row>

            <Row label="Cor de Fundo:">
              <div className="flex items-center gap-2">
                <input type="color" value={d.bg_color || '#1a4f8a'}
                  onChange={(e) => set('bg_color', e.target.value)} className="w-10 h-8 border border-[#8a95a3]" />
                <input value={d.bg_color || ''} onChange={(e) => set('bg_color', e.target.value)}
                  className={`${inp} w-[130px] font-mono`} style={inputStyle} />
              </div>
            </Row>
            <Row label="Cor do texto:">
              <div className="flex items-center gap-2">
                <input type="color" value={d.text_color || '#ffffff'}
                  onChange={(e) => set('text_color', e.target.value)} className="w-10 h-8 border border-[#8a95a3]" />
                <input value={d.text_color || ''} onChange={(e) => set('text_color', e.target.value)}
                  className={`${inp} w-[130px] font-mono`} style={inputStyle} />
              </div>
            </Row>

            <Row label="Como fica:">
              <div className="px-6 py-2 text-[13px] font-bold text-center min-w-[200px]"
                style={{ background: d.bg_color, color: d.text_color }}>
                {d.name || 'Estado'}
              </div>
            </Row>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_system} onChange={(e) => set('is_system', e.target.checked)} className="w-4 h-4" />
              Sistema
              <span className="text-[11px] text-[#888]">— o motor precisa dele; não se apaga</span>
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
              Ativo
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_auto_reservation}
                onChange={(e) => set('is_auto_reservation', e.target.checked)} className="w-4 h-4" />
              Para Reservas Automáticas (Pendente, Cancelamento)
            </label>

            <Row label="Ordenar:">
              <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
                className={`${inp} w-[130px]`} style={inputStyle} />
            </Row>
            <Row label="Observações:">
              <textarea value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={5}
                className={`${inp} w-[360px]`} style={inputStyle} />
            </Row>
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
