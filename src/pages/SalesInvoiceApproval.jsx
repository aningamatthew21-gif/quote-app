import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, doc, writeBatch, getDocs } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import { formatCurrency } from '../utils/formatting';
import { logInvoiceActivity } from '../utils/logger';
import { getInvoiceDate } from '../utils/helpers';
import { useApp } from '../context/AppContext';

const SalesInvoiceApproval = ({ navigateTo, db, appId, userId }) => {
    const { userEmail, appUser } = useApp();
    const username = userEmail ? userEmail.split('@')[0] : userId;

    // CRITICAL: Determine Role
    const isController = appUser?.role === 'controller';

    // Real-time data fetching
    const [invoices, setInvoices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [signatures, setSignatures] = useState([]);
    const [selectedSignature, setSelectedSignature] = useState(null);
    const [notification, setNotification] = useState(null);

    // Filters
    const [selectedYear, setSelectedYear] = useState('All');
    const [selectedMonth, setSelectedMonth] = useState('All');

    // 1. ROLE-BASED QUERY
    useEffect(() => {
        if (!db || !appId) return;

        // Controllers see everything needing action. Sales only see what they can approve.
        const statusesToFetch = isController
            ? ["Pending Approval", "Pending Pricing"]
            : ["Pending Approval"];

        const q = query(
            collection(db, `artifacts/${appId}/public/data/invoices`),
            where("status", "in", statusesToFetch)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const sortedResult = result.sort((a, b) => {
                return getInvoiceDate(b) - getInvoiceDate(a);
            });

            setInvoices(sortedResult);
            setIsLoading(false);
        }, (err) => {
            console.error('Error fetching invoices:', err);
            setError(err.message);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId, isController]); // Re-run if role changes

    // Load signatures for approval
    useEffect(() => {
        if (!db || !appId) return;

        const signaturesRef = doc(db, `artifacts/${appId}/public/data/settings`, 'signatures');
        const unsubscribe = onSnapshot(signaturesRef, (docSnap) => {
            if (docSnap.exists()) {
                setSignatures(docSnap.data().signatures || []);
            } else {
                setSignatures([]);
            }
        }, (err) => {
            console.error('Error fetching signatures:', err);
        });

        return () => unsubscribe();
    }, [db, appId]);

    // Filter Logic
    const filteredInvoices = useMemo(() => {
        return invoices.filter(invoice => {
            const date = getInvoiceDate(invoice);
            const year = date.getFullYear().toString();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const yearMatch = selectedYear === 'All' || year === selectedYear;
            const monthMatch = selectedMonth === 'All' || month === selectedMonth;
            return yearMatch && monthMatch;
        });
    }, [invoices, selectedYear, selectedMonth]);

    const { years, months } = useMemo(() => {
        const uniqueYears = new Set();
        const uniqueMonths = new Set();
        invoices.forEach(inv => {
            const d = getInvoiceDate(inv);
            uniqueYears.add(d.getFullYear().toString());
            uniqueMonths.add((d.getMonth() + 1).toString().padStart(2, '0'));
        });
        return { years: Array.from(uniqueYears).sort().reverse(), months: Array.from(uniqueMonths).sort() };
    }, [invoices]);

    const formatRowAmount = (amount, currency) => {
        try {
            const cur = currency === 'USD' ? 'USD' : 'GHS';
            const locale = cur === 'USD' ? 'en-US' : 'en-GH';
            const n = Number(amount) || 0;
            return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(n);
        } catch (e) {
            return String(amount || 0);
        }
    };

    const handleApproval = async (invoiceId, newStatus) => {
        try {
            if (newStatus === 'Approved' && !selectedSignature) {
                setNotification({ type: 'error', message: 'Please select a signature first.' });
                return;
            }
            const batch = writeBatch(db);
            const invoiceRef = doc(db, `artifacts/${appId}/public/data/invoices`, invoiceId);
            const invoice = invoices.find(inv => inv.id === invoiceId);

            const updateData = {
                status: newStatus,
            };

            if (newStatus === 'Approved' && selectedSignature) {
                updateData.controllerSignature = selectedSignature.signatureUrl;
                updateData.controllerName = selectedSignature.controllerName;
                updateData.controllerSubsidiary = selectedSignature.subsidiary;
                updateData.signatureTimestamp = new Date().toISOString();
                updateData.approvedBy = userId;
            }

            batch.update(invoiceRef, updateData);

            // If approving, adjust stock levels
            if (newStatus === 'Approved' && invoice) {
                // Load inventory to get current stock levels
                const inventorySnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/inventory`));
                const inventory = {};
                inventorySnapshot.forEach(doc => {
                    inventory[doc.id] = doc.data();
                });

                // Use items array (from quote creation) or lineItems array (legacy)
                const itemsArray = invoice.items || invoice.lineItems || [];
                itemsArray.forEach(item => {
                    const inventoryItem = inventory[item.id];
                    if (inventoryItem) {
                        const invItemRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                        const newStock = inventoryItem.stock - (item.quantity || 0);
                        batch.update(invItemRef, { stock: newStock });
                    }
                });
            }

            await batch.commit();

            // Optimistic UI Update
            setInvoices(prevInvoices => prevInvoices.filter(inv => inv.id !== invoiceId));

            await logInvoiceActivity(db, appId, userId, newStatus === 'Approved' ? 'Approved' : 'Rejected', invoice, {
                statusBefore: 'Pending Approval',
                statusAfter: newStatus,
                approvedBy: userId,
                approvalDate: new Date().toISOString(),
                totalValue: invoice?.total || 0,
                itemCount: invoice?.lineItems?.length || 0
            });

            setNotification({ type: 'success', message: `Invoice ${newStatus} successfully` });
            setTimeout(() => setNotification(null), 3000);
        } catch (e) {
            console.error(e);
            setNotification({ type: 'error', message: 'Action failed' });
        }
    };

    if (isLoading) return <div className="p-8 text-center">Loading pending invoices...</div>;
    if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="mb-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <button
                                    onClick={() => navigateTo(isController ? 'controllerDashboard' : 'salesDashboard')}
                                    className="flex items-center text-blue-600 hover:text-blue-800 mb-2"
                                >
                                    <Icon id="arrow-left" className="mr-2" />
                                    Back to Dashboard
                                </button>
                                <h1 className="text-3xl font-bold text-gray-900">
                                    {isController ? 'Controller Approval & Pricing' : 'Sales Approval'}
                                </h1>
                                <p className="mt-2 text-gray-600">
                                    Review and approve pending invoices. Select a signature before approving.
                                </p>
                            </div>
                            <div className="text-sm text-gray-500">
                                <div>User: {username}</div>
                                <div>App: {appId}</div>
                            </div>
                        </div>
                    </div>

                    {notification && (
                        <div className={`mb-6 p-4 rounded-md ${notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            {notification.message}
                        </div>
                    )}

                    {!isLoading && signatures.length > 0 && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <h3 className="text-lg font-semibold mb-4">Select Approval Signature</h3>
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-blue-700">Controller Signature:</label>
                                <select
                                    className="w-full p-3 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={selectedSignature?.id || ''}
                                    onChange={(e) => setSelectedSignature(signatures.find(s => s.id === e.target.value))}
                                >
                                    <option value="">Choose a signature...</option>
                                    {signatures.map(s => <option key={s.id} value={s.id}>{s.controllerName} - {s.subsidiary}</option>)}
                                </select>
                                {selectedSignature && (
                                    <div className="text-sm text-green-600">
                                        ✓ Selected: {selectedSignature.controllerName} ({selectedSignature.subsidiary})
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold">Invoices Requiring Attention</h3>
                            <p className="text-sm text-gray-600">Total: {invoices.length} invoices</p>
                        </div>

                        {invoices.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <Icon id="check-circle" className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                <p className="text-lg">No pending invoices to approve</p>
                                <p className="text-sm">All invoices have been processed</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="flex gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                        <select
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(e.target.value)}
                                            className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        >
                                            <option value="All">All Years</option>
                                            {years.map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                                        <select
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(e.target.value)}
                                            className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        >
                                            <option value="All">All Months</option>
                                            {months.map(month => (
                                                <option key={month} value={month}>{month}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredInvoices.map(invoice => {
                                            // Calculate total items
                                            const itemCount = (invoice.items?.length || 0) + (invoice.lineItems?.length || 0);

                                            // Convert total if USD
                                            const exchangeRate = invoice.exchangeRate || 1;
                                            const displayTotal = invoice.currency === 'USD' ? (invoice.total / exchangeRate) : invoice.total;

                                            return (
                                                <tr key={invoice.id}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.approvedInvoiceId || invoice.id}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.customerName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.date}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${invoice.status === 'Pending Pricing' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
                                                            }`}>
                                                            {invoice.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                        {formatRowAmount(displayTotal, invoice.currency)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center space-x-2">
                                                        {/* CONTROLLER ACTION: PRICING */}
                                                        {isController && invoice.status === 'Pending Pricing' && (
                                                            <button
                                                                onClick={() => navigateTo('invoiceEditor', { invoiceId: invoice.id })}
                                                                className="text-purple-600 hover:text-purple-900 border border-purple-200 px-3 py-1 rounded bg-purple-50"
                                                            >
                                                                <Icon id="edit" className="mr-1 inline" /> Price Item
                                                            </button>
                                                        )}

                                                        {/* COMMON ACTION: APPROVAL */}
                                                        {invoice.status === 'Pending Approval' && (
                                                            <>
                                                                <button
                                                                    onClick={() => navigateTo('salesInvoiceReview', { invoiceId: invoice.id })}
                                                                    className="text-indigo-600 hover:text-indigo-900"
                                                                >
                                                                    Review
                                                                </button>
                                                                <button
                                                                    onClick={() => handleApproval(invoice.id, 'Approved')}
                                                                    disabled={!selectedSignature}
                                                                    className={`text-green-600 hover:text-green-900 ${!selectedSignature ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    title={!selectedSignature ? 'Select a signature first' : 'Approve'}
                                                                >
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    onClick={() => handleApproval(invoice.id, 'Rejected')}
                                                                    className="text-red-600 hover:text-red-900"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesInvoiceApproval;
