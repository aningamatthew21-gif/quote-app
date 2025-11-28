import React, { useState, useEffect, useRef, useMemo } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import Notification from '../components/common/Notification';
import { logSystemActivity } from '../utils/logger';
import TargetsSettings from '../components/settings/TargetsSettings';

import { useActivityLog } from '../hooks/useActivityLog';
import { useRealtimeInventory } from '../hooks/useRealtimeInventory';
import { formatCurrency } from '../utils/formatting';

const TaxSettings = ({ navigateTo, db, appId, userId, currentUser }) => {
    const { log } = useActivityLog();
    const [taxes, setTaxes] = useState([]);
    const [notification, setNotification] = useState(null);
    const [signatures, setSignatures] = useState([]);
    const [newSignature, setNewSignature] = useState({
        controllerName: '',
        subsidiary: '',
        signatureFile: null,
        signatureDataUrl: null
    });
    const [signatureTab, setSignatureTab] = useState('upload');
    const [signaturesLoading, setSignaturesLoading] = useState(true);
    const [invoiceSettings, setInvoiceSettings] = useState(null);
    const [settingsLoading, setSettingsLoading] = useState(false);

    const signatureCanvasRef = useRef(null);

    // --- Price List State ---
    const { data: inventory, loading: inventoryLoading } = useRealtimeInventory(db, appId);
    const [activeTab, setActiveTab] = useState('taxes');
    const [priceListSearch, setPriceListSearch] = useState('');
    // --- Exchange Rate Settings State ---
    const [rateMonth, setRateMonth] = useState(() => {

        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const value = `${now.getFullYear()}-${month}`;
        console.log('🗓️ [DEBUG] rateMonth initialized:', value);
        return value;
    });
    const [usdToGhs, setUsdToGhs] = useState(() => {
        console.log('💱 [DEBUG] Initializing usdToGhs state to blank');
        return '';
    });
    const [ratesLoading, setRatesLoading] = useState(true);
    const [ratesHistory, setRatesHistory] = useState(() => {
        console.log('📈 [DEBUG] Initializing ratesHistory as empty array');
        return [];
    });
    const [showRatesTable, setShowRatesTable] = useState(false);
    const currentMonthKey = useMemo(() => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const key = `${now.getFullYear()}-${month}`;
        console.log('🗝️ [DEBUG] Computed currentMonthKey:', key);
        return key;
    }, []);
    const currentMonthRate = useMemo(() => {
        const found = ratesHistory.find(r => r.month === currentMonthKey);
        const value = found ? Number(found.usdToGhs) : null;
        console.log('📌 [DEBUG] Derived currentMonthRate:', { month: currentMonthKey, value });
        return value;
    }, [ratesHistory, currentMonthKey]);

    const taxDocRef = useMemo(() => doc(db, `artifacts/${appId}/public/data/settings`, 'taxes'), [db, appId]);
    const signaturesDocRef = useMemo(() => doc(db, `artifacts/${appId}/public/data/settings`, 'signatures'), [db, appId]);
    const exchangeRatesDocRef = useMemo(() => {
        console.log('🔗 [DEBUG] Creating exchangeRatesDocRef');
        const ref = doc(db, `artifacts/${appId}/public/data/settings`, 'exchangeRates');
        console.log('🔗 [DEBUG] exchangeRatesDocRef path:', ref.path);
        return ref;
    }, [db, appId]);

    // --- Load Invoice Settings ---
    useEffect(() => {
        const loadInvoiceSettings = async () => {
            try {
                const settingsRef = doc(db, `artifacts/${appId}/public/data/settings`, 'invoice');
                const settingsSnap = await getDoc(settingsRef);

                if (settingsSnap.exists()) {
                    setInvoiceSettings(settingsSnap.data());
                } else {
                    // Default invoice settings
                    setInvoiceSettings({
                        companyAddress: {
                            poBox: 'P.O. Box KN 785',
                            city: 'Accra, Ghana',
                            tel: '+233 302 220 180',
                            fax: '+233 302 220 180',
                            email: 'sales@margins-id.com'
                        },
                        accountDetails: {
                            accountName: 'Margins ID Systems Applications Ltd.',
                            bankers: 'Fidelity Bank Limited',
                            address: 'Ridge Towers, Cruickshank Road, Ridge, Accra',
                            accountNumbers: '1070033129318 - GHC'
                        },
                        locationAddress: {
                            companyName: 'Margins ID Systems Applications Ltd.',
                            unit: 'Unit B607, Octagon',
                            street: 'Barnes Road, Accra Central'
                        }
                    });
                }
            } catch (err) {
                console.error('Error loading invoice settings:', err);
            }
        };
        loadInvoiceSettings();
    }, [db, appId]);

    const handleSaveInvoiceSettings = async (e) => {
        e.preventDefault();
        setSettingsLoading(true);
        const formData = new FormData(e.target);

        const settings = {
            companyAddress: {
                poBox: formData.get('poBox'),
                city: formData.get('city'),
                tel: formData.get('tel'),
                fax: formData.get('fax'),
                email: formData.get('email')
            },
            accountDetails: {
                accountName: formData.get('accountName'),
                bankers: formData.get('bankers'),
                address: formData.get('bankAddress'),
                accountNumbers: formData.get('accountNumbers')
            },
            locationAddress: {
                companyName: formData.get('locCompanyName'),
                unit: formData.get('locUnit'),
                street: formData.get('locStreet')
            }
        };

        try {
            const settingsRef = doc(db, `artifacts/${appId}/public/data/settings`, 'invoice');
            await setDoc(settingsRef, settings);
            setInvoiceSettings(settings);

            await log('SETTINGS_CHANGE', `Updated Company Data Settings`, {
                category: 'settings',
                settingType: 'invoice_settings',
                details: settings
            });

            setNotification({ type: 'success', message: 'Company Data settings saved successfully' });
        } catch (err) {
            console.error('Error saving invoice settings:', err);
            setNotification({ type: 'error', message: 'Failed to save settings' });
        } finally {
            setSettingsLoading(false);
        }
    };

    // --- Load Exchange Rates History ---
    useEffect(() => {
        console.log('📡 [DEBUG] Setting up onSnapshot for exchange rates');
        if (!exchangeRatesDocRef) {
            console.warn('⚠️ [DEBUG] exchangeRatesDocRef missing');
            return;
        }
        const unsubscribe = onSnapshot(exchangeRatesDocRef, (docSnap) => {
            console.log('📡 [DEBUG] ExchangeRates snapshot received:', { exists: docSnap.exists() });
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log('📦 [DEBUG] Raw exchangeRates data:', data);
                const list = Array.isArray(data.rates) ? data.rates : [];
                console.log('📊 [DEBUG] Parsed rates list length:', list.length);
                setRatesHistory(list.sort((a, b) => (a.month > b.month ? -1 : 1)));
                // Pre-fill current month if available
                const current = list.find(r => r.month === rateMonth);
                if (current && typeof current.usdToGhs === 'number') {
                    console.log('↪️ [DEBUG] Prefilling usdToGhs from existing entry:', current.usdToGhs);
                    setUsdToGhs(String(current.usdToGhs));
                }
            } else {
                console.log('🆕 [DEBUG] ExchangeRates doc does not exist. Creating placeholder on save.');
                setRatesHistory([]);
            }
            setRatesLoading(false);
            console.log('✅ [DEBUG] Exchange rates loading complete');
        }, (error) => {
            console.error('❌ [ERROR] ExchangeRates snapshot error:', error);
            setRatesLoading(false);
            setNotification({ type: 'error', message: 'Failed to load exchange rates. Please refresh.' });
        });
        return () => {
            console.log('🔄 [DEBUG] Cleaning up exchange rates listener');
            unsubscribe();
        };
    }, [exchangeRatesDocRef, rateMonth]);

    const handleSaveExchangeRate = async () => {
        console.log('💾 [DEBUG] handleSaveExchangeRate called', { rateMonth, usdToGhs });
        try {
            const numericRate = parseFloat(usdToGhs);
            console.log('🧮 [DEBUG] Parsed numericRate:', numericRate);
            if (!rateMonth || isNaN(numericRate) || numericRate <= 0) {
                console.warn('⚠️ [DEBUG] Validation failed for exchange rate input');
                setNotification({ type: 'error', message: 'Enter a valid month and positive rate.' });
                return;
            }

            // Merge or insert for the month
            const existing = ratesHistory.find(r => r.month === rateMonth);
            console.log('🔎 [DEBUG] Existing month entry:', existing);
            let updatedRates;
            if (existing) {
                updatedRates = ratesHistory.map(r => r.month === rateMonth ? { ...r, usdToGhs: numericRate, updatedAt: new Date().toISOString(), updatedBy: userId } : r);
                console.log('📝 [DEBUG] Updated existing month in rates array');
            } else {
                const newEntry = { id: Date.now().toString(), month: rateMonth, usdToGhs: numericRate, createdAt: new Date().toISOString(), createdBy: userId };
                updatedRates = [...ratesHistory, newEntry];
                console.log('➕ [DEBUG] Added new month entry:', newEntry);
            }

            // Sort descending by month string
            updatedRates.sort((a, b) => (a.month > b.month ? -1 : 1));
            console.log('📊 [DEBUG] Sorted updatedRates length:', updatedRates.length);

            await setDoc(exchangeRatesDocRef, { rates: updatedRates }, { merge: true });
            console.log('✅ [DEBUG] Exchange rates saved to Firestore');

            await log('SETTINGS_CHANGE', `Updated exchange rate for ${rateMonth} to ${numericRate}`, {
                category: 'settings',
                settingType: 'exchange_rate',
                details: {
                    month: rateMonth,
                    rate: numericRate
                }
            });

            setRatesHistory(updatedRates);
            setNotification({ type: 'success', message: 'Exchange rate saved successfully.' });
        } catch (error) {
            console.error('❌ [ERROR] handleSaveExchangeRate failed:', error);
            setNotification({ type: 'error', message: 'Failed to save exchange rate.' });
        }
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(taxDocRef, (docSnap) => {
            if (docSnap.exists()) {
                console.log("Taxessssss21", docSnap.data().taxArray);
                setTaxes(docSnap.data().taxArray || []);
            } else {
                // If doc doesn't exist, create it with initial values
                // Note: initialTaxes needs to be defined or imported. Assuming it's a constant.
                // For now, I'll use a default empty array or define it if I can find it.
                // Based on previous code, it seems initialTaxes was defined in App.jsx.
                // I should probably pass it as a prop or define it here.
                // Let's assume it's handled by the backend or we can initialize with empty.
                // Or better, let's define a sensible default.
                const initialTaxes = [
                    { id: 'vat', name: 'VAT Standard', rate: 15.0, enabled: true },
                    { id: 'nhil', name: 'NHIL', rate: 2.5, enabled: true },
                    { id: 'getfund', name: 'GETFund', rate: 2.5, enabled: true },
                    { id: 'covid19', name: 'COVID-19 Levy', rate: 1.0, enabled: true }
                ];
                setDoc(taxDocRef, { taxArray: initialTaxes });
                console.log("InitialTaxessssss1", initialTaxes);
                setTaxes(initialTaxes);
            }
        });
        return () => unsubscribe();
    }, [taxDocRef]);

    // Load signatures with enhanced error handling
    useEffect(() => {
        console.log('🔍 [DEBUG] Signatures useEffect triggered', {
            signaturesDocRef: signaturesDocRef?.path,
            appId,
            userId
        });

        if (!signaturesDocRef) {
            console.warn('⚠️ [DEBUG] signaturesDocRef not available');
            return;
        }

        const unsubscribe = onSnapshot(signaturesDocRef, (docSnap) => {
            console.log('📡 [DEBUG] Signatures snapshot received:', {
                exists: docSnap.exists(),
                data: docSnap.data()
            });

            if (docSnap.exists()) {
                const signaturesData = docSnap.data().signatures || [];
                console.log('📋 [DEBUG] Signatures loaded:', { count: signaturesData.length });
                setSignatures(signaturesData);
            } else {
                console.log('📝 [DEBUG] Creating new signatures document');
                // If doc doesn't exist, create it with empty signatures array
                setDoc(signaturesDocRef, { signatures: [] }).then(() => {
                    console.log('✅ [DEBUG] New signatures document created');
                }).catch(error => {
                    console.error('❌ [ERROR] Failed to create signatures document:', error);
                    // Show user-friendly error message
                    setNotification({
                        type: 'error',
                        message: 'Network connection issue. Please refresh the page and try again.'
                    });
                });
                setSignatures([]);
            }
            setSignaturesLoading(false);
            console.log('✅ [DEBUG] Signatures loading completed');
        }, (error) => {
            console.error('❌ [ERROR] Signatures snapshot error:', error);

            // Enhanced error handling for different error types
            if (error.code === 'unavailable' || error.message.includes('QUIC') || error.message.includes('network')) {
                console.warn('⚠️ [WARNING] Firebase network connectivity issue detected');
                setNotification({
                    type: 'warning',
                    message: 'Network connection unstable. Signatures may not update in real-time. Please check your internet connection.'
                });
            } else {
                setNotification({
                    type: 'error',
                    message: 'Failed to load signatures. Please refresh the page.'
                });
            }

            setSignaturesLoading(false);
        });

        return () => {
            console.log('🔄 [DEBUG] Cleaning up signatures listener');
            unsubscribe();
        };
    }, [signaturesDocRef, appId, userId]);

    // Setup canvas drawing with proper DPI scaling
    useEffect(() => {
        console.log('🔍 [DEBUG] Canvas setup useEffect triggered', {
            signatureTab,
            canvasRef: !!signatureCanvasRef.current
        });

        // Only setup canvas when draw tab is active
        if (signatureTab !== 'draw') {
            console.log('📱 [DEBUG] Canvas setup skipped - not on draw tab');
            return;
        }

        const canvas = signatureCanvasRef.current;
        if (!canvas) {
            console.warn('⚠️ [DEBUG] Canvas not available for setup - will retry on next render');
            return;
        }

        // CRITICAL: Handle high DPI displays properly
        const setupCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            console.log('🎨 [DEBUG] Setting up canvas with DPI scaling', {
                displayWidth: rect.width,
                displayHeight: rect.height,
                devicePixelRatio: dpr
            });

            // Set actual canvas size accounting for device pixel ratio
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            const ctx = canvas.getContext('2d');
            // Scale the drawing context to match device pixel ratio
            ctx.scale(dpr, dpr);

            // Ensure canvas display size matches layout
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';

            console.log('✅ [DEBUG] Canvas setup complete:', {
                displaySize: { width: rect.width, height: rect.height },
                internalSize: { width: canvas.width, height: canvas.height },
                devicePixelRatio: dpr
            });
        };

        const ctx = canvas.getContext('2d');

        // Initial setup
        setupCanvas();

        // Re-setup on window resize
        window.addEventListener('resize', setupCanvas);

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        // Get coordinates with proper scaling
        const getCoordinates = (e) => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            let clientX, clientY;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // Calculate position relative to canvas, accounting for scaling
            const x = (clientX - rect.left);
            const y = (clientY - rect.top);

            return { x, y };
        };

        const startDrawing = (e) => {
            console.log('🎨 [DEBUG] Drawing started', {
                clientX: e.clientX,
                clientY: e.clientY,
                type: e.type
            });
            isDrawing = true;
            const coords = getCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
            console.log('📍 [DEBUG] Starting position:', { lastX, lastY });
        };

        const draw = (e) => {
            if (!isDrawing) return;

            const coords = getCoordinates(e);
            const currentX = coords.x;
            const currentY = coords.y;

            console.log('✏️ [DEBUG] Drawing line', {
                from: { x: lastX, y: lastY },
                to: { x: currentX, y: currentY }
            });

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(currentX, currentY);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            lastX = currentX;
            lastY = currentY;
        };

        const stopDrawing = () => {
            console.log('🛑 [DEBUG] Drawing stopped');
            isDrawing = false;
        };

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events for mobile
        canvas.addEventListener('touchstart', (e) => {
            console.log('📱 [DEBUG] Touch started', {
                touches: e.touches.length,
                clientX: e.touches[0]?.clientX,
                clientY: e.touches[0]?.clientY
            });
            e.preventDefault();
            isDrawing = true;
            const coords = getCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
            console.log('📍 [DEBUG] Touch position:', { lastX, lastY });
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isDrawing) return;

            const coords = getCoordinates(e);
            const currentX = coords.x;
            const currentY = coords.y;

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(currentX, currentY);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            lastX = currentX;
            lastY = currentY;
        });

        canvas.addEventListener('touchend', stopDrawing);

        return () => {
            console.log('🔄 [DEBUG] Cleaning up canvas event listeners');
            window.removeEventListener('resize', setupCanvas);
            canvas.removeEventListener('mousedown', startDrawing);
            canvas.removeEventListener('mousemove', draw);
            canvas.removeEventListener('mouseup', stopDrawing);
            canvas.removeEventListener('mouseout', stopDrawing);
            canvas.removeEventListener('touchstart', startDrawing);
            canvas.removeEventListener('touchmove', draw);
            canvas.removeEventListener('touchend', stopDrawing);
            console.log('✅ [DEBUG] Canvas cleanup completed');
        };
    }, [signatureTab]);

    const handleTaxChange = (id, field, value) => {
        setTaxes(currentTaxes =>
            currentTaxes.map(t =>
                t.id === id ? { ...t, [field]: field === 'rate' ? parseFloat(value) || 0 : value } : t
            )
        );
    };

    const handleSaveChanges = async () => {
        try {
            const oldTaxes = await getDoc(taxDocRef);
            const oldTaxData = oldTaxes.exists() ? oldTaxes.data().taxArray : [];

            await setDoc(taxDocRef, { taxArray: taxes });

            const changes = taxes.map((tax, index) => {
                const oldTax = oldTaxData[index] || {};
                return {
                    taxId: tax.id,
                    taxName: tax.name,
                    rateBefore: oldTax.rate,
                    rateAfter: tax.rate,
                    enabledBefore: oldTax.enabled,
                    enabledAfter: tax.enabled
                };
            });

            await log('SETTINGS_CHANGE', `Updated Tax Settings: Modified ${taxes.length} tax/levy settings`, {
                category: 'settings',
                settingType: 'taxes',
                taxChanges: changes,
                impact: 'Global tax configuration updated'
            });

            setNotification({ type: 'success', message: 'Tax settings saved successfully!' });
        } catch (error) {
            console.error("Error saving tax settings: ", error);
            setNotification({ type: 'error', message: 'Failed to save settings.' });
        }
    };

    // Signature management functions
    const handleSignatureFileUpload = (event) => {
        console.log('🔍 [DEBUG] handleSignatureFileUpload called', { event: event.target.files[0] });
        try {
            const file = event.target.files[0];
            if (file) {
                console.log('📁 [DEBUG] File selected:', {
                    name: file.name,
                    size: file.size,
                    type: file.type
                });

                if (file.size > 10 * 1024 * 1024) { // 10MB limit for large inventory imports
                    console.warn('⚠️ [DEBUG] File too large:', file.size);
                    setNotification({ type: 'error', message: 'File size must be less than 10MB' });
                    return;
                }

                console.log('✅ [DEBUG] File validation passed, updating state');
                setNewSignature(prev => ({ ...prev, signatureFile: file, signatureDataUrl: null }));
            } else {
                console.warn('⚠️ [DEBUG] No file selected');
            }
        } catch (error) {
            console.error('❌ [ERROR] handleSignatureFileUpload failed:', error);
            setNotification({ type: 'error', message: 'Error processing file upload' });
        }
    };

    const handleSaveSignature = async () => {
        console.log('🔍 [DEBUG] handleSaveSignature called', {
            newSignature,
            userId,
            signaturesCount: signatures.length
        });

        try {
            // Validation checks
            if (!newSignature.controllerName || !newSignature.subsidiary) {
                console.warn('⚠️ [DEBUG] Missing required fields:', {
                    controllerName: !!newSignature.controllerName,
                    subsidiary: !!newSignature.subsidiary
                });
                setNotification({ type: 'error', message: 'Please fill in all required fields' });
                return;
            }

            if (!newSignature.signatureFile && !newSignature.signatureDataUrl) {
                console.warn('⚠️ [DEBUG] No signature provided');
                setNotification({ type: 'error', message: 'Please provide a signature' });
                return;
            }

            console.log('✅ [DEBUG] Validation passed, processing signature');

            // For now, we'll store the signature as a data URL
            // In production, you'd want to upload to Firebase Storage
            let signatureData;
            if (newSignature.signatureFile) {
                console.log('📁 [DEBUG] Processing file signature');
                const reader = new FileReader();
                signatureData = await new Promise((resolve, reject) => {
                    reader.onload = (e) => {
                        console.log('📖 [DEBUG] File read successfully, size:', e.target.result.length);
                        resolve(e.target.result);
                    };
                    reader.onerror = (e) => {
                        console.error('❌ [ERROR] FileReader error:', e);
                        reject(new Error('Failed to read file'));
                    };
                    reader.readAsDataURL(newSignature.signatureFile);
                });
            } else {
                console.log('✏️ [DEBUG] Using drawn signature');
                signatureData = newSignature.signatureDataUrl;
            }

            const signatureObj = {
                id: Date.now().toString(),
                controllerName: newSignature.controllerName,
                subsidiary: newSignature.subsidiary,
                signatureUrl: signatureData,
                createdAt: new Date().toISOString(),
                createdBy: userId
            };

            console.log('💾 [DEBUG] Saving signature object:', signatureObj);

            const updatedSignatures = [...signatures, signatureObj];
            console.log('📝 [DEBUG] Updated signatures array:', {
                oldCount: signatures.length,
                newCount: updatedSignatures.length
            });

            // Retry mechanism for Firebase operations
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    await setDoc(signaturesDocRef, { signatures: updatedSignatures });
                    console.log('✅ [DEBUG] Signature saved to Firestore successfully');
                    break; // Success, exit retry loop
                } catch (firebaseError) {
                    retryCount++;
                    console.warn(`⚠️ [WARNING] Firebase save attempt ${retryCount} failed:`, firebaseError);

                    if (retryCount >= maxRetries) {
                        throw firebaseError; // Re-throw if max retries reached
                    }

                    // Wait before retrying (exponential backoff)
                    const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                    console.log(`⏳ [DEBUG] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Reset form
            setNewSignature({
                controllerName: '',
                subsidiary: '',
                signatureFile: null,
                signatureDataUrl: null
            });
            console.log('🔄 [DEBUG] Form reset completed');

            await log('SETTINGS_CHANGE', `Added new signature for ${signatureObj.controllerName}`, {
                category: 'settings',
                settingType: 'signature',
                details: {
                    controllerName: signatureObj.controllerName,
                    subsidiary: signatureObj.subsidiary
                }
            });

            setNotification({ type: 'success', message: 'Signature saved successfully!' });
        } catch (error) {
            console.error("❌ [ERROR] handleSaveSignature failed:", error);
            console.error("❌ [ERROR] Error details:", {
                message: error.message,
                stack: error.stack,
                code: error.code
            });

            // Enhanced error messages for different error types
            let userMessage = 'Failed to save signature.';
            if (error.code === 'unavailable' || error.message.includes('QUIC') || error.message.includes('network')) {
                userMessage = 'Network connection issue. Please check your internet connection and try again.';
            } else if (error.code === 'permission-denied') {
                userMessage = 'Permission denied. Please check your user role and try again.';
            } else if (error.code === 'resource-exhausted') {
                userMessage = 'Service temporarily unavailable. Please try again later.';
            }

            setNotification({ type: 'error', message: userMessage });
        }
    };

    const handleDeleteSignature = async (index) => {
        console.log('🔍 [DEBUG] handleDeleteSignature called', {
            index,
            signatureToDelete: signatures[index],
            totalSignatures: signatures.length
        });

        try {
            const updatedSignatures = signatures.filter((_, i) => i !== index);
            console.log('🗑️ [DEBUG] Filtered signatures:', {
                removedIndex: index,
                newCount: updatedSignatures.length
            });

            await setDoc(signaturesDocRef, { signatures: updatedSignatures });
            console.log('✅ [DEBUG] Signature deleted from Firestore successfully');

            await log('SETTINGS_CHANGE', `Deleted signature`, {
                category: 'settings',
                settingType: 'signature',
                details: {
                    index: index
                }
            });

            setNotification({ type: 'success', message: 'Signature deleted successfully!' });
        } catch (error) {
            console.error("❌ [ERROR] handleDeleteSignature failed:", error);
            console.error("❌ [ERROR] Error details:", {
                message: error.message,
                stack: error.stack,
                code: error.code
            });
            setNotification({ type: 'error', message: 'Failed to delete signature.' });
        }
    };

    const clearSignatureCanvas = () => {
        console.log('🔍 [DEBUG] clearSignatureCanvas called');
        try {
            const canvas = signatureCanvasRef.current;
            if (canvas) {
                console.log('🎨 [DEBUG] Canvas found, clearing...');
                const ctx = canvas.getContext('2d');

                // Clear the entire canvas area
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Reset the canvas transform to account for DPI scaling
                const dpr = window.devicePixelRatio || 1;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.scale(dpr, dpr);

                console.log('✅ [DEBUG] Canvas cleared successfully with DPI reset');
            } else {
                console.warn('⚠️ [DEBUG] Canvas reference not found');
            }
        } catch (error) {
            console.error('❌ [ERROR] clearSignatureCanvas failed:', error);
        }
    };

    const saveSignatureFromCanvas = () => {
        console.log('🔍 [DEBUG] saveSignatureFromCanvas called');
        try {
            const canvas = signatureCanvasRef.current;
            if (canvas) {
                console.log('🎨 [DEBUG] Canvas found, converting to data URL...');

                // Create a temporary canvas for proper data URL generation
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');

                // Set temp canvas to the display size (not the internal DPI-scaled size)
                const rect = canvas.getBoundingClientRect();
                tempCanvas.width = rect.width;
                tempCanvas.height = rect.height;

                // Draw the DPI-scaled canvas content to the temp canvas at display size
                tempCtx.drawImage(canvas, 0, 0, rect.width, rect.height);

                // Generate data URL from temp canvas
                const dataUrl = tempCanvas.toDataURL('image/png');
                console.log('📊 [DEBUG] Data URL generated, length:', dataUrl.length);

                setNewSignature(prev => ({
                    ...prev,
                    signatureDataUrl: dataUrl,
                    signatureFile: null
                }));
                console.log('✅ [DEBUG] Signature drawing saved to state');

                setNotification({
                    type: 'success',
                    message: 'Signature drawing saved! Click "Save Signature" to store it.'
                });
            } else {
                console.warn('⚠️ [DEBUG] Canvas reference not found');
            }
        } catch (error) {
            console.error('❌ [ERROR] saveSignatureFromCanvas failed:', error);
        }
    };

    const handleExportPriceList = () => {
        const headers = ["S/N", "SKU", "Description", "Stock Level", "Final Price (GHS)", "Final Price (USD)", "Exchange Rate"];
        const rate = currentMonthRate || 0;

        const csvRows = [headers.join(',')];

        const filteredInventory = inventory.filter(item =>
            item.name.toLowerCase().includes(priceListSearch.toLowerCase())
        );

        filteredInventory.forEach((item, index) => {
            const priceGhs = item.price || 0;
            const priceUsd = rate > 0 ? (priceGhs / rate).toFixed(2) : 'N/A';
            const stockLevel = item.stock || 0;

            const row = [
                index + 1,
                `"${item.id}"`,
                `"${item.name.replace(/"/g, '""')}"`,
                stockLevel,
                priceGhs.toFixed(2),
                priceUsd,
                rate.toFixed(4)
            ];
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `price_list_${currentMonthKey}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
                <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">System Settings</h1>
                    {currentUser && currentUser.role === 'controller' && <button onClick={() => navigateTo('controllerDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>}
                    {currentUser && currentUser.role === 'sales' && <button onClick={() => navigateTo('salesDashboard')} className="text-sm"><Icon id="arrow-left" className="mr-1" /> Back to Sales</button>}
                </header>

                {/* Tab Navigation */}
                <div className="flex space-x-4 mb-6 border-b border-gray-200 pb-1 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('taxes')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'taxes' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Tax & Rates
                    </button>
                    <button
                        onClick={() => setActiveTab('signatures')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'signatures' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Signatures
                    </button>
                    <button
                        onClick={() => setActiveTab('pricelist')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'pricelist' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Price List
                    </button>
                    <button
                        onClick={() => setActiveTab('targets')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'targets' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Revenue Targets
                    </button>
                    <button
                        onClick={() => setActiveTab('companyData')}
                        className={`py-2 px-4 font-medium text-sm rounded-t-lg whitespace-nowrap ${activeTab === 'companyData' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Company Data
                    </button>
                </div>

                {activeTab === 'taxes' && (
                    <>
                        {currentUser && currentUser.role === 'controller' && <div className="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
                            <p className="text-gray-600 mb-6">These settings are applied globally to all new invoices.</p>
                            <div className="space-y-4">
                                {taxes.map(tax => (
                                    <div key={tax.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={tax.enabled}
                                                onChange={e => handleTaxChange(tax.id, 'enabled', e.target.checked)}
                                                className="mr-3 h-5 w-5"
                                            />
                                            <input
                                                type="text"
                                                value={tax.name}
                                                onChange={e => handleTaxChange(tax.id, 'name', e.target.value)}
                                                className="font-semibold bg-transparent w-40"
                                            />
                                        </div>
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                value={tax.rate}
                                                onChange={e => handleTaxChange(tax.id, 'rate', e.target.value)}
                                                className="w-20 text-right p-1 border rounded-md"
                                            />
                                            <span className="ml-2">%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 text-right">
                                <button onClick={handleSaveChanges} className="py-2 px-6 text-white bg-blue-600 rounded-md font-semibold">Save Changes</button>
                            </div>
                        </div>}

                        {/* Exchange Rate Settings Section */}
                        {currentUser && currentUser.role === 'controller' && <div className="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto mt-8">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-700">Rate Settings</h2>
                                    <p className="text-gray-600">Set monthly USD → GHS rate for quoting.</p>
                                </div>
                                <div className="ml-4 flex-shrink-0">
                                    <div className="rounded-lg border bg-blue-50 text-blue-800 px-4 py-3 shadow-sm">
                                        <div className="text-xs uppercase tracking-wide text-blue-700">Current Month</div>
                                        <div className="text-sm text-blue-900 font-semibold">{currentMonthKey}</div>
                                        <div className="text-2xl font-extrabold mt-1">
                                            {currentMonthRate ? `GHS ${currentMonthRate.toFixed(4)} / USD` : 'Not set'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="flex flex-col">
                                    <label className="text-sm text-gray-600 mb-1">Month</label>
                                    <input
                                        type="month"
                                        value={rateMonth}
                                        onChange={(e) => { console.log('🗓️ [DEBUG] rateMonth change:', e.target.value); setRateMonth(e.target.value); }}
                                        className="p-2 border rounded-md"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-sm text-gray-600 mb-1">USD → GHS</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        placeholder="e.g. 15.2500"
                                        value={usdToGhs}
                                        onChange={(e) => { console.log('💱 [DEBUG] usdToGhs change:', e.target.value); setUsdToGhs(e.target.value); }}
                                        className="p-2 border rounded-md"
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={handleSaveExchangeRate} className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700">Save Rate</button>
                                    <button onClick={() => { console.log('📋 [DEBUG] toggle rates table'); setShowRatesTable(!showRatesTable); }} className="py-2 px-4 bg-gray-100 rounded-md border">{showRatesTable ? 'Hide' : 'View'} History</button>
                                </div>
                            </div>
                            {ratesLoading ? (
                                <div className="text-sm text-gray-500 mt-4">Loading rates...</div>
                            ) : null}
                            {showRatesTable && (
                                <div className="mt-6 overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-gray-600">
                                                <th className="py-2 pr-4">Month</th>
                                                <th className="py-2 pr-4">USD → GHS</th>
                                                <th className="py-2 pr-4">Updated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ratesHistory.length === 0 ? (
                                                <tr><td className="py-3 text-gray-500" colSpan="3">No rates saved yet.</td></tr>
                                            ) : (
                                                ratesHistory.map((r) => (
                                                    <tr key={r.id || r.month} className="border-t">
                                                        <td className="py-2 pr-4">{r.month}</td>
                                                        <td className="py-2 pr-4">{Number(r.usdToGhs).toFixed(4)}</td>
                                                        <td className="py-2 pr-4">{r.updatedAt || r.createdAt}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>}
                    </>
                )}

                {activeTab === 'signatures' && (
                    <div className="bg-white p-6 rounded-xl shadow-md max-w-4xl mx-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-700">Digital Signature Management</h2>
                            {/* Network Status Indicator */}
                            <div className="flex items-center space-x-2">
                                <div className={`w-3 h-3 rounded-full ${signaturesLoading ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                                <span className="text-sm text-gray-600">
                                    {signaturesLoading ? 'Connecting...' : 'Connected'}
                                </span>
                            </div>
                        </div>
                        <p className="text-gray-600 mb-6">Configure digital signatures for invoice approvals. Each controller can have their own signature.</p>

                        <div className="space-y-6">
                            {/* Current Signatures Display */}
                            <div>
                                <h3 className="text-lg font-medium text-gray-700 mb-3">Current Signatures</h3>
                                {signaturesLoading ? (
                                    <div className="text-center py-8">
                                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                        <p className="mt-2 text-gray-600">Loading signatures...</p>
                                    </div>
                                ) : signatures.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <p>No signatures configured yet.</p>
                                        <p className="text-sm">Add your first signature below.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {signatures.map((sig, index) => (
                                            <div key={index} className="border rounded-lg p-4 bg-gray-50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div>
                                                        <p className="font-medium text-gray-800">{sig.controllerName}</p>
                                                        <p className="text-sm text-gray-600">{sig.subsidiary}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteSignature(index)}
                                                        className="text-red-500 hover:text-red-700"
                                                        title="Delete signature"
                                                    >
                                                        <Icon id="trash-alt" className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                {sig.signatureUrl ? (
                                                    <div className="text-center">
                                                        <img
                                                            src={sig.signatureUrl}
                                                            alt={`${sig.controllerName}'s signature`}
                                                            className="max-w-full h-16 object-contain mx-auto border rounded"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-gray-500 text-sm">
                                                        No signature uploaded
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add New Signature Form */}
                            <div className="border-t pt-6">
                                <h3 className="text-lg font-medium text-gray-700 mb-4">Add New Signature</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Controller Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newSignature.controllerName}
                                            onChange={(e) => setNewSignature(prev => ({ ...prev, controllerName: e.target.value }))}
                                            placeholder="Enter controller's full name"
                                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Company Subsidiary *
                                        </label>
                                        <select
                                            value={newSignature.subsidiary}
                                            onChange={(e) => setNewSignature(prev => ({ ...prev, subsidiary: e.target.value }))}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="">Select subsidiary</option>
                                            <option value="MIDSA">MIDSA</option>
                                            <option value="ICPS">ICPS</option>
                                            <option value="IMS II">IMS II</option>
                                            <option value="IMS">IMS</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Signature Input Options */}
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Signature *
                                    </label>

                                    {/* Tab Navigation */}
                                    <div className="border-b border-gray-200 mb-4">
                                        <nav className="-mb-px flex space-x-8">
                                            <button
                                                onClick={() => setSignatureTab('upload')}
                                                className={`py-2 px-1 border-b-2 font-medium text-sm ${signatureTab === 'upload'
                                                    ? 'border-blue-500 text-blue-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                    }`}
                                            >
                                                Upload Image
                                            </button>
                                            <button
                                                onClick={() => setSignatureTab('draw')}
                                                className={`py-2 px-1 border-b-2 font-medium text-sm ${signatureTab === 'draw'
                                                    ? 'border-blue-500 text-blue-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                    }`}
                                            >
                                                Draw Signature
                                            </button>
                                        </nav>
                                    </div>

                                    {/* Upload Tab */}
                                    {signatureTab === 'upload' && (
                                        <div className="space-y-4">
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleSignatureFileUpload}
                                                    className="hidden"
                                                    id="signature-upload"
                                                />
                                                <label htmlFor="signature-upload" className="cursor-pointer">
                                                    <Icon id="upload" className="mx-auto h-12 w-12 text-gray-400" />
                                                    <p className="mt-2 text-sm text-gray-600">
                                                        <span className="font-medium text-blue-600 hover:text-blue-500">
                                                            Click to upload
                                                        </span>{' '}
                                                        or drag and drop
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        PNG, JPG up to 2MB
                                                    </p>
                                                </label>
                                            </div>
                                            {newSignature.signatureFile && (
                                                <div className="text-center">
                                                    <p className="text-sm text-gray-600 mb-2">Preview:</p>
                                                    <img
                                                        src={URL.createObjectURL(newSignature.signatureFile)}
                                                        alt="Signature preview"
                                                        className="max-w-full h-20 object-contain mx-auto border rounded"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Draw Tab */}
                                    {signatureTab === 'draw' && (
                                        <div className="space-y-4">
                                            <div className="border border-gray-300 rounded-lg bg-white p-2">
                                                <canvas
                                                    ref={signatureCanvasRef}
                                                    className="w-full cursor-crosshair"
                                                    style={{
                                                        height: '200px',
                                                        touchAction: 'none',
                                                        userSelect: 'none',
                                                        WebkitUserSelect: 'none',
                                                        MozUserSelect: 'none',
                                                        msUserSelect: 'none',
                                                        display: 'block'
                                                    }}
                                                />
                                            </div>
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={clearSignatureCanvas}
                                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                                                >
                                                    Clear
                                                </button>
                                                <button
                                                    onClick={saveSignatureFromCanvas}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                                                >
                                                    Save Drawing
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6">
                                    <button
                                        onClick={handleSaveSignature}
                                        disabled={!newSignature.controllerName || !newSignature.subsidiary || (!newSignature.signatureFile && !newSignature.signatureDataUrl)}
                                        className="w-full bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    >
                                        Save Signature
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'pricelist' && (
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold text-gray-700">Price List</h2>
                            <div className="flex space-x-2">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search items..."
                                        value={priceListSearch}
                                        onChange={(e) => setPriceListSearch(e.target.value)}
                                        className="pl-8 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <Icon id="search" className="absolute left-2 top-3 text-gray-400 w-4 h-4" />
                                </div>
                                <button onClick={handleExportPriceList} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                                    <Icon id="download" className="mr-2 w-4 h-4" /> Export to Excel
                                </button>
                            </div>
                        </div>

                        {/* Exchange Rate Info */}
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-md flex justify-between items-center">
                            <span className="text-blue-800 text-sm">
                                <Icon id="info-circle" className="inline mr-2" />
                                USD prices converted using {currentMonthKey} rate: <strong>{currentMonthRate ? `GHS ${currentMonthRate.toFixed(4)}` : 'Not Set'}</strong>
                            </span>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S/N</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Level</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Final Price (GHS)</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Final Price (USD)</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {inventory.filter(item => item.name.toLowerCase().includes(priceListSearch.toLowerCase())).map((item, index) => {
                                        const priceGhs = item.price || 0;
                                        const priceUsd = currentMonthRate ? (priceGhs / currentMonthRate) : 0;
                                        const stockLevel = item.stock || 0;
                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.id}</td>
                                                <td className="px-6 py-4 text-sm text-gray-500">{item.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900">{stockLevel}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(priceGhs)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                                                    {currentMonthRate ? `$${priceUsd.toFixed(2)}` : 'N/A'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'companyData' && invoiceSettings && (
                    <div className="bg-white p-6 rounded-xl shadow-md max-w-4xl mx-auto">
                        <h2 className="text-xl font-semibold text-gray-700 mb-6">Company Data Management</h2>
                        <form onSubmit={handleSaveInvoiceSettings}>
                            {/* Company Address Section */}
                            <div className="mb-8">
                                <h4 className="text-md font-semibold text-gray-700 mb-3 border-b pb-2">Company Contact Info (Header)</h4>
                                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">P.O. Box</label>
                                        <input type="text" name="poBox" defaultValue={invoiceSettings.companyAddress?.poBox} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">City/Country</label>
                                        <input type="text" name="city" defaultValue={invoiceSettings.companyAddress?.city} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Tel</label>
                                        <input type="text" name="tel" defaultValue={invoiceSettings.companyAddress?.tel} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Fax</label>
                                        <input type="text" name="fax" defaultValue={invoiceSettings.companyAddress?.fax} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700">Email</label>
                                        <input type="email" name="email" defaultValue={invoiceSettings.companyAddress?.email} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Account Details Section */}
                            <div className="mb-8">
                                <h4 className="text-md font-semibold text-gray-700 mb-3 border-b pb-2">Bank Account Details</h4>
                                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700">Account Name</label>
                                        <input type="text" name="accountName" defaultValue={invoiceSettings.accountDetails?.accountName} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Bankers</label>
                                        <input type="text" name="bankers" defaultValue={invoiceSettings.accountDetails?.bankers} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Bank Address</label>
                                        <input type="text" name="bankAddress" defaultValue={invoiceSettings.accountDetails?.address} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700">Account Numbers (GHC/USD)</label>
                                        <input type="text" name="accountNumbers" defaultValue={invoiceSettings.accountDetails?.accountNumbers} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Location Address Section */}
                            <div className="mb-8">
                                <h4 className="text-md font-semibold text-gray-700 mb-3 border-b pb-2">Location Address (Footer)</h4>
                                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700">Company Name</label>
                                        <input type="text" name="locCompanyName" defaultValue={invoiceSettings.locationAddress?.companyName} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Unit/Building</label>
                                        <input type="text" name="locUnit" defaultValue={invoiceSettings.locationAddress?.unit} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Street/Area</label>
                                        <input type="text" name="locStreet" defaultValue={invoiceSettings.locationAddress?.street} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-6">
                                <button
                                    type="submit"
                                    disabled={settingsLoading}
                                    className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {settingsLoading ? 'Saving...' : 'Save Company Data'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {activeTab === 'targets' && (
                    <TargetsSettings appId={appId} />
                )}
            </div>
        </div>
    );
};

export default TaxSettings;
