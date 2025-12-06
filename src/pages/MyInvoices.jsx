import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, getDoc, doc } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import PreviewModal from '../components/PreviewModal';
import { useActivityLog } from '../hooks/useActivityLog';
import { getInvoiceDate } from '../utils/helpers';

const MyInvoices = ({ navigateTo, db, appId, userId, pageContext }) => {
    const { log } = useActivityLog();
    const [previewData, setPreviewData] = useState(null);

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

                // Sort by timestamp for true newest-to-oldest order (same as AllInvoices)
                const sortedInvoices = [...result].sort((a, b) => {
                    const dateA = getInvoiceDate(a);
                    const dateB = getInvoiceDate(b);
                    return dateB - dateA; // Newest first
                });

                console.log('📅 [DEBUG] MyInvoices: Enhanced timestamp sorting applied', {
                    totalInvoices: result.length,
                    firstInvoice: {
                        id: sortedInvoices[0]?.id,
                        date: sortedInvoices[0]?.date,
                        createdAt: sortedInvoices[0]?.createdAt,
                        timestamp: sortedInvoices[0]?.timestamp
                    },
                    lastInvoice: {
                        id: sortedInvoices[sortedInvoices.length - 1]?.id,
                        date: sortedInvoices[sortedInvoices.length - 1]?.date,
                        createdAt: sortedInvoices[sortedInvoices.length - 1]?.createdAt,
                        timestamp: sortedInvoices[sortedInvoices.length - 1]?.timestamp
                    },
                    sortOrder: 'newest to oldest (by timestamp)',
                    userId
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
                console.log("Taxessssss555", result);
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

    const filteredInvoices = useMemo(() => {
        let result = myInvoices;

        if (pageContext?.status) {
            result = result.filter(inv => inv.status === pageContext.status);
        }

        return result.filter(invoice => {
            const date = getInvoiceDate(invoice);
            const year = date.getFullYear().toString();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');

            const yearMatch = selectedYear === 'All' || year === selectedYear;
            const monthMatch = selectedMonth === 'All' || month === selectedMonth;

            return yearMatch && monthMatch;
        });
    }, [myInvoices, pageContext, selectedYear, selectedMonth]);

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
            console.log('🔍 [DEBUG] MyInvoices: handleShowPreview called for invoice:', {
                id: invoice.id,
                hasSignature: !!invoice.controllerSignature,
                controllerName: invoice.controllerName
            });

            // Fetch complete invoice data from Firestore to get all fields including signature
            let completeInvoiceData = invoice;
            if (db && appId) {
                try {
                    console.log('📡 [DEBUG] MyInvoices: Fetching complete invoice data from Firestore');
                    const invoiceDoc = await getDoc(doc(db, `artifacts/${appId}/public/data/invoices`, invoice.id));
                    if (invoiceDoc.exists()) {
                        completeInvoiceData = { id: invoice.id, ...invoiceDoc.data() };
                        console.log('✅ [DEBUG] MyInvoices: Complete invoice data fetched:', {
                            hasSignature: !!completeInvoiceData.controllerSignature,
                            controllerName: completeInvoiceData.controllerName,
                            subsidiary: completeInvoiceData.controllerSubsidiary,
                            hasItems: !!completeInvoiceData.items,
                            itemsCount: completeInvoiceData.items?.length || 0,
                            hasLineItems: !!completeInvoiceData.lineItems,
                            lineItemsCount: completeInvoiceData.lineItems?.length || 0,
                            allKeys: Object.keys(completeInvoiceData)
                        });
                    } else {
                        console.log('⚠️ [DEBUG] MyInvoices: Invoice document not found in Firestore');
                    }
                } catch (error) {
                    console.error('❌ [ERROR] MyInvoices: Error fetching complete invoice data:', error);
                    // Continue with basic invoice data
                }
            }

            // Get the stored tax configuration from the invoice
            // This should be saved when the controller approves the invoice
            const taxConfig = completeInvoiceData.taxConfiguration || taxes;

            console.log('🧾 [DEBUG] MyInvoices: Tax configuration', {
                hasTaxConfiguration: !!completeInvoiceData.taxConfiguration,
                taxConfigurationCount: completeInvoiceData.taxConfiguration?.length || 0,
                hasTaxes: !!taxes,
                taxesCount: taxes?.length || 0,
                finalTaxConfig: taxConfig,
                taxConfigCount: taxConfig?.length || 0
            });

            // --- Currency Conversion Logic ---
            // If the invoice was created in USD, we need to convert the GHS values back to USD for display
            if (completeInvoiceData.currency === 'USD') {
                const exchangeRate = completeInvoiceData.exchangeRate || 1;
                console.log('💱 [DEBUG] MyInvoices: Converting invoice data to USD', { exchangeRate });

                if (!completeInvoiceData.exchangeRate) {
                    console.warn('⚠️ [WARNING] MyInvoices: USD invoice missing exchange rate, using 1.0');
                }

                // Convert items
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

                // Convert order charges
                if (completeInvoiceData.orderCharges) {
                    completeInvoiceData.orderCharges = {
                        shipping: (Number(completeInvoiceData.orderCharges.shipping) || 0) / exchangeRate,
                        handling: (Number(completeInvoiceData.orderCharges.handling) || 0) / exchangeRate,
                        discount: (Number(completeInvoiceData.orderCharges.discount) || 0) / exchangeRate
                    };
                }
            }

            // Calculate subtotal from line items (handle both items and lineItems arrays)
            const itemsArray = completeInvoiceData.items || completeInvoiceData.lineItems || [];
            console.log('🔍 [DEBUG] MyInvoices: Processing items for preview', {
                hasItems: !!completeInvoiceData.items,
                itemsCount: completeInvoiceData.items?.length || 0,
                hasLineItems: !!completeInvoiceData.lineItems,
                lineItemsCount: completeInvoiceData.lineItems?.length || 0,
                finalItemsCount: itemsArray.length,
                items: itemsArray.map(item => ({
                    id: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.finalPrice || item.price
                }))
            });

            const subtotal = itemsArray.reduce((acc, item) => {
                const price = Number(item.finalPrice || item.price || 0);
                const quantity = Number(item.quantity || 0);
                const itemTotal = price * quantity;

                console.log('🔍 [DEBUG] MyInvoices: Item calculation', {
                    itemId: item.id,
                    itemName: item.name,
                    finalPrice: item.finalPrice,
                    price: item.price,
                    quantity: item.quantity,
                    calculatedPrice: price,
                    calculatedQuantity: quantity,
                    itemTotal,
                    isPriceValid: !isNaN(price),
                    isQuantityValid: !isNaN(quantity),
                    isTotalValid: !isNaN(itemTotal)
                });

                return acc + itemTotal;
            }, 0);

            // Validate subtotal before proceeding
            if (isNaN(subtotal) || !isFinite(subtotal)) {
                console.error('❌ [ERROR] MyInvoices: Invalid subtotal calculated', {
                    subtotal,
                    itemsArray,
                    itemsData: itemsArray.map(item => ({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity
                    }))
                });
                throw new Error('Invalid subtotal calculation - check item prices and quantities');
            }

            console.log('✅ [DEBUG] MyInvoices: Valid subtotal calculated', { subtotal });

            // Calculate dynamic totals based on tax configuration (include order charges)
            const orderCharges = completeInvoiceData.orderCharges || { shipping: 0, handling: 0, discount: 0 };
            const shipping = Number(orderCharges.shipping || 0);
            const handling = Number(orderCharges.handling || 0);
            const discount = Number(orderCharges.discount || 0);
            const subtotalWithCharges = subtotal + shipping + handling - discount;

            console.log('🧮 [DEBUG] MyInvoices: Order charges calculation', {
                subtotal,
                shipping,
                handling,
                discount,
                subtotalWithCharges
            });

            // Ensure taxConfig is an array
            const safeTaxConfig = Array.isArray(taxConfig) ? taxConfig : [];

            console.log('🧮 [DEBUG] MyInvoices: About to calculate totals', {
                subtotalWithCharges,
                taxConfigLength: safeTaxConfig.length,
                orderCharges
            });

            var totals = calculateDynamicTotals(subtotalWithCharges, safeTaxConfig, orderCharges);

            // Fetch complete customer data from database using customerId
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
                    // Fallback to basic data
                    customerData = {
                        name: completeInvoiceData.customerName,
                        contactEmail: completeInvoiceData.customerEmail || 'test@example.com',
                        location: '[CUSTOMER LOCATION]',
                        poBox: '[CUSTOMER P.O. BOX]',
                        region: '[REGION]',
                        address: '[ADDRESS]'
                    };
                }
            }

            // Validate totals before setting preview data
            if (!totals || Object.values(totals).some(val => isNaN(val) || !isFinite(val))) {
                console.error('❌ [ERROR] MyInvoices: Invalid totals calculated, using fallback values', { totals });
                // Provide fallback totals
                totals = {
                    subtotal: subtotal,
                    grandTotal: subtotal,
                    shipping: 0,
                    handling: 0,
                    discount: 0,
                    subtotalWithCharges: subtotal
                };
            }

            // Set preview data with tax configuration, complete customer data, and signature information
            const previewDataObj = {
                customer: customerData,
                items: itemsArray,  // Use the unified items array
                subtotal,
                taxes: safeTaxConfig,  // Pass the safe tax configuration
                totals,
                invoiceId: completeInvoiceData.id,
                invoiceNumber: completeInvoiceData.invoiceNumber,
                invoiceDate: completeInvoiceData.invoiceDate,
                // Add signature data for PDF generation
                controllerSignature: completeInvoiceData.controllerSignature,
                controllerName: completeInvoiceData.controllerName,
                controllerSubsidiary: completeInvoiceData.controllerSubsidiary,
                signatureTimestamp: completeInvoiceData.signatureTimestamp,
                approvedBy: completeInvoiceData.approvedBy,
                currency: completeInvoiceData.currency, // Ensure currency is passed
                exchangeRate: completeInvoiceData.exchangeRate // Ensure exchange rate is passed
            };

            console.log('🔍 [DEBUG] MyInvoices: Preview data prepared with signature:', {
                hasSignature: !!completeInvoiceData.controllerSignature,
                controllerName: completeInvoiceData.controllerName,
                subsidiary: completeInvoiceData.controllerSubsidiary,
                signatureSize: completeInvoiceData.controllerSignature?.length
            });

            setPreviewData(previewDataObj);
        } catch (error) {
            console.error('❌ [ERROR] MyInvoices: Error preparing preview data:', error);
            console.error('❌ [ERROR] Error details:', {
                message: error.message,
                stack: error.stack
            });
            alert('Error preparing invoice preview. Please try again.');
        }
    };

    // Helper function to calculate totals dynamically (synchronized with InvoiceEditor)
    const calculateDynamicTotals = (subtotalWithCharges, taxes, orderCharges = {}) => {
        console.log('🧮 [DEBUG] MyInvoices: calculateDynamicTotals called', {
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
        console.log('📊 [DEBUG] MyInvoices: Subtotal taxes', {
            count: subtotalTaxes.length,
            taxes: subtotalTaxes.map(t => ({ id: t.id, name: t.name, rate: t.rate }))
        });

        subtotalTaxes.forEach(t => {
            const taxAmount = subtotalWithCharges * (t.rate / 100);
            totals[t.id] = taxAmount;
            totals[`${t.id}_rate`] = t.rate; // Store the rate too
            levyTotal += taxAmount;
            console.log('💰 [DEBUG] MyInvoices: Subtotal tax calculation', {
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
        console.log('📊 [DEBUG] MyInvoices: Levy taxes', {
            count: levyTaxes.length,
            taxes: levyTaxes.map(t => ({ id: t.id, name: t.name, rate: t.rate }))
        });

        let grandTotal = levyTotal;
        levyTaxes.forEach(t => {
            const taxAmount = levyTotal * (t.rate / 100);
            totals[t.id] = taxAmount;
            totals[`${t.id}_rate`] = t.rate; // Store the rate too
            grandTotal += taxAmount;
            console.log('💰 [DEBUG] MyInvoices: Levy tax calculation', {
                taxId: t.id,
                taxName: t.name,
                rate: t.rate,
                taxAmount,
                grandTotalAfter: grandTotal
            });
        });

        totals.grandTotal = grandTotal;

        // Validate all calculated values
        const validationErrors = [];
        Object.entries(totals).forEach(([key, value]) => {
            if (isNaN(value) || !isFinite(value)) {
                validationErrors.push(`${key}: ${value}`);
            }
        });

        if (validationErrors.length > 0) {
            console.error('❌ [ERROR] MyInvoices: Invalid values in totals calculation', {
                validationErrors,
                totals
            });
        }

        console.log('✅ [DEBUG] MyInvoices: Final calculated totals', { totals, validationErrors });
        return totals;
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

    const handleSendEmail = () => {
        if (!previewData) return;

        console.log('Send Email clicked!');
        const customer = previewData.customer;
        const invoiceId = previewData.invoiceId || 'INV-2025-XXXXX';
        const total = previewData.totals?.grandTotal || previewData.subtotal || 0;
        const currency = previewData.currency || 'GHS';

        if (!customer?.contactEmail) {
            alert('Customer email not available. Please add customer email first.');
            return;
        }

        const subject = `Invoice ${invoiceId} from Margins ID Systems`;

        // Format currency for email body
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

        log('DOCUMENT_ACTION', `Initiated email for Invoice ${invoiceId}`, {
            category: 'document',
            action: 'email_invoice',
            documentId: invoiceId,
            recipient: customer.contactEmail
        });

        // Open default email client
        const mailtoLink = `mailto:${customer.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink);
    };

    const formatListAmount = (amount, currency) => {
        try {
            const cur = currency === 'USD' ? 'USD' : 'GHS';
            const locale = cur === 'USD' ? 'en-US' : 'en-GH';
            const n = Number(amount) || 0;
            const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(n);
            return formatted;
        } catch (e) {
            console.error('❌ [ERROR] MyInvoices: formatListAmount failed:', e);
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
                        <h1 className="text-2xl font-bold text-gray-800">My Submitted Invoices {pageContext?.status && `(${pageContext.status})`}</h1>
                        <div className="flex items-center text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                            <Icon id="clock" className="w-4 h-4 mr-1" />
                            Sorted: Newest to Oldest (by Timestamp)
                        </div>
                    </div>
                    <button onClick={() => navigateTo('salesDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>
                </header>
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
                                {filteredInvoices.map(inv => (
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
                                        <td className="p-3 text-center">
                                            {inv.status === 'Approved' && (
                                                <button onClick={() => handleShowPreview(inv)} className="text-xs bg-purple-500 text-white px-2 py-1 rounded">Send to Customer</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MyInvoices;
