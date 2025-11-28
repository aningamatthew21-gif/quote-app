import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import Notification from '../components/common/Notification';
import TargetsSettings from '../components/settings/TargetsSettings';
import SignaturesSettings from '../components/settings/SignaturesSettings';
import PriceListSettings from '../components/settings/PriceListSettings';
import CompanyDataSettings from '../components/settings/CompanyDataSettings';

import { useActivityLog } from '../hooks/useActivityLog';

const TaxSettings = ({ navigateTo, db, appId, userId, currentUser }) => {
    const { log } = useActivityLog();
    const [taxes, setTaxes] = useState([]);
    const [notification, setNotification] = useState(null);
    const [activeTab, setActiveTab] = useState('taxes');

    // --- Exchange Rate Settings State ---
    const [rateMonth, setRateMonth] = useState(() => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const value = `${now.getFullYear()}-${month}`;
        console.log('🗓️ [DEBUG] rateMonth initialized:', value);
        return value;
    });
    const [usdToGhs, setUsdToGhs] = useState(() => {
        console.log('💱 [DEBUG] Initializing usdToGhs state to blank');
        return '';
    });
    const [ratesLoading, setRatesLoading] = useState(true);
    const [ratesHistory, setRatesHistory] = useState(() => {
        console.log('📈 [DEBUG] Initializing ratesHistory as empty array');
        return [];
    });
    const [showRatesTable, setShowRatesTable] = useState(false);
    const currentMonthKey = useMemo(() => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const key = `${now.getFullYear()}-${month}`;
        console.log('🗝️ [DEBUG] Computed currentMonthKey:', key);
        return key;
    }, []);
    const currentMonthRate = useMemo(() => {
        const found = ratesHistory.find(r => r.month === currentMonthKey);
        const value = found ? Number(found.usdToGhs) : null;
        console.log('📌 [DEBUG] Derived currentMonthRate:', { month: currentMonthKey, value });
        return value;
    }, [ratesHistory, currentMonthKey]);

    const taxDocRef = useMemo(() => doc(db, `artifacts/${appId}/public/data/settings`, 'taxes'), [db, appId]);
    const exchangeRatesDocRef = useMemo(() => {
        console.log('🔗 [DEBUG] Creating exchangeRatesDocRef');
        const ref = doc(db, `artifacts/${appId}/public/data/settings`, 'exchangeRates');
        console.log('🔗 [DEBUG] exchangeRatesDocRef path:', ref.path);
        return ref;
    }, [db, appId]);

    // --- Load Exchange Rates History ---
    useEffect(() => {
        console.log('📡 [DEBUG] Setting up onSnapshot for exchange rates');
        if (!exchangeRatesDocRef) {
            console.warn('⚠️ [DEBUG] exchangeRatesDocRef missing');
            return;
        }
        const unsubscribe = onSnapshot(exchangeRatesDocRef, (docSnap) => {
            console.log('📡 [DEBUG] ExchangeRates snapshot received:', { exists: docSnap.exists() });
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log('📦 [DEBUG] Raw exchangeRates data:', data);
                const list = Array.isArray(data.rates) ? data.rates : [];
                console.log('📊 [DEBUG] Parsed rates list length:', list.length);
                setRatesHistory(list.sort((a, b) => (a.month > b.month ? -1 : 1)));
                // Pre-fill current month if available
                const current = list.find(r => r.month === rateMonth);
                if (current && typeof current.usdToGhs === 'number') {
                    console.log('↪️ [DEBUG] Prefilling usdToGhs from existing entry:', current.usdToGhs);
                    setUsdToGhs(String(current.usdToGhs));
                }
            } else {
                console.log('🆕 [DEBUG] ExchangeRates doc does not exist. Creating placeholder on save.');
                setRatesHistory([]);
            }
            setRatesLoading(false);
            console.log('✅ [DEBUG] Exchange rates loading complete');
        }, (error) => {
            console.error('❌ [ERROR] ExchangeRates snapshot error:', error);
            setRatesLoading(false);
            setNotification({ type: 'error', message: 'Failed to load exchange rates. Please refresh.' });
        });
        return () => {
            console.log('🔄 [DEBUG] Cleaning up exchange rates listener');
            unsubscribe();
        };
    }, [exchangeRatesDocRef, rateMonth]);

    const handleSaveExchangeRate = async () => {
        console.log('💾 [DEBUG] handleSaveExchangeRate called', { rateMonth, usdToGhs });
        try {
            const numericRate = parseFloat(usdToGhs);
            console.log('🧮 [DEBUG] Parsed numericRate:', numericRate);
            if (!rateMonth || isNaN(numericRate) || numericRate <= 0) {
                console.warn('⚠️ [DEBUG] Validation failed for exchange rate input');
                setNotification({ type: 'error', message: 'Enter a valid month and positive rate.' });
                return;
            }

            // Merge or insert for the month
            const existing = ratesHistory.find(r => r.month === rateMonth);
            console.log('🔎 [DEBUG] Existing month entry:', existing);
            let updatedRates;
            if (existing) {
                updatedRates = ratesHistory.map(r => r.month === rateMonth ? { ...r, usdToGhs: numericRate, updatedAt: new Date().toISOString(), updatedBy: userId } : r);
                console.log('📝 [DEBUG] Updated existing month in rates array');
            } else {
                const newEntry = { id: Date.now().toString(), month: rateMonth, usdToGhs: numericRate, createdAt: new Date().toISOString(), createdBy: userId };
                updatedRates = [...ratesHistory, newEntry];
                console.log('➕ [DEBUG] Added new month entry:', newEntry);
            }

            // Sort descending by month string
            updatedRates.sort((a, b) => (a.month > b.month ? -1 : 1));
            console.log('📊 [DEBUG] Sorted updatedRates length:', updatedRates.length);

            await setDoc(exchangeRatesDocRef, { rates: updatedRates }, { merge: true });
            console.log('✅ [DEBUG] Exchange rates saved to Firestore');

            await log('SETTINGS_CHANGE', `Updated exchange rate for ${rateMonth} to ${numericRate}`, {
                category: 'settings',
                settingType: 'exchange_rate',
                details: {
                    month: rateMonth,
                    rate: numericRate
                }
            });

            setRatesHistory(updatedRates);
            setNotification({ type: 'success', message: 'Exchange rate saved successfully.' });
        } catch (error) {
            console.error('❌ [ERROR] handleSaveExchangeRate failed:', error);
            setNotification({ type: 'error', message: 'Failed to save exchange rate.' });
        }
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(taxDocRef, (docSnap) => {
            if (docSnap.exists()) {
                console.log("Taxessssss21", docSnap.data().taxArray);
                setTaxes(docSnap.data().taxArray || []);
            } else {
                const initialTaxes = [
                    { id: 'vat', name: 'VAT Standard', rate: 15.0, enabled: true },
                    { id: 'nhil', name: 'NHIL', rate: 2.5, enabled: true },
                    { id: 'getfund', name: 'GETFund', rate: 2.5, enabled: true },
                    { id: 'covid19', name: 'COVID-19 Levy', rate: 1.0, enabled: true }
                ];
                setDoc(taxDocRef, { taxArray: initialTaxes });
                console.log("InitialTaxessssss1", initialTaxes);
                setTaxes(initialTaxes);
            }
        });
        return () => unsubscribe();
    }, [taxDocRef]);

    const handleTaxChange = (id, field, value) => {
        setTaxes(currentTaxes =>
            currentTaxes.map(t =>
                t.id === id ? { ...t, [field]: field === 'rate' ? parseFloat(value) || 0 : value } : t
            )
        );
    };

    const handleSaveChanges = async () => {
        try {
            await setDoc(taxDocRef, { taxArray: taxes });

            await log('SETTINGS_CHANGE', `Updated Tax Settings: Modified ${taxes.length} tax/levy settings`, {
                category: 'settings',
                settingType: 'taxes',
                impact: 'Global tax configuration updated'
            });

            setNotification({ type: 'success', message: 'Tax settings saved successfully!' });
        } catch (error) {
            console.error("Error saving tax settings: ", error);
            setNotification({ type: 'error', message: 'Failed to save settings.' });
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">System Settings</h1>
                    {currentUser && currentUser.role === 'controller' && <button onClick={() => navigateTo('controllerDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>}
                    {currentUser && currentUser.role === 'sales' && <button onClick={() => navigateTo('salesDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Sales</button>}
                </header>

                {/* Tab Navigation */}
                <div className="flex space-x-4 mb-6 border-b border-gray-200 pb-1 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('taxes')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'taxes' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Tax & Rates
                    </button>
                    <button
                        onClick={() => setActiveTab('signatures')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'signatures' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Signatures
                    </button>
                    <button
                        onClick={() => setActiveTab('pricelist')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'pricelist' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Price List
                    </button>
                    <button
                        onClick={() => setActiveTab('targets')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'targets' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Revenue Targets
                    </button>
                    <button
                        onClick={() => setActiveTab('companyData')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'companyData' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Company Data
                    </button>
                </div>

                {activeTab === 'taxes' && (
                    <>
                        {currentUser && currentUser.role === 'controller' && <div className="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
                            <p className="text-gray-600 mb-6">These settings are applied globally to all new invoices.</p>
                            <div className="space-y-4">
                                {taxes.map(tax => (
                                    <div key={tax.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={tax.enabled}
                                                onChange={e => handleTaxChange(tax.id, 'enabled', e.target.checked)}
                                                className="mr-3 h-5 w-5"
                                            />
                                            <input
                                                type="text"
                                                value={tax.name}
                                                onChange={e => handleTaxChange(tax.id, 'name', e.target.value)}
                                                className="font-semibold bg-transparent w-40"
                                            />
                                        </div>
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                value={tax.rate}
                                                onChange={e => handleTaxChange(tax.id, 'rate', e.target.value)}
                                                className="w-20 text-right p-1 border rounded-md"
                                            />
                                            <span className="ml-2">%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 text-right">
                                <button onClick={handleSaveChanges} className="py-2 px-6 text-white bg-blue-600 rounded-md font-semibold">Save Changes</button>
                            </div>
                        </div>}

                        {/* Exchange Rate Settings Section */}
                        {currentUser && currentUser.role === 'controller' && <div className="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto mt-8">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-700">Rate Settings</h2>
                                    <p className="text-gray-600">Set monthly USD → GHS rate for quoting.</p>
                                </div>
                                <div className="ml-4 flex-shrink-0">
                                    <div className="rounded-lg border bg-blue-50 text-blue-800 px-4 py-3 shadow-sm">
                                        <div className="text-xs uppercase tracking-wide text-blue-700">Current Month</div>
                                        <div className="text-sm text-blue-900 font-semibold">{currentMonthKey}</div>
                                        <div className="text-2xl font-extrabold mt-1">
                                            {currentMonthRate ? `GHS ${currentMonthRate.toFixed(4)} / USD` : 'Not set'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="flex flex-col">
                                    <label className="text-sm text-gray-600 mb-1">Month</label>
                                    <input
                                        type="month"
                                        value={rateMonth}
                                        onChange={(e) => { console.log('🗓️ [DEBUG] rateMonth change:', e.target.value); setRateMonth(e.target.value); }}
                                        className="p-2 border rounded-md"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm text-gray-600 mb-1">USD → GHS</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        placeholder="e.g. 15.2500"
                                        value={usdToGhs}
                                        onChange={(e) => { console.log('💱 [DEBUG] usdToGhs change:', e.target.value); setUsdToGhs(e.target.value); }}
                                        className="p-2 border rounded-md"
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={handleSaveExchangeRate} className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700">Save Rate</button>
                                    <button onClick={() => { console.log('📋 [DEBUG] toggle rates table'); setShowRatesTable(!showRatesTable); }} className="py-2 px-4 bg-gray-100 rounded-md border">{showRatesTable ? 'Hide' : 'View'} History</button>
                                </div>
                            </div>
                            {ratesLoading ? (
                                <div className="text-sm text-gray-500 mt-4">Loading rates...</div>
                            ) : null}
                            {showRatesTable && (
                                <div className="mt-6 overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-gray-600">
                                                <th className="py-2 pr-4">Month</th>
                                                <th className="py-2 pr-4">USD → GHS</th>
                                                <th className="py-2 pr-4">Updated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ratesHistory.length === 0 ? (
                                                <tr><td className="py-3 text-gray-500" colSpan="3">No rates saved yet.</td></tr>
                                            ) : (
                                                ratesHistory.map((r) => (
                                                    <tr key={r.id || r.month} className="border-t">
                                                        <td className="py-2 pr-4">{r.month}</td>
                                                        <td className="py-2 pr-4">{Number(r.usdToGhs).toFixed(4)}</td>
                                                        <td className="py-2 pr-4">{r.updatedAt || r.createdAt}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>}
                    </>
                )}

                {activeTab === 'signatures' && (
                    <SignaturesSettings db={db} appId={appId} userId={userId} />
                )}

                {activeTab === 'pricelist' && (
                    <PriceListSettings db={db} appId={appId} currentMonthRate={currentMonthRate} currentMonthKey={currentMonthKey} />
                )}

                {activeTab === 'companyData' && (
                    <CompanyDataSettings db={db} appId={appId} log={log} />
                )}

                {activeTab === 'targets' && (
                    <TargetsSettings appId={appId} />
                )}
            </div>
        </div>
    );
};

export default TaxSettings;
