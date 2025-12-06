import React, { useState } from 'react';
import { collection, addDoc, getDocs, query, limit } from 'firebase/firestore';

const ConnectionTest = ({ db }) => {
    const [testResults, setTestResults] = useState({});
    const [isTesting, setIsTesting] = useState(false);

    const runConnectionTest = async () => {
        if (!db) {
            setTestResults({ error: 'Database not available' });
            return;
        }

        setIsTesting(true);
        const results = {};

        try {
            // Test 1: Simple read operation
            console.log('🔍 [TEST] Testing read operation...');
            try {
                const testQuery = query(collection(db, 'test'), limit(1));
                const snapshot = await getDocs(testQuery);
                results.read = { success: true, message: `Read successful: ${snapshot.docs.length} documents` };
                console.log('✅ [TEST] Read test passed');
            } catch (err) {
                results.read = { success: false, message: err.message };
                console.error('❌ [TEST] Read test failed:', err);
            }

            // Test 2: Simple write operation
            console.log('🔍 [TEST] Testing write operation...');
            try {
                const docRef = await addDoc(collection(db, 'test'), {
                    timestamp: new Date(),
                    test: true,
                    message: 'Connection test document'
                });
                results.write = { success: true, message: `Write successful: ${docRef.id}` };
                console.log('✅ [TEST] Write test passed');
            } catch (err) {
                results.write = { success: false, message: err.message };
                console.error('❌ [TEST] Write test failed:', err);
            }

            // Test 3: Collection listing
            console.log('🔍 [TEST] Testing collection access...');
            try {
                const collections = ['inventory', 'customers', 'invoices'];
                for (const colName of collections) {
                    try {
                        const q = query(collection(db, `artifacts/default-app-id/public/data/${colName}`), limit(1));
                        const snapshot = await getDocs(q);
                        results[`collection_${colName}`] = { 
                            success: true, 
                            message: `${colName}: ${snapshot.docs.length} documents` 
                        };
                    } catch (err) {
                        results[`collection_${colName}`] = { 
                            success: false, 
                            message: `${colName}: ${err.message}` 
                        };
                    }
                }
                console.log('✅ [TEST] Collection tests completed');
            } catch (err) {
                results.collections = { success: false, message: err.message };
                console.error('❌ [TEST] Collection tests failed:', err);
            }

        } catch (err) {
            results.error = err.message;
            console.error('❌ [TEST] Connection test failed:', err);
        } finally {
            setIsTesting(false);
        }

        setTestResults(results);
    };

    const getStatusIcon = (success) => {
        return success ? '✅' : '❌';
    };

    const getStatusColor = (success) => {
        return success ? 'text-green-600' : 'text-red-600';
    };

    return (
        <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Quick Connection Test</h3>
            
            <button
                onClick={runConnectionTest}
                disabled={isTesting || !db}
                className="w-full mb-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isTesting ? 'Testing...' : 'Test Database Connection'}
            </button>

            {!db && (
                <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
                    Database instance not available. Please wait for initialization.
                </div>
            )}

            {Object.keys(testResults).length > 0 && (
                <div className="space-y-3">
                    <h4 className="font-semibold text-gray-700">Test Results:</h4>
                    
                    {Object.entries(testResults).map(([test, result]) => {
                        if (test === 'error') {
                            return (
                                <div key={test} className="p-3 bg-red-100 border border-red-300 text-red-700 rounded">
                                    <strong>Error:</strong> {result}
                                </div>
                            );
                        }

                        if (typeof result === 'object' && result.hasOwnProperty('success')) {
                            return (
                                <div key={test} className={`p-3 border rounded ${result.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                                    <div className="flex items-center">
                                        <span className={`mr-2 ${getStatusColor(result.success)}`}>
                                            {getStatusIcon(result.success)}
                                        </span>
                                        <span className="font-medium">
                                            {test.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                                        </span>
                                    </div>
                                    <div className={`mt-1 text-sm ${getStatusColor(result.success)}`}>
                                        {result.message}
                                    </div>
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>
            )}

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                <strong>Note:</strong> This test will create a temporary document in the 'test' collection. 
                You can delete it later from the Firebase console.
            </div>
        </div>
    );
};

export default ConnectionTest;


