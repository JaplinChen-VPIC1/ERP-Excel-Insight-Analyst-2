
import React from 'react';
import { FileSpreadsheet, X, Layers, MessageSquare, Play } from 'lucide-react';
import { AnalysisGroup, AnalysisTemplate, Language } from '../types';
import { translations } from '../i18n';

interface FileStagingProps {
  stagedFiles: File[];
  selectedContextId: string;
  availableGroups: AnalysisGroup[];
  availableTemplates: AnalysisTemplate[];
  language: Language;
  onClear: () => void;
  onSelectContext: (id: string) => void;
  onStartAnalysis: () => void;
}

const FileStaging: React.FC<FileStagingProps> = ({
  stagedFiles,
  selectedContextId,
  availableGroups,
  availableTemplates,
  language,
  onClear,
  onSelectContext,
  onStartAnalysis
}) => {
  const t = translations[language];

  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-200 p-8 animate-slide-up">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="bg-green-100 p-2 rounded-full">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.filesSelected}</h3>
            <p className="text-sm text-gray-500">{stagedFiles.length} file(s) ready</p>
          </div>
        </div>
        <button onClick={onClear} className="text-gray-400 hover:text-red-500 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6">
        {/* File List Summary */}
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 max-h-32 overflow-y-auto custom-scrollbar">
          {stagedFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              {f.name}
            </div>
          ))}
        </div>

        {/* Context Selector */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            {stagedFiles.length > 1 ? <Layers className="w-4 h-4 text-purple-600" /> : <MessageSquare className="w-4 h-4 text-blue-600" />}
            {stagedFiles.length > 1 ? t.multiFileContext : t.singleFileContext}
          </label>
          
          {stagedFiles.length > 1 ? (
            // Group Selector (Multi File)
            <select 
              value={selectedContextId}
              onChange={(e) => onSelectContext(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
            >
              {availableGroups.length === 0 && <option value="">{t.noItems}</option>}
              {availableGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            // Template Selector (Single File)
            <select 
              value={selectedContextId}
              onChange={(e) => onSelectContext(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              {availableTemplates.length === 0 && <option value="">{t.noItems}</option>}
              {availableTemplates.map(tmpl => (
                <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button 
            onClick={onClear}
            className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
          >
            {t.reselect}
          </button>
          <button 
            onClick={onStartAnalysis}
            className={`flex-[2] px-4 py-3 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${
              stagedFiles.length > 1 ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            {t.startAnalysis}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileStaging;
