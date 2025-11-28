import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { removeUndefinedValues } from './helpers';

export const logActivity = async (db, appId, userId, action, details, additionalData = {}) => {
    try {
        const timestamp = new Date();
        const logData = {
            timestamp: serverTimestamp(),
            userId: userId || 'System',
            action,
            details,
            sessionInfo: {
                userAgent: navigator.userAgent,
                timestamp: timestamp.toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            ...removeUndefinedValues(additionalData)
        };
        await addDoc(collection(db, `artifacts/${appId}/public/data/audit_logs`), logData);
    } catch (error) {
        console.error("Error logging activity: ", error);
    }
};

// --- Specialized Logging Functions ---
export const logInventoryActivity = async (db, appId, userId, action, item, changes = {}) => {
    const details = {
        itemId: item.id || 'Unknown',
        itemName: item.name || 'Unknown Item',
        vendor: item.vendor || null,
        stockBefore: changes.stockBefore || null,
        stockAfter: changes.stockAfter || null,
        priceBefore: changes.priceBefore || null,
        priceAfter: changes.priceAfter || null,
        restockLimitBefore: changes.restockLimitBefore || null,
        restockLimitAfter: changes.restockLimitAfter || null,
        stockChange: changes.stockChange || null,
        priceChange: changes.priceChange || null,
        impact: changes.impact || 'No significant impact'
    };

    await logActivity(db, appId, userId, action, `Inventory ${action}: ${details.itemName} (SKU: ${details.itemId})`, {
        category: 'inventory',
        itemDetails: details,
        financialImpact: changes.financialImpact || null
    });
};

export const logCustomerActivity = async (db, appId, userId, action, customer, changes = {}) => {
    const details = {
        customerId: customer.id || 'Unknown',
        customerName: customer.name || 'Unknown Customer',
        contactEmail: customer.contactEmail || null,
        location: customer.location || null,
        region: customer.region || null
    };

    await logActivity(db, appId, userId, action, `Customer ${action}: ${details.customerName} (ID: ${details.customerId})`, {
        category: 'customer',
        customerDetails: details
    });
};

export const logInvoiceActivity = async (db, appId, userId, action, invoiceData, changes = {}) => {
    const details = {
        invoiceId: invoiceData.id || 'Unknown',
        customerName: invoiceData.customerName || invoiceData.customer?.name || 'Unknown Customer',
        customerId: invoiceData.customerId || invoiceData.customer?.id || 'Unknown',
        statusBefore: changes.statusBefore || null,
        statusAfter: changes.statusAfter || null,
        totalAmount: invoiceData.total || 0,
        itemCount: invoiceData.lineItems?.length || invoiceData.items?.length || 0,
        approvalDate: changes.approvalDate || null,
        submittedBy: changes.submittedBy || null,
        approvedBy: changes.approvedBy || null,
        rejectionReason: changes.rejectionReason || null
    };

    await logActivity(db, appId, userId, action, `Invoice ${action}: ${invoiceData.id} for ${details.customerName}`, {
        category: 'invoice',
        invoiceDetails: details,
        financialImpact: {
            type: 'invoice',
            amount: invoiceData.total || 0,
            customerId: details.customerId
        }
    });
};

export const logQuoteActivity = async (db, appId, userId, action, quoteData, changes = {}) => {
    const details = {
        quoteId: quoteData.id || 'Unknown',
        customerName: quoteData.customerName || quoteData.customer?.name || 'Unknown Customer',
        customerId: quoteData.customerId || quoteData.customer?.id || 'Unknown',
        itemCount: quoteData.items?.length || 0,
        totalValue: quoteData.subtotal || 0,
        itemsAdded: changes.itemsAdded || null,
        itemsRemoved: changes.itemsRemoved || null,
        quantityChanges: changes.quantityChanges || null,
        aiInteractions: changes.aiInteractions || null
    };

    await logActivity(db, appId, userId, action, `Quote ${action}: ${quoteData.id} for ${details.customerName}`, {
        category: 'quote',
        quoteDetails: details,
        financialImpact: {
            type: 'quote',
            amount: quoteData.subtotal || 0,
            customerId: details.customerId
        }
    });
};

export const logSystemActivity = async (db, appId, userId, action, details, additionalData = {}) => {
    await logActivity(db, appId, userId, action, details, {
        category: 'system',
        ...additionalData
    });
};
