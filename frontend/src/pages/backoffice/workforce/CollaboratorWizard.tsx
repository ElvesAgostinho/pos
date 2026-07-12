import React, { useState, useEffect } from 'react';
import { apiClient as axios } from '../../../api/client';
import { User, Save, X } from 'lucide-react';
import ClassicWindow from '../../../components/ui/ClassicWindow';
import ClassicButton from '../../../components/ui/ClassicButton';

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

const CollaboratorWizard: React.FC<Props> = ({ onComplete, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    code: `COL-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    email: '',
    nif: '',
    address: '',
    department_id: '',
    job_title: '',
    profile_id: '',
    
    create_erp_account: false,
    erp_username: '',
    erp_password: '',
    
    create_pos_operator: true,
    pos_name: '',
    pos_pin: '',
    allowed_workstations: [] as number[],
    
    send_email: false
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [deps, profs, terms] = await Promise.all([
          axios.get('http://localhost:8000/api/workforce/departments/'),
          axios.get('http://localhost:8000/api/workforce/profiles/'),
          axios.get('http://localhost:8000/api/workforce/workstations/')
        ]);
        setDepartments(deps.data);
        setProfiles(profs.data);
        setTerminals(terms.data);
      } catch (e) {
        console.error("Error loading wizard metadata", e);
      }
    };
    loadData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const toggleTerminal = (id: number) => {
    setFormData(prev => ({
      ...prev,
      allowed_workstations: prev.allowed_workstations.includes(id)
        ? prev.allowed_workstations.filter(t => t !== id)
        : [...prev.allowed_workstations, id]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('http://localhost:8000/api/workforce/onboarding/', formData);
      onComplete();
    } catch (e) {
      console.error(e);
      alert("Erro ao criar colaborador. Verifique a consola.");
      setLoading(false);
    }
  };

  return (
    <ClassicWindow 
      title="Ficha de Colaborador"
      icon={<User size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Save} label={loading ? "A Gravar..." : "Gravar"} onClick={handleSubmit as any} disabled={loading} />
          </div>
          <div className="flex items-center">
            <ClassicButton icon={X} label="Cancelar" onClick={onCancel} />
          </div>
        </>
      }
    >
      <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
        <form onSubmit={handleSubmit} className="text-[11px] grid grid-cols-1 gap-4 max-w-2xl">
          
          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação</h3>
            <div className="grid grid-cols-1 gap-y-2">
              <div className="flex items-center">
                <label className="w-32 font-bold">Código</label>
                <input readOnly name="code" value={formData.code} className="flex-1 border border-[#a0a0a0] p-1 bg-[#eeeeee]" />
              </div>
              <div className="flex items-center">
                <label className="w-32 font-bold">Nome *</label>
                <input required name="name" value={formData.name} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
              </div>
              <div className="flex items-center">
                <label className="w-32 font-bold">Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
              </div>
              <div className="flex items-center">
                <label className="w-32 font-bold">NIF</label>
                <input name="nif" value={formData.nif} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
              </div>
              <div className="flex items-center">
                <label className="w-32 font-bold">Departamento</label>
                <select name="department_id" value={formData.department_id} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                  <option value="">(Nenhum)</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex items-center">
                <label className="w-32 font-bold">Cargo</label>
                <input name="job_title" value={formData.job_title} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
              </div>
            </div>
          </div>

          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Acesso ao Sistema (ERP)</h3>
            <div className="flex items-center mb-2">
              <input type="checkbox" name="create_erp_account" checked={formData.create_erp_account} onChange={handleChange} className="mr-2" />
              <label className="font-bold">Criar Conta no Backoffice</label>
            </div>
            {formData.create_erp_account && (
              <div className="grid grid-cols-1 gap-y-2 pl-6">
                <div className="flex items-center">
                  <label className="w-32">Username *</label>
                  <input required={formData.create_erp_account} name="erp_username" value={formData.erp_username} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32">Password *</label>
                  <input required={formData.create_erp_account} type="password" name="erp_password" value={formData.erp_password} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center mt-1">
                  <label className="w-32 font-bold">Perfil / Grupo</label>
                  <select name="profile_id" value={formData.profile_id} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-[#ffffe0]">
                    <option value="">(Selecione)</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Acesso POS (Frente de Loja)</h3>
            <div className="flex items-center mb-2">
              <input type="checkbox" name="create_pos_operator" checked={formData.create_pos_operator} onChange={handleChange} className="mr-2" />
              <label className="font-bold">É Operador de POS</label>
            </div>
            {formData.create_pos_operator && (
              <div className="grid grid-cols-1 gap-y-2 pl-6">
                <div className="flex items-center">
                  <label className="w-32">Nome no Talão *</label>
                  <input required={formData.create_pos_operator} name="pos_name" value={formData.pos_name} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32">PIN (Tátil) *</label>
                  <input required={formData.create_pos_operator} type="password" maxLength={6} name="pos_pin" value={formData.pos_pin} onChange={handleChange} className="w-24 border border-[#a0a0a0] p-1 focus:outline-none text-center tracking-widest" />
                </div>
                
                <div className="mt-2">
                  <label className="font-bold block mb-1 border-b border-gray-200">Terminais Autorizados:</label>
                  <div className="max-h-24 overflow-y-auto border border-[#a0a0a0] p-1 bg-white">
                    {terminals.map(t => (
                      <div key={t.id} className="flex items-center p-1 hover:bg-blue-50 cursor-pointer" onClick={() => toggleTerminal(t.id)}>
                        <input type="checkbox" checked={formData.allowed_workstations.includes(t.id)} readOnly className="mr-2" />
                        <span>{t.name} (IP: {t.ip_address || 'N/A'})</span>
                      </div>
                    ))}
                    {terminals.length === 0 && <span className="text-gray-500 italic">Sem terminais configurados.</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

        </form>
      </div>
    </ClassicWindow>
  );
};

export default CollaboratorWizard;
