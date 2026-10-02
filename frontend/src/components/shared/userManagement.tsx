import SimpleSection from '../posconfig/SimpleSection';
import UserGroupEditor from '../posconfig/UserGroupEditor';
import UserEditor from '../posconfig/UserEditor';
import HRResourceEditor from '../posconfig/HRResourceEditor';

/**
 * GESTÃO DE UTILIZADORES — partilhada por todos os módulos.
 *
 * Os módulos vendem-se separados: há clientes que compram só o POS, outros só
 * o PMS, outros os dois. Quem usa o sistema, porém, é a MESMA pessoa — o
 * recepcionista que lança um consumo no quarto é o mesmo que abre a conta no
 * restaurante. Ter um cadastro de pessoas por módulo seria pedir ao hotel que
 * criasse cada empregado duas vezes, com duas senhas, e que se lembrasse de o
 * despedir nos dois sítios.
 *
 * Por isso estes quatro ecrãs vivem AQUI, fora de `posconfig/` e fora de
 * `pms/`: são os mesmos componentes, os mesmos endpoints e os mesmos dados,
 * montados tanto na Configuração POS como no PMS. Mudar uma coluna muda-a nos
 * dois sítios porque é literalmente o mesmo código — não há cópia que possa
 * divergir.
 *
 * Porque é que os endpoints começam por `pos/config/`: é onde as tabelas
 * nasceram e onde continuam. Mudá-los de sítio obrigaria a uma migração de
 * dados em instalações que já estão a funcionar, sem ganho nenhum — o que
 * importa para a independência dos módulos é que as tabelas existam sempre
 * (entram no esquema mesmo sem licença do POS — ver `settings.py`) e que os
 * endpoints não exijam licença do POS para responder (pedem só sessão
 * iniciada). Uma instalação só com PMS gere os seus utilizadores por aqui sem
 * ter um único ecrã de POS ligado.
 */

export function GruposDeUtilizadores() {
  return (
    <SimpleSection title="Grupo de Utilizadores" queryKey="ugroups" endpoint="pos/config/user-groups/"
      columns={[
        { key: 'code', label: 'Código', width: '22%' },
        { key: 'name', label: 'Descrição', width: '34%' },
        { key: 'memo', label: 'Memo', width: '22%' },
        { key: 'rights_count', label: 'Permissões', width: '12%' },
        { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
      ]}
      fields={[]}
      renderEditor={(row, close) => <UserGroupEditor row={row} onClose={close} />} />
  );
}

export function Utilizadores() {
  return (
    <SimpleSection title="Utilizador" queryKey="posusers" endpoint="pos/config/users/"
      columns={[
        { key: 'number', label: 'Nr', width: '6%' },
        { key: 'code', label: 'Código', width: '13%' },
        { key: 'first_name', label: 'Nome', width: '13%' },
        { key: 'last_name', label: 'Apelido', width: '13%' },
        { key: 'group_name', label: 'Grupo', width: '15%' },
        { key: 'section', label: 'Secção', width: '12%' },
        // "Entra no sistema": diz se esta pessoa tem credenciais para iniciar
        // sessão (no PMS, no backoffice, no terminal). Sem esta coluna, um
        // utilizador criado sem senha ficava com ar de estar pronto e não
        // conseguia entrar em lado nenhum — e ninguém percebia porquê.
        { key: 'has_login', label: 'Entra no sistema', width: '12%', toggle: true },
        { key: 'internal_consumption', label: 'Consumo interno', width: '9%', toggle: true },
        { key: 'is_blocked', label: 'Bloqueado', width: '7%', toggle: true },
      ]}
      fields={[]}
      renderEditor={(row, close) => <UserEditor row={row} onClose={close} />} />
  );
}

export function TiposRH() {
  return (
    <SimpleSection title="Tipo R.H." queryKey="hrtypes" endpoint="pos/config/hr-types/"
      columns={[
        { key: 'code', label: 'Código', width: '30%' },
        { key: 'name', label: 'Descrição', width: '45%' },
        { key: 'resources_count', label: 'Pessoas', width: '12%' },
        { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
      ]}
      fields={[
        { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
        { key: 'name', label: 'Descrição:', required: true, width: 'w-[600px]' },
        { key: 'notes', label: 'Observações:', type: 'textarea', width: 'w-[600px]' },
        { key: 'is_active', label: 'Ativo', type: 'checkbox' },
      ]} />
  );
}

export function RecursosHumanos() {
  return (
    <SimpleSection title="Recurso Humano" queryKey="hr" endpoint="pos/config/human-resources/"
      columns={[
        { key: 'code', label: 'Código', width: '16%' },
        { key: 'full_name', label: 'Descrição', width: '30%' },
        { key: 'type_name', label: 'Tipo', width: '22%' },
        { key: 'sort_order', label: 'Ordem', width: '10%' },
        { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
      ]}
      fields={[]}
      renderEditor={(row, close) => <HRResourceEditor row={row} onClose={close} />} />
  );
}
