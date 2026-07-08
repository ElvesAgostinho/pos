import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [property, setProperty] = useState('Hotel 3J');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login attempt:', { property, username, password });
    // This will hook into the actual auth mechanism in the future
    navigate('/backoffice');
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Left side: Background Image & Branding */}
      <div className="hidden lg:flex w-2/3 relative bg-gray-900">
        <img 
          src="https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1470&auto=format&fit=crop" 
          alt="Hotel Lobby" 
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        
        {/* Left Side Overlay Content */}
        <div className="absolute bottom-0 left-0 w-full p-8 flex flex-col justify-end">
          <div className="mb-16 max-w-lg text-white">
            <h1 className="text-5xl font-bold mb-4 tracking-tight">SYSTEM MWANA LODGE</h1>
            <p className="text-xl font-light opacity-90 tracking-widest">SOFTWARE HOTELARIA & RESTAURAÇÃO</p>
          </div>
          
          <div className="flex space-x-8 text-white opacity-90 items-center font-semibold text-lg">
            <div className="flex items-center space-x-2">
               <span className="w-2 h-8 bg-white block"></span><span>PMS</span>
            </div>
            <div className="flex items-center space-x-2">
               <span className="w-2 h-8 bg-white block"></span><span>POS</span>
            </div>
            <div className="flex items-center space-x-2">
               <span className="w-2 h-8 bg-white block"></span><span>WSS</span>
            </div>
            <div className="flex items-center space-x-2">
               <span className="w-2 h-8 bg-white block"></span><span>EMS</span>
            </div>
            <div className="flex items-center space-x-2">
               <span className="w-2 h-8 bg-white block"></span><span>GXP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="w-full lg:w-1/3 bg-white flex flex-col justify-center px-12 py-8 shadow-2xl z-10">
        
        {/* Logo Area */}
        <div className="flex flex-col items-center mb-12">
          <img src="/logo.png" alt="System Mwana Lodge Logo" className="h-20 object-contain mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight text-center">SYSTEM MWANA LODGE</h2>
          <p className="text-xs text-gray-500 uppercase tracking-widest mt-1 text-center">Gestão Inteligente, Experiência Excecional</p>
        </div>

        <form onSubmit={handleLogin} className="w-full max-w-sm mx-auto space-y-5">
          
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Property</label>
            <div className="relative">
              <select 
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3f66] focus:border-[#1e3f66] appearance-none bg-white text-gray-800"
              >
                <option value="Mwana Lodge">System Mwana Lodge</option>
                <option value="Mwana Lodge - Resort">Mwana Lodge - Resort</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Username</label>
            <input 
              type="text" 
              placeholder="Type your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3f66] focus:border-[#1e3f66] placeholder-gray-300 text-gray-800"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Password</label>
            <input 
              type="password" 
              placeholder="Type your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1e3f66] focus:border-[#1e3f66] placeholder-gray-300 text-gray-800"
            />
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              className="w-full bg-[#1e3f66] hover:bg-[#16304a] text-white font-medium py-3 px-4 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-[#1e3f66] focus:ring-opacity-50 transition-colors text-lg"
            >
              Login
            </button>
          </div>
          
          <div className="text-center pt-2">
             <a href="#" className="text-sm text-[#1e3f66] hover:text-[#16304a] hover:underline transition-colors">Password Recovery</a>
          </div>
        </form>
        
        {/* Footer info simulation */}
        <div className="mt-auto pt-8 text-[10px] text-gray-400 text-center">
            24cf_gl100228 - master | ffc44a0fe0b3d4cl6a70157dd3a7ab7deb06a752 | 2026-02-09 16:41:12 +0000
        </div>
      </div>
    </div>
  );
};

export default CustomerLogin;
