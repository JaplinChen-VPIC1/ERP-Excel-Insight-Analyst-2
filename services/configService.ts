import { AnalysisTemplate, AnalysisGroup } from '../types';
import { fileSystemService } from './fileSystemService';

// Storage Keys
const KEYS = {
  TEMPLATES: 'app_templates',
  GROUPS: 'app_groups',
};

export const GENERAL_TEMPLATE_ID = 'general-analysis';

export const BEST_PRACTICE_PROMPT_TEMPLATE = `### 1. 資料欄位標準化 (Data Standardization)
- **[欄位語意]**: 在策略設定中，先定義欄位語意（如「單價」「幣別」「預計到貨日」「實際到貨日」）。
- **[必填與格式]**: 宣告哪些欄位必填、格式要求（日期格式 YYYY/MM/DD、數值精度）。AI 收到明確欄位說明，能更準確做計算與比較。

### 2. 樣本與基準範例 (Examples & Baseline)
- **[分析場景]**: 為常見的分析場景附上 1~2 筆範例資料。
- **[預期輸出]**: 定義預期輸出（如 KPI 計算方式、報表摘要示例），讓模型學習「這類資料要得出怎樣的洞察」。

### 3. 業務規則模板化 (Business Rules)
- **[計算邏輯]**: 將計算邏輯寫成規則清單或公式（如：交期偏差 = 實際到貨日 - 預計到貨日；交期達成率；單價波動標準差）。
- **[判斷條件]**: 定義缺料判斷條件等，模型即可直接套用，減少自由解讀。

### 4. 分析優先順序與輸出格式 (Output Strategy)
- **[輸出結構]**: 指定輸出結構（摘要、Top N 異常、風險清單、建議）。
- **[排序規則]**: 指明排序規則（嚴重度、金額影響、時間緊迫度）。
- **[表格要求]**: 要求表格欄位名稱（例如：料號、供應商、預計到貨日、風險等級）。

### 5. 角色/情境切換 (Role & Context)
- **[決策視角]**: 將不同決策視角（採購主管、財務、倉儲、品管）做成可切換模板。
- **[關注指標]**: 描述該角色關注的指標與語氣，讓 AI 生成更貼近使用者的觀點。

### 6. 語言與風格 (Language & Tone)
- **[語言]**: 指定輸出語言（例如 zh-TW）。
- **[語氣]**: 指定語氣（精簡條列、決策導向），避免混用語言或冗長敘述。

### 7. 數據品質與限制提示 (Data Quality)
- **[容錯規則]**: 加入缺值、異常值的處理方式。
- **[限制提示]**: 加入時間/成本限制提示。
- **[回覆策略]**: 若資料不足時的回覆策略（如回傳需補欄位清單）。

### 8. 可參數化門檻 (Thresholds)
- **[門檻設定]**: 常用閾值（缺料天數、遲延天數、波動率門檻）放在設定裡，可由使用者調整。
- **[風險分級]**: AI 根據門檻產生不同的風險分級與建議。

### 9. 審核/版本化 (Versioning)
- **[版本說明]**: 對策略版本加註說明與修改紀錄。
- **[審核備註]**: 必要時提供「審核者備註」欄位，讓 AI 知道哪些規則是最新、哪些需保留兼容。

### 10. 安全與隱私 (Security & Privacy)
- **[敏感處理]**: 加入敏感欄位處理規範（是否需遮蔽供應商代碼、單價等），避免模型輸出不該披露的資訊。`;

// --- Storage Helpers ---
const save = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));
const load = <T>(key: string): T[] => {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : [];
};

/**
 * REFACTORED: Reverted to Single Config File (EXCEL_AI.json)
 */
export const configService = {
  CONFIG_FILENAME: 'EXCEL_AI.json',

  ensureDefaults: () => {
    const templates = load<AnalysisTemplate>(KEYS.TEMPLATES);
    // Ensure we have a general analysis template
    if (!templates.some(t => t.id === GENERAL_TEMPLATE_ID)) {
      const defaultTemplate: AnalysisTemplate = {
        id: GENERAL_TEMPLATE_ID,
        name: 'General Analysis (通用分析)',
        description: 'Comprehensive analysis suitable for most datasets.',
        systemInstruction: 'You are a Senior Data Analyst. Analyze the provided dataset to find trends, anomalies, and key insights.',
        customPrompt: ''
      };
      // If there are other templates, just append. If empty, it's the first.
      templates.push(defaultTemplate);
      save(KEYS.TEMPLATES, templates);
    }

    const groups = load<AnalysisGroup>(KEYS.GROUPS);
    if (groups.length === 0) {
        const defaultGroup: AnalysisGroup = {
          id: 'group_default',
          name: 'General View (通用視角)',
          description: 'Default analysis view.',
          templateIds: [GENERAL_TEMPLATE_ID]
        };
        save(KEYS.GROUPS, [defaultGroup]);
    }
  },

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
    // Prevent deleting default if we want to be strict, but user asked for flexibility.
    const list = load<AnalysisTemplate>(KEYS.TEMPLATES).filter(t => t.id !== id);
    save(KEYS.TEMPLATES, list);
    configService.syncMainToDisk();
  },
  
  // Specific Helper for General Template
  getGeneralTemplate: (): AnalysisTemplate | undefined => {
      const templates = load<AnalysisTemplate>(KEYS.TEMPLATES);
      return templates.find(t => t.id === GENERAL_TEMPLATE_ID);
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
    
    // Ensure the system critical defaults exist after import
    configService.ensureDefaults();
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