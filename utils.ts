
import * as XLSX from 'xlsx';
import { ExcelDataRow, AnalysisResult, Language } from './types';
import { translations } from './i18n';
import html2canvas from 'html2canvas';

export const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

export const PALETTES = {
  default: CHART_COLORS,
  pastel: ['#93c5fd', '#fca5a5', '#6ee7b7', '#fcd34d', '#c4b5fd', '#f9a8d4', '#67e8f9'],
  vibrant: ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'],
  ocean: ['#0c4a6e', '#0369a1', '#0284c7', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe'],
  warm: ['#78350f', '#b45309', '#d97706', '#fbbf24', '#fcd34d', '#fde68a', '#fffbeb'],
  neon: ['#facc15', '#a3e635', '#22d3ee', '#e879f9', '#f472b6', '#818cf8', '#fb923c']
};

const DATE_REGEX_8DIGIT = /^\d{8}$/;
const DATE_REGEX_6DIGIT = /^(19|20)\d{2}(0[1-9]|1[0-2])$/;

export const detectColumnType = (data: ExcelDataRow[], column: string): 'date' | 'number' | 'string' => {
  if (!column) return 'string';
  const colLower = String(column).toLowerCase();
  const stringKeywords = ['id', 'no', 'code', '單號', '編號', '料號', '工號', '客代', '廠商', '品號', '規格'];
  if (stringKeywords.some(kw => colLower.includes(kw))) return 'string';

  let numberCount = 0;
  let dateCount = 0;
  let sampleCount = 0;
  const maxSamples = 100;

  for (const row of data) {
    if (sampleCount >= maxSamples) break;
    const val = row[column];
    if (val === null || val === undefined || val === '') continue;
    
    sampleCount++;
    const strVal = String(val).trim();
    
    if (!isNaN(Number(val)) && strVal !== '') {
      numberCount++;
    }
    
    if (DATE_REGEX_8DIGIT.test(strVal) || DATE_REGEX_6DIGIT.test(strVal)) {
       dateCount++;
    } 
    else if (!isNaN(Date.parse(strVal)) && (strVal.includes('-') || strVal.includes('/'))) {
       dateCount++;
    }
  }

  if (sampleCount > 0 && dateCount / sampleCount > 0.8) return 'date';
  if (sampleCount > 0 && numberCount / sampleCount > 0.9) return 'number';
  return 'string';
};

export const parseDateSafe = (value: string): number => {
    if (!value) return 0;
    const strVal = String(value).trim();
    if (DATE_REGEX_8DIGIT.test(strVal)) {
      const y = parseInt(strVal.substring(0, 4));
      const m = parseInt(strVal.substring(4, 6)) - 1;
      const d = parseInt(strVal.substring(6, 8));
      return new Date(y, m, d).getTime();
    }
    if (DATE_REGEX_6DIGIT.test(strVal)) {
      const y = parseInt(strVal.substring(0, 4));
      const m = parseInt(strVal.substring(4, 6)) - 1;
      return new Date(y, m, 1).getTime();
    }
    return new Date(strVal).getTime();
};

export const cleanAndEnrichData = (data: ExcelDataRow[]): ExcelDataRow[] => {
  if (!data || data.length === 0) return data;

  const headers = Object.keys(data[0]);
  
  // Pre-identify Date Columns to optimize performance
  const dateCandidates = headers.filter(h => {
      if (!h) return false;
      const lower = String(h).toLowerCase();
      // Heuristic: Column name contains 'date' or Chinese '日' or 'time'
      if (lower.includes('date') || lower.includes('日') || lower.includes('time')) return true;
      // Fallback: Check sample data type
      return detectColumnType(data.slice(0, 50), h) === 'date';
  });

  const docDateCol = headers.find(h => ['單據', '訂單', '下單', '開工', 'Date', 'Order'].some(k => h.includes(k)));
  const predictedCol = headers.find(h => ['預計', '預交', 'Planned', 'Target', 'Delivery'].some(k => h.includes(k)));
  const actualCol = headers.find(h => ['實際', '完工', '到貨', 'Actual', 'Finish', 'Arrival'].some(k => h.includes(k)));
  const diffCol = headers.find(h => ['差異', 'Diff'].some(k => h.includes(k)));

  // Dynamic Current Year for robust fixing
  const currentYear = new Date().getFullYear().toString();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    // 1. Year Fix (e.g. 0025 -> 2025, 0202 -> 2025)
    for (const key of dateCandidates) {
        if (!row[key]) continue;
        let val = String(row[key]);
        if (!val) continue;

        let year = 0;
        let isDate = false;

        // Detect Year
        if (val.length === 8 && /^\d{8}$/.test(val)) {
            year = parseInt(val.substring(0, 4));
            isDate = true;
        } else if (val.indexOf('/') > -1 || val.indexOf('-') > -1) {
            const parts = val.split(/[-/]/);
            if (parts.length >= 3) {
                year = parseInt(parts[0]);
                isDate = true;
            }
        }

        // Fix Logic: If Year is absurdly small (< 2000)
        if (isDate && year > 0 && year < 2000) {
            let correctYear = currentYear; // Default fallback
            
            // Try to find a reference year from Document Date
            if (docDateCol && row[docDateCol]) {
                const docVal = String(row[docDateCol]);
                let docY = 0;
                if (docVal.length === 8) docY = parseInt(docVal.substring(0, 4));
                else if (docVal.indexOf('/') > -1) docY = parseInt(docVal.split('/')[0]);
                
                if (docY > 2000) correctYear = docY.toString();
            }

            // Apply Fix
            if (val.length === 8) {
                row[key] = correctYear + val.substring(4);
            } else {
                const parts = val.split(/[-/]/);
                parts[0] = correctYear;
                row[key] = parts.join('/');
            }
        }
    }

    // 2. Logic Fix: Predicted Date < Document Date
    // Scenario: User typed 2023 but meant 2024, or typo'd year
    if (docDateCol && predictedCol && row[docDateCol] && row[predictedCol]) {
        const d1 = parseDateSafe(String(row[docDateCol])); // Doc Date
        const d2 = parseDateSafe(String(row[predictedCol])); // Predicted Date
        
        // If Predicted is EARLIER than Doc Date (Logic Error)
        if (d2 < d1 && d1 > 0 && d2 > 0) {
             const docVal = String(row[docDateCol]);
             let docYear = currentYear;
             if (docVal.length === 8) docYear = docVal.substring(0, 4);
             else docYear = docVal.split(/[-/]/)[0];

             const predVal = String(row[predictedCol]);
             let fixedPred = predVal;
             
             // Replace Predicted Year with Doc Year
             if (predVal.length === 8) fixedPred = docYear + predVal.substring(4);
             else {
                 const parts = predVal.split(/[-/]/);
                 parts[0] = docYear;
                 fixedPred = parts.join('/');
             }
             row[predictedCol] = fixedPred;
        }
    }

    // 3. Recalculate Diff Days (if column exists)
    if (predictedCol && actualCol && diffCol && row[predictedCol] && row[actualCol]) {
        const dPred = parseDateSafe(String(row[predictedCol]));
        const dAct = parseDateSafe(String(row[actualCol]));
        if (dPred > 0 && dAct > 0) {
            const diffTime = dAct - dPred;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            row[diffCol] = diffDays;
        }
    }
  }

  return data;
};

export interface DatasetStats {
    rowCount: number;
    dateRange: { start: string; end: string; column: string };
    numericStats: Record<string, { sum: number; avg: number; min: number; max: number }>;
}

export const getDatasetStats = (data: ExcelDataRow[]): DatasetStats => {
    const stats: DatasetStats = {
        rowCount: data.length,
        dateRange: { start: '', end: '', column: '' },
        numericStats: {}
    };

    if (data.length === 0) return stats;

    const headers = Object.keys(data[0]);
    const dateCol = headers.find(h => h.toLowerCase().includes('date') || h.includes('日期') || h.includes('時間'));
    const numericCols = headers.filter(h => detectColumnType(data.slice(0, 50), h) === 'number');

    let minDate = Infinity;
    let maxDate = -Infinity;

    numericCols.forEach(col => {
        stats.numericStats[col] = { sum: 0, avg: 0, min: Infinity, max: -Infinity };
    });

    for (const row of data) {
        // Date Stats
        if (dateCol) {
            const ts = parseDateSafe(String(row[dateCol]));
            if (ts > 0) {
                if (ts < minDate) minDate = ts;
                if (ts > maxDate) maxDate = ts;
            }
        }
        // Numeric Stats
        for (const col of numericCols) {
            const val = parseFloat(String(row[col]));
            if (!isNaN(val)) {
                const s = stats.numericStats[col];
                s.sum += val;
                if (val < s.min) s.min = val;
                if (val > s.max) s.max = val;
            }
        }
    }

    if (dateCol && minDate !== Infinity) {
        stats.dateRange.column = dateCol;
        stats.dateRange.start = new Date(minDate).toLocaleDateString();
        stats.dateRange.end = new Date(maxDate).toLocaleDateString();
    }

    // Finalize Averages and Rounding
    numericCols.forEach(col => {
        const s = stats.numericStats[col];
        if (s.min === Infinity) s.min = 0;
        if (s.max === -Infinity) s.max = 0;
        s.avg = s.sum / data.length;
        // Round to 2 decimal places for cleanliness
        s.sum = Math.round(s.sum * 100) / 100;
        s.avg = Math.round(s.avg * 100) / 100;
    });

    return stats;
};

export const getSmartSample = (data: ExcelDataRow[], limit: number = 150): ExcelDataRow[] => {
    if (data.length <= limit) return data;
    
    // Strategy: 
    // 20% Head (Recent/First records)
    // 20% Tail (Oldest/Last records)
    // 60% Random distribution (To catch outliers in the middle)
    const headCount = Math.floor(limit * 0.2); 
    const tailCount = Math.floor(limit * 0.2); 
    const randomCount = limit - headCount - tailCount; 

    const head = data.slice(0, headCount);
    const tail = data.slice(data.length - tailCount);
    
    const middleStart = headCount;
    const middleEnd = data.length - tailCount;
    const randomSamples: ExcelDataRow[] = [];
    
    if (middleEnd > middleStart) {
        for (let i = 0; i < randomCount; i++) {
            const ridx = Math.floor(Math.random() * (middleEnd - middleStart)) + middleStart;
            randomSamples.push(data[ridx]);
        }
    }
    
    return [...head, ...randomSamples, ...tail];
};

export const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
};

export const formatCompactNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(num);
};

export const aggregateData = (data: ExcelDataRow[], xAxisKey: string, dataKey: string): any[] => {
  // Guard clauses
  if (!data || !data.length || !xAxisKey || !dataKey) return [];
  // Ensure xAxisKey and dataKey are strings before checking includes/toLowerCase
  const safeXKey = String(xAxisKey);
  const safeDataKey = String(dataKey);

  const map = new Map<string, { sum: number; count: number }>();
  let mode: 'sum' | 'count' | 'average' = 'sum';
  const keyLower = safeDataKey.toLowerCase();
  
  if (keyLower.includes('rate') || keyLower.includes('percent') || keyLower.includes('avg') || keyLower.includes('yield') || keyLower.includes('率') || keyLower.includes('平均') || keyLower.includes('占比') || keyLower.includes('達成')) {
    mode = 'average';
  } else if (keyLower.includes('id') || keyLower.includes('no') || keyLower.includes('code') || keyLower.includes('號') || keyLower.includes('單') || keyLower.includes('代碼')) {
      mode = 'count';
  }

  if (mode === 'sum') {
    const firstValid = data.find(r => r[safeDataKey] !== null && r[safeDataKey] !== undefined);
    if (firstValid) {
       const val = firstValid[safeDataKey];
       if (typeof val === 'string' && isNaN(Number(val))) mode = 'count';
    }
  }

  for (const row of data) {
    const xValue = row[safeXKey];
    const yValue = row[safeDataKey];
    if (xValue === undefined || xValue === null) continue;
    const key = String(xValue);
    let numVal = 0;
    if (mode === 'count') numVal = 1;
    else {
      numVal = parseFloat(String(yValue));
      if (isNaN(numVal)) numVal = 0;
    }
    const current = map.get(key);
    if (current) {
        current.sum += numVal;
        current.count += 1;
    } else {
        map.set(key, { sum: numVal, count: 1 });
    }
  }

  const result = Array.from(map.entries()).map(([name, stat]) => {
      let finalValue = stat.sum;
      if (mode === 'average' && stat.count > 0) finalValue = stat.sum / stat.count;
      return { [safeXKey]: name, [safeDataKey]: finalValue, name: name, value: finalValue };
    });

  const xColType = detectColumnType(data.slice(0, 20), safeXKey);
  const xKeyLower = safeXKey.toLowerCase();
  if (xColType === 'date' || xKeyLower.includes('date') || xKeyLower.includes('日')) {
      return result.sort((a, b) => {
          const keyA = String(a.name);
          const keyB = String(b.name);
          const dateA = parseDateSafe(keyA) || keyA;
          const dateB = parseDateSafe(keyB) || keyB;
          if (dateA > dateB) return -1;
          if (dateA < dateB) return 1;
          return 0;
      })
      .slice(0, 12)
      .sort((a, b) => {
          const keyA = String(a.name);
          const keyB = String(b.name);
          const dateA = parseDateSafe(keyA) || keyA;
          const dateB = parseDateSafe(keyB) || keyB;
           if (dateA > dateB) return 1;
          if (dateA < dateB) return -1;
          return 0;
      });
  } else {
      return result.sort((a, b) => b.value - a.value).slice(0, 12);
  }
};

export const exportToImage = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  try {
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Export image failed', err);
  }
};
