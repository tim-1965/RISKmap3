// DataService.js - Enhanced API service with full functionality
export class DataService {
  constructor() {
    this.baseURL = 'https://riskmap2-production.up.railway.app/api';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Enhanced caching mechanism
  _getCacheKey(url, options = {}) {
    return `${url}_${JSON.stringify(options)}`;
  }

  _isCacheValid(cacheItem) {
    return Date.now() - cacheItem.timestamp < this.cacheTimeout;
  }

  async _fetchWithCache(url, options = {}) {
    const cacheKey = this._getCacheKey(url, options);
    const cached = this.cache.get(cacheKey);

    if (cached && this._isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache successful responses
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`API Error for ${url}:`, error);
      throw error;
    }
  }

  async getAllCountries() {
    try {
      const data = await this._fetchWithCache(`${this.baseURL}/countries`);
      // Handle different response formats from backend
      if (data.countries) return data.countries;
      if (Array.isArray(data)) return data;
      if (data.data && Array.isArray(data.data)) return data.data;
      return [];
    } catch (error) {
      console.error('Error fetching countries:', error);
      throw new Error(`Failed to load countries: ${error.message}`);
    }
  }

  async getCountries() {
    return this.getAllCountries();
  }

  async getCountry(isoCode) {
    try {
      return await this._fetchWithCache(`${this.baseURL}/countries/${isoCode}`);
    } catch (error) {
      console.error(`Error fetching country ${isoCode}:`, error);
      throw new Error(`Failed to load country ${isoCode}: ${error.message}`);
    }
  }

  async calculateRisk(countryIsoCode, weights) {
    try {
      return await this._fetchWithCache(`${this.baseURL}/calculate-risk`, {
        method: 'POST',
        body: JSON.stringify({
          countryIsoCode,
          weights
        })
      });
    } catch (error) {
      console.error(`Error calculating risk for ${countryIsoCode}:`, error);
      throw new Error(`Failed to calculate risk: ${error.message}`);
    }
  }

  // Batch calculate risks for multiple countries
  async calculateMultipleRisks(countryCodes, weights) {
    const promises = countryCodes.map(code => 
      this.calculateRisk(code, weights).catch(err => ({
        error: err.message,
        countryCode: code
      }))
    );
    return Promise.all(promises);
  }

// Calculate coverage-based risk with HRDD strategy
  async calculateCoverageBasedRisk(countryCodes, weights, hrddStrategy, transparencyEffectiveness, responsivenessStrategy, responsivenessEffectiveness, focus) {
    try {
      return await this._fetchWithCache(`${this.baseURL}/calculate-coverage-risk`, {
        method: 'POST',
        body: JSON.stringify({
          countryCodes,
          weights,
          hrddStrategy, // Coverage percentages
          transparencyEffectiveness, // Detection rates
          responsivenessStrategy,
          responsivenessEffectiveness,
          focus
        })
      });
    } catch (error) {
      console.error('Error calculating coverage-based risk:', error);
      throw new Error(`Failed to calculate coverage-based risk: ${error.message}`);
    }
  }

  // Health check for API
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL.replace('/api', '')}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // Clear cache manually
  clearCache() {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    const validEntries = Array.from(this.cache.values()).filter(item => 
      now - item.timestamp < this.cacheTimeout
    );
    
    return {
      totalEntries: this.cache.size,
      validEntries: validEntries.length,
      expiredEntries: this.cache.size - validEntries.length
    };
  }
}

export const dataService = new DataService();