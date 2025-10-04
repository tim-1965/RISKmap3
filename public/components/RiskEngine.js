// RiskEngine.js - Enhanced with SAQ Coverage Constraint
export class RiskEngine {
  constructor() {
    // Step 1: Default weightings for the 5 input columns
    this.defaultWeights = [20, 20, 20, 20, 20]; // ITUC, Corruption, Freedom, WJP, Walkfree
    
    // Step 2: HRDD Strategy defaults - representing supplier base coverage percentages
    this.defaultHRDDStrategy = [10, 10, 25, 60, 80, 90]; // Coverage percentages: Worker voice is rare, trusting approaches are common
    this.defaultTransparencyEffectiveness = [90, 45, 25, 15, 12, 5]; // Base effectiveness rates

     // Step 3: Effectiveness defaults for sustained remedy and good conduct
    this.defaultResponsivenessStrategy = [35, 5, 20, 20, 10, 5]; // Effectiveness of each tool at delivering sustained remedy
    this.defaultResponsivenessEffectiveness = [75, 80, 35, 25, 15, 5]; // Effectiveness of each tool at promoting good conduct in percentages

    // Focus defaults for directing transparency/response capacity to higher-risk countries
    this.defaultFocus = 0.6;

    // MODIFIED: Further reduced parameters for stronger rank preservation
    this.focusBiasSettings = {
      minExponent: 1.0,
      maxExponent: 2.0, // Further reduced from 2.8 to 2.0
      minRiskRatio: 0.08, // Increased from 0.05 to 0.08
      maxRiskRatio: 2.5, // Further reduced from 4.0 to 2.5
      aggressionThreshold: 0.5
    };

    // Controls how strongly portfolio concentration amplifies focus-driven effectiveness gains
    this.focusConcentrationWeight = 2.75; // γ in mathematical specification
    
    // Resource conservation settings
    this.maxResourceExpansion = 0.3; // 30% maximum allowed resource increase

    // Strategy labels
    this.hrddStrategyLabels = [
      'Continuous Worker Voice',
      'Worker Surveys (periodic)',
      'Unannounced Social Audits',
      'Announced Social Audits',
      'Supplier SAQ with Evidence',
      'Supplier SAQ without Evidence'
    ];

    this.responsivenessLabels = [
      'Suppliers see risks and remedy-impact in realtime',
      'Binding Commercial Levers',
      'Corrective Action Plans with quarterly follow-up',
      'Supplier Development Programmes',
      'Industry Collaboration & Agreements',
      'Follow up only on crisis situations'
    ];
    
    // Risk band definitions
    this.riskBands = {
      'Low': { min: 0, max: 19.99, color: '#22c55e' }, // Green
      'Medium': { min: 20, max: 39.99, color: '#eab308' }, // Yellow
      'Medium High': { min: 40, max: 59.99, color: '#f97316' }, // Orange
      'High': { min: 60, max: 79.99, color: '#ef4444' }, // Red
      'Very High': { min: 80, max: 100, color: '#991b1b' } // Dark Red
    };
   }

  generateOptimizationStateHash(state) {
    const normalizeValue = (value) => {
      if (Array.isArray(value)) {
        return `[${value.map(normalizeValue).join(',')}]`;
      }

      if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map(key => `${key}:${normalizeValue(value[key])}`).join(',')}}`;
      }

      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) {
        return numberValue.toFixed(4);
      }

      if (value === null || value === undefined) {
        return 'null';
      }

      return String(value);
    };

    if (!state || typeof state !== 'object') {
      return 'invalid-state';
    }

    const parts = Object.keys(state)
      .sort()
      .map(key => `${key}:${normalizeValue(state[key])}`);

    return parts.join('|');
  }

  // MODIFIED: Further reduced maximum focus exponent for stronger rank preservation
  getFocusExponent(focus = 0) {
    const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const settings = this.focusBiasSettings || {};
    const minExp = Number.isFinite(settings.minExponent) ? settings.minExponent : 1.0;
    const maxExp = Number.isFinite(settings.maxExponent) ? Math.max(minExp, Math.min(2.0, settings.maxExponent)) : 2.0; // Further reduced to 2.0
    
    // Mathematical specification implementation with further reduced maximum
    if (safeFocus <= 0.5) {
      return minExp + safeFocus * (maxExp - minExp) * (safeFocus / 0.5);
    } else {
      const component = 0.5 + Math.pow(safeFocus - 0.5, 1.8) * 0.5;
      return minExp + (maxExp - minExp) * component;
    }
  }

  // MODIFIED: Enhanced compression for extreme cases with tightened parameters
  getBiasedRiskRatio(riskRatio, focus = 0, baselineRisk = 0, portfolioBaselineRisk = 0) {
    const settings = this.focusBiasSettings || {};
    const maxRatio = Number.isFinite(settings.maxRiskRatio) && settings.maxRiskRatio > 0
      ? settings.maxRiskRatio
      : 2.5; // Further reduced from 4.0
    const minRatio = Number.isFinite(settings.minRiskRatio) && settings.minRiskRatio >= 0
      ? settings.minRiskRatio
      : 0.08; // Increased from 0.05

    const clampedRatio = Math.min(
      maxRatio,
      Math.max(0, Number.isFinite(riskRatio) ? riskRatio : 0)
    );

    const exponent = this.getFocusExponent(focus);
    let biasedRatio = Math.pow(clampedRatio, exponent);
    
    // Apply bounds first
    biasedRatio = Math.max(minRatio, Math.min(maxRatio, biasedRatio));
    
    // Original compression for moderate focus
    if (focus > 0.6 && clampedRatio < 0.8) {
      const compressionFactor = 0.3 + 0.7 * Math.pow(clampedRatio, 2);
      biasedRatio *= compressionFactor;
    }
    
    // Enhanced compression for extreme cases (now with tighter bounds)
    if (focus > 0.7 && biasedRatio > 1.5) { // Reduced from 2.0 to 1.5
      const extremeCompressionFactor = 0.5 + 0.5 * Math.pow(1.5 / biasedRatio, 0.5); // Stronger compression
      biasedRatio *= extremeCompressionFactor;
    }

    return Math.max(minRatio, biasedRatio);
  }

  // Calculate portfolio focus multiplier exactly per specification
  calculatePortfolioFocusMultiplier(focus, riskConcentration) {
    const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const safeConcentration = Number.isFinite(riskConcentration) && riskConcentration >= 1 
      ? riskConcentration 
      : 1;
    const gamma = this.focusConcentrationWeight;
    
    // Mathematical specification: F₀ = (1 - f · γ) + f · γ · C
    return (1 - safeFocus * gamma) + safeFocus * gamma * safeConcentration;
  }

  // Calculate country-specific focus multiplier per specification
  calculateCountryFocusMultiplier(focus, portfolioFocusMultiplier, biasedRiskRatio, countryRisk) {
    const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const gamma = this.focusConcentrationWeight;
    
    // Mathematical specification:
    // If f > 0.6 AND bᵢ ≥ 70:
    //   Fᵢ = F₀ · [1 + (f-0.6) · 0.5]
    // Else:
    //   Fᵢ = (1 - f · γ) + f · γ · rᵢ'
    
    if (safeFocus > 0.6 && countryRisk >= 70) {
      const highRiskBonus = 1 + (safeFocus - 0.6) * 0.5;
      return portfolioFocusMultiplier * highRiskBonus;
    } else {
      return (1 - safeFocus * gamma) + safeFocus * gamma * biasedRiskRatio;
    }
  }

  // Calculate resource conservation factor
  calculateResourceConservationFactor(selectedCountries, countryVolumes, countryRisks, hrddStrategy, focus) {
    if (!Array.isArray(selectedCountries) || selectedCountries.length === 0) {
      return {};
    }

    const safeVolumes = (countryVolumes && typeof countryVolumes === 'object') ? countryVolumes : {};
    const safeRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};
    
    const portfolioMetrics = this.calculatePortfolioMetrics(selectedCountries, countryVolumes, countryRisks);
    const baselineRisk = portfolioMetrics.baselineRisk;
    
    if (baselineRisk <= 0) {
      const conservationFactors = {};
      selectedCountries.forEach(countryCode => {
        conservationFactors[countryCode] = 1.0;
      });
      return conservationFactors;
    }

    // Calculate expected vs actual resource usage per tool
    const conservationFactors = {};
    
    hrddStrategy.forEach((originalCoverage, toolIndex) => {
      let totalExpectedUsage = 0;
      let totalActualUsage = 0;
      let totalWeightedVolume = 0;
      
      selectedCountries.forEach(countryCode => {
        const countryRisk = safeRisks[countryCode] || 0;
        const countryVolume = safeVolumes[countryCode] || 10;
        const riskRatio = baselineRisk > 0 ? countryRisk / baselineRisk : 1;
        const biasedRiskRatio = this.getBiasedRiskRatio(riskRatio, focus, countryRisk, baselineRisk);
        
        // Basic coverage adjustment
        let riskAdjustmentFactor = (1 - focus) + focus * biasedRiskRatio;
        
        // MODIFIED: Gradual high-risk boost instead of sharp threshold
        if (focus > 0.3 && countryRisk >= 40) {
          const riskNormalized = Math.min(1, (countryRisk - 40) / 40); // 0 to 1 for risks 40-80
          const focusNormalized = Math.min(1, (focus - 0.3) / 0.7); // 0 to 1 for focus 0.3-1.0
          const boostFactor = 1 + (riskNormalized * focusNormalized * 0.3); // Max 30% boost
          riskAdjustmentFactor *= boostFactor;
        }
        
        const adjustedCoverage = originalCoverage * riskAdjustmentFactor;
        
        totalExpectedUsage += (originalCoverage / 100) * countryVolume;
        totalActualUsage += (adjustedCoverage / 100) * countryVolume;
        totalWeightedVolume += countryVolume;
      });
      
      // Calculate allowed expansion
      const maxAllowedExpansion = 1 + focus * this.maxResourceExpansion;
      const maxAllowedUsage = totalExpectedUsage * maxAllowedExpansion;
      
      // Calculate conservation factor for this tool
      const toolConservationFactor = totalActualUsage > maxAllowedUsage && totalActualUsage > 0
        ? maxAllowedUsage / totalActualUsage
        : 1.0;
      
      // Apply to each country
      selectedCountries.forEach(countryCode => {
        if (!conservationFactors[countryCode]) {
          conservationFactors[countryCode] = [];
        }
        conservationFactors[countryCode][toolIndex] = toolConservationFactor;
      });
    });
    
    return conservationFactors;
  }

  // MODIFIED: Country-specific coverage calculation with gradual boost
  calculateCountrySpecificCoverage(selectedCountries, countryVolumes, countryRisks, hrddStrategy, focus = 0.6) {
    if (!Array.isArray(selectedCountries) || selectedCountries.length === 0) {
      return {};
    }

    const safeVolumes = (countryVolumes && typeof countryVolumes === 'object') ? countryVolumes : {};
    const safeRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};
    const safeFocus = Math.max(0, Math.min(1, focus || 0));
    
    const portfolioMetrics = this.calculatePortfolioMetrics(selectedCountries, countryVolumes, countryRisks);
    const baselineRisk = portfolioMetrics.baselineRisk;
    
    if (baselineRisk <= 0) {
      const evenCoverage = {};
      selectedCountries.forEach(countryCode => {
        evenCoverage[countryCode] = [...hrddStrategy];
      });
      return evenCoverage;
    }

    // Calculate resource conservation factors
    const resourceConservationFactors = this.calculateResourceConservationFactor(
      selectedCountries, countryVolumes, countryRisks, hrddStrategy, safeFocus
    );

    const countrySpecificCoverage = {};
    
    selectedCountries.forEach(countryCode => {
      const countryRisk = safeRisks[countryCode] || 0;
      const countryVolume = safeVolumes[countryCode] || 10;
      
      // Calculate biased risk ratio
      const rawRiskRatio = baselineRisk > 0 ? countryRisk / baselineRisk : 1;
      const biasedRiskRatio = this.getBiasedRiskRatio(rawRiskRatio, safeFocus, countryRisk, baselineRisk);
      
      // Mathematical specification: cᵢⱼ = cⱼ · [(1-f) + f · rᵢ'] · ηᵢ
      const baseCoverageAdjustment = (1 - safeFocus) + safeFocus * biasedRiskRatio;
      
      const adjustedCoverage = hrddStrategy.map((toolCoverage, toolIndex) => {
        // Apply base coverage adjustment
        let adjustedValue = toolCoverage * baseCoverageAdjustment;
        
        // MODIFIED: Apply gradual high-risk boost instead of sharp threshold
        if (safeFocus > 0.3 && countryRisk >= 40) {
          const riskNormalized = Math.min(1, (countryRisk - 40) / 40); // 0 to 1 for risks 40-80
          const focusNormalized = Math.min(1, (safeFocus - 0.3) / 0.7); // 0 to 1 for focus 0.3-1.0
          const boostFactor = 1 + (riskNormalized * focusNormalized * 0.3); // Max 30% boost (reduced from 80%)
          adjustedValue *= boostFactor;
        }
        
        // Apply resource conservation factor (ηᵢ)
        const conservationFactor = resourceConservationFactors[countryCode] && 
                                  resourceConservationFactors[countryCode][toolIndex]
          ? resourceConservationFactors[countryCode][toolIndex]
          : 1.0;
        
        adjustedValue *= conservationFactor;
        
        return Math.max(0, Math.min(100, adjustedValue));
      });
      
      countrySpecificCoverage[countryCode] = adjustedCoverage;
    });
    
    return countrySpecificCoverage;
  }

  // MODIFIED: Strengthened progressive effectiveness cap for better rank preservation
  calculateProgressiveEffectivenessCap(countryRisk) {
    // Higher risk countries have much lower maximum reduction percentages to preserve ranking
    const baselineNormalized = Math.min(1, Math.max(0, countryRisk / 100)); // 0 to 1
    
    // Strengthened progressive cap: High-risk countries (80+) max 50% reduction, low-risk countries (20-) max 70% reduction
    const minCap = 0.50; // Strengthened from 0.65 to 0.50
    const maxCap = 0.70; // Strengthened from 0.85 to 0.70
    
    return maxCap - (maxCap - minCap) * (baselineNormalized);
  }

  // Calculate focus effectiveness metrics across risk tiers
  calculateFocusEffectivenessMetrics(selectedCountries, countryRisks, managedRisks, focus = 0) {
    if (!Array.isArray(selectedCountries) || selectedCountries.length === 0) {
      return {
        highRiskCountries: 0,
        mediumRiskCountries: 0,
        lowRiskCountries: 0,
        avgReductionHigh: 0,
        avgReductionMedium: 0,
        avgReductionLow: 0,
        focusEffectiveness: 0,
        differentialBenefit: 0
      };
    }

    const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};
    const safeManagedRisks = (managedRisks && typeof managedRisks === 'object') ? managedRisks : {};

    const riskData = selectedCountries.map(countryCode => {
      const baselineRisk = safeCountryRisks[countryCode] || 0;
      const managedRisk = safeManagedRisks[countryCode] || baselineRisk;
      const reduction = baselineRisk - managedRisk;
      const reductionPercentage = baselineRisk > 0 ? (reduction / baselineRisk) * 100 : 0;
      
      return {
        countryCode,
        baselineRisk,
        managedRisk,
        reduction,
        reductionPercentage,
        riskTier: baselineRisk >= 60 ? 'high' : baselineRisk >= 40 ? 'medium' : 'low'
      };
    });

    const highRiskCountries = riskData.filter(d => d.riskTier === 'high');
    const mediumRiskCountries = riskData.filter(d => d.riskTier === 'medium');
    const lowRiskCountries = riskData.filter(d => d.riskTier === 'low');

    const avgReductionHigh = highRiskCountries.length > 0 ?
      highRiskCountries.reduce((sum, d) => sum + d.reductionPercentage, 0) / highRiskCountries.length : 0;
    const avgReductionMedium = mediumRiskCountries.length > 0 ?
      mediumRiskCountries.reduce((sum, d) => sum + d.reductionPercentage, 0) / mediumRiskCountries.length : 0;
    const avgReductionLow = lowRiskCountries.length > 0 ?
      lowRiskCountries.reduce((sum, d) => sum + d.reductionPercentage, 0) / lowRiskCountries.length : 0;

    const differentialBenefit = avgReductionHigh - avgReductionLow;
    const maxPossibleDifferential = focus * 50;
    const focusEffectiveness = maxPossibleDifferential > 0 ? 
      Math.min(100, (differentialBenefit / maxPossibleDifferential) * 100) : 0;

    return {
      highRiskCountries: highRiskCountries.length,
      mediumRiskCountries: mediumRiskCountries.length,
      lowRiskCountries: lowRiskCountries.length,
      avgReductionHigh,
      avgReductionMedium,
      avgReductionLow,
      focusEffectiveness,
      differentialBenefit,
      riskData,
      focus
    };
  }

  // Get focus benefit classification for individual countries
  getFocusBenefitLevel(countryRisk, baselineRisk, focus) {
    if (focus < 0.3) return 'standard';
    
    const riskRatio = baselineRisk > 0 ? countryRisk / baselineRisk : 1;
    const biasedRatio = this.getBiasedRiskRatio(riskRatio, focus, countryRisk, baselineRisk);
    
    if (biasedRatio > 1.5) return 'high';
    if (biasedRatio > 1.1) return 'medium';
    if (biasedRatio < 0.7) return 'reduced';
    return 'standard';
  }

  // MODIFIED: Managed risk calculation with rank preservation mechanisms
  calculateManagedRiskDetails(
    selectedCountries,
    countryVolumes,
    countryRisks,
    hrddStrategy,
    transparencyEffectiveness,
    responsivenessStrategy,
    responsivenessEffectiveness,
    focus = this.defaultFocus ?? 0
  ) {
    const safeSelected = Array.isArray(selectedCountries) ? selectedCountries : [];
    if (safeSelected.length === 0) {
      const sanitizedFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
      return {
        managedRisk: 0,
        baselineRisk: 0,
        riskConcentration: 1,
        portfolioFocusMultiplier: this.calculatePortfolioFocusMultiplier(sanitizedFocus, 1),
        combinedEffectiveness: 0,
        countryManagedRisks: {},
        countrySpecificCoverage: {},
        focusEffectivenessMetrics: this.calculateFocusEffectivenessMetrics([], {}, {}, sanitizedFocus)
      };
    }

    const metrics = this.calculatePortfolioMetrics(safeSelected, countryVolumes, countryRisks);
    const baselineRisk = metrics.baselineRisk;
    const sanitizedFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const sanitizedConcentration = Number.isFinite(metrics.riskConcentration) && metrics.riskConcentration > 0
      ? Math.max(1, metrics.riskConcentration)
      : 1;

    // Calculate portfolio focus multiplier per specification
    const portfolioFocusMultiplier = this.calculatePortfolioFocusMultiplier(sanitizedFocus, sanitizedConcentration);

    // Calculate country-specific coverage distribution
    const countrySpecificCoverage = this.calculateCountrySpecificCoverage(
      safeSelected, countryVolumes, countryRisks, hrddStrategy, sanitizedFocus
    );

     // Calculate sustained remedy and good conduct effectiveness
    const sustainedRemedyOutcome = this.calculateSustainedRemedyEffectiveness(
      hrddStrategy,
      responsivenessStrategy,
      {
        selectedCountries: safeSelected,
        countryVolumes,
        countrySpecificCoverage
      }
    );

    const goodConductOutcome = this.calculateGoodConductEffectiveness(
      hrddStrategy,
      responsivenessEffectiveness,
      {
        selectedCountries: safeSelected,
        countryVolumes,
        countrySpecificCoverage
      }
    );

    const combinedBehaviourEffectiveness = this.combineBehaviourEffectiveness(
      sustainedRemedyOutcome.overall,
      goodConductOutcome.overall
    );

    // MODIFIED: Calculate country-specific managed risks with rank preservation
    const managedRisksByCountry = {};
    const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};
    let totalWeightedManagedRisk = 0;
    let totalVolume = 0;

    safeSelected.forEach(countryCode => {
      const countryRisk = Number.isFinite(safeCountryRisks[countryCode]) ? safeCountryRisks[countryCode] : 0;
      const countryVolume = Number.isFinite(countryVolumes?.[countryCode]) ? countryVolumes[countryCode] : 10;

      if (countryRisk <= 0) {
        managedRisksByCountry[countryCode] = 0;
        totalVolume += countryVolume;
        return;
      }

      // Calculate country-specific transparency
      const countryTransparency = this.calculateCountryTransparencyEffectiveness(
        countrySpecificCoverage, transparencyEffectiveness, countryCode
      );
      
      // Calculate country-specific focus multiplier
      const riskRatio = baselineRisk > 0 ? countryRisk / baselineRisk : 1;
      const biasedRiskRatio = this.getBiasedRiskRatio(riskRatio, sanitizedFocus, countryRisk, baselineRisk);
      const countryFocusMultiplier = this.calculateCountryFocusMultiplier(
        sanitizedFocus, portfolioFocusMultiplier, biasedRiskRatio, countryRisk
      );
      
      // Calculate base reduction factor
      const baseReductionFactor = countryTransparency * combinedBehaviourEffectiveness * countryFocusMultiplier;
      
      // NEW: Apply progressive effectiveness cap to preserve ranking
      const effectivenessCap = this.calculateProgressiveEffectivenessCap(countryRisk);
      const cappedReductionFactor = Math.min(baseReductionFactor, effectivenessCap);
      
      // Calculate managed risk
      let managedValue = Math.max(0, countryRisk * (1 - cappedReductionFactor));
      
      // MODIFIED: Increased risk floor to prevent extreme reductions
      const riskFloor = countryRisk * 0.25; // Increased from 0.12 to 0.25 (25% minimum retention)
      managedValue = Math.max(managedValue, riskFloor);
      
      managedRisksByCountry[countryCode] = managedValue;
      totalWeightedManagedRisk += managedValue * countryVolume;
      totalVolume += countryVolume;
    });

    // Mathematical specification: M = (Σᵢ wᵢ · mᵢ) / Σᵢ wᵢ
    const managedRisk = totalVolume > 0 ? totalWeightedManagedRisk / totalVolume : 0;

    // NEW: Direct rank preservation constraint to prevent any inversions
    const sortedCountries = safeSelected
      .map(code => ({ 
        code, 
        baseline: safeCountryRisks[code] || 0, 
        managed: managedRisksByCountry[code] || 0,
        volume: Number.isFinite(countryVolumes?.[code]) ? countryVolumes[code] : 10
      }))
      .sort((a, b) => b.baseline - a.baseline); // Sort by baseline risk descending

    // Ensure no rank inversions: each country must have managed risk >= next country + 0.5
    let totalWeightedManagedRiskCorrected = 0;
    let totalVolumeCorrected = 0;
    
    for (let i = 1; i < sortedCountries.length; i++) {
      const current = sortedCountries[i];
      const previous = sortedCountries[i-1];
      
      if (current.managed >= previous.managed) {
        // Force current country to have lower managed risk than previous
        const correctedManagedRisk = Math.max(
          current.baseline * 0.25, // Still respect the 25% floor
          previous.managed - 0.5    // But ensure it's lower than the previous
        );
        managedRisksByCountry[current.code] = correctedManagedRisk;
        current.managed = correctedManagedRisk;
      }
    }
    
    // Recalculate portfolio managed risk with corrected values
    safeSelected.forEach(countryCode => {
      const countryVolume = Number.isFinite(countryVolumes?.[countryCode]) ? countryVolumes[countryCode] : 10;
      const managedValue = managedRisksByCountry[countryCode] || 0;
      totalWeightedManagedRiskCorrected += managedValue * countryVolume;
      totalVolumeCorrected += countryVolume;
    });
    
    const finalManagedRisk = totalVolumeCorrected > 0 ? totalWeightedManagedRiskCorrected / totalVolumeCorrected : managedRisk;

    // Calculate transparency using country-specific coverage
    const overallTransparencyEffectiveness = this.calculateTransparencyEffectiveness(
      hrddStrategy, transparencyEffectiveness, safeSelected, countryVolumes, countryRisks, sanitizedFocus
    );
    
    const combinedEffectiveness = overallTransparencyEffectiveness * combinedBehaviourEffectiveness;

    const stageBreakdown = this.calculateStageBreakdown(
      baselineRisk,
      finalManagedRisk,
      overallTransparencyEffectiveness,
      sustainedRemedyOutcome.overall,
      goodConductOutcome.overall,
      portfolioFocusMultiplier
    );

    // Calculate focus effectiveness metrics
    const focusEffectivenessMetrics = this.calculateFocusEffectivenessMetrics(
      safeSelected, safeCountryRisks, managedRisksByCountry, sanitizedFocus
    );

    return {
      managedRisk: finalManagedRisk,
      baselineRisk,
      riskConcentration: sanitizedConcentration,
      portfolioFocusMultiplier,
      combinedEffectiveness,
      sustainedRemedyEffectiveness: sustainedRemedyOutcome.overall,
      goodConductEffectiveness: goodConductOutcome.overall,
      sustainedRemedyDetails: sustainedRemedyOutcome.details,
      goodConductDetails: goodConductOutcome.details,
      countryManagedRisks: managedRisksByCountry,
      countrySpecificCoverage,
      focusEffectivenessMetrics,
      stageBreakdown
    };
  }


  // Rest of the existing methods remain the same...
  getFocusWeight() {
    return Number.isFinite(this.focusConcentrationWeight)
      ? Math.max(0, Math.min(100, this.focusConcentrationWeight))
      : 2.75;
  }

  normalizeEffectivenessValue(value) {
    if (value === null || value === undefined) {
      return 0;
    }

    const numericValue = typeof value === 'string'
      ? parseFloat(value)
      : value;

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    if (numericValue <= 0) {
      return 0;
    }

    if (numericValue >= 1) {
      return Math.min(1, numericValue / 100);
    }

    return Math.max(0, numericValue);
  }

  // Step 1: Calculate weighted risk score for a country
  calculateWeightedRisk(countryData, weights = this.defaultWeights) {
    const values = [
      countryData.itucRightsRating,
      countryData.corruptionIndex,
      countryData.freedomRating,
      countryData.wjpIndex,
      countryData.walkfreeSlaveryIndex
    ];

    let weightedSum = 0;
    let totalWeight = 0;

    // Only include values that are greater than 0 (ignore zero values)
    for (let i = 0; i < values.length; i++) {
      if (values[i] > 0) {
        weightedSum += values[i] * weights[i];
        totalWeight += weights[i];
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  // Step 1: Calculate portfolio risk metrics including baseline risk and concentration factor
  calculatePortfolioMetrics(selectedCountries, countryVolumes, countryRisks) {
    if (!Array.isArray(selectedCountries) || selectedCountries.length === 0) {
      return {
        baselineRisk: 0,
        totalVolume: 0,
        weightedRisk: 0,
        weightedRiskSquares: 0,
        riskConcentration: 1
      };
    }

    const safeVolumes = (countryVolumes && typeof countryVolumes === 'object') ? countryVolumes : {};
    const safeRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};

    const portfolioEntries = [];
    let totalVolumeRisk = 0;
    let totalVolume = 0;

    selectedCountries.forEach(countryCode => {
      const volume = typeof safeVolumes[countryCode] === 'number' ? safeVolumes[countryCode] : 10;
      const risk = typeof safeRisks[countryCode] === 'number' ? safeRisks[countryCode] : 0;

      totalVolumeRisk += volume * risk;
      totalVolume += volume;
      portfolioEntries.push({ countryCode, volume, risk });
    });

    const baselineRisk = totalVolume > 0 ? totalVolumeRisk / totalVolume : 0;

    let weightedRiskSquares = 0;
    if (totalVolume > 0) {
      portfolioEntries.forEach(entry => {
        const share = entry.volume / totalVolume;
        weightedRiskSquares += share * Math.pow(entry.risk || 0, 2);
      });
    }

    const riskConcentration = baselineRisk > 0 && weightedRiskSquares > 0
      ? Math.max(1, weightedRiskSquares / Math.pow(baselineRisk, 2))
      : 1;

    return {
      baselineRisk,
      totalVolume,
      weightedRisk: totalVolumeRisk,
      weightedRiskSquares,
      riskConcentration
    };
  }

  // Step 1: Calculate baseline risk for portfolio (sumproduct of volumes and risks)
  calculateBaselineRisk(selectedCountries, countryVolumes, countryRisks) {
    return this.calculatePortfolioMetrics(selectedCountries, countryVolumes, countryRisks).baselineRisk;
  }

  // Step 1: Generate a detailed baseline summary for the current selection
  generateBaselineSummary(selectedCountries, countries, countryRisks, countryVolumes) {
    const safeSelected = Array.isArray(selectedCountries)
      ? selectedCountries
        .map(code => typeof code === 'string' ? code.trim().toUpperCase() : '')
        .filter(Boolean)
      : [];

    const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};
    const safeCountryVolumes = (countryVolumes && typeof countryVolumes === 'object') ? countryVolumes : {};
    const safeCountryList = Array.isArray(countries) ? countries : [];

    const countryLookup = safeCountryList.reduce((acc, country) => {
      if (country && typeof country.isoCode === 'string') {
        acc[country.isoCode.toUpperCase()] = country;
      }
      return acc;
    }, {});

    if (safeSelected.length === 0) {
      return {
        baselineRisk: 0,
        riskBand: this.getRiskBand(0),
        riskColor: this.getRiskColor(0),
        portfolio: {
          countriesSelected: 0,
          totalVolume: 0,
          averageRisk: 0,
          riskConcentration: 1,
          weightedRisk: 0
        },
        distribution: {
          byBand: {},
          statistics: {
            minRisk: 0,
            maxRisk: 0,
            averageRisk: 0,
            medianRisk: 0
          }
        },
        countries: [],
        highlights: {
          topRiskCountries: [],
          topVolumeCountries: []
        }
      };
    }

    const metrics = this.calculatePortfolioMetrics(safeSelected, countryVolumes, countryRisks);
    const baselineRisk = Number.isFinite(metrics?.baselineRisk) ? metrics.baselineRisk : 0;
    const totalVolume = Number.isFinite(metrics?.totalVolume) ? metrics.totalVolume : 0;
    const riskConcentration = Number.isFinite(metrics?.riskConcentration) && metrics.riskConcentration > 0
      ? metrics.riskConcentration
      : 1;

    const countryBreakdown = safeSelected.map(code => {
      const risk = Number.isFinite(safeCountryRisks[code]) ? safeCountryRisks[code] : 0;
      const volume = typeof safeCountryVolumes[code] === 'number' ? safeCountryVolumes[code] : 10;
      const countryInfo = countryLookup[code] || {};
      const portfolioShare = totalVolume > 0 ? (volume / totalVolume) * 100 : 0;
      const band = this.getRiskBand(risk);

      return {
        isoCode: code,
        name: typeof countryInfo.name === 'string' ? countryInfo.name : code,
        region: countryInfo.region || countryInfo.subRegion || null,
        risk,
        riskBand: band,
        riskColor: this.getRiskColor(risk),
        volume,
        portfolioShare
      };
    });

    const sortedByRisk = [...countryBreakdown].sort((a, b) => (b.risk || 0) - (a.risk || 0));
    const sortedByVolume = [...countryBreakdown].sort((a, b) => (b.volume || 0) - (a.volume || 0));

    const riskValues = sortedByRisk.map(entry => Number.isFinite(entry.risk) ? entry.risk : 0);
    const riskCount = riskValues.length;
    const sumRisk = riskValues.reduce((sum, value) => sum + value, 0);
    const averageRisk = riskCount > 0 ? sumRisk / riskCount : 0;
    const sortedRiskValues = [...riskValues].sort((a, b) => a - b);
    let medianRisk = 0;
    if (sortedRiskValues.length > 0) {
      const mid = Math.floor(sortedRiskValues.length / 2);
      medianRisk = sortedRiskValues.length % 2 === 0
        ? (sortedRiskValues[mid - 1] + sortedRiskValues[mid]) / 2
        : sortedRiskValues[mid];
    }

    const riskBandCounts = countryBreakdown.reduce((acc, entry) => {
      const band = entry.riskBand || 'Unknown';
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    }, {});

    return {
      baselineRisk,
      riskBand: this.getRiskBand(baselineRisk),
      riskColor: this.getRiskColor(baselineRisk),
      portfolio: {
        countriesSelected: safeSelected.length,
        totalVolume,
        averageRisk: baselineRisk,
        riskConcentration,
        weightedRisk: Number.isFinite(metrics?.weightedRisk) ? metrics.weightedRisk : 0,
        weightedRiskSquares: Number.isFinite(metrics?.weightedRiskSquares) ? metrics.weightedRiskSquares : 0
      },
      distribution: {
        byBand: riskBandCounts,
        statistics: {
          minRisk: sortedRiskValues.length > 0 ? sortedRiskValues[0] : 0,
          maxRisk: sortedRiskValues.length > 0 ? sortedRiskValues[sortedRiskValues.length - 1] : 0,
          averageRisk,
          medianRisk
        }
      },
      countries: sortedByRisk,
      highlights: {
        topRiskCountries: sortedByRisk.slice(0, 5),
        topVolumeCountries: sortedByVolume.slice(0, 5)
      }
    };
  }

  // Calculate country-specific transparency using distributed coverage
  calculateCountryTransparencyEffectiveness(countrySpecificCoverage, transparencyEffectiveness, countryCode) {
    const countryCoverage = countrySpecificCoverage[countryCode];
    if (!countryCoverage || !Array.isArray(countryCoverage)) {
      return 0;
    }

    if (!this.validateHRDDStrategy(countryCoverage) || !this.validateTransparency(transparencyEffectiveness)) {
      return 0;
    }

    const toolCategories = [
      {
        name: 'Worker Voice',
        tools: [0, 1],
        baseEffectiveness: [0.90, 0.45],
        categoryWeight: 1.0
      },
      {
        name: 'Audit',
        tools: [2, 3],
        baseEffectiveness: [0.25, 0.15],
        categoryWeight: 0.85
      },
      {
        name: 'SAQ',
        tools: [4, 5],
        baseEffectiveness: [0.12, 0.05],
        categoryWeight: 0.70
      }
    ];

    const maxTransparency = 0.90;
    let combinedTransparency = 0;

    toolCategories.forEach(category => {
      let categoryTransparency = 0;
      let categoryProduct = 1;

      category.tools.forEach((toolIndex, i) => {
        const coverage = Math.max(0, Math.min(100, countryCoverage[toolIndex] || 0)) / 100;
        const baseEff = category.baseEffectiveness[i];
        const userEff = Math.max(0, Math.min(100, transparencyEffectiveness[toolIndex] || 0)) / 100;
        
        const effectiveRate = (baseEff + userEff) / 2;
        categoryProduct *= (1 - coverage * effectiveRate);
      });

      categoryTransparency = 1 - categoryProduct;
      combinedTransparency = 1 - (1 - combinedTransparency) * (1 - categoryTransparency * category.categoryWeight);
    });

    return Math.min(combinedTransparency, maxTransparency);
  }

  // Calculate overall transparency effectiveness using country-specific coverage
  calculateTransparencyEffectiveness(hrddCoverage, transparencyEffectiveness, selectedCountries = null, countryVolumes = null, countryRisks = null, focus = 0.6) {
    if (!selectedCountries || !countryVolumes || !countryRisks) {
      return this.calculateOriginalTransparencyEffectiveness(hrddCoverage, transparencyEffectiveness);
    }

    const countrySpecificCoverage = this.calculateCountrySpecificCoverage(
      selectedCountries, countryVolumes, countryRisks, hrddCoverage, focus
    );

    if (Object.keys(countrySpecificCoverage).length === 0) {
      return 0;
    }

    const safeVolumes = (countryVolumes && typeof countryVolumes === 'object') ? countryVolumes : {};
    let totalWeightedTransparency = 0;
    let totalVolume = 0;

    selectedCountries.forEach(countryCode => {
      const volume = safeVolumes[countryCode] || 10;
      const countryTransparency = this.calculateCountryTransparencyEffectiveness(
        countrySpecificCoverage, transparencyEffectiveness, countryCode
      );
      
      totalWeightedTransparency += countryTransparency * volume;
      totalVolume += volume;
    });

    return totalVolume > 0 ? totalWeightedTransparency / totalVolume : 0;
  }

  // Original transparency calculation method (kept for backward compatibility)
  calculateOriginalTransparencyEffectiveness(hrddCoverage, transparencyEffectiveness) {
    if (!this.validateHRDDStrategy(hrddCoverage) || !this.validateTransparency(transparencyEffectiveness)) {
      return 0;
    }

    const toolCategories = [
      {
        name: 'Worker Voice',
        tools: [0, 1],
        baseEffectiveness: [0.90, 0.45],
        categoryWeight: 1.0
      },
      {
        name: 'Audit',
        tools: [2, 3],
        baseEffectiveness: [0.25, 0.15],
        categoryWeight: 0.85
      },
      {
        name: 'SAQ',
        tools: [4, 5],
        baseEffectiveness: [0.12, 0.05],
        categoryWeight: 0.70
      }
    ];

    const maxTransparency = 0.90;
    let combinedTransparency = 0;

    toolCategories.forEach(category => {
      let categoryTransparency = 0;
      let categoryProduct = 1;

      category.tools.forEach((toolIndex, i) => {
        const coverage = Math.max(0, Math.min(100, hrddCoverage[toolIndex] || 0)) / 100;
        const baseEff = category.baseEffectiveness[i];
        const userEff = Math.max(0, Math.min(100, transparencyEffectiveness[toolIndex] || 0)) / 100;
        
        const effectiveRate = (baseEff + userEff) / 2;
        categoryProduct *= (1 - coverage * effectiveRate);
      });

      categoryTransparency = 1 - categoryProduct;
      combinedTransparency = 1 - (1 - combinedTransparency) * (1 - categoryTransparency * category.categoryWeight);
    });

    return Math.min(combinedTransparency, maxTransparency);
  }

  // Step 3: Calculate outcome effectiveness for a set of tools (sustained remedy or good conduct)
  calculateToolOutcomeEffectiveness(
    hrddStrategy,
    outcomeEffectiveness,
    selectedCountries = null,
    countryVolumes = null,
    countrySpecificCoverage = null
  ) {
    const toolLabels = Array.isArray(this.hrddStrategyLabels) ? this.hrddStrategyLabels : [];
    const safeStrategy = Array.isArray(hrddStrategy) ? hrddStrategy : [];
    const safeEffectiveness = Array.isArray(outcomeEffectiveness) ? outcomeEffectiveness : [];
    const toolCount = Math.max(toolLabels.length, safeStrategy.length, safeEffectiveness.length);

    if (toolCount === 0) {
      return {
        overall: 0,
        totalCoverageWeight: 0,
        totalWeightedEffect: 0,
        details: []
      };
    }

    const sanitizedSelected = Array.isArray(selectedCountries)
      ? selectedCountries.filter(code => typeof code === 'string' && code.length > 0)
      : [];

    const coverageFractions = new Array(toolCount).fill(0);
    const coverageAverages = new Array(toolCount).fill(0);

    if (sanitizedSelected.length > 0 && countryVolumes && countrySpecificCoverage) {
      let totalVolume = 0;

      sanitizedSelected.forEach(countryCode => {
        const volume = Number.isFinite(countryVolumes?.[countryCode]) ? Math.max(0, countryVolumes[countryCode]) : 0;
        totalVolume += volume;
      });

      const effectiveTotalVolume = totalVolume > 0 ? totalVolume : 0;

      for (let i = 0; i < toolCount; i += 1) {
        let weightedCoverageSum = 0;

        sanitizedSelected.forEach(countryCode => {
          const volume = Number.isFinite(countryVolumes?.[countryCode]) ? Math.max(0, countryVolumes[countryCode]) : 0;
          if (volume <= 0) return;

          const fallbackCoverage = Number.isFinite(safeStrategy[i]) ? Math.max(0, safeStrategy[i]) : 0;
          const countryCoverage = Number.isFinite(countrySpecificCoverage?.[countryCode]?.[i])
            ? Math.max(0, countrySpecificCoverage[countryCode][i])
            : fallbackCoverage;

          weightedCoverageSum += volume * Math.max(0, Math.min(100, countryCoverage));
        });

        if (effectiveTotalVolume > 0) {
          const averageCoverage = weightedCoverageSum / effectiveTotalVolume;
          coverageAverages[i] = Math.max(0, Math.min(100, averageCoverage));
          coverageFractions[i] = Math.max(0, coverageAverages[i] / 100);
        } else {
          const baseCoverage = Number.isFinite(safeStrategy[i]) ? Math.max(0, Math.min(100, safeStrategy[i])) : 0;
          coverageAverages[i] = baseCoverage;
          coverageFractions[i] = baseCoverage / 100;
        }
      }
    } else {
      for (let i = 0; i < toolCount; i += 1) {
        const baseCoverage = Number.isFinite(safeStrategy[i]) ? Math.max(0, Math.min(100, safeStrategy[i])) : 0;
        coverageAverages[i] = baseCoverage;
        coverageFractions[i] = baseCoverage / 100;
      }
    }

    let totalCoverageWeight = 0;
    let totalWeightedEffect = 0;

    const details = new Array(toolCount).fill(null).map((_, index) => {
      const label = toolLabels[index] || `Tool ${index + 1}`;
      const coveragePercent = coverageAverages[index] || 0;
      const coverageFraction = Math.max(0, coverageFractions[index] || 0);
      const effectivenessValue = Number.isFinite(safeEffectiveness[index])
        ? Math.max(0, Math.min(100, safeEffectiveness[index]))
        : 0;
      const effectivenessFraction = effectivenessValue / 100;
      const weightedEffect = coverageFraction * effectivenessFraction;

      totalCoverageWeight += coverageFraction;
      totalWeightedEffect += weightedEffect;

      return {
        index,
        name: label,
        coverage: coveragePercent,
        effectiveness: effectivenessValue,
        coverageFraction,
        weightedEffect
      };
    });

    const overall = totalCoverageWeight > 0
      ? totalWeightedEffect / totalCoverageWeight
      : 0;

    return {
      overall,
      totalCoverageWeight,
      totalWeightedEffect,
      details
    };
  }

  calculateSustainedRemedyEffectiveness(
    hrddStrategy,
    sustainedRemedyEffectiveness,
    {
      selectedCountries = null,
      countryVolumes = null,
      countrySpecificCoverage = null
    } = {}
  ) {
    return this.calculateToolOutcomeEffectiveness(
      hrddStrategy,
      sustainedRemedyEffectiveness,
      selectedCountries,
      countryVolumes,
      countrySpecificCoverage
    );
  }

  calculateGoodConductEffectiveness(
    hrddStrategy,
    conductEffectiveness,
    {
      selectedCountries = null,
      countryVolumes = null,
      countrySpecificCoverage = null
    } = {}
  ) {
    return this.calculateToolOutcomeEffectiveness(
      hrddStrategy,
      conductEffectiveness,
      selectedCountries,
      countryVolumes,
      countrySpecificCoverage
    );
  }

  combineBehaviourEffectiveness(sustainedRemedy, goodConduct) {
    const remedyValue = Number.isFinite(sustainedRemedy) ? Math.max(0, Math.min(1, sustainedRemedy)) : 0;
    const conductValue = Number.isFinite(goodConduct) ? Math.max(0, Math.min(1, goodConduct)) : 0;

    if (remedyValue === 0 && conductValue === 0) {
      return 0;
    }

    return (remedyValue + conductValue) / 2;
  }

  calculateStageBreakdown(
    baselineRisk,
    managedRisk,
    overallTransparency,
    sustainedRemedyEffectiveness,
    goodConductEffectiveness,
    focusMultiplier
  ) {
    const baselineValue = Number.isFinite(baselineRisk) ? baselineRisk : 0;
    const managedValue = Number.isFinite(managedRisk) ? managedRisk : 0;
    const transparencyValue = Number.isFinite(overallTransparency)
      ? Math.max(0, Math.min(1, overallTransparency))
      : 0;
    const remedyValue = Number.isFinite(sustainedRemedyEffectiveness)
      ? Math.max(0, Math.min(1, sustainedRemedyEffectiveness))
      : 0;
    const conductValue = Number.isFinite(goodConductEffectiveness)
      ? Math.max(0, Math.min(1, goodConductEffectiveness))
      : 0;
    const sanitizedFocusMultiplier = Number.isFinite(focusMultiplier) && focusMultiplier > 0
      ? focusMultiplier
      : 1;

    const totalReduction = baselineValue - managedValue;
    const baseReduction = sanitizedFocusMultiplier !== 0
      ? totalReduction / sanitizedFocusMultiplier
      : 0;
    const focusStageReduction = totalReduction - baseReduction;

    const stageWeightSum = transparencyValue + remedyValue + conductValue;
    const detectionWeight = stageWeightSum > 0 ? transparencyValue / stageWeightSum : 1 / 3;
    const remedyWeight = stageWeightSum > 0 ? remedyValue / stageWeightSum : 1 / 3;
    const conductWeight = stageWeightSum > 0 ? conductValue / stageWeightSum : 1 / 3;

    const detectionStageReduction = baseReduction * detectionWeight;
    const remedyStageReduction = baseReduction * remedyWeight;
    const conductStageReduction = baseReduction - detectionStageReduction - remedyStageReduction;

    const riskAfterDetection = baselineValue - detectionStageReduction;
    const riskAfterRemedy = riskAfterDetection - remedyStageReduction;
    const riskAfterConduct = riskAfterRemedy - conductStageReduction;

    const getPercentOfBaseline = (value) => baselineValue > 0 ? value / baselineValue : 0;
    const getShareOfTotal = (value) => totalReduction !== 0 ? value / totalReduction : 0;

    return {
      baseline: baselineValue,
      final: managedValue,
      afterDetection: riskAfterDetection,
      afterRemedy: riskAfterRemedy,
      afterConduct: riskAfterConduct,
      totalReduction,
      baseReduction,
      focusReduction: focusStageReduction,
      focusMultiplier: sanitizedFocusMultiplier,
      weights: {
        detection: detectionWeight,
        sustainedRemedy: remedyWeight,
        conduct: conductWeight
      },
      detection: {
        reduction: detectionStageReduction,
        percentOfBaseline: getPercentOfBaseline(detectionStageReduction),
        shareOfTotal: getShareOfTotal(detectionStageReduction)
      },
      sustainedRemedy: {
        reduction: remedyStageReduction,
        percentOfBaseline: getPercentOfBaseline(remedyStageReduction),
        shareOfTotal: getShareOfTotal(remedyStageReduction)
      },
      conduct: {
        reduction: conductStageReduction,
        percentOfBaseline: getPercentOfBaseline(conductStageReduction),
        shareOfTotal: getShareOfTotal(conductStageReduction)
      },
      focus: {
        reduction: focusStageReduction,
        percentOfBaseline: getPercentOfBaseline(focusStageReduction),
        shareOfTotal: getShareOfTotal(focusStageReduction)
      }
    };
  }

  // Main managed risk calculation method using new approach
  calculateManagedRisk(
    baselineRisk,
    hrddStrategy,
    transparencyEffectiveness,
    responsivenessStrategy,
    responsivenessEffectiveness,
    focus = this.defaultFocus ?? 0,
    riskConcentration = 1,
    selectedCountries = null,
    countryVolumes = null,
    countryRisks = null
  ) {
    // If we have country-specific data, use the detailed calculation
    if (selectedCountries && countryVolumes && countryRisks) {
      const details = this.calculateManagedRiskDetails(
        selectedCountries,
        countryVolumes,
        countryRisks,
        hrddStrategy,
        transparencyEffectiveness,
        responsivenessStrategy,
        responsivenessEffectiveness,
        focus
      );
      return details.managedRisk;
    }

    // Fallback to original method if country-specific data not available
    if (baselineRisk <= 0) {
      return 0;
    }

     const overallTransparencyEffectiveness = this.calculateOriginalTransparencyEffectiveness(hrddStrategy, transparencyEffectiveness);
    const sustainedRemedyOutcome = this.calculateSustainedRemedyEffectiveness(hrddStrategy, responsivenessStrategy);
    const goodConductOutcome = this.calculateGoodConductEffectiveness(hrddStrategy, responsivenessEffectiveness);
    const combinedBehaviourEffectiveness = this.combineBehaviourEffectiveness(
      sustainedRemedyOutcome.overall,
      goodConductOutcome.overall
    );
    const combinedEffectiveness = overallTransparencyEffectiveness * combinedBehaviourEffectiveness;

    const sanitizedFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const sanitizedConcentration = Number.isFinite(riskConcentration) && riskConcentration > 0
      ? Math.max(1, riskConcentration)
      : 1;

    const portfolioFocusMultiplier = this.calculatePortfolioFocusMultiplier(sanitizedFocus, sanitizedConcentration);
    const managedRisk = baselineRisk * (1 - combinedEffectiveness * portfolioFocusMultiplier);

    return Math.max(0, managedRisk);
  }

  // Calculate risk reduction percentage
  calculateRiskReduction(baselineRisk, managedRisk) {
    if (baselineRisk <= 0) return 0;
    return ((baselineRisk - managedRisk) / baselineRisk) * 100;
  }

  // Determine risk band based on score
  getRiskBand(score) {
    for (const [band, definition] of Object.entries(this.riskBands)) {
      if (score >= definition.min && score <= definition.max) {
        return band;
      }
    }
    return 'Unknown';
  }

  // Get color for risk score
  getRiskColor(score) {
    const band = this.getRiskBand(score);
    return this.riskBands[band]?.color || '#64748b';
  }

  // Get all risk band definitions for legend
  getRiskBandDefinitions() {
    return Object.entries(this.riskBands).map(([name, definition]) => ({
      name,
      range: `${definition.min}-${definition.max === 100 ? '100' : Math.floor(definition.max)}`,
      color: definition.color
    }));
  }

  // Validation methods
  validateWeights(weights) {
    if (!Array.isArray(weights) || weights.length !== 5) {
      return false;
    }
    
    return weights.every(weight => 
      typeof weight === 'number' && 
      weight >= 0 && 
      weight <= 50
    );
  }

  validateHRDDStrategy(strategy) {
    if (!Array.isArray(strategy) || strategy.length !== this.hrddStrategyLabels.length) {
      return false;
    }

    return strategy.every(weight =>
      typeof weight === 'number' &&
      weight >= 0 && 
      weight <= 100
    );
  }

  validateTransparency(transparency) {
    if (!Array.isArray(transparency) || transparency.length !== this.hrddStrategyLabels.length) {
      return false;
    }

    return transparency.every(effectiveness =>
      typeof effectiveness === 'number' &&
      effectiveness >= 0 && 
      effectiveness <= 100
    );
  }

  validateResponsiveness(responsiveness) {
    if (!Array.isArray(responsiveness) || responsiveness.length !== this.responsivenessLabels.length) {
      return false;
    }

    return responsiveness.every(weight =>
      typeof weight === 'number' &&
      weight >= 0 &&
      weight <= 100
    );
  }

  validateResponsivenessEffectiveness(effectiveness) {
    if (!Array.isArray(effectiveness) || effectiveness.length !== this.responsivenessLabels.length) {
      return false;
    }

    return effectiveness.every(eff =>
      typeof eff === 'number' &&
      eff >= 0 && 
      eff <= 100
    );
  }

  // Get gradient colors for map visualization
  getGradientColors() {
    return [
      '#22c55e',
      '#84cc16',
      '#eab308',
      '#f59e0b',
      '#f97316',
      '#ef4444',
      '#dc2626',
      '#991b1b'
    ];
  }

  // Convert risk score to color index for gradient
  getColorIndex(score, maxIndex = 7) {
    const normalizedScore = Math.max(0, Math.min(100, score)) / 100;
    return Math.floor(normalizedScore * maxIndex);
  }

  // Get strategy effectiveness breakdown with country-specific coverage
  getStrategyBreakdown(
    hrddStrategy,
    transparencyEffectiveness,
    responsivenessStrategy,
    responsivenessEffectiveness,
    focus = 0,
    riskConcentration = 1,
    selectedCountries = null,
    countryVolumes = null,
    countryRisks = null
  ) {
    const sanitizedFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const sanitizedConcentration = Number.isFinite(riskConcentration) && riskConcentration > 0
      ? Math.max(1, riskConcentration)
      : 1;
    const portfolioFocusMultiplier = this.calculatePortfolioFocusMultiplier(sanitizedFocus, sanitizedConcentration);

    const defaultStrategy = Array.isArray(this.defaultHRDDStrategy)
      ? this.defaultHRDDStrategy
      : [];
    const defaultTransparency = Array.isArray(this.defaultTransparencyEffectiveness)
      ? this.defaultTransparencyEffectiveness
      : [];
    const toolCount = Array.isArray(this.hrddStrategyLabels) && this.hrddStrategyLabels.length > 0
      ? this.hrddStrategyLabels.length
      : Math.max(
        defaultStrategy.length,
        defaultTransparency.length,
        Array.isArray(hrddStrategy) ? hrddStrategy.length : 0
      );

    const normalizedStrategy = new Array(toolCount).fill(0);
    const normalizedTransparency = new Array(toolCount).fill(0);

    for (let i = 0; i < toolCount; i++) {
      const strategyValue = Array.isArray(hrddStrategy) ? Number(hrddStrategy[i]) : NaN;
      const fallbackStrategyValue = Number(defaultStrategy[i]);
      const resolvedStrategyValue = Number.isFinite(strategyValue)
        ? strategyValue
        : (Number.isFinite(fallbackStrategyValue) ? fallbackStrategyValue : 0);
      normalizedStrategy[i] = Math.max(0, Math.min(100, resolvedStrategyValue));

      const transparencyValue = Array.isArray(transparencyEffectiveness) ? Number(transparencyEffectiveness[i]) : NaN;
      const fallbackTransparencyValue = Number(defaultTransparency[i]);
      const resolvedTransparencyValue = Number.isFinite(transparencyValue)
        ? transparencyValue
        : (Number.isFinite(fallbackTransparencyValue) ? fallbackTransparencyValue : 0);
      normalizedTransparency[i] = Math.max(0, Math.min(100, resolvedTransparencyValue));
    }

    const safeSelectedCountries = Array.isArray(selectedCountries)
      ? selectedCountries.filter(code => typeof code === 'string' && code.length > 0)
      : [];

    const overallTransparency = safeSelectedCountries.length > 0 && countryVolumes && countryRisks
      ? this.calculateTransparencyEffectiveness(
        normalizedStrategy,
        normalizedTransparency,
        safeSelectedCountries,
        countryVolumes,
        countryRisks,
        sanitizedFocus
      )
      : this.calculateOriginalTransparencyEffectiveness(normalizedStrategy, normalizedTransparency);

    const countrySpecificCoverage = safeSelectedCountries.length > 0 && countryVolumes && countryRisks
      ? this.calculateCountrySpecificCoverage(safeSelectedCountries, countryVolumes, countryRisks, normalizedStrategy, sanitizedFocus)
      : null;

    const sustainedRemedyOutcome = this.calculateSustainedRemedyEffectiveness(
      normalizedStrategy,
      responsivenessStrategy,
      {
        selectedCountries: safeSelectedCountries,
        countryVolumes,
        countrySpecificCoverage
      }
    );

    const goodConductOutcome = this.calculateGoodConductEffectiveness(
      normalizedStrategy,
      responsivenessEffectiveness,
      {
        selectedCountries: safeSelectedCountries,
        countryVolumes,
        countrySpecificCoverage
      }
    );

    const combinedBehaviourEffectiveness = this.combineBehaviourEffectiveness(
      sustainedRemedyOutcome.overall,
      goodConductOutcome.overall
    );

    const toolCategories = [
      {
        name: 'Worker Voice',
        tools: [0, 1],
        baseEffectiveness: [0.90, 0.45],
        categoryWeight: 1.0
      },
      {
        name: 'Audit',
        tools: [2, 3],
        baseEffectiveness: [0.25, 0.15],
        categoryWeight: 0.85
      },
      {
        name: 'SAQ',
        tools: [4, 5],
        baseEffectiveness: [0.12, 0.05],
        categoryWeight: 0.70
      }
    ];

    const breakdown = {
      hrddStrategies: [],
      overallTransparency: overallTransparency,
      overallResponsiveness: combinedBehaviourEffectiveness,
      overallSustainedRemedy: sustainedRemedyOutcome.overall,
      overallGoodConduct: goodConductOutcome.overall,
      sustainedRemedyDetails: sustainedRemedyOutcome.details,
      goodConductDetails: goodConductOutcome.details,
      sustainedRemedyCoverageWeight: sustainedRemedyOutcome.totalCoverageWeight,
      goodConductCoverageWeight: goodConductOutcome.totalCoverageWeight,
      sustainedRemedyContribution: sustainedRemedyOutcome.totalWeightedEffect,
      goodConductContribution: goodConductOutcome.totalWeightedEffect,
      primaryResponse: this.getPrimaryResponseMethod(sustainedRemedyOutcome.details),
      focus: {
        level: sanitizedFocus,
        concentration: sanitizedConcentration,
        portfolioMultiplier: portfolioFocusMultiplier
      },
       countrySpecificCoverage: countrySpecificCoverage
    };

    for (let i = 0; i < normalizedStrategy.length; i++) {
      const baseCoverage = Math.max(0, Math.min(100, normalizedStrategy[i] || 0));
      const userEffectiveness = Math.max(0, Math.min(100, normalizedTransparency[i] || 0));

      let category = toolCategories.find(cat => cat.tools.includes(i));
      if (!category) category = { name: 'Other', baseEffectiveness: [0.05], categoryWeight: 0.5 };

      const toolIndexInCategory = category.tools ? category.tools.indexOf(i) : 0;
      const baseEffectiveness = category.baseEffectiveness[toolIndexInCategory] || 0.05;
      const averageEffectiveness = (baseEffectiveness + userEffectiveness / 100) / 2;

      let coverageRange = null;
      if (countrySpecificCoverage && safeSelectedCountries.length > 0) {
        const coverages = safeSelectedCountries.map(countryCode =>
          countrySpecificCoverage[countryCode] ? countrySpecificCoverage[countryCode][i] : baseCoverage
        ).filter(c => Number.isFinite(c));

        if (coverages.length > 0) {
          const minCoverage = Math.min(...coverages);
          const maxCoverage = Math.max(...coverages);
          coverageRange = minCoverage !== maxCoverage 
            ? `${minCoverage.toFixed(1)}%-${maxCoverage.toFixed(1)}%`
            : `${minCoverage.toFixed(1)}%`;
        }
      }

      breakdown.hrddStrategies.push({
        name: Array.isArray(this.hrddStrategyLabels) && this.hrddStrategyLabels[i]
          ? this.hrddStrategyLabels[i]
          : `Tool ${i + 1}`,
        coverage: baseCoverage,
        coverageRange: coverageRange,
        baseEffectiveness: Math.round(baseEffectiveness * 100),
        userEffectiveness: userEffectiveness,
        averageEffectiveness: Math.round(averageEffectiveness * 100),
        category: category.name,
        contribution: baseCoverage * averageEffectiveness
      });
    }

    return breakdown;
  }

  getPrimaryResponseMethod(remedyDetails) {
    if (!Array.isArray(remedyDetails) || remedyDetails.length === 0) {
      return null;
    }

    const sorted = [...remedyDetails].sort((a, b) => (b?.weightedEffect || 0) - (a?.weightedEffect || 0));
    const top = sorted[0];

    return {
      method: top?.name || 'Not specified',
      coverage: Number.isFinite(top?.coverage) ? top.coverage : 0,
      effectiveness: Number.isFinite(top?.effectiveness) ? top.effectiveness : 0,
      contribution: Number.isFinite(top?.weightedEffect) ? top.weightedEffect : 0
    };
  }

  // Generate risk assessment summary with country-specific data
  generateRiskSummary(
    baselineRisk,
    managedRisk,
    selectedCountries,
    hrddStrategy,
    transparencyEffectiveness,
    responsivenessStrategy,
    responsivenessEffectiveness,
    focus = 0,
    riskConcentration = 1,
    countryVolumes = null,
    countryRisks = null
  ) {
    const safeSelectedCountries = Array.isArray(selectedCountries) ? selectedCountries : [];

    // Use detailed calculation if data available
    if (safeSelectedCountries && countryVolumes && countryRisks) {
      const details = this.calculateManagedRiskDetails(
        safeSelectedCountries,
        countryVolumes,
        countryRisks,
        hrddStrategy,
        transparencyEffectiveness,
        responsivenessStrategy,
        responsivenessEffectiveness,
        focus
      );

      const riskReduction = this.calculateRiskReduction(details.baselineRisk, details.managedRisk);
      const breakdown = this.getStrategyBreakdown(
        hrddStrategy,
        transparencyEffectiveness,
        responsivenessStrategy,
        responsivenessEffectiveness,
        focus,
        details.riskConcentration,
        selectedCountries,
        countryVolumes,
        countryRisks
      );

      const stageBreakdown = details.stageBreakdown || this.calculateStageBreakdown(
        details.baselineRisk,
        details.managedRisk,
        breakdown.overallTransparency,
        breakdown.overallSustainedRemedy,
        breakdown.overallGoodConduct,
        details.portfolioFocusMultiplier
      );

      return {
        baseline: {
          score: details.baselineRisk,
          band: this.getRiskBand(details.baselineRisk),
          color: this.getRiskColor(details.baselineRisk)
        },
        managed: {
          score: details.managedRisk,
          band: this.getRiskBand(details.managedRisk),
          color: this.getRiskColor(details.managedRisk)
        },
        improvement: {
          riskReduction: riskReduction,
          absoluteReduction: details.baselineRisk - details.managedRisk,
          isImprovement: details.managedRisk < details.baselineRisk
        },
        portfolio: {
          countriesSelected: selectedCountries.length,
          averageRisk: details.baselineRisk,
          riskConcentration: details.riskConcentration
        },
        strategy: { ...breakdown, stageBreakdown },
        focusEffectiveness: details.focusEffectivenessMetrics,
        countryManagedRisks: details.countryManagedRisks
      };
    }

    // Fallback for cases without country-specific data
    const riskReduction = this.calculateRiskReduction(baselineRisk, managedRisk);
    const breakdown = this.getStrategyBreakdown(
      hrddStrategy,
      transparencyEffectiveness,
      responsivenessStrategy,
      responsivenessEffectiveness,
      focus,
      riskConcentration
    );

    const stageBreakdown = this.calculateStageBreakdown(
      baselineRisk,
      managedRisk,
      breakdown.overallTransparency,
      breakdown.overallSustainedRemedy,
      breakdown.overallGoodConduct,
      breakdown?.focus?.portfolioMultiplier
    );

    return {
      baseline: {
        score: baselineRisk,
        band: this.getRiskBand(baselineRisk),
        color: this.getRiskColor(baselineRisk)
      },
      managed: {
        score: managedRisk,
        band: this.getRiskBand(managedRisk),
        color: this.getRiskColor(managedRisk)
      },
      improvement: {
        riskReduction: riskReduction,
        absoluteReduction: baselineRisk - managedRisk,
        isImprovement: managedRisk < baselineRisk
      },
      portfolio: {
        countriesSelected: selectedCountries.length,
        averageRisk: baselineRisk,
        riskConcentration
      },
      strategy: { ...breakdown, stageBreakdown }
    };
  }

  // Export configuration for reporting
  exportConfiguration(state) {
    const focusValue = Number.isFinite(state.focus) ? state.focus : 0;
    const riskConcentration = Number.isFinite(state.riskConcentration) && state.riskConcentration > 0
      ? Math.max(1, state.riskConcentration)
      : 1;
    const portfolioFocusMultiplier = this.calculatePortfolioFocusMultiplier(focusValue, riskConcentration);

    return {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '6.1',
        toolName: 'HRDD Risk Assessment Tool - Rank Preservation Enhanced'
      },
      portfolio: {
        selectedCountries: state.selectedCountries,
        countryVolumes: state.countryVolumes,
        totalCountries: state.selectedCountries.length
      },
      step1: {
        weights: state.weights,
        baselineRisk: state.baselineRisk,
        weightLabels: ['ITUC Rights Rating', 'Corruption Index', 'Freedom Rating', 'WJP Index', 'Walk Free Slavery Index']
      },
      step2: {
        hrddStrategy: state.hrddStrategy,
        transparencyEffectiveness: state.transparencyEffectiveness,
        strategyLabels: this.hrddStrategyLabels,
        focus: focusValue,
        riskConcentration,
        portfolioFocusMultiplier,
        methodology: 'Enhanced with rank preservation mechanisms'
      },
      step3: {
        responsivenessStrategy: state.responsivenessStrategy,
        responsivenessEffectiveness: state.responsivenessEffectiveness,
        managedRisk: state.managedRisk,
        responsivenessLabels: this.responsivenessLabels
      },
      results: this.generateRiskSummary(
        state.baselineRisk,
        state.managedRisk,
        state.selectedCountries,
        state.hrddStrategy,
        state.transparencyEffectiveness,
        state.responsivenessStrategy,
        state.responsivenessEffectiveness,
        focusValue,
        riskConcentration,
        state.countryVolumes,
        state.countryRisks
      )
    };
  }


  // Panel 6 Budget Analysis Methods (conditionally available)
  // Panel 6 Budget Analysis Methods (conditionally available)

// Default cost assumptions - grouped together for easy modification
getDefaultCostAssumptions() {
  return {
    // Panel 3 Tool Costs (6 tools)
    toolAnnualProgrammeCosts: [12000, 0, 0, 40000, 0, 0], // Fixed annual programme costs
    toolPerSupplierCosts: [120, 250, 1200, 0, 10, 10],     // Variable per-supplier costs  
    toolInternalHours: [3, 6, 20, 4, 2, 1],        // Internal hours per supplier per tool
    
    // Panel 4 Remedy utilisation costs (per tool)
    toolRemedyInternalHours: [0, 10, 10, 6, 2, 2],    // Internal hours per supplier to apply each tool's findings
    
    // General defaults
    defaultSupplierCount: 250,
    defaultHourlyRate: 40
  };
}

  calculateBudgetAnalysis(
    supplierCount,
    hourlyRate,
    toolAnnualProgrammeCosts,
    toolPerSupplierCosts,
    toolInternalHours,
    toolRemedyInternalHours,
    hrddStrategy,
    transparencyEffectiveness,
    responsivenessStrategy,
    responsivenessEffectiveness,
    selectedCountries,
    countryVolumes,
    countryRisks,
    focus
  ) {

    // Check if Panel 6 is enabled (this will be available globally)
    if (typeof window !== 'undefined' && window.hrddApp && !window.hrddApp.ENABLE_PANEL_6) {
      return null;
    }

    // NOTE: Social audit cost adjustments are intentionally excluded here so baseline
    // budget calculations remain unchanged. The optimization routine applies any
    // enforced constraints and cost reductions separately when evaluating scenarios.
    const safeSupplierCount = Math.max(1, Math.floor(supplierCount || 1));
    const safeHourlyRate = Math.max(0, Number.isFinite(hourlyRate) ? hourlyRate : 20);

    const toolCount = Array.isArray(this.hrddStrategyLabels)
      ? this.hrddStrategyLabels.length
      : 6;
    const safeAnnualProgrammeCosts = Array.from({ length: toolCount }, (_, index) => {
      const value = Array.isArray(toolAnnualProgrammeCosts)
        ? toolAnnualProgrammeCosts[index]
        : undefined;
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    });

    const safePerSupplierCosts = Array.from({ length: toolCount }, (_, index) => {
      const value = Array.isArray(toolPerSupplierCosts)
        ? toolPerSupplierCosts[index]
        : undefined;
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    });

    const safeToolInternalHours = Array.from({ length: toolCount }, (_, index) => {
      const value = Array.isArray(toolInternalHours)
        ? toolInternalHours[index]
        : undefined;
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    });

    const safeToolRemedyInternalHours = Array.from({ length: toolCount }, (_, index) => {
      const value = Array.isArray(toolRemedyInternalHours)
        ? toolRemedyInternalHours[index]
        : undefined;
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    });

    let safeHrddStrategy = Array.from({ length: toolCount }, (_, index) => {
      const value = Array.isArray(hrddStrategy) ? hrddStrategy[index] : undefined;
      return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    });

    // Calculate actual deployment per tool based on coverage percentages
    const toolDeployments = safeHrddStrategy.map((coverage, index) => {
      const coverageRatio = Math.max(0, Math.min(1, coverage / 100));
      const suppliersUsingTool = Math.ceil(safeSupplierCount * coverageRatio);

      const annualProgrammeBase = safeAnnualProgrammeCosts[index] || 0;
      const annualProgrammeCost = annualProgrammeBase * coverageRatio;
      const perSupplierCost = safePerSupplierCosts[index] || 0;
      const hoursPerSupplier = safeToolInternalHours[index] || 0;
      const remedyHoursPerSupplier = safeToolRemedyInternalHours[index] || 0;

      const totalExternalCost = annualProgrammeCost + (suppliersUsingTool * perSupplierCost);
      const detectionInternalCost = suppliersUsingTool * hoursPerSupplier * safeHourlyRate;
      const remedyInternalCost = suppliersUsingTool * remedyHoursPerSupplier * safeHourlyRate;
      const totalInternalCost = detectionInternalCost + remedyInternalCost;
      const totalCost = totalExternalCost + totalInternalCost;

      return {
        toolIndex: index,
        toolName: Array.isArray(this.hrddStrategyLabels)
          ? this.hrddStrategyLabels[index]
          : `Tool ${index + 1}`,
        coverage,
        suppliersUsingTool,
        annualProgrammeBase,
        annualProgrammeCost,
        perSupplierCost,
        externalCostPerSupplier: suppliersUsingTool > 0
          ? totalExternalCost / suppliersUsingTool
          : perSupplierCost,
        hoursPerSupplier,
        remedyHoursPerSupplier,
        totalExternalCost,
        detectionInternalCost,
        remedyInternalCost,
        totalInternalCost,
        totalCost
      };
    });

    const totalExternalCost = toolDeployments.reduce((sum, tool) => sum + tool.totalExternalCost, 0);
    const totalDetectionInternalCost = toolDeployments.reduce((sum, tool) => sum + tool.detectionInternalCost, 0);
    const totalRemedyInternalCost = toolDeployments.reduce((sum, tool) => sum + tool.remedyInternalCost, 0);
    const totalInternalCost = totalDetectionInternalCost + totalRemedyInternalCost;
    const totalBudget = totalExternalCost + totalInternalCost;

    return {
      supplierCount: safeSupplierCount,
      hourlyRate: safeHourlyRate,
      totalExternalCost,
      totalInternalCost,
      totalDetectionInternalCost,
      totalRemedyInternalCost,
      totalBudget,
      costPerSupplier: totalBudget / safeSupplierCount,
      toolDeployments,
      currentAllocation: safeHrddStrategy,
      toolRemedyInternalHours: safeToolRemedyInternalHours
    };
  }

  // NEW: Helper function to enforce SAQ constraint
  enforceSAQConstraint(toolAllocation) {
    const allocation = [...toolAllocation];
    const currentSAQSum = allocation[4] + allocation[5];

    
    if (Math.abs(currentSAQSum - 100) > 0.1) {
      // Distribute 100% between SAQ tools 5 and 6, preserving their ratio if possible
      if (currentSAQSum > 0) {
        const ratio4 = allocation[4] / currentSAQSum;
        allocation[4] = ratio4 * 100;
        allocation[5] = (1 - ratio4) * 100;
      } else {
        // Default split if both are zero
        allocation[4] = 50;
        allocation[5] = 50;
      }
    }
    
    return allocation;
  }

  // NEW: Validate SAQ constraint
  validateSAQConstraint(toolAllocation) {
    const sum = toolAllocation[4] + toolAllocation[5];
    return Math.abs(sum - 100) <= 0.1; // Allow small floating point errors
  }

  // NEW: Helper function to enforce social audit constraint (tools 3 & 4)
   enforceSocialAuditConstraint(toolAllocation, targetCoverage = 100) {
    const allocation = [...toolAllocation];
    const auditA = Number.isFinite(allocation[2]) ? allocation[2] : 0;
    const auditB = Number.isFinite(allocation[3]) ? allocation[3] : 0;
    const currentSum = auditA + auditB;

    const safeTarget = Math.max(0, Math.min(100, Number.isFinite(targetCoverage) ? targetCoverage : 0));

    if (Math.abs(currentSum - safeTarget) > 0.1) {
      if (currentSum > 0) {
        const ratio = auditA / currentSum;
        allocation[2] = ratio * safeTarget;
        allocation[3] = (1 - ratio) * safeTarget;
      } else {
        allocation[2] = safeTarget / 2;
        allocation[3] = safeTarget / 2;
      }
    }

    return allocation;
  }

  // NEW: Validate social audit constraint
  validateSocialAuditConstraint(toolAllocation, targetCoverage = 100) {
    const auditA = Number.isFinite(toolAllocation[2]) ? toolAllocation[2] : 0;
    const auditB = Number.isFinite(toolAllocation[3]) ? toolAllocation[3] : 0;
    const safeTarget = Math.max(0, Math.min(100, Number.isFinite(targetCoverage) ? targetCoverage : 0));
    return Math.abs((auditA + auditB) - safeTarget) <= 0.1;
  }

  // Enhanced budget optimization algorithm for the RiskEngine class
// Replace the existing optimizeBudgetAllocation method with this improved version

// Enhanced budget optimization algorithm for RiskEngine.js
// Replace the existing optimizeBudgetAllocation method with this improved version

// Enhanced budget optimization algorithm for RiskEngine.js
// Replace the existing optimizeBudgetAllocation method with this improved version


   optimizeBudgetAllocation(
    supplierCount,
    hourlyRate,
    toolAnnualProgrammeCosts,
    toolPerSupplierCosts,
    toolInternalHours,
    toolRemedyInternalHours,
    hrddStrategy,
    transparencyEffectiveness,
    responsivenessStrategy,
    responsivenessEffectiveness,
    selectedCountries,
    countryVolumes,
    countryRisks,
    focus,
    enforceSAQConstraint = false,
    enforceSocialAuditConstraint = false,
    socialAuditCostReduction = 50
  ) {
    // Check if Panel 6 is enabled
    if (typeof window !== 'undefined' && window.hrddApp && !window.hrddApp.ENABLE_PANEL_6) {
      return null;
    }

    const currentBudget = this.calculateBudgetAnalysis(
      supplierCount, hourlyRate, toolAnnualProgrammeCosts, toolPerSupplierCosts,
      toolInternalHours, toolRemedyInternalHours, hrddStrategy, transparencyEffectiveness,
      responsivenessStrategy, responsivenessEffectiveness, selectedCountries,
      countryVolumes, countryRisks, focus
    );

    if (!currentBudget) return null;

    const targetBudget = currentBudget.totalBudget;
    const budgetTolerance = Math.max(100, targetBudget * 0.02);
    const minImprovementThreshold = 0.1;

    const currentDetails = this.calculateManagedRiskDetails(
      selectedCountries, countryVolumes, countryRisks,
      hrddStrategy, transparencyEffectiveness,
      responsivenessStrategy, responsivenessEffectiveness, focus
    );

    const currentRiskReduction = currentDetails.baselineRisk - currentDetails.managedRisk;
    const baselineEffectiveness = currentDetails.baselineRisk > 0
      ? (currentRiskReduction / currentDetails.baselineRisk * 100)
      : 0;

    const currentStateHash = this.generateOptimizationStateHash({
      supplierCount, hourlyRate, toolAnnualProgrammeCosts, toolPerSupplierCosts,
      toolInternalHours, toolRemedyInternalHours, hrddStrategy, transparencyEffectiveness,
      responsivenessStrategy, responsivenessEffectiveness, selectedCountries,
      countryVolumes, countryRisks, focus, enforceSAQConstraint, enforceSocialAuditConstraint,
      socialAuditCostReduction
    });

    const previousOptimizationState =
      this.lastOptimizationState && this.lastOptimizationState.stateHash === currentStateHash
        ? this.lastOptimizationState
        : null;
    const previousResults = previousOptimizationState?.results || null;
    const isReOptimization = Boolean(previousResults);

    const toolCount = Array.isArray(this.hrddStrategyLabels)
      ? this.hrddStrategyLabels.length
      : (Array.isArray(hrddStrategy) ? hrddStrategy.length : 0);

    const safeSupplierCount = Math.max(1, Math.floor(Number.isFinite(supplierCount) ? supplierCount : currentBudget.supplierCount || 1));
    const safeHourlyRate = Math.max(0, Number.isFinite(hourlyRate) ? hourlyRate : currentBudget.hourlyRate || 0);

    const getArrayValue = (arr, index, fallback = 0) => {
      if (Array.isArray(arr) && Number.isFinite(arr[index])) {
        return Math.max(0, arr[index]);
      }
      if (Array.isArray(fallback) && Number.isFinite(fallback[index])) {
        return Math.max(0, fallback[index]);
      }
      return Math.max(0, Number.isFinite(fallback) ? fallback : 0);
    };

    const computeAuditCoverage = (allocation) => {
      if (!Array.isArray(allocation)) return 0;
      const announced = Number.isFinite(allocation[2]) ? Math.max(0, allocation[2]) : 0;
      const unannounced = Number.isFinite(allocation[3]) ? Math.max(0, allocation[3]) : 0;
      return announced + unannounced;
    };

    const baseAuditCoverage = computeAuditCoverage(hrddStrategy);
    const fallbackAuditCoverage = computeAuditCoverage(currentBudget.currentAllocation);
    const auditConstraintTarget = enforceSocialAuditConstraint
      ? Math.max(0, Math.min(100, baseAuditCoverage > 0 ? baseAuditCoverage : fallbackAuditCoverage))
      : null;
    const auditCoverageForSummary = enforceSocialAuditConstraint
      ? Math.max(0, Math.min(100, Number.isFinite(auditConstraintTarget)
        ? auditConstraintTarget
        : fallbackAuditCoverage))
      : null;

    const socialAuditReduction = enforceSocialAuditConstraint
      ? Math.max(0, Math.min(100, Number(socialAuditCostReduction) || 0))
      : 0;
    const socialAuditReductionFactor = enforceSocialAuditConstraint
      ? Math.max(0, 1 - socialAuditReduction / 100)
      : 1;

    const toolCostPerPercent = Array.from({ length: toolCount }, (_, index) => {
      const programmeCost = getArrayValue(toolAnnualProgrammeCosts, index, 0) / 100;
      const perSupplierCost = getArrayValue(toolPerSupplierCosts, index, 0);
      const detectionHours = getArrayValue(toolInternalHours, index, 0);
      const remedyHours = getArrayValue(toolRemedyInternalHours, index, 0);
      const reductionFactor = enforceSocialAuditConstraint && (index === 2 || index === 3)
        ? socialAuditReductionFactor
        : 1;
      const adjustedProgramme = programmeCost * reductionFactor;
      const variableCost = (perSupplierCost * reductionFactor + (detectionHours * reductionFactor + remedyHours * reductionFactor) * safeHourlyRate) * (safeSupplierCount / 100);
      return adjustedProgramme + variableCost;
    });

    const clampAllocation = (allocation) => Array.from({ length: toolCount }, (_, index) => {
      const value = Array.isArray(allocation) && Number.isFinite(allocation[index])
        ? allocation[index]
        : 0;
      return Math.max(0, Math.min(100, value));
    });

    const calculateCost = (allocation) => {
      return clampAllocation(allocation).reduce((sum, coverage, index) => {
        return sum + coverage * toolCostPerPercent[index];
      }, 0);
    };

    const normalizeToBudget = (allocation) => {
      let normalized = clampAllocation(allocation);
      if (enforceSAQConstraint) {
        normalized = this.enforceSAQConstraint(normalized);
      }
      if (enforceSocialAuditConstraint) {
        normalized = this.enforceSocialAuditConstraint(normalized, auditConstraintTarget);
      }

      if (!(targetBudget > 0)) {
        return normalized;
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const cost = calculateCost(normalized);
        if (Math.abs(cost - targetBudget) <= budgetTolerance || cost === 0) {
          break;
        }
        const ratio = targetBudget / cost;
        normalized = normalized.map(value => Math.max(0, Math.min(100, value * ratio)));
        if (enforceSAQConstraint) {
          normalized = this.enforceSAQConstraint(normalized);
        }
        if (enforceSocialAuditConstraint) {
          normalized = this.enforceSocialAuditConstraint(normalized, auditConstraintTarget);
        }
      }

      return clampAllocation(normalized);
    };

    let validSolutionsFound = 0;

    const evaluateAllocation = (allocation) => {
      const candidate = normalizeToBudget(allocation);
      const cost = calculateCost(candidate);
      const details = this.calculateManagedRiskDetails(
        selectedCountries, countryVolumes, countryRisks,
        candidate, transparencyEffectiveness,
        responsivenessStrategy, responsivenessEffectiveness, focus
      );

      const riskReduction = details.baselineRisk - details.managedRisk;
      const effectiveness = details.baselineRisk > 0
        ? (riskReduction / details.baselineRisk * 100)
        : 0;

      const budgetGap = Math.abs(cost - targetBudget);
      const budgetViolation = Math.max(0, budgetGap - budgetTolerance);
      if (budgetViolation <= 0) {
        validSolutionsFound += 1;
      }
      const budgetPenalty = budgetViolation > 0
        ? (budgetViolation / Math.max(1, targetBudget)) * 500
        : 0;

      const fitness = details.managedRisk + budgetPenalty;

      return {
        allocation: candidate,
        cost,
        details,
        riskReduction,
        effectiveness,
        budgetViolation,
        fitness
      };
    };

    let currentAllocation = normalizeToBudget(hrddStrategy);
    let bestEvaluation = evaluateAllocation(currentAllocation);
    let evaluations = 1;

    const considerCandidate = (allocation) => {
      const evaluated = evaluateAllocation(allocation);
      evaluations += 1;
      if (evaluated.fitness + 1e-6 < bestEvaluation.fitness) {
        bestEvaluation = evaluated;
        currentAllocation = evaluated.allocation;
        return true;
      }
      return false;
    };

    const stepSizes = [12, 8, 5, 3, 2, 1];
    const directions = [-1, 1];

    stepSizes.forEach(step => {
      let improved = true;
      let iteration = 0;
      const maxIterations = 120;

      while (improved && iteration < maxIterations) {
        improved = false;
        iteration += 1;

        for (let index = 0; index < toolCount; index++) {
          for (const direction of directions) {
            const candidate = [...currentAllocation];
            candidate[index] = Math.max(0, Math.min(100, candidate[index] + direction * step));
            if (considerCandidate(candidate)) {
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }
    });

    const randomAttempts = 60;
    for (let attempt = 0; attempt < randomAttempts; attempt++) {
      const candidate = currentAllocation.map(value => {
        const noise = (Math.random() - 0.5) * 20;
        return Math.max(0, Math.min(100, value + noise));
      });
      considerCandidate(candidate);
    }

    const optimizedDetails = bestEvaluation.details;
    const optimizedEffectiveness = bestEvaluation.effectiveness;
     const improvement = optimizedEffectiveness - baselineEffectiveness;

    const auditConstraintSummary = enforceSocialAuditConstraint
      ? (Number.isFinite(auditCoverageForSummary)
        ? ` Social audit constraint was enforced (Tools 3 and 4 held at ${auditCoverageForSummary.toFixed(1)}%).`
        : ' Social audit constraint was enforced (Tools 3 and 4 held at their current combined coverage).')
      : '';

    if (improvement < minImprovementThreshold) {
      if (previousResults) {
        const message = `The existing allocation remains the best option within the current budget. No materially better tool mix was identified despite evaluating ${validSolutionsFound} valid combinations.${enforceSAQConstraint ? ' SAQ constraint was enforced.' : ''}${auditConstraintSummary}`;
        const merged = {
          ...previousResults,
          insight: message,
          alreadyOptimized: true,
          reOptimizationAttempted: true,
          attemptedValidSolutions: validSolutionsFound,
          optimizationRun: true,
          saqConstraintEnforced: enforceSAQConstraint,
          socialAuditConstraintEnforced: enforceSocialAuditConstraint,
          socialAuditCostReductionApplied: enforceSocialAuditConstraint ? socialAuditReduction : 0,
          socialAuditCoverageTarget: enforceSocialAuditConstraint ? auditCoverageForSummary : null
        };
        this.lastOptimizationState = {
          stateHash: currentStateHash,
          results: merged,
          timestamp: Date.now()
        };
        return merged;
      }

      const noImprovementResult = {
        baselineRisk: currentDetails.baselineRisk,
        currentManagedRisk: currentDetails.managedRisk,
        optimizedManagedRisk: currentDetails.managedRisk,
        currentToolAllocation: hrddStrategy,
        optimizedToolAllocation: hrddStrategy,
        currentCountryManagedRisks: currentDetails.countryManagedRisks,
        optimizedCountryManagedRisks: currentDetails.countryManagedRisks,
        currentRiskReduction,
        optimizedRiskReduction: currentRiskReduction,
        currentEffectiveness: baselineEffectiveness,
        optimizedEffectiveness: baselineEffectiveness,
        improvement: 0,
         insight: `No meaningful improvement found after testing ${evaluations} tool mixes within the current budget of ${targetBudget.toLocaleString()}.${enforceSAQConstraint ? ' SAQ constraint (100% coverage) was enforced.' : ''}${auditConstraintSummary} Consider updating tool effectiveness assumptions or increasing the budget.`,
        budgetUtilization: targetBudget > 0 ? 100 : 0,
        budgetConstraintMet: true,
        finalBudget: targetBudget,
        targetBudget,
        algorithmsUsed: ['Focused hill-climb', 'Budget scaling', 'Random perturbations'],
        validSolutionsFound,
        optimizationRun: true,
        alreadyOptimized: isReOptimization,
        saqConstraintEnforced: enforceSAQConstraint,
        socialAuditConstraintEnforced: enforceSocialAuditConstraint,
        socialAuditCostReductionApplied: enforceSocialAuditConstraint ? socialAuditReduction : 0,
        socialAuditCoverageTarget: enforceSocialAuditConstraint ? auditCoverageForSummary : null
      };

      this.lastOptimizationState = {
        stateHash: currentStateHash,
        results: noImprovementResult,
        timestamp: Date.now()
      };

      return noImprovementResult;
    }

    const budgetUtilization = targetBudget > 0
      ? (bestEvaluation.cost / targetBudget) * 100
      : 100;

    let insight;
    if (improvement >= 5) {
      insight = `Substantial improvement achieved (+${improvement.toFixed(1)}% risk reduction). The optimizer shifted investment towards higher-effectiveness tools while respecting remedy utilisation costs.`;
    } else if (improvement >= 1) {
      insight = `Noticeable improvement achieved (+${improvement.toFixed(1)}%). Rebalancing tool coverage delivered better detection, remedy, and conduct outcomes within the same budget envelope.`;
    } else {
      insight = `Marginal improvement achieved (+${improvement.toFixed(1)}%). Minor adjustments to tool coverage improved performance without increasing spend.`;
    }
    if (enforceSAQConstraint) {
      insight += ` SAQ constraint enforced: Tools 5 and 6 maintain 100% combined coverage (${bestEvaluation.allocation[4].toFixed(1)}% + ${bestEvaluation.allocation[5].toFixed(1)}%).`;
    }
   if (enforceSocialAuditConstraint) {
      const combinedAuditText = Number.isFinite(auditCoverageForSummary)
        ? `${auditCoverageForSummary.toFixed(1)}% combined coverage`
        : 'their current combined coverage';
      insight += ` Social audit constraint enforced: Tools 3 and 4 maintain ${combinedAuditText} (${bestEvaluation.allocation[2].toFixed(1)}% + ${bestEvaluation.allocation[3].toFixed(1)}%) with a ${socialAuditReduction.toFixed(0)}% cost reduction.`;
    }

    const finalResult = {
      baselineRisk: currentDetails.baselineRisk,
      currentManagedRisk: currentDetails.managedRisk,
      optimizedManagedRisk: optimizedDetails.managedRisk,
      currentRiskReduction,
      optimizedRiskReduction: bestEvaluation.riskReduction,
      currentToolAllocation: hrddStrategy,
      optimizedToolAllocation: bestEvaluation.allocation,
      currentCountryManagedRisks: currentDetails.countryManagedRisks,
      optimizedCountryManagedRisks: optimizedDetails?.countryManagedRisks
        ? optimizedDetails.countryManagedRisks
        : currentDetails.countryManagedRisks,
      currentEffectiveness: baselineEffectiveness,
      optimizedEffectiveness,
      improvement,
      insight,
      budgetUtilization,
      budgetConstraintMet: bestEvaluation.budgetViolation <= 0,
      finalBudget: bestEvaluation.cost,
      targetBudget,
      algorithmsUsed: ['Focused hill-climb', 'Budget scaling', 'Random perturbations'],
      validSolutionsFound,
      optimizationRun: true,
      alreadyOptimized: isReOptimization,
      reOptimizationAttempted: isReOptimization,
      attemptedValidSolutions: validSolutionsFound,
      saqConstraintEnforced: enforceSAQConstraint,
      socialAuditConstraintEnforced: enforceSocialAuditConstraint,
      socialAuditCostReductionApplied: enforceSocialAuditConstraint ? socialAuditReduction : 0,
      socialAuditCoverageTarget: enforceSocialAuditConstraint ? auditCoverageForSummary : null,
      evaluations,
      toolChanges: bestEvaluation.allocation.map((alloc, i) => ({
        tool: this.hrddStrategyLabels[i] || `Tool ${i + 1}`,
        current: hrddStrategy[i],
        optimized: alloc,
        change: alloc - hrddStrategy[i]
      }))
    };

    this.lastOptimizationState = {
      stateHash: currentStateHash,
      results: finalResult,
      timestamp: Date.now()
    };

    return finalResult;
  }
}

export const riskEngine = new RiskEngine();