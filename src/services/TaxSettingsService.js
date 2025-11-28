/**
 * Global Tax Settings Service
 * Manages tax rates and configurations across the entire application
 */

import { db } from '../firebase-config';

const TAX_SETTINGS_COLLECTION = 'systemSettings';
const TAX_SETTINGS_DOC = 'taxSettings';

/**
 * Default tax configuration
 */
const DEFAULT_TAX_CONFIG = {
  nhil: {
    enabled: true,
    rate: 7.5,
    label: 'NHIL',
    description: 'National Health Insurance Levy',
    onSubtotal: true
  },
  getfund: {
    enabled: true,
    rate: 2.5,
    label: 'GETFund Levy',
    description: 'Ghana Education Trust Fund Levy',
    onSubtotal: true
  },
  covidLevy: {
    enabled: true,
    rate: 1.0,
    label: 'COVID-19 HRL',
    description: 'COVID-19 Health Recovery Levy',
    onSubtotal: true
  },
  vat: {
    enabled: true,
    rate: 15.0,
    label: 'VAT',
    description: 'Value Added Tax',
    onLevyTotal: true
  },
  importDuty: {
    enabled: false,
    rate: 20.0,
    label: 'Import Duty',
    description: 'Import Duty for imported goods',
    onSubtotal: true
  }
};

class TaxSettingsService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get current tax settings with caching
   */
  async getTaxSettings(forceRefresh = false) {
    try {
      // Check cache first
      if (!forceRefresh && this.cache && this.isCacheValid()) {
        console.log('📊 [TaxSettings] Using cached tax settings');
        return this.cache;
      }

      console.log('📊 [TaxSettings] Fetching tax settings from database');
      
      const docRef = db.collection(TAX_SETTINGS_COLLECTION).doc(TAX_SETTINGS_DOC);
      const doc = await docRef.get();
      
      if (doc.exists) {
        const data = doc.data();
        this.cache = {
          ...DEFAULT_TAX_CONFIG,
          ...data.taxConfig,
          lastUpdated: data.lastUpdated || new Date().toISOString(),
          updatedBy: data.updatedBy || 'system'
        };
      } else {
        // Create default settings if none exist
        console.log('📊 [TaxSettings] Creating default tax settings');
        this.cache = {
          ...DEFAULT_TAX_CONFIG,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'system'
        };
        await this.saveTaxSettings(this.cache);
      }
      
      this.cacheTimestamp = Date.now();
      return this.cache;
    } catch (error) {
      console.error('❌ [TaxSettings] Error fetching tax settings:', error);
      return DEFAULT_TAX_CONFIG;
    }
  }

  /**
   * Save tax settings
   */
  async saveTaxSettings(taxConfig, updatedBy = 'admin') {
    try {
      const settingsData = {
        taxConfig,
        lastUpdated: new Date().toISOString(),
        updatedBy
      };

      const docRef = db.collection(TAX_SETTINGS_COLLECTION).doc(TAX_SETTINGS_DOC);
      await docRef.set(settingsData, { merge: true });

      // Update cache
      this.cache = {
        ...DEFAULT_TAX_CONFIG,
        ...taxConfig,
        lastUpdated: settingsData.lastUpdated,
        updatedBy
      };
      this.cacheTimestamp = Date.now();

      console.log('✅ [TaxSettings] Tax settings saved successfully');
      return this.cache;
    } catch (error) {
      console.error('❌ [TaxSettings] Error saving tax settings:', error);
      throw error;
    }
  }

  /**
   * Calculate taxes based on current settings
   */
  async calculateTaxes(subtotal, options = {}) {
    const taxSettings = await this.getTaxSettings();
    const { excludeTaxes = [], includeOnly = null } = options;

    let levyTotal = subtotal;
    const taxes = {
      subtotal,
      enabledTaxes: [],
      breakdown: {},
      grandTotal: subtotal
    };

    // Calculate NHIL and GETFund (on subtotal)
    if (taxSettings.nhil.enabled && (!includeOnly || includeOnly.includes('nhil'))) {
      if (!excludeTaxes.includes('nhil')) {
        const nhilAmount = subtotal * (taxSettings.nhil.rate / 100);
        taxes.breakdown.nhil = {
          amount: nhilAmount,
          rate: taxSettings.nhil.rate,
          label: taxSettings.nhil.label,
          description: taxSettings.nhil.description
        };
        taxes.enabledTaxes.push(taxes.breakdown.nhil);
        levyTotal += nhilAmount;
      }
    }

    if (taxSettings.getfund.enabled && (!includeOnly || includeOnly.includes('getfund'))) {
      if (!excludeTaxes.includes('getfund')) {
        const getfundAmount = subtotal * (taxSettings.getfund.rate / 100);
        taxes.breakdown.getfund = {
          amount: getfundAmount,
          rate: taxSettings.getfund.rate,
          label: taxSettings.getfund.label,
          description: taxSettings.getfund.description
        };
        taxes.enabledTaxes.push(taxes.breakdown.getfund);
        levyTotal += getfundAmount;
      }
    }

    // Calculate COVID levy (on levy total)
    if (taxSettings.covidLevy.enabled && (!includeOnly || includeOnly.includes('covidLevy'))) {
      if (!excludeTaxes.includes('covidLevy')) {
        const covidAmount = levyTotal * (taxSettings.covidLevy.rate / 100);
        taxes.breakdown.covidLevy = {
          amount: covidAmount,
          rate: taxSettings.covidLevy.rate,
          label: taxSettings.covidLevy.label,
          description: taxSettings.covidLevy.description
        };
        taxes.enabledTaxes.push(taxes.breakdown.covidLevy);
        levyTotal += covidAmount;
      }
    }

    // Calculate VAT (on levy total)
    if (taxSettings.vat.enabled && (!includeOnly || includeOnly.includes('vat'))) {
      if (!excludeTaxes.includes('vat')) {
        const vatAmount = levyTotal * (taxSettings.vat.rate / 100);
        taxes.breakdown.vat = {
          amount: vatAmount,
          rate: taxSettings.vat.rate,
          label: taxSettings.vat.label,
          description: taxSettings.vat.description
        };
        taxes.enabledTaxes.push(taxes.breakdown.vat);
        levyTotal += vatAmount;
      }
    }

    taxes.levyTotal = levyTotal;
    taxes.grandTotal = levyTotal;

    return taxes;
  }

  /**
   * Get formatted tax rates for AI/display
   */
  async getFormattedTaxRates() {
    const taxSettings = await this.getTaxSettings();
    const formattedRates = [];

    Object.entries(taxSettings).forEach(([key, config]) => {
      if (typeof config === 'object' && config.enabled && config.rate !== undefined) {
        formattedRates.push(`- ${config.label}: ${config.rate}%`);
      }
    });

    return formattedRates.join('\n');
  }

  /**
   * Get tax settings for AI context
   */
  async getTaxContextForAI() {
    const taxSettings = await this.getTaxSettings();
    return {
      nhil: taxSettings.nhil.enabled ? taxSettings.nhil.rate : 0,
      getfund: taxSettings.getfund.enabled ? taxSettings.getfund.rate : 0,
      covidLevy: taxSettings.covidLevy.enabled ? taxSettings.covidLevy.rate : 0,
      vat: taxSettings.vat.enabled ? taxSettings.vat.rate : 0,
      importDuty: taxSettings.importDuty.enabled ? taxSettings.importDuty.rate : 0
    };
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    return this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION;
  }

  /**
   * Clear cache (force refresh on next request)
   */
  clearCache() {
    this.cache = null;
    this.cacheTimestamp = null;
    console.log('📊 [TaxSettings] Cache cleared');
  }

  /**
   * Validate tax configuration
   */
  validateTaxConfig(taxConfig) {
    const errors = [];
    
    Object.entries(taxConfig).forEach(([key, config]) => {
      if (typeof config === 'object' && config !== null) {
        if (config.enabled && (config.rate < 0 || config.rate > 100)) {
          errors.push(`${key}: Rate must be between 0 and 100`);
        }
        if (config.rate !== undefined && isNaN(config.rate)) {
          errors.push(`${key}: Rate must be a number`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const taxSettingsService = new TaxSettingsService();
export default taxSettingsService;
