import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import Icon from '../common/Icon';
import Notification from '../common/Notification';
import { useActivityLog } from '../../hooks/useActivityLog';

const SignaturesSettings = ({ db, appId, userId }) => {
    const { log } = useActivityLog();
    const [signatures, setSignatures] = useState([]);
    const [newSignature, setNewSignature] = useState({
        controllerName: '',
        subsidiary: '',
        signatureFile: null,
        signatureDataUrl: null
    });
    const [signatureTab, setSignatureTab] = useState('upload');
    const [signaturesLoading, setSignaturesLoading] = useState(true);
    const [notification, setNotification] = useState(null);
    const signatureCanvasRef = useRef(null);

    const signaturesDocRef = doc(db, `artifacts/${appId}/public/data/settings`, 'signatures');

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

        if (signatureTab !== 'draw') {
            console.log('📱 [DEBUG] Canvas setup skipped - not on draw tab');
            return;
        }

        const canvas = signatureCanvasRef.current;
        if (!canvas) {
            console.warn('⚠️ [DEBUG] Canvas not available for setup - will retry on next render');
            return;
        }

        const setupCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            console.log('🎨 [DEBUG] Setting up canvas with DPI scaling', {
                displayWidth: rect.width,
                displayHeight: rect.height,
                devicePixelRatio: dpr
            });

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';

            console.log('✅ [DEBUG] Canvas setup complete:', {
                displaySize: { width: rect.width, height: rect.height },
                internalSize: { width: canvas.width, height: canvas.height },
                devicePixelRatio: dpr
            });
        };

        const ctx = canvas.getContext('2d');
        setupCanvas();
        window.addEventListener('resize', setupCanvas);

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        const getCoordinates = (e) => {
            const rect = canvas.getBoundingClientRect();
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

            const x = (clientX - rect.left);
            const y = (clientY - rect.top);

            return { x, y };
        };

        const startDrawing = (e) => {
            isDrawing = true;
            const coords = getCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
        };

        const draw = (e) => {
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
        };

        const stopDrawing = () => {
            isDrawing = false;
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDrawing = true;
            const coords = getCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
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
            window.removeEventListener('resize', setupCanvas);
            canvas.removeEventListener('mousedown', startDrawing);
            canvas.removeEventListener('mousemove', draw);
            canvas.removeEventListener('mouseup', stopDrawing);
            canvas.removeEventListener('mouseout', stopDrawing);
            canvas.removeEventListener('touchstart', startDrawing);
            canvas.removeEventListener('touchmove', draw);
            canvas.removeEventListener('touchend', stopDrawing);
        };
    }, [signatureTab]);

    const handleSignatureFileUpload = (event) => {
        try {
            const file = event.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    setNotification({ type: 'error', message: 'File size must be less than 10MB' });
                    return;
                }
                setNewSignature(prev => ({ ...prev, signatureFile: file, signatureDataUrl: null }));
            }
        } catch (error) {
            console.error('❌ [ERROR] handleSignatureFileUpload failed:', error);
            setNotification({ type: 'error', message: 'Error processing file upload' });
        }
    };

    const handleSaveSignature = async () => {
        try {
            if (!newSignature.controllerName || !newSignature.subsidiary) {
                setNotification({ type: 'error', message: 'Please fill in all required fields' });
                return;
            }

            if (!newSignature.signatureFile && !newSignature.signatureDataUrl) {
                setNotification({ type: 'error', message: 'Please provide a signature' });
                return;
            }

            let signatureData;
            if (newSignature.signatureFile) {
                const reader = new FileReader();
                signatureData = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error('Failed to read file'));
                    reader.readAsDataURL(newSignature.signatureFile);
                });
            } else {
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

            const updatedSignatures = [...signatures, signatureObj];

            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    await setDoc(signaturesDocRef, { signatures: updatedSignatures });
                    break;
                } catch (firebaseError) {
                    retryCount++;
                    if (retryCount >= maxRetries) throw firebaseError;
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                }
            }

            setNewSignature({
                controllerName: '',
                subsidiary: '',
                signatureFile: null,
                signatureDataUrl: null
            });

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
            let userMessage = 'Failed to save signature.';
            if (error.code === 'unavailable' || error.message.includes('QUIC') || error.message.includes('network')) {
                userMessage = 'Network connection issue. Please check your internet connection and try again.';
            } else if (error.code === 'permission-denied') {
                userMessage = 'Permission denied. Please check your user role and try again.';
            }
            setNotification({ type: 'error', message: userMessage });
        }
    };

    const handleDeleteSignature = async (index) => {
        try {
            const updatedSignatures = signatures.filter((_, i) => i !== index);
            await setDoc(signaturesDocRef, { signatures: updatedSignatures });

            await log('SETTINGS_CHANGE', `Deleted signature`, {
                category: 'settings',
                settingType: 'signature',
                details: { index: index }
            });

            setNotification({ type: 'success', message: 'Signature deleted successfully!' });
        } catch (error) {
            console.error("❌ [ERROR] handleDeleteSignature failed:", error);
            setNotification({ type: 'error', message: 'Failed to delete signature.' });
        }
    };

    const clearSignatureCanvas = () => {
        try {
            const canvas = signatureCanvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const dpr = window.devicePixelRatio || 1;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.scale(dpr, dpr);
            }
        } catch (error) {
            console.error('❌ [ERROR] clearSignatureCanvas failed:', error);
        }
    };

    const saveSignatureFromCanvas = () => {
        try {
            const canvas = signatureCanvasRef.current;
            if (canvas) {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                const rect = canvas.getBoundingClientRect();
                tempCanvas.width = rect.width;
                tempCanvas.height = rect.height;
                tempCtx.drawImage(canvas, 0, 0, rect.width, rect.height);
                const dataUrl = tempCanvas.toDataURL('image/png');

                setNewSignature(prev => ({
                    ...prev,
                    signatureDataUrl: dataUrl,
                    signatureFile: null
                }));

                setNotification({
                    type: 'success',
                    message: 'Signature drawing saved! Click "Save Signature" to store it.'
                });
            }
        } catch (error) {
            console.error('❌ [ERROR] saveSignatureFromCanvas failed:', error);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md max-w-4xl mx-auto">
            {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-700">Digital Signature Management</h2>
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${signaturesLoading ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                    <span className="text-sm text-gray-600">
                        {signaturesLoading ? 'Connecting...' : 'Connected'}
                    </span>
                </div>
            </div>
            <p className="text-gray-600 mb-6">Configure digital signatures for invoice approvals. Each controller can have their own signature.</p>

            <div className="space-y-6">
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

                <div className="border-t pt-6">
                    <h3 className="text-lg font-medium text-gray-700 mb-4">Add New Signature</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Controller Name *</label>
                            <input
                                type="text"
                                value={newSignature.controllerName}
                                onChange={(e) => setNewSignature(prev => ({ ...prev, controllerName: e.target.value }))}
                                placeholder="Enter controller's full name"
                                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Company Subsidiary *</label>
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

                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Signature *</label>
                        <div className="border-b border-gray-200 mb-4">
                            <nav className="-mb-px flex space-x-8">
                                <button
                                    onClick={() => setSignatureTab('upload')}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${signatureTab === 'upload' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                                >
                                    Upload Image
                                </button>
                                <button
                                    onClick={() => setSignatureTab('draw')}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${signatureTab === 'draw' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                                >
                                    Draw Signature
                                </button>
                            </nav>
                        </div>

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
                                            <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
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

                        {signatureTab === 'draw' && (
                            <div className="space-y-4">
                                <div className="border border-gray-300 rounded-lg bg-white p-2">
                                    <canvas
                                        ref={signatureCanvasRef}
                                        className="w-full cursor-crosshair"
                                        style={{ height: '200px', touchAction: 'none', userSelect: 'none', display: 'block' }}
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={clearSignatureCanvas} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200">Clear</button>
                                    <button onClick={saveSignatureFromCanvas} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">Save Drawing</button>
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
    );
};

export default SignaturesSettings;
