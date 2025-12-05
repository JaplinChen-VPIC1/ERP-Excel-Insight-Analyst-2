
import { AnalysisTemplate, AnalysisGroup } from '../types';
import { fileSystemService } from './fileSystemService';

// Storage Keys
const KEYS = {
  TEMPLATES: 'app_templates',
  GROUPS: 'app_groups',
};

// --- Storage Helpers ---
const save = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));
const load = <T>(key: string): T[] => {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : [];
};

/**
 * REFACTORED: Reverted to Single Config File (EXCEL_AI.json)
 * - Removes Cleaning Rules complexity
 */
export const configService = {
  CONFIG_FILENAME: 'EXCEL_AI.json',

  // Templates CRUD
  getTemplates: () => load<AnalysisTemplate>(KEYS.TEMPLATES),
  saveTemplate: (tmpl: AnalysisTemplate) => {
    const list = load<AnalysisTemplate>(KEYS.TEMPLATES);
    const index = list.findIndex(t => t.id === tmpl.id);
    if (index >= 0) list[index] = tmpl;
    else list.push(tmpl);
    save(KEYS.TEMPLATES, list);
    configService.syncMainToDisk();
  },
  deleteTemplate: (id: string) => {
    const list = load<AnalysisTemplate>(KEYS.TEMPLATES).filter(t => t.id !== id);
    save(KEYS.TEMPLATES, list);
    configService.syncMainToDisk();
  },

  // Groups CRUD
  getGroups: () => load<AnalysisGroup>(KEYS.GROUPS),
  saveGroup: (group: AnalysisGroup) => {
    const list = load<AnalysisGroup>(KEYS.GROUPS);
    const index = list.findIndex(g => g.id === group.id);
    if (index >= 0) list[index] = group;
    else list.push(group);
    save(KEYS.GROUPS, list);
    configService.syncMainToDisk();
  },
  deleteGroup: (id: string) => {
    const list = load<AnalysisGroup>(KEYS.GROUPS).filter(g => g.id !== id);
    save(KEYS.GROUPS, list);
    configService.syncMainToDisk();
  },

  // --- Export / Import Logic ---
  
  exportConfigData: () => {
    return {
      groups: load<AnalysisGroup>(KEYS.GROUPS),
      templates: load<AnalysisTemplate>(KEYS.TEMPLATES),
      exportedAt: new Date().toISOString(),
      version: '3.0',
      type: 'main'
    };
  },

  importConfigData: (data: any) => {
    if (!data) throw new Error("Invalid config file");
    
    if (data.groups) save(KEYS.GROUPS, data.groups);
    if (data.templates) save(KEYS.TEMPLATES, data.templates);
  },
  
  // --- File System Sync Logic ---
  
  loadAutoConfig: async () => {
      if (!fileSystemService.isHandleReady()) return false;
      try {
          const mainContent = await fileSystemService.readTextFile('', configService.CONFIG_FILENAME);
          if (mainContent) {
              configService.importConfigData(JSON.parse(mainContent));
              console.log(`Auto-loaded ${configService.CONFIG_FILENAME}`);
              return true;
          }
      } catch (e) {
          console.warn("Failed to auto-load config", e);
      }
      return false;
  },

  syncMainToDisk: async () => {
     if (!fileSystemService.isHandleReady()) return false;
     try {
         const data = configService.exportConfigData();
         const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
         await fileSystemService.writeBinaryFile('', configService.CONFIG_FILENAME, blob);
         return true;
     } catch (e) {
         console.error("Sync Main failed", e);
         return false;
     }
  }
};
