
import React, { useState, useEffect } from 'react';
import { AnalysisTemplate, Language } from '../types';
import { translations } from '../i18n';
import { BEST_PRACTICE_PROMPT_TEMPLATE } from '../services/configService';
import { Wand2, Eraser } from 'lucide-react';

interface ConfigTemplateEditorProps {
  template: Partial<AnalysisTemplate>;
  language: Language;
  onSave: (template: AnalysisTemplate) => void;
  onCancel: () => void;
}

const ConfigTemplateEditor: React.FC<ConfigTemplateEditorProps> = ({
  template: initialTemplate,
  language,
  onSave,
  onCancel
}) => {
  const [template, setTemplate] = useState<Partial<AnalysisTemplate>>(initialTemplate);
  const t = translations[language];

  useEffect(() => {
    setTemplate(initialTemplate);
  }, [initialTemplate]);

  const handleSave = () => {
    if (!template.name) return;
    onSave({
      id: template.id || Date.now().toString(),
      name: template.name,
      description: template.description || '',
      systemInstruction: template.systemInstruction || '',
      customPrompt: template.customPrompt || ''
    });
  };

  const handleLoadBestPractice = () => {
      setTemplate(prev => ({
          ...prev,
          customPrompt: BEST_PRACTICE_PROMPT_TEMPLATE
      }));
  };

  const handleClearPrompt = () => {
      if (confirm('Are you sure you want to clear the prompt?')) {
          setTemplate(prev => ({
              ...prev,
              customPrompt: ''
          }));
      }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
      <h3 className="text-xl font-bold text-gray-800 mb-6">{template.id ? t.edit : t.create}</h3>
      
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{t.lblTmplName}</label>
            <input 
              type="text" 
              value={template.name || ''} 
              onChange={e => setTemplate({...template, name: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="e.g. Inventory Audit"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{t.lblDesc}</label>
            <input 
              type="text" 
              value={template.description || ''} 
              onChange={e => setTemplate({...template, description: e.target.value})}
              className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">{t.lblSysInstr}</label>
          <textarea 
            value={template.systemInstruction || ''} 
            onChange={e => setTemplate({...template, systemInstruction: e.target.value})}
            className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 font-mono text-sm focus:ring-2 focus:ring-purple-500 outline-none h-24 resize-y"
            placeholder="You are a strict financial auditor..."
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
             <label className="block text-sm font-bold text-gray-700">{t.lblAnalysisPrompt}</label>
             <div className="flex items-center gap-2">
                 <button 
                    onClick={handleLoadBestPractice}
                    className="text-xs flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-md hover:bg-purple-200 transition-colors"
                    title="Fill with structured guidance based on best practices"
                 >
                    <Wand2 className="w-3 h-3" />
                    {t.loadTemplate}
                 </button>
                 <button 
                    onClick={handleClearPrompt}
                    className="text-xs flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-1 rounded-md hover:bg-gray-200 transition-colors"
                    title="Clear content"
                 >
                    <Eraser className="w-3 h-3" />
                    {t.clear}
                 </button>
             </div>
          </div>
          <textarea 
            value={template.customPrompt || ''} 
            onChange={e => setTemplate({...template, customPrompt: e.target.value})}
            className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 font-mono text-sm focus:ring-2 focus:ring-purple-500 outline-none h-[600px] resize-y"
            placeholder={`Write your specific analysis instructions here (Markdown supported).\nExample:\n- Focus on Q3 Sales\n- Highlight top 3 anomalies`}
          />
        </div>

        <div className="flex gap-3 pt-4 mt-4 border-t border-gray-100">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">{t.cancel}</button>
          <button onClick={handleSave} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">{t.save}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfigTemplateEditor;
