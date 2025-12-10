import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Settings, MessageSquare, Briefcase, Download, Upload, X, FolderSync, FolderCheck, Loader2, Star, Layers } from 'lucide-react';
import { translations } from '../i18n';
import { Language, AnalysisTemplate, AnalysisGroup } from '../types';
import { configService, GENERAL_TEMPLATE_ID } from '../services/configService'; 
import { fileSystemService } from '../services/fileSystemService';
import ConfigGroupEditor from './ConfigGroupEditor';
import ConfigTemplateEditor from './ConfigTemplateEditor';

interface ConfigManagerProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  columns?: string[];
}

// 3 Tabs Structure
type Tab = 'groups' | 'general' | 'templates';

const ConfigManager: React.FC<ConfigManagerProps> = ({ language, isOpen, onClose, onUpdate }) => {
  const t = translations[language];
  
  const [activeTab, setActiveTab] = useState<Tab>('groups');
  const [groups, setGroups] = useState<AnalysisGroup[]>([]);
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  
  // Specific General Template
  const [generalTemplate, setGeneralTemplate] = useState<AnalysisTemplate | null>(null);

  const [editGroup, setEditGroup] = useState<Partial<AnalysisGroup> | null>(null);
  const [editTemplate, setEditTemplate] = useState<Partial<AnalysisTemplate> | null>(null);
  
  const [isSynced, setIsSynced] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  const configImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      refreshData();
      setIsSynced(fileSystemService.isHandleReady());
    }
  }, [isOpen]);

  const refreshData = () => {
    setGroups(configService.getGroups());
    const allTemplates = configService.getTemplates();
    setTemplates(allTemplates);
    
    // Find General Template
    const gen = allTemplates.find(t => t.id === GENERAL_TEMPLATE_ID);
    setGeneralTemplate(gen || null);
  };

  const handleLinkFolder = async () => {
      // Synchronous Fallback Check
      // @ts-ignore
      if (typeof window.showDirectoryPicker === 'undefined' || (window.self !== window.top)) {
          configImportRef.current?.click();
          return; 
      }

      setIsLinking(true);
      try {
          await fileSystemService.selectDirectory();
          await configService.loadAutoConfig();
          refreshData();
          setIsSynced(true);
          onUpdate?.();
          alert(t.syncSuccess);
      } catch (e: any) {
          if (e.name !== 'AbortError') {
             configImportRef.current?.click();
          }
      } finally {
          setIsLinking(false);
      }
  };

  const handleExportConfig = () => {
    if (fileSystemService.isHandleReady()) {
        configService.syncMainToDisk().then(ok => ok ? alert(t.syncSuccess) : alert(t.syncError));
        return;
    }

    const data = configService.exportConfigData();
    const filename = configService.CONFIG_FILENAME;

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        configService.importConfigData(json);
        refreshData();
        onUpdate?.();
        alert(t.syncSuccess);
      } catch (e) {
        alert("Invalid JSON Config");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- CRUD Handlers ---
  const handleSaveGroup = (newGroup: AnalysisGroup) => {
    configService.saveGroup(newGroup);
    setEditGroup(null);
    refreshData();
    onUpdate?.();
  };
  const handleDeleteGroup = (id: string) => {
    if (confirm(t.delete + '?')) {
      configService.deleteGroup(id);
      refreshData();
      onUpdate?.();
    }
  };

  const handleSaveTemplate = (newTemplate: AnalysisTemplate) => {
    configService.saveTemplate(newTemplate);
    setEditTemplate(null);
    refreshData();
    onUpdate?.();
  };
  const handleDeleteTemplate = (id: string) => {
    if (confirm(t.delete + '?')) {
      configService.deleteTemplate(id);
      refreshData();
      onUpdate?.();
    }
  };
  
  // Specific handler for General Template Update
  const handleSaveGeneral = (newTemplate: AnalysisTemplate) => {
      // Force ID to match general logic
      const fixed = { ...newTemplate, id: GENERAL_TEMPLATE_ID };
      configService.saveTemplate(fixed);
      refreshData();
      onUpdate?.();
      // Stay on tab, just flash success maybe?
      alert(t.save + ' ' + t.syncSuccess);
  };

  const clearEdits = () => {
      setEditGroup(null);
      setEditTemplate(null);
  };

  if (!isOpen) return null;

  // Filter out General Template from the "Templates" list to avoid duplication
  const displayedTemplates = templates.filter(t => t.id !== GENERAL_TEMPLATE_ID);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        <input type="file" ref={configImportRef} className="hidden" accept=".json" onChange={handleImportConfig} />

        {/* Header */}
        <div className="bg-gray-900 text-white p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold">{t.configManagerTitle}</h2>
          </div>
          
          <div className="flex items-center gap-3">
             <button
                onClick={handleLinkFolder}
                disabled={isLinking}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    isSynced 
                    ? 'bg-green-600/20 text-green-400 border border-green-600/50' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600'
                }`}
                title={isSynced ? t.folderSynced : t.linkFolder}
             >
                {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : isSynced ? <FolderCheck className="w-4 h-4" /> : <FolderSync className="w-4 h-4" />}
                {isSynced ? t.folderSynced : t.linkFolder}
             </button>

             <div className="h-4 w-px bg-gray-700 mx-1" />

             <button onClick={handleExportConfig} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white transition-colors" title="Backup EXCEL_AI.json">
                <Download className="w-3.5 h-3.5" /> {t.exportConfig}
             </button>
             <button onClick={() => configImportRef.current?.click()} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white transition-colors">
                <Upload className="w-3.5 h-3.5" /> {t.importConfig}
             </button>
             
             <div className="h-4 w-px bg-gray-700 mx-1" />
             
             <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Body Layout */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar Tabs */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col p-4 gap-2 shrink-0">
             <button
               onClick={() => { setActiveTab('groups'); clearEdits(); }}
               className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'groups' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-600 hover:bg-gray-200'}`}
             >
               <Layers className="w-4 h-4" /> {t.tabGroups}
             </button>
             
             <button
               onClick={() => { setActiveTab('general'); clearEdits(); }}
               className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-600 hover:bg-gray-200'}`}
             >
               <Star className="w-4 h-4" /> {t.tabGeneral}
             </button>

             <button
               onClick={() => { setActiveTab('templates'); clearEdits(); }}
               className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'templates' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-600 hover:bg-gray-200'}`}
             >
               <MessageSquare className="w-4 h-4" /> {t.tabTemplates}
             </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
             
             {/* List View Header (Only for Groups and Custom Templates) */}
             {((activeTab === 'groups' && !editGroup) || (activeTab === 'templates' && !editTemplate)) && (
                 <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
                    <h3 className="text-2xl font-bold text-gray-800">
                        {activeTab === 'groups' ? t.tabGroups : t.tabTemplates}
                    </h3>
                    <button 
                        onClick={() => {
                            if (activeTab === 'groups') setEditGroup({});
                            else setEditTemplate({});
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-100"
                    >
                        <Plus className="w-4 h-4" /> {t.add}
                    </button>
                 </div>
             )}

             {/* Content Scroll Area */}
             <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30 custom-scrollbar">
                
                {/* 1. GROUPS VIEW */}
                {activeTab === 'groups' && !editGroup && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {groups.length === 0 && <p className="text-gray-400 italic col-span-full text-center py-10">{t.noItems}</p>}
                        {groups.map(group => (
                            <div key={group.id} className="bg-white p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group relative">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-lg text-gray-800">{group.name}</h4>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditGroup(group)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded bg-gray-50 hover:bg-blue-50"><Settings className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeleteGroup(group.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded bg-gray-50 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[1.25rem]">{group.description}</p>
                                <div className="flex flex-wrap gap-2">
                                    {group.templateIds?.map(tid => {
                                        const tmpl = templates.find(t => t.id === tid);
                                        return tmpl ? (
                                            <span key={tid} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 truncate max-w-[150px]">{tmpl.name}</span>
                                        ) : null;
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === 'groups' && editGroup && (
                    <ConfigGroupEditor group={editGroup} templates={templates} language={language} onSave={handleSaveGroup} onCancel={() => setEditGroup(null)} />
                )}

                {/* 2. GENERAL VIEW (Single Editor) */}
                {activeTab === 'general' && (
                    <div>
                         <h3 className="text-2xl font-bold text-gray-800 mb-4">{t.defaultAnalysis}</h3>
                         {generalTemplate ? (
                             <ConfigTemplateEditor 
                                template={generalTemplate} 
                                language={language} 
                                onSave={handleSaveGeneral} 
                                onCancel={() => {/* General tab doesn't cancel back to list */}} 
                             />
                         ) : (
                             <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                                <p className="text-gray-500 mb-4">Configuration missing for Default Analysis.</p>
                                <button 
                                    onClick={() => {
                                        configService.ensureDefaults();
                                        refreshData();
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
                                >
                                    {t.create || 'Initialize Default'}
                                </button>
                             </div>
                         )}
                    </div>
                )}

                {/* 3. CUSTOM TEMPLATES VIEW */}
                {activeTab === 'templates' && !editTemplate && (
                    <div className="grid grid-cols-1 gap-4">
                        {displayedTemplates.length === 0 && <p className="text-gray-400 italic text-center py-10">{t.noItems}</p>}
                        {displayedTemplates.map(tmpl => (
                            <div key={tmpl.id} className="bg-white p-5 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all group">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-purple-100 p-1.5 rounded text-purple-600"><MessageSquare className="w-4 h-4" /></div>
                                        <h4 className="font-bold text-lg text-gray-800">{tmpl.name}</h4>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditTemplate(tmpl)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded bg-gray-50 hover:bg-blue-50"><Settings className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeleteTemplate(tmpl.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded bg-gray-50 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">{tmpl.description}</p>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === 'templates' && editTemplate && (
                    <ConfigTemplateEditor template={editTemplate} language={language} onSave={handleSaveTemplate} onCancel={() => setEditTemplate(null)} />
                )}

             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigManager;