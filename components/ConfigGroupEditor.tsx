
import React, { useState, useEffect } from 'react';
import { AnalysisGroup, AnalysisTemplate, Language } from '../types';
import { CheckSquare, Square } from 'lucide-react';
import { translations } from '../i18n';

interface ConfigGroupEditorProps {
  group: Partial<AnalysisGroup>;
  templates: AnalysisTemplate[];
  language: Language;
  onSave: (group: AnalysisGroup) => void;
  onCancel: () => void;
}

const ConfigGroupEditor: React.FC<ConfigGroupEditorProps> = ({ 
  group: initialGroup, 
  templates, 
  language, 
  onSave, 
  onCancel 
}) => {
  const [group, setGroup] = useState<Partial<AnalysisGroup>>(initialGroup);
  const t = translations[language];

  useEffect(() => {
    setGroup(initialGroup);
  }, [initialGroup]);

  const toggleTemplate = (tmplId: string) => {
    const currentIds = group.templateIds || [];
    if (currentIds.includes(tmplId)) {
      setGroup({ ...group, templateIds: currentIds.filter(id => id !== tmplId) });
    } else {
      setGroup({ ...group, templateIds: [...currentIds, tmplId] });
    }
  };

  const handleSave = () => {
    if (!group.name) return;
    onSave({
      id: group.id || Date.now().toString(),
      name: group.name,
      description: group.description || '',
      templateIds: group.templateIds || []
    });
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
      <h3 className="text-xl font-bold text-gray-800 mb-6">{group.id ? t.edit : t.create}</h3>
      
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">{t.lblRoleName}</label>
          <input 
            type="text" 
            value={group.name || ''} 
            onChange={e => setGroup({...group, name: e.target.value})}
            className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g. Sales Manager View"
          />
        </div>
        
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">{t.lblDesc}</label>
          <input 
            type="text" 
            value={group.description || ''} 
            onChange={e => setGroup({...group, description: e.target.value})}
            className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-3">{t.lblLinkTemplates}</label>
          <div className="grid gap-3 max-h-60 overflow-y-auto border border-gray-200 rounded-xl p-2 bg-gray-50 custom-scrollbar">
            {templates.length === 0 && <p className="text-sm text-gray-400 p-2 text-center">{t.noItems}</p>}
            {templates.map(tmpl => {
              const isSelected = group.templateIds?.includes(tmpl.id);
              return (
                <div 
                  key={tmpl.id} 
                  onClick={() => toggleTemplate(tmpl.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:border-gray-200'}`}
                >
                  {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                  <div>
                    <div className={`font-medium ${isSelected ? 'text-blue-800' : 'text-gray-700'}`}>{tmpl.name}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[300px]">{tmpl.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-4 mt-4 border-t border-gray-100">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">{t.cancel}</button>
          <button onClick={handleSave} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">{t.save}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfigGroupEditor;
