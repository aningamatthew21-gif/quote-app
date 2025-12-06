import React, { useState, useEffect } from 'react';
import { 
    getFirestore, collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, getDocs, query, where, getDoc, serverTimestamp, FieldValue, increment, orderBy, limit, startAfter 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import ConnectionTest from './ConnectionTest';

const DatabaseDiagnostic = ({ firebaseConfig }) => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);

    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                const { initializeApp } = await import('firebase/app');
                const { getFirestore, getAuth } = await import('firebase/firestore');
                
                const app = initializeApp(firebaseConfig);
                const firestore = getFirestore(app);
                const authInstance = getAuth(app);
                
                setDb(firestore);
                setAuth(authInstance);
            } catch (error) {
                console.error('Failed to initialize Firebase:', error);
            }
        };

        initializeFirebase();
    }, [firebaseConfig]);
    const [diagnosticResults, setDiagnosticResults] = useState({});
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState(null);

    const runDiagnostics = async () => {
        setIsRunning(true);
        setError(null);
        const results = {};

        try {
            // 1. Test Firebase App Initialization
            console.log('🔍 [DIAGNOSTIC] Testing Firebase App initialization...');
            try {
                const { initializeApp } = await import('firebase/app');
                const app = initializeApp(firebaseConfig);
                results.appInitialization = { status: 'SUCCESS', message: 'Firebase app initialized successfully' };
                console.log('✅ [DIAGNOSTIC] Firebase app initialized');
            } catch (err) {
                results.appInitialization = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Firebase app initialization failed:', err);
                throw err;
            }

            // 2. Test Firestore Connection
            console.log('🔍 [DIAGNOSTIC] Testing Firestore connection...');
            try {
                const firestore = getFirestore();
                results.firestoreConnection = { status: 'SUCCESS', message: 'Firestore connection established' };
                console.log('✅ [DIAGNOSTIC] Firestore connected');
            } catch (err) {
                results.firestoreConnection = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Firestore connection failed:', err);
                throw err;
            }

            // 3. Test Authentication
            console.log('🔍 [DIAGNOSTIC] Testing Authentication...');
            try {
                const auth = getAuth();
                results.authentication = { status: 'SUCCESS', message: 'Authentication service initialized' };
                console.log('✅ [DIAGNOSTIC] Authentication initialized');
            } catch (err) {
                results.authentication = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Authentication initialization failed:', err);
                throw err;
            }

            // 4. Test Anonymous Sign-in
            console.log('🔍 [DIAGNOSTIC] Testing anonymous sign-in...');
            try {
                const auth = getAuth();
                const userCredential = await signInAnonymously(auth);
                results.anonymousSignIn = { 
                    status: 'SUCCESS', 
                    message: `Anonymous sign-in successful. User ID: ${userCredential.user.uid}` 
                };
                console.log('✅ [DIAGNOSTIC] Anonymous sign-in successful');
            } catch (err) {
                results.anonymousSignIn = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Anonymous sign-in failed:', err);
            }

            // 5. Test Firestore Read Operation
            console.log('🔍 [DIAGNOSTIC] Testing Firestore read operation...');
            try {
                const firestore = getFirestore();
                const testQuery = query(collection(firestore, 'test-collection'), limit(1));
                const snapshot = await getDocs(testQuery);
                results.firestoreRead = { 
                    status: 'SUCCESS', 
                    message: `Firestore read successful. Found ${snapshot.docs.length} documents` 
                };
                console.log('✅ [DIAGNOSTIC] Firestore read successful');
            } catch (err) {
                results.firestoreRead = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Firestore read failed:', err);
            }

            // 6. Test Firestore Write Operation
            console.log('🔍 [DIAGNOSTIC] Testing Firestore write operation...');
            try {
                const firestore = getFirestore();
                const testDocRef = doc(collection(firestore, 'test-collection'));
                await setDoc(testDocRef, {
                    test: true,
                    timestamp: serverTimestamp(),
                    message: 'Diagnostic test document'
                });
                results.firestoreWrite = { 
                    status: 'SUCCESS', 
                    message: 'Firestore write successful' 
                };
                console.log('✅ [DIAGNOSTIC] Firestore write successful');
            } catch (err) {
                results.firestoreWrite = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Firestore write failed:', err);
            }

            // 7. Test Network Connectivity
            console.log('🔍 [DIAGNOSTIC] Testing network connectivity...');
            try {
                const response = await fetch('https://www.google.com', { mode: 'no-cors' });
                results.networkConnectivity = { 
                    status: 'SUCCESS', 
                    message: 'Network connectivity confirmed' 
                };
                console.log('✅ [DIAGNOSTIC] Network connectivity confirmed');
            } catch (err) {
                results.networkConnectivity = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Network connectivity failed:', err);
            }

            // 8. Test Firebase Project Access
            console.log('🔍 [DIAGNOSTIC] Testing Firebase project access...');
            try {
                const response = await fetch(`https://${firebaseConfig.projectId}.firebaseapp.com`, { mode: 'no-cors' });
                results.projectAccess = { 
                    status: 'SUCCESS', 
                    message: 'Firebase project accessible' 
                };
                console.log('✅ [DIAGNOSTIC] Firebase project accessible');
            } catch (err) {
                results.projectAccess = { status: 'FAILED', message: err.message };
                console.error('❌ [DIAGNOSTIC] Firebase project access failed:', err);
            }

        } catch (err) {
            setError(err.message);
            console.error('❌ [DIAGNOSTIC] Diagnostic failed:', err);
        } finally {
            setIsRunning(false);
        }

        setDiagnosticResults(results);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'SUCCESS': return 'text-green-600';
            case 'FAILED': return 'text-red-600';
            default: return 'text-gray-600';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'SUCCESS': return '✅';
            case 'FAILED': return '❌';
            default: return '⏳';
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Database Connection Diagnostic</h2>
            
            <div className="mb-6">
                <button
                    onClick={runDiagnostics}
                    disabled={isRunning}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isRunning ? 'Running Diagnostics...' : 'Run Database Diagnostics'}
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {Object.keys(diagnosticResults).length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-700">Diagnostic Results:</h3>
                    
                    {Object.entries(diagnosticResults).map(([test, result]) => (
                        <div key={test} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-medium text-gray-700">
                                        {test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                                    </span>
                                    <span className={`ml-2 ${getStatusColor(result.status)}`}>
                                        {getStatusIcon(result.status)} {result.status}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-2 text-sm text-gray-600">
                                {result.message}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-8 p-4 bg-gray-100 rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-2">Troubleshooting Tips:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Check your internet connection</li>
                    <li>• Verify Firebase project configuration</li>
                    <li>• Check browser console for detailed error messages</li>
                    <li>• Ensure Firebase project is active and billing is enabled</li>
                    <li>• Check if your IP is whitelisted in Firebase console</li>
                    <li>• Try refreshing the page or clearing browser cache</li>
                </ul>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-700 mb-2">Firebase Configuration:</h4>
                <div className="text-sm text-blue-600">
                    <div><strong>Project ID:</strong> {firebaseConfig.projectId}</div>
                    <div><strong>Auth Domain:</strong> {firebaseConfig.authDomain}</div>
                    <div><strong>API Key:</strong> {firebaseConfig.apiKey.substring(0, 10)}...</div>
                </div>
            </div>

            <div className="mt-6">
                <ConnectionTest db={db} />
            </div>
        </div>
    );
};

export default DatabaseDiagnostic;
