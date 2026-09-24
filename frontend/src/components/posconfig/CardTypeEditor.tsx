import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#7FA9B1] px-2 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[110px] flex-shrink-0 text-[#06333C]">{label}</span>
      {children}
    </label>
  );
}

/**
 * TIPO DE CARTÃO — como se LÊ o cartão que o cliente encosta ao leitor.
 *
 * Um leitor de banda magnética não devolve o número: devolve a pista em bruto,
 * assim → ;6034567890123456?
 *
 * O ";" é a marca inicial (start sentinel) e o "?" a final — são do leitor, não
 * fazem parte do número. A POSIÇÃO diz que pedaço do meio é o número (a pista às
 * vezes traz mais coisas: validade, código do clube).
 *
 * Sem isto, o sistema guardava a pista inteira como se fosse o número — e o mesmo
 * cartão deixava de ser reconhecido no dia seguinte.
 */
export default function CardTypeEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    is_active: true, card_kind: 'MAGNETIC', length: 0, pos_start: 0, pos_end: 0, ...row,
  });
  const [raw, setRaw] = useState(';6034567890123456?');
  const [resultado, setResultado] = useState<any>(null);

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/card-types/', d)
      : apiClient.patch(`pos/config/card-types/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Tipo de cartão gravado',
        message: 'O POS passa a saber ler este cartão — e a rejeitar os que não são deste tipo.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const testar = useMutation({
    mutationFn: () => apiClient.post(`pos/config/card-types/${row.id}/test_read/`, { raw }),
    onSuccess: (r: any) => setResultado(r.data),
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F7FAFA] border-b border-[#EEF4F5]">
        <span className="text-[13px] font-bold text-[#06333C]">
          {isNew ? 'Novo tipo de cartão' : `A editar ${d.name}`}
        </span>
        <button onClick={onClose} className="text-[16px] text-[#5C8891] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-[820px] space-y-2">
          <Row label="Ativo:">
            <input type="checkbox" checked={!!d.is_active}
              onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
          </Row>
          <Row label="Código:">
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} w-[290px]`} style={inputStyle} />
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Tipo:">
            <select value={d.card_kind} onChange={(e) => set('card_kind', e.target.value)}
              className={`${inp} w-[290px]`} style={inputStyle}>
              <option value="MAGNETIC">Banda magnética</option>
              <option value="RFID">RFID / Contactless</option>
              <option value="BARCODE">Código de barras</option>
              <option value="QR">QR Code</option>
              <option value="MANUAL">Manual</option>
            </select>
          </Row>
          <Row label="Tamanho:">
            <input type="number" value={d.length ?? 0} onChange={(e) => set('length', Number(e.target.value))}
              className={`${inp} w-[130px]`} style={inputStyle} />
            <span className="text-[11px] text-[#5C8891]">
              nº de dígitos do número. 0 = não confere o tamanho.
            </span>
          </Row>

          {/* Detalhes da pista */}
          <fieldset className="border border-[#CFE3E6] mt-3">
            <legend className="px-2 py-1 bg-[#F7FAFA] text-[12px] font-bold text-[#0B4F5C] w-full">
              Detalhes da Pista
            </legend>
            <div className="flex items-center gap-6 p-3">
              <label className="flex items-center gap-3 text-[12px]">
                <span className="w-[110px] text-[#06333C]">Start Sentinel:</span>
                <input value={d.start_sentinel || ''} maxLength={4}
                  onChange={(e) => set('start_sentinel', e.target.value)}
                  placeholder=";" className={`${inp} w-[130px] font-mono`} style={inputStyle} />
              </label>
              <label className="flex items-center gap-3 text-[12px]">
                <span className="text-[#06333C]">End Sentinel:</span>
                <input value={d.end_sentinel || ''} maxLength={4}
                  onChange={(e) => set('end_sentinel', e.target.value)}
                  placeholder="?" className={`${inp} w-[130px] font-mono`} style={inputStyle} />
              </label>
            </div>
          </fieldset>

          {/* Posição */}
          <fieldset className="border border-[#CFE3E6]">
            <legend className="px-2 py-1 bg-[#F7FAFA] text-[12px] font-bold text-[#0B4F5C] w-full">
              Posição
            </legend>
            <div className="flex items-center gap-6 p-3">
              <label className="flex items-center gap-3 text-[12px]">
                <span className="w-[110px] text-[#06333C]">Início:</span>
                <input type="number" value={d.pos_start ?? 0}
                  onChange={(e) => set('pos_start', Number(e.target.value))}
                  className={`${inp} w-[130px]`} style={inputStyle} />
              </label>
              <label className="flex items-center gap-3 text-[12px]">
                <span className="text-[#06333C]">Fim:</span>
                <input type="number" value={d.pos_end ?? 0}
                  onChange={(e) => set('pos_end', Number(e.target.value))}
                  className={`${inp} w-[130px]`} style={inputStyle} />
              </label>
              <span className="text-[11px] text-[#5C8891]">0 e 0 = usar a pista toda</span>
            </div>
          </fieldset>

          {/* Testar a leitura */}
          <fieldset className="border border-[#CFE3E6] mt-3">
            <legend className="px-2 py-1 bg-[#F7FAFA] text-[12px] font-bold text-[#0B4F5C] w-full">
              Testar a leitura
            </legend>
            <div className="p-3 space-y-2">
              <div className="text-[11px] text-[#5C8891]">
                Encoste o cartão ao leitor com o cursor na caixa (ou cole o que ele devolveu)
                e veja que número sai. É o que evita instalar às cegas.
              </div>
              <div className="flex items-center gap-3">
                <input value={raw} onChange={(e) => setRaw(e.target.value)}
                  className={`${inp} flex-1 font-mono`} style={inputStyle} />
                <button onClick={() => testar.mutate()} disabled={isNew}
                  className="px-4 py-1.5 bg-[#062A31] text-white text-[12px] font-semibold disabled:opacity-40">
                  {testar.isPending ? 'A ler…' : 'Ler'}
                </button>
              </div>
              {isNew && (
                <div className="text-[11px] text-[#0B4F5C]">Grave primeiro — depois pode testar.</div>
              )}
              {resultado && (
                <div className={`text-[12px] px-3 py-2 border ${resultado.ok
                  ? 'bg-[#F7FAFA] border-[#CFE3E6] text-[#0B4F5C]'
                  : 'bg-[#F7FAFA] border-[#B0392B] text-[#B0392B]'}`}>
                  {resultado.ok
                    ? <>Número lido: <b className="font-mono text-[14px]">{resultado.number}</b></>
                    : resultado.detail}
                </div>
              )}
            </div>
          </fieldset>
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#0B4F5C', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#B0392B', onClick: onClose },
      ]} />
    </div>
  );
}
