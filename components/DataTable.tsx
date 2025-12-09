import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ExcelDataRow, Language } from '../types';
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Table as TableIcon, Check, ChevronDown, AlertCircle, Calendar, Filter, Plus, Trash2, X, AlertTriangle, Download } from 'lucide-react';
import { formatNumber, detectColumnType, parseDateSafe } from '../utils';
import { exportToCSV } from '../services/export/csvExport';
import { exportPreviewToExcel } from '../services/export/excelExport';
import { translations } from '../i18n';

interface FilterCriterion {
  id: string;
  column: string;
  operator: 'contains' | 'is' | 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'startsWith' | 'endsWith' | 'between';
  value: string;
  secondValue?: string;
}

interface DataTableProps {
  data: ExcelDataRow[];
  language: Language;
  itemsPerPage?: number;
}

interface TableTheme {
  id: string;
  nameKey: string;
  headerBg: string;
  headerText: string;
  rowOdd: string;
  rowEven: string;
  hover: string;
  border: string;
  divider: string;
}

const TABLE_THEMES: TableTheme[] = [
  { id: 'light-simple', nameKey: 'styleLight', headerBg: 'bg-gray-50', headerText: 'text-gray-700', rowOdd: 'bg-white', rowEven: 'bg-white', hover: 'hover:bg-gray-50', border: 'border-gray-200', divider: 'border-gray-300' },
  { id: 'medium-blue', nameKey: 'styleMedium', headerBg: 'bg-blue-600', headerText: 'text-white', rowOdd: 'bg-blue-50', rowEven: 'bg-white', hover: 'hover:bg-blue-100', border: 'border-blue-200', divider: 'border-blue-400' },
  { id: 'medium-orange', nameKey: 'styleMedium', headerBg: 'bg-orange-500', headerText: 'text-white', rowOdd: 'bg-orange-50', rowEven: 'bg-white', hover: 'hover:bg-orange-100', border: 'border-orange-200', divider: 'border-orange-400' },
  { id: 'medium-green', nameKey: 'styleMedium', headerBg: 'bg-emerald-600', headerText: 'text-white', rowOdd: 'bg-emerald-50', rowEven: 'bg-white', hover: 'hover:bg-emerald-100', border: 'border-emerald-200', divider: 'border-emerald-400' },
  { id: 'dark-gray', nameKey: 'styleDark', headerBg: 'bg-gray-800', headerText: 'text-white', rowOdd: 'bg-gray-100', rowEven: 'bg-white', hover: 'hover:bg-gray-200', border: 'border-gray-300', divider: 'border-gray-600' },
];

// Mapping of Tailwind visual themes to Hex codes for Excel Export
const THEME_HEX_MAP: Record<string, { headerBg: string, headerText: string, rowOdd: string, rowEven: string }> = {
  'light-simple': { headerBg: 'F9FAFB', headerText: '374151', rowOdd: 'FFFFFF', rowEven: 'FFFFFF' },
  'medium-blue': { headerBg: '2563EB', headerText: 'FFFFFF', rowOdd: 'EFF6FF', rowEven: 'FFFFFF' },
  'medium-orange': { headerBg: 'F97316', headerText: 'FFFFFF', rowOdd: 'FFF7ED', rowEven: 'FFFFFF' },
  'medium-green': { headerBg: '059669', headerText: 'FFFFFF', rowOdd: 'ECFDF5', rowEven: 'FFFFFF' },
  'dark-gray': { headerBg: '1F2937', headerText: 'FFFFFF', rowOdd: 'F3F4F6', rowEven: 'FFFFFF' },
};

const DataTable: React.FC<DataTableProps> = ({ data, language, itemsPerPage = 10 }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const [activeThemeId, setActiveThemeId] = useState<string>('medium-blue');
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  
  // Local Filter State
  const [filters, setFilters] = useState<FilterCriterion[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [newFilterCol, setNewFilterCol] = useState('');
  const [newFilterOp, setNewFilterOp] = useState<FilterCriterion['operator']>('contains');
  const [newFilterVal, setNewFilterVal] = useState('');
  const [newFilterVal2, setNewFilterVal2] = useState('');
  const [filterError, setFilterError] = useState('');

  // Export State
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const t = translations[language];
  const activeTheme = TABLE_THEMES.find(th => th.id === activeThemeId) || TABLE_THEMES[0];
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (styleMenuRef.current && !styleMenuRef.current.contains(event.target as Node)) {
        setIsStyleMenuOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  // Cache column types
  const columnTypes = useMemo(() => {
    const types: Record<string, string> = {};
    columns.forEach(col => {
      types[col] = detectColumnType(data, col);
    });
    return types;
  }, [data, columns]);

  // Performance Optimization: Cache key columns for visual validation
  const keyColumns = useMemo(() => {
    if (data.length === 0) return { orderKey: undefined, actualKey: undefined };
    const headers = Object.keys(data[0]);
    return {
        // Exclude columns containing "Amount"/"Price"
        orderKey: headers.find(k => 
            (['單據', '訂單', '下單', '開工', 'Date', 'Order'].some(kw => k.includes(kw))) && 
            !(['金額', '額', 'Price', 'Amount', 'Cost'].some(kw => k.includes(kw)))
        ),
        actualKey: headers.find(k => 
            (['實際', '完工', '到貨', 'Actual', 'Finish', 'Arrival'].some(kw => k.includes(kw))) &&
            !(['金額', '額', 'Price', 'Amount', 'Cost'].some(kw => k.includes(kw)))
        )
    };
  }, [data]);

  // Optimization: Pre-calculate column categories for styling
  const colCategories = useMemo(() => {
      const critical = new Set<string>();
      const financial = new Set<string>();
      const predicted = new Set<string>();

      columns.forEach(col => {
          const lower = col.toLowerCase();
          if (['stock', 'qty', 'rate', '庫存', '數量', '完成率', '達成率'].some(k => lower.includes(k))) {
              critical.add(col);
          }
          if (['金額', 'price', 'amount', 'cost', '成本'].some(k => lower.includes(k))) {
              financial.add(col);
          }
          // Relaxed matching for Predicted Delivery: '預計' OR 'Delivery' (No 'Day' required)
          if (['預計', '預交', 'planned', 'target', 'delivery'].some(k => lower.includes(k))) {
              predicted.add(col);
          }
      });
      return { critical, financial, predicted };
  }, [columns]);

  // --- Filtering Logic ---
  const filteredData = useMemo(() => {
    let res = data;
    if (filters.length > 0) {
        res = res.filter(row => {
            return filters.every(f => {
                const rowValue = row[f.column];
                if (rowValue === null || rowValue === undefined) return false;
                
                const colType = columnTypes[f.column];
                const valStr = String(rowValue).toLowerCase();
                const filterVal = f.value.toLowerCase();

                if (colType === 'number') {
                    const numRow = Number(rowValue);
                    const numFilter = Number(f.value);
                    if (isNaN(numRow) || isNaN(numFilter)) return false; 

                    switch (f.operator) {
                    case 'eq': return numRow === numFilter;
                    case 'gt': return numRow > numFilter;
                    case 'gte': return numRow >= numFilter;
                    case 'lt': return numRow < numFilter;
                    case 'lte': return numRow <= numFilter;
                    default: return valStr.includes(filterVal);
                    }
                }
                
                if (colType === 'date') {
                    const dateRow = parseDateSafe(String(rowValue));
                    if (f.operator === 'between' && f.secondValue) {
                        const dateStart = parseDateSafe(f.value); 
                        const dateEnd = parseDateSafe(f.secondValue) + 86399999; 
                        if (!dateRow || !dateStart || !dateEnd) return false;
                        return dateRow >= dateStart && dateRow <= dateEnd;
                    }
                    const dateFilter = parseDateSafe(f.value);
                    if (!dateRow || !dateFilter) return false;

                    switch (f.operator) {
                        case 'eq': 
                        case 'is':
                        const dR = new Date(dateRow);
                        const dF = new Date(dateFilter);
                        return dR.getFullYear() === dF.getFullYear() && 
                                dR.getMonth() === dF.getMonth() && 
                                dR.getDate() === dF.getDate();
                        case 'gt': return dateRow > dateFilter;
                        case 'gte': return dateRow >= dateFilter;
                        case 'lt': return dateRow < dateFilter;
                        case 'lte': return dateRow <= dateFilter;
                        default: return valStr.includes(filterVal);
                    }
                }

                switch (f.operator) {
                    case 'contains': return valStr.includes(filterVal);
                    case 'is': return valStr === filterVal;
                    case 'startsWith': return valStr.startsWith(filterVal);
                    case 'endsWith': return valStr.endsWith(filterVal);
                    default: return valStr.includes(filterVal);
                }
            });
        });
    }
    return res;
  }, [data, filters, columnTypes]);


  const handleAddFilter = () => {
    setFilterError('');
    if (!newFilterCol) { setFilterError(t.err.noCol); return; }
    if (!newFilterOp) { setFilterError(t.err.noOp); return; }
    if (!newFilterVal) { setFilterError(t.err.noVal); return; }
    if (newFilterOp === 'between' && !newFilterVal2) { setFilterError(t.err.noVal); return; }

    const newFilter: FilterCriterion = {
      id: Date.now().toString(),
      column: newFilterCol,
      operator: newFilterOp,
      value: newFilterVal,
      secondValue: newFilterVal2
    };
    setFilters([...filters, newFilter]);
    setNewFilterVal('');
    setNewFilterVal2('');
    setNewFilterCol('');
    setIsFilterOpen(false);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const getUniqueValues = (column: string) => {
    const values = new Set<string>();
    data.forEach(row => {
      const val = row[column];
      if (val !== null && val !== undefined) values.add(String(val));
    });
    return Array.from(values).sort().slice(0, 50); 
  };


  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredData;
    const colType = columnTypes[sortConfig.key];

    return [...filteredData].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let comparison = 0;
      if (colType === 'number') {
        comparison = Number(valA) - Number(valB);
      } else if (colType === 'date') {
        comparison = parseDateSafe(String(valA)) - parseDateSafe(String(valB));
      } else {
        comparison = String(valA).localeCompare(String(valB));
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig, columnTypes]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [data, filters]);

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' };
        if (current.direction === 'desc') return { key: '', direction: null };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleResizeStart = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[col] || 150;
    resizingRef.current = { col, startX: e.clientX, startWidth };
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { col, startX, startWidth } = resizingRef.current;
      const diff = e.clientX - startX;
      setColumnWidths(prev => ({
        ...prev,
        [col]: Math.max(50, startWidth + diff)
      }));
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const formatCellValue = (val: any, type: string, colName: string) => {
    if (val === null || val === undefined) return '-';
    const strVal = String(val).trim();

    if (colName.toLowerCase().includes('date') || colName.includes('日期')) {
        if (/^\d{8}$/.test(strVal)) {
          return `${strVal.substring(0,4)}/${strVal.substring(4,6)}/${strVal.substring(6,8)}`;
        }
    }

    if (type === 'number') return formatNumber(val);
    
    if (/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(strVal)) {
       return `${strVal.substring(0,4)}/${strVal.substring(4,6)}`;
    }

    if (type === 'date') {
       if (/^\d{8}$/.test(strVal)) {
         return `${strVal.substring(0,4)}/${strVal.substring(4,6)}/${strVal.substring(6,8)}`;
       }
       const d = new Date(val);
       if (!isNaN(d.getTime())) {
          return d.toLocaleDateString(); 
       }
    }
    return strVal;
  };

  const handleAutoFit = (col: string) => {
    const headerWidth = col.length * 10 + 40;
    let maxContentWidth = 0;
    currentData.forEach(row => {
      const val = formatCellValue(row[col], columnTypes[col], col);
      const len = String(val).length;
      if (len > maxContentWidth) maxContentWidth = len;
    });
    const contentPixelWidth = maxContentWidth * 8 + 32;
    const newWidth = Math.min(400, Math.max(headerWidth, contentPixelWidth));
    setColumnWidths(prev => ({ ...prev, [col]: newWidth }));
  };

  const handleExport = (type: 'csv' | 'excel') => {
    const filename = `data_preview_${new Date().toISOString().slice(0,10)}`;
    
    // We create a WYSIWYG (What You See Is What You Get) dataset for export
    const exportData = sortedData.map(row => {
        const newRow: Record<string, any> = {};
        columns.forEach(col => {
            const type = columnTypes[col];
            // Apply visual formatting to the data before export
            newRow[col] = formatCellValue(row[col], type, col);
        });
        return newRow;
    });

    if (type === 'csv') {
        exportToCSV(exportData, `${filename}.csv`);
    } else {
        // Pass the style configuration for the active theme
        const themeColors = THEME_HEX_MAP[activeThemeId] || THEME_HEX_MAP['light-simple'];
        exportPreviewToExcel(exportData, `${filename}.xlsx`, themeColors);
    }
    setIsExportDropdownOpen(false);
  };

  // --- OPTIMIZED VISUAL VALIDATION LOGIC ---
  const getCellStatus = (val: any, type: string, row: ExcelDataRow, colName: string): { classes: string, icon?: React.ReactNode } => {
    if (val === null || val === undefined) return { classes: 'bg-yellow-50 text-gray-400 italic' };
    
    if (type === 'number') {
        const num = Number(val);
        if (num < 0) return { classes: 'text-red-600 font-bold bg-red-50', icon: <AlertTriangle className="w-3 h-3 mr-1 inline" /> };
        
        // Zero value logic (Qty/Stock = Red, Price/Amount = Gray)
        if (num === 0) {
            if (colCategories.critical.has(colName)) {
                return { classes: 'text-red-600 font-bold bg-red-50/50', icon: <AlertCircle className="w-3 h-3 mr-1 inline" /> };
            }
            if (colCategories.financial.has(colName)) {
                return { classes: 'text-gray-400 italic' };
            }
        }
    }

    if (type === 'date') {
        const d = parseDateSafe(String(val));
        const now = Date.now();
        const diff = d - now;
        // Future > 30 days
        if (diff > 30 * 24 * 60 * 60 * 1000) return { classes: 'text-orange-600 font-medium' };

        // --- Cross Column Logic Checks ---
        if (colCategories.predicted.has(colName)) {
            const year = new Date(d).getFullYear();
            
            // 1. Check against Order Date
            if (keyColumns.orderKey && row[keyColumns.orderKey]) {
                const orderDate = parseDateSafe(String(row[keyColumns.orderKey]));
                if (orderDate && year < new Date(orderDate).getFullYear()) {
                    return { classes: 'text-red-600 font-bold bg-red-50 ring-1 ring-red-200', icon: <AlertTriangle className="w-3 h-3 mr-1 inline" /> }; // Logic Error
                }
            }

            // 2. Check against Actual Date
            // RELAXED RULE: Only flag if Predicted is > Actual Year + 1 (Allow cross-year early finish)
            if (keyColumns.actualKey && row[keyColumns.actualKey]) {
                const actualDate = parseDateSafe(String(row[keyColumns.actualKey]));
                if (actualDate && year > new Date(actualDate).getFullYear() + 1) {
                     return { classes: 'text-red-600 font-bold bg-red-50 ring-1 ring-red-200', icon: <AlertTriangle className="w-3 h-3 mr-1 inline" /> }; // Anomaly
                }
            }
        }
    }
    return { classes: '' };
  };

  const renderValueInput = () => {
    if (!newFilterCol) {
        return <input disabled className="w-full px-3 py-2 bg-gray-100 border rounded-lg text-sm cursor-not-allowed" placeholder={t.selectColumn} />;
    }
    
    const type = columnTypes[newFilterCol];
    const uniqueVals = getUniqueValues(newFilterCol);
    const isLowCardinality = uniqueVals.length > 0 && uniqueVals.length < 50;
    
    // FORCE WHITE BACKGROUND
    const inputClass = "w-full px-3 py-2 border rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all";

    if (type === 'date' && newFilterOp === 'between') {
       return (
         <div className="flex gap-2">
           <input type="date" value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)} className={inputClass} />
           <span className="self-center text-gray-400">-</span>
           <input type="date" value={newFilterVal2} onChange={e => setNewFilterVal2(e.target.value)} className={inputClass} />
         </div>
       );
    }
    
    if (type === 'date') {
        return <input type="date" value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)} className={inputClass} />;
    }
    
    if (isLowCardinality) {
       return (
         <select value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)} className={inputClass}>
           <option value="">{t.selectCondition}</option>
           {uniqueVals.map(v => <option key={v} value={v}>{v}</option>)}
         </select>
       );
    }

    if (type === 'number') {
        return <input type="number" value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)} placeholder={t.inputNumber} className={inputClass} />;
    }

    return <input type="text" value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)} placeholder={t.inputKeyword} className={inputClass} />;
  };

  if (data.length === 0) return (
     <div className="p-12 text-center text-gray-500 flex flex-col items-center">
       <AlertCircle className="w-10 h-10 mb-3 text-gray-300" />
       <p>{t.noData}</p>
     </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4 bg-gray-50/50">
           <div className="flex items-center gap-2">
             <div className="bg-blue-100 p-1.5 rounded-lg">
               <TableIcon className="w-5 h-5 text-blue-600" />
             </div>
             <h3 className="font-bold text-gray-800">
               {t.previewTitle}
             </h3>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="relative" ref={exportDropdownRef}>
                <button
                    onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                    <Download className="w-3 h-3" />
                    {t.export}
                    <ChevronDown className="w-3 h-3" />
                </button>
                {isExportDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-gray-100 p-1 z-20">
                        <button
                            onClick={() => handleExport('csv')}
                            className="flex items-center gap-2 w-full p-2 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
                        >
                            {t.exportCSV}
                        </button>
                        <button
                            onClick={() => handleExport('excel')}
                            className="flex items-center gap-2 w-full p-2 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
                        >
                            {t.exportExcel}
                        </button>
                    </div>
                )}
              </div>

              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${isFilterOpen || filters.length > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                <Filter className="w-4 h-4" /> {t.filter} {filters.length > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{filters.length}</span>}
              </button>

              <div className="relative" ref={styleMenuRef}>
                 <button 
                   onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)}
                   className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                 >
                   <div className={`w-3 h-3 rounded-full ${activeTheme.headerBg.replace('bg-', 'bg-')}`}></div>
                   {t.tableStyle}
                   <ChevronDown className="w-3 h-3" />
                 </button>
                 {isStyleMenuOpen && (
                   <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-gray-100 p-1 z-20">
                      {TABLE_THEMES.map(theme => (
                        <button
                          key={theme.id}
                          onClick={() => { setActiveThemeId(theme.id); setIsStyleMenuOpen(false); }}
                          className={`flex items-center gap-2 w-full p-2 text-xs rounded-md ${activeThemeId === theme.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                           <div className={`w-3 h-3 rounded-full border border-gray-200 ${theme.headerBg}`}></div>
                           {(t as any)[theme.nameKey] || theme.id}
                           {activeThemeId === theme.id && <Check className="w-3 h-3 ml-auto" />}
                        </button>
                      ))}
                   </div>
                 )}
              </div>
           </div>
        </div>

        {/* Filter Panel */}
        {(isFilterOpen || filters.length > 0) && (
            <div className="p-4 bg-blue-50/50 border-b border-blue-100 animate-slide-in">
                <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
                    <div className="flex-1 w-full md:w-auto">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t.column}</label>
                        <div className="relative">
                            <select value={newFilterCol} onChange={(e) => { setNewFilterCol(e.target.value); setNewFilterVal(''); }} className="w-full pl-3 pr-8 py-2 border rounded-lg text-sm bg-white text-gray-900 appearance-none focus:ring-2 focus:ring-blue-500">
                                <option value="">{t.selectColumn}</option>
                                {columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="flex-1 w-full md:w-auto">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t.condition}</label>
                        <div className="relative">
                            <select value={newFilterOp} onChange={(e) => setNewFilterOp(e.target.value as any)} className="w-full pl-3 pr-8 py-2 border rounded-lg text-sm bg-white text-gray-900 appearance-none focus:ring-2 focus:ring-blue-500">
                            {newFilterCol && columnTypes[newFilterCol] === 'number' ? (
                                <>
                                    <option value="eq">{t.ops.eq}</option>
                                    <option value="gt">{t.ops.gt}</option>
                                    <option value="lt">{t.ops.lt}</option>
                                </>
                            ) : newFilterCol && columnTypes[newFilterCol] === 'date' ? (
                                <>
                                    <option value="between">{t.ops.between}</option>
                                    <option value="is">{t.ops.is}</option>
                                </>
                            ) : (
                                <>
                                    <option value="contains">{t.ops.contains}</option>
                                    <option value="is">{t.ops.is}</option>
                                </>
                            )}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="flex-[2] w-full md:w-auto">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t.value}</label>
                        {renderValueInput()}
                    </div>
                    <button onClick={handleAddFilter} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"><Plus className="w-4 h-4" />{t.addFilter}</button>
                </div>
                {filterError && <div className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{filterError}</div>}
                
                <div className="flex flex-wrap gap-2 mt-4">
                    {filters.map((f, index) => (
                    <span key={f.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-white border border-blue-200 text-blue-700 shadow-sm">
                        <span className="font-semibold text-gray-600">{f.column}</span>
                        <span className="text-blue-400 font-mono text-xs uppercase">{t.ops[f.operator] || f.operator}</span>
                        <span className="font-bold">{f.value} {f.secondValue ? ` - ${f.secondValue}` : ''}</span>
                        <button onClick={() => removeFilter(f.id)} className="hover:bg-red-50 hover:text-red-500 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                    </span>
                    ))}
                    {filters.length > 0 && <button onClick={() => setFilters([])} className="text-xs text-red-500 hover:text-red-700 underline ml-2">{t.clearAll}</button>}
                </div>
            </div>
        )}

        <div className="overflow-x-auto relative min-h-[300px]">
            <table className="w-full text-sm text-left border-collapse">
              <thead className={`text-xs uppercase ${activeTheme.headerBg} ${activeTheme.headerText}`}>
                <tr>
                  {columns.map((col) => {
                     const isSorted = sortConfig.key === col;
                     return (
                      <th key={col} className={`px-4 py-3 font-semibold whitespace-nowrap relative group select-none ${activeTheme.divider ? `border-r ${activeTheme.divider} last:border-r-0` : ''}`} style={{ width: columnWidths[col] }}>
                        <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => handleSort(col)}>
                           <span>{col}</span>
                           <span className="opacity-50 group-hover:opacity-100 transition-opacity">
                             {isSorted ? (
                               sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                             ) : (
                               <ArrowUpDown className="w-3 h-3" />
                             )}
                           </span>
                        </div>
                        <div
                           onMouseDown={(e) => handleResizeStart(e, col)}
                           onDoubleClick={() => handleAutoFit(col)}
                           className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                           title={t.autoFit}
                        />
                      </th>
                     );
                  })}
                </tr>
              </thead>
              <tbody>
                {currentData.map((row, rowIndex) => (
                  <tr 
                    key={rowIndex} 
                    className={`
                      border-b ${activeTheme.border} 
                      ${rowIndex % 2 === 0 ? activeTheme.rowEven : activeTheme.rowOdd}
                      ${activeTheme.hover} transition-colors
                    `}
                  >
                    {columns.map((col) => {
                       const type = columnTypes[col];
                       const status = getCellStatus(row[col], type, row, col);
                       
                       let justifyContent = 'justify-start';
                       if (type === 'number') justifyContent = 'justify-end';
                       if (type === 'date') justifyContent = 'justify-center';

                       return (
                        <td key={`${rowIndex}-${col}`} className={`px-4 py-2 whitespace-nowrap text-gray-700 ${status.classes} ${activeTheme.divider ? `border-r ${activeTheme.divider} last:border-r-0` : ''}`}>
                          <div className={`flex items-center gap-1 ${justifyContent} ${type === 'number' ? 'font-mono' : ''}`}>
                             {status.icon}
                             {formatCellValue(row[col], type, col)}
                          </div>
                        </td>
                       );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
             <div className="text-xs text-gray-500 font-medium">
                Page {currentPage} of {totalPages || 1}
              </div>
              <div className="flex rounded-md shadow-sm">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-l border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-r border-l-0 border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
        </div>
    </div>
  );
};

export default DataTable;