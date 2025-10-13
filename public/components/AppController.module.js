// AppController.module.js – Enhanced with SAQ Coverage Constraint
// Implements Codex's recommendations: class-based controller, state store,
// debounced updates, clear separation of data/service/UI concerns.

// CONFIGURATION: Set to true to enable Panel 6 (Cost Analysis), false to disable
const ENABLE_PANEL_6 = true; // Change this to false to disable Panel 6

import { dataService } from './DataService.js';
import { riskEngine } from './RiskEngine.js';
import { UIComponents } from './UIComponents.js';
import { pdfGenerator } from './PDFGenerator.js';

const PANEL_DESCRIPTIONS = {
  1: 'Decide for yourself. Calculate a global picture of labour rights risks using publicly-available indices from reputable organisations. Use sliders (below the map) to change weightings. Then go to panel 2.',
  2: 'Click on the map to select the countries in your supply chain or pick from the list below (not all countries are in the map). You can optionally weighting different countries (eg: by number of suppliers or workers, value of sourcing etc..). Then go to panel 3.',
  3: 'Set out your supply chain due diligence progam across six different industry tools and the effectiveness of each. Set the extent to which your efforts are focussed on higher risk countries. Then go to panel 4.',
  4: 'Calibrate the effectiveness of your tools, once issues are detected, in delivering sustained remedy and promoting good supplier conduct. Use both columns to reflect your experience of each tool. Then go to panel 5.',
  5: `Here are your results showing your baseline risk level (panel 2) and how well you are managing it. You can see how each element in your strategy impacts your risks. You can print out a report capturing the analysis in full.${ENABLE_PANEL_6 ? ' Then go to panel 6.' : ''}`,
  ...(ENABLE_PANEL_6 ? {
    6: 'Analyze the costs of your external tools and internal efforts. See how your current budget allocation compares to an optimized approach that maximizes managed-risk reduction per dollar spent.'
  } : {})
};

function renderPanelDescription(panelNumber) {
  const description = PANEL_DESCRIPTIONS[panelNumber];
  if (!description) return '';
  return `
    <div style="padding:14px 18px;background:rgba(255,255,255,0.9);border:1px solid rgba(226,232,240,0.9);border-radius:12px;box-shadow:0 6px 16px rgba(15,23,42,0.06);">
      <p style="font-size:15px;color:#4b5563;margin:0;line-height:1.5;">${description}</p>
    </div>
  `;
}

export class AppController {
  constructor() {
    // App state (single source of truth)
    this.state = {
      // Data
      countries: [],
      weights: Array.isArray(riskEngine?.defaultWeights)
        ? [...riskEngine.defaultWeights]
        : [20, 20, 20, 20, 20],

       // Panel 6 cost analysis state (only if enabled)
      ...(ENABLE_PANEL_6
        ? {
            supplierCount: 500, // Default number of suppliers
            hourlyRate: 40, // Default cost per man hour in USD

            // Panel 3 Tools - Three cost components each
            toolAnnualProgrammeCosts: [12000, 0, 0, 40000, 0, 0], // Annual programme cost for all suppliers
            toolPerSupplierCosts: [120, 0, 1000, 0, 0, 0], // Additional per supplier annual cost
            toolInternalHours: [6, 20, 20, 6, 2, 1], // Internal work hours per supplier per year

            // Panel 4 Remedy utilisation - Internal hours per tool
            toolRemedyInternalHours: [0, 10, 10, 6, 2, 2], // Internal work hours per supplier per year to apply each tool's findings

            saqConstraintEnabled: true, // Default: enforce SAQ coverage unless user opts out
            socialAuditConstraintEnabled: true, // Default: keep current audit coverage capped at 100%
            socialAuditCostReduction: 50, // Percentage reduction applied when audit constraint enabled
            shouldAutoRunOptimization: false,
            lastOptimizationResult: null
          }
        : {}),

      // Selection + volumes
      selectedCountries: [],
      countryVolumes: {},            // { ISO: number }
      countryRisks: {},              // { ISO: number }
      countryManagedRisks: {},       // { ISO: number }

      // Scalars
      baselineRisk: 0,
      managedRisk: 0,
      riskConcentration: 1,
      focus: typeof riskEngine.defaultFocus === 'number' ? riskEngine.defaultFocus : 0.6,

      // Strategy (coverage %) and effectiveness (%)
      hrddStrategy: riskEngine.defaultHRDDStrategy || [0, 10, 5, 65, 100, 0],
      transparencyEffectiveness: this.normalizeTransparencyEffectiveness(
        riskEngine.defaultTransparencyEffectiveness || [80, 40, 30, 20, 10, 5]
      ),
      responsivenessStrategy: riskEngine.defaultResponsivenessStrategy || [80, 50, 30, 15, 5, 5],
      responsivenessEffectiveness: this.normalizeResponsivenessEffectiveness(
        riskEngine.defaultResponsivenessEffectiveness || [80, 35, 10, 10, 2, 2]
      ),

      // Focus analytics (optional, shown when available)
      focusEffectivenessMetrics: null,

      // UI
      currentPanel: 1,      // 1..5
      loading: true,
      error: null,
      apiHealthy: false,
      lastUpdate: null,
      isDirty: false,
      isGeneratingReport: false
    };

    // Debounce timers
    this.weightsTimeout = null;
    this.volumeTimeout = null;
    this.strategyTimeout = null;
    this.transparencyTimeout = null;
    this.responsivenessTimeout = null;
    this.responsivenessEffectivenessTimeout = null;
    this.focusTimeout = null;

    // Retry policy for init
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 2000;

    // Bind handlers (so they can be passed around safely)
    this.initialize = this.initialize.bind(this);
    this.render = this.render.bind(this);
    this.renderCurrentPanel = this.renderCurrentPanel.bind(this);
    this.setCurrentPanel = this.setCurrentPanel.bind(this);

    this.onWeightsChange = this.onWeightsChange.bind(this);
    this.onCountrySelect = this.onCountrySelect.bind(this);
    this.onVolumeChange = this.onVolumeChange.bind(this);
    this.onHRDDStrategyChange = this.onHRDDStrategyChange.bind(this);
    this.onTransparencyChange = this.onTransparencyChange.bind(this);
    this.onResponsivenessChange = this.onResponsivenessChange.bind(this);
    this.onResponsivenessEffectivenessChange = this.onResponsivenessEffectivenessChange.bind(this);
    this.onFocusChange = this.onFocusChange.bind(this);

    this.calculateAllRisks = this.calculateAllRisks.bind(this);
    this.calculateBaselineRisk = this.calculateBaselineRisk.bind(this);
    this.calculateManagedRisk = this.calculateManagedRisk.bind(this);

    this.generatePDFReport = this.generatePDFReport.bind(this);
    this.exportConfiguration = this.exportConfiguration.bind(this);
    this.saveState = this.saveState.bind(this);
    this.restoreState = this.restoreState.bind(this);
    this.loadSavedState = this.loadSavedState.bind(this);
    this.loadDemoData = this.loadDemoData.bind(this);
    this.getState = this.getState.bind(this);
    this.setState = this.setState.bind(this);
    this.setCurrentStep = this.setCurrentStep.bind(this);
    this.resetApplicationState = this.resetApplicationState.bind(this);
    this.addCountry = this.addCountry.bind(this);
    this.removeCountry = this.removeCountry.bind(this);
    this.destroy = this.destroy.bind(this);
    this.handleWheelScroll = this.handleWheelScroll.bind(this);

    // Panel 6 handlers (only if enabled)
     if (ENABLE_PANEL_6) {
      this.onSupplierCountChange = this.onSupplierCountChange.bind(this);
      this.onHourlyRateChange = this.onHourlyRateChange.bind(this);
      this.onToolAnnualProgrammeCostChange = this.onToolAnnualProgrammeCostChange.bind(this);
      this.onToolPerSupplierCostChange = this.onToolPerSupplierCostChange.bind(this);
      this.onToolInternalHoursChange = this.onToolInternalHoursChange.bind(this);
      this.onToolRemedyInternalHoursChange = this.onToolRemedyInternalHoursChange.bind(this);
      this.onSAQConstraintChange = this.onSAQConstraintChange.bind(this);
      this.onSocialAuditConstraintChange = this.onSocialAuditConstraintChange.bind(this);
      this.onSocialAuditCostReductionChange = this.onSocialAuditCostReductionChange.bind(this);
    }

    this.optimizeBudgetAllocation = this.optimizeBudgetAllocation.bind(this);

    // Container
    this.containerElement = null;
    this.mainScrollElement = null;
    this._wheelListenerAttached = false;
    this._wheelListenerTarget = null;
    this._touchScrollHandlers = null;

    // Expose for onclick handlers in rendered HTML (panel nav etc.)
    if (typeof window !== 'undefined') {
      window.hrddApp = this;
      window.hrddApp.ENABLE_PANEL_6 = ENABLE_PANEL_6;
    }
  }

  /* --------------------------- Normalizers --------------------------- */

  normalizeTransparencyEffectiveness(arr) {
    if (!Array.isArray(arr)) {
      return [90, 45, 25, 15, 12, 5];
    }

    return arr.map(value => {
      const parsed = parseFloat(value);
      if (!Number.isFinite(parsed)) return 0;

      const scaled = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
      return Math.max(0, Math.min(100, scaled));
    });
  }

  normalizeResponsivenessEffectiveness(arr) {
    const defaultValues = Array.isArray(riskEngine?.defaultResponsivenessEffectiveness)
      ? [...riskEngine.defaultResponsivenessEffectiveness]
      : [70, 85, 35, 25, 15, 5];

    const expectedLength = Array.isArray(riskEngine?.responsivenessLabels)
      ? riskEngine.responsivenessLabels.length
      : defaultValues.length;

    const sanitized = new Array(expectedLength);

    for (let i = 0; i < expectedLength; i += 1) {
      const fallback = Number.isFinite(defaultValues[i]) ? defaultValues[i] : 0;

      if (!Array.isArray(arr)) {
        sanitized[i] = Math.max(0, Math.min(100, fallback));
        continue;
      }

      const parsed = parseFloat(arr[i]);
      if (!Number.isFinite(parsed)) {
        sanitized[i] = Math.max(0, Math.min(100, fallback));
        continue;
      }

      const scaled = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
      sanitized[i] = Math.max(0, Math.min(100, scaled));
    }

    return sanitized;
  }
  
  clamp01(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  /* ------------------------- Error Handling ------------------------- */

  safeCalculation(calculationFn, errorMessage = 'Calculation failed') {
    try {
      calculationFn();
    } catch (error) {
      console.error(errorMessage, error);
      this.state.error = `${errorMessage}: ${error.message}`;
      // Don't let one calculation failure break the whole app
      if (this.containerElement) {
        this.render();
      }
    }
  }

  /* ----------------------------- Init ------------------------------- */

  async initialize(containerId) {
    if (typeof window !== 'undefined') {
      const frameElement = window.frameElement;
      if (frameElement) {
        frameElement.scrolling = 'no';
        frameElement.style.overflow = 'hidden';
      }

      if (window.parent && window.parent !== window && typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      }
    }

    try {
      this.containerElement = document.getElementById(containerId);
      if (!this.containerElement) {
        throw new Error('Container not found: ' + containerId);
      }

      this.state.loading = true;
      this.state.error = null;
      this.render();

      // Load countries from API / cache
      const countries = await dataService.getCountries();
      this.state.apiHealthy = true;
      this.state.countries = Array.isArray(countries) ? countries : [];

      // Restore any prior state (if present)
       const stateRestored = this.loadSavedState();

        // Compute initial risks
        this.calculateAllRisks();

        // Always recalculate baseline and managed risk after loading
        this.calculateBaselineRisk();
        this.calculateManagedRisk();

      this.state.loading = false;
      this.state.lastUpdate = new Date().toISOString();
      this.render();
    } catch (err) {
      console.error('Initialize failed:', err);
      this.state.loading = false;
      this.state.error = 'Failed to initialize: ' + (err?.message || 'Unknown error');
      this.state.apiHealthy = false;

      if (this.retryCount < this.maxRetries) {
        this.retryCount += 1;
        setTimeout(() => this.initialize(containerId), this.retryDelay);
      } else {
        this.render();
       }
    }
  }

  /* --------------------------- Calculations ------------------------- */

  validateCountryData(country) {
    return country && country.isoCode && typeof country === 'object';
  }

  calculateAllRisks() {
    try {
      const newCountryRisks = {};
      let calculated = 0;

      this.state.countries.forEach(country => {
        if (this.validateCountryData(country)) {
          newCountryRisks[country.isoCode] = riskEngine.calculateWeightedRisk(country, this.state.weights);
          calculated += 1;
        }
      });

      this.state.countryRisks = newCountryRisks;
      // console.log(`Calculated risks for ${calculated} countries`);
    } catch (e) {
      console.error('calculateAllRisks error:', e);
      this.state.error = 'Failed to calculate country risks';
    }
  }

  calculateBaselineRisk() {
    const { selectedCountries, countries, countryRisks, countryVolumes } = this.state;
    const summary = riskEngine.generateBaselineSummary(selectedCountries, countries, countryRisks, countryVolumes);
    this.state.baselineRisk = Number.isFinite(summary?.baselineRisk) ? summary.baselineRisk : 0;
  }

  calculateManagedRisk() {
    const {
      baselineRisk,
      selectedCountries,
      hrddStrategy,
      transparencyEffectiveness,
      responsivenessStrategy,
      responsivenessEffectiveness,
      focus,
      riskConcentration,
      countryVolumes,
      countryRisks
    } = this.state;

    const summary = riskEngine.generateRiskSummary(
      baselineRisk,
      null, // managedRisk (engine returns this)
      selectedCountries,
      hrddStrategy,
      transparencyEffectiveness,
      responsivenessStrategy,
      responsivenessEffectiveness,
      this.clamp01(focus),
      riskConcentration,
      countryVolumes,
      countryRisks
    ) || {};

    const managed = Number.isFinite(summary?.managed?.score) ? summary.managed.score : 0;
    this.state.managedRisk = managed;
    this.state.focusEffectivenessMetrics = summary?.focusEffectiveness || null;
    this.state.countryManagedRisks = summary?.countryManagedRisks || {};
  }

  /* ----------------------------- Handlers --------------------------- */

  onWeightsChange(newWeights) {
    if (!Array.isArray(newWeights)) return;
    clearTimeout(this.weightsTimeout);
    this.state.weights = [...newWeights];
    this.state.isDirty = true;

    this.weightsTimeout = setTimeout(() => {
  this.safeCalculation(() => {
    this.calculateAllRisks();
    this.calculateBaselineRisk();
    this.calculateManagedRisk();
  }, 'Risk calculation after weight change failed');
  this.state.lastUpdate = new Date().toISOString();
  this.updateUI();
}, 300);
  }

onCountrySelect(nextSelected) {
  let updatedSelection;

  if (Array.isArray(nextSelected)) {
    updatedSelection = nextSelected
      .map(code => (typeof code === 'string' ? code.trim().toUpperCase() : ''))
      .filter(Boolean);
  } else if (typeof nextSelected === 'string') {
    const trimmed = nextSelected.trim().toUpperCase();
    if (!trimmed) return;
    const selectionSet = new Set(
      Array.isArray(this.state.selectedCountries)
        ? this.state.selectedCountries.map(code => (typeof code === 'string' ? code.trim().toUpperCase() : code))
        : []
    );
    if (selectionSet.has(trimmed)) {
      selectionSet.delete(trimmed);
    } else {
      selectionSet.add(trimmed);
    }
    updatedSelection = Array.from(selectionSet);
  } else {
    updatedSelection = [];
  }

  // **FIX: Clean up orphaned data for deselected countries**
  const updatedSet = new Set(updatedSelection);
  const previousSet = new Set(this.state.selectedCountries || []);
  
  // Find countries that were deselected
  const deselected = [...previousSet].filter(code => !updatedSet.has(code));
  
  // Remove volumes for deselected countries
  if (deselected.length > 0) {
    const cleanedVolumes = { ...this.state.countryVolumes };
    const cleanedManagedRisks = { ...this.state.countryManagedRisks };
    
    deselected.forEach(code => {
      delete cleanedVolumes[code];
      delete cleanedManagedRisks[code];
    });
    
    this.state.countryVolumes = cleanedVolumes;
    this.state.countryManagedRisks = cleanedManagedRisks;
  }

  // Update selection
  this.state.selectedCountries = updatedSelection;
  this.state.isDirty = true;

  // **FIX: Force recalculation of all risks**
  this.calculateAllRisks();
  this.calculateBaselineRisk();
  this.calculateManagedRisk();
  
  this.state.lastUpdate = new Date().toISOString();
  
  // **FIX: Full re-render instead of just updateUI**
  this.render();
}
  

 onVolumeChange(isoCode, volume) {
  clearTimeout(this.volumeTimeout);
  const normalized = typeof isoCode === 'string' ? isoCode.trim().toUpperCase() : isoCode;
  const v = Math.max(0, parseFloat(volume) || 0);
  
  // **FIX: Only update volume if country is selected**
  if (!this.state.selectedCountries.includes(normalized)) {
    console.warn(`Attempted to set volume for unselected country: ${normalized}`);
    return;
  }
  
  this.state.countryVolumes = { ...this.state.countryVolumes, [normalized]: v };
  this.state.isDirty = true;

this.volumeTimeout = setTimeout(() => {
  this.safeCalculation(() => {
    this.calculateBaselineRisk();
    this.calculateManagedRisk();
  }, 'Risk calculation after volume change failed');
  this.state.lastUpdate = new Date().toISOString();
  this.updateUI();
}, 300);
}

    onHRDDStrategyChange(next) {
  if (!Array.isArray(next)) return;
  clearTimeout(this.strategyTimeout);

  let updatedStrategy = [...next];
  
  // Enforce SAQ constraint if enabled
  if (ENABLE_PANEL_6 && this.state.saqConstraintEnabled) {
    const saqSum = updatedStrategy[4] + updatedStrategy[5];
    if (Math.abs(saqSum - 100) > 0.1) {
      // Proportionally adjust to maintain 100% total
      if (saqSum > 0) {
        const ratio = 100 / saqSum;
        updatedStrategy[4] = updatedStrategy[4] * ratio;
        updatedStrategy[5] = updatedStrategy[5] * ratio;
      } else {
        // Default split if both are zero
        updatedStrategy[4] = 50;
        updatedStrategy[5] = 50;
      }
    }
  }
  
  this.state.hrddStrategy = updatedStrategy;
  this.state.isDirty = true;

  this.strategyTimeout = setTimeout(() => {
    this.calculateManagedRisk();
    this.state.lastUpdate = new Date().toISOString();
    this.updateUI();
  }, 300);
}

  onTransparencyChange(next) {
    if (!Array.isArray(next)) return;
    clearTimeout(this.transparencyTimeout);
    this.state.transparencyEffectiveness = this.normalizeTransparencyEffectiveness(next);
    this.state.isDirty = true;

    this.transparencyTimeout = setTimeout(() => {
      this.calculateManagedRisk();
      this.state.lastUpdate = new Date().toISOString();
      this.updateUI();
    }, 300);
  }

  onResponsivenessChange(next) {
    if (!Array.isArray(next)) return;
    clearTimeout(this.responsivenessTimeout);

    const updatedResponsiveness = [...next];
    this.state.responsivenessStrategy = updatedResponsiveness;

    this.state.isDirty = true;

    this.responsivenessTimeout = setTimeout(() => {
      this.calculateManagedRisk();
      this.state.lastUpdate = new Date().toISOString();
      this.updateUI();
    }, 300);
  }

  onResponsivenessEffectivenessChange(next) {
    if (!Array.isArray(next)) return;
    clearTimeout(this.responsivenessEffectivenessTimeout);
    this.state.responsivenessEffectiveness = this.normalizeResponsivenessEffectiveness(next);
    this.state.isDirty = true;

    this.responsivenessEffectivenessTimeout = setTimeout(() => {
      this.calculateManagedRisk();
      this.state.lastUpdate = new Date().toISOString();
      this.updateUI();
    }, 300);
  }

onFocusChange(next) {
    clearTimeout(this.focusTimeout);
    this.state.focus = this.clamp01(next);
    this.state.isDirty = true;

    this.focusTimeout = setTimeout(() => {
      this.calculateManagedRisk();
      this.state.lastUpdate = new Date().toISOString();
      this.updateUI();
    }, 200);
  }

   onSupplierCountChange(count) {
    if (!ENABLE_PANEL_6) return;
    this.state.supplierCount = Math.max(1, Math.floor(parseFloat(count) || 1));
    this.state.isDirty = true;
    this.state.lastOptimizationResult = null;
    this.updateUI();
  }

  onHourlyRateChange(rate) {
    if (!ENABLE_PANEL_6) return;
    this.state.hourlyRate = Math.max(0, parseFloat(rate) || 0);
    this.state.isDirty = true;
    this.state.lastOptimizationResult = null;
    this.updateUI();
  }

  onToolAnnualProgrammeCostChange(toolIndex, cost) {
  if (!ENABLE_PANEL_6) return;
  if (toolIndex >= 0 && toolIndex < this.state.toolAnnualProgrammeCosts.length) {
    this.state.toolAnnualProgrammeCosts[toolIndex] = Math.max(0, parseFloat(cost) || 0);
    this.state.isDirty = true;
    this.state.lastOptimizationResult = null;
    this.updateUI();
  }
}

onToolPerSupplierCostChange(toolIndex, cost) {
  if (!ENABLE_PANEL_6) return;
  if (toolIndex >= 0 && toolIndex < this.state.toolPerSupplierCosts.length) {
    this.state.toolPerSupplierCosts[toolIndex] = Math.max(0, parseFloat(cost) || 0);
    this.state.isDirty = true;
    this.state.lastOptimizationResult = null;
    this.updateUI();
  }
}

onToolInternalHoursChange(toolIndex, hours) {
  if (!ENABLE_PANEL_6) return;
  if (toolIndex >= 0 && toolIndex < this.state.toolInternalHours.length) {
    this.state.toolInternalHours[toolIndex] = Math.max(0, parseFloat(hours) || 0);
    this.state.isDirty = true;
    this.state.lastOptimizationResult = null;
    this.updateUI();
  }
}

onToolRemedyInternalHoursChange(toolIndex, hours) {
  if (!ENABLE_PANEL_6) return;
  if (toolIndex >= 0 && toolIndex < this.state.toolRemedyInternalHours.length) {
    this.state.toolRemedyInternalHours[toolIndex] = Math.max(0, parseFloat(hours) || 0);
    this.state.isDirty = true;
    this.state.lastOptimizationResult = null;
    this.updateUI();
  }
}

// NEW: SAQ Constraint handler
onSAQConstraintChange(enabled) {
  if (!ENABLE_PANEL_6) return;
  this.state.saqConstraintEnabled = Boolean(enabled);
  this.state.isDirty = true;
  this.state.lastOptimizationResult = null;
  this.updateUI();
}

// NEW: Social audit constraint handler
onSocialAuditConstraintChange(enabled) {
  if (!ENABLE_PANEL_6) return;
  this.state.socialAuditConstraintEnabled = Boolean(enabled);
  this.state.isDirty = true;
  this.state.lastOptimizationResult = null;
  this.updateUI();
}

// NEW: Social audit cost reduction handler
onSocialAuditCostReductionChange(percentage) {
  if (!ENABLE_PANEL_6) return;
  const parsed = parseFloat(percentage);
  const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  this.state.socialAuditCostReduction = clamped;
  this.state.isDirty = true;
  this.state.lastOptimizationResult = null;
  this.state.shouldAutoRunOptimization = false;
  this.updateUI();
}

 optimizeBudgetAllocation() {
  if (!ENABLE_PANEL_6) return null;

  const result = riskEngine.optimizeBudgetAllocation(
    this.state.supplierCount,
    this.state.hourlyRate,
    this.state.toolAnnualProgrammeCosts,
    this.state.toolPerSupplierCosts,
    this.state.toolInternalHours,
    this.state.toolRemedyInternalHours,
    this.state.hrddStrategy,
    this.state.transparencyEffectiveness,
    this.state.responsivenessStrategy,
    this.state.responsivenessEffectiveness,
    this.state.selectedCountries,
    this.state.countryVolumes,
    this.state.countryRisks,
    this.state.focus,
    this.state.saqConstraintEnabled,
    this.state.socialAuditConstraintEnabled,
    this.state.socialAuditCostReduction
    );

    this.state.lastOptimizationResult = result || null;
    this.state.shouldAutoRunOptimization = false;
    return result;
  }

  /* ------------------------------- UI -------------------------------- */

  setCurrentPanel(panel) {
    const maxPanel = ENABLE_PANEL_6 ? 6 : 5;
    if (panel >= 1 && panel <= maxPanel) {
      this.state.currentPanel = panel;
      if (ENABLE_PANEL_6) {
        this.state.shouldAutoRunOptimization = panel === 6;
      }
      this.render();
    }
  }

  updateUI() {
    // Fast re-render for panels that depend on managed/baseline numbers
    if (!this.containerElement) return;

    const apiIndicator = this.containerElement.querySelector('#hrddApiIndicator');
    if (apiIndicator) {
      apiIndicator.style.backgroundColor = this.state.apiHealthy ? '#22c55e' : '#ef4444';
    }

    const apiStatus = this.containerElement.querySelector('#hrddApiStatus');
    if (apiStatus) {
      apiStatus.textContent = `API ${this.state.apiHealthy ? 'Connected' : 'Disconnected'}`;
    }

    const countryCountEl = this.containerElement.querySelector('#hrddCountryCount');
    if (countryCountEl) {
      countryCountEl.textContent = this.state.countries.length;
    }

    const selectedCountEl = this.containerElement.querySelector('#hrddSelectedCount');
    if (selectedCountEl) {
      selectedCountEl.textContent = this.state.selectedCountries.length;
    }

    const lastUpdatedGroup = this.containerElement.querySelector('#hrddLastUpdatedGroup');
    const lastUpdatedEl = this.containerElement.querySelector('#hrddLastUpdated');
    if (lastUpdatedGroup && lastUpdatedEl) {
      if (this.state.lastUpdate) {
        let formatted = '';
        try {
          formatted = new Date(this.state.lastUpdate).toLocaleTimeString();
        } catch (error) {
          formatted = '';
        }
        lastUpdatedGroup.style.display = 'flex';
        lastUpdatedEl.textContent = formatted ? `Best on larger screens. Updated: ${formatted}` : '';
      } else {
        lastUpdatedGroup.style.display = 'none';
        lastUpdatedEl.textContent = '';
      }
    }

    const panelContent = this.containerElement.querySelector('#panelContent');

    let restoreFocus = null;

    const scrollContainer = this.mainScrollElement
      || (panelContent && panelContent.parentElement)
      || null;
    const previousScrollTop = scrollContainer && Number.isFinite(scrollContainer.scrollTop)
      ? scrollContainer.scrollTop
      : null;

   if (panelContent && typeof document !== 'undefined') {
      const activeElement = document.activeElement || null;
      if (activeElement && panelContent.contains(activeElement)) {
        const activeId = activeElement.id || null;
        const selectionStart = typeof activeElement.selectionStart === 'number'
          ? activeElement.selectionStart
          : null;
        const selectionEnd = typeof activeElement.selectionEnd === 'number'
          ? activeElement.selectionEnd
          : null;
        const activeValue = typeof activeElement.value === 'string'
          ? activeElement.value
          : null;
        const activeTag = activeElement.tagName ? activeElement.tagName.toLowerCase() : '';
        const activeType = activeTag === 'input'
          ? (activeElement.getAttribute('type') || '').toLowerCase()
          : null;

        const applySelection = (element) => {
          if (!element) return;

          const valueForSelection = activeValue ?? (typeof element.value === 'string' ? element.value : '');
          const hasSelectionApi = typeof element.setSelectionRange === 'function';
          const maxPosition = typeof valueForSelection === 'string' ? valueForSelection.length : 0;
          const fallbackPosition = selectionEnd !== null ? selectionEnd : maxPosition;
          const normalizedStart = selectionStart !== null
            ? Math.max(0, Math.min(selectionStart, maxPosition))
            : Math.max(0, Math.min(fallbackPosition, maxPosition));
          const normalizedEnd = selectionEnd !== null
            ? Math.max(0, Math.min(selectionEnd, maxPosition))
            : normalizedStart;

          if (typeof element.value === 'string' && activeValue !== null && element.value !== activeValue) {
            element.value = activeValue;
          }

          if (hasSelectionApi) {
            try {
              element.setSelectionRange(normalizedStart, normalizedEnd);
              return true;
            } catch (error) {
              // Continue to fallback handling when selection APIs are unsupported (e.g., number inputs)
            }
          }

          if (typeof element.value === 'string') {
            const currentValue = element.value;
            element.value = '';
            element.value = currentValue;
          }

          return false;
        };

        restoreFocus = () => {
          if (!activeId) return;
          const nextActive = document.getElementById(activeId);
          if (!nextActive || typeof nextActive.focus !== 'function') {
            return;
          }

          try {
            nextActive.focus({ preventScroll: true });
          } catch (error) {
            nextActive.focus();
          }

          const tryApplySelection = () => {
            const applied = applySelection(nextActive);

            if (!applied && activeType === 'number') {
              const value = typeof nextActive.value === 'string' ? nextActive.value : '';
              const caret = selectionEnd !== null ? selectionEnd : value.length;
              if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(() => {
                  if (typeof nextActive.setSelectionRange === 'function') {
                    try {
                      nextActive.setSelectionRange(caret, caret);
                    } catch (error) {
                      const current = typeof nextActive.value === 'string' ? nextActive.value : '';
                      nextActive.value = '';
                      nextActive.value = current;
                    }
                  } else if (typeof nextActive.value === 'string') {
                    const current = nextActive.value;
                    nextActive.value = '';
                    nextActive.value = current;
                  }
                });
              }
            }
          };

          tryApplySelection();

          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
              if (document.activeElement === nextActive) {
                tryApplySelection();
              }
            });
          }
        };
      }
    }

    if (panelContent) {
      panelContent.innerHTML = this.renderCurrentPanel();
    }

    const restoreView = () => {
      if (scrollContainer && Number.isFinite(previousScrollTop)) {
        scrollContainer.scrollTop = previousScrollTop;
      }
      if (typeof restoreFocus === 'function') {
        restoreFocus();
      }
    };

    if (typeof window !== 'undefined') {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreView);
      } else {
        setTimeout(restoreView, 0);
      }
    } else {
      restoreView();
    }
   }
updatePanel2Components() {
  // Only update if we're on Panel 2 and container exists
  if (this.state.currentPanel !== 2 || !this.containerElement) {
    this.updateUI();
    return;
  }

  // Update the map title with new baseline/managed values
  const baselineRiskValue = Number.isFinite(this.state.baselineRisk)
    ? this.state.baselineRisk.toFixed(1)
    : 'N/A';
  const managedRiskValue = Number.isFinite(this.state.managedRisk)
    ? this.state.managedRisk.toFixed(1)
    : 'N/A';

  // Re-render specific components without full page render
  queueMicrotask(() => {
    const baselineMapTitle = `Click on countries to select them: current baseline risk = ${baselineRiskValue}`;
    const baselineMapSubtitle = `Based on the assumptions, current managed risk = ${managedRiskValue}`;

    // Update map
    UIComponents.createWorldMap('baselineMapContainer', {
      countries: this.state.countries,
      countryRisks: this.state.countryRisks,
      selectedCountries: this.state.selectedCountries,
      onCountrySelect: this.onCountrySelect,
      title: baselineMapTitle,
      subtitle: baselineMapSubtitle,
      height: 500,
      width: 1200
    });

    // Update country selection display
    UIComponents.updateSelectedCountriesDisplay(
      this.state.selectedCountries,
      this.state.countries,
      this.state.countryVolumes,
      this.onCountrySelect,
      this.onVolumeChange
    );

    // Update results panel
    UIComponents.createResultsPanel('resultsPanel', {
      selectedCountries: this.state.selectedCountries,
      countries: this.state.countries,
      countryRisks: this.state.countryRisks,
      baselineRisk: this.state.baselineRisk
    });
  });

  // Update header stats
  const apiIndicator = this.containerElement.querySelector('#hrddApiIndicator');
  if (apiIndicator) {
    apiIndicator.style.backgroundColor = this.state.apiHealthy ? '#22c55e' : '#ef4444';
  }

  const selectedCountEl = this.containerElement.querySelector('#hrddSelectedCount');
  if (selectedCountEl) {
    selectedCountEl.textContent = this.state.selectedCountries.length;
  }

  const lastUpdatedGroup = this.containerElement.querySelector('#hrddLastUpdatedGroup');
  const lastUpdatedEl = this.containerElement.querySelector('#hrddLastUpdated');
  if (lastUpdatedGroup && lastUpdatedEl && this.state.lastUpdate) {
    let formatted = '';
    try {
      formatted = new Date(this.state.lastUpdate).toLocaleTimeString();
    } catch (error) {
      formatted = '';
    }
    lastUpdatedGroup.style.display = 'flex';
    lastUpdatedEl.textContent = formatted ? `Best on larger screens. Updated: ${formatted}` : '';
  }
}

  handleWheelScroll(event) {
    const main = this.mainScrollElement || (event && event.currentTarget) || null;
    if (!this.mainScrollElement && main) {
      this.mainScrollElement = main;
    }
    if (!main || main.scrollHeight <= main.clientHeight) {
      return;
    }

    if (event?.ctrlKey) {
      return;
    }

    let allowDefault = false;
    if (event?.target && typeof event.target.closest === 'function') {
      const interactive = event.target.closest('input, select, textarea, [contenteditable="true"]');
      if (interactive) {
        const tagName = interactive.tagName ? interactive.tagName.toLowerCase() : '';
        if (tagName === 'input') {
          const inputType = (interactive.getAttribute('type') || '').toLowerCase();
          if (inputType !== 'range' && inputType !== 'number') {
            allowDefault = true;
          }
        } else if (tagName === 'textarea') {
          allowDefault = true;
        } else {
          allowDefault = true;
        }
      }
    }

    if (allowDefault) {
      return;
    }

    let deltaY = Number.isFinite(event?.deltaY) ? event.deltaY : 0;
    if (event?.deltaMode === 1) {
      deltaY *= 16;
    } else if (event?.deltaMode === 2) {
      deltaY *= main.clientHeight;
    }

    if (!deltaY) {
      return;
    }

    const atTop = main.scrollTop <= 0;
    const atBottom = Math.ceil(main.scrollTop + main.clientHeight) >= main.scrollHeight;

   if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
      return;
    }

    if (typeof event?.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event?.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (typeof main.scrollBy === 'function') {
      main.scrollBy({
        top: deltaY,
        behavior: 'auto'
      });
    } else {
      main.scrollTop += deltaY;
       }
  }

  addMobileGestures() {
    const element = this.mainScrollElement;

    if (!element) {
      this.removeMobileGestures();
      return;
    }

    if (this._touchScrollHandlers?.element === element) {
      return;
    }

    this.removeMobileGestures();

    const state = {
      active: false,
      startY: 0,
      startX: 0,
      startScrollTop: 0,
      allowMapPan: false,
      isScrolling: false
    };

    const isInteractiveTarget = (target) => {
      if (!target || typeof target.closest !== 'function') {
        return false;
      }
      return Boolean(target.closest('input, select, textarea, button, a[href], [role="button"], [contenteditable="true"], .zoom-controls'));
    };

    const resetState = () => {
      state.active = false;
      state.isScrolling = false;
      state.allowMapPan = false;
    };

    const handleTouchStart = (event) => {
      if (!event?.touches || event.touches.length !== 1) {
        resetState();
        return;
      }

      const target = event.target || null;
      if (isInteractiveTarget(target)) {
        resetState();
        return;
      }

      const touch = event.touches[0];
      state.active = true;
      state.isScrolling = false;
      state.allowMapPan = Boolean(target && typeof target.closest === 'function' && target.closest('svg, canvas'));
      state.startY = touch.clientY;
      state.startX = touch.clientX;
      state.startScrollTop = element.scrollTop;
    };

    const handleTouchMove = (event) => {
      if (!state.active || !event?.touches || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const deltaY = state.startY - touch.clientY;
      const deltaX = state.startX - touch.clientX;

      if (!state.isScrolling) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (Math.max(absX, absY) < 6) {
          return;
        }

        if (state.allowMapPan && absX > absY) {
          resetState();
          return;
        }

        state.isScrolling = true;
      }

      const atTop = element.scrollTop <= 0 && deltaY < 0;
      const atBottom = Math.ceil(element.scrollTop + element.clientHeight) >= element.scrollHeight && deltaY > 0;
      if (atTop || atBottom) {
        return;
      }

      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      element.scrollTop = state.startScrollTop + deltaY;
    };

    const handleTouchEnd = () => {
      resetState();
    };

    const handleTouchCancel = () => {
      resetState();
    };

    const addListener = (type, handler, options) => {
      try {
        element.addEventListener(type, handler, options);
      } catch (error) {
        element.addEventListener(type, handler);
      }
    };

    const previousTouchAction = element.style.touchAction;
    const previousOverflowScrolling = element.style.webkitOverflowScrolling;

    element.style.touchAction = 'pan-y';
    element.style.webkitOverflowScrolling = 'touch';

    addListener('touchstart', handleTouchStart, { passive: true });
    addListener('touchmove', handleTouchMove, { passive: false });
    addListener('touchend', handleTouchEnd, { passive: true });
    addListener('touchcancel', handleTouchCancel, { passive: true });

    this._touchScrollHandlers = {
      element,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
      previousTouchAction,
      previousOverflowScrolling
    };
  }

  removeMobileGestures() {
    const handlers = this._touchScrollHandlers;
    if (!handlers?.element) {
      return;
    }

    const {
      element,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
      previousTouchAction,
      previousOverflowScrolling
    } = handlers;

    try { element.removeEventListener('touchstart', handleTouchStart); } catch (error) { /* ignore */ }
    try { element.removeEventListener('touchmove', handleTouchMove); } catch (error) { /* ignore */ }
    try { element.removeEventListener('touchend', handleTouchEnd); } catch (error) { /* ignore */ }
    try { element.removeEventListener('touchcancel', handleTouchCancel); } catch (error) { /* ignore */ }

    if (typeof previousTouchAction === 'string') {
      element.style.touchAction = previousTouchAction;
    } else {
      element.style.removeProperty('touch-action');
    }

    if (typeof previousOverflowScrolling === 'string') {
      element.style.webkitOverflowScrolling = previousOverflowScrolling;
    } else {
      element.style.removeProperty('-webkit-overflow-scrolling');
    }

    this._touchScrollHandlers = null;
  }

  render() {
    if (!this.containerElement) return;
    const panelTitles = {
  1: 'Global Risks',
  2: 'Baseline Risk',
  3: 'Tools Strategy',
  4: 'Remedy Approach',
  5: 'Managed Risk',
  ...(ENABLE_PANEL_6 ? { 6: 'Optimize' } : {})
  };

    const hasWindow = typeof window !== 'undefined';
    const userAgent = typeof navigator !== 'undefined' && navigator && navigator.userAgent
      ? navigator.userAgent
      : '';
    const isMobile = hasWindow
      ? window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      : false;

    const headerHeight = isMobile ? 120 : 180;

    let formattedLastUpdate = '';
    if (this.state.lastUpdate) {
      try {
        formattedLastUpdate = new Date(this.state.lastUpdate).toLocaleTimeString();
      } catch (error) {
        formattedLastUpdate = '';
      }
    }

    const maxPanels = ENABLE_PANEL_6 ? 6 : 5;
    const navButtons = Array.from({length: maxPanels}, (_, i) => i + 1)
      .map(panel => `
              <button onclick="window.hrddApp.setCurrentPanel(${panel})"
                      style="padding:${isMobile ? '8px 10px' : '6px 12px'};
                             border:1px solid ${this.state.currentPanel === panel ? '#2563eb' : '#d1d5db'};
                             background:${this.state.currentPanel === panel ? '#2563eb' : 'rgba(255,255,255,0.9)'};
                             color:${this.state.currentPanel === panel ? 'white' : '#475569'};
                             border-radius:9999px;
                             cursor:pointer;
                             font-weight:600;
                             transition:all .2s;
                             font-size:${isMobile ? '11px' : '12px'};
                             box-shadow:${this.state.currentPanel === panel ? '0 8px 18px rgba(37,99,235,.25)' : '0 3px 8px rgba(15,23,42,.08)'};
                             min-width:${isMobile ? '44px' : 'auto'};
                             min-height:${isMobile ? '36px' : 'auto'};
                             flex:${isMobile ? '1' : 'initial'};
                             max-width:${isMobile ? '80px' : 'none'};">
                ${isMobile ? panel : `${panel}. ${panelTitles[panel]}`}
              </button>
            `)
      .join('');
const statusBar = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:${isMobile ? '11px' : '12px'};color:#475569;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span id="hrddApiIndicator" style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${this.state.apiHealthy ? '#22c55e' : '#ef4444'};"></span>
          <span id="hrddApiStatus">API ${this.state.apiHealthy ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div style="opacity:.5;">•</div>
        <div><span id="hrddCountryCount">${this.state.countries.length}</span> Countries</div>
        <div style="opacity:.5;">•</div>
        <div><span id="hrddSelectedCount">${this.state.selectedCountries.length}</span> Selected</div>
        <div id="hrddLastUpdatedGroup" style="display:${formattedLastUpdate ? 'flex' : 'none'};align-items:center;gap:6px;">
          <div style="opacity:.5;">•</div>
          <span id="hrddLastUpdated">${formattedLastUpdate ? `Best on larger screens. Updated: ${formattedLastUpdate}` : ''}</span>
        </div>
      </div>
    `;

    const mobilePanelNavigation = !isMobile ? '' : `
      <div style="position:fixed;left:0;right:0;bottom:0;padding:0 0 calc(env(safe-area-inset-bottom, 0px) + 12px);display:flex;justify-content:center;z-index:999;background:linear-gradient(180deg, rgba(248,250,252,0) 0%, rgba(248,250,252,0.9) 45%);">
        <div style="width:calc(100% - 24px);max-width:744px;background:rgba(255,255,255,0.98);border:1px solid #e5e7eb;border-radius:9999px;box-shadow:0 12px 30px rgba(15,23,42,0.12);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;backdrop-filter:blur(12px);">
          <button onclick="window.hrddApp.setCurrentPanel(Math.max(1, window.hrddApp.state.currentPanel - 1))"
                  style="padding:8px 16px;background:#6b7280;color:white;border:none;border-radius:9999px;font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:4px;min-width:72px;${this.state.currentPanel === 1 ? 'opacity:0.5;' : ''}"
                  ${this.state.currentPanel === 1 ? 'disabled' : ''}>
            ← Prev
          </button>
          <span style="flex:1;font-size:12px;color:#4b5563;font-weight:600;text-align:center;white-space:nowrap;">
            Panel ${this.state.currentPanel} of ${ENABLE_PANEL_6 ? 6 : 5}
          </span>
          <button onclick="window.hrddApp.setCurrentPanel(Math.min(${ENABLE_PANEL_6 ? 6 : 5}, window.hrddApp.state.currentPanel + 1))"
                  style="padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:9999px;font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:4px;min-width:72px;${this.state.currentPanel === (ENABLE_PANEL_6 ? 6 : 5) ? 'opacity:0.5;' : ''}"
                  ${this.state.currentPanel === (ENABLE_PANEL_6 ? 6 : 5) ? 'disabled' : ''}>
            Next →
          </button>
        </div>
      </div>
    `;


    this.containerElement.innerHTML = `
      <div id="hrddAppContainer" style="position:relative;width:100%;height:100vh;overflow:hidden;background-color:#f8fafc;">
        <header id="hrddHeader" style="position:absolute;top:0;left:0;right:0;z-index:1000;background:rgba(248,250,252,0.98);padding:${isMobile ? '12px 12px 8px' : '20px 20px 12px'};box-sizing:border-box;border-bottom:1px solid rgba(226,232,240,0.5);backdrop-filter:blur(10px);">
           <div style="width:100%;max-width:1600px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:${isMobile ? '8px' : '12px'};text-align:center;padding:${isMobile ? '8px 12px' : '12px 20px'};background:rgba(255,255,255,0.9);border:1px solid rgba(226,232,240,0.8);border-radius:${isMobile ? '8px' : '12px'};box-shadow:0 6px 18px rgba(15,23,42,0.08);box-sizing:border-box;">
            ${isMobile ? `
              <div style="display:flex;flex-direction:column;gap:6px;align-items:center;width:100%;">
                <h1 style="font-size:18px;font-weight:700;color:#1f2937;margin:0;line-height:1.2;">Supply chain risks</h1>
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:4px;align-items:center;">
                <h1 style="font-size:28px;font-weight:700;color:#1f2937;margin:0;line-height:1.25;">How effective are your labour rights due diligence tools?</h1>
                <p style="font-size:15px;color:#4b5563;margin:0;">Start with panel 1 and work across to see the results on panel 5. Then use the optimizer on panel 6.</p>
              </div>
            `}
            <div style="display:flex;justify-content:center;gap:${isMobile ? '4px' : '6px'};flex-wrap:wrap;width:100%;">
              ${navButtons}
            </div>
            ${statusBar}
          </div>
        </header>
       <main id="hrddMainContent" style="position:absolute;top:${headerHeight}px;left:0;right:0;bottom:${isMobile ? '60px' : '0'};overflow-y:auto;overflow-x:hidden;background-color:#f8fafc;box-sizing:border-box;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;">
          <div style="width:100%;max-width:${isMobile ? '100%' : '1600px'};margin:0 auto;padding:${isMobile ? '12px 12px 80px' : '20px 20px 60px'};box-sizing:border-box;">
            <div id="panelContent">
              ${this.renderCurrentPanel()}
            </div>
            <div style="height:${isMobile ? '60px' : '40px'};"></div>
          </div>
        </main>
        ${mobilePanelNavigation}
        
      </div>
      <style>
         * {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          box-sizing: border-box;
        }
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          height: 100%;
          position: fixed;
          width: 100%;
        }
        @supports (height: 100dvh) {
          #hrddAppContainer {
            height: 100dvh !important;
          }
        }
        #${this.containerElement.id} {
          width: 100%;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          position: relative;
        }
        #hrddMainContent::-webkit-scrollbar {
          width: ${isMobile ? '4px' : '10px'};
        }
        #hrddMainContent::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 5px;
        }
        #hrddMainContent::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 5px;
        }
        #hrddMainContent::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
        @media (max-width: 768px) {
          input[type="range"] {
            min-height: 44px;
            padding: 12px 0;
          }
          input[type="number"], select {
            min-height: 44px;
            font-size: 16px !important;
          }
          button {
            min-height: 44px;
            min-width: 44px;
          }
          div[style*="grid-template-columns: repeat(3"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
             h1 { font-size: 20px !important; }
          h2 { font-size: 18px !important; }
          h3 { font-size: 16px !important; }
          p { font-size: 14px !important; }
          /* Reduce common inline font sizes for smaller screens */
          #hrddAppContainer [style*="font-size: 56px"] { font-size: 48px !important; }
          #hrddAppContainer [style*="font-size: 48px"] { font-size: 40px !important; }
          #hrddAppContainer [style*="font-size: 40px"] { font-size: 34px !important; }
          #hrddAppContainer [style*="font-size: 32px"] { font-size: 28px !important; }
          #hrddAppContainer [style*="font-size: 28px"] { font-size: 24px !important; }
          #hrddAppContainer [style*="font-size: 24px"] { font-size: 20px !important; }
          #hrddAppContainer [style*="font-size: 20px"] { font-size: 18px !important; }
          #hrddAppContainer [style*="font-size: 18px"] { font-size: 16px !important; }
          #hrddAppContainer [style*="font-size: 16px"] { font-size: 14px !important; }
          #hrddAppContainer [style*="font-size: 14px"] { font-size: 13px !important; }
          #hrddAppContainer [style*="font-size: 13px"] { font-size: 12px !important; }
          #hrddAppContainer [style*="font-size: 12px"] { font-size: 11px !important; }
          #hrddAppContainer [style*="font-size: 11px"] { font-size: 10px !important; }
          #globalMapContainer, #baselineMapContainer {
            min-height: 300px !important;
            max-height: 400px !important;
          }
          #hrddMainContent {
            padding-bottom: 80px;
          }
        }
        body {
          overscroll-behavior-y: none;
        }
      </style>
    `;

    const mainContent = typeof document !== 'undefined'
      ? document.getElementById('hrddMainContent')
      : null;

    if (this._wheelListenerAttached && this._wheelListenerTarget && this._wheelListenerTarget !== mainContent) {
      try {
        this._wheelListenerTarget.removeEventListener('wheel', this.handleWheelScroll);
      } catch (error) {
        // Ignore removal errors (older browsers)
      }
      this._wheelListenerAttached = false;
      this._wheelListenerTarget = null;
    }

    this.mainScrollElement = mainContent || null;

    if (this.mainScrollElement) {
      if (!this._wheelListenerAttached || this._wheelListenerTarget !== this.mainScrollElement) {
        try {
          this.mainScrollElement.addEventListener('wheel', this.handleWheelScroll, { passive: false });
        } catch (error) {
          this.mainScrollElement.addEventListener('wheel', this.handleWheelScroll);
        }
        this._wheelListenerAttached = true;
        this._wheelListenerTarget = this.mainScrollElement;
      }

      this.mainScrollElement.scrollTop = 0;
    } else {
      this._wheelListenerAttached = false;
      this._wheelListenerTarget = null;
      this.removeMobileGestures();
    }

    if (isMobile && typeof this.addMobileGestures === 'function') {
      this.addMobileGestures();
    } else if (typeof this.removeMobileGestures === 'function') {
      this.removeMobileGestures();
    }
  }

  renderCurrentPanel() {
    const panel = this.state.currentPanel;

    if (this.state.loading) {
      return `
        <div style="display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 220px);padding:20px;">
          <div style="padding:16px 20px;border:1px solid #e5e7eb;border-radius:10px;background:white;box-shadow:0 8px 20px rgba(26,23,42,0.08);">
            Loading data…
          </div>
        </div>
      `;
    }

    const ensureMinHeight = content => `
      <div style="min-height:calc(100vh - 200px);padding-bottom:40px;">
        ${content}
      </div>
    `;

   if (panel === 1) {
      const descriptionHtml = renderPanelDescription(panel);
      const html = ensureMinHeight(`
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${descriptionHtml}
            <div style="display:flex;justify-content:flex-end;">
              <button
                id="resetAppButton"
                style="padding:10px 20px;border:1px solid #1f2937;background-color:#111827;color:white;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 10px rgba(15,23,42,0.12);"
              >
                Reset app to defaults
              </button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:16px;">
            <div id="globalMapContainer" style="min-height:500px;"></div>
            <div id="weightingsPanel" style="min-height:400px;"></div>
          </div>
        </div>
      `);

      queueMicrotask(() => {
        UIComponents.createGlobalRiskMap('globalMapContainer', {
          countries: this.state.countries,
          countryRisks: this.state.countryRisks,
          title: 'Global Risk Overview',
          height: 500,
          width: 1200
        });

        UIComponents.createWeightingsPanel('weightingsPanel', {
          weights: this.state.weights,
          onWeightsChange: this.onWeightsChange
        });

        const resetButton = document.getElementById('resetAppButton');
        if (resetButton) {
          resetButton.addEventListener('click', () => {
            this.resetApplicationState();
          });
        }
      });

      return html;
    }

    if (panel === 2) {
      const html = ensureMinHeight(`
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderPanelDescription(panel)}
          <div style="display:grid;grid-template-columns:1fr;gap:16px;">
            <div id="baselineMapContainer" style="min-height:500px;"></div>
            <div id="countrySelectionPanel" style="min-height:300px;"></div>
            <div id="resultsPanel" style="min-height:400px;"></div>
          </div>
        </div>
      `);

      queueMicrotask(() => {
         const baselineRiskValue = Number.isFinite(this.state.baselineRisk)
          ? this.state.baselineRisk.toFixed(1)
          : 'N/A';
        const managedRiskValue = Number.isFinite(this.state.managedRisk)
          ? this.state.managedRisk.toFixed(1)
          : 'N/A';
        const baselineMapTitle = `Click on countries to select them: current baseline risk = ${baselineRiskValue}`;
        const baselineMapSubtitle = `Based on the assumptions, current managed risk = ${managedRiskValue}`;

        UIComponents.createWorldMap('baselineMapContainer', {
          countries: this.state.countries,
          countryRisks: this.state.countryRisks,
          selectedCountries: this.state.selectedCountries,
          onCountrySelect: this.onCountrySelect,
          title: baselineMapTitle,
          subtitle: baselineMapSubtitle,
          height: 500,
          width: 1200
        });

        UIComponents.createCountrySelectionPanel('countrySelectionPanel', {
          countries: this.state.countries,
          selectedCountries: this.state.selectedCountries,
          countryVolumes: this.state.countryVolumes,
          onCountrySelect: this.onCountrySelect,
          onVolumeChange: this.onVolumeChange
        });

        UIComponents.createResultsPanel('resultsPanel', {
          selectedCountries: this.state.selectedCountries,
          countries: this.state.countries,
          countryRisks: this.state.countryRisks,
          baselineRisk: this.state.baselineRisk
        });
      });

      return html;
    }

    if (panel === 3) {
      const html = ensureMinHeight(`
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderPanelDescription(panel)}
          <div id="strategyRiskSummary" style="min-height:300px;"></div>
          <div style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:20px;line-height:1.6;color:#92400e;font-size:14px;">
               There are six labour rights due diligence tools on this panel. In reverse order, you will find two forms of <strong>SAQ</strong>, self-assessment questionnaires. This refers to a much-used system where suppliers are sent questionnaires on their policies and procedures relating to labour rights in their workplaces and supplier confirm what they do. SAQ with evidence means the questionnaire has to be supported with evidence (eg: copies of the policies). You will find two forms of <strong>social audit</strong>: unannounced and announced/self-arranged. In a social audit, a trained auditor visits a workplace and typically spends time with management asking a standard set of questions (eg: using the "SMETA" standard), compiling answers, asking for evidence to support, and sometimes also interviews workers. Unannounced audits are seldom used, most audits are announced in advance or self-arranged by suppliers. You will find two forms of <strong>worker voice</strong>: survey and continuous. A survey is when a sample of workers (or sometimes all workers) are asked questions about how they are treated with the results compiled into a report. There will be a date or few dates when the survey is conducted, with the report available after. With continuous worker voice, workers report all the time and results are in real-time, typically presented on interactive dashboards - it is a continuous connection with workers that usually covers all-the-workers, all-the-time.
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:stretch;" id="panel3Grid">
            <div id="hrddStrategyPanel" style="min-height:600px;"></div>
            <div id="transparencyPanel" style="min-height:600px;"></div>
          </div>
          <div id="focusPanel" style="min-height:400px;"></div>
        </div>
      `);

      queueMicrotask(() => {
        UIComponents.createRiskComparisonPanel('strategyRiskSummary', {
          baselineRisk: this.state.baselineRisk,
          managedRisk: this.state.managedRisk,
          selectedCountries: this.state.selectedCountries,
          focusEffectivenessMetrics: this.state.focusEffectivenessMetrics
        });

        UIComponents.createHRDDStrategyPanel('hrddStrategyPanel', {
          strategy: this.state.hrddStrategy,
          onStrategyChange: this.onHRDDStrategyChange,
          onFocusChange: this.onFocusChange
        });

        UIComponents.createTransparencyPanel('transparencyPanel', {
          transparency: this.state.transparencyEffectiveness,
          onTransparencyChange: this.onTransparencyChange
        });

        UIComponents.createFocusPanel('focusPanel', {
          focus: this.state.focus,
          onFocusChange: this.onFocusChange,
          focusEffectivenessMetrics: this.state.focusEffectivenessMetrics
        });
      });

      return html;
    }

    if (panel === 4) {
      const html = ensureMinHeight(`
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderPanelDescription(panel)}
          <div id="responseRiskSummary" style="min-height:300px;"></div>
          <div style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:20px;line-height:1.6;color:#92400e;font-size:14px;">
            On this panel, indicate how effective the 6 different tools are at supporting, sustaining and encouraging remedy and good conduct by suppliers. In the left hand column, move the slider to show how effective each tool as <strong>"Remedy Support"</strong>. That means providing clear feedback to each supplier about findings and what should be done about them, and monitoring whether or not remedies are implemented and then sustained. Tools based on continuous feedback from workers have this capability built-in. In the right-hand column, move the slider to show how effective each tool is at <strong>"Promoting Good Conduct"</strong> amongst suppliers. For example, SAQs make the standards clear to suppliers that they are supposed to observed. Audits and workers surveys can be repeated and so suppliers then become aware that there will be follow-up checks. Continuous worker voice has this approach built-in, since feedback from workers is uninterrupted.
          </div>
           <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:stretch;" id="panel4Grid">
            <div id="responsivenessPanel" style="min-height:600px;"></div>
            <div id="responsivenessEffectivenessPanel" style="min-height:600px;"></div>
          </div>
        </div>
      `);

      queueMicrotask(() => {
        UIComponents.createResponsivenessPanel('responsivenessPanel', {
          responsiveness: this.state.responsivenessStrategy,
          onResponsivenessChange: this.onResponsivenessChange
        });

        UIComponents.createResponsivenessEffectivenessPanel('responsivenessEffectivenessPanel', {
          effectiveness: this.state.responsivenessEffectiveness,
          onEffectivenessChange: this.onResponsivenessEffectivenessChange
        });

        UIComponents.createRiskComparisonPanel('responseRiskSummary', {
          baselineRisk: this.state.baselineRisk,
          managedRisk: this.state.managedRisk,
          selectedCountries: this.state.selectedCountries,
          focusEffectivenessMetrics: this.state.focusEffectivenessMetrics
        });
      });

      return html;
    }

    if (panel === 5) {
      const html = ensureMinHeight(`
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderPanelDescription(panel)}
          <div id="panel5MapsSection" style="display:grid;grid-template-columns:1fr;gap:16px;">
            <div id="panel5BaselineMapContainer" style="min-height:500px;"></div>
            <div id="managedComparisonMapContainer" style="min-height:400px;"></div>
          </div>
          <div id="panel5ResultsSection">
            <div id="finalResultsPanel" style="min-height:600px;"></div>
          </div>
          <div style="display:flex;justify-content:center;align-items:center;">
            <button id="btnGeneratePDF" ${this.state.isGeneratingReport ? 'disabled' : ''} style="padding:10px 24px;border:1px solid #2563eb;background:${this.state.isGeneratingReport ? '#bfdbfe' : '#2563eb'};color:white;border-radius:8px;cursor:${this.state.isGeneratingReport ? 'not-allowed' : 'pointer'};font-weight:600;">
              ${this.state.isGeneratingReport ? 'Generating…' : 'Generate PDF Report'}
            </button>
          </div>
        </div>
      `);

      queueMicrotask(() => {
        const baselineRiskValue = Number.isFinite(this.state.baselineRisk)
          ? this.state.baselineRisk.toFixed(1)
          : 'N/A';
        const baselineMapTitle = `Baseline Risk - Selected Countries Only - Overall Risk: ${baselineRiskValue}`;

        UIComponents.createWorldMap('panel5BaselineMapContainer', {
          countries: this.state.countries,
          countryRisks: this.state.countryRisks,
          selectedCountries: this.state.selectedCountries,
          onCountrySelect: this.onCountrySelect,
          title: baselineMapTitle,
          height: 500,
          width: 1200
        });

        UIComponents.createComparisonMap('managedComparisonMapContainer', {
          countries: this.state.countries,
          countryRisks: this.state.countryRisks,
          selectedCountries: this.state.selectedCountries,
          title: 'Managed Risk - Selected Countries Only',
          mapType: 'managed',
          managedRisk: this.state.managedRisk,
          selectedCountryRisks: this.state.countryManagedRisks,
          baselineRisks: this.state.countryRisks,
          focus: this.state.focus,
          focusEffectivenessMetrics: this.state.focusEffectivenessMetrics,
          height: 400,
          width: 1200
        });

        UIComponents.createFinalResultsPanel('finalResultsPanel', {
          baselineRisk: this.state.baselineRisk,
          managedRisk: this.state.managedRisk,
          selectedCountries: this.state.selectedCountries,
          countries: this.state.countries,
          hrddStrategy: this.state.hrddStrategy,
          transparencyEffectiveness: this.state.transparencyEffectiveness,
          responsivenessStrategy: this.state.responsivenessStrategy,
          responsivenessEffectiveness: this.state.responsivenessEffectiveness,
          focus: this.state.focus,
          riskConcentration: this.state.riskConcentration,
          countryVolumes: this.state.countryVolumes,
          countryRisks: this.state.countryRisks,
          focusEffectivenessMetrics: this.state.focusEffectivenessMetrics
        });

        const btnPDF = document.getElementById('btnGeneratePDF');
        if (btnPDF) {
          btnPDF.onclick = (event) => {
            if (typeof event?.preventDefault === 'function') {
              event.preventDefault();
            }
            this.generatePDFReport({ includePanel6: false });
          };
        }
      });

      return html;
 }

    if (ENABLE_PANEL_6 && panel === 6) {
      const html = ensureMinHeight(`
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${renderPanelDescription(panel)}
          <div id="costAnalysisPanel" style="min-height:800px;"></div>
        </div>
      `);

      queueMicrotask(() => {
        UIComponents.createCostAnalysisPanel('costAnalysisPanel', {
          supplierCount: this.state.supplierCount,
          hourlyRate: this.state.hourlyRate,
          toolAnnualProgrammeCosts: this.state.toolAnnualProgrammeCosts,
          toolPerSupplierCosts: this.state.toolPerSupplierCosts,
          toolInternalHours: this.state.toolInternalHours,
          toolRemedyInternalHours: this.state.toolRemedyInternalHours,
          hrddStrategy: this.state.hrddStrategy,
          transparencyEffectiveness: this.state.transparencyEffectiveness,
          responsivenessStrategy: this.state.responsivenessStrategy,
          responsivenessEffectiveness: this.state.responsivenessEffectiveness,
          selectedCountries: this.state.selectedCountries,
          countries: this.state.countries,
          countryVolumes: this.state.countryVolumes,
          countryRisks: this.state.countryRisks,
          countryManagedRisks: this.state.countryManagedRisks,
          focus: this.state.focus,
          baselineRisk: this.state.baselineRisk,
          managedRisk: this.state.managedRisk,
          onSupplierCountChange: this.onSupplierCountChange,
          onHourlyRateChange: this.onHourlyRateChange,
          onToolAnnualProgrammeCostChange: this.onToolAnnualProgrammeCostChange,
          onToolPerSupplierCostChange: this.onToolPerSupplierCostChange,
          onToolInternalHoursChange: this.onToolInternalHoursChange,
          onToolRemedyInternalHoursChange: this.onToolRemedyInternalHoursChange,
          optimizeBudgetAllocation: this.optimizeBudgetAllocation,
          saqConstraintEnabled: this.state.saqConstraintEnabled,
          onSAQConstraintChange: this.onSAQConstraintChange,
          socialAuditConstraintEnabled: this.state.socialAuditConstraintEnabled,
          socialAuditCostReduction: this.state.socialAuditCostReduction,
          onSocialAuditConstraintChange: this.onSocialAuditConstraintChange,
          onSocialAuditCostReductionChange: this.onSocialAuditCostReductionChange,
          shouldAutoRunOptimization: this.state.shouldAutoRunOptimization,
          lastOptimizationResult: this.state.lastOptimizationResult,
          isGeneratingReport: this.state.isGeneratingReport
        });
        this.state.shouldAutoRunOptimization = false;
      });

      return html;
    }

    return '';
  }

  /* ------------------------ Export & Reporting ----------------------- */

   async generatePDFReport(request = {}) {
    if (typeof document === 'undefined') {
      console.warn('PDF report generation is only available in a browser environment.');
      return;
    }

    if (this.state.isGeneratingReport) {
      return;
    }

    const options = (request instanceof Event || request === null)
      ? {}
      : (typeof request === 'object' ? request : {});

    const includePanel6 = Boolean(options.includePanel6);

    try {
      this.state.isGeneratingReport = true;
      this.updateUI();

      await pdfGenerator.generateReport(this, { includePanel6 });

      console.log('PDF generated');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      this.state.isGeneratingReport = false;
      this.updateUI();
    }
  }

  exportConfiguration = async () => {
    try {
      const config = {
        exportedAt: new Date().toISOString(),
        version: '5.0',
        data: (() => ({
          countries: this.state.countries,
          selectedCountries: this.state.selectedCountries,
          weights: this.state.weights,
          hrddStrategy: this.state.hrddStrategy,
          transparencyEffectiveness: this.state.transparencyEffectiveness,
          responsivenessStrategy: this.state.responsivenessStrategy,
          responsivenessEffectiveness: this.state.responsivenessEffectiveness,
          focus: this.state.focus,
          riskConcentration: this.state.riskConcentration,
          countryVolumes: this.state.countryVolumes
        }))()
      };

      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hrdd-risk-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Configuration exported');
    } catch (error) {
      console.error('Failed to export configuration:', error);
       }
  };

  /* ----------------------- External Integrations ------------------------ */

  loadSavedState() {
    const restored = this.restoreState();
    if (restored) {
      this.calculateAllRisks();
      this.calculateBaselineRisk();
      this.calculateManagedRisk();
      this.state.lastUpdate = new Date().toISOString();
      this.state.isDirty = false;
    }
    return restored;
  }

  loadDemoData() {
    const demoCountries = [
        {
        name: 'Bangladesh',
        isoCode: 'BGD',
        itucRightsRating: 68,
        corruptionIndex: 25,
        freedomRating: 32,
        wjpIndex: 30,
        walkfreeSlaveryIndex: 48
      },
      {
        name: 'Vietnam',
        isoCode: 'VNM',
        itucRightsRating: 64,
        corruptionIndex: 36,
        freedomRating: 49,
        wjpIndex: 45,
        walkfreeSlaveryIndex: 38
      },
      {
        name: 'Brazil',
        isoCode: 'BRA',
        itucRightsRating: 52,
        corruptionIndex: 38,
        freedomRating: 75,
        wjpIndex: 54,
        walkfreeSlaveryIndex: 32
      },
      {
        name: 'Germany',
        isoCode: 'DEU',
        itucRightsRating: 18,
        corruptionIndex: 80,
        freedomRating: 90,
        wjpIndex: 79,
        walkfreeSlaveryIndex: 15
      }
    ];

    this.state.countries = demoCountries.map(country => ({ ...country }));
    this.state.selectedCountries = demoCountries.slice(0, 3).map(country => country.isoCode);
    this.state.countryVolumes = {
      BGD: 30,
      VNM: 20,
      BRA: 15
    };
    this.state.apiHealthy = false;
    this.state.error = null;
    this.state.loading = false;

    this.calculateAllRisks();
    this.calculateBaselineRisk();
    this.calculateManagedRisk();

    this.state.lastUpdate = new Date().toISOString();
    this.state.isDirty = false;

    if (this.containerElement) {
      this.render();
    }
  }

  getState() {
    const snapshot = {
      ...this.state,
      countries: Array.isArray(this.state.countries)
        ? this.state.countries.map(country => ({ ...country }))
        : [],
      selectedCountries: Array.isArray(this.state.selectedCountries)
        ? [...this.state.selectedCountries]
        : [],
      weights: Array.isArray(this.state.weights) ? [...this.state.weights] : [],
      hrddStrategy: Array.isArray(this.state.hrddStrategy) ? [...this.state.hrddStrategy] : [],
      transparencyEffectiveness: Array.isArray(this.state.transparencyEffectiveness)
        ? [...this.state.transparencyEffectiveness]
        : [],
      responsivenessStrategy: Array.isArray(this.state.responsivenessStrategy)
        ? [...this.state.responsivenessStrategy]
        : [],
      responsivenessEffectiveness: Array.isArray(this.state.responsivenessEffectiveness)
        ? [...this.state.responsivenessEffectiveness]
        : [],
      countryVolumes: this.state.countryVolumes ? { ...this.state.countryVolumes } : {},
      countryRisks: this.state.countryRisks ? { ...this.state.countryRisks } : {},
      countryManagedRisks: this.state.countryManagedRisks ? { ...this.state.countryManagedRisks } : {}
    };

    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(snapshot);
      }
    } catch (error) {
      console.warn('structuredClone failed, falling back to JSON clone:', error);
    }

    return JSON.parse(JSON.stringify(snapshot));
  }

  setState(partialState = {}) {
    if (!partialState || typeof partialState !== 'object') {
      return;
    }

    const assignArray = (key, normalizer) => {
      if (Array.isArray(partialState[key])) {
        this.state[key] = normalizer(partialState[key]);
        return true;
      }
      return false;
    };

    assignArray('countries', arr => arr.map(country => ({ ...country })));
    assignArray('selectedCountries', arr => Array.from(new Set(arr)));
    assignArray('weights', arr => [...arr]);
    assignArray('hrddStrategy', arr => [...arr]);
    assignArray('transparencyEffectiveness', arr => this.normalizeTransparencyEffectiveness(arr));
    assignArray('responsivenessStrategy', arr => [...arr]);
    assignArray('responsivenessEffectiveness', arr => this.normalizeResponsivenessEffectiveness(arr));

    if (typeof partialState.focus === 'number') {
      this.state.focus = this.clamp01(partialState.focus);
    }
    if (typeof partialState.riskConcentration === 'number') {
      this.state.riskConcentration = partialState.riskConcentration;
    }
    if (partialState.countryVolumes && typeof partialState.countryVolumes === 'object') {
      const normalizedVolumes = {};
      Object.entries(partialState.countryVolumes).forEach(([key, value]) => {
        if (typeof key === 'string') {
          normalizedVolumes[key.trim().toUpperCase()] = value;
        }
      });
      this.state.countryVolumes = normalizedVolumes;
    }
    if (partialState.countryRisks && typeof partialState.countryRisks === 'object') {
      const normalizedRisks = {};
      Object.entries(partialState.countryRisks).forEach(([key, value]) => {
        if (typeof key === 'string') {
          normalizedRisks[key.trim().toUpperCase()] = value;
        }
      });
      this.state.countryRisks = normalizedRisks;
    }
    if (partialState.countryManagedRisks && typeof partialState.countryManagedRisks === 'object') {
      const normalizedManaged = {};
      Object.entries(partialState.countryManagedRisks).forEach(([key, value]) => {
        if (typeof key === 'string') {
          normalizedManaged[key.trim().toUpperCase()] = value;
        }
      });
      this.state.countryManagedRisks = normalizedManaged;
    }

    const simpleKeys = [
      'baselineRisk',
      'managedRisk',
      'loading',
      'error',
      'apiHealthy',
      'lastUpdate',
      'isGeneratingReport'
    ];
    simpleKeys.forEach(key => {
      if (partialState[key] !== undefined) {
        this.state[key] = partialState[key];
      }
    });

    if (typeof partialState.currentPanel === 'number') {
      this.state.currentPanel = Math.max(1, Math.min(5, Math.round(partialState.currentPanel)));
    }

    this.state.isDirty = true;
    this.calculateAllRisks();
    this.calculateBaselineRisk();
    this.calculateManagedRisk();
    this.state.lastUpdate = new Date().toISOString();

    if (this.containerElement) {
      this.render();
    }
  }

 setCurrentStep(step) {
    this.setCurrentPanel(step);
  }

  resetApplicationState() {
    const defaultWeights = Array.isArray(riskEngine?.defaultWeights)
      ? [...riskEngine.defaultWeights]
      : [20, 20, 20, 20, 20];
    const defaultFocus = typeof riskEngine?.defaultFocus === 'number'
      ? riskEngine.defaultFocus
      : 0.6;
    const defaultHRDDStrategy = Array.isArray(riskEngine?.defaultHRDDStrategy)
      ? [...riskEngine.defaultHRDDStrategy]
      : [0, 10, 5, 65, 100, 0];
    const defaultTransparency = this.normalizeTransparencyEffectiveness(
      riskEngine?.defaultTransparencyEffectiveness || [90, 50, 25, 10, 8, 2]
    );
    const defaultResponsiveness = Array.isArray(riskEngine?.defaultResponsivenessStrategy)
      ? [...riskEngine.defaultResponsivenessStrategy]
      : [75, 85, 50, 25, 5, 5];
    const defaultResponsivenessEffectiveness = this.normalizeResponsivenessEffectiveness(
      riskEngine?.defaultResponsivenessEffectiveness || [90, 50, 10, 10, 2, 2]
    );

    this.state.weights = defaultWeights;
    this.state.selectedCountries = [];
    this.state.countryVolumes = {};
    this.state.countryRisks = {};
    this.state.countryManagedRisks = {};
    this.state.baselineRisk = 0;
    this.state.managedRisk = 0;
    this.state.riskConcentration = 1;
    this.state.focus = defaultFocus;
    this.state.hrddStrategy = defaultHRDDStrategy;
    this.state.transparencyEffectiveness = defaultTransparency;
    this.state.responsivenessStrategy = defaultResponsiveness;
    this.state.responsivenessEffectiveness = defaultResponsivenessEffectiveness;
    this.state.focusEffectivenessMetrics = null;
    this.state.currentPanel = 1;
    this.state.isDirty = false;
    this.state.loading = false;
    this.state.error = null;
    this.state.isGeneratingReport = false;

    if (ENABLE_PANEL_6) {
      this.state.supplierCount = 500;
      this.state.hourlyRate = 40;
      this.state.toolAnnualProgrammeCosts = [12000, 0, 0, 40000, 0, 0];
      this.state.toolPerSupplierCosts = [120, 0, 1000, 0, 0, 0];
      this.state.toolInternalHours = [6, 20, 20, 6, 2, 1];
      this.state.toolRemedyInternalHours = [0, 10, 10, 6, 2, 2];
      this.state.saqConstraintEnabled = true;
      this.state.socialAuditConstraintEnabled = true;
      this.state.socialAuditCostReduction = 50;
      this.state.shouldAutoRunOptimization = false;
      this.state.lastOptimizationResult = null;
    }

    if (this.weightsTimeout) clearTimeout(this.weightsTimeout);
    if (this.volumeTimeout) clearTimeout(this.volumeTimeout);
    if (this.strategyTimeout) clearTimeout(this.strategyTimeout);
    if (this.transparencyTimeout) clearTimeout(this.transparencyTimeout);
    if (this.responsivenessTimeout) clearTimeout(this.responsivenessTimeout);
    if (this.responsivenessEffectivenessTimeout) clearTimeout(this.responsivenessEffectivenessTimeout);
    if (this.focusTimeout) clearTimeout(this.focusTimeout);

    this.weightsTimeout = null;
    this.volumeTimeout = null;
    this.strategyTimeout = null;
    this.transparencyTimeout = null;
    this.responsivenessTimeout = null;
    this.responsivenessEffectivenessTimeout = null;
    this.focusTimeout = null;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('hrdd_app_state_v5');
      }
    } catch (error) {
      console.warn('Failed to clear saved state:', error);
    }

    this.calculateAllRisks();
    this.calculateBaselineRisk();
    this.calculateManagedRisk();
    this.state.lastUpdate = new Date().toISOString();

    if (this.containerElement) {
      this.render();
    } else {
      this.updateUI();
    }
  }

  addCountry(isoCode, volume = null) {
    if (typeof isoCode !== 'string') return;
    const normalized = isoCode.trim().toUpperCase();
    if (!normalized) return;


    const nextSelection = Array.from(new Set([...this.state.selectedCountries, normalized]));
    this.onCountrySelect(nextSelection);

    if (volume !== null) {
      this.onVolumeChange(normalized, volume);
    }
  }

  removeCountry(isoCode) {
    if (typeof isoCode !== 'string') return;
    const normalized = isoCode.trim().toUpperCase();
    if (!normalized) return;

    // Remove from volumes and managed risks
    const cleanedVolumes = { ...this.state.countryVolumes };
    const cleanedManagedRisks = { ...this.state.countryManagedRisks };
    delete cleanedVolumes[normalized];
    delete cleanedManagedRisks[normalized];
    
    this.state.countryVolumes = cleanedVolumes;
    this.state.countryManagedRisks = cleanedManagedRisks;

    // Update selection
    const nextSelection = this.state.selectedCountries.filter(code => code !== normalized);
    this.onCountrySelect(nextSelection);
  }

  /* ---------------------------- Persistence -------------------------- */

   saveState() {
    try {
      const snapshot = {
        selectedCountries: this.state.selectedCountries,
        weights: this.state.weights,
        hrddStrategy: this.state.hrddStrategy,
        transparencyEffectiveness: this.state.transparencyEffectiveness,
        responsivenessStrategy: this.state.responsivenessStrategy,
        responsivenessEffectiveness: this.state.responsivenessEffectiveness,
        focus: this.state.focus,
        riskConcentration: this.state.riskConcentration,
        countryVolumes: this.state.countryVolumes
      };

      if (ENABLE_PANEL_6) {
        snapshot.supplierCount = this.state.supplierCount;
        snapshot.hourlyRate = this.state.hourlyRate;
        snapshot.toolAnnualProgrammeCosts = Array.isArray(this.state.toolAnnualProgrammeCosts) 
          ? [...this.state.toolAnnualProgrammeCosts] 
          : [];
        snapshot.toolPerSupplierCosts = Array.isArray(this.state.toolPerSupplierCosts)
          ? [...this.state.toolPerSupplierCosts]
          : [];
        snapshot.toolInternalHours = Array.isArray(this.state.toolInternalHours)
          ? [...this.state.toolInternalHours]
          : [];
        snapshot.toolRemedyInternalHours = Array.isArray(this.state.toolRemedyInternalHours)
          ? [...this.state.toolRemedyInternalHours]
          : [];
        snapshot.saqConstraintEnabled = Boolean(this.state.saqConstraintEnabled);
        snapshot.socialAuditConstraintEnabled = Boolean(this.state.socialAuditConstraintEnabled);
        snapshot.socialAuditCostReduction = Number.isFinite(this.state.socialAuditCostReduction)
          ? this.state.socialAuditCostReduction
          : 50;
      }
      localStorage.setItem('hrdd_app_state_v5', JSON.stringify(snapshot));
      this.state.isDirty = false;
    } catch (e) {
      console.warn('saveState failed:', e);
    }
  }

  restoreState() {
    try {
      const raw = localStorage.getItem('hrdd_app_state_v5');
      if (!raw) return false;
      const parsed = JSON.parse(raw);

      let restored = false;

      if (Array.isArray(parsed.weights)) {
        this.state.weights = [...parsed.weights];
        restored = true;
      }
      if (Array.isArray(parsed.selectedCountries)) {
        this.state.selectedCountries = parsed.selectedCountries
          .map(code => (typeof code === 'string' ? code.trim().toUpperCase() : ''))
          .filter(Boolean);
        restored = true;
      }
      if (Array.isArray(parsed.hrddStrategy)) {
        this.state.hrddStrategy = [...parsed.hrddStrategy];
        restored = true;
      }
      if (Array.isArray(parsed.transparencyEffectiveness)) {
        this.state.transparencyEffectiveness = this.normalizeTransparencyEffectiveness(parsed.transparencyEffectiveness);
        restored = true;
      }
      if (Array.isArray(parsed.responsivenessStrategy)) {
        this.state.responsivenessStrategy = [...parsed.responsivenessStrategy];
        restored = true;
      }
      if (Array.isArray(parsed.responsivenessEffectiveness)) {
        this.state.responsivenessEffectiveness = this.normalizeResponsivenessEffectiveness(parsed.responsivenessEffectiveness);
        restored = true;
      }
      if (typeof parsed.focus === 'number') {
        this.state.focus = this.clamp01(parsed.focus);
        restored = true;
      }
      if (ENABLE_PANEL_6) {
        if (typeof parsed.supplierCount === 'number') {
          this.state.supplierCount = Math.max(1, Math.floor(parsed.supplierCount));
          restored = true;
        }
        if (typeof parsed.hourlyRate === 'number') {
          this.state.hourlyRate = Math.max(0, parsed.hourlyRate);
          restored = true;
        }
        if (Array.isArray(parsed.toolAnnualProgrammeCosts)) {
          this.state.toolAnnualProgrammeCosts = parsed.toolAnnualProgrammeCosts.map(value =>
            Math.max(0, Number.isFinite(value) ? value : 0)
          );
          restored = true;
        }
        if (Array.isArray(parsed.toolPerSupplierCosts)) {
          this.state.toolPerSupplierCosts = parsed.toolPerSupplierCosts.map(value =>
            Math.max(0, Number.isFinite(value) ? value : 0)
          );
          restored = true;
        }
        if (Array.isArray(parsed.toolInternalHours)) {
          this.state.toolInternalHours = parsed.toolInternalHours.map(value =>
            Math.max(0, Number.isFinite(value) ? value : 0)
          );
          restored = true;
        }
        if (Array.isArray(parsed.toolRemedyInternalHours)) {
          this.state.toolRemedyInternalHours = parsed.toolRemedyInternalHours.map(value =>
            Math.max(0, Number.isFinite(value) ? value : 0)
          );
          restored = true;
        }
        // NEW: Restore SAQ constraint state
        if (typeof parsed.saqConstraintEnabled === 'boolean') {
          this.state.saqConstraintEnabled = parsed.saqConstraintEnabled;
          restored = true;
        }
        if (typeof parsed.socialAuditConstraintEnabled === 'boolean') {
          this.state.socialAuditConstraintEnabled = parsed.socialAuditConstraintEnabled;
          restored = true;
        }
        if (typeof parsed.socialAuditCostReduction === 'number') {
          this.state.socialAuditCostReduction = Math.max(0, Math.min(100, parsed.socialAuditCostReduction));
          restored = true;
        }
      }
      if (typeof parsed.riskConcentration === 'number') {
        this.state.riskConcentration = parsed.riskConcentration;
        restored = true;
      }
      if (parsed.countryVolumes && typeof parsed.countryVolumes === 'object') {
        const normalizedVolumes = {};
        Object.entries(parsed.countryVolumes).forEach(([key, value]) => {
          if (typeof key === 'string') {
            normalizedVolumes[key.trim().toUpperCase()] = value;
          }
        });
        this.state.countryVolumes = normalizedVolumes;
        restored = true;
      }

      this.state.isDirty = false;
      return restored;
    } catch (e) {
      console.warn('restoreState failed:', e);
      return false;
    }
  }

  /* ------------------------------ Cleanup ---------------------------- */

  destroy() {
    if (this.weightsTimeout) clearTimeout(this.weightsTimeout);
    if (this.volumeTimeout) clearTimeout(this.volumeTimeout);
    if (this.strategyTimeout) clearTimeout(this.strategyTimeout);
    if (this.transparencyTimeout) clearTimeout(this.transparencyTimeout);
    if (this.responsivenessTimeout) clearTimeout(this.responsivenessTimeout);
    if (this.responsivenessEffectivenessTimeout) clearTimeout(this.responsivenessEffectivenessTimeout);
    if (this.focusTimeout) clearTimeout(this.focusTimeout);

    if (this.state.isDirty) this.saveState();
    if (this._wheelListenerAttached && this._wheelListenerTarget) {
      try {
        this._wheelListenerTarget.removeEventListener('wheel', this.handleWheelScroll);
      } catch (error) {
        // ignore if already removed
      }
      this._wheelListenerAttached = false;
      this._wheelListenerTarget = null;
    }
    this.removeMobileGestures();
    this.mainScrollElement = null;
    console.log('AppController cleaned up');
  }
}

export default AppController;