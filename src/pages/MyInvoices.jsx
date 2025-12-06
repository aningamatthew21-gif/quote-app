import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, getDoc, doc, updateDoc, arrayUnion, writeBatch, increment } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import PreviewModal from '../components/PreviewModal';

import { useActivityLog } from '../hooks/useActivityLog';
import { getInvoiceDate } from '../utils/helpers';

const MyInvoices = ({ navigateTo, db, appId, userId, pageContext }) => {
    const { log } = useActivityLog();
    const [previewData, setPreviewData] = useState(null);
    const [activeTab, setActiveTab] = useState('readyToSend'); // readyToSend, awaitingAcceptance, realizedRevenue, disputed

    // Real-time data fetching for immediate updates
    const [myInvoices, setMyInvoices] = useState([]);
    const [invoicesLoading, setInvoicesLoading] = useState(true);
    const [taxesData, setTaxesData] = useState([]);
    const [taxesLoading, setTaxesLoading] = useState(true);


    // Filter State
    const [selectedYear, setSelectedYear] = useState('All');
    const [selectedMonth, setSelectedMonth] = useState('All');

    // Real-time invoices listener for salesperson
    useEffect(() => {
        if (!db || !appId || !userId) return;

        const unsubscribe = onSnapshot(
            query(collection(db, `artifacts/${appId}/public/data/invoices`), where("createdBy", "==", userId)),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Sort by timestamp for true newest-to-oldest order
                const sortedInvoices = [...result].sort((a, b) => {
                    const dateA = getInvoiceDate(a);
                    const dateB = getInvoiceDate(b);
                    return dateB - dateA; // Newest first
                });

                setMyInvoices(sortedInvoices);

                setInvoicesLoading(false);
            },
            (err) => {
                console.error('Error fetching my invoices:', err);
                setInvoicesLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId, userId]);

    // Real-time tax settings listener
    useEffect(() => {
        if (!db || !appId) return;

        const unsubscribe = onSnapshot(
            collection(db, `artifacts/${appId}/public/data/settings`),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTaxesData(result);
                setTaxesLoading(false);
            },
            (err) => {
                console.error('Error fetching tax settings:', err);
                setTaxesLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId]);

    const taxes = useMemo(() => {
        if (taxesData.length > 0) {
            const taxDoc = taxesData.find(doc => doc.id === 'taxes');
            return taxDoc?.taxArray || [];
        }
        return [];
    }, [taxesData]);

    const invoiceSettings = useMemo(() => {
        if (taxesData.length > 0) {
            const settingsDoc = taxesData.find(doc => doc.id === 'invoice');
            return settingsDoc || {};
        }
        return {};
    }, [taxesData]);

    // Filter invoices based on active tab and date filters
    const filteredInvoices = useMemo(() => {
        let result = myInvoices;

        // Tab Filtering Logic
        switch (activeTab) {
            case 'readyToSend':
                result = result.filter(inv => inv.status === 'Approved');
                break;
            case 'awaitingAcceptance':
                result = result.filter(inv => inv.status === 'Awaiting Acceptance');
                break;
            case 'realizedRevenue':
                result = result.filter(inv => inv.status === 'Customer Accepted' || inv.status === 'Paid');
                break;
            case 'disputed':
                result = result.filter(inv => inv.status === 'Customer Rejected' || inv.status === 'Rejected');
                break;
            default:
                break;
        }

        return result.filter(invoice => {
            const date = getInvoiceDate(invoice);
            const year = date.getFullYear().toString();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');

            const yearMatch = selectedYear === 'All' || year === selectedYear;
            const monthMatch = selectedMonth === 'All' || month === selectedMonth;

            return yearMatch && monthMatch;
        });
    }, [myInvoices, activeTab, selectedYear, selectedMonth]);

    // Generate Filter Options
    const { years, months } = useMemo(() => {
        const uniqueYears = new Set();
        const uniqueMonths = new Set();

        myInvoices.forEach(invoice => {
            const date = getInvoiceDate(invoice);
            uniqueYears.add(date.getFullYear().toString());
            uniqueMonths.add((date.getMonth() + 1).toString().padStart(2, '0'));
        });

        return {
            years: Array.from(uniqueYears).sort().reverse(),
            months: Array.from(uniqueMonths).sort()
        };
    }, [myInvoices]);

    const handleShowPreview = async (invoice) => {
        try {
            // Fetch complete invoice data from Firestore
            let completeInvoiceData = invoice;
            if (db && appId) {
                try {
                    const invoiceDoc = await getDoc(doc(db, `artifacts/${appId}/public/data/invoices`, invoice.id));
                    if (invoiceDoc.exists()) {
                        completeInvoiceData = { id: invoice.id, ...invoiceDoc.data() };
                    }
                } catch (error) {
                    console.error('Error fetching complete invoice data:', error);
                }
            }

            const taxConfig = completeInvoiceData.taxConfiguration || taxes;

            // --- Currency Conversion Logic ---
            if (completeInvoiceData.currency === 'USD') {
                const exchangeRate = completeInvoiceData.exchangeRate || 1;
                if (completeInvoiceData.items) {
                    completeInvoiceData.items = completeInvoiceData.items.map(item => ({
                        ...item,
                        price: (Number(item.price) || 0) / exchangeRate,
                        finalPrice: (Number(item.finalPrice) || Number(item.price) || 0) / exchangeRate
                    }));
                }
                if (completeInvoiceData.lineItems) {
                    completeInvoiceData.lineItems = completeInvoiceData.lineItems.map(item => ({
                        ...item,
                        price: (Number(item.price) || 0) / exchangeRate,
                        finalPrice: (Number(item.finalPrice) || Number(item.price) || 0) / exchangeRate
                    }));
                }
                if (completeInvoiceData.orderCharges) {
                    completeInvoiceData.orderCharges = {
                        shipping: (Number(completeInvoiceData.orderCharges.shipping) || 0) / exchangeRate,
                        handling: (Number(completeInvoiceData.orderCharges.handling) || 0) / exchangeRate,
                        discount: (Number(completeInvoiceData.orderCharges.discount) || 0) / exchangeRate
                    };
                }
            }

            const itemsArray = completeInvoiceData.items || completeInvoiceData.lineItems || [];
            const subtotal = itemsArray.reduce((acc, item) => {
                const price = Number(item.finalPrice || item.price || 0);
                const quantity = Number(item.quantity || 0);
                return acc + (price * quantity);
            }, 0);

            const orderCharges = completeInvoiceData.orderCharges || { shipping: 0, handling: 0, discount: 0 };
            const shipping = Number(orderCharges.shipping || 0);
            const handling = Number(orderCharges.handling || 0);
            const discount = Number(orderCharges.discount || 0);
            const subtotalWithCharges = subtotal + shipping + handling - discount;

            const safeTaxConfig = Array.isArray(taxConfig) ? taxConfig : [];
            var totals = calculateDynamicTotals(subtotalWithCharges, safeTaxConfig, orderCharges);

            // Fetch customer data
            let customerData = { name: completeInvoiceData.customerName };
            if (completeInvoiceData.customerId && db) {
                try {
                    const customerDoc = await getDoc(doc(db, `artifacts/${appId}/public/data/customers`, completeInvoiceData.customerId));
                    if (customerDoc.exists()) {
                        const customer = customerDoc.data();
                        customerData = {
                            name: customer.name || completeInvoiceData.customerName,
                            contactEmail: customer.contactEmail || completeInvoiceData.customerEmail || 'test@example.com',
                            location: customer.location || '[CUSTOMER LOCATION]',
                            poBox: customer.poBox || '[CUSTOMER P.O. BOX]',
                            region: customer.region || '[REGION]',
                            address: customer.address || '[ADDRESS]'
                        };
                    }
                } catch (error) {
                    console.error('Error fetching customer data:', error);
                }
            }

            if (!totals || Object.values(totals).some(val => isNaN(val) || !isFinite(val))) {
                totals = {
                    subtotal: subtotal,
                    grandTotal: subtotal,
                    shipping: 0,
                    handling: 0,
                    discount: 0,
                    subtotalWithCharges: subtotal
                };
            }

            const previewDataObj = {
                customer: customerData,
                items: itemsArray,
                subtotal,
                taxes: safeTaxConfig,
                totals,
                invoiceId: completeInvoiceData.id,
                invoiceNumber: completeInvoiceData.invoiceNumber,
                invoiceDate: completeInvoiceData.invoiceDate,
                controllerSignature: completeInvoiceData.controllerSignature,
                controllerName: completeInvoiceData.controllerName,
                controllerSubsidiary: completeInvoiceData.controllerSubsidiary,
                signatureTimestamp: completeInvoiceData.signatureTimestamp,
                approvedBy: completeInvoiceData.approvedBy,
                currency: completeInvoiceData.currency,
                exchangeRate: completeInvoiceData.exchangeRate
            };

            setPreviewData(previewDataObj);
        } catch (error) {
            console.error('Error preparing preview data:', error);
            alert('Error preparing invoice preview. Please try again.');
        }
    };

    const calculateDynamicTotals = (subtotalWithCharges, taxes, orderCharges = {}) => {
        const totals = {};
        const subtotal = subtotalWithCharges - (orderCharges.shipping || 0) - (orderCharges.handling || 0) + (orderCharges.discount || 0);
        totals.subtotal = subtotal;
        totals.shipping = orderCharges.shipping || 0;
        totals.handling = orderCharges.handling || 0;
        totals.discount = orderCharges.discount || 0;
        totals.subtotalWithCharges = subtotalWithCharges;

        let levyTotal = subtotalWithCharges;
        const subtotalTaxes = taxes.filter(t => t.on === 'subtotal' && t.enabled);
        subtotalTaxes.forEach(t => {
            const taxAmount = subtotalWithCharges * (t.rate / 100);
            totals[t.id] = taxAmount;
            totals[`${t.id}_rate`] = t.rate;
            levyTotal += taxAmount;
        });
        totals.levyTotal = levyTotal;

        const levyTaxes = taxes.filter(t => t.on === 'levyTotal' && t.enabled);
        let grandTotal = levyTotal;
        levyTaxes.forEach(t => {
            const taxAmount = levyTotal * (t.rate / 100);
            totals[t.id] = taxAmount;
            totals[`${t.id}_rate`] = t.rate;
            grandTotal += taxAmount;
        });
        totals.grandTotal = grandTotal;
        return totals;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Customer Accepted': return 'bg-green-100 text-green-800';
            case 'Paid': return 'bg-green-100 text-green-800';
            case 'Approved': return 'bg-blue-100 text-blue-800'; // Ready to Send
            case 'Awaiting Acceptance': return 'bg-amber-100 text-amber-800';
            case 'Customer Rejected': return 'bg-red-100 text-red-800';
            case 'Rejected': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleSendEmail = async () => {
        if (!previewData) return;

        // Update status to 'Awaiting Acceptance'
        try {
            const invoiceRef = doc(db, `artifacts/${appId}/public/data/invoices`, previewData.invoiceId);
            await updateDoc(invoiceRef, {
                status: 'Awaiting Acceptance',
                sentAt: new Date()
            });

            log('DOCUMENT_ACTION', `Sent Invoice ${previewData.invoiceId} to customer`, {
                category: 'document',
                action: 'send_invoice',
                documentId: previewData.invoiceId
            });

            // Proceed with email opening
            const customer = previewData.customer;
            const invoiceId = previewData.invoiceId || 'INV-2025-XXXXX';
            const total = previewData.totals?.grandTotal || previewData.subtotal || 0;
            const currency = previewData.currency || 'GHS';

            if (!customer?.contactEmail) {
                alert('Customer email not available. Please add customer email first.');
                return;
            }

            const subject = `Invoice ${invoiceId} from Margins ID Systems`;
            const locale = currency === 'USD' ? 'en-US' : 'en-GH';
            const formattedTotal = new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(total);

            const body = `Dear ${customer.name},

Please find attached your invoice ${invoiceId}.

Invoice Details:
- Invoice Number: ${invoiceId}
- Date: ${new Date().toISOString().split('T')[0]}
- Total Amount: ${formattedTotal}

Payment Terms: 100% - 10 days from invoice date

Account Details:
Account Name: ${invoiceSettings?.accountDetails?.accountName || 'Margins ID Systems Applications Ltd.'}
Bankers: ${invoiceSettings?.accountDetails?.bankers || 'Fidelity Bank Limited'}
Account Numbers: ${invoiceSettings?.accountDetails?.accountNumbers || '1070033129318 - GHC'}

Please make payment to the account details above or issue cheque in the company's name.

Thank you for your business.

Best regards,
${invoiceSettings?.locationAddress?.companyName || 'Margins ID Systems'}
${invoiceSettings?.locationAddress?.unit || 'Unit B607, Octagon'}
${invoiceSettings?.locationAddress?.street || 'Barnes Road, Accra Central'}
Tel: ${invoiceSettings?.companyAddress?.tel || '+233 XX XXX XXXX'}
Email: ${invoiceSettings?.companyAddress?.email || 'sales@margins-id.com'}`;

            const mailtoLink = `mailto:${customer.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(mailtoLink);

            setPreviewData(null); // Close modal
        } catch (error) {
            console.error('Error updating invoice status:', error);
            alert('Failed to update invoice status. Please try again.');
        }
    };

    const handleMarkAccepted = async (invoice) => {
        if (window.confirm(`Mark invoice ${invoice.approvedInvoiceId || invoice.id} as Accepted by Customer? This will recognize revenue.`)) {
            try {
                await updateDoc(doc(db, `artifacts/${appId}/public/data/invoices`, invoice.id), {
                    status: 'Customer Accepted',
                    customerActionAt: new Date()
                });
                log('INVOICE_ACTION', `Marked Invoice ${invoice.id} as Customer Accepted`, {
                    documentId: invoice.id
                });
            } catch (error) {
                console.error('Error marking accepted:', error);
            }
        }
    };

    const handleMarkRejected = async (invoice) => {
        const reason = prompt("Please enter the reason for rejection:");
        if (reason) {
            try {
                await updateDoc(doc(db, `artifacts/${appId}/public/data/invoices`, invoice.id), {
                    status: 'Customer Rejected',
                    customerActionAt: new Date(),
                    rejectionReason: reason
                });
                log('INVOICE_ACTION', `Marked Invoice ${invoice.id} as Customer Rejected`, {
                    documentId: invoice.id,
                    reason
                });
            } catch (error) {
                console.error('Error marking rejected:', error);
            }
        }
    };

    const handleRevise = async (invoice) => {
        if (window.confirm(`Revise invoice ${invoice.approvedInvoiceId || invoice.id}? This will reset approval signatures, restore inventory, and move it to Draft.`)) {
            try {
                const batch = writeBatch(db);
                const invoiceRef = doc(db, `artifacts/${appId}/public/data/invoices`, invoice.id);

                // 1. Reset Invoice Status
                batch.update(invoiceRef, {
                    status: 'Draft',
                    controllerSignature: null,
                    approvedBy: null,
                    signatureTimestamp: null,
                    rejectionHistory: arrayUnion({
                        date: new Date().toISOString(),
                        reason: invoice.rejectionReason || 'Manual Revision'
                    })
                });

                // 2. RESTORE INVENTORY (Reverse the deduction)
                // We use Firestore's atomic increment to safely add the quantity back
                const itemsToRestore = invoice.items || invoice.lineItems || [];

                if (itemsToRestore.length > 0) {
                    itemsToRestore.forEach(item => {
                        if (item.id) {
                            const invRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                            // Add back the quantity that was deducted
                            batch.update(invRef, { stock: increment(Number(item.quantity) || 0) });
                        }
                    });
                    log('INVENTORY_ACTION', `Restored stock for revised Invoice ${invoice.id}`, {
                        documentId: invoice.id,
                        itemCount: itemsToRestore.length
                    });
                }

                await batch.commit();
                navigateTo('invoiceEditor', { invoiceId: invoice.id });
            } catch (error) {
                console.error('Error revising invoice:', error);
                alert('Failed to revise invoice. Please try again.');
            }
        }
    };

    const formatListAmount = (amount, currency) => {
        try {
            const cur = currency === 'USD' ? 'USD' : 'GHS';
            const locale = cur === 'USD' ? 'en-US' : 'en-GH';
            const n = Number(amount) || 0;
            return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(n);
        } catch (e) {
            return String(amount || 0);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {previewData && (
                    <PreviewModal
                        open={!!previewData}
                        onClose={() => setPreviewData(null)}
                        payload={previewData}
                        mode="invoice"
                        isDistribution={true}
                        onEmail={handleSendEmail}
                    />
                )}



                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <h1 className="text-2xl font-bold text-gray-800">My Invoices</h1>
                    </div>
                    <button onClick={() => navigateTo('salesDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>
                </header>

                {/* Tabs */}
                <div className="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
                    <button
                        onClick={() => setActiveTab('readyToSend')}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${activeTab === 'readyToSend' ? 'bg-white shadow' : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'}`}
                    >
                        Ready to Send
                    </button>
                    <button
                        onClick={() => setActiveTab('awaitingAcceptance')}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${activeTab === 'awaitingAcceptance' ? 'bg-white shadow' : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'}`}
                    >
                        Awaiting Acceptance
                    </button>
                    <button
                        onClick={() => setActiveTab('realizedRevenue')}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${activeTab === 'realizedRevenue' ? 'bg-white shadow' : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'}`}
                    >
                        Realized Revenue
                    </button>
                    <button
                        onClick={() => setActiveTab('disputed')}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${activeTab === 'disputed' ? 'bg-white shadow' : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'}`}
                    >
                        Disputed / Rejected
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-md">
                    {/* Filters */}
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

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-3 font-semibold">Invoice ID</th>
                                    <th className="p-3 font-semibold">Customer</th>
                                    <th className="p-3 font-semibold">Date</th>
                                    <th className="p-3 font-semibold text-right">Amount</th>
                                    <th className="p-3 font-semibold text-center">Status</th>
                                    <th className="p-3 font-semibold text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-500">
                                            No invoices found in this category.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredInvoices.map(inv => (
                                        <tr key={inv.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-medium">{inv.approvedInvoiceId || inv.id}</td>
                                            <td className="p-3">{inv.customerName}</td>
                                            <td className="p-3">{inv.date}</td>
                                            <td className="p-3 text-right">
                                                {(() => {
                                                    const exchangeRate = inv.exchangeRate || 1;
                                                    const displayTotal = inv.currency === 'USD' ? (inv.total / exchangeRate) : inv.total;
                                                    return formatListAmount(displayTotal, inv.currency);
                                                })()}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(inv.status)}`}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center space-x-2">
                                                {activeTab === 'readyToSend' && (
                                                    <button onClick={() => handleShowPreview(inv)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors">
                                                        Send to Customer
                                                    </button>
                                                )}
                                                {activeTab === 'awaitingAcceptance' && (
                                                    <>
                                                        <button onClick={() => handleMarkAccepted(inv)} className="text-xs border border-green-600 text-green-600 px-2 py-1 rounded hover:bg-green-50 transition-colors">
                                                            Accept
                                                        </button>
                                                        <button onClick={() => handleMarkRejected(inv)} className="text-xs border border-red-600 text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {activeTab === 'disputed' && (
                                                    <button onClick={() => handleRevise(inv)} className="text-xs bg-amber-500 text-white px-3 py-1 rounded hover:bg-amber-600 transition-colors">
                                                        Revise Quote
                                                    </button>
                                                )}
                                                {activeTab === 'realizedRevenue' && (
                                                    <span className="text-xs text-green-600 font-medium">
                                                        <Icon id="check" className="inline w-3 h-3 mr-1" /> Revenue Recognized
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MyInvoices;
