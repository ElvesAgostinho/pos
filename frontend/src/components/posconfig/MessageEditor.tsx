import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputCls, inputStyle, Box } from './kit';

/**
 * MENSAGEM DO POS — a pergunta que o terminal faz ao operador.
 *
 * Ex.: pede-se um GELADO → o POS pergunta o sabor, e os MODELOS são as respostas
 * possíveis (SABOR CHOCOLATE, SABOR BAUNILHA…). Cada resposta sai IMPRESSA na
 * comanda da impressora certa. É assim que a cozinha sabe o que fazer sem ter de
 * telefonar à sala.
 */
export default function MessageEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ sort_order: 0, is_message: true, is_comment: true, is_active: true, ask_on_add: false, items: [], options: [], ...row });

  // OS ARTIGOS que fazem esta pergunta. Vazio = todos.
  const { data: artigos = [] } = useQuery({
    queryKey: ['posc', 'itens-msg'],
    queryFn: async () => {
      const r = await apiClient.get('inventory/items/');
      return ((r.data?.results || r.data || []) as any[]).filter((i) => i.is_sold !== false);
    },
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/kitchen-messages/', d)
      : apiClient.patch(`pos/config/kitchen-messages/${row.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Mensagem gravada', message: 'O POS passa a fazer esta pergunta ao operador, e as respostas saem na comanda.' }); onClose(); },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const opts: any[] = d.options || [];
  const setOpt = (i: number, k: string, v: any) =>
    set('options', opts.map((o, j) => j === i ? { ...o, [k]: v } : o));
  // As opções gravavam-se em `key_label`/`print_label` — campos que NÃO EXISTEM no
  // modelo (que tem `code` e `text`). O servidor descartava-os em silêncio e a mensagem
  // ficava sempre sem respostas: no terminal aparecia a tecla e mais nada.
  const addOpt = () => set('options', [...opts, { code: '', text: '', sort_order: opts.length + 1, is_active: true }]);
  const delOpt = (i: number) => set('options', opts.filter((_, j) => j !== i));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Nova mensagem' : `A editar ${d.code}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Cabeçalho: código, ordem, tipo */}
        <Box title="Identificação" className="mb-4">
        <div className="flex items-center gap-6 pt-1.5 text-[13px]">
          <label className="flex items-center gap-3">
            <span className="w-[70px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="GELADO, TEMP, PONTO…" className={`${inputCls} w-[290px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3">
            <span className="text-[#333]">Ordem:</span>
            <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
              className={`${inputCls} w-[110px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!d.is_message} onChange={(e) => set('is_message', e.target.checked)} className="w-4 h-4" />
            Mensagem
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!d.is_comment} onChange={(e) => set('is_comment', e.target.checked)} className="w-4 h-4" />
            Comentário
          </label>
        </div>

        <div className="flex items-center gap-6 pt-2 text-[13px]">
          <label className="flex items-center gap-3">
            <span className="w-[70px] text-[#333]">Nome:</span>
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              placeholder="GELO, FRUTA, Confecao…"
              className={`${inputCls} w-[290px] flex-none`} style={inputStyle} />
          </label>
          {/* PERGUNTAR AO LANÇAR — a diferença entre perguntar com o cliente à frente
              e ter de voltar à mesa depois (ou mandar ao bar um pedido incompleto). */}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!d.ask_on_add} onChange={(e) => set('ask_on_add', e.target.checked)} className="w-4 h-4" />
            <b>Perguntar ao lançar o artigo</b>
          </label>
        </div>
        </Box>

        <div className="mb-4" style={{ border: '4px groove #c0c0c0' }}>
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#c0c0c0]">
            Artigos que fazem esta pergunta
            <span className="font-normal text-[#666] ml-2">
              (nenhum escolhido = todos os artigos)
            </span>
          </div>
          <div className="p-2 max-h-[190px] overflow-auto grid grid-cols-3 gap-x-4 gap-y-1">
            {artigos.map((a: any) => (
              <label key={a.id} className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" className="w-4 h-4"
                  checked={(d.items || []).includes(a.id)}
                  onChange={(e) => set('items', e.target.checked
                    ? [...(d.items || []), a.id]
                    : (d.items || []).filter((x: number) => x !== a.id))} />
                <span className="truncate">{a.name}</span>
              </label>
            ))}
            {artigos.length === 0 && <span className="text-[#999] text-[12px]">Sem artigos.</span>}
          </div>
          <div className="px-3 py-1.5 bg-[#f7f7f7] border-t border-[#e0e0e0] text-[11px] text-[#666]">
            "Com gelo?" num prato de bacalhau ensina o empregado a carregar em qualquer
            coisa para se ver livre da pergunta — e a partir daí deixa de as ler todas.
          </div>
        </div>

        {/* Modelos (respostas) */}
        <div style={{ border: '4px groove #c0c0c0' }}>
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#c0c0c0]">Modelos</div>
          <div className="flex">
            <table className="flex-1 text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#f4f4f4] text-[#333]">
                  {['Código', 'Texto (tecla e comanda)', 'Ordem', 'Ativo'].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                  ))}
                  <th className="w-[60px] border-b border-[#d0d0d0]" />
                </tr>
              </thead>
              <tbody>
                {opts.map((o, i) => (
                  <tr key={i} className="border-b border-[#eee]">
                    <td className="px-1 py-0.5 w-[140px]">
                      <input value={o.code || ''} onChange={(e) => setOpt(i, 'code', e.target.value.toUpperCase())}
                        placeholder="GELO1" className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px]" />
                    </td>
                    <td className="px-1 py-0.5">
                      <input value={o.text || ''} onChange={(e) => setOpt(i, 'text', e.target.value)}
                        placeholder="SEM GELO" className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px]" />
                    </td>
                    <td className="px-1 py-0.5 w-[80px]">
                      <input type="number" value={o.sort_order ?? 0} onChange={(e) => setOpt(i, 'sort_order', Number(e.target.value))}
                        className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px]" />
                    </td>
                    <td className="px-2 py-0.5 text-center w-[70px]">
                      <input type="checkbox" checked={o.is_active !== false}
                        onChange={(e) => setOpt(i, 'is_active', e.target.checked)} className="w-4 h-4" />
                    </td>
                    <td className="px-2 text-center">
                      <button onClick={() => delOpt(i)} className="text-red-600 font-bold text-[11px]">Apagar</button>
                    </td>
                  </tr>
                ))}
                {opts.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-[#999] py-8">Sem modelos. Carregue em "Adicionar".</td></tr>
                )}
              </tbody>
            </table>

            <div className="w-[150px] flex-shrink-0 border-l border-[#e0e0e0] p-2 space-y-2">
              <button onClick={addOpt} className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#f0f0f0] w-full px-1 py-1">
                <span className="w-6 h-6 rounded-full bg-[#18181B] text-white flex items-center justify-center text-[14px]">＋</span>
                Adicionar
              </button>
              <button onClick={() => opts.length && delOpt(opts.length - 1)} disabled={!opts.length}
                className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#f0f0f0] w-full px-1 py-1 disabled:opacity-35">
                <span className="w-6 h-6 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[14px]">−</span>
                Apagar
              </button>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[#666] mt-2">
          O <b>Texto</b> é o que o operador vê na tecla E o que sai na comanda da cozinha —
          é o mesmo, de propósito: o que o empregado escolheu tem de ser exatamente o que
          a cozinha lê.
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
