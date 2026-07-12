import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

const BOTOES: [string, string, string][] = [
  ['PRODUCTION', 'Produção', 'O cozinheiro marca que começou a preparar.'],
  ['FINISHED', 'Finalizado', 'O prato está pronto — a sala é avisada.'],
  ['DELIVERED', 'Entregue', 'Saiu para a mesa.'],
  ['PRINT', 'Imprimir', 'Reimprime a comanda em papel.'],
];

const OPCOES: [string, string][] = [
  ['show_allergens', 'Mostrar alergénios em destaque'],
  ['show_timer', 'Mostrar o tempo desde que o pedido entrou'],
  ['alert_late', 'Marcar a vermelho os pedidos atrasados'],
  ['group_by_table', 'Agrupar por mesa (os pratos saem juntos)'],
  ['sound_on_new', 'Som quando entra um pedido novo'],
];

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[110px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * MONITOR DE COZINHA — o ecrã que o cozinheiro vê.
 *
 * A cozinha quente, o bar e a pastelaria não querem ver o mesmo. Cada monitor
 * escolhe o que mostra e que passos usa:
 *   · POR PEDIDO — vê-se a MESA inteira e manda-se tudo junto (é o certo: os pratos
 *     da mesma mesa têm de chegar ao mesmo tempo);
 *   · POR ARTIGO — cada prato solto, para postos de linha (só grelhados, por ex.).
 *
 * As impressoras marcadas aqui SUBSTITUEM as de origem do pedido.
 */
export default function KdsMonitorEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    kind: 'ORDER', station: 'KITCHEN', is_active: true,
    buttons: ['PRODUCTION', 'FINISHED', 'DELIVERED', 'PRINT'],
    options: { show_allergens: true, show_timer: true, alert_late: true, group_by_table: true },
    printer_ids: [], ...row,
  });

  const { data: printers = [] } = useQuery({
    queryKey: ['posc', 'printers'],
    queryFn: async () => (await apiClient.get('inventory/pos/printers/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/kds-monitors/', d)
      : apiClient.patch(`pos/config/kds-monitors/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      qc.invalidateQueries({ queryKey: ['kds'] });
      notifyGuide({
        title: 'Monitor gravado',
        message: 'O ecrã da cozinha passa a usar estes botões e estas opções — abra-o em Cozinha & Produção.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const bts: string[] = d.buttons || [];
  const opts: any = d.options || {};
  const pids: number[] = d.printer_ids || [];
  const toggleB = (b: string) => set('buttons', bts.includes(b) ? bts.filter((x) => x !== b) : [...bts, b]);
  const toggleP = (id: number) => set('printer_ids', pids.includes(id) ? pids.filter((x) => x !== id) : [...pids, id]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo monitor' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Esquerda */}
        <div className="w-[48%] p-4 space-y-2 overflow-auto border-r border-[#e0e0e0]">
          <Row label="Código:">
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} w-[280px]`} style={inputStyle} />
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Estação:">
            <select value={d.station} onChange={(e) => set('station', e.target.value)}
              className={`${inp} w-[280px]`} style={inputStyle}>
              <option value="KITCHEN">Cozinha</option>
              <option value="BAR">Bar</option>
              <option value="PASTRY">Pastelaria</option>
              <option value="CASHIER">Caixa</option>
            </select>
          </Row>
          <Row label="Tipo:">
            <select value={d.kind} onChange={(e) => set('kind', e.target.value)}
              className={`${inp} w-[280px]`} style={inputStyle}>
              <option value="ORDER">Por pedido</option>
              <option value="ITEM">Por artigo</option>
            </select>
          </Row>
          <div className="text-[11px] text-[#666] pl-[122px] -mt-1">
            {d.kind === 'ORDER'
              ? 'Vê-se a mesa inteira — os pratos saem juntos.'
              : 'Cada prato solto — para postos de linha.'}
          </div>

          <div className="pt-2">
            <div className="text-[12px] font-semibold text-[#333] mb-1">Botões:</div>
            <div className="border border-[#d5d5d5]">
              {BOTOES.map(([k, l, ajuda]) => (
                <label key={k} className="flex items-start gap-2 px-2 py-1.5 border-b border-[#eee] text-[12px] hover:bg-[#f7f9fb] cursor-pointer">
                  <input type="checkbox" checked={bts.includes(k)} onChange={() => toggleB(k)} className="w-4 h-4 mt-px" />
                  <span><b>{l}</b> <span className="text-[#888]">— {ajuda}</span></span>
                </label>
              ))}
            </div>
            {bts.length === 0 && (
              <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1 mt-1">
                Sem botões, o cozinheiro não consegue avançar nenhum pedido.
              </div>
            )}
          </div>

          <div className="pt-2">
            <div className="text-[12px] font-semibold text-[#333] mb-1">Opções:</div>
            <div className="border border-[#d5d5d5]">
              {OPCOES.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 px-2 py-1.5 border-b border-[#eee] text-[12px] hover:bg-[#f7f9fb] cursor-pointer">
                  <input type="checkbox" checked={!!opts[k]}
                    onChange={(e) => set('options', { ...opts, [k]: e.target.checked })} className="w-4 h-4" />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Direita */}
        <div className="flex-1 p-4 space-y-3 overflow-auto">
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>

          <Row label="Cabeçalho - Texto:">
            <input value={d.header_text || ''} onChange={(e) => set('header_text', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Cabeçalho - Imagem:">
            <input value={d.header_image_url || ''} onChange={(e) => set('header_image_url', e.target.value)}
              placeholder="(nenhum)" className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Rodapé - Avisos:">
            <input value={d.footer_notifications || ''} onChange={(e) => set('footer_notifications', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>

          <div className="border border-[#c8c8c8] mt-3">
            <div className="px-3 py-1.5 bg-[#dbe7f3] text-[12px] font-bold text-[#1a4f8a] border-b border-[#c8c8c8]">
              Impressoras — as ativas substituem as de origem do pedido
            </div>
            <table className="w-full text-[12px] border-collapse">
              <thead><tr className="bg-[#f4f4f4]">
                <th className="w-[60px] font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Ativo</th>
                <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Código</th>
                <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Descrição</th>
                <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Aparelho</th>
              </tr></thead>
              <tbody>
                {(printers as any[]).map((p) => (
                  <tr key={p.id} onClick={() => toggleP(p.id)}
                    className={`border-b border-[#eee] cursor-pointer ${pids.includes(p.id) ? 'bg-[#e8f5e9]' : 'hover:bg-[#f5f9ff]'}`}>
                    <td className="text-center py-1.5">
                      <GridCheck checked={pids.includes(p.id)} onChange={() => toggleP(p.id)} />
                    </td>
                    <td className="px-2 py-1.5">{p.code}</td>
                    <td className="px-2 py-1.5">{p.name}</td>
                    <td className="px-2 py-1.5">
                      {p.device_name || <span className="text-[#c0392b]">sem aparelho</span>}
                    </td>
                  </tr>
                ))}
                {(printers as any[]).length === 0 && (
                  <tr><td colSpan={4} className="text-center text-[#999] py-6">Sem impressoras.</td></tr>
                )}
              </tbody>
            </table>
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
