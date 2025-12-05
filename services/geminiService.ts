
import { GoogleGenAI, Type } from "@google/genai";
import { ExcelDataRow, AnalysisResult, Language, ChatAttachment, ChatMessage, AnalysisTemplate } from '../types';
import { getDatasetStats, getSmartSample } from '../utils';

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A professional executive summary of the dataset suitable for ERP reporting. If answering a user question, address it here.",
    },
    keyInsights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of 3-5 specific, actionable insights derived from the data trends.",
    },
    charts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['bar', 'line', 'area', 'pie', 'scatter', 'radar'] },
          xAxisKey: { type: Type.STRING, description: "Exact column name to use for the X-axis (category)." },
          dataKey: { type: Type.STRING, description: "Exact column name to use for the Y-axis (numerical value)." },
          description: { type: Type.STRING, description: "Why this chart is relevant." },
        },
        required: ['id', 'title', 'type', 'xAxisKey', 'dataKey', 'description'],
      },
    },
  },
  required: ['summary', 'keyInsights', 'charts'],
};

// Helper to create client instance safely
const createAIClient = () => {
  // Ensure process is defined before accessing, mostly for safety in strict browser envs
  const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
  
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables.");
    throw new Error("API Key is missing. Please ensure process.env.API_KEY is configured.");
  }
  
  return new GoogleGenAI({ apiKey: apiKey });
};

export const analyzeDataWithGemini = async (
  data: ExcelDataRow[], 
  language: Language,
  userPrompt?: string,
  image?: ChatAttachment,
  history?: ChatMessage[],
  templates?: AnalysisTemplate[]
): Promise<AnalysisResult> => {
  
  // Create a fresh client for each request to ensure validity
  const ai = createAIClient();

  // --- REPLACED SLICING WITH SMART SAMPLING (INCREASED TO 150) ---
  // This gives the AI the high level totals + a comprehensive data sample
  const stats = getDatasetStats(data);
  const dataSample = getSmartSample(data, 150); 
  const headers = Object.keys(dataSample[0] || {}).join(', ');

  const languageName = {
    'zh-TW': 'Traditional Chinese (Taiwan)',
    'en-US': 'English',
    'vi-VN': 'Vietnamese'
  }[language];

  // Base Context
  let baseContext = "";
  let roleInstruction = `You are a Senior ERP Data Analysis Consultant specializing in Digiwin Workflow ERP (鼎新 ERP). Your goal is to provide actionable business intelligence. Always respond in ${languageName}.`;
  let userOverrideInstructions = "";

  if (templates && templates.length > 0) {
     // Use Custom Template Logic
     // 1. Merge System Instructions (Personas)
     const combinedInstructions = templates.map(t => t.systemInstruction).join('\n\n');
     roleInstruction = `${combinedInstructions}. Always respond in ${languageName}.`;
     
     // 2. Extract Specific Prompts to be appended at the end
     userOverrideInstructions = templates.map(t => `[Template: ${t.name}]\n${t.customPrompt}`).join('\n\n');
     
     baseContext = `
       I have provided a dataset.
       
       **DATASET STATISTICS (Full Scope - Use this for totals):**
       - Total Records: ${stats.rowCount}
       - Date Range: ${stats.dateRange.start} to ${stats.dateRange.end} (Column: ${stats.dateRange.column || 'N/A'})
       - Numeric Summaries: ${JSON.stringify(stats.numericStats, null, 2)}

       Column Headers: ${headers}
       Sample Data (Representative subset of 150 rows): ${JSON.stringify(dataSample)}
     `;
  } else {
    // Default Digiwin ERP Logic
    baseContext = `
    **Context:**
    The user has uploaded an Excel export from Digiwin Workflow ERP. Analyze the column headers to determine the module (Sales, Inventory, Production, Purchase, Finance).

    **DATASET STATISTICS (Full Scope - Use this for totals):**
    - Total Records: ${stats.rowCount}
    - Date Range: ${stats.dateRange.start} to ${stats.dateRange.end}
    - Numeric Totals: ${JSON.stringify(stats.numericStats)}

    **Common Digiwin ERP Patterns & Analysis Strategies:**
    1. **Sales (COP)**: 'Customer', 'Sales Order', 'Product', 'Qty', 'Amount', 'Gross Margin'. 
       - *Charts*: Sales Trends (Line), Top Customers (Bar), Profit Margin (Bar).
    2. **Inventory (INV)**: 'Warehouse', 'Item No', 'Stock Qty', 'Safety Stock', 'Aging Days'. 
       - *Charts*: Stock by Warehouse (Bar/Pie), Aging Analysis (Bar), Stock vs Safety (Line).
    3. **Production (MO/SFC)**: 'MO No', 'Work Center', 'Planned Qty', 'Completed Qty', 'Scrap', 'Efficiency', 'Completion Rate'. 
       - *Charts*: Yield Rate (Line), Output by Line (Bar), Scrap Reasons (Pie).
       - *Logic*: If user asks for 'Completion Rate', use the 'Rate' column. If 'Count of MO', use 'MO No'.
    4. **Purchase (PUR)**: 'Vendor', 'PO No', 'Qty', 'Price', 'Delivery Date'. 
       - *Charts*: Spend by Vendor (Bar), Price Trends (Line).

    **Dataset Info:**
    - Headers: ${headers}
    - Sample Data (Representative subset of 150 rows): ${JSON.stringify(dataSample)}
    `;
  }

  let taskPrompt = "";

  if (userPrompt || (history && history.length > 0)) {
    // Refinement Request
    taskPrompt = `
      **USER REQUEST:** "${userPrompt || "Based on previous context"}"

      **Your Task:**
      1.  **Analyze**: Answer the User Request specifically using the provided data history.
      2.  **Summary**: Update the 'summary' to directly answer the question.
      3.  **Charts**: Generate NEW specific 'charts'. 'dataKey' MUST be numeric.
      4.  **Insights**: Update 'keyInsights'.
      5.  **Language**: Output STRICTLY in ${languageName}.
    `;
    
    if (image) {
      taskPrompt += `\n**Image Context**: The user has attached an image. Use visual cues from it.`;
    }

    if (history && history.length > 0) {
      const recentHistory = history.slice(-6).map(msg => 
        `${msg.role.toUpperCase()}: ${msg.content} ${msg.attachment ? '[Image Attached]' : ''}`
      ).join('\n');
      taskPrompt += `\n**Conversation History**:\n${recentHistory}`;
    }

  } else {
    // Initial analysis
    taskPrompt = `
      **Your Task:**
      Perform a comprehensive analysis of the provided ERP dataset.

      1.  **Executive Summary**: Write a professional summary using the DATASET STATISTICS for high-level metrics (e.g. Total Volume, Date Range).
      2.  **Key Insights**: Provide 3-5 specific, actionable bullet points.
      3.  **Strategic Charts**: Suggest up to 4 charts.
      
      **Language**: Output STRICTLY in ${languageName}.
    `;
  }

  // --- CRITICAL: Append User Template Override at the END ---
  if (userOverrideInstructions) {
      taskPrompt += `
      
      ================================================================
      **MANDATORY USER OVERRIDE INSTRUCTIONS**
      The user has defined specific analysis rules in their template. 
      You MUST follow these instructions over any default behavior above.
      This is the MOST IMPORTANT part of your task.
      
      ${userOverrideInstructions}
      ================================================================
      `;
  }

  try {
    const parts: any[] = [{ text: baseContext + taskPrompt }];

    if (image) {
      parts.unshift({
        inlineData: {
          mimeType: image.mimeType,
          data: image.content
        }
      });
    }

    const performRequest = async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: analysisSchema,
                systemInstruction: roleInstruction,
            },
        });
        return response;
    };

    // Retry Logic for Stability
    let response;
    try {
        response = await performRequest();
    } catch (err: any) {
        if (err.message && (err.message.includes('500') || err.message.includes('xhr') || err.message.includes('fetch') || err.message.includes('Rpc'))) {
             console.warn("Retrying Gemini request due to network/server error:", err.message);
             // Wait briefly
             await new Promise(r => setTimeout(r, 1000));
             response = await performRequest();
        } else {
            throw err;
        }
    }

    if (response && response.text) {
      return JSON.parse(response.text) as AnalysisResult;
    }
    throw new Error("No response generated from AI.");

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};
