import React, { useState, useEffect, useRef } from 'react';
import { Plus, Layout, Menu, LogOut, ChevronDown, Sparkles, FileText, ChevronRight, Volume2, StopCircle, Play, Image as ImgIcon, Video as VideoIcon } from 'lucide-react';
import InputArea from './components/InputArea';
import ArtifactPanel from './components/ArtifactPanel';
import { AppMode, ChatSession, Message, ModelId, User, Artifact, ArtifactFile, Attachment, GeneratedMedia } from './types';
import * as storage from './services/storage';
import * as geminiService from './services/geminiService';

// --- Icons ---
const GeminiIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-500">
    <path d="M12.0001 0.549805C12.3365 7.11285 17.6536 12.3339 24.0001 12.0004C17.4371 12.3339 12.3334 17.6477 12.0001 24.0004C11.6668 17.6477 6.56306 12.3339 0 12.0004C6.35359 12.3339 11.6635 7.11285 12.0001 0.549805Z" fill="url(#paint0_linear)"/>
    <defs>
      <linearGradient id="paint0_linear" x1="0" y1="12" x2="24" y2="12" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4D8BFF"/>
        <stop offset="1" stopColor="#9B7AFF"/>
      </linearGradient>
    </defs>
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// --- Components ---
const ThinkingBubble = () => (
  <div className="flex items-center gap-1 h-6">
    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 animate-[bounce_1s_infinite_0ms]"></div>
    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 animate-[bounce_1s_infinite_200ms]"></div>
    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-500 animate-[bounce_1s_infinite_400ms]"></div>
  </div>
);

const SuggestionChip = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button 
    onClick={onClick}
    className="bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 hover:border-zinc-500 rounded-xl px-4 py-2 text-sm text-zinc-300 transition-all text-left"
  >
    {text}
  </button>
);

// --- Helpers ---
const generateId = () => Math.random().toString(36).substring(2, 9);

const parseArtifactFiles = (rawContent: string, mode: AppMode): ArtifactFile[] => {
  if (mode === AppMode.Chat) return [];
  
  // Canvas mode: treat whole as one markdown file
  if (mode === AppMode.Canvas) {
    return [{ name: 'document.md', content: rawContent, language: 'markdown' }];
  }

  // Agent mode: Split by ___FILE:name___
  const files: ArtifactFile[] = [];
  const parts = rawContent.split('___FILE:');
  
  if (parts.length > 1) {
    // We have splits
    for (let i = 1; i < parts.length; i++) {
       const part = parts[i];
       const endOfLine = part.indexOf('___');
       if (endOfLine !== -1) {
          const fileName = part.substring(0, endOfLine).trim();
          let content = part.substring(endOfLine + 3).trim();

          // Robustness: Remove wrapping markdown code blocks if the model adds them despite instructions
          if (content.startsWith('```')) {
            content = content.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
          }

          // Detect language
          let lang = 'text';
          if (fileName.endsWith('.html')) lang = 'html';
          else if (fileName.endsWith('.css')) lang = 'css';
          else if (fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.tsx')) lang = 'javascript';
          
          files.push({ name: fileName, content, language: lang });
       }
    }
  } else {
     if (rawContent.trim().length > 0) {
        files.push({ name: 'index.html', content: rawContent, language: 'html' });
     }
  }

  return files;
};

const mergeFiles = (baseFiles: ArtifactFile[], newFiles: ArtifactFile[]): ArtifactFile[] => {
  const merged = [...baseFiles];
  newFiles.forEach(newFile => {
    const existingIndex = merged.findIndex(f => f.name === newFile.name);
    if (existingIndex >= 0) {
      merged[existingIndex] = newFile;
    } else {
      merged.push(newFile);
    }
  });
  return merged;
};

const App: React.FC = () => {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<ModelId>(ModelId.GeminiFlash);
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.Chat);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Stop controller
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     setMounted(true);
  }, []);

  // Load initial data
  useEffect(() => {
    const loadedUser = storage.getUser();
    const loadedChats = storage.getChats();
    const lastChatId = storage.getCurrentChatId();

    if (loadedUser) setUser(loadedUser);
    if (loadedChats.length > 0) {
      setChats(loadedChats);
      if (lastChatId && loadedChats.find(c => c.id === lastChatId)) {
        setCurrentChatId(lastChatId);
      } else {
        setCurrentChatId(loadedChats[0].id);
      }
    }
  }, []);

  // Save on updates
  useEffect(() => {
    storage.saveChats(chats);
  }, [chats]);

  useEffect(() => {
    if (currentChatId) storage.saveCurrentChatId(currentChatId);
  }, [currentChatId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, currentChatId, isProcessing, activeArtifact]);

  const currentChat = chats.find(c => c.id === currentChatId);

  // Auth Handlers (Mock)
  const handleLogin = () => {
    const mockUser: User = {
      id: 'usr_123',
      name: 'Demo User',
      email: 'user@example.com',
      avatarUrl: 'https://ui-avatars.com/api/?name=Demo+User&background=random&color=fff' 
    };
    storage.saveUser(mockUser);
    setUser(mockUser);
  };

  const handleLogout = () => {
    storage.removeUser();
    setUser(null);
  };

  // Chat Logic
  const createNewChat = () => {
    const newChat: ChatSession = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      modelId: activeModel
    };
    setChats([newChat, ...chats]);
    setCurrentChatId(newChat.id);
    setActiveArtifact(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false); // Mobile UX
  };

  const speakMessage = (text: string) => {
    if ('speechSynthesis' in window) {
       window.speechSynthesis.cancel();
       const utterance = new SpeechSynthesisUtterance(text);
       utterance.rate = 1.0;
       window.speechSynthesis.speak(utterance);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsProcessing(false);
    }
  };

  // Update a file manually from the Artifact Panel (Editing)
  const handleUpdateFile = (fileName: string, newContent: string) => {
    if (!activeArtifact) return;

    const updatedFiles = activeArtifact.files.map(f => 
        f.name === fileName ? { ...f, content: newContent } : f
    );
    
    // Update local state
    const updatedArtifact = { ...activeArtifact, files: updatedFiles };
    setActiveArtifact(updatedArtifact);

    // Update Chat History
    setChats(prev => prev.map(c => c.id === currentChatId ? {
        ...c,
        messages: c.messages.map(m => m.artifact?.id === activeArtifact.id ? { ...m, artifact: updatedArtifact } : m)
    } : c));
  };

  const handleSendMessage = async (text: string, mode: AppMode, attachments: Attachment[], useSearch: boolean) => {
    let chatId = currentChatId;
    let updatedChats = [...chats];

    if (!chatId) {
      const newChat: ChatSession = {
        id: generateId(),
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [],
        createdAt: Date.now(),
        modelId: activeModel
      };
      updatedChats = [newChat, ...updatedChats];
      chatId = newChat.id;
      setCurrentChatId(chatId);
    }

    const newMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      attachments: attachments
    };

    updatedChats = updatedChats.map(c => 
      c.id === chatId 
        ? { ...c, messages: [...c.messages, newMessage] } 
        : c
    );
    setChats(updatedChats);
    setIsProcessing(true);

    const botMessageId = generateId();
    
    // Placeholder message
    const botMessagePlaceholder: Message = {
      id: botMessageId,
      role: 'model',
      content: '', 
      timestamp: Date.now(),
      artifact: undefined
    };

    // Artifact Setup for Text/Canvas/Agent
    let initialArtifact: Artifact | undefined;
    const baseFiles = activeArtifact && mode === AppMode.Agent ? [...activeArtifact.files] : []; 

    if (mode === AppMode.Agent || mode === AppMode.Canvas) {
        initialArtifact = {
            id: activeArtifact ? activeArtifact.id : generateId(),
            type: mode === AppMode.Canvas ? 'document' : 'code',
            title: activeArtifact ? activeArtifact.title : (mode === AppMode.Canvas ? 'New Document' : 'Generating App...'),
            content: '', 
            files: baseFiles,
            status: 'streaming'
        };
        setActiveArtifact(initialArtifact);
        botMessagePlaceholder.artifact = initialArtifact;
    }

    updatedChats = updatedChats.map(c => 
      c.id === chatId 
        ? { ...c, messages: [...c.messages, botMessagePlaceholder] } 
        : c
    );
    setChats(updatedChats);

    abortControllerRef.current = new AbortController();

    try {
        if (mode === AppMode.Image) {
            // --- IMAGE GENERATION ---
            const imageUrl = await geminiService.generateImage(text);
            
            setChats(prev => prev.map(c => c.id === chatId ? {
                ...c,
                messages: c.messages.map(m => m.id === botMessageId ? {
                    ...m,
                    content: `Generated image for: "${text}"`,
                    generatedMedia: { type: 'image', url: imageUrl }
                } : m)
            } : c));

        } else if (mode === AppMode.Video) {
            // --- VIDEO GENERATION ---
            const videoUrl = await geminiService.generateVideo(text);
            
            setChats(prev => prev.map(c => c.id === chatId ? {
                ...c,
                messages: c.messages.map(m => m.id === botMessageId ? {
                    ...m,
                    content: `Generated video for: "${text}"`,
                    generatedMedia: { type: 'video', url: videoUrl }
                } : m)
            } : c));

        } else {
            // --- TEXT / CANVAS / AGENT STREAMING ---
            const history = (currentChat?.messages || []).filter(m => {
                if (m.role === 'model' && !m.content && !m.artifact && !m.generatedMedia) return false;
                return true;
            }).map(m => {
                const parts: any[] = [];
                if (m.content && m.content.trim()) parts.push({ text: m.content });
                if (parts.length === 0) parts.push({ text: "[User sent an image]" });
                return { role: m.role, parts: parts };
            });

            await geminiService.streamResponse(
                activeModel,
                mode,
                history,
                text,
                attachments,
                useSearch,
                (streamedText) => {
                if (!abortControllerRef.current) return; 

                setChats(prev => prev.map(c => {
                    if (c.id !== chatId) return c;
                    return {
                        ...c,
                        messages: c.messages.map(m => {
                            if (m.id !== botMessageId) return m;
                            
                            let updatedArtifact = m.artifact;
                            if (updatedArtifact) {
                                const newFiles = parseArtifactFiles(streamedText, mode);
                                const mergedFiles = mergeFiles(baseFiles, newFiles);
                                updatedArtifact = {
                                    ...updatedArtifact,
                                    content: streamedText,
                                    files: mergedFiles,
                                    status: 'streaming'
                                };
                                setActiveArtifact(prevArt => {
                                    if (prevArt?.id === updatedArtifact?.id) return updatedArtifact;
                                    return prevArt;
                                });
                            }

                            return { 
                                ...m, 
                                content: mode === AppMode.Chat ? streamedText : (mode === AppMode.Agent ? 'Developing application...' : 'Drafting document...'), 
                                artifact: updatedArtifact 
                            };
                        })
                    };
                }));
                }
            );

            // Finalize Artifact
            setChats(prev => prev.map(c => c.id === chatId ? { 
                ...c, 
                messages: c.messages.map(m => {
                    if (m.id !== botMessageId) return m;
                    const art = m.artifact ? { ...m.artifact, status: 'complete' as const } : undefined;
                    if (art && activeArtifact?.id === art.id) setActiveArtifact(art);
                    return { ...m, artifact: art };
                }) 
            } : c));
        }

    } catch (error) {
      console.error(error);
      setChats(prev => prev.map(c => 
        c.id === chatId 
          ? { 
              ...c, 
              messages: c.messages.map(m => 
                m.id === botMessageId ? { ...m, content: "Sorry, I encountered an error. Please try again." } : m
              ) 
            } 
          : c
      ));
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-white relative overflow-hidden">
        {/* Abstract Background */}
        <div className={`absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}></div>
        <div className={`absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}></div>

        <div className={`z-10 w-full max-w-md p-8 bg-zinc-900/50 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl text-center transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex justify-center mb-8">
            <div className="p-4 bg-zinc-800/50 rounded-2xl shadow-inner border border-white/5">
               <div className="scale-150"><GeminiIcon /></div>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-3 tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Gemini Workspace</h1>
          <p className="text-zinc-400 mb-10 text-sm leading-relaxed">
             Experience the next generation of AI collaboration with seamless app generation, document creation, and media synthesis.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full py-3.5 px-4 bg-white text-zinc-900 font-medium rounded-xl hover:bg-zinc-200 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg shadow-white/10"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden text-zinc-100 font-sans selection:bg-blue-500/30 relative">
      
      {/* Ambient Background Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-zinc-950 to-zinc-950 pointer-events-none z-0"></div>

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-[280px]' : 'w-0'} bg-zinc-900/80 backdrop-blur-md flex-shrink-0 transition-all duration-300 border-r border-zinc-800/60 flex flex-col overflow-hidden z-10`}>
        <div className="p-4">
          <button 
            onClick={createNewChat}
            className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-all border border-zinc-700/50 shadow-sm group"
          >
            <Plus size={18} className="text-zinc-400 group-hover:text-white transition-colors" />
            <span className="text-sm font-medium">New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
          <div className="text-[11px] font-bold text-zinc-500 mb-3 px-3 uppercase tracking-wider">Recent</div>
          <div className="space-y-1">
            {chats.map(chat => (
                <button
                key={chat.id}
                onClick={() => {
                    setCurrentChatId(chat.id);
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    if(lastMsg?.artifact) setActiveArtifact(lastMsg.artifact);
                    else setActiveArtifact(null);
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-all group relative ${
                    currentChatId === chat.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
                >
                <span className="truncate block pr-4">{chat.title}</span>
                </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/50">
           <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800 cursor-pointer transition-colors group" onClick={handleLogout}>
              <img src={user.avatarUrl} alt="User" className="w-9 h-9 rounded-full border border-zinc-700" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white">{user.name}</p>
                <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
              </div>
              <LogOut size={16} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-transparent z-10">
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
             >
                <Menu size={20} />
             </button>
             
             {/* Model Selector */}
             <div className="relative">
                <button 
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className="flex items-center gap-2 text-lg font-medium text-zinc-200 hover:text-white px-2 py-1 rounded-lg transition-colors group"
                >
                  <span className="opacity-80 group-hover:opacity-100 transition-opacity">
                    {activeModel === ModelId.GeminiPro ? 'Gemini 3.0 Pro (Preview)' : 'Gemini 2.0 Flash'}
                  </span>
                  <ChevronDown size={16} className="text-zinc-500 group-hover:text-zinc-300" />
                </button>
                
                {showModelMenu && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden py-1.5 z-30">
                     <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Select Model</div>
                     {Object.values(ModelId).map(model => (
                       <button
                         key={model}
                         onClick={() => { setActiveModel(model); setShowModelMenu(false); }}
                         className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-700 flex items-center justify-between group ${activeModel === model ? 'text-blue-400 bg-zinc-700/30' : 'text-zinc-300'}`}
                       >
                         <span>{model === ModelId.GeminiPro ? 'Gemini 3.0 Pro (Preview)' : 'Gemini 2.0 Flash'}</span>
                         {activeModel === model && <Sparkles size={14} />}
                       </button>
                     ))}
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-12 md:px-24 lg:px-48 py-4 scroll-smooth">
          {!currentChat || currentChat.messages.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center select-none pb-20 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
               <div className="w-20 h-20 bg-zinc-900 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl border border-zinc-800">
                 <div className="scale-125"><GeminiIcon /></div>
               </div>
               <h3 className="text-2xl font-semibold text-white mb-3">Welcome, {user.name.split(' ')[0]}</h3>
               <p className="text-zinc-400 text-center max-w-md mb-8">
                 I'm Gemini. I can help you draft professional documents, build web apps, or create images and videos.
               </p>
               
               {/* Suggestion Chips */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg px-4">
                  <SuggestionChip text="Create a Snake Game in Python" onClick={() => { setCurrentMode(AppMode.Agent); handleSendMessage("Create a Snake Game using HTML5 Canvas", AppMode.Agent, [], false); }} />
                  <SuggestionChip text="Write a marketing plan for a coffee shop" onClick={() => { setCurrentMode(AppMode.Canvas); handleSendMessage("Write a comprehensive marketing plan for a new coffee shop", AppMode.Canvas, [], false); }} />
                  <SuggestionChip text="Generate an image of a futuristic city" onClick={() => { setCurrentMode(AppMode.Image); handleSendMessage("A futuristic city with neon lights at night, 8k resolution", AppMode.Image, [], false); }} />
                  <SuggestionChip text="What are the latest tech news?" onClick={() => { setCurrentMode(AppMode.Chat); handleSendMessage("What are the latest tech news today?", AppMode.Chat, [], true); }} />
               </div>
            </div>
          ) : (
            <div className="flex flex-col gap-8 pb-4">
              {currentChat.messages.map((msg, index) => (
                <div key={msg.id} className="flex gap-6 group">
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1 shadow-md ${msg.role === 'user' ? 'bg-zinc-800' : 'bg-transparent border border-zinc-800/50'}`}>
                    {msg.role === 'user' ? (
                       <img src={user.avatarUrl} className="rounded-full w-full h-full" alt="U" />
                    ) : (
                       <div className="scale-75"><GeminiIcon /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                     <div className="font-semibold text-sm text-zinc-200 mb-1.5 flex items-center gap-2">
                        {msg.role === 'user' ? 'You' : 'Gemini'}
                        <span className="text-[10px] text-zinc-600 font-normal">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        {msg.role === 'model' && msg.content && !msg.generatedMedia && (
                           <button onClick={() => speakMessage(msg.content)} className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300 ml-2">
                              <Volume2 size={14} />
                           </button>
                        )}
                     </div>
                     
                     {/* Images in Chat (User Upload) */}
                     {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                           {msg.attachments.map(att => (
                              <img key={att.id} src={att.data} alt="uploaded" className="h-32 rounded-lg border border-zinc-700 object-cover" />
                           ))}
                        </div>
                     )}

                     {/* Text Content */}
                     <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-[15px]">
                        {!msg.content && msg.role === 'model' && !msg.artifact && !msg.generatedMedia ? (
                           <ThinkingBubble />
                        ) : (
                           msg.content
                        )}
                     </div>

                     {/* Generated Media (AI Response) */}
                     {msg.generatedMedia && (
                         <div className="mt-4">
                             {msg.generatedMedia.type === 'image' ? (
                                 <div className="rounded-2xl overflow-hidden border border-zinc-700 shadow-xl max-w-md">
                                     <img src={msg.generatedMedia.url} alt="Generated" className="w-full h-auto" />
                                     <div className="bg-zinc-900 px-4 py-2 flex justify-between items-center">
                                         <span className="text-xs text-zinc-500 flex items-center gap-1"><ImgIcon size={12}/> Generated Image</span>
                                         <a href={msg.generatedMedia.url} download="generated_image.png" className="text-zinc-400 hover:text-white text-xs">Download</a>
                                     </div>
                                 </div>
                             ) : (
                                <div className="rounded-2xl overflow-hidden border border-zinc-700 shadow-xl max-w-md">
                                     <video src={msg.generatedMedia.url} controls className="w-full" poster="https://placehold.co/600x400/18181b/ffffff?text=Video+Ready" />
                                     <div className="bg-zinc-900 px-4 py-2 flex justify-between items-center">
                                         <span className="text-xs text-zinc-500 flex items-center gap-1"><VideoIcon size={12}/> Generated Video</span>
                                     </div>
                                </div>
                             )}
                         </div>
                     )}
                     
                     {/* Artifact Card */}
                     {msg.artifact && (
                       <button 
                          onClick={() => setActiveArtifact(msg.artifact!)}
                          className="mt-4 w-full sm:w-80 flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:bg-zinc-800/80 transition-all hover:scale-[1.01] hover:shadow-lg group text-left"
                       >
                          <div className={`p-3 rounded-lg ${msg.artifact.type === 'code' ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' : 'bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20'} transition-colors`}>
                             {msg.artifact.type === 'code' ? <Layout size={24}/> : <FileText size={24}/>}
                          </div>
                          <div className="min-w-0">
                             <div className="font-medium text-sm text-white truncate">
                                {msg.artifact.title}
                             </div>
                             <div className="text-xs text-zinc-500 mt-0.5">
                                {msg.artifact.type === 'code' ? 'Click to view application' : 'Click to read document'}
                             </div>
                          </div>
                          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="p-1 rounded-full bg-zinc-700 text-zinc-300">
                                  <ChevronRight size={14}/>
                              </div>
                          </div>
                       </button>
                     )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 z-20">
          <InputArea 
            onSend={handleSendMessage} 
            disabled={isProcessing} 
            currentMode={currentMode}
            onModeChange={setCurrentMode}
            onStop={handleStop}
          />
        </div>

      </div>

      {/* Right Panel (Artifact Viewer) */}
      {activeArtifact && (
        <div className="relative h-full flex-shrink-0 z-30 shadow-[-10px_0_30px_-5px_rgba(0,0,0,0.5)]">
           <ArtifactPanel 
             artifact={activeArtifact} 
             onClose={() => setActiveArtifact(null)} 
             onUpdateFile={handleUpdateFile}
           />
        </div>
      )}

    </div>
  );
};

export default App;