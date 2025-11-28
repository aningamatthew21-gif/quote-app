import React, { useState, useEffect } from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

export default function ReportModal({ appId, role='controller', onClose, db }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [rawData, setRawData] = useState({ invoices: [], customers: [] });

  // Validate component props on mount
  useEffect(() => {
    console.log('🔍 [DEBUG] ReportModal mounted with props:', {
      appId,
      role,
      hasDb: !!db,
      dbType: db ? typeof db : 'undefined'
    });
    
    if (!db) {
      console.error('❌ [ERROR] ReportModal: Database connection missing');
      setError('Database connection not available. Please refresh the page.');
    }
    
    if (!appId) {
      console.error('❌ [ERROR] ReportModal: Application ID missing');
      setError('Application ID not available. Please refresh the page.');
    }
  }, [appId, role, db]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 [DEBUG] Starting client-side report generation', { 
        appId, 
        role, 
        dateRange,
        hasDb: !!db,
        dbType: db ? typeof db : 'undefined'
      });
      
      if (!db) {
        throw new Error('Database connection not available. Please refresh the page and try again.');
      }
      
      if (!appId) {
        throw new Error('Application ID not available. Please refresh the page and try again.');
      }
      
      // Fetch invoices with date filtering
      const invoicesPath = `artifacts/${appId}/public/data/invoices`;
      let invoicesQuery = collection(db, invoicesPath);
      
      // Apply date filters if provided
      if (dateRange.startDate && dateRange.endDate) {
        invoicesQuery = query(
          collection(db, invoicesPath),
          where('date', '>=', dateRange.startDate),
          where('date', '<=', dateRange.endDate),
          orderBy('date', 'desc')
        );
      } else if (dateRange.startDate) {
        invoicesQuery = query(
          collection(db, invoicesPath),
          where('date', '>=', dateRange.startDate),
          orderBy('date', 'desc')
        );
      } else if (dateRange.endDate) {
        invoicesQuery = query(
          collection(db, invoicesPath),
          where('date', '<=', dateRange.endDate),
          orderBy('date', 'desc')
        );
      } else {
        // No date filter - get recent invoices (limit to avoid performance issues)
        invoicesQuery = query(
          collection(db, invoicesPath),
          orderBy('date', 'desc'),
          limit(1000)
        );
      }
      
      console.log('📊 [DEBUG] Fetching invoices from:', invoicesPath);
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('✅ [DEBUG] Fetched invoices:', { count: invoices.length });
      
      // Fetch customers for reconciliation
      const customersPath = `artifacts/${appId}/public/data/customers`;
      console.log('👥 [DEBUG] Fetching customers from:', customersPath);
      const customersSnapshot = await getDocs(collection(db, customersPath));
      const customers = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('✅ [DEBUG] Fetched customers:', { count: customers.length });
      
      // Store raw data
      setRawData({ invoices, customers });
      
      // Generate report data
      const reportData = generateReportData(invoices, customers, role, includeLegacy);
      console.log('📈 [DEBUG] Generated report data:', reportData);
      
      setReport(reportData);
      
    } catch (err) {
      console.error('❌ [ERROR] Report generation failed:', err);
      
      let userMessage = 'Failed to generate report. Please try again.';
      if (err.message.includes('Database connection')) {
        userMessage = 'Database connection error. Please refresh the page.';
      } else if (err.message.includes('permission')) {
        userMessage = 'Permission denied. Please check your user role.';
      } else if (err.message.includes('network')) {
        userMessage = 'Network error. Please check your internet connection.';
      }
      
      setError(userMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Client-side report generation function
  const generateReportData = (invoices, customers, role, includeLegacy) => {
    console.log('🔍 [DEBUG] Generating report data from:', { 
      invoiceCount: invoices.length, 
      customerCount: customers.length, 
      role, 
      includeLegacy 
    });
    
    // Initialize summary metrics
    const summary = {
      totalApprovedInvoicesCount: 0,
      totalApprovedInvoicesValue: 0,
      totalRecognizedRevenue: 0,
      totalPaymentsReceived: 0,
      outstandingAR: 0,
      rejectedInvoiceCount: 0,
      rejectedInvoiceValue: 0,
      legacyOpeningBalanceCount: 0,
      legacyOpeningBalanceValue: 0
    };
    
    // Process invoices
    const invoicesRows = [];
    const paymentsLog = [];
    const customersSet = new Set();
    
    invoices.forEach(inv => {
      const status = inv.status || 'Other';
      const isLegacy = !!inv.isLegacy;
      const total = typeof inv.total === 'number' ? inv.total : parseFloat(inv.total || 0);
      
      // Categorize invoices
      if (status === 'Rejected') {
        summary.rejectedInvoiceCount += 1;
        summary.rejectedInvoiceValue += total;
      }
      
      // Count approved/paid invoices for revenue recognition
      if ((status === 'Approved' || status === 'Paid') && (!isLegacy || includeLegacy)) {
        summary.totalApprovedInvoicesCount += 1;
        summary.totalApprovedInvoicesValue += total;
        summary.totalRecognizedRevenue += total;
      }
      
      // Process payments
      (inv.payments || []).forEach(p => {
        const pAmount = typeof p.amount === 'number' ? p.amount : parseFloat(p.amount || 0);
        paymentsLog.push({
          invoiceId: inv.id,
          customerId: inv.customerId || null,
          customerName: inv.customerName || null,
          amount: pAmount,
          date: p.date || null,
          docNumber: p.docNumber || null,
          method: p.paymentMethod || p.method || null
        });
        summary.totalPaymentsReceived += pAmount;
      });
      
      // Calculate outstanding amounts
      const paidSoFar = (inv.payments || []).reduce((s, p) => s + (parseFloat(p.amount || 0)), 0);
      const remaining = Math.max(0, total - paidSoFar);
      
      // Add to invoice rows
      invoicesRows.push({
        id: inv.id,
        customerId: inv.customerId || null,
        customerName: inv.customerName || null,
        date: inv.date || null,
        dueDate: inv.dueDate || null,
        total,
        paidSoFar,
        remaining,
        status,
        isLegacy
      });
      
      // Legacy opening balance tracking
      if (isLegacy && inv.type === 'OpeningBalance') {
        summary.legacyOpeningBalanceCount += 1;
        summary.legacyOpeningBalanceValue += total;
      }
      
      // Track customers for reconciliation
      if (inv.customerId) customersSet.add(inv.customerId);
    });
    
    // Calculate aging buckets (Approved invoices only)
    const now = new Date();
    const agingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    
    invoicesRows.forEach(inv => {
      if (inv.status !== 'Approved' || inv.isLegacy) return;
      
      const invoiceDate = inv.date ? new Date(inv.date) : null;
      if (!invoiceDate) return;
      
      const diffDays = Math.ceil((now - invoiceDate) / (1000 * 60 * 60 * 24));
      const rem = inv.remaining || 0;
      
      if (diffDays <= 30) agingBuckets['0-30'] += rem;
      else if (diffDays <= 60) agingBuckets['31-60'] += rem;
      else if (diffDays <= 90) agingBuckets['61-90'] += rem;
      else agingBuckets['90+'] += rem;
      
      summary.outstandingAR += rem;
    });
    
    // Customer reconciliation
    const customerReconciliation = [];
    const customerIds = Array.from(customersSet);
    
    customerIds.forEach(customerId => {
      const customer = customers.find(c => c.id === customerId);
      if (!customer) {
        customerReconciliation.push({
          customerId,
          customerName: null,
          storedOutstanding: null,
          computedOutstanding: null,
          mismatch: true,
          note: 'Customer document missing'
        });
        return;
      }
      
      const storedOutstanding = typeof customer.outstandingBalance === 'number' 
        ? customer.outstandingBalance 
        : parseFloat(customer.outstandingBalance || 0);
      
      // Compute outstanding from invoices (excluding rejected and legacy)
      const computedOutstanding = invoicesRows
        .filter(r => r.customerId === customerId && r.status !== 'Rejected' && !r.isLegacy)
        .reduce((s, r) => s + (r.remaining || 0), 0);
      
      customerReconciliation.push({
        customerId,
        customerName: customer.name || null,
        storedOutstanding,
        computedOutstanding,
        mismatch: Math.abs((storedOutstanding || 0) - (computedOutstanding || 0)) > 0.01
      });
    });
    
    // Prepare final report object
    const report = {
      meta: {
        appId,
        roleRequested: role,
        generatedBy: 'client-side',
        generatedAt: new Date().toISOString(),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        includeLegacy,
        dataSource: 'Direct Firestore queries'
      },
      summary,
      agingBuckets,
      paymentsLog,
      invoices: invoicesRows,
      customerReconciliation
    };
    
    console.log('✅ [DEBUG] Report generation completed:', {
      summary: report.summary,
      invoiceCount: report.invoices.length,
      customerReconciliationCount: report.customerReconciliation.length
    });
    
    return report;
  };

  const downloadCsvClient = async (reportData) => {
    if (!reportData || !reportData.invoices) {
      alert('Report not available for download. Please generate a report first.');
      return;
    }
    
    setIsExporting(true);
    try {
      console.log('📊 [DEBUG] Starting CSV export for report:', reportData.meta);
      
      // Generate CSV content from report data
      const csvContent = generateCsvContent(reportData);
      
      // Create and download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `report-${role}-${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✅ [DEBUG] CSV export completed successfully');
      } else {
        // Fallback for older browsers
        alert('CSV download not supported in this browser. Please copy the data manually.');
      }
    } catch (err) {
      console.error('❌ [ERROR] CSV export failed:', err);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  
  // Generate CSV content from report data
  const generateCsvContent = (reportData) => {
    const rows = [];
    
    // Add report header
    rows.push(['Report Generated:', reportData.meta.generatedAt]);
    rows.push(['Role:', reportData.meta.roleRequested]);
    rows.push(['Data Source:', reportData.meta.dataSource]);
    rows.push(['']);
    
    // Add summary section
    rows.push(['SUMMARY METRICS']);
    rows.push(['Metric', 'Value']);
    rows.push(['Total Approved Invoices', reportData.summary.totalApprovedInvoicesCount]);
    rows.push(['Total Approved Value', reportData.summary.totalApprovedInvoicesValue]);
    rows.push(['Total Revenue', reportData.summary.totalRecognizedRevenue]);
    rows.push(['Outstanding AR', reportData.summary.outstandingAR]);
    rows.push(['Total Payments', reportData.summary.totalPaymentsReceived]);
    rows.push(['Rejected Invoices', reportData.summary.rejectedInvoiceCount]);
    rows.push(['']);
    
    // Add aging analysis
    rows.push(['AGING ANALYSIS']);
    rows.push(['Days', 'Amount']);
    Object.entries(reportData.agingBuckets).forEach(([range, amount]) => {
      rows.push([range, amount]);
    });
    rows.push(['']);
    
    // Add invoice details
    rows.push(['INVOICE DETAILS']);
    rows.push(['Invoice ID', 'Customer', 'Date', 'Due Date', 'Total', 'Paid', 'Remaining', 'Status', 'Legacy']);
    
    reportData.invoices.forEach(inv => {
      rows.push([
        inv.id || '',
        inv.customerName || '',
        inv.date || '',
        inv.dueDate || '',
        inv.total || 0,
        inv.paidSoFar || 0,
        inv.remaining || 0,
        inv.status || '',
        inv.isLegacy ? 'Yes' : 'No'
      ]);
    });
    rows.push(['']);
    
    // Add customer reconciliation
    rows.push(['CUSTOMER RECONCILIATION']);
    rows.push(['Customer', 'Stored Balance', 'Computed Balance', 'Mismatch']);
    
    reportData.customerReconciliation.forEach(rec => {
      rows.push([
        rec.customerName || rec.customerId || '',
        rec.storedOutstanding || 0,
        rec.computedOutstanding || 0,
        rec.mismatch ? 'YES' : 'NO'
      ]);
    });
    
    return rows.map(row => 
      row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(',')
    ).join('\n');
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount);

  return (
    <div className="fixed inset-0 bg-white/30 bg-opacity-50 backdrop-blur-md flex justify-center items-center z-50 p-4">
      <div className="bg-white w-full max-w-6xl rounded-lg overflow-auto max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Full {role === 'controller' ? 'Controller' : 'Sales'} Report</h2>
          <div className="space-x-2">
            <button onClick={onClose} className="py-2 px-4 bg-gray-300 rounded">Close</button>
          </div>
        </div>

        <div className="p-4">
          {/* Report Generation Controls */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Generate Report</h3>
            
            {/* Connection Status */}
            {!db && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm font-medium text-red-800">
                    ⚠️ Database Connection Missing
                  </span>
                </div>
                <div className="text-xs text-red-600 mt-1">
                  Please refresh the page to restore the database connection.
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div className="flex items-center">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={includeLegacy}
                    onChange={(e) => setIncludeLegacy(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm">Include Legacy Data</span>
                </label>
              </div>
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={handleGenerate} 
                disabled={isLoading || !db}
                className={`py-2 px-4 rounded ${
                  isLoading || !db 
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                } disabled:opacity-50`}
                title={!db ? 'Database connection required' : ''}
              >
                {isLoading ? 'Generating...' : !db ? 'No Database Connection' : 'Generate Report'}
              </button>
              {report && (
                <button 
                  onClick={() => downloadCsvClient(report)} 
                  disabled={isExporting}
                  className="py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </button>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-8">
              <div className="text-lg">Generating report — please wait...</div>
              <div className="text-sm text-gray-500 mt-2">This may take a few moments for large datasets</div>
            </div>
          )}

          {error && (
            <div className="text-red-600 bg-red-50 p-4 rounded-lg mb-4">
              <strong>Error:</strong> {error}
              {error.includes('Cloud Functions are not available') && (
                <div className="mt-2 text-sm">
                  <p><strong>To fix this:</strong></p>
                  <ol className="list-decimal list-inside mt-1 space-y-1">
                    <li>Complete Firebase authentication: <code>firebase login</code></li>
                    <li>Deploy the functions: <code>firebase deploy --only functions</code></li>
                    <li>Ensure you have proper user roles set up</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {report && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800">Approved Invoices</h4>
                  <div className="text-2xl font-bold text-blue-900">{report.summary.totalApprovedInvoicesCount}</div>
                  <div className="text-sm text-blue-700">{formatCurrency(report.summary.totalApprovedInvoicesValue)}</div>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-green-800">Revenue</h4>
                  <div className="text-2xl font-bold text-green-900">{formatCurrency(report.summary.totalRecognizedRevenue)}</div>
                  <div className="text-sm text-green-700">Recognized</div>
                </div>
                
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-yellow-800">Outstanding AR</h4>
                  <div className="text-2xl font-bold text-yellow-900">{formatCurrency(report.summary.outstandingAR)}</div>
                  <div className="text-sm text-yellow-700">Total Outstanding</div>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-purple-800">Payments</h4>
                  <div className="text-2xl font-bold text-purple-900">{formatCurrency(report.summary.totalPaymentsReceived)}</div>
                  <div className="text-sm text-purple-700">Received</div>
                </div>
              </div>

              {/* Aging Chart */}
              <div className="mb-6">
                <h4 className="font-semibold mb-3">Aging Analysis (GHS)</h4>
                <div className="bg-white p-4 rounded-lg border">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={Object.entries(report.agingBuckets).map(([range, value]) => ({ range, value }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="value" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue Trend Chart */}
              <div className="mb-6">
                <h4 className="font-semibold mb-3">Revenue Trend</h4>
                <div className="bg-white p-4 rounded-lg border">
                  <MiniRevenueChart invoices={report.invoices} formatCurrency={formatCurrency} />
                </div>
              </div>

              {/* Detailed Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Invoices */}
                <div>
                  <h4 className="font-semibold mb-3">Top 20 Invoices</h4>
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="overflow-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-2 text-left">ID</th>
                            <th className="p-2 text-left">Customer</th>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-right">Total</th>
                            <th className="p-2 text-right">Remaining</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.invoices.slice(0,20).map(inv => (
                            <tr key={inv.id} className="border-b hover:bg-gray-50">
                              <td className="p-2">{inv.id}</td>
                              <td className="p-2">{inv.customerName || 'N/A'}</td>
                              <td className="p-2">{inv.date ? new Date(inv.date).toLocaleDateString() : 'N/A'}</td>
                              <td className="p-2 text-right">{formatCurrency(inv.total)}</td>
                              <td className="p-2 text-right">{formatCurrency(inv.remaining)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Customer Reconciliation */}
                <div>
                  <h4 className="font-semibold mb-3">Customer Reconciliation (Mismatches)</h4>
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="overflow-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-2 text-left">Customer</th>
                            <th className="p-2 text-right">Stored</th>
                            <th className="p-2 text-right">Computed</th>
                            <th className="p-2 text-center">Mismatch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.customerReconciliation.filter(r => r.mismatch).slice(0,20).map(r => (
                            <tr key={r.customerId} className="border-b hover:bg-gray-50">
                              <td className="p-2">{r.customerName || r.customerId}</td>
                              <td className="p-2 text-right">{formatCurrency(r.storedOutstanding)}</td>
                              <td className="p-2 text-right">{formatCurrency(r.computedOutstanding)}</td>
                              <td className="p-2 text-center">
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">YES</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Metrics */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-red-800">Rejected Invoices</h4>
                  <div className="text-xl font-bold text-red-900">{report.summary.rejectedInvoiceCount}</div>
                  <div className="text-sm text-red-700">{formatCurrency(report.summary.rejectedInvoiceValue)}</div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-800">Legacy Opening Balances</h4>
                  <div className="text-xl font-bold text-gray-900">{report.summary.legacyOpeningBalanceCount}</div>
                  <div className="text-sm text-gray-700">{formatCurrency(report.summary.legacyOpeningBalanceValue)}</div>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800">Total Invoices</h4>
                  <div className="text-xl font-bold text-blue-900">{report.invoices.length}</div>
                  <div className="text-sm text-blue-700">In Report</div>
                </div>
              </div>

              {/* Report generated with live data from Firebase */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniRevenueChart({ invoices = [], formatCurrency }) {
  // group by YYYY-MM
  const map = {};
  invoices.forEach(inv => {
    if (inv.status === 'Approved' || inv.status === 'Paid') {
      const d = inv.date ? inv.date.slice(0,7) : 'unknown';
      map[d] = (map[d] || 0) + (inv.total || 0);
    }
  });
  const data = Object.entries(map).map(([k,v]) => ({ month: k, value: v })).sort((a,b)=>a.month.localeCompare(b.month));
  
  if (!data.length) return <div className="text-sm text-gray-500 text-center py-8">No revenue data available</div>;
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(value) => formatCurrency(value)} />
        <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
} 