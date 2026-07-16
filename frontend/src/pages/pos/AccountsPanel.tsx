import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import TouchKeyboard from './TouchKeyboard';

/**
 * CONTAS CORRENTES — as entidades e o que devem.
 *
 * No terminal serve duas coisas: ver quanto é que uma empresa já deve antes de lhe
 * deixar levar mais fiado, e ESCOLHER a entidade para a conta que se está a servir. Uma
 * entidade bloqueada aparece bloqueada — e o empregado não fica a saber disso só na hora
 * de cobrar, à frente do cliente.
 */
export default function AccountsPanel({ onPick, onClose }: {
  onPick?: (e: any) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  // NOVA ENTIDADE sem sair do terminal: a ficha é a MESMA do backoffice
  // (pos/marketing/entities → mdm.Customer) — e os CAMPOS OBRIGATÓRIOS vêm das
  // regras do backoffice (Pesquisa de Entidades › Campos obrigatórios). O terminal
  // pergunta o que o backoffice exige; o servidor continua a ser quem recusa.
  const [nova, setNova] = useState<any | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['pos-cc', busca],
    queryFn: async () => (await apiClient.get('pos/ops/current-accounts/',
      { params: { scope: 'ALL', q: busca || undefined } })).data,
  });

  // as regras (que campos são obrigatórios) e os tipos de entidade — do backoffice
  const { data: regras = [] } = useQuery({
    queryKey: ['pos-entity-rules'],
    queryFn: async () => {
      const r = await apiClient.get('pos/marketing/entity-rules/');
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: !!nova,
  });
  const { data: tiposEnt = [] } = useQuery({
    queryKey: ['pos-entity-types'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/customer-types/');
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: !!nova,
  });
  const obrig = new Set(regras.filter((r: any) => r.is_required).map((r: any) => r.field));
  // o catálogo dos campos — o MESMO do backoffice (EntityFieldRule.FIELDS)
  const CAMPOS: [string, string, string][] = [
    ['name', 'Nome', 'text'], ['last_name', 'Apelido', 'text'],
    ['other_names', 'Outros nomes', 'text'], ['tax_id', 'Nr. contribuinte', 'text'],
    ['id_number', 'Nr. de identificação', 'text'], ['email', 'E-mail', 'text'],
    ['phone', 'Telefone', 'text'], ['address', 'Morada', 'text'],
    ['country', 'País', 'text'], ['nationality', 'Nacionalidade', 'text'],
    ['birth_date', 'Data de nascimento', 'date'], ['entity_type', 'Tipo de entidade', 'select'],
  ];
  // mostram-se: os essenciais de sempre + TUDO o que o backoffice marcou obrigatório
  const BASE = new Set(['name', 'tax_id', 'phone', 'email']);
  const camposVisiveis = CAMPOS.filter(([k]) => BASE.has(k) || obrig.has(k));

  const gravarNova = async () => {
    // valida ANTES de enviar o que o backoffice marcou obrigatório — o servidor
    // recusaria na mesma; aqui o caixa vê logo O QUE falta, campo a campo.
    const faltam = camposVisiveis
      .filter(([k]) => (k === 'name' || obrig.has(k)) && !String(nova?.[k] ?? '').trim())
      .map(([, label]) => label);
    if (faltam.length) return alert('Campos obrigatórios em falta (regras do backoffice):\n· ' + faltam.join('\n· '));
    try {
      const body: any = { code: nova.code?.trim() || `CL${Date.now().toString().slice(-8)}`, is_active: true };
      for (const [k] of CAMPOS) {
        if (nova?.[k] !== undefined && String(nova[k]).trim() !== '') body[k] = nova[k];
      }
      const r = await apiClient.post('pos/marketing/entities/', body);
      setNova(null);
      await refetch();
      alert(`Entidade criada: ${r.data.name} (${r.data.code})`);
    } catch (e: any) {
      const d = e?.response?.data;
      alert(typeof d === 'object'
        ? Object.entries(d || {}).map(([k, v]) => `${k}: ${v}`).join('\n')
        : 'Não foi possível criar a entidade.');
    }
  };

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const linhas: any[] = data?.rows || [];

  return (
    <Window title="Contas Correntes — Entidades" width={1400} onClose={onClose}>
      <div className="flex flex-col" style={{ height: '62vh' }}>

        <div className="grid grid-cols-[1fr_150px_180px_180px_200px] bg-[#3a3a3a] text-white
          text-[17px] font-bold px-3 py-3">
          <span>Nome</span><span>Nr. contrib.</span><span>Contacto</span>
          <span className="text-right">Cash Advance</span>
          <span className="text-right">Saldo (Conta Corrente)</span>
        </div>

        <div className="flex-1 overflow-auto bg-[#1f1f1f] min-h-0">
          {linhas.map((e) => (
            <button key={e.id} onClick={() => setSel(e)}
              className={`w-full grid grid-cols-[1fr_150px_180px_180px_200px] px-3 py-2.5 text-left
                text-white text-[15px] border-b border-black/40
                ${sel?.id === e.id ? 'bg-[#0f8b8d]' : 'hover:bg-[#2b2b2b]'}`}>
              <span>
                {e.blocked && <span className="text-[#ff8a80] mr-2">⛔</span>}
                {e.name}
              </span>
              <span>{e.other || '—'}</span>
              <span>{e.contact || '—'}</span>
              <span className="text-right text-[#2ecc40]">{money(e.advance_balance)}</span>
              <span className={`text-right font-bold ${Number(e.cc_balance) > 0 ? 'text-[#ff8a80]' : ''}`}>
                {money(e.cc_balance)}
              </span>
            </button>
          ))}
          {linhas.length === 0 && (
            <div className="text-white/50 text-center py-12">Nenhuma entidade encontrada.</div>
          )}
        </div>

        <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => setBusca(texto)} />

        <div className="grid grid-cols-3 gap-1 p-1 bg-black">
          <button onClick={() => sel && onPick?.(sel)} disabled={!sel || !onPick}
            className="h-[64px] bg-[#1f1f1f] text-[#2ecc40] text-[18px] font-bold disabled:opacity-30">
            ✔ Selecionar
          </button>
          <button onClick={() => setNova({})}
            className="h-[64px] bg-[#1f1f1f] text-white text-[18px]">＋ Nova entidade</button>
          <button onClick={onClose}
            className="h-[64px] bg-[#1f1f1f] text-[#e02020] text-[18px] font-bold">✖ Cancelar</button>
        </div>
      </div>

      {/* NOVA ENTIDADE — a ficha do backoffice, com os CAMPOS OBRIGATÓRIOS das regras.
          Marcar "Nacionalidade obrigatória" no backoffice faz o campo aparecer AQUI
          com a estrela — o terminal pergunta o que o backoffice exige. */}
      {nova && (
        <Window title="Nova Entidade" width={480} onClose={() => setNova(null)} tone="#0f8b8d">
          <div className="p-3 bg-[#1a1a1a] flex flex-col gap-2 max-h-[70vh] overflow-auto">
            {camposVisiveis.map(([k, label, tipo]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-white/60 text-[13px]">
                  {label}{(k === 'name' || obrig.has(k)) && <span className="text-[#f0c000]"> *</span>}
                </span>
                {tipo === 'select' ? (
                  <select value={nova[k] || ''}
                    onChange={(e) => setNova({ ...nova, [k]: e.target.value })}
                    className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
                      focus:border-[#0f8b8d] outline-none text-[16px]">
                    <option value="">—</option>
                    {tiposEnt.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <input type={tipo} value={nova[k] || ''}
                    onChange={(e) => setNova({ ...nova, [k]: e.target.value })}
                    className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
                      focus:border-[#0f8b8d] outline-none text-[16px]" />
                )}
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="text-white/60 text-[13px]">Nr. cliente (vazio = automático)</span>
              <input value={nova.code || ''}
                onChange={(e) => setNova({ ...nova, code: e.target.value })}
                className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
                  focus:border-[#0f8b8d] outline-none text-[16px]" />
            </label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button onClick={gravarNova}
                className="h-[52px] bg-[#1f7a34] text-white font-bold rounded">✔ Criar</button>
              <button onClick={() => setNova(null)}
                className="h-[52px] bg-[#3a3a3a] text-white rounded">✖ Cancelar</button>
            </div>
          </div>
        </Window>
      )}
    </Window>
  );
}
