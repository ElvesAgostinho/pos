import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ title, isOpen, onClose, children, width = 'w-[600px]' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 font-sans">
      <div className={`${width} bg-[#f0f0f0] border border-[#a0a0a0] shadow-xl flex flex-col`}>
        {/* Title Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#d0d0d0] border-b border-[#a0a0a0] cursor-default select-none">
          <span className="text-xs font-bold text-[#333]">{title}</span>
          <button 
            onClick={onClose}
            className="p-0.5 hover:bg-red-500 hover:text-white rounded-sm text-gray-700"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-[#f8f8f8] p-4 border-b border-[#d0d0d0]">
          {children}
        </div>
      </div>
    </div>
  );
}
