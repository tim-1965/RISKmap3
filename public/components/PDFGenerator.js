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

  expandScrollableAreas(rootElement) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') {
      return [];
    }

    const elements = [rootElement, ...Array.from(rootElement.querySelectorAll('*'))];
    const expansions = [];

    elements.forEach(element => {
      if (!(element instanceof HTMLElement)) return;
      if (element === document.body || element === document.documentElement) return;

      const scrollableHeight = element.scrollHeight - element.clientHeight;
      if (!Number.isFinite(scrollableHeight) || scrollableHeight <= 2) {
        return;
      }

      expansions.push({
        element,
        styles: {
          overflow: element.style.overflow,
          overflowX: element.style.overflowX,
          overflowY: element.style.overflowY,
          maxHeight: element.style.maxHeight,
          height: element.style.height
        }
      });

      element.style.overflow = 'visible';
      element.style.overflowX = 'visible';
      element.style.overflowY = 'visible';
      element.style.maxHeight = 'none';
      element.style.height = 'auto';
    });

    return expansions;
  }

  restoreScrollableAreas(expansions = []) {
    expansions.forEach(expansion => {
      if (!expansion || !expansion.element || !expansion.styles) return;
      const { element, styles } = expansion;
      element.style.overflow = styles.overflow ?? '';
      element.style.overflowX = styles.overflowX ?? '';
      element.style.overflowY = styles.overflowY ?? '';
      element.style.maxHeight = styles.maxHeight ?? '';
      element.style.height = styles.height ?? '';
    });
  }

  isButtonActive(button) {
    if (!button) return false;

    const inlineBackground = (button.style?.background || '').trim().toLowerCase();
    if (inlineBackground && inlineBackground !== '#f8fafc') {
      return true;
    }

    try {
      const computed = window.getComputedStyle(button);
      if (!computed) return false;

      const computedBackground = (computed.backgroundColor || '').trim().toLowerCase();
      if (computedBackground && computedBackground !== 'rgb(248, 250, 252)') {
        return true;
      }

      const transform = (button.style?.transform || computed.transform || '').trim();
      if (transform && transform !== 'none') {
        if (transform.includes('translateY(-1px)')) {
          return true;
        }

        if (transform.startsWith('matrix')) {
          const values = transform.replace(/^matrix\(|\)$/g, '').split(',');
          if (values.length === 6) {
            const translateY = parseFloat(values[5]);
            if (!Number.isNaN(translateY) && translateY < 0) {
              return true;
            }
          }
        }
      }

      const boxShadow = (button.style?.boxShadow || computed.boxShadow || '').toLowerCase();
      if (boxShadow.includes('16px')) {
        return true;
      }
    } catch (error) {
      console.warn('Unable to determine button active state:', error);
    }

    return false;
  }

  getActiveMapMode(mapsSection) {
    if (!mapsSection || typeof mapsSection.querySelectorAll !== 'function') {
      return null;
    }

    const buttons = mapsSection.querySelectorAll('.cost-map-mode');
    for (const button of buttons) {
      if (this.isButtonActive(button)) {
        return button.dataset?.mapMode || null;
      }
    }

    return null;
  }

  isMapModeActive(mapsSection, mode) {
    if (!mapsSection) return false;
    const button = mapsSection.querySelector(`.cost-map-mode[data-map-mode="${mode}"]`);
    return this.isButtonActive(button);
  }

  async ensureCostAnalysisMapReady(mapsSection) {
    if (!mapsSection || typeof mapsSection.querySelector !== 'function') {
      return;
    }

    const mapContainer = mapsSection.querySelector('#costAnalysisMapCanvas');
    if (!mapContainer) {
      return;
    }

    const mapReady = await this.waitForCondition(() => {
      const svg = mapContainer.querySelector('svg');
      if (svg) {
        const countryPaths = svg.querySelectorAll('path.country');
        if (countryPaths.length > 0) {
          return Array.from(countryPaths).some(path => {
            const d = path.getAttribute('d');
            return typeof d === 'string' && d.trim().length > 0;
          });
        }

        // Fallback: ensure the SVG has drawn paths
        return svg.querySelectorAll('path').length > 10;
      }

      // Support fallback map grid rendering
      const fallbackGrid = mapContainer.querySelector('.simple-map-container');
      if (fallbackGrid) {
        const tiles = fallbackGrid.querySelectorAll('.map-grid div');
        return tiles.length > 0;
      }

      return false;
    }, { timeout: 4000, interval: 160 });

    if (!mapReady) {
      console.warn('Cost analysis map did not finish rendering before capture.');
    }
  }

  async waitForCondition(condition, { timeout = 2500, interval = 120 } = {}) {
    if (typeof condition !== 'function') {
      return false;
    }

    const start = Date.now();

    return new Promise(resolve => {
      const check = () => {
        let result = false;
        try {
          result = Boolean(condition());
        } catch (error) {
          result = false;
        }

        if (result) {
          resolve(true);
          return;
        }

        if (Date.now() - start >= timeout) {
          resolve(false);
          return;
        }

        setTimeout(check, interval);
      };

      check();
    });
  }

  async withForcedOverflowVisible(targetElement, task, options = {}) {
    if (typeof task !== 'function') {
      return null;
    }

    if (!targetElement || typeof targetElement.querySelectorAll !== 'function') {
      return await task();
    }

    const { expandScrollable = false } = options;
    const elements = new Set();

    const registerElement = element => {
      if (!element || !element.style) return;
      const { overflow, overflowX, overflowY } = element.style;
      if (overflow || overflowX || overflowY) {
        elements.add(element);
      }
    };

    registerElement(targetElement);
    targetElement.querySelectorAll('*').forEach(registerElement);

    const snapshots = Array.from(elements).map(element => ({
      element,
      overflow: element.style.overflow,
      overflowX: element.style.overflowX,
      overflowY: element.style.overflowY
    }));

    elements.forEach(element => {
      element.style.overflow = 'visible';
      element.style.overflowX = 'visible';
      element.style.overflowY = 'visible';
    });

    const expandedSnapshots = expandScrollable
      ? this.expandScrollableAreas(targetElement)
      : [];

    try {
      return await task();
    } finally {
      this.restoreScrollableAreas(expandedSnapshots);
      snapshots.forEach(({ element, overflow, overflowX, overflowY }) => {
        element.style.overflow = overflow;
        element.style.overflowX = overflowX;
        element.style.overflowY = overflowY;
      });
    }
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

    const elementRect = typeof element.getBoundingClientRect === 'function'
      ? element.getBoundingClientRect()
      : null;

    const computedWidth = Math.max(
      Number.isFinite(element.scrollWidth) ? element.scrollWidth : 0,
      Number.isFinite(element.offsetWidth) ? element.offsetWidth : 0,
      elementRect && Number.isFinite(elementRect.width) ? elementRect.width : 0
    ) || element.clientWidth || 0;

    const computedHeight = Math.max(
      Number.isFinite(element.scrollHeight) ? element.scrollHeight : 0,
      Number.isFinite(element.offsetHeight) ? element.offsetHeight : 0,
      elementRect && Number.isFinite(elementRect.height) ? elementRect.height : 0
    ) || element.clientHeight || 0;

    const normalizedWidth = Math.max(1, Math.round(computedWidth));
    const normalizedHeight = Math.max(1, Math.round(computedHeight));
    const viewportWidth = typeof window !== 'undefined' && Number.isFinite(window.innerWidth)
      ? Math.round(window.innerWidth)
      : 0;
    const viewportHeight = typeof window !== 'undefined' && Number.isFinite(window.innerHeight)
      ? Math.round(window.innerHeight)
      : 0;

    const defaultOptions = {
      scale: pixelRatio,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: normalizedWidth,
      height: normalizedHeight,
      windowWidth: Math.max(normalizedWidth, viewportWidth),
      windowHeight: Math.max(normalizedHeight, viewportHeight),
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

          const svgRect = typeof svg.getBoundingClientRect === 'function'
            ? svg.getBoundingClientRect()
            : null;
          const svgWidthAttribute = parseFloat(svg.getAttribute('width'));
          const svgHeightAttribute = parseFloat(svg.getAttribute('height'));
          const viewBox = svg.viewBox || svg.getAttribute('viewBox');

          const [derivedWidth, derivedHeight] = (() => {
            if (viewBox && typeof viewBox === 'object' && 'baseVal' in viewBox) {
              const { width: vbWidth, height: vbHeight } = viewBox.baseVal || {};
              if (Number.isFinite(vbWidth) && Number.isFinite(vbHeight) && vbWidth > 0 && vbHeight > 0) {
                return [vbWidth, vbHeight];
              }
            }

            if (typeof viewBox === 'string') {
              const parts = viewBox.split(/\s+/).map(value => parseFloat(value));
              if (parts.length === 4 && parts.every(value => Number.isFinite(value))) {
                const [, , vbWidth, vbHeight] = parts;
                if (vbWidth > 0 && vbHeight > 0) {
                  return [vbWidth, vbHeight];
                }
              }
            }

            return [null, null];
          })();

          const widthCandidates = [
            Number.isFinite(svg.clientWidth) ? svg.clientWidth : 0,
            Number.isFinite(svgRect?.width) ? svgRect.width : 0,
            Number.isFinite(svgWidthAttribute) ? svgWidthAttribute : 0,
            Number.isFinite(derivedWidth) ? derivedWidth : 0
          ].filter(value => Number.isFinite(value) && value > 0);

          const heightCandidates = [
            Number.isFinite(svg.clientHeight) ? svg.clientHeight : 0,
            Number.isFinite(svgRect?.height) ? svgRect.height : 0,
            Number.isFinite(svgHeightAttribute) ? svgHeightAttribute : 0,
            Number.isFinite(derivedHeight) ? derivedHeight : 0
          ].filter(value => Number.isFinite(value) && value > 0);

          const safeWidth = Math.max(1, ...(widthCandidates.length ? widthCandidates : [800]));
          const safeHeight = Math.max(1, ...(heightCandidates.length ? heightCandidates : [400]));

          canvas.width = Math.round(safeWidth);
          canvas.height = Math.round(safeHeight);
          
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
          
         img.setAttribute('width', `${canvas.width}`);
          img.setAttribute('height', `${canvas.height}`);
          img.style.width = `${canvas.width}px`;
          img.style.height = `${canvas.height}px`;

          svgDataUrls.push({ svg, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
        } catch (error) {
          console.warn('Failed to convert SVG to image:', error);
        }
      }

      // Temporarily replace SVGs with images
      const originalSvgs = [];
      svgDataUrls.forEach(({ svg, dataUrl, width, height }) => {
        const img = document.createElement('img');
        img.src = dataUrl;
        const computedWidthStyle = (() => {
          if (svg.style?.width) return svg.style.width;
          if (Number.isFinite(width)) return `${width}px`;
          if (Number.isFinite(svg.clientWidth) && svg.clientWidth > 0) return `${svg.clientWidth}px`;
          return '100%';
        })();

        const computedHeightStyle = (() => {
          if (svg.style?.height) return svg.style.height;
          if (Number.isFinite(height)) return `${height}px`;
          if (Number.isFinite(svg.clientHeight) && svg.clientHeight > 0) return `${svg.clientHeight}px`;
          return '100%';
        })();

        img.style.width = computedWidthStyle;
        img.style.height = computedHeightStyle;
        img.style.maxWidth = '100%';
        originalSvgs.push({ svg, img });
        svg.parentNode.insertBefore(img, svg);
        svg.style.display = 'none';
      });

      const canvas = await html2canvas(element, defaultOptions);

      // Restore original SVGs
      originalSvgs.forEach(({ svg, img }) => {
        svg.style.display = '';
        if (img && typeof img.remove === 'function') {
          img.remove();
        }
      });

      return canvas;
    } catch (error) {
 console.error('Error capturing element:', error);
      return null;
    }
  }

  async captureWithHiddenElements(targetElement, elementsToHide = [], options = {}) {
    const { expandScrollable = false } = options || {};
    const hiddenStates = this.hideElements(elementsToHide);
    const expandedStates = expandScrollable ? this.expandScrollableAreas(targetElement) : [];
    try {
      return await this.captureElement(targetElement);
    } finally {
      this.restoreScrollableAreas(expandedStates);
      this.restoreElements(hiddenStates);
    }
  }


  async generatePanelContent(appInstance, panelNumber, options = {}) {
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
        const overviewBlock = panelContent.querySelector('[data-pdf-block="panel3-tools-overview"]');
        const focusPanel = document.getElementById('focusPanel');

        const topSectionHideTargets = [focusPanel, overviewBlock].filter(Boolean);
        const topCanvas = await this.captureWithHiddenElements(panelContent, topSectionHideTargets);
        if (topCanvas) {
          sections.push({ canvas: topCanvas, sectionTitle: 'HRDD Strategy Configuration' });
        }

        if (focusPanel) {
          const focusCanvas = await this.withForcedOverflowVisible(focusPanel, () =>
            this.captureElement(focusPanel)
          );
          if (focusCanvas) {
            sections.push({ canvas: focusCanvas, sectionTitle: 'Focus on High-Risk Countries' });
          }
        }

        if (sections.length > 0) {
          return sections;
        }

        const fallbackCanvas = await this.captureElement(panelContent);
        return fallbackCanvas ? [{ canvas: fallbackCanvas }] : [];
      }

      if (panelNumber === 4) {
        const guidanceBlock = panelContent.querySelector('[data-pdf-block="panel4-guidance"]');
        const canvas = await this.captureWithHiddenElements(panelContent, [guidanceBlock]);
        if (canvas) {
          return [{ canvas, sectionTitle: 'Remedy & Conduct Effectiveness' }];
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
        if (finalResultsPanel) {
          const detailedBreakdown = document.getElementById('detailedStrategyBreakdownSection');

          const firstPageHideTargets = [detailedBreakdown].filter(Boolean);
          const strategyCanvas = await this.captureWithHiddenElements(finalResultsPanel, firstPageHideTargets);
          if (strategyCanvas) {
            sectionCanvases.push({
              canvas: strategyCanvas,
              sectionTitle: 'How Your Use of Labour Rights DD Tools Reduces Risk'
            });
          }

          if (detailedBreakdown) {
            const breakdownCanvas = await this.withForcedOverflowVisible(detailedBreakdown, () =>
              this.captureElement(detailedBreakdown)
            );
            if (breakdownCanvas) {
              sectionCanvases.push({
                canvas: breakdownCanvas,
                sectionTitle: 'How Your Tools Manage Risk After Detection'
              });
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

        if (panelNumber === 6) {
        const sections = [];

        const mapsSection = document.getElementById('panel6MapsSection');
        if (mapsSection) {
          const optimizedButton = mapsSection.querySelector('.cost-map-mode[data-map-mode="optimized"]');
          const baselineButton = mapsSection.querySelector('.cost-map-mode[data-map-mode="baseline"]');
          const previousMode = this.getActiveMapMode(mapsSection) || (baselineButton?.dataset?.mapMode) || 'baseline';
          const shouldToggleOptimized = optimizedButton && !optimizedButton.disabled && !this.isButtonActive(optimizedButton);

          if (shouldToggleOptimized) {
            optimizedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 120));
            await this.waitForCondition(() => this.isMapModeActive(mapsSection, 'optimized'), {
              timeout: 3000,
              interval: 140
            });
            await new Promise(resolve => setTimeout(resolve, 220));
          }

          await this.ensureCostAnalysisMapReady(mapsSection);

          const mapsCanvas = await this.captureElement(mapsSection);
          if (mapsCanvas) {
            sections.push({
              canvas: mapsCanvas,
              sectionTitle: 'Optimization Outcome & Global Risk Outlook'
            });
          }

          const restoreMode = shouldToggleOptimized ? previousMode : null;
          if (restoreMode && restoreMode !== 'optimized') {
            const restoreButton = mapsSection.querySelector(`.cost-map-mode[data-map-mode="${restoreMode}"]`);
            if (restoreButton) {
              restoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              await new Promise(resolve => setTimeout(resolve, 180));
            }
          }
        }

        const assumptionsSection = document.getElementById('panel6CostAssumptionsSection');
        if (assumptionsSection) {
          const assumptionsCanvas = await this.withForcedOverflowVisible(assumptionsSection, () =>
            this.captureElement(assumptionsSection),
            { expandScrollable: true }
          );
          if (assumptionsCanvas) {
            sections.push({
              canvas: assumptionsCanvas,
              sectionTitle: 'Cost Analysis & Budget Optimization'
            });
          }
        }

        const allocationSection = document.getElementById('panel6AllocationBreakdownSection');
        const budgetBreakdown = document.getElementById('detailedBudgetBreakdown');
        if (allocationSection) {
          const hideTargets = [];
          if (budgetBreakdown && allocationSection.contains(budgetBreakdown)) {
            hideTargets.push(budgetBreakdown);
          }

          const allocationCanvas = await this.withForcedOverflowVisible(allocationSection, () =>
            this.captureWithHiddenElements(allocationSection, hideTargets, { expandScrollable: true }),
            { expandScrollable: true }
          );

          if (allocationCanvas) {
            sections.push({
              canvas: allocationCanvas,
              sectionTitle: 'Budget Optimization Analysis'
            });
          }
        }

        if (budgetBreakdown) {
          const breakdownCanvas = await this.withForcedOverflowVisible(budgetBreakdown, () =>
            this.captureElement(budgetBreakdown),
            { expandScrollable: true }
          );
          if (breakdownCanvas) {
            sections.push({
              canvas: breakdownCanvas,
              sectionTitle: 'Detailed Budget Breakdown'
            });
          }
        }

        const riskSection = document.getElementById('panel6RiskReductionSection');
        if (riskSection) {
          const riskCanvas = await this.captureElement(riskSection);
          if (riskCanvas) {
            sections.push({
              canvas: riskCanvas,
              sectionTitle: 'Risk Reduction Analysis'
            });
          }
        }

        if (sections.length > 0) {
          return sections;
        }

        const fallbackCanvas = await this.captureElement(panelContent);
        return fallbackCanvas ? [{ canvas: fallbackCanvas }] : [];
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

  createCoverPage(pdf, appInstance, generatedAt, { panelCount = 5 } = {}) {
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
    const panelLabel = panelCount === 1 ? 'panel' : 'panels';
    pdf.text(`Insights calculated using the assumptions provided by you across ${panelCount} analytical ${panelLabel}.`, margin, pageHeight - 30);

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

 async generateReport(appInstance, options = {}) {
    const modal = this.createLoadingModal();

    try {
      this.updateProgress('Loading PDF libraries...');
      await this.loadRequiredLibraries();

      const jsPDFConstructor = this.ensureJsPDFAvailable();
      if (!jsPDFConstructor) {
        throw new Error('jsPDF is not available');
      }

      const includePanel6 = Boolean(options.includePanel6);
      const panel6Enabled = typeof window !== 'undefined' ? Boolean(window.hrddApp?.ENABLE_PANEL_6) : false;
      const shouldIncludePanel6 = includePanel6 && panel6Enabled;

      const pdf = new jsPDFConstructor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const now = new Date();
      const panelTitles = {
        1: 'Global Risks',
        2: 'Baseline Risk',
        3: 'Tools Strategy',
        4: 'Response Approach',
        5: 'Managed Risk'
      };

      if (shouldIncludePanel6) {
        panelTitles[6] = 'Budget Optimization';
      }

      this.updateProgress('Designing cover page...');
      const panelCount = shouldIncludePanel6 ? 6 : 5;
      this.createCoverPage(pdf, appInstance, now, { panelCount });

      // Generate each panel
      let currentPageNumber = 2;
      const maxPanel = shouldIncludePanel6 ? 6 : 5;
      for (let panelNumber = 1; panelNumber <= maxPanel; panelNumber++) {
        this.updateProgress(`Capturing Panel ${panelNumber}: ${panelTitles[panelNumber]}...`);

        const panelSections = await this.generatePanelContent(appInstance, panelNumber, options);

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
      const filename = `Labour_Rights_Tools_Assessment_Report_${timestamp}.pdf`;

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