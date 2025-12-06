/**
 * Local-Only Pricing Management Component
 * Works without Cloud Functions for testing purposes
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { useApp } from '../context/AppContext';

const PricingManagementLocal = ({ db, appId, userId, navigateTo }) => {
  const { userEmail } = useApp();
  const username = userEmail ? userEmail.split('@')[0] : userId;
  const [activeTab, setActiveTab] = useState('inventory');
  const [inventory, setInventory] = useState([]);
  const [pricingSettings, setPricingSettings] = useState(null);

  const [editingItem, setEditingItem] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMarkup, setFilterMarkup] = useState('all');
  const [filterPriceRange, setFilterPriceRange] = useState('all');
  const [sortBy, setSortBy] = useState('sku');
  const [sortOrder, setSortOrder] = useState('asc');

  // Stable search handler to prevent re-renders
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  // Stable filter handlers
  const handleMarkupFilterChange = useCallback((e) => {
    setFilterMarkup(e.target.value);
  }, []);

  const handlePriceFilterChange = useCallback((e) => {
    setFilterPriceRange(e.target.value);
  }, []);

  const handleSortByChange = useCallback((e) => {
    setSortBy(e.target.value);
  }, []);

  const handleSortOrderChange = useCallback((e) => {
    setSortOrder(e.target.value);
  }, []);

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setSearchTerm('');
    setFilterMarkup('all');
    setFilterPriceRange('all');
  }, []);

  // Real-time inventory listener
  useEffect(() => {
    if (!db || !appId) return;

    const unsubscribe = onSnapshot(
      collection(db, `artifacts/${appId}/public/data/inventory`),
      (snapshot) => {
        const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInventory(result);
      },
      (err) => {
        console.error('Error fetching inventory:', err);
        setNotification({ type: 'error', message: 'Failed to load inventory' });
      }
    );

    return () => unsubscribe();
  }, [db, appId]);

  // Load pricing settings
  useEffect(() => {
    loadPricingSettings();
  }, [db, appId]);



  const loadPricingSettings = async () => {
    try {
      const settingsRef = doc(db, `artifacts/${appId}/public/data/settings`, 'pricing');
      const settingsSnap = await getDoc(settingsRef);

      if (settingsSnap.exists()) {
        setPricingSettings(settingsSnap.data());
      } else {
        // Set default settings
        const defaultSettings = {
          defaultMarkupPercent: 32,
          pricingMode: 'markup',
          allocationMethod: 'weight',
          roundingDecimals: 2,
          defaultIncoterm: 'FOB',
          defaultCurrency: 'GHS',
          defaultQuoteExpiryDays: 30,
          approvalThresholds: {
            minMarginPercent: 15,
            maxDiscountPercent: 20,
            requireApprovalAbove: 10000
          },
          taxRules: {
            defaultRate: 0.12
          }
        };
        setPricingSettings(defaultSettings);
      }
    } catch (error) {
      console.error('Error loading pricing settings:', error);
      setNotification({ type: 'error', message: 'Failed to load pricing settings' });
    }
  };

  const updateInventoryCosts = async (sku, costData) => {
    setLoading(true);
    try {
      // Direct Firestore update instead of Cloud Function
      const inventoryRef = doc(db, `artifacts/${appId}/public/data/inventory`, sku);
      await setDoc(inventoryRef, {
        ...costData,
        updatedAt: new Date().toISOString(),
        updatedBy: userId
      }, { merge: true });

      setNotification({ type: 'success', message: `Updated cost components for ${sku}` });
      setEditingItem(null);
    } catch (error) {
      console.error('Error updating inventory costs:', error);
      setNotification({ type: 'error', message: 'Failed to update inventory costs' });
    } finally {
      setLoading(false);
    }
  };

  const updatePricingSettings = async (settings) => {
    setLoading(true);
    try {
      // Direct Firestore update instead of Cloud Function
      const settingsRef = doc(db, `artifacts/${appId}/public/data/settings`, 'pricing');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy: userId
      }, { merge: true });

      setPricingSettings(settings);
      setNotification({ type: 'success', message: 'Pricing settings updated successfully' });
    } catch (error) {
      console.error('Error updating pricing settings:', error);
      setNotification({ type: 'error', message: 'Failed to update pricing settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItemCosts = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const costData = {
      // Don't overwrite the base cost (price) - it comes from inventory management
      weightKg: parseFloat(formData.get('weightKg')) || 0,
      costComponents: {
        inboundFreightPerUnit: parseFloat(formData.get('inboundFreight')) || 0,
        dutyPerUnit: parseFloat(formData.get('duty')) || 0,
        insurancePerUnit: parseFloat(formData.get('insurance')) || 0,
        packagingPerUnit: parseFloat(formData.get('packaging')) || 0,
        otherPerUnit: parseFloat(formData.get('other')) || 0
      },
      markupOverridePercent: formData.get('markupOverride') ? parseFloat(formData.get('markupOverride')) : null,
      pricingTier: formData.get('pricingTier') || 'standard'
    };

    await updateInventoryCosts(editingItem.id, costData);
  };

  const handleSavePricingSettings = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const settings = {
      defaultMarkupPercent: parseFloat(formData.get('defaultMarkup')) || 32,
      pricingMode: formData.get('pricingMode') || 'markup',
      allocationMethod: formData.get('allocationMethod') || 'weight',
      roundingDecimals: parseInt(formData.get('roundingDecimals')) || 2,
      defaultIncoterm: formData.get('defaultIncoterm') || 'FOB',
      defaultCurrency: formData.get('defaultCurrency') || 'GHS',
      defaultQuoteExpiryDays: parseInt(formData.get('defaultQuoteExpiryDays')) || 30,
      approvalThresholds: {
        minMarginPercent: parseFloat(formData.get('minMarginPercent')) || 15,
        maxDiscountPercent: parseFloat(formData.get('maxDiscountPercent')) || 20,
        requireApprovalAbove: parseFloat(formData.get('requireApprovalAbove')) || 10000
      },
      taxRules: {
        defaultRate: parseFloat(formData.get('defaultTaxRate')) || 0.12
      }
    };

    await updatePricingSettings(settings);
  };



  // Calculate final price for an item
  const calculateFinalPrice = (item) => {
    // Base cost comes from inventory management (price field)
    const baseCost = item.price || 0;
    const freight = item.costComponents?.inboundFreightPerUnit || 0;
    const duties = item.costComponents?.dutyPerUnit || 0;
    const insurance = item.costComponents?.insurancePerUnit || 0;
    const packaging = item.costComponents?.packagingPerUnit || 0;
    const otherCharges = item.costComponents?.otherPerUnit || 0;
    const markupPercent = item.markupOverridePercent || (pricingSettings?.defaultMarkupPercent || 32);

    const landedCost = baseCost + freight + duties + insurance + packaging + otherCharges;
    const finalPrice = landedCost * (1 + markupPercent / 100);

    return Number(finalPrice.toFixed(2));
  };

  // Memoized filtered and sorted inventory to prevent unnecessary re-renders
  const filteredAndSortedInventory = useMemo(() => {
    let filtered = inventory.filter(item => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        item.id.toLowerCase().includes(searchLower) ||
        item.name.toLowerCase().includes(searchLower) ||
        (item.vendor && item.vendor.toLowerCase().includes(searchLower));

      // Markup filter
      const itemMarkup = item.markupOverridePercent || (pricingSettings?.defaultMarkupPercent || 32);
      const matchesMarkup = filterMarkup === 'all' ||
        (filterMarkup === 'low' && itemMarkup < 20) ||
        (filterMarkup === 'medium' && itemMarkup >= 20 && itemMarkup < 40) ||
        (filterMarkup === 'high' && itemMarkup >= 40);

      // Price range filter
      const finalPrice = calculateFinalPrice(item);
      const matchesPriceRange = filterPriceRange === 'all' ||
        (filterPriceRange === 'low' && finalPrice < 1000) ||
        (filterPriceRange === 'medium' && finalPrice >= 1000 && finalPrice < 5000) ||
        (filterPriceRange === 'high' && finalPrice >= 5000);

      return matchesSearch && matchesMarkup && matchesPriceRange;
    });

    // Sort logic
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'sku':
          aValue = a.id;
          bValue = b.id;
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'baseCost':
          aValue = a.price || 0;
          bValue = b.price || 0;
          break;
        case 'finalPrice':
          aValue = calculateFinalPrice(a);
          bValue = calculateFinalPrice(b);
          break;
        case 'markup':
          aValue = a.markupOverridePercent || (pricingSettings?.defaultMarkupPercent || 32);
          bValue = b.markupOverridePercent || (pricingSettings?.defaultMarkupPercent || 32);
          break;
        default:
          aValue = a.id;
          bValue = b.id;
      }

      if (typeof aValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      } else {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });

    return filtered;
  }, [inventory, searchTerm, filterMarkup, filterPriceRange, sortBy, sortOrder, pricingSettings]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => navigateTo('controllerDashboard')}
                  className="flex items-center text-blue-600 hover:text-blue-800 mb-2"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Controller Dashboard
                </button>
                <h1 className="text-3xl font-bold text-gray-900">Pricing Management (Local Mode)</h1>
                <p className="mt-2 text-gray-600">
                  Manage cost components and pricing settings. This version works without Cloud Functions.
                </p>
              </div>
              <div className="flex flex-col items-end space-y-2">
                <div className="text-sm text-gray-500">
                  <div>User: {username}</div>
                  <div>App: {appId}</div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => navigateTo('inventory')}
                    className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Inventory
                  </button>
                  <button
                    onClick={() => navigateTo('customers')}
                    className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Customers
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Notification */}
          {notification && (
            <div className={`mb-6 p-4 rounded-md ${notification.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
              {notification.message}
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('inventory')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'inventory'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Price List
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Pricing Settings
              </button>

            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Price List Management</h3>

                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-800">Integration with Inventory Management</h4>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          <strong>Base Cost:</strong> Automatically pulled from Inventory Management (price field)
                        </p>
                        <p>
                          <strong>Additional Costs:</strong> Set here (freight, duties, insurance, packaging, other charges)
                        </p>
                        <p>
                          <strong>Final Price:</strong> (Base Cost + Additional Costs) × (1 + Markup%)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search and Filter Controls */}
                <div className="mb-6 space-y-4">
                  {/* Search Bar */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                        Search Items
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          id="search"
                          placeholder="Search by SKU, name, or vendor..."
                          value={searchTerm}
                          onChange={handleSearchChange}
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Clear Search Button */}
                    {searchTerm && (
                      <div className="flex items-end">
                        <button
                          onClick={() => setSearchTerm('')}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filters Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Markup Filter */}
                    <div>
                      <label htmlFor="markupFilter" className="block text-sm font-medium text-gray-700 mb-1">
                        Markup Range
                      </label>
                      <select
                        id="markupFilter"
                        value={filterMarkup}
                        onChange={handleMarkupFilterChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Markups</option>
                        <option value="low">Low (&lt; 20%)</option>
                        <option value="medium">Medium (20-40%)</option>
                        <option value="high">High (&gt; 40%)</option>
                      </select>
                    </div>

                    {/* Price Range Filter */}
                    <div>
                      <label htmlFor="priceFilter" className="block text-sm font-medium text-gray-700 mb-1">
                        Price Range
                      </label>
                      <select
                        id="priceFilter"
                        value={filterPriceRange}
                        onChange={handlePriceFilterChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Prices</option>
                        <option value="low">Low (&lt; GHS 1,000)</option>
                        <option value="medium">Medium (GHS 1,000-5,000)</option>
                        <option value="high">High (&gt; GHS 5,000)</option>
                      </select>
                    </div>

                    {/* Sort By */}
                    <div>
                      <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700 mb-1">
                        Sort By
                      </label>
                      <select
                        id="sortBy"
                        value={sortBy}
                        onChange={handleSortByChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="sku">SKU</option>
                        <option value="name">Name</option>
                        <option value="baseCost">Base Cost</option>
                        <option value="finalPrice">Final Price</option>
                        <option value="markup">Markup %</option>
                      </select>
                    </div>

                    {/* Sort Order */}
                    <div>
                      <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700 mb-1">
                        Order
                      </label>
                      <select
                        id="sortOrder"
                        value={sortOrder}
                        onChange={handleSortOrderChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                    </div>
                  </div>

                  {/* Results Summary */}
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>
                      Showing {filteredAndSortedInventory.length} of {inventory.length} items
                      {searchTerm && ` matching "${searchTerm}"`}
                    </span>
                    {(searchTerm || filterMarkup !== 'all' || filterPriceRange !== 'all') && (
                      <button
                        onClick={handleClearAllFilters}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Cost</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Freight</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duties</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insurance</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Packaging</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Other Charges</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Markup %</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-200">Final Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredAndSortedInventory.length > 0 ? (
                        filteredAndSortedInventory.map((item) => {
                          const finalPrice = calculateFinalPrice(item);
                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{item.id}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.price ? `GHS ${item.price.toFixed(2)}` : 'GHS 0.00'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.costComponents?.inboundFreightPerUnit ? `GHS ${item.costComponents.inboundFreightPerUnit.toFixed(2)}` : 'GHS 0.00'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.costComponents?.dutyPerUnit ? `GHS ${item.costComponents.dutyPerUnit.toFixed(2)}` : 'GHS 0.00'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.costComponents?.insurancePerUnit ? `GHS ${item.costComponents.insurancePerUnit.toFixed(2)}` : 'GHS 0.00'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.costComponents?.packagingPerUnit ? `GHS ${item.costComponents.packagingPerUnit.toFixed(2)}` : 'GHS 0.00'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.costComponents?.otherPerUnit ? `GHS ${item.costComponents.otherPerUnit.toFixed(2)}` : 'GHS 0.00'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {item.markupOverridePercent ? `${item.markupOverridePercent.toFixed(1)}%` : `${pricingSettings?.defaultMarkupPercent || 32}%`}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900 bg-gray-100">
                                GHS {finalPrice.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                <button
                                  onClick={() => setEditingItem(item)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  Edit Pricing
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                            <div className="flex flex-col items-center">
                              <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.709M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
                              <p className="text-gray-500 mb-4">
                                {searchTerm || filterMarkup !== 'all' || filterPriceRange !== 'all'
                                  ? 'Try adjusting your search criteria or filters'
                                  : 'No items available in inventory'
                                }
                              </p>
                              {(searchTerm || filterMarkup !== 'all' || filterPriceRange !== 'all') && (
                                <button
                                  onClick={handleClearAllFilters}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  Clear All Filters
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Edit Item Modal */}
              {editingItem && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                  <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                    <div className="mt-3">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Edit Pricing Components - {editingItem.name}
                      </h3>

                      <form onSubmit={handleSaveItemCosts} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Base Cost (GHS)</label>
                          <div className="mt-1 p-3 bg-gray-50 border border-gray-300 rounded-md">
                            <span className="text-sm text-gray-600">
                              {editingItem.price ? `GHS ${editingItem.price.toFixed(2)}` : 'GHS 0.00'}
                            </span>
                            <p className="text-xs text-gray-500 mt-1">
                              Base cost is set in Inventory Management and cannot be changed here
                            </p>
                          </div>
                          {/* Hidden input to maintain form structure */}
                          <input type="hidden" name="unitCost" value={editingItem.price || 0} />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
                          <input
                            type="number"
                            step="0.1"
                            name="weightKg"
                            defaultValue={editingItem.weightKg || 0}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Inbound Freight</label>
                            <input
                              type="number"
                              step="0.01"
                              name="inboundFreight"
                              defaultValue={editingItem.costComponents?.inboundFreightPerUnit || 0}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700">Duty</label>
                            <input
                              type="number"
                              step="0.01"
                              name="duty"
                              defaultValue={editingItem.costComponents?.dutyPerUnit || 0}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700">Insurance</label>
                            <input
                              type="number"
                              step="0.01"
                              name="insurance"
                              defaultValue={editingItem.costComponents?.insurancePerUnit || 0}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700">Packaging</label>
                            <input
                              type="number"
                              step="0.01"
                              name="packaging"
                              defaultValue={editingItem.costComponents?.packagingPerUnit || 0}
                              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Other Charges</label>
                          <input
                            type="number"
                            step="0.01"
                            name="other"
                            defaultValue={editingItem.costComponents?.otherPerUnit || 0}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Markup Override (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            name="markupOverride"
                            defaultValue={editingItem.markupOverridePercent || ''}
                            placeholder="Leave empty to use default"
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Pricing Tier</label>
                          <select
                            name="pricingTier"
                            defaultValue={editingItem.pricingTier || 'standard'}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="budget">Budget</option>
                          </select>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4">
                          <button
                            type="button"
                            onClick={() => setEditingItem(null)}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                          >
                            {loading ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Global Pricing Settings</h3>

                {pricingSettings && (
                  <form onSubmit={handleSavePricingSettings} className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Default Markup (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          name="defaultMarkup"
                          defaultValue={pricingSettings.defaultMarkupPercent}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Pricing Mode</label>
                        <select
                          name="pricingMode"
                          defaultValue={pricingSettings.pricingMode}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="markup">Markup</option>
                          <option value="margin">Margin</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Allocation Method</label>
                        <select
                          name="allocationMethod"
                          defaultValue={pricingSettings.allocationMethod}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="weight">By Weight</option>
                          <option value="value">By Value</option>
                          <option value="equal">Equal Distribution</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Rounding Decimals</label>
                        <input
                          type="number"
                          min="0"
                          max="4"
                          name="roundingDecimals"
                          defaultValue={pricingSettings.roundingDecimals}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-6">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Invoice Settings Tab */}

        </div>
      </div>
    </div>
  );
};

export default PricingManagementLocal;
