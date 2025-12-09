import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export const exportToPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  try {
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const margin = 10; 
    const imgWidth = 210 - (margin * 2); 
    const pageHeight = 297; 
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin; 
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - margin * 2);
    while (heightLeft > 0) {
      position = heightLeft - imgHeight; 
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, - (pageHeight - margin) + (heightLeft % pageHeight) , imgWidth, imgHeight); 
      heightLeft -= 297;
    }
    pdf.save(filename);
  } catch (error) {
    console.error("PDF Export failed:", error);
    throw error;
  }
};