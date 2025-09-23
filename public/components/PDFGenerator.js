// PDFGenerator.js - PDF Report Generation for HRDD Risk Assessment Tool
export class PDFGenerator {
  constructor() {
    this.jsPDFLoaded = false;
    this.html2canvasLoaded = false;
    this.loadingPromises = new Map();
  }

 async loadLibrary(libName, scriptSrc, globalCheck) {
    if (this.loadingPromises.has(libName)) {
      return this.loadingPromises.get(libName);
    }

    if (typeof globalCheck === 'function') {
      try {
        const existing = globalCheck();
        if (existing) {
          this[`${libName}Loaded`] = true;
          return Promise.resolve(existing);
        }
      } catch (error) {
        console.warn(`Preload check for ${libName} failed:`, error);
      }
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.onload = () => {
        try {
          const result = typeof globalCheck === 'function' ? globalCheck() : true;
          this[`${libName}Loaded`] = true;
          resolve(result);
        } catch (error) {
          this[`${libName}Loaded`] = true;
          resolve();
        }
      };
      script.onerror = () => reject(new Error(`Failed to load ${libName}`));
      document.head.appendChild(script);
    });

    this.loadingPromises.set(libName, promise);
    return promise;
  }

  async loadRequiredLibraries() {
    const jsPDFPromise = this.loadLibrary(
      'jsPDF',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      () => this.ensureJsPDFAvailable()
    );

    const html2canvasPromise = this.loadLibrary(
      'html2canvas',
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      () => typeof window !== 'undefined' && typeof window.html2canvas !== 'undefined'
    );

    await Promise.all([jsPDFPromise, html2canvasPromise]);

    if (!this.ensureJsPDFAvailable()) {
      throw new Error('jsPDF library failed to load');
    }

    if (typeof window === 'undefined' || typeof window.html2canvas === 'undefined') {
      throw new Error('html2canvas library failed to load');
    }
  }

  ensureJsPDFAvailable() {
    if (typeof window === 'undefined') return null;

    if (typeof window.jsPDF === 'function') {
      return window.jsPDF;
    }

    const namespace = window.jspdf;
    if (namespace && typeof namespace.jsPDF === 'function') {
      window.jsPDF = namespace.jsPDF;
      return window.jsPDF;
    }

    return null;
  }

  createLoadingModal() {
    const modal = document.createElement('div');
    modal.id = 'pdfLoadingModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8);
      display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    modal.innerHTML = `
      <div style="background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f4f6; border-top: 4px solid #3b82f6; 
                    border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
        <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937;">Generating Report</h3>
        <div id="pdfProgress" style="color: #6b7280; font-size: 14px;">Initializing PDF generation...</div>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  updateProgress(message) {
    const progressElement = document.getElementById('pdfProgress');
    if (progressElement) {
      progressElement.textContent = message;
    }
  }

  removeLoadingModal() {
    const modal = document.getElementById('pdfLoadingModal');
    if (modal) {
      modal.remove();
    }
  }

  hideElements(elements = []) {
    const hiddenStates = [];
    elements.forEach(element => {
      if (element && element.style) {
        hiddenStates.push({ element, display: element.style.display });
        element.style.display = 'none';
      }
    });
    return hiddenStates;
  }

  restoreElements(hiddenStates = []) {
    hiddenStates.forEach(state => {
      if (state && state.element && state.element.style) {
        state.element.style.display = state.display ?? '';
      }
    });
  }

  async captureElement(element, options = {}) {
    if (!element) return null;

    const pixelRatio = (() => {
      if (typeof window !== 'undefined' && window.devicePixelRatio) {
        const ratio = Math.max(1.25, window.devicePixelRatio);
        return Math.min(ratio, 1.5);
      }
      return 1.35;
    })();

    const defaultOptions = {
      scale: pixelRatio,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      height: element.offsetHeight,
      scrollX: 0,
      scrollY: 0,
      ...options
    };

    try {
      // Handle SVG elements specifically (like D3 maps)
      const svgElements = element.querySelectorAll('svg');
      const svgDataUrls = [];
      
      for (let svg of svgElements) {
        try {
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          canvas.width = svg.clientWidth || 800;
          canvas.height = svg.clientHeight || 400;
          
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          
          await new Promise((resolve, reject) => {
            img.onload = () => {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = reject;
            img.src = url;
          });
          
          svgDataUrls.push({ svg, dataUrl: canvas.toDataURL('image/png') });
        } catch (error) {
          console.warn('Failed to convert SVG to image:', error);
        }
      }

      // Temporarily replace SVGs with images
      const originalSvgs = [];
      svgDataUrls.forEach(({ svg, dataUrl }) => {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.width = svg.style.width || `${svg.clientWidth}px`;
        img.style.height = svg.style.height || `${svg.clientHeight}px`;
        img.style.maxWidth = '100%';
        originalSvgs.push({ svg, img });
        svg.parentNode.insertBefore(img, svg);
        svg.style.display = 'none';
      });

      const canvas = await html2canvas(element, defaultOptions);

      // Restore original SVGs
      originalSvgs.forEach(({ svg, img }) => {
        svg.style.display = '';
        img.remove();
      });

      return canvas;
    } catch (error) {
 console.error('Error capturing element:', error);
      return null;
    }
  }

  async captureWithHiddenElements(targetElement, elementsToHide = []) {
    const hiddenStates = this.hideElements(elementsToHide);
    try {
      return await this.captureElement(targetElement);
    } finally {
      this.restoreElements(hiddenStates);
    }
  }

  async generatePanelContent(appInstance, panelNumber) {
    const originalPanel = appInstance.state.currentPanel;
    appInstance.state.currentPanel = panelNumber;
    appInstance.render();

    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const panelContent = document.getElementById('panelContent');
      if (!panelContent) {
        return [];
      }

           if (panelNumber === 2) {
        const sections = [];
        const resultsPanel = document.getElementById('resultsPanel');
        const baselineMap = document.getElementById('baselineMapContainer');
        const countrySelection = document.getElementById('countrySelectionPanel');

        const countrySelectionCanvas = await this.captureWithHiddenElements(panelContent, [resultsPanel]);
        if (countrySelectionCanvas) {
          sections.push({ canvas: countrySelectionCanvas, sectionTitle: 'Country Selection' });
        }

        const portfolioCanvas = await this.captureWithHiddenElements(panelContent, [baselineMap, countrySelection]);
        if (portfolioCanvas) {
          sections.push({ canvas: portfolioCanvas, sectionTitle: 'Portfolio Risk Assessment' });
        }

        if (sections.length > 0) {
          return sections;
        }

        const fallbackCanvas = await this.captureElement(panelContent);
        return fallbackCanvas ? [{ canvas: fallbackCanvas }] : [];
      }

      if (panelNumber === 3) {
        const sections = [];
        const strategyInfo = panelContent.querySelector('[data-panel3-info="strategy"]');
        const transparencyInfo = panelContent.querySelector('[data-panel3-info="transparency"]');
        const focusPanel = document.getElementById('focusPanel');

        const strategyCanvas = await this.captureWithHiddenElements(panelContent, [strategyInfo, transparencyInfo, focusPanel]);
        if (strategyCanvas) {
          sections.push({ canvas: strategyCanvas, sectionTitle: 'HRDD Strategy Configuration' });
        }

        const strategyPanel = document.getElementById('hrddStrategyPanel');
        const transparencyPanel = document.getElementById('transparencyPanel');
        const strategyContainer = document.getElementById('strategyContainer');
        const transparencyContainer = document.getElementById('transparencyContainer');
        const riskSummary = document.getElementById('strategyRiskSummary');

        const guidanceCanvas = await this.captureWithHiddenElements(panelContent, [
          riskSummary,
          strategyPanel ? strategyPanel.firstElementChild : null,
          strategyContainer,
          transparencyPanel ? transparencyPanel.firstElementChild : null,
          transparencyContainer
        ]);

        if (guidanceCanvas) {
          sections.push({ canvas: guidanceCanvas, sectionTitle: 'Guidance & Focus Settings' });
        }

        if (sections.length > 0) {
          return sections;
        }

        const fallbackCanvas = await this.captureElement(panelContent);
        return fallbackCanvas ? [{ canvas: fallbackCanvas }] : [];
      }

      if (panelNumber === 5) {
        const sectionCanvases = [];

        const mapSection = document.getElementById('panel5MapsSection');
        if (mapSection) {
          const mapsCanvas = await this.captureElement(mapSection);
          if (mapsCanvas) {
            sectionCanvases.push({ canvas: mapsCanvas, sectionTitle: 'Risk Maps' });
          }
        }

        const finalResultsPanel = document.getElementById('finalResultsPanel');
        let resultsCaptured = false;

        if (finalResultsPanel) {
          const coverageBreakdown = document.getElementById('coverageResponseBreakdownSection');
          const actionsSection = document.getElementById('finalResultsActions');

          const strategyCanvas = await this.captureWithHiddenElements(finalResultsPanel, [coverageBreakdown, actionsSection]);
          if (strategyCanvas) {
            sectionCanvases.push({
              canvas: strategyCanvas,
              sectionTitle: 'How Your Enhanced HRDD Strategy Reduces Risk'
            });
            resultsCaptured = true;
          }

          const riskSummary = document.getElementById('finalRiskSummary');
          const strategyTransformation = document.getElementById('strategyTransformationSection');

          const breakdownCanvas = await this.captureWithHiddenElements(finalResultsPanel, [riskSummary, strategyTransformation]);
          if (breakdownCanvas) {
            sectionCanvases.push({
              canvas: breakdownCanvas,
              sectionTitle: 'How Coverage & Response Choices Reduce Risk'
            });
            resultsCaptured = true;
          }

          if (!resultsCaptured) {
            const fallbackResults = await this.captureElement(finalResultsPanel);
            if (fallbackResults) {
              sectionCanvases.push({ canvas: fallbackResults, sectionTitle: 'Strategy Summary' });
              resultsCaptured = true;
            }
          }
        } else {
          const resultsSection = document.getElementById('panel5ResultsSection') || document.getElementById('finalResultsPanel');
          if (resultsSection) {
            const resultsCanvas = await this.captureElement(resultsSection);
            if (resultsCanvas) {
              sectionCanvases.push({ canvas: resultsCanvas, sectionTitle: 'Strategy Summary' });
              resultsCaptured = true;
            }
          }
        }

        if (sectionCanvases.length === 0) {
          const fallbackCanvas = await this.captureElement(panelContent);
          if (fallbackCanvas) {
            sectionCanvases.push({ canvas: fallbackCanvas });
          }
        }

        return sectionCanvases;
      }

      const canvas = await this.captureElement(panelContent);
      if (canvas) {
        return [{ canvas }];
      }

      return [];
    } finally {
      appInstance.state.currentPanel = originalPanel;
      appInstance.render();
    }
  }

  formatRiskValue(value) {
    return Number.isFinite(value) ? value.toFixed(1) : 'N/A';
  }

  formatCountriesCount(selectedCountries) {
    if (!Array.isArray(selectedCountries)) return '0';
    return selectedCountries.length.toString();
  }

  calculateRiskReduction(baseline, managed) {
    if (!Number.isFinite(baseline) || !Number.isFinite(managed) || baseline === 0) {
      return null;
    }

    const absolute = baseline - managed;
    const percentage = (absolute / baseline) * 100;
    return {
      absolute: absolute.toFixed(1),
      percentage: percentage.toFixed(1)
    };
  }

  formatDateTime(date) {
    if (!(date instanceof Date)) return '';
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  createCoverPage(pdf, appInstance, generatedAt) {
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;
    const cardWidth = pageWidth - 2 * margin;

    const baselineRisk = this.formatRiskValue(appInstance.state.baselineRisk);
    const managedRisk = this.formatRiskValue(appInstance.state.managedRisk);
    const selectedCount = this.formatCountriesCount(appInstance.state.selectedCountries);
    const riskReduction = this.calculateRiskReduction(appInstance.state.baselineRisk, appInstance.state.managedRisk);

    // Decorative hero section
    pdf.setFillColor(17, 24, 39); // Slate-900
    pdf.rect(0, 0, pageWidth, 120, 'F');

    pdf.setFillColor(59, 130, 246); // Blue-500 accent
    pdf.circle(pageWidth - 30, 30, 20, 'F');
    pdf.setFillColor(99, 102, 241); // Indigo-500 accent
    pdf.circle(pageWidth - 60, 70, 14, 'F');

    // Title content
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(26);
    pdf.text('Labour Rights Due Diligence', margin, 55);

    pdf.setFontSize(22);
    pdf.text('Risk Assessment Report', margin, 75);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.text('Comprehensive coverage-based risk management and effectiveness analysis', margin, 92);

    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.6);
    pdf.line(margin, 98, pageWidth - margin, 98);

    // Summary card
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, 125, cardWidth, 100, 6, 6, 'F');

    pdf.setTextColor(30, 41, 59); // Slate-800
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('Engagement Snapshot', margin + 10, 145);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.text('Generated on', margin + 10, 160);

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(this.formatDateTime(generatedAt), margin + 10, 168);

    const metrics = [
      {
        label: 'Countries Selected',
        value: selectedCount
      },
      {
        label: 'Baseline Risk',
        value: baselineRisk
      },
      {
        label: 'Managed Risk',
        value: managedRisk
      }
    ];

    const columnWidth = (cardWidth - 20) / metrics.length;
    const metricsY = 200;

    metrics.forEach((metric, index) => {
      const xCenter = margin + 10 + columnWidth * index + columnWidth / 2;
      pdf.setTextColor(99, 102, 241);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text(metric.value, xCenter, metricsY, { align: 'center' });

      pdf.setTextColor(71, 85, 105);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text(metric.label, xCenter, metricsY + 8, { align: 'center' });
    });

    if (riskReduction) {
      pdf.setTextColor(15, 118, 110); // Teal-700
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text(`Risk reduction achieved: ${riskReduction.absolute} (${riskReduction.percentage}%)`, margin + 10, metricsY + 26);
    }

    // Footer note
    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Insights calculated using the HRDD coverage-based methodology across five analytical panels.', margin, pageHeight - 30);

    // Reset text color for subsequent pages
    pdf.setTextColor(33, 37, 41);
  }

  addPageContent(pdf, canvas, { panelNumber, panelTitle, pageNumber, sectionTitle }) {
    if (!canvas) return;

    const pageWidth = 210; // A4 width in mm␊
    const pageHeight = 297; // A4 height in mm␊
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    const baseHeaderHeight = 22;
    const hasSectionTitle = Boolean(sectionTitle);
    const headerHeight = hasSectionTitle ? baseHeaderHeight + 6 : baseHeaderHeight;
    const headerSpacing = 6;
    const imageTop = margin + headerHeight + headerSpacing;
    const maxContentHeight = pageHeight - imageTop - margin;

    if (pageNumber > 1) {
      pdf.addPage();
    }

    // Calculate image dimensions
    const canvasAspectRatio = canvas.width / canvas.height;
    let imgWidth = contentWidth;
    let imgHeight = imgWidth / canvasAspectRatio;

    if (imgHeight > maxContentHeight) {
      imgHeight = maxContentHeight;
      imgWidth = imgHeight * canvasAspectRatio;
    }

    const imgX = margin + (contentWidth - imgWidth) / 2;
    const imgY = imageTop;

    try {
      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      pdf.addImage(imgData, 'JPEG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST');
    } catch (error) {
      console.error('Error adding image to PDF:', error);
      pdf.setFontSize(12);
      pdf.text('Error: Could not capture panel content', margin, margin + 40);
    }

     // Header background to keep titles visible
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(margin - 2, margin - 8, contentWidth + 4, headerHeight + 10, 4, 4, 'F');

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);

   pdf.text(`Panel ${panelNumber}: ${panelTitle}`, margin, margin + 8);

    if (hasSectionTitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(71, 85, 105);
      pdf.text(sectionTitle, margin, margin + 16);
      pdf.setTextColor(30, 41, 59);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Page ${pageNumber}`, pageWidth - margin - 20, margin + 8);
  }

  async generateReport(appInstance) {
    const modal = this.createLoadingModal();
    
    try {
      this.updateProgress('Loading PDF libraries...');
      await this.loadRequiredLibraries();

       const jsPDFConstructor = this.ensureJsPDFAvailable();
      if (!jsPDFConstructor) {
        throw new Error('jsPDF is not available');
      }

       const pdf = new jsPDFConstructor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const now = new Date();
      const panelTitles = {
        1: 'Global Risks',
        2: 'Baseline Risk',
        3: 'HRDD Strategy',
        4: 'Response Strategy',
        5: 'Managed Risk'
      };

      this.updateProgress('Designing cover page...');
      this.createCoverPage(pdf, appInstance, now);

      // Generate each panel
      let currentPageNumber = 2;
      for (let panelNumber = 1; panelNumber <= 5; panelNumber++) {
        this.updateProgress(`Capturing Panel ${panelNumber}: ${panelTitles[panelNumber]}...`);

         const panelSections = await this.generatePanelContent(appInstance, panelNumber);

        if (Array.isArray(panelSections) && panelSections.length > 0) {
          const validSections = panelSections.filter(section => section && section.canvas);

          validSections.forEach((section, index) => {
            const { canvas, sectionTitle } = section;

            this.addPageContent(pdf, canvas, {
              panelNumber,
              panelTitle: panelTitles[panelNumber],
              pageNumber: currentPageNumber + index,
              sectionTitle
            });
          });

          currentPageNumber += validSections.length;
        }
        
        // Add a small delay between panels
        await new Promise(resolve => setTimeout(resolve, 500));
      }


      this.updateProgress('Finalizing PDF...');
      
      // Generate filename with timestamp
      const timestamp = now.toISOString().slice(0, 10);
      const filename = `HRDD_Risk_Assessment_Report_${timestamp}.pdf`;
      
      // Save the PDF
      pdf.save(filename);
      
      this.updateProgress('Report generated successfully!');
      
      // Show success message briefly before closing
      setTimeout(() => {
        this.removeLoadingModal();
      }, 1000);

    } catch (error) {
      console.error('Error generating PDF report:', error);
      this.updateProgress('Error generating report. Please try again.');
      
      setTimeout(() => {
        this.removeLoadingModal();
        alert('Failed to generate PDF report. Please ensure you have a stable internet connection and try again.');
      }, 2000);
    }
  }
}

export const pdfGenerator = new PDFGenerator();