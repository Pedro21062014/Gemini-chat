import React, { useState, useRef, useEffect } from 'react';
import { Send, FileText, Code, MessageSquare, Plus, Mic, Image as ImageIcon, X, Image as ImgIcon, Film, Globe } from 'lucide-react';
import { AppMode, Attachment } from '../types';

interface InputAreaProps {
  onSend: (text: string, mode: AppMode, attachments: Attachment[], useSearch: boolean) => void;
  disabled: boolean;
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onStop?: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled, currentMode, onModeChange, onStop }) => {
  const [input, setInput] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [useSearch, setUseSearch] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 160);
      textareaRef.current.style.height = `${Math.max(56, newHeight)}px`;
    }
  }, [input, attachments]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || disabled) return;
    onSend(input, currentMode, attachments, useSearch);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = '56px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const newAttachment: Attachment = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'image',
            data: event.target.result as string,
            mimeType: file.type
          };
          setAttachments([...attachments, newAttachment]);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const toggleVoice = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    if (!('webkitSpeechRecognition' in window)) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.start();
  };

  const modeConfig = {
    [AppMode.Chat]: { icon: MessageSquare, label: 'Chat', color: 'text-zinc-300' },
    [AppMode.Canvas]: { icon: FileText, label: 'Canvas', color: 'text-orange-400' },
    [AppMode.Agent]: { icon: Code, label: 'Agent', color: 'text-blue-400' },
    [AppMode.Image]: { icon: ImgIcon, label: 'Image', color: 'text-purple-400' },
    [AppMode.Video]: { icon: Film, label: 'Video', color: 'text-pink-400' },
  };

  const getPlaceholder = () => {
      switch(currentMode) {
          case AppMode.Image: return "Describe the image you want to generate...";
          case AppMode.Video: return "Describe the video scene...";
          case AppMode.Agent: return "Describe the app you want to build...";
          case AppMode.Canvas: return "Describe the document you need...";
          default: return useSearch ? "Ask Gemini anything from the web..." : "Message Gemini...";
      }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6 relative z-50">
      
      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="flex gap-3 mb-3 px-2 overflow-x-auto">
          {attachments.map(att => (
            <div key={att.id} className="relative group">
              <img src={att.data} alt="Attachment" className="h-20 w-20 object-cover rounded-xl border border-zinc-700 shadow-md" />
              <button 
                onClick={() => removeAttachment(att.id)}
                className="absolute -top-1.5 -right-1.5 bg-zinc-800 text-zinc-400 rounded-full p-0.5 border border-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative bg-zinc-800/80 backdrop-blur-md rounded-[28px] shadow-2xl border border-zinc-700/50 transition-all focus-within:ring-1 focus-within:ring-zinc-600 focus-within:bg-zinc-800 flex flex-col justify-end min-h-[60px]">
        
        {/* Left Actions */}
        <div className="absolute bottom-2.5 left-2 z-20 flex items-center gap-1">
           {/* Mode Selector */}
           <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 ${isMenuOpen ? 'bg-zinc-700 text-white rotate-45' : 'bg-transparent text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'}`}
                title="Select Mode"
              >
                <Plus size={22} />
              </button>

               <div 
                 className={`absolute bottom-full left-0 mb-3 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-bottom-left ${
                   isMenuOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 translate-y-2 pointer-events-none'
                 }`}
               >
                  <div className="p-1.5 space-y-0.5">
                    <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mode</div>
                    {(Object.values(AppMode) as AppMode[]).map((mode) => {
                      const Icon = modeConfig[mode].icon;
                      const isSelected = currentMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            onModeChange(mode);
                            setIsMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                            isSelected ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
                          }`}
                        >
                          <Icon size={16} className={modeConfig[mode].color} />
                          <span className="font-medium">{modeConfig[mode].label}</span>
                        </button>
                      );
                    })}
                  </div>
               </div>
           </div>

           {/* Image Upload */}
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="flex items-center justify-center w-10 h-10 rounded-full bg-transparent text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 transition-all"
             title="Upload Image"
           >
             <ImageIcon size={20} />
           </button>
           <input 
             type="file" 
             ref={fileInputRef} 
             className="hidden" 
             accept="image/*" 
             onChange={handleFileSelect}
           />

            {/* Search Toggle */}
            <button 
             onClick={() => setUseSearch(!useSearch)}
             className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${useSearch ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'}`}
             title="Search the Web"
           >
             <Globe size={20} />
           </button>
        </div>

        {/* Text Area */}
        <textarea
           ref={textareaRef}
           value={input}
           onChange={(e) => setInput(e.target.value)}
           onKeyDown={handleKeyDown}
           placeholder={getPlaceholder()}
           className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-[16px] py-4 pl-[144px] pr-[100px] resize-none outline-none max-h-[200px] overflow-y-auto leading-relaxed scrollbar-hide"
           rows={1}
           style={{ minHeight: '60px' }}
           disabled={disabled}
         />

         {/* Right Actions */}
         <div className="absolute bottom-2.5 right-2 z-10 flex items-center gap-1">
             
             {/* Mic Button */}
            <button
               onClick={toggleVoice}
               className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                 isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-transparent text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'
               }`}
               title="Voice Input"
             >
               <Mic size={20} />
             </button>

            {/* Send / Stop Button */}
            {disabled && onStop ? (
               <button
                 onClick={onStop}
                 className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-all hover:scale-105 shadow-md"
                 title="Stop Generating"
               >
                 <span className="w-3 h-3 bg-white rounded-sm"></span>
               </button>
            ) : (
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0) || disabled}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                    (input.trim() || attachments.length > 0) && !disabled
                      ? 'bg-white text-zinc-950 hover:bg-zinc-200 shadow-md transform hover:scale-105' 
                      : 'bg-zinc-700/30 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <Send size={18} className={(input.trim() || attachments.length > 0) && !disabled ? 'ml-0.5' : ''} />
                </button>
            )}
         </div>

      </div>
      
      {/* Footer Info */}
      <div className="flex justify-center mt-3">
         <div className="flex items-center gap-2 text-[11px] text-zinc-500 bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800/50 backdrop-blur-sm">
             <span>Using</span>
             <span className={`font-medium flex items-center gap-1 ${modeConfig[currentMode].color}`}>
                {modeConfig[currentMode].label}
             </span>
             {useSearch && <span className="flex items-center gap-1 ml-1 text-blue-400">+ Search</span>}
         </div>
      </div>
    </div>
  );
};

export default InputArea;