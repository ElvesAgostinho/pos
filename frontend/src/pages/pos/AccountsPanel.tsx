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
  // (pos/marketing/entities → mdm.Customer) — cria-se aqui o essencial e o
  // resto completa-se na Configuração POS quando houver calma.
  const [nova, setNova] = useState<any | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['pos-cc', busca],
    queryFn: async () => (await apiClient.get('pos/ops/current-accounts/',
      { params: { scope: 'ALL', q: busca || undefined } })).data,
  });

  const gravarNova = async () => {
    if (!nova?.name?.trim()) return alert('O nome é obrigatório.');
    try {
      const r = await apiClient.post('pos/marketing/entities/', {
        code: nova.code?.trim() || `CL${Date.now().toString().slice(-8)}`,
        name: nova.name.trim(),
        tax_id: nova.tax_id?.trim() || null,
        phone: nova.phone?.trim() || null,
        email: nova.email?.trim() || null,
        is_active: true,
      });
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

      {/* NOVA ENTIDADE — a mesma ficha do backoffice, o essencial sem sair do terminal */}
      {nova && (
        <Window title="Nova Entidade" width={460} onClose={() => setNova(null)} tone="#0f8b8d">
          <div className="p-3 bg-[#1a1a1a] flex flex-col gap-2">
            {[['name', 'Nome *'], ['tax_id', 'NIF'], ['phone', 'Telefone'], ['email', 'E-mail'],
              ['code', 'Nr. cliente (vazio = automático)']].map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-white/60 text-[13px]">{label}</span>
                <input value={nova[k] || ''}
                  onChange={(e) => setNova({ ...nova, [k]: e.target.value })}
                  className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
                    focus:border-[#0f8b8d] outline-none text-[16px]" />
              </label>
            ))}
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
