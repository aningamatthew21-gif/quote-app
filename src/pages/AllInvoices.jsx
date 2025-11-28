import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import { formatCurrency } from '../utils/formatting';
import { useDebounce } from '../hooks/useDebounce';
import { useActivityLog } from '../hooks/useActivityLog';
import { getInvoiceDate } from '../utils/helpers';

const AllInvoices = ({ navigateTo, db, appId, pageContext }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 1000); // Increased delay for logging

    // Logging
    const { log } = useActivityLog();
    useEffect(() => {
        if (debouncedSearchTerm && debouncedSearchTerm.trim().length > 2) {
            log('SEARCH_QUERY', `Searched invoices for: "${debouncedSearchTerm}"`, {
                category: 'user_action',
                searchDetails: {
                    term: debouncedSearchTerm,
                    context: 'invoices'
                }
            });
        }
    }, [debouncedSearchTerm, log]);

    // Use onSnapshot without ordering to avoid index requirement
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;

        const unsub = onSnapshot(collection(db, `artifacts/${appId}/public/data/invoices`), (snapshot) => {
            const invoiceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort client-side by timestamp for true newest-to-oldest order
            const sortedInvoices = [...invoiceData].sort((a, b) => {
                const dateA = getInvoiceDate(a);
                const dateB = getInvoiceDate(b);
                return dateB - dateA; // Newest first
            });

            console.log('📅 [DEBUG] AllInvoices: Enhanced timestamp sorting applied', {
                totalInvoices: invoiceData.length,
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
                sortOrder: 'newest to oldest (by timestamp)'
            });

            setInvoices(sortedInvoices);
            setLoading(false);
        }, (error) => {
            setLoading(false);
        });

        return () => unsub();
    }, [db, appId]);

    // Debug logging removed for production

    const handleUpdateStatus = async (invoiceId, status) => {
        const invoiceRef = doc(db, `artifacts/${appId}/public/data/invoices`, invoiceId);
        await updateDoc(invoiceRef, { status });
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

    const filteredInvoices = useMemo(() => {
        let filtered = invoices;

        // Apply aging filter if specified
        if (pageContext?.aging) {
            const today = new Date();
            const getDays = (range) => {
                switch (range) {
                    case '0-30 Days': return { min: 0, max: 30 };
                    case '31-60 Days': return { min: 31, max: 60 };
                    case '61-90 Days': return { min: 61, max: 90 };
                    case '90+ Days': return { min: 91, max: Infinity };
                    default: return null;
                }
            }
            const range = getDays(pageContext.aging);
            if (range) {
                filtered = filtered.filter(inv => {
                    if (inv.status === 'Paid') return false;
                    const invoiceDate = new Date(inv.date);
                    const diffDays = Math.ceil((today - invoiceDate) / (1000 * 60 * 60 * 24));
                    return diffDays >= range.min && diffDays <= range.max;
                });
            }
        }

        // Apply search filter
        if (debouncedSearchTerm) {
            filtered = filtered.filter(inv =>
                inv.id.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                inv.customerName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
            );
        }

        return filtered;
    }, [invoices, debouncedSearchTerm, pageContext]);

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <h1 className="text-2xl font-bold text-gray-800">All Invoices {pageContext?.aging && `(${pageContext.aging})`}</h1>
                        <div className="flex items-center text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                            <Icon id="clock" className="w-4 h-4 mr-1" />
                            Sorted: Newest to Oldest (by Timestamp)
                        </div>
                    </div>
                    <button onClick={() => navigateTo('controllerDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>
                </header>
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Search by Invoice ID or Customer Name..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2 border rounded-md"
                        />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-3 font-semibold">Invoice ID</th>
                                    <th className="p-3 font-semibold">Customer</th>
                                    <th className="p-3 font-semibold">
                                        <div className="flex items-center justify-center">
                                            Date & Time
                                            <Icon id="arrow-down" className="w-4 h-4 ml-1 text-blue-600" />
                                            <span className="text-xs text-blue-600 ml-1">Newest</span>
                                        </div>
                                    </th>
                                    <th className="p-3 font-semibold text-right">Amount</th>
                                    <th className="p-3 font-semibold text-center">Status</th>
                                    <th className="p-3 font-semibold text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-600">
                                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                            <p className="mt-2">Loading invoices...</p>
                                        </td>
                                    </tr>
                                ) : filteredInvoices.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-600">
                                            No invoices found
                                        </td>
                                    </tr>
                                ) : (
                                    filteredInvoices.map(inv => (
                                        <tr key={inv.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-medium">{inv.id}</td>
                                            <td className="p-3">{inv.customerName}</td>
                                            <td className="p-3">{inv.date}</td>
                                            <td className="p-3 text-right">{formatCurrency(inv.total)}</td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(inv.status)}`}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center space-x-2">
                                                {inv.status === 'Pending Approval' ? (
                                                    <button onClick={() => navigateTo('invoiceEditor', { invoiceId: inv.id })} className="text-xs bg-blue-500 text-white px-3 py-1 rounded">Edit / Approve</button>
                                                ) : (
                                                    <button onClick={() => navigateTo('customerPortal', inv.customerId)} className="text-blue-600 font-medium text-xs">View Portal</button>
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

export default AllInvoices;
