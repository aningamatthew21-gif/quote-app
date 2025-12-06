import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts';
import Icon from '../components/common/Icon';
import ReportModal from '../components/ReportModal';
import { formatCurrency } from '../utils/formatting';

const SalesAnalyticsDashboard = ({ navigateTo, db, appId, userId, userEmail }) => {
    const [openReport, setOpenReport] = useState(false);

    // Extract username from email (everything before @)
    const username = userEmail ? userEmail.split('@')[0] : 'User';

    // Real-time data fetching for immediate updates
    const [invoices, setInvoices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Real-time invoices listener for salesperson
    useEffect(() => {
        if (!db || !appId || !userId) return;

        const unsubscribe = onSnapshot(
            query(collection(db, `artifacts/${appId}/public/data/invoices`), where("createdBy", "==", userId)),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInvoices(result);
                setIsLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Error fetching sales invoices:', err);
                setError(err.message);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId, userId]);

    const handleRefresh = () => {
        // Refresh is no longer needed with real-time updates
        console.log('Real-time updates active - refresh not needed');
    };

    const { funnelData, topCustomersData } = useMemo(() => {
        // BUSINESS LOGIC: Only count APPROVED invoices for analytics
        // This prevents capturing wrong values if the financial controller rejects an invoice

        // Exclude Rejected invoices from all calculations
        const filteredInvoices = invoices.filter(inv => inv.status !== 'Rejected');
        const funnel = { 'Pending Approval': 0, 'Approved': 0 };
        const customerTotals = {};

        filteredInvoices.forEach(inv => {
            // Count all non-rejected invoices for funnel chart
            if (inv.status === 'Pending Approval') funnel['Pending Approval']++;
            if (inv.status === 'Approved') funnel['Approved']++;

            // CRITICAL: ONLY count APPROVED invoices for top customers chart
            // This ensures data integrity and prevents false customer rankings
            if (inv.status === 'Approved') {
                customerTotals[inv.customerName] = (customerTotals[inv.customerName] || 0) + (inv.total || inv.totals?.grandTotal || inv.totals?.subtotal || 0);
            }
        });

        const funnelData = [
            { value: funnel['Pending Approval'], name: 'Pending', fill: '#f59e0b' },
            { value: funnel['Approved'], name: 'Approved', fill: '#3b82f6' },
        ];

        const topCustomersData = Object.entries(customerTotals)
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        return { funnelData, topCustomersData };
    }, [invoices]);

    const handleFunnelClick = (data) => {
        if (data && data.name) {
            const statusMap = {
                'Pending': 'Pending Approval',
                'Approved': 'Approved'
            };
            navigateTo('myInvoices', { status: statusMap[data.name] });
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">Sales Dashboard</h1>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => setOpenReport(true)}
                            className="py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            <Icon id="chart-bar" className="mr-2" />
                            Generate Sales Report
                        </button>
                        <button onClick={handleRefresh} className="text-sm text-gray-600 hover:text-blue-600 disabled:opacity-50" disabled={isLoading}>
                            <Icon id={isLoading ? "sync-alt fa-spin" : "sync-alt"} className="mr-1" />
                            {isLoading ? 'Refreshing...' : 'Refresh'}
                        </button>

                        {/* User Profile Section */}
                        <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-full border border-gray-200">
                            <div className="bg-gray-300 rounded-full p-1">
                                <Icon id="user" className="text-gray-600 w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-gray-700">{username}</span>
                        </div>

                        <button onClick={() => navigateTo('login')} className="text-sm text-gray-600 hover:text-blue-600"><Icon id="sign-out-alt" className="mr-1" /> Logout</button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('quoting')}><Icon id="file-invoice-dollar" className="text-3xl text-green-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Create Quote</h2><p className="text-gray-600">Build professional quotes with pricing management, Incoterms, and order charges.</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('myInvoices')}><Icon id="list-alt" className="text-3xl text-blue-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">View My Invoices</h2><p className="text-gray-600">Track the status of your submitted invoices.</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('salesInvoiceApproval')}><Icon id="check-circle" className="text-3xl text-orange-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Approve Invoices</h2><p className="text-gray-600">Review and approve pending invoices.</p></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <h3 className="font-semibold text-lg mb-4">My Invoice Status</h3>
                        {isLoading ? <div className="flex items-center justify-center h-[300px] text-gray-500">Loading chart data...</div> : (
                            funnelData.some(d => d.value > 0) ? (
                                <div>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={funnelData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={5}
                                                dataKey="value"
                                                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                                                labelLine={false}
                                                onClick={handleFunnelClick}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {funnelData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value, name) => [value, name]}
                                                labelFormatter={(label) => `Status: ${label}`}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>

                                    {/* Legend */}
                                    <div className="flex justify-center space-x-6 mt-4">
                                        {funnelData.map((entry, index) => (
                                            <div key={index} className="flex items-center space-x-2">
                                                <div
                                                    className="w-4 h-4 rounded-full"
                                                    style={{ backgroundColor: entry.fill }}
                                                ></div>
                                                <span className="text-sm text-gray-700">
                                                    {entry.name}: {entry.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[300px] text-gray-500">
                                    No invoice data to display in chart.
                                </div>
                            )
                        )}
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <h3 className="font-semibold text-lg mb-4">My Top Customers</h3>
                        <p className="text-sm text-gray-600 mb-4">Based on approved invoices only - ensures accurate customer rankings</p>
                        {isLoading ? <div className="flex items-center justify-center h-[300px] text-gray-500">Loading chart data...</div> : (
                            topCustomersData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={topCustomersData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" width={100} stroke="#333" />
                                        <Tooltip formatter={(value) => formatCurrency(value)} />
                                        <Bar dataKey="total" fill="#82ca9d" name="Sales Volume" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[300px] text-gray-500">
                                    No customer data to display.
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Report Modal */}
            {openReport && (
                <ReportModal
                    appId={appId}
                    role="sales"
                    onClose={() => setOpenReport(false)}
                    db={db}
                />
            )}
        </div>
    );
};

export default SalesAnalyticsDashboard;
