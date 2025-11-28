import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import Icon from '../components/common/Icon';

const AuditTrail = ({ navigateTo, db, appId }) => {
    const [filters, setFilters] = useState({ date: '', user: '', action: '' });

    // Use onSnapshot for audit logs to avoid index requirement
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;

        const unsub = onSnapshot(collection(db, `artifacts/${appId}/public/data/audit_logs`), (snapshot) => {
            const logData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort client-side to avoid index requirement
            logData.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA; // Descending order
            });
            setLogs(logData);
            setLoading(false);
        }, (error) => {
            console.error('Audit logs error:', error);
            setLoading(false);
        });

        return () => unsub();
    }, [db, appId]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const logDate = log.timestamp?.toDate().toISOString().split('T')[0];
            const dateMatch = !filters.date || logDate === filters.date;
            const userMatch = !filters.user || (log.userId && log.userId.toLowerCase().includes(filters.user.toLowerCase()));
            const actionMatch = !filters.action || log.action.toLowerCase().includes(filters.action.toLowerCase());
            return dateMatch && userMatch && actionMatch;
        });
    }, [logs, filters]);

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">Activity & Audit Trail</h1>
                    <button onClick={() => navigateTo('controllerDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>
                </header>
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <input type="date" name="date" value={filters.date} onChange={handleFilterChange} className="p-2 border rounded-md" />
                        <input type="text" name="user" placeholder="Filter by User ID..." value={filters.user} onChange={handleFilterChange} className="p-2 border rounded-md" />
                        <input type="text" name="action" placeholder="Filter by Action..." value={filters.action} onChange={handleFilterChange} className="p-2 border rounded-md" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-3 font-semibold">Timestamp</th>
                                    <th className="p-3 font-semibold">User</th>
                                    <th className="p-3 font-semibold">Action</th>
                                    <th className="p-3 font-semibold">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map(log => (
                                    <tr key={log.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 text-sm">{log.timestamp?.toDate().toLocaleString()}</td>
                                        <td className="p-3 text-sm font-mono">{log.userId}</td>
                                        <td className="p-3 font-medium">{log.action}</td>
                                        <td className="p-3 text-sm">
                                            {typeof log.details === 'object' && log.details !== null
                                                ? JSON.stringify(log.details)
                                                : log.details
                                            }
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

export default AuditTrail;
