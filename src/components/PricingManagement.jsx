/**
 * Pricing Management Component for Controllers
 * Allows management of cost components, pricing settings, and inventory costs
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PricingManagement = ({ db, appId, userId }) => {
  const [activeTab, setActiveTab] = useState('inventory');
  const [inventory, setInventory] = useState([]);
  const [pricingSettings, setPricingSettings] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const functions = getFunctions();
      const updateInventoryCosts = httpsCallable(functions, 'updateInventoryCosts');
      
      await updateInventoryCosts({
        sku,
        costData,
        appId
      });
      
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
      const functions = getFunctions();
      const updatePricingSettings = httpsCallable(functions, 'updatePricingSettings');
      
      await updatePricingSettings({
        settings,
        appId
      });
      
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
      unitCost: parseFloat(formData.get('unitCost')) || 0,
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

  const InventoryCostEditor = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Inventory Cost Management</h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Cost</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight (kg)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Freight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duty</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insurance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inventory.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.unitCost ? `GHS ${item.unitCost.toFixed(2)}` : 'Not set'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.weightKg ? `${item.weightKg} kg` : 'Not set'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.costComponents?.inboundFreightPerUnit ? `GHS ${item.costComponents.inboundFreightPerUnit.toFixed(2)}` : 'Not set'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.costComponents?.dutyPerUnit ? `GHS ${item.costComponents.dutyPerUnit.toFixed(2)}` : 'Not set'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.costComponents?.insurancePerUnit ? `GHS ${item.costComponents.insurancePerUnit.toFixed(2)}` : 'Not set'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Edit Costs
                    </button>
                  </td>
                </tr>
              ))}
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
                Edit Cost Components - {editingItem.name}
              </h3>
              
              <form onSubmit={handleSaveItemCosts} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Base Cost (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="unitCost"
                    defaultValue={editingItem.unitCost || 0}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
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
  );

  const PricingSettingsEditor = () => (
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Default Incoterm</label>
                <select
                  name="defaultIncoterm"
                  defaultValue={pricingSettings.defaultIncoterm}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="EXW">EXW - Ex Works</option>
                  <option value="FOB">FOB - Free On Board</option>
                  <option value="CIF">CIF - Cost, Insurance & Freight</option>
                  <option value="DDP">DDP - Delivered Duty Paid</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Default Currency</label>
                <select
                  name="defaultCurrency"
                  defaultValue={pricingSettings.defaultCurrency}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="GHS">GHS - Ghana Cedi</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
            </div>
            
            <div className="border-t pt-6">
              <h4 className="text-md font-medium text-gray-900 mb-4">Approval Thresholds</h4>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Min Margin (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="minMarginPercent"
                    defaultValue={pricingSettings.approvalThresholds?.minMarginPercent}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max Discount (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="maxDiscountPercent"
                    defaultValue={pricingSettings.approvalThresholds?.maxDiscountPercent}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Approval Above (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="requireApprovalAbove"
                    defaultValue={pricingSettings.approvalThresholds?.requireApprovalAbove}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="border-t pt-6">
              <h4 className="text-md font-medium text-gray-900 mb-4">Tax Settings</h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Default Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="defaultTaxRate"
                    defaultValue={(pricingSettings.taxRules?.defaultRate || 0.12) * 100}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quote Expiry (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    name="defaultQuoteExpiryDays"
                    defaultValue={pricingSettings.defaultQuoteExpiryDays}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
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
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Pricing Management</h1>
            <p className="mt-2 text-gray-600">
              Manage cost components, pricing settings, and inventory costs for accurate quote generation.
            </p>
          </div>

          {/* Notification */}
          {notification && (
            <div className={`mb-6 p-4 rounded-md ${
              notification.type === 'success' 
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
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'inventory'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Inventory Costs
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'settings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Pricing Settings
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'inventory' && <InventoryCostEditor />}
          {activeTab === 'settings' && <PricingSettingsEditor />}
        </div>
      </div>
    </div>
  );
};

export default PricingManagement;
