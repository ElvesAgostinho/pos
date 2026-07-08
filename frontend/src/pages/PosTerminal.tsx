import React, { useState, useEffect } from 'react';
import { ShoppingBag, X, User, Clock, CreditCard, Printer, Shield, Trash2, Tag, ChevronLeft, ChevronRight } from 'lucide-react';

interface OrderLine {
  id: string;
  name: string;
  qty: number;
  price: number;
}

export default function PosTerminal() {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Mock Data
  const categories = ['BEBIDAS', 'ENTRADAS', 'CARNES', 'PEIXES', 'SOBREMESAS', 'CAFETARIA'];
  const products = [
    { id: '1', name: 'Bitoque de Vaca', price: 12.50, category: 'CARNES', color: '#8B0000' },
    { id: '2', name: 'Prego no Prato', price: 10.00, category: 'CARNES', color: '#8B0000' },
    { id: '3', name: 'Bacalhau à Brás', price: 14.00, category: 'PEIXES', color: '#00008B' },
    { id: '4', name: 'Salmão Grelhado', price: 15.50, category: 'PEIXES', color: '#00008B' },
    { id: '5', name: 'Sopa do Dia', price: 2.50, category: 'ENTRADAS', color: '#006400' },
    { id: '6', name: 'Pão e Azeitonas', price: 1.50, category: 'ENTRADAS', color: '#006400' },
    { id: '7', name: 'Coca-Cola', price: 2.00, category: 'BEBIDAS', color: '#2F4F4F' },
    { id: '8', name: 'Cerveja Fina', price: 1.50, category: 'BEBIDAS', color: '#2F4F4F' },
    { id: '9', name: 'Caipirinha', price: 6.00, category: 'BEBIDAS', color: '#2F4F4F' },
    { id: '10', name: 'Água 0.5L', price: 1.20, category: 'BEBIDAS', color: '#2F4F4F' },
    { id: '11', name: 'Pudim Flan', price: 3.50, category: 'SOBREMESAS', color: '#D2691E' },
    { id: '12', name: 'Mousse Choc', price: 3.50, category: 'SOBREMESAS', color: '#D2691E' },
    { id: '13', name: 'Café Expresso', price: 0.80, category: 'CAFETARIA', color: '#4B0082' },
    { id: '14', name: 'Meia de Leite', price: 1.20, category: 'CAFETARIA', color: '#4B0082' },
    { id: '15', name: 'Polvo à Lagareiro', price: 18.00, category: 'PEIXES', color: '#00008B' },
    { id: '16', name: 'Francesinha', price: 13.00, category: 'CARNES', color: '#8B0000' },
  ];

  const handleProductClick = (product: any) => {
    const existing = lines.find(l => l.id === product.id);
    if (existing) {
      setLines(lines.map(l => l.id === product.id ? { ...l, qty: l.qty + 1 } : l));
    } else {
      setLines([...lines, { id: product.id, name: product.name, price: product.price, qty: 1 }]);
    }
  };

  const handleVoidItem = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const total = lines.reduce((acc, line) => acc + (line.price * line.qty), 0);
  const tax = total * 0.23; // Assuming 23% VAT for display purposes
  const subtotal = total - tax;

  const filteredProducts = activeCategory === 'ALL' 
    ? products 
    : products.filter(p => p.category === activeCategory);

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-white flex flex-col font-sans overflow-hidden select-none">
      {/* Top Status Bar - High contrast, fixed */}
      <div className="h-10 bg-[#000000] border-b border-[#444] flex items-center justify-between px-4 text-xs font-bold tracking-widest text-[#aaaaaa]">
        <div className="flex items-center space-x-6">
          <span className="text-[#00ff00]">ONLINE</span>
          <span>WS-01: BAR PRINCIPAL</span>
          <span className="flex items-center"><User size={14} className="mr-2"/> OPR: 104 - JOAO SILVA</span>
        </div>
        <div className="flex items-center space-x-6">
          <span>CHK: 40291</span>
          <span className="flex items-center"><Clock size={14} className="mr-2"/> {currentTime}</span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: The Receipt (Check Detail) */}
        <div className="w-[30%] bg-[#f4f4f4] flex flex-col border-r-4 border-[#333]">
          {/* Check Header */}
          <div className="h-14 bg-[#e0e0e0] border-b border-[#ccc] flex items-center justify-between px-4 text-black">
            <div>
              <div className="font-black text-lg">MESA 12</div>
              <div className="text-xs text-gray-600 font-bold">2 PAX</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-600 font-bold">REG: 40291</div>
            </div>
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto bg-white p-2">
            <table className="w-full text-black text-sm font-mono">
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-dashed border-gray-300 hover:bg-[#ffffcc] cursor-pointer" onClick={() => handleVoidItem(line.id)}>
                    <td className="py-2 w-8 font-bold text-gray-600">{line.qty}</td>
                    <td className="py-2 font-bold uppercase truncate max-w-[150px]">{line.name}</td>
                    <td className="py-2 text-right font-bold">{(line.price * line.qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Area */}
          <div className="h-32 bg-[#222] text-white p-4 flex flex-col justify-end shadow-[0_-4px_10px_rgba(0,0,0,0.5)] z-10">
            <div className="flex justify-between text-sm text-gray-400 font-mono mb-1">
              <span>SUBTOTAL</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400 font-mono mb-2">
              <span>TAX (VAT)</span>
              <span>{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-xl font-bold uppercase text-[#00ffcc]">Total</span>
              <span className="text-4xl font-black text-[#00ffcc] tracking-tighter">€ {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Center Panel: Numpad & Quick Actions */}
        <div className="w-[20%] bg-[#2a2a2a] border-r-4 border-[#111] flex flex-col p-2 gap-2">
          {/* Action Grid */}
          <div className="grid grid-cols-2 gap-2 h-1/3 mb-2">
            <button className="bg-[#8b0000] text-white font-bold rounded-sm uppercase flex flex-col items-center justify-center active:bg-red-900 border-2 border-red-900 shadow-inner">
              <Trash2 size={20} className="mb-1" />
              VOID
            </button>
            <button className="bg-[#b8860b] text-white font-bold rounded-sm uppercase flex flex-col items-center justify-center active:bg-yellow-700 border-2 border-yellow-700 shadow-inner">
              <Tag size={20} className="mb-1" />
              DISC %
            </button>
            <button className="bg-[#4682b4] text-white font-bold rounded-sm uppercase flex flex-col items-center justify-center active:bg-blue-800 border-2 border-blue-800 shadow-inner">
              <Printer size={20} className="mb-1" />
              PRINT
            </button>
            <button className="bg-[#4b0082] text-white font-bold rounded-sm uppercase flex flex-col items-center justify-center active:bg-purple-900 border-2 border-purple-900 shadow-inner">
              <Shield size={20} className="mb-1" />
              MGR
            </button>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2 flex-1">
            {['7','8','9','4','5','6','1','2','3','0','00','.'].map(num => (
              <button key={num} className="bg-[#333] hover:bg-[#444] active:bg-[#555] text-white text-2xl font-black rounded-sm border-2 border-[#111] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                {num}
              </button>
            ))}
          </div>

          {/* Payment */}
          <button className="h-16 mt-2 bg-[#006400] text-white font-black text-xl rounded-sm uppercase border-2 border-green-900 active:bg-green-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] flex items-center justify-center">
            <CreditCard size={24} className="mr-2" />
            PAY (F12)
          </button>
        </div>

        {/* Right Panel: Menu Grid */}
        <div className="w-[50%] bg-[#1a1a1a] flex flex-col">
          {/* Categories Horizontal Scroll */}
          <div className="h-16 bg-[#111] flex items-center px-2 space-x-2 overflow-x-auto border-b border-[#333]">
            <button 
              onClick={() => setActiveCategory('ALL')}
              className={`h-12 px-6 font-bold rounded-sm shrink-0 uppercase border-2 ${activeCategory === 'ALL' ? 'bg-[#555] border-white text-white' : 'bg-[#222] border-[#444] text-gray-400'}`}
            >
              ALL ITEMS
            </button>
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`h-12 px-6 font-bold rounded-sm shrink-0 uppercase border-2 ${activeCategory === cat ? 'bg-[#555] border-white text-white' : 'bg-[#222] border-[#444] text-gray-400'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Items Grid */}
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="grid grid-cols-4 gap-3 auto-rows-[100px]">
              {filteredProducts.map(prod => (
                <button 
                  key={prod.id}
                  onClick={() => handleProductClick(prod)}
                  className="rounded-sm flex flex-col justify-between p-2 shadow-lg active:opacity-70 border-2"
                  style={{ 
                    backgroundColor: prod.color, 
                    borderColor: 'rgba(0,0,0,0.5)',
                  }}
                >
                  <span className="text-left font-bold text-sm leading-tight text-white uppercase drop-shadow-md">
                    {prod.name}
                  </span>
                  <span className="text-right font-black text-md text-white drop-shadow-md">
                    {prod.price.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
