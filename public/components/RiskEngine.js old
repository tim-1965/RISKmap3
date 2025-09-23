// RiskEngine.js - Corrected to match mathematical formulation exactly
export class RiskEngine {
  constructor() {
    // Step 1: Default weightings for the 5 input columns
    this.defaultWeights = [20, 20, 5, 10, 10]; // ITUC, Corruption, Migrant, WJP, Walkfree
    
    // Step 2: HRDD Strategy defaults - representing supplier base coverage percentages
    this.defaultHRDDStrategy = [35, 15, 25, 60, 80, 90]; // Coverage percentages: Worker voice is rare, passive approaches common
    this.defaultTransparencyEffectiveness = [90, 45, 25, 15, 12, 5]; // Research-backed base effectiveness rates

    // Step 3: Responsiveness Strategy defaults
    this.defaultResponsivenessStrategy = [35, 5, 20, 20, 10, 5]; // Portfolio of response levers from weakest to strongest
    this.defaultResponsivenessEffectiveness = [75, 80, 35, 25, 15, 5]; // Mid-point response effectiveness assumptions in percentages

    // Focus defaults for directing transparency/response capacity to higher-risk countries
    this.defaultFocus = 0.6;

    // CORRECTED: Exact mathematical specification parameters
    this.focusBiasSettings = {
      minExponent: 1.0,
      maxExponent: 3.5,
      minRiskRatio: 0.05,
      maxRiskRatio: 5.0,
      aggressionThreshold: 0.5
    };

    // Controls how strongly portfolio concentration amplifies focus-driven effectiveness gains
    this.focusConcentrationWeight = 2.75; // γ in mathematical specification
    
    // Resource conservation settings
    this.maxResourceExpansion = 0.3; // 30% maximum allowed resource increase

    // Strategy labels
    this.hrddStrategyLabels = [
      'Continuous Worker Voice',
      'Worker Surveys (annual)',
      'Unannounced Social Audits',
      'Announced Social Audits',
      'Supplier Self-Reporting',
      'Desk-Based Risk Assessment'
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

  // CORRECTED: Exact focus exponent calculation per mathematical specification
  getFocusExponent(focus = 0) {
    const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const settings = this.focusBiasSettings || {};
    const minExp = Number.isFinite(settings.minExponent) ? settings.minExponent : 1.0;
    const maxExp = Number.isFinite(settings.maxExponent) ? Math.max(minExp, settings.maxExponent) : 3.5;
    
    // Mathematical specification implementation:
    // φ = {
    //   1 + f · (φₘₐₓ - 1) · (f/0.5)                    if f ≤ 0.5
    //   1 + (φₘₐₓ - 1) · [0.5 + (f-0.5)^1.8 · 0.5]     if f > 0.5
    // }
    
    if (safeFocus <= 0.5) {
      return minExp + safeFocus * (maxExp - minExp) * (safeFocus / 0.5);
    } else {
      const component = 0.5 + Math.pow(safeFocus - 0.5, 1.8) * 0.5;
      return minExp + (maxExp - minExp) * component;
    }
  }

  // CORRECTED: Exact biased risk ratio with compression per mathematical specification
  getBiasedRiskRatio(riskRatio, focus = 0, baselineRisk = 0, portfolioBaselineRisk = 0) {
    const settings = this.focusBiasSettings || {};
    const maxRatio = Number.isFinite(settings.maxRiskRatio) && settings.maxRiskRatio > 0
      ? settings.maxRiskRatio
      : 5.0;
    const minRatio = Number.isFinite(settings.minRiskRatio) && settings.minRiskRatio >= 0
      ? settings.minRiskRatio
      : 0.05;

    const clampedRatio = Math.min(
      maxRatio,
      Math.max(0, Number.isFinite(riskRatio) ? riskRatio : 0)
    );

    const exponent = this.getFocusExponent(focus);
    let biasedRatio = Math.pow(clampedRatio, exponent);
    
    // Apply bounds first
    biasedRatio = Math.max(minRatio, Math.min(maxRatio, biasedRatio));
    
    // CORRECTED: Apply compression as per mathematical specification
    // If f > 0.6 AND bᵢ/B < 0.8:
    //   rᵢ' = rᵢ' · [0.3 + 0.7 · (bᵢ/B)²]
    if (focus > 0.6 && clampedRatio < 0.8) {
      const compressionFactor = 0.3 + 0.7 * Math.pow(clampedRatio, 2);
      biasedRatio *= compressionFactor;
    }

    return Math.max(minRatio, biasedRatio);
  }

  // CORRECTED: Calculate portfolio focus multiplier exactly per specification
  calculatePortfolioFocusMultiplier(focus, riskConcentration) {
    const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const safeConcentration = Number.isFinite(riskConcentration) && riskConcentration >= 1 
      ? riskConcentration 
      : 1;
    const gamma = this.focusConcentrationWeight;
    
    // Mathematical specification: Fₚ = (1 - f · γ) + f · γ · C
    return (1 - safeFocus * gamma) + safeFocus * gamma * safeConcentration;
  }

  // CORRECTED: Calculate country-specific focus multiplier per specification
  calculateCountryFocusMultiplier(focus, portfolioFocusMultiplier, biasedRiskRatio, countryRisk) {
    const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0;
    const gamma = this.focusConcentrationWeight;
    
    // Mathematical specification:
    // If f > 0.6 AND bᵢ ≥ 70:
    //   Fᵢ = Fₚ · [1 + (f-0.6) · 0.5]
    // Else:
    //   Fᵢ = (1 - f · γ) + f · γ · rᵢ'
    
    if (safeFocus > 0.6 && countryRisk >= 70) {
      const highRiskBonus = 1 + (safeFocus - 0.6) * 0.5;
      return portfolioFocusMultiplier * highRiskBonus;
    } else {
      return (1 - safeFocus * gamma) + safeFocus * gamma * biasedRiskRatio;
    }
  }

  // CORRECTED: Calculate resource conservation factor
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
        
        // High-risk boost
        if (focus > 0.6 && countryRisk >= 60) {
          const highRiskBoost = 1 + (focus - 0.6) * 0.8;
          riskAdjustmentFactor *= highRiskBoost;
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

  // CORRECTED: Country-specific coverage calculation per mathematical specification
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
        
        // Apply high-risk boost per specification:
        // If f > 0.6 AND bᵢ ≥ 60: cᵢⱼ = cᵢⱼ · [1 + (f-0.6) · 0.8]
        if (safeFocus > 0.6 && countryRisk >= 60) {
          const highRiskBoost = 1 + (safeFocus - 0.6) * 0.8;
          adjustedValue *= highRiskBoost;
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

  // NEW: Calculate focus effectiveness metrics across risk tiers
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

  // NEW: Get focus benefit classification for individual countries
  getFocusBenefitLevel(countryRisk, baselineRisk, focus) {
    if (focus < 0.3) return 'standard';
    
    const riskRatio = baselineRisk > 0 ? countryRisk / baselineRisk : 1;
    const biasedRatio = this.getBiasedRiskRatio(riskRatio, focus, countryRisk, baselineRisk);
    
    if (biasedRatio > 1.5) return 'high';
    if (biasedRatio > 1.1) return 'medium';
    if (biasedRatio < 0.7) return 'reduced';
    return 'standard';
  }

  // CORRECTED: Managed risk calculation using exact mathematical specification
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

    // Calculate overall responsiveness effectiveness
    const overallResponsivenessEffectiveness = this.calculateResponsivenessEffectiveness(responsivenessStrategy, responsivenessEffectiveness);

    // CORRECTED: Calculate country-specific managed risks per mathematical specification
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
      
      // Mathematical specification: mᵢ = max(0, bᵢ · [1 - Tᵢ · R · Fᵢ])
      const reductionFactor = countryTransparency * overallResponsivenessEffectiveness * countryFocusMultiplier;
      const managedValue = Math.max(0, countryRisk * (1 - Math.min(1, reductionFactor)));
      
      managedRisksByCountry[countryCode] = managedValue;
      totalWeightedManagedRisk += managedValue * countryVolume;
      totalVolume += countryVolume;
    });

    // Mathematical specification: M = (Σᵢ wᵢ · mᵢ) / Σᵢ wᵢ
    const managedRisk = totalVolume > 0 ? totalWeightedManagedRisk / totalVolume : 0;

    // Calculate transparency using country-specific coverage
    const overallTransparencyEffectiveness = this.calculateTransparencyEffectiveness(
      hrddStrategy, transparencyEffectiveness, safeSelected, countryVolumes, countryRisks, sanitizedFocus
    );
    
    const combinedEffectiveness = overallTransparencyEffectiveness * overallResponsivenessEffectiveness;

    // Calculate focus effectiveness metrics
    const focusEffectivenessMetrics = this.calculateFocusEffectivenessMetrics(
      safeSelected, safeCountryRisks, managedRisksByCountry, sanitizedFocus
    );

    return {
      managedRisk,
      baselineRisk,
      riskConcentration: sanitizedConcentration,
      portfolioFocusMultiplier,
      combinedEffectiveness,
      countryManagedRisks: managedRisksByCountry,
      countrySpecificCoverage,
      focusEffectivenessMetrics
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
      countryData.migrantWorkerPrevalence,
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
        name: 'Passive',
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
        name: 'Passive',
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

  // Step 3: Calculate overall responsiveness effectiveness
  calculateResponsivenessEffectiveness(responsivenessStrategy, responsivenessEffectiveness) {
    if (!this.validateResponsiveness(responsivenessStrategy) || !this.validateResponsivenessEffectiveness(responsivenessEffectiveness)) {
      return 0;
    }

    let weightedEffectiveness = 0;
    let totalWeight = 0;

    const length = Math.min(responsivenessStrategy.length, responsivenessEffectiveness.length);

    for (let i = 0; i < length; i++) {
      const strategyWeight = Math.max(0, responsivenessStrategy[i]);
      const effectiveness = (responsivenessEffectiveness[i] || 0) / 100;

      weightedEffectiveness += strategyWeight * effectiveness;
      totalWeight += strategyWeight;
    }

    return totalWeight > 0 ? weightedEffectiveness / totalWeight : 0;
  }

  // CORRECTED: Main managed risk calculation method using new approach
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
    const overallResponsivenessEffectiveness = this.calculateResponsivenessEffectiveness(responsivenessStrategy, responsivenessEffectiveness);
    const combinedEffectiveness = overallTransparencyEffectiveness * overallResponsivenessEffectiveness;

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
        name: 'Passive',
        tools: [4, 5],
        baseEffectiveness: [0.12, 0.05],
        categoryWeight: 0.70
      }
    ];

    const breakdown = {
      hrddStrategies: [],
      overallTransparency: overallTransparency,
      overallResponsiveness: this.calculateResponsivenessEffectiveness(responsivenessStrategy, responsivenessEffectiveness),
      primaryResponse: this.getPrimaryResponseMethod(responsivenessStrategy, responsivenessEffectiveness),
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

   getPrimaryResponseMethod(responsivenessStrategy, responsivenessEffectiveness) {
    const fallbackStrategy = Array.isArray(this.defaultResponsivenessStrategy)
      ? this.defaultResponsivenessStrategy
      : [];
    const safeStrategy = Array.isArray(responsivenessStrategy) && responsivenessStrategy.length > 0
      ? responsivenessStrategy
      : fallbackStrategy;

    const fallbackEffectiveness = Array.isArray(this.defaultResponsivenessEffectiveness)
      ? this.defaultResponsivenessEffectiveness
      : [];
    const safeEffectiveness = Array.isArray(responsivenessEffectiveness) && responsivenessEffectiveness.length > 0
      ? responsivenessEffectiveness
      : fallbackEffectiveness;

    if (!Array.isArray(safeStrategy) || safeStrategy.length === 0) {
      const defaultLabel = Array.isArray(this.responsivenessLabels) && this.responsivenessLabels.length > 0
        ? this.responsivenessLabels[0]
        : 'Not specified';
      const defaultEffectiveness = Number.isFinite(safeEffectiveness[0]) ? safeEffectiveness[0] : 0;

      return {
        method: defaultLabel,
        weight: 0,
        effectiveness: defaultEffectiveness
      };
    }

    let maxWeight = -Infinity;
    let primaryIndex = 0;

    for (let i = 0; i < safeStrategy.length; i++) {
      const weight = Number.isFinite(safeStrategy[i]) ? safeStrategy[i] : 0;
      if (weight > maxWeight) {
        maxWeight = weight;
        primaryIndex = i;
      }
    }

    if (!Number.isFinite(maxWeight) || maxWeight < 0) {
      maxWeight = 0;
      primaryIndex = 0;
    }

    const labelIndex = Array.isArray(this.responsivenessLabels) && this.responsivenessLabels.length > 0
      ? Math.min(primaryIndex, this.responsivenessLabels.length - 1)
      : 0;
    const effectivenessIndex = safeEffectiveness.length > 0
      ? Math.min(primaryIndex, safeEffectiveness.length - 1)
      : 0;

    return {
      method: this.responsivenessLabels?.[labelIndex] || 'Not specified',
      weight: Math.max(0, Number.isFinite(maxWeight) ? maxWeight : 0),
      effectiveness: Number.isFinite(safeEffectiveness?.[effectivenessIndex])
        ? safeEffectiveness[effectivenessIndex]
        : 0
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
    // Use detailed calculation if data available
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
        strategy: breakdown,
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
      strategy: breakdown
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
        version: '6.0',
        toolName: 'HRDD Risk Assessment Tool - Corrected Mathematical Implementation'
      },
      portfolio: {
        selectedCountries: state.selectedCountries,
        countryVolumes: state.countryVolumes,
        totalCountries: state.selectedCountries.length
      },
      step1: {
        weights: state.weights,
        baselineRisk: state.baselineRisk,
        weightLabels: ['ITUC Rights Rating', 'Corruption Index', 'Migrant Worker Prevalence', 'WJP Index', 'Walk Free Slavery Index']
      },
      step2: {
        hrddStrategy: state.hrddStrategy,
        transparencyEffectiveness: state.transparencyEffectiveness,
        strategyLabels: this.hrddStrategyLabels,
        focus: focusValue,
        riskConcentration,
        portfolioFocusMultiplier,
        methodology: 'Corrected mathematical implementation with exact specification compliance'
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
}

export const riskEngine = new RiskEngine();