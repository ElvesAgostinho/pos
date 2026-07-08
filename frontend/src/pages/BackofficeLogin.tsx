import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';

const BackofficeLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login
    navigate('/backoffice/dashboard'); // To be created
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col justify-center items-center p-4">
      <button 
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={16} className="mr-1" /> Voltar ao Seletor
      </button>

      <div className="w-full max-w-md bg-white rounded shadow-md overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-blue-800 to-blue-600 p-6 text-center text-white">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">Backoffice Portal</h1>
          <p className="text-blue-100 text-sm opacity-90 mt-1">Acesso Administrativo</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Empresa / Grupo</label>
            <select className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
              <option>Grupo Pestana</option>
              <option>SANA Hotels</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Hotel</label>
            <select className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
              <option>Pestana Luanda</option>
              <option>Pestana Benguela</option>
            </select>
          </div>

          <hr className="border-gray-100" />

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Utilizador / Email</label>
            <input 
              type="text" 
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="Ex: admin@hotel.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Palavra-passe</label>
            <input 
              type="password" 
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center text-xs text-gray-600">
              <input type="checkbox" className="mr-2" /> Lembrar utilizador
            </label>
            <a href="#" className="text-xs text-blue-600 hover:underline">Recuperar acesso</a>
          </div>

          <button 
            type="submit"
            className="w-full py-2.5 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition-colors mt-4"
          >
            Entrar no Backoffice
          </button>
        </form>
      </div>
      
      <div className="mt-8 text-xs text-gray-400">
        Hospitality ERP v1.0 • Backoffice
      </div>
    </div>
  );
};

export default BackofficeLogin;
