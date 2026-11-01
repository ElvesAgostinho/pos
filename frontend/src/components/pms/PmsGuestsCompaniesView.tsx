import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import EntityEditor from '../posconfig/EntityEditor';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { confirmar } from '../../ui/dialogo';

/**
 * HÓSPEDES & EMPRESAS — a lista, e a ficha COMPLETA do sistema.
 *
 * Hóspede e Empresa são o MESMO cadastro (`mdm.Customer`): uma Empresa é um
 * cliente marcado com o tipo de entidade "Empresa". Não há cadastro do PMS e
 * cadastro do POS — é a mesma tabela, servida por dois caminhos
 * (`mdm/customers/` e `pos/marketing/entities/`).
 *
 * ─── PORQUE É QUE O FORMULÁRIO CURTO SAIU ─────────────────────────────────
 * Este ecrã tinha um formulário próprio com nove campos: nome, e-mail,
 * telefone, nacionalidade, documento, data de nascimento, morada e notas. A
 * ficha a sério do sistema (`EntityEditor`) tem perfil, segmento e sub-segmento,
 * canal, cartão de membro, campos personalizados do hotel, documentos,
 * histórico de estadias e consumo no POS — e é a que o Check-In e a verificação
 * de duplicados já abriam.
 *
 * Resultado: a recepção preenchia um hóspede aqui, ficava-lhe a ficha pela
 * metade, e os campos que faltavam só apareciam noutro ecrã — se alguém se
 * lembrasse de lá ir. Duas portas para o mesmo registo, com perguntas
 * diferentes atrás de cada uma.
 *
 * Agora é a mesma ficha em todo o lado. O que fica aqui é o que este ecrã tem
 * de seu: a lista, a divisão entre Hóspedes e Empresas, e a escolha de qual
 * abrir.
 *
 * ─── E O CÓDIGO ───────────────────────────────────────────────────────────
 * O formulário antigo inventava o código no browser (`H` + a hora em base 36).
 * Dois registos gravados no mesmo milissegundo — dois cliques no botão, que é
 * o que toda a gente faz quando nada acontece à primeira — saíam com o MESMO
 * código, e o segundo rebentava com "já existe um registo com este código".
 * Quem numera agora é a ficha partilhada, num só sítio.
 */
export default function PmsGuestsCompaniesView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'guests' | 'companies'>('guests');
  const [selId, setSelId] = useState<number | null>(null);
  const [aEditar, setAEditar] = useState<any | null>(null);
  const [empresaTypeId, setEmpresaTypeId] = useState<number | null>(null);

  // O tipo de entidade "Empresa" — é ele que separa as duas abas. Se ainda não
  // existir nesta instalação, cria-se: sem ele a aba Empresas ficava vazia para
  // sempre e ninguém saberia porquê.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get('pos/config/customer-types/');
        const list: any[] = r.data?.results || r.data || [];
        const found = list.find((t: any) => (t.code || '').toUpperCase() === 'EMPRESA');
        if (found) { setEmpresaTypeId(found.id); return; }
        const created = await apiClient.post('pos/config/customer-types/', { code: 'EMPRESA', name: 'Empresa', for_pos: true });
        setEmpresaTypeId(created.data.id);
      } catch (e) { notifyError(e); }
    })();
  }, []);

  const { data, refetch } = useQuery({
    queryKey: ['mdm', 'customers', 'pms'],
    queryFn: async () => (await apiClient.get('mdm/customers/')).data,
  });
  const all: any[] = Array.isArray(data) ? data : data?.results || [];
  const rows = all.filter((c) => (tab === 'companies') === (!!empresaTypeId && c.entity_type === empresaTypeId));
  const escolhido = rows.find((r) => r.id === selId) || null;

  const trocarAba = (t: 'guests' | 'companies') => { setTab(t); setSelId(null); };

  /** Abre a ficha completa. Sem registo = ficha nova, já do lado certo. */
  const abrir = (r: any | null) => setAEditar(
    r || { name: '', entity_type: tab === 'companies' ? empresaTypeId : null },
  );

  const fechar = () => {
    setAEditar(null);
    refetch();
    qc.invalidateQueries({ queryKey: ['mdm'] });
  };

  const remove = async () => {
    if (!escolhido) return;
    if (!(await confirmar(`Eliminar "${escolhido.name}"?`))) return;
    try {
      await apiClient.delete(`mdm/customers/${escolhido.id}/`);
      setSelId(null);
      refetch();
      qc.invalidateQueries({ queryKey: ['mdm'] });
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex border-b" style={{ borderColor: '#C8C8C8', background: '#F0F0F0' }}>
        {(['guests', 'companies'] as const).map((t) => (
          <button key={t} onClick={() => trocarAba(t)}
            className="px-3 h-[22px] text-[11.5px]"
            style={{
              background: tab === t ? '#FFFFFF' : 'transparent',
              borderTop: `1px solid ${tab === t ? '#C8C8C8' : 'transparent'}`,
              borderLeft: `1px solid ${tab === t ? '#C8C8C8' : 'transparent'}`,
              borderRight: `1px solid ${tab === t ? '#C8C8C8' : 'transparent'}`,
              marginBottom: tab === t ? '-1px' : 0,
              fontWeight: tab === t ? 700 : 400,
              color: '#111827',
            }}>
            {t === 'guests' ? 'Hóspedes' : 'Empresas'}
          </button>
        ))}
      </div>

      {/* A LISTA OCUPA O ECRÃ TODO. Era metade, com o formulário curto na outra
          metade; a ficha agora abre por cima, e o espaço devolvido são mais de
          vinte linhas visíveis — numa lista que num hotel com movimento tem
          milhares. As colunas que sobraram são as que se procuram: o documento
          e o código, que antes não apareciam em lado nenhum da lista. */}
      <div className="flex-1 overflow-hidden">
        <ClassicGrid rowKey="id" data={rows} selectedRowId={selId}
          onRowClick={(r: any) => setSelId(r.id)}
          onRowDoubleClick={(r: any) => abrir(r)}
          columns={
            tab === 'guests'
              ? [
                  { header: 'Nome', accessor: 'name', width: '26%' },
                  { header: 'E-mail', accessor: 'email', width: '22%' },
                  { header: 'Telefone', accessor: 'phone', width: '14%' },
                  { header: 'Nacionalidade', accessor: 'nationality', width: '14%' },
                  { header: 'Nº documento', accessor: 'id_number', width: '14%' },
                  { header: 'Código', accessor: 'code', width: '10%' },
                ]
              : [
                  { header: 'Nome', accessor: 'name', width: '34%' },
                  { header: 'NIF', accessor: 'tax_id', width: '18%' },
                  { header: 'E-mail', accessor: 'email', width: '22%' },
                  { header: 'Telefone', accessor: 'phone', width: '16%' },
                  { header: 'Código', accessor: 'code', width: '10%' },
                ]
          } />
      </div>

      <Toolbar actions={[
        { label: tab === 'guests' ? 'Novo Hóspede' : 'Nova Empresa', icon: '＋', onClick: () => abrir(null) },
        { label: 'Abrir ficha', icon: '✎', onClick: () => escolhido && abrir(escolhido), disabled: !escolhido },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !escolhido, color: '#C0392B' },
      ]}
        right={<span style={{ color: '#6B7280' }}>Duplo clique numa linha abre a ficha.</span>} />

      {aEditar && <EntityEditor entity={aEditar} onClose={fechar} onSaved={fechar} />}
    </div>
  );
}
