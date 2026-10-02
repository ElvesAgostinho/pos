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
    <div className="fixed top-12 right-4 w-80 bg-[#FFFFFF] border border-[#D7DBDF] shadow-[4px_4px_10px_rgba(0,0,0,0.3)] z-[9900] flex flex-col font-sans">
      <div className="bg-[#2E75B6] text-white px-3 py-2 flex items-center justify-between cursor-move select-none">
        <div className="flex items-center text-xs font-bold">
          <FileText size={14} className="mr-2" />
          Bloco de Notas Rápido
        </div>
        <button onClick={handleClose} className="hover:bg-[#B42318] rounded-sm p-0.5">
          <X size={14} />
        </button>
      </div>
      
      <div className="p-2 flex flex-col h-64 bg-[#F3F4F6]">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleSave}
          className="flex-1 w-full bg-transparent border-none outline-none resize-none text-[13px] leading-tight font-serif p-1"
          placeholder="Escreva aqui os seus apontamentos..."
          autoFocus
        />
      </div>

      <div className="bg-[#F3F4F6] border-t border-[#D7DBDF] p-1.5 flex justify-end">
        <button 
          onClick={handleSave}
          className="flex items-center text-[10px] bg-[#F3F4F6] hover:bg-[#DCE9F5] border border-[#D7DBDF] px-2 py-1 text-black font-medium"
        >
          <Save size={10} className="mr-1" />
          Guardar Nota
        </button>
      </div>
    </div>
  );
}
