
import PptxGenJS from 'pptxgenjs';
import html2canvas from 'html2canvas';
import { AnalysisResult, Language } from '../../types';
import { translations } from '../../i18n';

/**
 * Helper to calculate aspect ratio and position image on slide (Full Slide)
 */
const fitImageOnSlide = (slide: PptxGenJS.Slide, imgData: string, imgW: number, imgH: number, title?: string) => {
    // Slide dimensions (16:9)
    const slideWidth = 10;
    const slideHeight = 5.625;
    const margin = 0.3;
    const headerSpace = title ? 0.6 : 0.2;

    const availableW = slideWidth - (margin * 2);
    const availableH = slideHeight - (margin * 2) - headerSpace;

    const imgRatio = imgW / imgH;
    const areaRatio = availableW / availableH;

    let finalW, finalH;

    if (imgRatio > areaRatio) {
        // Image is wider relative to area -> fit by Width
        finalW = availableW;
        finalH = availableW / imgRatio;
    } else {
        // Image is taller relative to area -> fit by Height
        finalH = availableH;
        finalW = availableH * imgRatio;
    }

    const xPos = margin + (availableW - finalW) / 2;
    const yPos = margin + headerSpace + (availableH - finalH) / 2;

    if (title) {
         slide.addText(title, { x: margin, y: 0.3, w: '90%', fontSize: 18, bold: true, color: '363636' });
    }

    slide.addImage({
        data: imgData,
        x: xPos,
        y: yPos,
        w: finalW,
        h: finalH
    });
};

/**
 * Capture a specific DOM element as an image
 */
const captureElement = async (element: HTMLElement): Promise<{ data: string, width: number, height: number } | null> => {
    try {
        const canvas = await html2canvas(element, { 
            scale: 2, 
            useCORS: true, 
            logging: false, 
            backgroundColor: '#ffffff',
            ignoreElements: (el) => el.classList.contains('drag-handle') || el.hasAttribute('data-html2canvas-ignore')
        });
        return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    } catch (err) {
        console.warn("Capture failed for element", element.id, err);
        return null;
    }
};

/**
 * Standard capture for sections
 */
const captureSection = async (elementId: string): Promise<{ data: string, width: number, height: number } | null> => {
    const element = document.getElementById(elementId);
    if (!element) return null;
    return captureElement(element);
};

export const exportToPPTX = async (analysis: AnalysisResult, filename: string, language: Language, originalFileName?: string) => {
    const t = translations[language];
    const pptx = new PptxGenJS();
    
    // 1. Title Slide
    const slide1 = pptx.addSlide();
    slide1.addText(t.reportTitle, { x: 0.5, y: 1.5, w: '90%', fontSize: 36, bold: true, align: 'center', color: '363636' });
    if (originalFileName) {
        slide1.addText(originalFileName, { x: 0.5, y: 2.3, w: '90%', fontSize: 18, bold: true, align: 'center', color: '2563EB' });
    }
    slide1.addText(`${t.poweredBy}`, { x: 0.5, y: 4.0, w: '90%', fontSize: 14, align: 'center', color: '888888' });
    slide1.addText(new Date().toLocaleDateString(), { x: 0.5, y: 4.5, w: '90%', fontSize: 12, align: 'center', color: 'aaaaaa' });

    // 2. Summary Slide
    const summaryImg = await captureSection('dashboard-summary-section');
    if (summaryImg) {
        const slide2 = pptx.addSlide();
        fitImageOnSlide(slide2, summaryImg.data, summaryImg.width, summaryImg.height, t.aiSummary);
    }

    // 3. Charts Slides (Grid Layout: 2x2)
    const chartNodes = Array.from(document.querySelectorAll('[id^="chart-container-"]')) as HTMLElement[];
    
    if (chartNodes.length > 0) {
        // Sort by visual position (Top-Left to Bottom-Right)
        chartNodes.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            // Allow small threshold for same-row detection
            if (Math.abs(rectA.top - rectB.top) > 50) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });

        const SLIDE_W = 10;
        const SLIDE_H = 5.625;
        const MARGIN_X = 0.3;
        const MARGIN_Y = 0.8; // Space for title
        const GAP = 0.2;
        
        // Grid Calculation
        const COL_COUNT = 2;
        const ROW_COUNT = 2;
        const ITEMS_PER_SLIDE = COL_COUNT * ROW_COUNT;
        
        const CELL_W = (SLIDE_W - (MARGIN_X * 2) - (GAP * (COL_COUNT - 1))) / COL_COUNT;
        const CELL_H = (SLIDE_H - MARGIN_Y - MARGIN_X - (GAP * (ROW_COUNT - 1))) / ROW_COUNT; // Bottom margin same as X margin

        for (let i = 0; i < chartNodes.length; i += ITEMS_PER_SLIDE) {
            const slide = pptx.addSlide();
            slide.addText(t.sheetCharts, { x: MARGIN_X, y: 0.3, w: '90%', fontSize: 18, bold: true, color: '363636' });

            const batch = chartNodes.slice(i, i + ITEMS_PER_SLIDE);
            
            for (let j = 0; j < batch.length; j++) {
                const node = batch[j];
                const imgData = await captureElement(node);
                
                if (imgData) {
                    const col = j % COL_COUNT;
                    const row = Math.floor(j / COL_COUNT);
                    
                    const x = MARGIN_X + (col * (CELL_W + GAP));
                    const y = MARGIN_Y + (row * (CELL_H + GAP));
                    
                    // Fit image in cell maintaining aspect ratio
                    const imgRatio = imgData.width / imgData.height;
                    const cellRatio = CELL_W / CELL_H;
                    
                    let w, h;
                    if (imgRatio > cellRatio) {
                        w = CELL_W;
                        h = CELL_W / imgRatio;
                    } else {
                        h = CELL_H;
                        w = CELL_H * imgRatio;
                    }
                    
                    // Center in cell
                    const offsetX = (CELL_W - w) / 2;
                    const offsetY = (CELL_H - h) / 2;

                    slide.addImage({
                        data: imgData.data,
                        x: x + offsetX,
                        y: y + offsetY,
                        w: w,
                        h: h
                    });
                }
            }
        }
    }

    // 4. Preview Slide
    const previewImg = await captureSection('dashboard-preview-section');
    if (previewImg) {
        const slide4 = pptx.addSlide();
        fitImageOnSlide(slide4, previewImg.data, previewImg.width, previewImg.height, t.previewTitle);
    }

    pptx.writeFile({ fileName: filename });
};
