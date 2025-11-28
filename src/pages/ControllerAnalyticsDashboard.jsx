import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '../components/common/Icon';
import ReportModal from '../components/ReportModal';
import { formatCurrency } from '../utils/formatting';
import { getInvoiceDate } from '../utils/helpers';

const ControllerAnalyticsDashboard = ({ navigateTo, db, appId, currentUser, userEmail }) => {
    const [openReport, setOpenReport] = useState(false);

    // Extract username from email (everything before @)
    const username = userEmail ? userEmail.split('@')[0] : 'User';

    // Real-time data fetching for immediate updates
    const [invoices, setInvoices] = useState([]);
    const [invoicesLoading, setInvoicesLoading] = useState(true);
    const [inventory, setInventory] = useState([]);
    const [inventoryLoading, setInventoryLoading] = useState(true);

    // Real-time invoices listener
    useEffect(() => {
        if (!db || !appId) return;

        const unsubscribe = onSnapshot(
            query(collection(db, `artifacts/${appId}/public/data/invoices`), where("status", "==", "Approved")),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInvoices(result);
                setInvoicesLoading(false);
            },
            (err) => {
                console.error('Error fetching invoices:', err);
                setInvoicesLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId]);

    // Real-time inventory listener
    useEffect(() => {
        if (!db || !appId) return;

        const unsubscribe = onSnapshot(
            collection(db, `artifacts/${appId}/public/data/inventory`),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInventory(result);
                setInventoryLoading(false);
            },
            (err) => {
                console.error('Error fetching inventory:', err);
                setInventoryLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId]);

    const { invoiceData, inventoryHealthData } = useMemo(() => {
        // Invoice Statistics (Approved only)
        const monthlyData = {};
        invoices.filter(inv => inv.status === 'Approved').forEach(inv => {
            const date = getInvoiceDate(inv);
            // Format as YYYY-MM for consistent sorting and grouping
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const key = `${year}-${month}`;

            if (!monthlyData[key]) monthlyData[key] = { name: key, count: 0, total: 0 };
            monthlyData[key].count += 1;
            monthlyData[key].total += inv.total || inv.totals?.grandTotal || inv.totals?.subtotal || 0;
        });
        const invoiceData = Object.values(monthlyData).sort((a, b) => a.name.localeCompare(b.name));

        // Inventory Health
        const itemsBelowReorder = inventory.filter(item => item.stock <= item.restockLimit).length;
        const inventoryHealthData = inventory.length > 0 ? Math.round(((inventory.length - itemsBelowReorder) / inventory.length) * 100) : 100;

        return { invoiceData, inventoryHealthData };
    }, [invoices, inventory]);



    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">Controller Dashboard</h1>
                    <div className="flex items-center space-x-4">
                        <button onClick={() => navigateTo('taxSettings')} className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"><Icon id="cog" className="mr-2" />System Settings</button>
                        <button
                            onClick={() => setOpenReport(true)}
                            className="py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            <Icon id="chart-bar" className="mr-2" />
                            Generate Full Report
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                    {(currentUser && (currentUser.role === 'controller' || (currentUser.role === 'sales' && currentUser.level === 'main'))) && <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('invoices')}><Icon id="file-invoice" className="text-3xl text-green-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Approve Invoices</h2><p className="text-gray-600">Review and manage invoices.</p></div>}
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('inventory')}><Icon id="boxes" className="text-3xl text-blue-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Manage Inventory</h2><p className="text-gray-600">View and edit stock items.</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('customers')}><Icon id="users" className="text-3xl text-purple-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Manage Customers</h2><p className="text-gray-600">View customer data and portals.</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('pricingManagement')}><Icon id="calculator" className="text-3xl text-orange-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Pricing Management</h2><p className="text-gray-600">Manage cost components and pricing.</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('auditTrail')}><Icon id="history" className="text-3xl text-gray-500 mb-4" /><h2 className="text-xl font-semibold text-gray-800">Activity Log</h2><p className="text-gray-600">View system audit trail.</p></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <h3 className="font-semibold text-lg mb-4">Monthly Invoice Statistics</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={invoiceData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                <Bar dataKey="total" fill="#8884d8" name="Total Value" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md flex flex-col items-center justify-center">
                        <h3 className="font-semibold text-lg mb-4">Inventory Health</h3>
                        <div className="text-5xl font-bold text-blue-500">{inventoryHealthData}%</div>
                        <p className="text-gray-600 mt-2">of items are above reorder level</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateTo('taxSettings')}>
                        <Icon id="cogs" className="text-3xl text-gray-500 mb-4" />
                        <h2 className="text-xl font-semibold text-gray-800">Tax & Levy Settings</h2>
                        <p className="text-gray-600">Configure global tax rates.</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md flex flex-col items-center justify-center">
                        <h3 className="font-semibold text-lg mb-4">Total Approved Invoices</h3>
                        <div className="text-5xl font-bold text-green-500">{invoices.filter(inv => inv.status === 'Approved').length}</div>
                        <p className="text-gray-600 mt-2">invoices ready for processing</p>
                    </div>
                </div>
            </div>

            {/* Report Modal */}
            {openReport && (
                <ReportModal
                    appId={appId}
                    role="controller"
                    onClose={() => setOpenReport(false)}
                    db={db}
                />
            )}


        </div>
    );
};

export default ControllerAnalyticsDashboard;
