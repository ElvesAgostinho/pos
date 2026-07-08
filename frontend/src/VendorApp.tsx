import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import CatalogView from './components/VendorPortal/CatalogView';
import PlansView from './components/VendorPortal/PlansView';
import LicensesView from './components/VendorPortal/LicensesView';
import { Settings, Users, FolderTree, LogOut, LayoutGrid } from 'lucide-react';

const VendorApp: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/vendor', label: 'Catálogo de Módulos', icon: FolderTree },
    { path: '/vendor/plans', label: 'Planos Comerciais', icon: LayoutGrid },
    { path: '/vendor/licenses', label: 'Emissão de Licenças', icon: Users },
  ];

  const activeMeta = navItems.find(i => i.path === location.pathname) || navItems[0];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white font-sans text-xs">
      
      {/* Vendor Topbar */}
      <div className="flex items-center justify-between bg-[#333333] text-white h-10 px-4 text-sm font-sans select-none relative z-50 shrink-0">
        <div className="flex items-center space-x-6">
          <div className="flex items-center text-white font-bold text-xl tracking-tight leading-none">
            <div className="flex flex-col">
              <div><span className="text-[#90c040]">10i</span> host</div>
              <div className="text-[8px] font-normal text-gray-400 tracking-widest mt-[-2px]">Vendor HQ</div>
            </div>
          </div>
          <div className="flex space-x-2 text-gray-300">
            <div className="flex items-center cursor-pointer px-3 py-1 text-sm bg-[#555] text-white">
              Licensing <span className="text-[#f1c40f] text-[8px] ml-1.5">▼</span>
            </div>
            <div className="flex items-center cursor-pointer px-3 py-1 text-sm hover:bg-[#444]">
              Utilitários <span className="text-[#f1c40f] text-[8px] ml-1.5">▼</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3 text-gray-300 text-[11px]">
          <span className="text-red-400 font-semibold">| Super Admin |</span>
          <div className="flex items-center space-x-1 cursor-pointer">
            <a href="/login" className="hover:text-white flex items-center space-x-1 text-gray-300">
               <LogOut size={12} />
               <span>Sair</span>
            </a>
          </div>
        </div>
      </div>

      {/* Vendor TitleBar */}
      <div className="flex items-center justify-between bg-[#4d4d4d] h-7 px-2 select-none border-b border-[#333] shrink-0">
        <div className="flex items-center text-white text-[12px] font-medium">
          <ActiveIcon size={14} className="mr-2" />
          {activeMeta.label}
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-5 h-5 flex items-center justify-center hover:bg-[#666] cursor-pointer text-white">
            <div className="w-2.5 h-0.5 bg-white mb-[-8px]"></div>
          </div>
          <div className="w-5 h-5 flex items-center justify-center hover:bg-[#666] cursor-pointer text-white">
            <div className="w-2.5 h-2.5 border border-white"></div>
          </div>
          <div className="w-5 h-5 flex items-center justify-center hover:bg-red-600 hover:text-white cursor-pointer text-[#ffaaaa]">
            <span className="font-bold text-[10px]">X</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Vendor Sidebar */}
        <div className="w-[280px] bg-[#f0f0f0] border-r border-[#a0a0a0] flex flex-col text-[11px] font-sans select-none overflow-y-auto shrink-0">
          <div className="mb-0">
            <div className="flex items-center px-2 py-1 bg-[#f0f0f0] border-b border-[#d0d0d0] border-t border-t-[#ffffff] cursor-pointer hover:bg-[#e8e8e8]">
              <span className="mr-2 text-gray-500 font-monospace text-xs w-3 text-center">-</span>
              <span className="text-[#333333] text-[11px] flex-1 font-medium">Licensing Engine</span>
            </div>
            
            <div className="py-0 bg-white">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path} 
                    to={item.path}
                    className={`flex items-center px-6 py-1 cursor-pointer border-b border-transparent ${isActive ? 'bg-[#cce8ff] border-b-[#99ccff]' : 'hover:bg-[#f5f5f5]'}`}
                  >
                    <div className="w-1 h-1 rounded-full bg-gray-600 mr-2"></div>
                    <span className={isActive ? 'text-black font-medium' : 'text-gray-800'}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Vendor Content Area */}
        <div className="flex-1 overflow-hidden bg-[#e6e6e6]">
          <Routes>
            <Route path="/" element={<CatalogView />} />
            <Route path="/plans" element={<PlansView />} />
            <Route path="/licenses" element={<LicensesView />} />
          </Routes>
        </div>
        
      </div>

      {/* Vendor StatusBar */}
      <div className="bg-[#2d2d2d] text-[#b0b0b0] h-7 flex items-center justify-between px-2 text-[10px] select-none border-t border-black shrink-0">
        <div className="flex items-center h-full space-x-0.5">
          <div className="flex items-center px-2 py-1 h-full max-w-[150px] cursor-pointer bg-[#404040] text-white border-t-2 border-white">
            <ActiveIcon size={12} className="mr-1.5 flex-shrink-0" />
            <span className="truncate">{activeMeta.label}</span>
          </div>
        </div>
        <div className="flex items-center flex-shrink-0">
          <span>HOST 10.0.2506092 RGPD | Vendor HQ Engine | </span>
          <span className="ml-1 bg-white text-black px-1 font-bold">HQ</span>
        </div>
      </div>

    </div>
  );
};

export default VendorApp;
