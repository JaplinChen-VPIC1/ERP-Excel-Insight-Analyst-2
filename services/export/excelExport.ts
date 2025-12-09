import * as XLSX from 'xlsx';
import { ExcelDataRow, AnalysisResult, Language, TableStyleConfig } from '../../types';
import { translations } from '../../i18n';
import { aggregateData } from '../../utils';

export const exportToExcel = (data: ExcelDataRow[], filename: string, analysis: AnalysisResult | null, language: Language) => {
  if (!data || !data.length) return;
  const t = translations[language];
  const workbook = XLSX.utils.book_new();

  if (analysis) {
    const ws1_data: any[][] = [];
    const merges: XLSX.Range[] = [];
    ws1_data.push([t.reportTitle.toUpperCase()]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }); 
    ws1_data.push([]); 
    ws1_data.push([t.aiSummary]);
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }); 
    ws1_data.push([analysis.summary]);
    merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 6 } }); 
    ws1_data.push([]); ws1_data.push([]); 
    ws1_data.push(["KEY INSIGHTS"]);
    merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: 6 } });
    analysis.keyInsights.forEach((insight, idx) => {
        const rowIdx = ws1_data.length;
        ws1_data.push([`${idx + 1}. ${insight}`]);
        merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 6 } }); 
    });
    const sheet1 = XLSX.utils.aoa_to_sheet(ws1_data);
    sheet1['!merges'] = merges;
    sheet1['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(workbook, sheet1, t.sheetInsights);
  }

  if (analysis && analysis.charts) {
    let ws2_data: any[][] = [];
    ws2_data.push(["VISUAL ANALYSIS DATA"]);
    ws2_data.push([]);
    analysis.charts.forEach((chart, index) => {
        ws2_data.push([`CHART #${index + 1}: ${chart.title}`]);
        ws2_data.push([`Analysis: ${chart.description}`]);
        ws2_data.push([]); 
        ws2_data.push([chart.xAxisKey, chart.dataKey]); 
        const aggData = aggregateData(data, chart.xAxisKey, chart.dataKey);
        aggData.forEach(item => ws2_data.push([item[chart.xAxisKey], item[chart.dataKey]]));
        const total = aggData.reduce((sum, item) => sum + (item[chart.dataKey] || 0), 0);
        ws2_data.push(["Total", total]);
        ws2_data.push([]); ws2_data.push([]); ws2_data.push([]);
    });
    const sheet2 = XLSX.utils.aoa_to_sheet(ws2_data);
    sheet2['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, sheet2, t.sheetCharts);
  }

  const sheet3 = XLSX.utils.json_to_sheet(data);
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.min(30, Math.max(10, key.length + 5)) }));
  sheet3['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(workbook, sheet3, t.sheetData);
  XLSX.writeFile(workbook, filename);
};

export const exportPreviewToExcel = (data: ExcelDataRow[], filename: string, styleConfig?: TableStyleConfig) => {
  if (!data || !data.length) return;
  const workbook = XLSX.utils.book_new();
  
  // Create Worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  const headers = Object.keys(data[0] || {});
  
  // 1. Column Widths
  const colWidths = headers.map(key => {
      let maxLen = key.length;
      data.slice(0, 50).forEach(row => {
          const val = row[key] ? String(row[key]) : "";
          if (val.length > maxLen) maxLen = val.length;
      });
      return { wch: Math.min(50, maxLen + 2) }; // Max width 50 chars
  });
  ws['!cols'] = colWidths;

  // 2. Freeze Header Row (Split at row 1)
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // 3. Styles (Best Effort for supported environments)
  if (styleConfig) {
      const range = XLSX.utils.decode_range(ws['!ref'] || "");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
          if (!ws[cell_ref]) continue;
          
          if (R === 0) {
              // Header Style
              ws[cell_ref].s = {
                  font: { bold: true, color: { rgb: styleConfig.headerText } },
                  fill: { fgColor: { rgb: styleConfig.headerBg } },
                  alignment: { horizontal: "center" }
              };
          } else {
              // Row Style (Alternating)
              const isEven = R % 2 === 0;
              const bgColor = isEven ? styleConfig.rowEven : styleConfig.rowOdd;
              ws[cell_ref].s = {
                  fill: { fgColor: { rgb: bgColor } }
              };
          }
        }
      }
  }

  XLSX.utils.book_append_sheet(workbook, ws, "Data Preview");
  XLSX.writeFile(workbook, filename);
};