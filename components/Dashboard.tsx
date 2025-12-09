
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnalysisResult, ExcelDataRow, Language } from '../types';
import ChartRenderer from './ChartRenderer';
import DataTable from './DataTable';
import { Sparkles, FileText, Download, FilterX, RefreshCw, Clock, AlertCircle, Lightbulb, Loader2, ChevronDown, Plus } from 'lucide-react';
import { exportToCSV, exportToJSON, exportToExcel, exportToPDF, exportToPPTX } from '../utils';
import { translations } from '../i18n';
import { Responsive, WidthProvider } from 'react-grid-layout';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardProps {
  analysis: AnalysisResult;
  data: ExcelDataRow[];
  fileName: string;
  onReset: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated: number;
  language: Language;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  analysis, 
  data, 
  fileName, 
  onReset,
  onRefresh,
  isRefreshing,
  lastUpdated,
  language
}) => {
  const t = translations[language];
  
  // Refresh settings
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);

  // Export settings
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Drill Down State
  const [drillDown, setDrillDown] = useState<{ column: string; value: string } | null>(null);

  // Grid Layout State
  const [layouts, setLayouts] = useState<any>({ lg: [] });

  // Init Layout
  useEffect(() => {
    const initialLayout = analysis.charts.map((chart, i) => ({
      i: chart.id,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 10,
      w: 6,
      h: 12,
      minW: 3,
      minH: 8
    }));
    setLayouts({ lg: initialLayout, md: initialLayout, sm: initialLayout });
  }, [analysis]);

  // Auto-refresh logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAutoRefresh) {
      interval = setInterval(() => {
        onRefresh();
      }, 5 * 60 * 1000); // 5 minutes
    }
    return () => clearInterval(interval);
  }, [isAutoRefresh, onRefresh]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Drill Down Filtering Logic (Global for Charts)
  const filteredData = useMemo(() => {
    let res = data;
    // Apply Drill Down
    if (drillDown) {
      res = res.filter(row => String(row[drillDown.column]) === drillDown.value);
    }
    return res;
  }, [data, drillDown]);

  const handleChartClick = (column: string, value: string) => {
    setDrillDown({ column, value });
  };

  const handleExport = async (format: 'csv' | 'json' | 'excel' | 'pdf' | 'pptx') => {
    setIsExportMenuOpen(false);
    setIsExporting(true);
    setTimeout(async () => {
      try {
        if (format === 'csv') exportToCSV(filteredData, `${fileName || 'export'}.csv`);
        if (format === 'json') exportToJSON(filteredData, `${fileName || 'export'}.json`);
        if (format === 'excel') exportToExcel(filteredData, `${fileName || 'export'}.xlsx`, analysis, language);
        if (format === 'pdf') await exportToPDF('dashboard-content', `${fileName || 'report'}.pdf`);
        if (format === 'pptx') await exportToPPTX(analysis, `${fileName || 'presentation'}.pptx`, language);
      } catch (e) {
        console.error(e);
        alert(t.unknownError);
      } finally {
        setIsExporting(false);
      }
    }, 100);
  };

  // --- Smart Text Formatting Helper ---
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    
    // 1. Force newline after Chinese period to create clear paragraphs
    // Also handle Markdown bolding if AI returns it
    const processedText = text.replace(/。/g, '。\n\n');

    // Regex to detect numbers/percentages for highlighting
    // Matches: 123, 1,234, 12.34, 88%, $100
    const numberRegex = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)/g;

    return processedText.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />; // Spacer

        // 2. Detect List Items (- or • or 1.)
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) {
            // Remove the bullet char for cleaner rendering
            const content = trimmed.replace(/^[-•]\s?/, '').replace(/^\d+\.\s?/, '');
            return (
                <div key={i} className="flex gap-3 pl-2 mb-2 items-start group">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 group-hover:scale-125 transition-transform" />
                    <span className="text-gray-700 leading-relaxed text-sm md:text-base">
                        {content.split(numberRegex).map((part, idx) => {
                            if (numberRegex.test(part)) {
                                return <strong key={idx} className="text-indigo-700 font-mono bg-indigo-50 px-1 rounded mx-0.5 text-sm">{part}</strong>;
                            }
                            if (part.includes('**')) {
                                return <span key={idx} dangerouslySetInnerHTML={{ __html: part.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />;
                            }
                            return part;
                        })}
                    </span>
                </div>
            );
        }

        // 3. Detect Headers (Short lines, no end punctuation)
        if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.endsWith('。') && !trimmed.endsWith('：') && !trimmed.endsWith(':')) {
             // Treat as a sub-header
             return <h4 key={i} className="font-bold text-gray-800 mt-4 mb-2 text-lg border-l-4 border-blue-500 pl-3">{trimmed}</h4>
        }

        // 4. Regular Paragraph
        return (
            <p key={i} className="text-gray-700 leading-relaxed mb-3 text-justify text-sm md:text-base">
                {line.split(numberRegex).map((part, idx) => {
                    if (numberRegex.test(part) && part.length > 1) { 
                        return <strong key={idx} className="text-blue-700 font-medium">{part}</strong>;
                    }
                    if (part.includes('**')) {
                        return <span key={idx} dangerouslySetInnerHTML={{ __html: part.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />;
                    }
                    return part;
                })}
            </p>
        );
    });
  };

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in" id="dashboard-content">
      
      {/* 1. Toolbar / Report Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm w-full">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
             <div>
                <div className="flex items-center gap-2">
                   <FileText className="w-5 h-5 text-blue-600" />
                   <h2 className="text-lg font-bold text-gray-800">{t.reportTitle}</h2>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                   <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-medium truncate max-w-[200px]" title={fileName}>{fileName}</span>
                   <span>•</span>
                   <span>{t.displayCount} <strong className="text-gray-800">{filteredData.length.toLocaleString()}</strong> {t.dataCount}</span>
                </div>
             </div>

             <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200 mr-2">
                   <button onClick={onRefresh} disabled={isRefreshing} className={`p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-white transition-all ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} title={t.manualRefresh}>
                     <RefreshCw className="w-4 h-4" />
                   </button>
                   <div className="w-px h-4 bg-gray-300 mx-1"></div>
                   <button onClick={() => setIsAutoRefresh(!isAutoRefresh)} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${isAutoRefresh ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:text-gray-700 hover:bg-white'}`} title={t.autoRefresh}>
                     <Clock className="w-3 h-3" /> {isAutoRefresh ? 'ON' : 'OFF'}
                   </button>
                </div>

                <div className="relative" ref={exportMenuRef}>
                   <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-70">
                     {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {isExporting ? t.exporting : t.export} <ChevronDown className="w-3 h-3" />
                   </button>
                   {isExportMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-1 z-50 animate-fade-in">
                         {['csv', 'json', 'excel', 'pdf', 'pptx'].map(fmt => (
                            <button key={fmt} onClick={() => handleExport(fmt as any)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md">{(t as any)[`export${fmt.toUpperCase()}`]}</button>
                         ))}
                      </div>
                   )}
                </div>

                <button onClick={onReset} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
                  <Plus className="w-4 h-4" /> {t.uploadNew}
                </button>
             </div>
         </div>
      </div>

      {/* 2. Combined AI Summary & Insights Card (New Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Executive Summary Column (1/3) */}
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
                  <h3 className="text-lg font-bold text-white tracking-wide">{t.aiSummary}</h3>
              </div>
              <div className="p-6 bg-white min-h-[200px] flex-1">
                  {isRefreshing ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p className="italic">{t.updating}</p>
                    </div>
                  ) : (
                    <div className="prose prose-blue max-w-none">
                        {renderFormattedText(analysis.summary)}
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400 italic flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {t.insightNote}
                      </p>
                  </div>
              </div>
          </div>

          {/* Key Insights Column (2/3) */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
             <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold text-gray-800">{t.sheetInsights}</h3>
             </div>
             <div className="p-5 space-y-3 flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
               {analysis.keyInsights.map((insight, idx) => {
                  const parts = insight.split(/[:：]/);
                  const title = parts.length > 1 ? parts[0] : null;
                  const content = parts.length > 1 ? parts.slice(1).join(':') : insight;
                  return (
                    <div key={idx} className="group p-4 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all duration-300">
                      <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              {idx + 1}
                          </div>
                          <div className="text-sm text-gray-600 leading-relaxed">
                              {title && <span className="block text-gray-900 font-bold mb-1">{title}</span>}
                              {content}
                          </div>
                      </div>
                    </div>
                  );
               })}
             </div>
          </div>
      </div>

      {/* 3. Drill Down Banner */}
      {drillDown && (
         <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between animate-fade-in shadow-sm mx-1">
            <div className="flex items-center gap-3">
               <div className="bg-blue-100 p-2 rounded-full"><FilterX className="w-4 h-4 text-blue-600" /></div>
               <div>
                  <h4 className="font-bold text-blue-800 text-sm flex items-center gap-2">{t.drillDownActive}: <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-600 font-mono">{drillDown.column} = {drillDown.value}</span></h4>
                  <p className="text-xs text-blue-600 mt-0.5">{t.drillDownDesc}</p>
               </div>
            </div>
            <button onClick={() => setDrillDown(null)} className="text-sm text-blue-600 hover:text-blue-800 font-bold hover:bg-blue-100 px-4 py-1.5 rounded-lg transition-colors">{t.clearDrillDown}</button>
         </div>
      )}

      {/* 4. Charts Grid (Draggable) */}
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 12, sm: 12 }}
        rowHeight={30}
        draggableHandle=".drag-handle"
        onLayoutChange={(currentLayout, allLayouts) => setLayouts(allLayouts)}
      >
        {analysis.charts.map((chart, index) => {
          const hasData = filteredData.length > 0;
          return (
             <div key={chart.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                {hasData ? (
                   <ChartRenderer 
                     config={chart} 
                     data={filteredData} 
                     index={index} 
                     onDataClick={handleChartClick}
                     language={language}
                     drillDown={drillDown}
                     onClearDrillDown={() => setDrillDown(null)}
                   />
                ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                      <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                      <p>{t.chartNoData}</p>
                   </div>
                )}
             </div>
          );
        })}
      </ResponsiveGridLayout>

      {/* 5. Data Preview Table */}
      <DataTable data={filteredData} language={language} itemsPerPage={10} />

    </div>
  );
};

export default Dashboard;
