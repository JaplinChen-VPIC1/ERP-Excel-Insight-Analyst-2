
import React, { useState, useEffect } from 'react';
import { ExcelDataRow, AnalysisResult, AppState, Language, AnalysisGroup, AnalysisTemplate } from './types';
import { parseMultipleExcelFiles } from './services/excelService';
import { analyzeDataWithGemini } from './services/geminiService';
import { configService } from './services/configService';
import { fileSystemService } from './services/fileSystemService';
import { cleanAndEnrichData } from './utils';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import ChatBot from './components/ChatBot';
import ConfigManager from './components/ConfigManager';
import FileStaging from './components/FileStaging';
import { Bot, AlertCircle, Globe, Settings, Database, AlertTriangle } from 'lucide-react';
import { translations } from '../i18n';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [rawData, setRawData] = useState<ExcelDataRow[]>([]); // Keep raw data for re-cleaning
  const [data, setData] = useState<ExcelDataRow[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [language, setLanguage] = useState<Language>('en-US');
  const t = translations[language];

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showRestoreStorage, setShowRestoreStorage] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Staging
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [selectedContextId, setSelectedContextId] = useState(''); 

  const [availableGroups, setAvailableGroups] = useState<AnalysisGroup[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<AnalysisTemplate[]>([]);

  useEffect(() => {
    document.title = t.appTitle;
  }, [language, t]);

  useEffect(() => {
    const initApp = async () => {
        const savedHandle = await fileSystemService.getStoredHandle();
        if (savedHandle) {
            const hasPermission = await fileSystemService.verifyPermission(savedHandle, false);
            fileSystemService.setRootHandle(savedHandle);
            if (hasPermission) {
                await configService.loadAutoConfig();
            } else {
                setShowRestoreStorage(true);
            }
        }
        refreshConfigs();
    };
    initApp();
  }, []);

  const handleRestoreStorageAccess = async () => {
      const savedHandle = await fileSystemService.getStoredHandle();
      if (!savedHandle) return;
      setIsRestoring(true);
      try {
          const granted = await fileSystemService.verifyPermission(savedHandle, true);
          if (granted) {
              fileSystemService.setRootHandle(savedHandle);
              await configService.loadAutoConfig();
              refreshConfigs();
              setShowRestoreStorage(false);
              alert(t.accessRestored);
          } else {
              alert(t.permissionDenied);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsRestoring(false);
      }
  };

  const refreshConfigs = () => {
    setAvailableGroups(configService.getGroups());
    setAvailableTemplates(configService.getTemplates());
  };

  const getActiveTemplates = (): AnalysisTemplate[] | undefined => {
    if (!selectedContextId) return undefined;
    if (stagedFiles.length > 1) {
       const group = availableGroups.find(g => g.id === selectedContextId);
       if (!group) return undefined;
       return availableTemplates.filter(t => group.templateIds && group.templateIds.includes(t.id));
    }
    if (stagedFiles.length === 1) {
       const template = availableTemplates.find(t => t.id === selectedContextId);
       return template ? [template] : undefined;
    }
    return undefined;
  };

  // Optimized Language Switch Effect with Race Condition Protection
  useEffect(() => {
    let isAborted = false; // Flag to track if the effect has been cleaned up

    const updateAnalysisForLanguage = async () => {
      if (appState === AppState.SUCCESS && data.length > 0) {
        setIsRefreshing(true);
        try {
          const activeTemplates = getActiveTemplates();
          const newAnalysis = await analyzeDataWithGemini(
            data, 
            language, 
            undefined, 
            undefined, 
            undefined, 
            activeTemplates
          );
          
          // Only update state if this request hasn't been superseded
          if (!isAborted) {
            setAnalysis(newAnalysis);
            setLastUpdated(Date.now());
          }
        } catch (error) {
          if (!isAborted) {
            console.error("Language update failed:", error);
          }
        } finally {
          if (!isAborted) {
            setIsRefreshing(false);
          }
        }
      }
    };

    updateAnalysisForLanguage();

    // Cleanup function: runs when language changes again or component unmounts
    return () => {
      isAborted = true;
    };
  }, [language]); 

  const handleFilesDropped = (files: File[]) => {
      setStagedFiles(files);
      // Auto-select logic
      if (files.length === 1 && configService.getTemplates().length > 0) {
          setSelectedContextId(configService.getTemplates()[0].id);
      } else if (files.length > 1 && configService.getGroups().length > 0) {
          setSelectedContextId(configService.getGroups()[0].id);
      } else {
          setSelectedContextId('');
      }
      setErrorMessage('');
  };

  const handleStartAnalysis = async () => {
    try {
      setAppState(AppState.PARSING);
      const files = stagedFiles;
      
      if (files.length === 1) {
        setFileName(files[0].name);
      } else {
        setFileName(`${files[0].name} + ${files.length - 1} others`);
      }
      
      for (const file of files) {
          await fileSystemService.saveExcelFile(file);
      }

      const parsedData = await parseMultipleExcelFiles(files);
      setRawData(parsedData); // Store raw data

      // Clean Data (Hardcoded Logic)
      // We clone it to ensure rawData stays pure
      const workData = parsedData.map(r => ({ ...r }));
      const cleanedData = cleanAndEnrichData(workData);
      
      setData(cleanedData);
      setAppState(AppState.ANALYZING);

      const activeTemplates = getActiveTemplates();
      const aiResult = await analyzeDataWithGemini(cleanedData, language, undefined, undefined, undefined, activeTemplates);
      
      setAnalysis(aiResult);
      setLastUpdated(Date.now());
      setAppState(AppState.SUCCESS);

    } catch (error: any) {
      console.error(error);
      setAppState(AppState.ERROR);
      setErrorMessage(error.message || t.unknownError);
    }
  };

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setData([]);
    setRawData([]);
    setAnalysis(null);
    setFileName('');
    setErrorMessage('');
    setIsRefreshing(false);
    setStagedFiles([]);
    setSelectedContextId('');
  };

  const handleAnalysisUpdate = (newAnalysis: AnalysisResult) => {
    setAnalysis(newAnalysis);
    setLastUpdated(Date.now());
  };

  const handleRefresh = async () => {
    if (isRefreshing || !data.length) return;
    setIsRefreshing(true);
    try {
      const activeTemplates = getActiveTemplates();
      const newAnalysis = await analyzeDataWithGemini(data, language, undefined, undefined, undefined, activeTemplates);
      setAnalysis(newAnalysis);
      setLastUpdated(Date.now());
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
               <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600 hidden sm:block">
              {t.appTitle}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {showRestoreStorage && (
                <button 
                    onClick={handleRestoreStorageAccess}
                    disabled={isRestoring}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-sm hover:bg-amber-100 transition-colors animate-pulse"
                    title="Click to restore access to your Config Folder"
                >
                    <Database className="w-4 h-4" />
                    {isRestoring ? 'Restoring...' : t.restoreAccess}
                    <AlertTriangle className="w-4 h-4" />
                </button>
            )}

            <button 
              onClick={() => setIsConfigOpen(true)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-2"
              title={t.configManagerTitle}
            >
              <Settings className="w-5 h-5" />
            </button>

            <div className="relative group">
              <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 py-2 px-2 rounded hover:bg-gray-50 transition-colors">
                <Globe className="w-4 h-4" />
                <span className="pt-[1px]">
                  {language === 'zh-TW' && '繁體中文'}
                  {language === 'en-US' && 'English'}
                  {language === 'vi-VN' && 'Tiếng Việt'}
                </span>
              </button>
              <div className="absolute right-0 top-full pt-2 w-32 hidden group-hover:block z-50">
                <div className="bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden">
                  <button onClick={() => setLanguage('zh-TW')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">繁體中文</button>
                  <button onClick={() => setLanguage('en-US')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">English</button>
                  <button onClick={() => setLanguage('vi-VN')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">Tiếng Việt</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full flex-grow ${appState === AppState.SUCCESS ? 'pt-0' : 'pt-8'}`}>
        
        {appState === AppState.ERROR && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 mt-6">
            <AlertCircle className="w-5 h-5" />
            <p>{errorMessage}</p>
            <button onClick={handleReset} className="ml-auto text-sm underline hover:text-red-800">{t.retry}</button>
          </div>
        )}

        {(appState === AppState.IDLE || appState === AppState.PARSING || appState === AppState.ANALYZING) && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="text-center mb-8 max-w-2xl">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                {t.heroTitle}
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                {t.heroDesc}
              </p>
            </div>
            
            {stagedFiles.length === 0 ? (
                <FileUpload 
                     onFileUpload={handleFilesDropped} 
                     isLoading={false} 
                     language={language}
                />
            ) : (
                <FileStaging
                  stagedFiles={stagedFiles}
                  selectedContextId={selectedContextId}
                  availableGroups={availableGroups}
                  availableTemplates={availableTemplates}
                  language={language}
                  onClear={() => { setStagedFiles([]); setSelectedContextId(''); }}
                  onSelectContext={setSelectedContextId}
                  onStartAnalysis={handleStartAnalysis}
                />
            )}

            {(appState === AppState.PARSING || appState === AppState.ANALYZING) && (
              <div className="mt-8 w-full max-w-md space-y-4">
                 <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                        <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                            {appState === AppState.PARSING ? t.stepParsing : t.stepAnalyzing}
                        </span>
                        <span className="text-xs font-semibold inline-block text-blue-600">
                            {appState === AppState.PARSING ? '30%' : '80%'}
                        </span>
                    </div>
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                        <div style={{ width: appState === AppState.PARSING ? '30%' : '80%' }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-1000 ease-out"></div>
                    </div>
                 </div>
              </div>
            )}
          </div>
        )}

        {appState === AppState.SUCCESS && analysis && (
          <>
            <Dashboard 
              analysis={analysis} 
              data={data} 
              fileName={fileName}
              onReset={handleReset}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              lastUpdated={lastUpdated}
              language={language}
            />
            <ChatBot 
              data={data} 
              onAnalysisUpdate={handleAnalysisUpdate} 
              language={language}
              templates={getActiveTemplates()}
            />
          </>
        )}
      </main>

      <ConfigManager 
         isOpen={isConfigOpen} 
         onClose={() => setIsConfigOpen(false)} 
         language={language} 
         onUpdate={refreshConfigs}
      />

      <footer className="py-6 text-center text-sm text-gray-500 border-t border-gray-100 bg-white">
        {t.poweredBy}
      </footer>
    </div>
  );
};

export default App;
