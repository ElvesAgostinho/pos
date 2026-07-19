import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import TouchKeyboard from './TouchKeyboard';
import { IcoVisto, IcoCruz, IcoLupa, IcoLimpar } from './Icons';
import { aviso } from '../../ui/dialogo';

/**
 * DADOS DE IDENTIFICAÇÃO — quem leva a fatura, escrito no terminal.
 *
 * Serve dois casos que parecem um só:
 *   PROCURAR — o cliente já existe no ficheiro; escreve-se o NIF (ou o nome) e ele aparece
 *   REGISTAR — é a primeira vez; regista-se aqui e fica no ficheiro da casa
 *
 * A ficha é a MESMA do backoffice (mdm.Customer). Não há um cadastro do restaurante e
 * outro da faturação: o NIF que aqui se escreve é o que sai impresso na fatura, e o
 * consumo desta conta entra no histórico dessa entidade. Dois cadastros separados dão
 * sempre a mesma discussão no fim do mês — "mas este cliente não é o mesmo?".
 *
 * O NIF é o campo que importa: sem ele, a fatura sai a Consumidor Final e a empresa do
 * cliente não a pode deduzir. É por isso que ele está em cima, destacado.
 */
export default function CustomerIdForm({ onPick, onClose }: {
  onPick: (entidade: any) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<any>({ country: 'Angola', tax_id: '', name: '', last_name: '',
    address: '', postal_code: '', city: '', email: '', entity_type: '' });
  const [campo, setCampo] = useState<string>('tax_id');   // o campo que o teclado escreve
  const [aProcurar, setAProcurar] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: tipos = [] } = useQuery({
    queryKey: ['pos-entity-types'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/config/customer-types/');
        return (r.data?.results || r.data || []) as any[];
      } catch { return []; }
    },
  });

  // PROCURAR no ficheiro — por NIF ou por nome, conforme o que estiver escrito.
  const { data: achados = [] } = useQuery({
    queryKey: ['pos-cid-busca', d.tax_id, d.name, aProcurar],
    queryFn: async () => {
      const termo = (d.tax_id || d.name || '').trim();
      if (!termo) return [];
      const r = await apiClient.get('pos/marketing/entities/', { params: { q: termo } });
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: aProcurar && !!(d.tax_id || d.name),
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));

  const gravar = async () => {
    if (!String(d.name || '').trim()) return aviso('O NOME é obrigatório para registar a entidade.');
    setBusy(true);
    try {
      const corpo: any = {
        name: [d.name, d.last_name].filter(Boolean).join(' ').trim(),
        tax_id: d.tax_id || null, address: d.address || null,
        postal_code: d.postal_code || null, city: d.city || null,
        email: d.email || null, country: d.country || null,
        ...(d.entity_type ? { entity_type: d.entity_type } : {}),
      };
      const r = await apiClient.post('pos/marketing/entities/', corpo);
      onPick(r.data);
    } catch (e: any) {
      aviso(e?.response?.data?.detail
        || Object.entries(e?.response?.data || {}).map(([k, v]) => `${k}: ${v}`).join('\n')
        || 'Não foi possível registar a entidade.');
    } finally { setBusy(false); }
  };

  const Campo = ({ k, label, largura = 'flex-1' }: { k: string; label: string; largura?: string }) => (
    <div className={`flex items-stretch ${largura}`}>
      <span className="w-[120px] flex-shrink-0 flex items-center px-3 text-white text-[15px] font-bold">
        {label}
      </span>
      <button onClick={() => setCampo(k)}
        className={`flex-1 min-w-0 text-left px-3 text-white text-[16px] truncate border-2
          ${campo === k ? 'bg-[#6e6e6e] border-[#f0c000]' : 'bg-[#8a8a8a]/60 border-black'}`}>
        {d[k] || <span className="text-white/35">—</span>}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-4 z-[60]" onClick={onClose}>
      <div className="w-[1400px] max-w-[97vw] max-h-[95vh] bg-[#2b2b2b] border-2 border-black
        shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>

        <div className="h-[60px] bg-gradient-to-b from-[#3a3a3a] to-[#2b2b2b] border-b-2 border-black
          flex items-center px-5 flex-shrink-0">
          <span className="text-white text-[24px] font-bold">Dados de identificação</span>
          <span className="ml-auto text-white text-[20px] font-bold">Novo perfil</span>
        </div>

        {/* linha de cima: país · NIF · tipo de entidade */}
        <div className="flex items-stretch gap-1 p-1 h-[62px] flex-shrink-0">
          <div className="w-[240px] bg-gradient-to-b from-[#4a4a4a] to-[#262626] border-2 border-black
            flex items-center justify-center text-white text-[19px] font-bold">{d.country}</div>
          <button onClick={() => setCampo('tax_id')}
            className={`w-[190px] border-2 border-black text-[17px] font-bold
              ${campo === 'tax_id' ? 'bg-[#d4ac00] text-white' : 'bg-[#3a3a3a] text-white/80'}`}>
            Nr. contrib.
          </button>
          <button onClick={() => setCampo('tax_id')}
            className="flex-1 min-w-0 bg-[#8a8a8a]/60 border-2 border-black text-left px-4
              text-white text-[18px] truncate">
            {d.tax_id || <span className="text-white/35">—</span>}
          </button>
          <select value={d.entity_type} onChange={(e) => set('entity_type', e.target.value)}
            className="w-[300px] bg-[#3a3a3a] border-2 border-black text-white text-[16px] px-3">
            <option value="">Tipo de entidade</option>
            {tipos.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* a ficha */}
        <div className="px-1 space-y-1 flex-shrink-0">
          <div className="flex gap-1 h-[54px]">
            <Campo k="last_name" label="Apelido" />
            <Campo k="name" label="Nome" />
          </div>
          <div className="flex gap-1 h-[54px]"><Campo k="address" label="Morada" /></div>
          <div className="flex gap-1 h-[54px]">
            <Campo k="postal_code" label="Cód. postal" />
            <Campo k="city" label="Cidade" />
          </div>
          <div className="flex gap-1 h-[54px]"><Campo k="email" label="E-mail" /></div>
        </div>

        {/* RESULTADOS da procura — antes de registar de novo, mostra-se quem já existe.
            Registar outra vez o mesmo cliente é o que faz o histórico dele partir-se em
            dois e o "gasto acumulado" mentir. */}
        {aProcurar && (
          <div className="mx-1 mt-1 border-2 border-black bg-[#1f1f1f] max-h-[150px] overflow-auto flex-shrink-0">
            {achados.length === 0 && (
              <div className="p-3 text-white/55 text-[15px]">
                Ninguém no ficheiro com esse NIF ou nome — pode registar de novo.
              </div>
            )}
            {achados.map((e: any) => (
              <button key={e.id} onClick={() => onPick(e)}
                className="w-full flex gap-4 px-4 py-2.5 text-left text-white text-[16px]
                  border-b border-black/50 hover:bg-white/10">
                <span className="w-[130px] flex-shrink-0 text-white/60">{e.tax_id || '(sem NIF)'}</span>
                <span className="flex-1 truncate font-semibold">{e.name}</span>
                <span className="w-[140px] truncate text-white/60">{e.city || ''}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto p-1">
          <TouchKeyboard valor={d[campo] || ''} setValor={(v) => set(campo, v)} onOk={gravar} />
        </div>

        <div className="grid grid-cols-5 gap-1 p-1 bg-black flex-shrink-0">
          <BotaoRodape onClick={gravar} cor="#2ecc40" titulo="Registar e usar nesta conta">
            <IcoVisto size={30} />
          </BotaoRodape>
          <BotaoRodape onClick={() => { setCampo('name'); setAProcurar(true); }} cor="#ffffff"
            titulo="Procurar no ficheiro pelo nome">
            <IcoLupa size={28} />
          </BotaoRodape>
          <BotaoRodape onClick={() => { setCampo('tax_id'); setAProcurar(true); }} cor="#ffffff"
            titulo="Procurar no ficheiro pelo Nr. contribuinte">
            <span className="flex items-center gap-2"><IcoLupa size={26} />
              <span className="text-[15px] font-semibold">Nr. contrib.</span></span>
          </BotaoRodape>
          <BotaoRodape onClick={() => { setD({ country: 'Angola', tax_id: '', name: '', last_name: '',
            address: '', postal_code: '', city: '', email: '', entity_type: '' }); setAProcurar(false); }}
            cor="#ffffff" titulo="Limpar a ficha">
            <IcoLimpar size={28} />
          </BotaoRodape>
          <BotaoRodape onClick={onClose} cor="#e02020" titulo="Fechar sem gravar">
            <IcoCruz size={30} />
          </BotaoRodape>
        </div>
        {busy && <div className="absolute inset-0 bg-black/40" />}
      </div>
    </div>
  );
}

const BotaoRodape = ({ children, onClick, cor, titulo }: {
  children: any; onClick: () => void; cor: string; titulo: string;
}) => (
  <button onClick={onClick} title={titulo} style={{ color: cor }}
    className="h-[64px] flex items-center justify-center rounded-[3px] border-2 border-black
      bg-gradient-to-b from-[#4a4a4a] to-[#242424]
      shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
      active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
    {children}
  </button>
);
