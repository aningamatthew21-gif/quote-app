import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, writeBatch, getDocs } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import { formatCurrency } from '../utils/formatting';
import { logInvoiceActivity } from '../utils/logger';
import { useApp } from '../context/AppContext';

const SalesInvoiceApproval = ({ navigateTo, db, appId, userId }) => {
    const { userEmail } = useApp();
    const username = userEmail ? userEmail.split('@')[0] : userId;

    // Real-time data fetching for immediate updates
    const [invoices, setInvoices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [signatures, setSignatures] = useState([]);
    const [signaturesLoading, setSignaturesLoading] = useState(true);
    const [selectedSignature, setSelectedSignature] = useState(null);
    const [notification, setNotification] = useState(null);
    const [taxes, setTaxes] = useState([]);
    const [taxesLoading, setTaxesLoading] = useState(true);

    // Real-time invoices listener for pending approval invoices
    useEffect(() => {
        if (!db || !appId) return;

        console.log('🔍 [DEBUG] SalesInvoiceApproval: Loading pending invoices', {
            appId,
            collectionPath: `artifacts/${appId}/public/data/invoices`,
            statusFilter: 'Pending Approval'
        });

        const unsubscribe = onSnapshot(
            query(collection(db, `artifacts/${appId}/public/data/invoices`), where("status", "==", "Pending Approval")),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log('✅ [DEBUG] SalesInvoiceApproval: Pending invoices loaded', {
                    count: result.length,
                    invoices: result.map(inv => ({
                        id: inv.id,
                        customerName: inv.customerName,
                        status: inv.status,
                        hasItems: !!inv.items,
                        itemsCount: inv.items?.length || 0,
                        hasLineItems: !!inv.lineItems,
                        lineItemsCount: inv.lineItems?.length || 0,
                        hasTotals: !!inv.totals,
                        totals: inv.totals
                    }))
                });
                setInvoices(result);
                setIsLoading(false);
                setError(null);
            },
            (err) => {
                console.error('❌ [ERROR] SalesInvoiceApproval: Error fetching pending invoices:', err);
                setError(err.message);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId]);

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
            setSignaturesLoading(false);
        }, (err) => {
            console.error('Error fetching signatures:', err);
            setSignaturesLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId]);

    // Load tax configuration
    useEffect(() => {
        if (!db || !appId) return;

        const taxDocRef = doc(db, `artifacts/${appId}/public/data/settings`, 'taxes');
        const unsubscribe = onSnapshot(taxDocRef, (docSnap) => {
            if (docSnap.exists()) {
                console.log("Taxessssss88", docSnap.data().taxArray);
                setTaxes(docSnap.data().taxArray || []);
            } else {
                setTaxes([]);
            }
            setTaxesLoading(false);
        }, (err) => {
            console.error('Error fetching taxes:', err);
            setTaxesLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId]);

    // Helper function to calculate totals dynamically (synchronized with InvoiceEditor)
    const calculateDynamicTotals = (subtotalWithCharges, taxes, orderCharges = {}) => {
        console.log('🧮 [DEBUG] SalesInvoiceApproval: calculateDynamicTotals called', {
            subtotalWithCharges,
            taxesCount: taxes.length,
            orderCharges,
            taxes: taxes.map(t => ({
                id: t.id,
                name: t.name,
                rate: t.rate,
                on: t.on,
                enabled: t.enabled
            }))
        });

        const totals = {};

        // Calculate base subtotal (without order charges)
        const subtotal = subtotalWithCharges - (orderCharges.shipping || 0) - (orderCharges.handling || 0) + (orderCharges.discount || 0);
        totals.subtotal = subtotal;

        // Add order charges to result
        totals.shipping = orderCharges.shipping || 0;
        totals.handling = orderCharges.handling || 0;
        totals.discount = orderCharges.discount || 0;
        totals.subtotalWithCharges = subtotalWithCharges;

        let levyTotal = subtotalWithCharges;

        // Apply taxes to subtotal with charges (NHIL, GETFund, etc.)
        const subtotalTaxes = taxes.filter(t => t.on === 'subtotal' && t.enabled);
        console.log('📊 [DEBUG] SalesInvoiceApproval: Subtotal taxes', {
            count: subtotalTaxes.length,
            taxes: subtotalTaxes.map(t => ({ id: t.id, name: t.name, rate: t.rate }))
        });

        subtotalTaxes.forEach(t => {
            const taxAmount = subtotalWithCharges * (t.rate / 100);
            totals[t.id] = taxAmount;
            totals[`${t.id}_rate`] = t.rate; // Store the rate too
            levyTotal += taxAmount;
            console.log('💰 [DEBUG] SalesInvoiceApproval: Subtotal tax calculation', {
                taxId: t.id,
                taxName: t.name,
                rate: t.rate,
                taxAmount,
                levyTotalAfter: levyTotal
            });
        });

        totals.levyTotal = levyTotal;

        // Apply taxes to levy total (VAT, COVID-19 Levy, etc.)
        const levyTaxes = taxes.filter(t => t.on === 'levyTotal' && t.enabled);
        console.log('📊 [DEBUG] SalesInvoiceApproval: Levy taxes', {
            count: levyTaxes.length,
            taxes: levyTaxes.map(t => ({ id: t.id, name: t.name, rate: t.rate }))
        });

        let grandTotal = levyTotal;
        levyTaxes.forEach(t => {
            const taxAmount = levyTotal * (t.rate / 100);
            totals[t.id] = taxAmount;
            totals[`${t.id}_rate`] = t.rate; // Store the rate too
            grandTotal += taxAmount;
            console.log('💰 [DEBUG] SalesInvoiceApproval: Levy tax calculation', {
                taxId: t.id,
                taxName: t.name,
                rate: t.rate,
                taxAmount,
                grandTotalAfter: grandTotal
            });
        });

        totals.grandTotal = grandTotal;

        console.log('✅ [DEBUG] SalesInvoiceApproval: Final calculated totals', { totals });
        return totals;
    };

    const handleApproval = async (invoiceId, newStatus) => {
        console.log('🔍 [DEBUG] SalesInvoiceApproval: handleApproval called', {
            invoiceId,
            newStatus,
            selectedSignature: selectedSignature?.controllerName,
            userId
        });

        try {
            // Validate signature selection for approval
            if (newStatus === 'Approved' && !selectedSignature) {
                console.warn('⚠️ [DEBUG] SalesInvoiceApproval: No signature selected for approval');
                setNotification({ type: 'error', message: 'Please select a signature before approving the invoice.' });
                return;
            }

            const batch = writeBatch(db);
            const invoiceRef = doc(db, `artifacts/${appId}/public/data/invoices`, invoiceId);
            const invoice = invoices.find(inv => inv.id === invoiceId);

            const updateData = {
                status: newStatus,
            };

            // Add signature information if approving
            if (newStatus === 'Approved' && selectedSignature) {
                updateData.controllerSignature = selectedSignature.signatureUrl;
                updateData.controllerName = selectedSignature.controllerName;
                updateData.controllerSubsidiary = selectedSignature.subsidiary;
                updateData.signatureTimestamp = new Date().toISOString();
                updateData.approvedBy = userId;

                console.log('✍️ [DEBUG] SalesInvoiceApproval: Adding signature data to invoice:', {
                    controllerName: selectedSignature.controllerName,
                    subsidiary: selectedSignature.subsidiary,
                    signatureSize: selectedSignature.signatureUrl?.length
                });
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
                console.log('📦 [DEBUG] Stock adjustment: Processing items', {
                    itemsCount: itemsArray.length,
                    items: itemsArray.map(item => ({
                        id: item.id,
                        name: item.name,
                        quantity: item.quantity
                    }))
                });

                itemsArray.forEach(item => {
                    const inventoryItem = inventory[item.id];
                    if (inventoryItem) {
                        const invItemRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                        const newStock = inventoryItem.stock - (item.quantity || 0);
                        console.log('📦 [DEBUG] Stock adjustment: Item processed', {
                            itemId: item.id,
                            itemName: item.name,
                            currentStock: inventoryItem.stock,
                            quantity: item.quantity,
                            newStock
                        });
                        batch.update(invItemRef, { stock: newStock });
                    } else {
                        console.warn('⚠️ [DEBUG] Stock adjustment: Inventory item not found', {
                            itemId: item.id,
                            itemName: item.name
                        });
                    }
                });
            }

            await batch.commit();

            await logInvoiceActivity(db, appId, userId, newStatus === 'Approved' ? 'Approved' : 'Rejected', invoice, {
                statusBefore: 'Pending Approval',
                statusAfter: newStatus,
                approvedBy: userId,
                approvalDate: new Date().toISOString(),
                totalValue: invoice?.total || 0,
                itemCount: invoice?.lineItems?.length || 0
            });

            setNotification({ type: 'success', message: `Invoice ${invoiceId} has been ${newStatus.toLowerCase()}.` });
            setTimeout(() => setNotification(null), 3000);

            console.log('✅ [DEBUG] SalesInvoiceApproval: Approval process completed successfully');
        } catch (error) {
            console.error('❌ [ERROR] SalesInvoiceApproval: handleApproval failed:', error);
            setNotification({ type: 'error', message: `Failed to ${newStatus.toLowerCase()} invoice: ${error.message}` });
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Approved': return 'bg-blue-100 text-blue-800';
            case 'Pending Approval': return 'bg-yellow-100 text-yellow-800';
            case 'Rejected': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatRowAmount = (amount, currency) => {
        try {
            const cur = currency === 'USD' ? 'USD' : 'GHS';
            const locale = cur === 'USD' ? 'en-US' : 'en-GH';
            const n = Number(amount) || 0;
            const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(n);
            console.log('🔎 [DEBUG] SalesInvoiceApproval: formatRowAmount', { amount, currency: cur, formatted });
            return formatted;
        } catch (e) {
            console.error('❌ [ERROR] SalesInvoiceApproval: formatRowAmount failed:', e);
            return String(amount || 0);
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
                                    onClick={() => navigateTo('salesDashboard')}
                                    className="flex items-center text-blue-600 hover:text-blue-800 mb-2"
                                >
                                    <Icon id="arrow-left" className="mr-2" />
                                    Back to Sales Dashboard
                                </button>
                                <h1 className="text-3xl font-bold text-gray-900">Invoice Approval</h1>
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

                    {/* Notification */}
                    {notification && (
                        <div className={`mb-6 p-4 rounded-md ${notification.type === 'success'
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                            }`}>
                            {notification.message}
                        </div>
                    )}

                    {/* Signature Selection */}
                    {!signaturesLoading && signatures.length > 0 && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <h3 className="text-lg font-semibold mb-4">Select Approval Signature</h3>
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-blue-700">
                                    Controller Signature:
                                </label>
                                <select
                                    value={selectedSignature?.id || ''}
                                    onChange={(e) => {
                                        const signature = signatures.find(s => s.id === e.target.value);
                                        console.log('🔍 [DEBUG] SalesInvoiceApproval: Signature selected:', signature);
                                        setSelectedSignature(signature);
                                    }}
                                    className="w-full p-3 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">Choose a signature...</option>
                                    {signatures.map(sig => (
                                        <option key={sig.id} value={sig.id}>
                                            {sig.controllerName} - {sig.subsidiary}
                                        </option>
                                    ))}
                                </select>
                                {selectedSignature && (
                                    <div className="text-sm text-green-600">
                                        ✓ Selected: {selectedSignature.controllerName} ({selectedSignature.subsidiary})
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Invoices Table */}
                    <div className="bg-white rounded-lg shadow">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold">Pending Approval Invoices</h3>
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
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {invoices.map(invoice => {
                                            console.log('🔍 [DEBUG] SalesInvoiceApproval: Processing invoice for table', {
                                                invoiceId: invoice.id,
                                                hasItems: !!invoice.items,
                                                itemsCount: invoice.items?.length || 0,
                                                hasLineItems: !!invoice.lineItems,
                                                lineItemsCount: invoice.lineItems?.length || 0,
                                                rawInvoice: invoice
                                            });

                                            // Calculate total items (handling both items and lineItems arrays)
                                            const itemCount = (invoice.items?.length || 0) + (invoice.lineItems?.length || 0);

                                            // Convert total if USD
                                            const exchangeRate = invoice.exchangeRate || 1;
                                            const displayTotal = invoice.currency === 'USD' ? (invoice.total / exchangeRate) : invoice.total;

                                            return (
                                                <tr key={invoice.id}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.id}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.customerName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.date}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatRowAmount(displayTotal, invoice.currency)}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{itemCount} items</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
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
