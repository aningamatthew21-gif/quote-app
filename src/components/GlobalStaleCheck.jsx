import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, increment } from 'firebase/firestore';
import StaleInvoiceModal from './modals/StaleInvoiceModal';
import { useApp } from '../context/AppContext';
import { logActivity } from '../utils/logger';

const GlobalStaleCheck = () => {
    // Access global context. 
    // Note: Using userId instead of user.uid as AppContext provides userId directly.
    const { userId, db, appId } = useApp();
    const [staleInvoices, setStaleInvoices] = useState([]);
    const [showStaleModal, setShowStaleModal] = useState(false);

    useEffect(() => {
        // 1. Only run if user is logged in
        if (!userId || !db || !appId) return;

        // 2. Check session storage so we don't annoy them on every refresh
        const hasChecked = sessionStorage.getItem('hasCheckedStaleInvoices');
        if (hasChecked) return;

        const checkStaleInvoices = async () => {
            try {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                // Query for invoices sent by THIS user that are still pending
                const q = query(
                    collection(db, `artifacts/${appId}/public/data/invoices`),
                    where("status", "==", "Awaiting Acceptance"),
                    where("createdBy", "==", userId)
                );

                const snapshot = await getDocs(q);

                // Filter by date (client-side to avoid complex index requirements)
                const stale = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(inv => {
                        const sentAt = inv.sentAt?.toDate ? inv.sentAt.toDate() : new Date(inv.sentAt);
                        return sentAt < sevenDaysAgo;
                    });

                if (stale.length > 0) {
                    setStaleInvoices(stale);
                    setShowStaleModal(true);
                }

                // Mark as checked for this session
                sessionStorage.setItem('hasCheckedStaleInvoices', 'true');

            } catch (error) {
                console.error("Error checking stale invoices:", error);
            }
        };

        checkStaleInvoices();
    }, [userId, db, appId]);

    const handleStaleAction = async (invoice, action) => {
        try {
            const batch = writeBatch(db); // Use batch for safety
            const invoiceRef = doc(db, `artifacts/${appId}/public/data/invoices`, invoice.id);

            if (action === 'Customer Accepted') {
                batch.update(invoiceRef, {
                    status: 'Customer Accepted',
                    customerActionAt: new Date()
                });
            } else if (action === 'Customer Rejected') {
                batch.update(invoiceRef, {
                    status: 'Customer Rejected',
                    customerActionAt: new Date(),
                    rejectionReason: 'Marked as rejected via Stale Alert'
                });

                // CRITICAL FIX: Restore Inventory
                const itemsToRestore = invoice.items || invoice.lineItems || [];
                itemsToRestore.forEach(item => {
                    if (item.id && item.type !== 'sourced') {
                        const invRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                        batch.update(invRef, { stock: increment(Number(item.quantity) || 0) });
                    }
                });
            }

            await batch.commit();

            // Remove the handled invoice from the local popup list
            setStaleInvoices(prev => prev.filter(inv => inv.id !== invoice.id));

            // Close modal if list is empty
            if (staleInvoices.length <= 1) {
                setShowStaleModal(false);
            }
        } catch (err) {
            console.error("Error updating stale invoice:", err);
            alert("Could not update invoice. Please try again.");
        }
    };

    if (!showStaleModal) return null;

    return (
        <StaleInvoiceModal
            invoices={staleInvoices}
            onClose={() => setShowStaleModal(false)}
            onAction={handleStaleAction}
        />
    );
};

export default GlobalStaleCheck;
