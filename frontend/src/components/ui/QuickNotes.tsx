import { useState, useEffect } from 'react';
import { X, Save, FileText } from 'lucide-react';

interface QuickNotesProps {
  onClose: () => void;
}

export default function QuickNotes({ onClose }: QuickNotesProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    const savedNote = localStorage.getItem('erp_quick_note') || '';
    setNote(savedNote);
  }, []);

  const handleSave = () => {
    localStorage.setItem('erp_quick_note', note);
  };

  const handleClose = () => {
    handleSave();
    onClose();
  };

  return (
    <div className="fixed top-12 right-4 w-80 bg-[#f9f9f9] border border-[#a0a0a0] shadow-[4px_4px_10px_rgba(0,0,0,0.3)] z-[9900] flex flex-col font-sans">
      <div className="bg-[#1e3f66] text-white px-3 py-2 flex items-center justify-between cursor-move select-none">
        <div className="flex items-center text-xs font-bold">
          <FileText size={14} className="mr-2" />
          Bloco de Notas Rápido
        </div>
        <button onClick={handleClose} className="hover:bg-red-500 rounded-sm p-0.5">
          <X size={14} />
        </button>
      </div>
      
      <div className="p-2 flex flex-col h-64 bg-[#ffffaa]">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleSave}
          className="flex-1 w-full bg-transparent border-none outline-none resize-none text-[13px] leading-tight font-serif p-1"
          placeholder="Escreva aqui os seus apontamentos..."
          autoFocus
        />
      </div>

      <div className="bg-[#e0e0e0] border-t border-[#a0a0a0] p-1.5 flex justify-end">
        <button 
          onClick={handleSave}
          className="flex items-center text-[10px] bg-[#d0d0d0] hover:bg-[#c0c0c0] border border-[#a0a0a0] px-2 py-1 text-black font-medium"
        >
          <Save size={10} className="mr-1" />
          Guardar Nota
        </button>
      </div>
    </div>
  );
}
