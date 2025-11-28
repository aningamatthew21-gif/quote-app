import { doc, runTransaction } from 'firebase/firestore';

// Helper function to remove undefined values from objects
export const removeUndefinedValues = (obj) => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            cleaned[key] = removeUndefinedValues(value);
        }
    }
    return cleaned;
};

/**
 * Helper to safely extract a Date object from an invoice for sorting.
 * Handles Firestore Timestamps, string dates, and falls back to ID timestamp.
 */
export const getInvoiceDate = (invoice) => {
    if (!invoice) return new Date(0);

    // 1. Try standard timestamp fields
    const timestamp = invoice.createdAt || invoice.timestamp || invoice.date;

    if (timestamp) {
        // Handle Firestore Timestamp (has .toDate())
        if (typeof timestamp.toDate === 'function') {
            return timestamp.toDate();
        }
        // Handle Date object
        if (timestamp instanceof Date) {
            return timestamp;
        }
        // Handle string or number
        return new Date(timestamp);
    }

    // 2. Fallback: Extract from Invoice ID (INV-YYYY-TIMESTAMP)
    // Format: INV-2025-1732801234567
    if (invoice.id && invoice.id.startsWith('INV-')) {
        const parts = invoice.id.split('-');
        if (parts.length >= 3) {
            const ts = Number(parts[2]);
            if (!isNaN(ts)) {
                return new Date(ts);
            }
        }
    }

    return new Date(0); // Default to epoch if nothing found
};

/**
 * Generates a temporary ID for new quotes/invoices.
 * Format: INV-YYYY-TIMESTAMP
 * Example: INV-2025-1732801234567
 */
export const generateTemporaryId = () => {
    const now = new Date();
    return `INV-${now.getFullYear()}-${now.getTime()}`;
};

/**
 * Generates a permanent approved ID.
 * Format: MIDSA-INV-{SEQ}-{YYYY}-{DD}-{TIME}
 * Example: MIDSA-INV-001-2025-28-1314
 */
export const generatePermanentId = (sequence) => {
    const now = new Date();
    const seq = String(sequence).padStart(3, '0');
    const year = now.getFullYear();
    const day = String(now.getDate()).padStart(2, '0');
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

    return `MIDSA-INV-${seq}-${year}-${day}-${time}`;
};

/**
 * Gets the next sequence number from Firestore.
 * Increments the counter atomically.
 */
export const getNextSequenceNumber = async (db, appId) => {
    const counterRef = doc(db, `artifacts/${appId}/public/data/settings`, 'invoiceCounter');

    try {
        const newSequence = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);

            let currentSeq = 0;
            if (counterDoc.exists()) {
                currentSeq = counterDoc.data().current || 0;
            }

            const nextSeq = currentSeq + 1;
            transaction.set(counterRef, { current: nextSeq }, { merge: true });
            return nextSeq;
        });

        return newSequence;
    } catch (error) {
        console.error("Error getting next sequence number:", error);
        throw error;
    }
};
