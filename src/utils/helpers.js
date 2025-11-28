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
