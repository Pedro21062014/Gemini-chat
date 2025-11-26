import React, { useState, useEffect, useMemo } from 'react';
import { X, Download, Code, Eye, FileText, Monitor, File, Folder, FolderOpen, Package, ChevronDown, Table as TableIcon, Terminal, RefreshCw } from 'lucide-react';
import { Artifact, ArtifactFile } from '../types';
import JSZip from 'jszip';
import { marked } from 'marked';

interface ArtifactPanelProps {
  artifact: Artifact | null;
  onClose: () => void;
  onUpdateFile: (fileName: string, newContent: string) => void;
}

// Helper to build file tree
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  file?: ArtifactFile;
}

const buildFileTree = (files: ArtifactFile[]): TreeNode[] => {
  const root: TreeNode[] = [];

  files.forEach(file => {
    const parts = file.name.split('/');
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const existingNode = currentLevel.find(node => node.name === part);

      if (existingNode) {
        if (isFile) {
             existingNode.file = file; // Update file ref if exists
        } else {
             currentLevel = existingNode.children!;
        }
      } else {
        const newNode: TreeNode = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
          file: isFile ? file : undefined
        };
        currentLevel.push(newNode);
        if (!isFile) {
          currentLevel = newNode.children!;
        }
      }
    });
  });

  // Sort folders first, then files
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    nodes.forEach(node => {
      if (node.children) sortNodes(node.children);
    });
  };

  sortNodes(root);
  return root;
};

// Recursive Tree Item Component
const TreeItem: React.FC<{ 
    node: TreeNode; 
    depth: number; 
    selectedFile: ArtifactFile | null; 
    onSelect: (file: ArtifactFile) => void;
}> = ({ node, depth, selectedFile, onSelect }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (node.type === 'folder') {
        return (
            <div>
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                    style={{ paddingLeft: `${depth * 12 + 12}px` }}
                >
                    {isOpen ? <FolderOpen size={14} className="text-zinc-500" /> : <Folder size={14} className="text-zinc-500" />}
                    <span className="text-xs truncate">{node.name}</span>
                </button>
                {isOpen && node.children?.map(child => (
                    <TreeItem 
                        key={child.path} 
                        node={child} 
                        depth={depth + 1} 
                        selectedFile={selectedFile} 
                        onSelect={onSelect} 
                    />
                ))}
            </div>
        );
    }

    return (
        <button
            onClick={() => node.file && onSelect(node.file)}
            className={`flex items-center gap-2 w-full text-left py-1.5 hover:bg-zinc-800/50 transition-colors border-l-2 ${
                selectedFile?.name === node.file?.name ? 'bg-blue-500/10 text-blue-400 border-blue-400' : 'text-zinc-400 hover:text-zinc-200 border-transparent'
            }`}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
            <File size={13} />
            <span className="text-xs truncate">{node.name}</span>
        </button>
    );
};

interface ConsoleLog {
  type: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifact, onClose, onUpdateFile }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [currentFile, setCurrentFile] = useState<ArtifactFile | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (artifact?.files.length) {
        // Try to find index.html or main file, otherwise first file
        const mainFile = artifact.files.find(f => f.name.endsWith('index.html') || f.name.endsWith('App.tsx') || f.name.endsWith('main.py')) || artifact.files[0];
        setCurrentFile(mainFile);
    }
    if (artifact?.type === 'code') setActiveTab('preview');
    else setActiveTab('preview'); // Canvas defaults to preview (Formatted)
  }, [artifact?.id]); // Don't reset on every file update to avoid jumping

  // Listen for console logs from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CONSOLE_LOG') {
        const newLog: ConsoleLog = {
          type: event.data.logType || 'log',
          message: event.data.args.map((a: any) => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
          timestamp: new Date().toLocaleTimeString()
        };
        setConsoleLogs(prev => [...prev, newLog]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!artifact) return null;

  const fileTree = useMemo(() => buildFileTree(artifact.files), [artifact.files]);

  // Combined Preview Logic for Web Apps
  const previewSrc = useMemo(() => {
    if (artifact.type !== 'code') return '';
    
    // Find index.html
    const indexHtml = artifact.files.find(f => f.name.endsWith('index.html'));
    if (!indexHtml) return '';

    let content = indexHtml.content;

    // Inject CSS
    const cssFiles = artifact.files.filter(f => f.name.endsWith('.css'));
    let cssBlock = '';
    cssFiles.forEach(f => {
      cssBlock += `<style>\n/* ${f.name} */\n${f.content}\n</style>\n`;
    });
    
    // Inject JS
    const jsFiles = artifact.files.filter(f => f.name.endsWith('.js'));
    let jsBlock = '';
    jsFiles.forEach(f => {
       jsBlock += `<script>\n/* ${f.name} */\n${f.content}\n</script>\n`;
    });

    // Console Capture Script
    const consoleScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;

          function sendLog(type, args) {
             window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, args: Array.from(args) }, '*');
          }

          console.log = function() { sendLog('log', arguments); originalLog.apply(console, arguments); };
          console.error = function() { sendLog('error', arguments); originalError.apply(console, arguments); };
          console.warn = function() { sendLog('warn', arguments); originalWarn.apply(console, arguments); };
        })();
      </script>
    `;

    if (cssBlock) content = content.replace('</head>', `${cssBlock}</head>`);
    content = content.replace('</body>', `${consoleScript}${jsBlock}</body>`);

    return content;
  }, [artifact.files, artifact.type]);

  // Document Formatting Logic (Markdown to HTML)
  const documentHtml = useMemo(() => {
      if (artifact.type !== 'document') return '';
      // Use the first file which is usually the markdown content
      const content = artifact.files[0]?.content || '';
      return marked.parse(content) as string;
  }, [artifact.files, artifact.type]);

  // Check if document contains a table
  const hasTable = useMemo(() => {
      if (artifact.type !== 'document') return false;
      const content = artifact.files[0]?.content || '';
      return /\|.*\|/.test(content) && /\|[-\s:|]+\|/.test(content);
  }, [artifact.files, artifact.type]);

  const handleDownloadFile = () => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.name.split('/').pop() || 'file.txt'; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
      const zip = new JSZip();
      artifact.files.forEach(file => {
          zip.file(file.name, file.content);
      });
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artifact.title.replace(/\s+/g, '_').toLowerCase()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };
  
  const handleExportCSV = () => {
      if (!hasTable) return;
      const content = artifact.files[0]?.content || '';
      
      const lines = content.split('\n');
      const csvRows: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('|')) {
             if (line.includes('---')) continue;
             
             const cells = line.split('|').filter(cell => cell.length > 0 && !cell.match(/^\s*$/)).map(cell => {
                 const clean = cell.trim().replace(/"/g, '""');
                 return `"${clean}"`;
             });
             
             if (cells.length > 0) {
                 csvRows.push(cells.join(','));
             }
          }
      }

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artifact.title.replace(/\s+/g, '_')}_data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadMenuOpen(false);
  };

  const handleExportDoc = (format: 'html' | 'txt' | 'md') => {
      const content = artifact.files[0]?.content || '';
      let blob: Blob;
      let filename = `${artifact.title.replace(/\s+/g, '_')}.${format}`;

      if (format === 'html') {
          const styles = `
            body { background-color: #525659; font-family: sans-serif; margin: 0; padding: 40px; }
            .page {
                background-color: #ffffff;
                color: #1f2937;
                font-family: 'Times New Roman', Times, serif;
                padding: 3rem;
                max-width: 21cm;
                margin: 0 auto;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                line-height: 1.6;
            }
            h1 { font-family: sans-serif; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
            h2, h3 { font-family: sans-serif; color: #374151; }
            table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-family: sans-serif; font-size: 10pt; border: 1px solid #d1d5db; }
            th { background-color: #f3f4f6; padding: 0.75rem; border: 1px solid #d1d5db; text-align: left; }
            td { padding: 0.75rem; border: 1px solid #d1d5db; color: #374151; }
            tr:nth-child(even) { background-color: #f9fafb; }
            code { background-color: #f3f4f6; padding: 0.2rem; font-family: monospace; color: #ef4444; }
          `;
          
          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${artifact.title}</title>
                <style>${styles}</style>
            </head>
            <body>
                <div class="page">
                    ${marked.parse(content) as string}
                </div>
            </body>
            </html>
          `;
          blob = new Blob([htmlContent], { type: 'text/html' });
      } else {
          blob = new Blob([content], { type: 'text/plain' });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadMenuOpen(false);
  };

  const handleRefresh = () => {
    setIframeKey(k => k + 1);
    setConsoleLogs([]);
  };

  return (
    <div className="h-full flex flex-col border-l border-zinc-800 bg-zinc-900 w-[500px] xl:w-[900px] shadow-2xl transition-all z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
            <div className={`p-2 rounded-lg ${artifact.type === 'code' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>
               {artifact.type === 'code' ? <Monitor size={18}/> : <FileText size={18}/>}
            </div>
            <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm text-zinc-100 truncate max-w-[200px]">
                    {artifact.title}
                </span>
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                   {artifact.files.length} file{artifact.files.length !== 1 && 's'} 
                   <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                   {artifact.status === 'streaming' ? <span className="text-blue-400 animate-pulse">Generating...</span> : 'Ready'}
                </span>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
          {artifact.type === 'code' ? (
             <>
             <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 mr-1">
                <button 
                    onClick={() => setActiveTab('preview')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'preview' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                    <Eye size={14} /> <span className="hidden sm:inline">Preview</span>
                </button>
                <button 
                    onClick={() => setActiveTab('code')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'code' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                    <Code size={14} /> <span className="hidden sm:inline">Code</span>
                </button>
            </div>
             <button 
                onClick={handleDownloadZip}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex items-center justify-center"
                title="Download ZIP"
            >
                <Package size={18} />
            </button>
            </>
          ) : (
            <div className="relative">
                <button 
                    onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                    <Download size={14} /> Export <ChevronDown size={14} />
                </button>
                {downloadMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden py-1 z-30">
                        <button onClick={() => handleExportDoc('html')} className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"><FileText size={14}/> HTML / Doc</button>
                        {hasTable && (
                            <button onClick={handleExportCSV} className="w-full text-left px-4 py-2.5 text-sm text-green-400 hover:bg-zinc-700 hover:text-green-300 flex items-center gap-2 border-t border-zinc-700/50"><TableIcon size={14}/> CSV (Excel)</button>
                        )}
                        <button onClick={() => handleExportDoc('md')} className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2 border-t border-zinc-700/50"><Code size={14}/> Markdown</button>
                        <button onClick={() => handleExportDoc('txt')} className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center gap-2"><File size={14}/> Text File</button>
                    </div>
                )}
            </div>
          )}

          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* File Explorer (Left Pane) - Only for Code mode */}
        {activeTab === 'code' && artifact.type === 'code' && (
            <div className="w-60 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
                <div className="px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-900/50 backdrop-blur-sm sticky top-0">
                    Explorer
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 px-2">
                   {fileTree.map(node => (
                       <TreeItem 
                           key={node.path} 
                           node={node} 
                           depth={0} 
                           selectedFile={currentFile} 
                           onSelect={setCurrentFile} 
                       />
                   ))}
                </div>
            </div>
        )}

        {/* Editor / Preview Area (Right Pane) */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 relative">
             
             {/* Preview Mode */}
             {activeTab === 'preview' ? (
                artifact.type === 'code' ? (
                    /* App Preview (Iframe) with Console */
                    <div className="w-full h-full bg-white flex flex-col relative">
                        <div className="bg-zinc-100 border-b border-zinc-200 px-3 py-2 flex items-center gap-2 flex-shrink-0">
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400 border border-red-500/10"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-500/10"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-green-400 border border-green-500/10"></div>
                            </div>
                            <div className="flex-1 bg-white rounded-md border border-zinc-200 h-6 mx-2 flex items-center px-2 shadow-sm">
                              <span className="text-[10px] text-zinc-400 font-mono">localhost:3000</span>
                            </div>
                             <button onClick={handleRefresh} className="p-1 text-zinc-400 hover:text-zinc-600">
                                <RefreshCw size={14} />
                             </button>
                        </div>
                        {previewSrc ? (
                            <iframe 
                                key={iframeKey}
                                srcDoc={previewSrc}
                                className="flex-1 w-full border-none bg-white"
                                title="App Preview"
                                sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
                            />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
                                <div className="text-center">
                                    <p>No index.html found to preview.</p>
                                    <p className="text-xs mt-1">Switch to Code view to see files.</p>
                                </div>
                            </div>
                        )}
                        
                        {/* Interactive Console Panel */}
                        <div className={`flex flex-col border-t border-zinc-200 bg-zinc-50 transition-all duration-300 ${showConsole ? 'h-48' : 'h-8'}`}>
                             <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 border-b border-zinc-200 cursor-pointer" onClick={() => setShowConsole(!showConsole)}>
                                <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                                    <Terminal size={12} /> Console ({consoleLogs.length})
                                </div>
                                <ChevronDown size={14} className={`text-zinc-400 transition-transform ${showConsole ? '' : 'rotate-180'}`} />
                             </div>
                             {showConsole && (
                                 <div className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1 bg-white">
                                     {consoleLogs.length === 0 && <div className="text-zinc-300 italic">No logs...</div>}
                                     {consoleLogs.map((log, i) => (
                                         <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-600' : log.type === 'warn' ? 'text-yellow-600' : 'text-zinc-600'}`}>
                                             <span className="text-zinc-300 select-none">[{log.timestamp}]</span>
                                             <span>{log.message}</span>
                                         </div>
                                     ))}
                                 </div>
                             )}
                        </div>
                    </div>
                ) : (
                    /* Document Preview (Paper View) */
                    <div className="w-full h-full bg-[#525659] overflow-y-auto p-4 md:p-8 custom-scrollbar">
                        <div className="document-paper shadow-2xl mx-auto">
                            <div 
                                className="prose max-w-none"
                                dangerouslySetInnerHTML={{ __html: documentHtml as string }}
                            />
                        </div>
                    </div>
                )
             ) : (
                /* Editable Code / Text Editor View */
                <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#1e1e1e]">
                    {/* File Header */}
                    {currentFile && (
                        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#1e1e1e] flex-shrink-0">
                            <span className="text-xs text-zinc-400 font-mono flex items-center gap-2">
                                <File size={12} /> {currentFile.name}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={handleDownloadFile} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Download File">
                                    <Download size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Content */}
                    <div className="flex-1 overflow-auto p-0 relative">
                        {currentFile ? (
                           <div className="relative h-full flex">
                               {/* Line Numbers */}
                               <div className="w-10 bg-[#1e1e1e] border-r border-zinc-800 text-zinc-600 text-right pr-2 pt-4 text-xs font-mono select-none flex-shrink-0 overflow-hidden">
                                   {currentFile.content.split('\n').map((_, i) => (
                                       <div key={i} className="leading-6">{i + 1}</div>
                                   ))}
                               </div>
                               {/* Editable Text Area */}
                               <textarea 
                                  value={currentFile.content}
                                  onChange={(e) => {
                                      const newContent = e.target.value;
                                      setCurrentFile({...currentFile, content: newContent});
                                      onUpdateFile(currentFile.name, newContent);
                                  }}
                                  className="flex-1 bg-transparent text-zinc-300 font-mono text-sm leading-6 p-4 outline-none resize-none whitespace-pre tab-4"
                                  spellCheck={false}
                               />
                           </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                                Select a file to view
                            </div>
                        )}
                    </div>
                </div>
             )}
        </div>
      </div>
    </div>
  );
};

export default ArtifactPanel;