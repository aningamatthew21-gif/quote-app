import React, { createContext, useContext, useState, useEffect } from 'react';
import { signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import GlobalStaleCheck from '../components/GlobalStaleCheck';
import { db, auth } from '../firebase';
import { logActivity } from '../utils/logger';
import { AuthService } from '../services/authService';

// Import all page components
import LoginScreen from '../pages/LoginScreen';
import ControllerAnalyticsDashboard from '../pages/ControllerAnalyticsDashboard';
import SalesAnalyticsDashboard from '../pages/SalesAnalyticsDashboard';
import QuotingModule from '../pages/QuotingModule';
import MyInvoices from '../pages/MyInvoices';
import SalesInvoiceApproval from '../pages/SalesInvoiceApproval';
import SalesInvoiceReview from '../pages/SalesInvoiceReview';
import AllInvoices from '../pages/AllInvoices';
import InvoiceEditor from '../pages/InvoiceEditor';
import InventoryManagement from '../pages/InventoryManagement';
import CustomerManagement from '../pages/CustomerManagement';
import CustomerPortal from '../pages/CustomerPortal';
import TaxSettings from '../pages/TaxSettings';
import AuditTrail from '../pages/AuditTrail';
import PricingManagementLocal from '../components/PricingManagementLocal';


const AppContext = createContext();

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};

export const AppProvider = ({ children }) => {
    // Company branding
    const companyName = 'MIDSA';

    const [page, setPage] = useState('login');
    const [pageContext, setPageContext] = useState(null);
    const [firestoreInstance, setFirestoreInstance] = useState(db);
    const [authInstance, setAuthInstance] = useState(auth);
    const [appId, setAppId] = useState('default-app-id');
    const [isLoading, setIsLoading] = useState(true);
    const [userId, setUserId] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [appUser, setAppUser] = useState(null);

    useEffect(() => {
        console.log('🔍 [DEBUG] AppContext: Initializing Firebase...');

        try {
            console.log('🔍 [DEBUG] AppContext: Using shared Firebase instance...');

            setAppId(typeof __app_id !== 'undefined' ? __app_id : 'default-app-id');
            console.log('✅ [DEBUG] AppContext: State updated with Firebase instances');

            const unsub = onAuthStateChanged(auth, async (user) => {
                console.log('🔍 [DEBUG] AppContext: Auth state changed:', user ? `User: ${user.uid}` : 'No user');

                if (user) {
                    setUserId(user.uid);
                    console.log('✅ [DEBUG] AppContext: User authenticated:', user.uid);

                    // Log successful login
                    const username = user.email ? user.email.split('@')[0] : user.uid;
                    logActivity(db, typeof __app_id !== 'undefined' ? __app_id : 'default-app-id', username, 'LOGIN_SUCCESS', 'User logged in successfully', {
                        category: 'auth',
                        authMethod: user.isAnonymous ? 'anonymous' : 'email',
                        originalUserId: user.uid
                    });
                } else {
                    try {
                        console.log('🔍 [DEBUG] AppContext: Attempting anonymous sign-in...');
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            console.log('🔍 [DEBUG] AppContext: Using custom token...');
                            await signInWithCustomToken(auth, __initial_auth_token);
                        } else {
                            console.log('🔍 [DEBUG] AppContext: Using anonymous sign-in...');
                            const userCredential = await signInAnonymously(auth);
                            console.log('✅ [DEBUG] AppContext: Anonymous sign-in successful:', userCredential.user.uid);
                        }
                    } catch (error) {
                        console.error("❌ [ERROR] AppContext: Authentication failed:", error);
                        console.error("❌ [ERROR] AppContext: Error details:", {
                            code: error.code,
                            message: error.message,
                            stack: error.stack
                        });

                        // Log failed login attempt
                        if (firestoreInstance) {
                            logActivity(firestoreInstance, typeof __app_id !== 'undefined' ? __app_id : 'default-app-id', 'system', 'LOGIN_FAILURE', `Authentication failed: ${error.message}`, {
                                category: 'auth',
                                errorCode: error.code
                            });
                        }
                    }
                }
                setIsLoading(false);
                console.log('✅ [DEBUG] AppContext: Loading completed');
            });

            return () => {
                console.log('🔄 [DEBUG] AppContext: Cleaning up auth listener');
                unsub();
            };

        } catch (error) {
            console.error("❌ [ERROR] AppContext: Firebase initialization failed:", error);
            console.error("❌ [ERROR] AppContext: Error details:", {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            setIsLoading(false);
        }
    }, []);



    const navigate = (newPage, context = null) => {
        console.log(`Navigate to: ${newPage}`, context);

        // Log page navigation
        if (db && appId) {
            const username = userEmail ? userEmail.split('@')[0] : (userId || 'System');
            logActivity(db, appId, username, 'PAGE_VIEW', `Navigated to ${newPage}`, {
                category: 'navigation',
                page: newPage,
                previousPage: page,
                context: context ? JSON.stringify(context) : null,
                originalUserId: userId
            });
        }

        setPage(newPage);
        setPageContext(context);
    };

    const value = {
        companyName,
        page,
        pageContext,
        db: firestoreInstance,
        auth: authInstance,
        appId,
        isLoading,
        userId,
        userEmail,
        appUser,
        setAppUser,
        setUserEmail,
        navigate
    };

    // Login handlers
    const handleLogin = async (email) => {
        console.log('🔐 [DEBUG] handleLogin called with email:', email);
        try {
            if (!firestoreInstance) {
                console.error('❌ [ERROR] Database not initialized');
                return;
            }

            // Create AuthService instance
            const authService = new AuthService(db);

            // Send OTP to email
            const otp = await authService.sendOtp(email);
            console.log('✅ [DEBUG] OTP sent successfully to:', email);
            setUserEmail(email); // Store email for OTP verification

            // OTP sent successfully, user should enter OTP
        } catch (error) {
            console.error('❌ [ERROR] OTP request failed:', error);
        }
    };

    const handleOTPLogin = async (otpCode) => {
        console.log('🔐 [DEBUG] handleOTPLogin called with OTP:', otpCode);
        try {
            if (!firestoreInstance || !authInstance || !userEmail) {
                console.error('❌ [ERROR] Missing required data for OTP login:', { db: !!firestoreInstance, auth: !!authInstance, email: userEmail });
                return;
            }

            // Create AuthService instance
            const authService = new AuthService(db);

            // Validate OTP
            const isValid = await authService.validateOtp(userEmail, otpCode);
            console.log('✅ [DEBUG] OTP validation result:', isValid);

            if (isValid) {
                // Get user data
                const userData = await authService.getUserByEmail(userEmail);
                console.log('✅ [DEBUG] User data retrieved:', userData);

                if (userData) {
                    // Sign in anonymously since we don't have custom token generation
                    const credential = await signInAnonymously(auth);
                    console.log('✅ [DEBUG] Signed in anonymously:', credential.user.uid);

                    // Set app user with role
                    setAppUser(userData);
                    setUserId(credential.user.uid);

                    // Delete OTP after successful login
                    await authService.deleteOtp(userEmail);

                    // Navigate to appropriate dashboard based on role
                    if (userData.role === 'controller') {
                        navigate('controllerDashboard');
                    } else if (userData.role === 'sales') {
                        navigate('salesDashboard');
                    }
                } else {
                    console.log('⚠️ [DEV] User data not found, creating new user...');
                    try {
                        const newUser = await authService.createUser(userEmail);

                        // Sign in anonymously
                        const credential = await signInAnonymously(auth);
                        console.log('✅ [DEBUG] Signed in anonymously:', credential.user.uid);

                        // Set app user
                        setAppUser(newUser);
                        setUserId(credential.user.uid);

                        // Delete OTP
                        await authService.deleteOtp(userEmail);

                        // Navigate to sales dashboard by default
                        navigate('salesDashboard');
                    } catch (createError) {
                        console.error('❌ [ERROR] Failed to create user:', createError);
                    }
                }
            } else {
                console.error('❌ [ERROR] Invalid OTP');
            }
        } catch (error) {
            console.error('❌ [ERROR] OTP verification failed:', error);
        }
    };

    // Render the current page based on state
    const renderPage = () => {
        if (isLoading) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-100">
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
                        <p className="text-gray-600 text-lg">Loading...</p>
                    </div>
                </div>
            );
        }

        const commonProps = {
            navigateTo: navigate,
            db: firestoreInstance,
            appId,
            userId,
            currentUser: appUser,
            userEmail
        };

        switch (page) {
            case 'login':
                return <LoginScreen onLogin={handleLogin} onOTPLogin={handleOTPLogin} companyName={companyName} />;
            case 'controllerDashboard':
                return <ControllerAnalyticsDashboard {...commonProps} />;
            case 'salesDashboard':
                return <SalesAnalyticsDashboard {...commonProps} />;
            case 'quoting':
                return <QuotingModule {...commonProps} />;
            case 'myInvoices':
                return <MyInvoices {...commonProps} pageContext={pageContext} />;
            case 'salesInvoiceApproval':
                return <SalesInvoiceApproval {...commonProps} />;
            case 'salesInvoiceReview':
                return <SalesInvoiceReview {...commonProps} pageContext={pageContext} />;
            case 'invoices':
                return <AllInvoices {...commonProps} pageContext={pageContext} />;
            case 'invoiceEditor':
                return <InvoiceEditor {...commonProps} pageContext={pageContext} />;
            case 'inventory':
                return <InventoryManagement {...commonProps} />;
            case 'customers':
                return <CustomerManagement {...commonProps} />;
            case 'customerPortal':
                return <CustomerPortal {...commonProps} customerId={pageContext} />;
            case 'taxSettings':
                return <TaxSettings {...commonProps} />;
            case 'auditTrail':
                return <AuditTrail {...commonProps} />;
            case 'pricingManagement':
                return <PricingManagementLocal {...commonProps} />;
            default:
                return <LoginScreen onLogin={handleLogin} onOTPLogin={handleOTPLogin} companyName={companyName} />;
        }
    };

    return (
        <AppContext.Provider value={value}>
            {renderPage()}
            <GlobalStaleCheck />
        </AppContext.Provider>
    );
};
