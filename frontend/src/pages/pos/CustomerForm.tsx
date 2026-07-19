import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import EntityPicker from './EntityPicker';
import { aviso } from '../../ui/dialogo';
import { IcoCruz, IcoVisto } from './Icons';

/**
 * OS DADOS DO CLIENTE DA CONTA — o formulário muda com o TIPO (parâmetro 8175):
 *
 *   PASSANTE — nome e NIF, OPCIONAIS: quem quer fatura com contribuinte dá os dados,
 *     quem não quer sai como Consumidor Final. Também se pode escolher uma ENTIDADE
 *     da ficha (empresa, cliente habitual) — é o mesmo cadastro do backoffice.
 *
 *   CONSUMO INTERNO — não é venda, é CUSTO: pergunta-se QUE COLABORADOR consumiu,
 *     da lista de Recursos Humanos do backoffice. Sem nome, o custo do staff
 *     desaparece dentro da receita e ninguém sabe quem comeu o quê.
 *
 * (O HÓSPEDE tem o seu próprio seletor — a lista de check-ins do PMS.)
 * Tudo grava pelo MESMO set_customer do motor; a fatura leva o que aqui se puser.
 */
export default function CustomerForm({ conta, onSaved, onClose }: {
  conta: any; onSaved: () => void; onClose: () => void;
}) {
  const interno = conta?.guest_type === 'INTERNO';
  const [nome, setNome] = useState(conta?.customer_name || '');
  const [nif, setNif] = useState(conta?.customer_tax_id || '');
  const [escolherEntidade, setEscolherEntidade] = useState(false);

  // CONSUMO INTERNO: os colaboradores vêm dos Recursos Humanos do backoffice.
  const { data: colabs = [] } = useQuery({
    queryKey: ['pos-hr'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/human-resources/');
      return ((r.data?.results || r.data || []) as any[]).filter((c) => c.is_active);
    },
    enabled: interno,
  });

  const gravar = async (dados: any) => {
    try {
      await apiClient.post(`pos/tickets/${conta.id}/set_customer/`, dados);
      onSaved();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível gravar os dados.');
    }
  };

  if (interno) {
    return (
      <Window title="Consumo Interno — quem consome?" width={520} onClose={onClose} tone="#8a6100">
        <div className="flex flex-col bg-[#1a1a1a]" style={{ maxHeight: '60vh' }}>
          <div className="px-4 py-2 text-white/60 text-[13px] bg-[#242424]">
            O consumo interno é CUSTO da casa — fica em nome do colaborador
            (Recursos Humanos do backoffice), ao preço que a ficha do operador mandar.
          </div>
          <div className="flex-1 overflow-auto">
            {colabs.map((c: any) => (
              <button key={c.id}
                onClick={() => gravar({ customer_name: c.full_name || `${c.first_name} ${c.last_name || ''}`.trim(),
                                        company_name: 'Consumo Interno' })}
                className="w-full flex justify-between px-4 py-3 text-left text-white text-[15px]
                  border-b border-black/30 hover:bg-[#8a6100]/40 active:bg-[#8a6100]">
                <span>{c.full_name || c.first_name}</span>
                <span className="text-white/50 text-[13px]">{c.code}</span>
              </button>
            ))}
            {colabs.length === 0 && (
              <div className="text-white/50 text-center py-8 px-6 text-[14px]">
                Sem colaboradores ativos — crie-os em Configuração POS › Recursos Humanos.
              </div>
            )}
          </div>
        </div>
      </Window>
    );
  }

  // PASSANTE: nome/NIF opcionais para a fatura — ou uma entidade da ficha
  return (
    <Window title="Dados do cliente (para a fatura)" width={460} onClose={onClose} tone="#0f8b8d">
      <div className="p-3 bg-[#1a1a1a] flex flex-col gap-2">
        <div className="text-white/60 text-[13px]">
          Opcional: sem dados, a fatura sai <b>Consumidor Final</b>. Com NIF, sai em nome do cliente.
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-white/60 text-[13px]">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)}
            className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
              focus:border-[#0f8b8d] outline-none text-[16px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-white/60 text-[13px]">NIF (contribuinte)</span>
          <input value={nif} onChange={(e) => setNif(e.target.value)}
            className="h-[44px] bg-[#2b2b2b] text-white px-3 rounded border border-[#3a3a3a]
              focus:border-[#0f8b8d] outline-none text-[16px]" />
        </label>
        <button onClick={() => setEscolherEntidade(true)}
          className="h-[44px] bg-[#2b2b2b] text-white/80 rounded text-[14px] border border-[#3a3a3a]">
          … ou escolher uma ENTIDADE da ficha (empresas, clientes habituais)
        </button>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <button onClick={() => gravar({ customer_name: nome.trim() || null, customer_tax_id: nif.trim() || null })}
            className="h-[52px] bg-[#1f7a34] text-white font-bold rounded"><span className="inline-flex items-center gap-2"><IcoVisto size={24} />Gravar</span></button>
          <button onClick={onClose}
            className="h-[52px] bg-[#3a3a3a] text-white rounded"><span className="inline-flex items-center gap-2"><IcoCruz size={24} />Fechar</span></button>
        </div>
      </div>

      {escolherEntidade && (
        <EntityPicker
          onPick={(e) => gravar({ customer_name: e.name, customer_tax_id: e.tax_id, customer_id: e.id })}
          onCancel={() => setEscolherEntidade(false)} />
      )}
    </Window>
  );
}
