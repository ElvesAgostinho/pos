import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

/**
 * IMPOSTO — a taxa que sai na fatura. É a MESMA que o motor fiscal usa (não há
 * um cadastro paralelo "para o POS"): mexer aqui muda o IVA do documento.
 *
 * A taxa tem VERSÕES com validade porque o IVA muda por lei. Uma fatura de Março
 * tem de continuar a ser recalculada com a taxa de Março — não com a de hoje.
 * Se a taxa fosse um número único que alguém reescreve, o histórico ficava
 * corrompido e o SAF-T deixava de bater certo com o que foi cobrado.
 */
export default function TaxEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ is_active: true, tax_type: 'IVA', percentage: 0, versions: [], ...row });
  const [sel, setSel] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/taxes/', d)
      : apiClient.patch(`pos/config/taxes/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Imposto gravado',
        message: 'É esta a taxa que sai na fatura e no SAF-T. As faturas antigas mantêm a taxa que estava em vigor nessa data.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const vs: any[] = d.versions || [];
  const setV = (i: number, k: string, v: any) => set('versions', vs.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const addV = () => set('versions', [...vs, {
    valid_from: new Date().toISOString().slice(0, 10), valid_to: null, percentage: d.percentage || 0,
  }]);
  const delV = () => {
    if (sel === null) return;
    set('versions', vs.filter((_, j) => j !== sel));
    setSel(null);
  };

  // Aviso honesto: períodos sobrepostos = duas taxas válidas no mesmo dia.
  const overlap = vs.some((a, i) => vs.some((b, j) =>
    i !== j && a.valid_from && b.valid_from &&
    a.valid_from <= (b.valid_to || '9999-12-31') && b.valid_from <= (a.valid_to || '9999-12-31')));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo imposto' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2 max-w-[860px]">
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[160px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} w-[290px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[160px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[160px] text-[#333]">Conta de Contabilidade:</span>
            <input value={d.accounting_account || ''} onChange={(e) => set('accounting_account', e.target.value)}
              placeholder="34.3.1 (IVA liquidado)" className={`${inp} w-[290px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[160px] text-[#333]">Classe IVA:</span>
            <input value={d.tax_class || ''} onChange={(e) => set('tax_class', e.target.value)}
              placeholder="NOR · RED · ISE (SAF-T)" className={`${inp} w-[290px]`} style={inputStyle} />
          </label>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_default} onChange={(e) => set('is_default', e.target.checked)} className="w-4 h-4" />
              Taxa por defeito
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_exempt} onChange={(e) => set('is_exempt', e.target.checked)} className="w-4 h-4" />
              Isenta (exige motivo de isenção na linha)
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
              Ativo
            </label>
          </div>
        </div>

        {/* Versões com validade */}
        <div className="flex mt-4 max-w-[860px] border border-[#c8c8c8]">
          <div className="flex-1">
            <table className="w-full text-[12px] border-collapse">
              <thead><tr className="bg-[#f0f0f0]">
                <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Válido de</th>
                <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Válido até</th>
                <th className="text-right font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Valor</th>
              </tr></thead>
              <tbody>
                {vs.map((v, i) => (
                  <tr key={i} onClick={() => setSel(i)}
                    className={`border-b border-[#eee] cursor-pointer ${sel === i ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                    <td className="p-0.5"><input type="date" value={(v.valid_from || '').slice(0, 10)}
                      onChange={(e) => setV(i, 'valid_from', e.target.value)} className={cell} /></td>
                    <td className="p-0.5"><input type="date" value={(v.valid_to || '').slice(0, 10)}
                      onChange={(e) => setV(i, 'valid_to', e.target.value || null)} className={cell} /></td>
                    <td className="p-0.5"><input type="number" step="any" value={v.percentage ?? 0}
                      onChange={(e) => setV(i, 'percentage', e.target.value)} className={`${cell} text-right`} /></td>
                  </tr>
                ))}
                {vs.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-[#999] py-10">
                    Sem períodos. Carregue em "Adicionar" para datar a taxa.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="w-[160px] bg-[#f4f4f4] border-l border-[#d5d5d5] py-2">
            <button onClick={addV} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[#e8e8e8]">
              <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
            </button>
            <button onClick={delV} disabled={sel === null}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[#e8e8e8] disabled:opacity-35">
              <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Apagar
            </button>
          </div>
        </div>

        {overlap && (
          <div className="max-w-[860px] mt-2 px-3 py-2 bg-[#fff7e6] border border-[#e0c080] text-[11px] text-[#8a6100]">
            <b>Atenção:</b> há períodos sobrepostos — duas taxas válidas no mesmo dia.
            O sistema usa a mais recente, mas isto costuma ser um erro de datas.
          </div>
        )}

        <div className="max-w-[860px] mt-2 text-[11px] text-[#666]">
          Em vigor hoje: <b>{d.current_rate ?? d.percentage}%</b>. Datar a taxa é o que
          permite que uma fatura de Março continue a ser recalculada com a taxa de Março.
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
