
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
  const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
  
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables.");
    throw new Error("API Key is missing. Please ensure process.env.API_KEY is configured.");
  }
  
  return new GoogleGenAI({ apiKey: apiKey });
};

// RAG-Lite: Simple keyword search to find relevant rows in the full dataset
const findRelevantRows = (data: ExcelDataRow[], userPrompt: string, limit: number = 20): ExcelDataRow[] => {
    if (!userPrompt || !data.length) return [];
    
    // Extract potential keywords (alphanumeric sequences > 3 chars)
    // e.g. "Check MO-2025001 status" -> ["Check", "MO-2025001", "status"]
    const tokens: string[] = userPrompt.match(/[a-zA-Z0-9\u4e00-\u9fa5\-_]{3,}/g) || [];
    const keywords = tokens.filter(t => !['check', 'status', 'what', 'show', 'tell', 'about', 'analysis'].includes(t.toLowerCase()));

    if (keywords.length === 0) return [];

    const matches: ExcelDataRow[] = [];
    // Scan full dataset
    for (const row of data) {
        if (matches.length >= limit) break;
        const rowStr = JSON.stringify(row).toLowerCase();
        // If any specific keyword matches
        if (keywords.some(k => rowStr.includes(k.toLowerCase()))) {
            matches.push(row);
        }
    }
    return matches;
};

export const analyzeDataWithGemini = async (
  data: ExcelDataRow[], 
  language: Language,
  userPrompt?: string,
  image?: ChatAttachment,
  history?: ChatMessage[],
  templates?: AnalysisTemplate[]
): Promise<AnalysisResult> => {
  
  const ai = createAIClient();

  // 1. Get Statistical Context (Full Scope)
  const stats = getDatasetStats(data);
  
  // 2. Get Smart Sample (General Context) - 150 rows
  const generalSample = getSmartSample(data, 150);

  // 3. RAG-Lite: Get Context-Specific Rows (if user asked a question)
  // This ensures that if user asks "What about Order #123?", we actually inject Order #123 data even if it wasn't in the random sample.
  let contextRows = generalSample;
  if (userPrompt) {
      const specificRows = findRelevantRows(data, userPrompt);
      if (specificRows.length > 0) {
          // Merge specific rows at the top, deduplicate
          const combined = [...specificRows, ...generalSample];
          const uniqueMap = new Map();
          combined.forEach(r => uniqueMap.set(JSON.stringify(r), r));
          contextRows = Array.from(uniqueMap.values()).slice(0, 200); // Cap at 200
      }
  }

  const headers = Object.keys(contextRows[0] || {}).join(', ');

  const languageName = {
    'zh-TW': 'Traditional Chinese (Taiwan)',
    'en-US': 'English',
    'vi-VN': 'Vietnamese'
  }[language];

  // Base Context Construction
  let roleInstruction = `You are a Senior ERP Data Analysis Consultant specializing in Digiwin Workflow ERP (鼎新 ERP). Your goal is to provide actionable business intelligence. Always respond in ${languageName}.`;
  let userOverrideInstructions = "";

  if (templates && templates.length > 0) {
     const combinedInstructions = templates.map(t => t.systemInstruction).join('\n\n');
     roleInstruction = `${combinedInstructions}. Always respond in ${languageName}.`;
     
     userOverrideInstructions = templates.map(t => `[Template: ${t.name}]\n${t.customPrompt}`).join('\n\n');
  }

  const baseContext = `
    I have provided a dataset.
    
    **DATASET STATISTICS (Full Scope - Use this for totals):**
    - Total Records: ${stats.rowCount}
    - Date Range: ${stats.dateRange.start} to ${stats.dateRange.end}
    - Numeric Summaries: ${JSON.stringify(stats.numericStats, null, 2)}

    **DATA CONTEXT (Sample + Relevant Rows):**
    - Headers: ${headers}
    - Rows: ${JSON.stringify(contextRows)}
    
    (Note: The 'Rows' provided are a representative sample. If specific rows matching the user's query were found, they are included here.)
  `;

  let taskPrompt = "";

  if (userPrompt || (history && history.length > 0)) {
    taskPrompt = `
      **USER REQUEST:** "${userPrompt || "Based on previous context"}"

      **Your Task:**
      1.  **Direct Answer**: Use the provided 'Rows' to answer specific questions about specific orders/items.
      2.  **Summary**: Update the summary to focus on the user's topic.
      3.  **Charts**: Generate charts relevant to the user's request.
      4.  **Language**: Output STRICTLY in ${languageName}.
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
    taskPrompt = `
      **Your Task:**
      Perform a comprehensive analysis of the provided ERP dataset.

      1.  **Executive Summary**: Write a professional summary. Use DATASET STATISTICS for high-level metrics.
      2.  **Key Insights**: Provide 3-5 specific, actionable bullet points.
      3.  **Strategic Charts**: Suggest up to 4 charts.
      
      **Language**: Output STRICTLY in ${languageName}.
    `;
  }

  // --- MANDATORY USER OVERRIDE ---
  if (userOverrideInstructions) {
      taskPrompt += `
      
      ================================================================
      **MANDATORY USER OVERRIDE INSTRUCTIONS**
      The user has defined specific analysis rules in their template. 
      You MUST follow these instructions over any default behavior above.
      
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

    // Retry Logic
    let response;
    try {
        response = await performRequest();
    } catch (err: any) {
        if (err.message && (err.message.includes('500') || err.message.includes('xhr') || err.message.includes('fetch'))) {
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
