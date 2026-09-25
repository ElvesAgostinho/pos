import SimpleSection from '../posconfig/SimpleSection';
import MemberCardEditor from '../posconfig/MemberCardEditor';

/** Gestão de Pontos (PMS → Marketing) — não há mecanismo de pontos próprio do
    PMS: o motor real de fidelização já existe no POS (pos.MemberCard, `has_points`)
    e é reutilizado tal e qual aqui, mesmo endpoint (`pos/config/member-cards/`),
    mesmo editor (MemberCardEditor) — só com a moldura do PMS à volta, exatamente
    como a Configuração POS já apresenta esta secção em `c_members`. */
export default function PmsMemberCardsView() {
  return (
    <SimpleSection title="Cartão de Membro" queryKey="pms-membercards" endpoint="pos/config/member-cards/"
      columns={[
        { key: 'code', label: 'Código', width: '13%' },
        { key: 'name', label: 'Descrição', width: '20%' },
        { key: 'packages_label', label: 'Packages', width: '13%' },
        { key: 'has_credit', label: 'Crédito', width: '10%', toggle: true },
        { key: 'has_debit', label: 'Débito', width: '10%', toggle: true },
        { key: 'has_points', label: 'Pontos', width: '10%', toggle: true },
        { key: 'has_discount', label: 'Desconto', width: '10%', toggle: true },
        { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
      ]}
      fields={[]}
      renderEditor={(row, close) => <MemberCardEditor row={row} onClose={close} />} />
  );
}
