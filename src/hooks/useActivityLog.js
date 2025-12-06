import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { logActivity } from '../utils/logger';

/**
 * Custom hook for simplified activity logging.
 * Automatically injects db, appId, and userId from the AppContext.
 * 
 * @returns {Object} Object containing the log function
 */
export const useActivityLog = () => {
    const { db, appId, userId, userEmail } = useApp();

    const log = useCallback(async (action, details, additionalData = {}) => {
        if (!db || !appId) {
            console.warn('Cannot log activity: Database or App ID not available');
            return;
        }

        // Use username (from email) as the primary User ID for display purposes
        // Fallback to userId (UID) if email is not available
        const username = userEmail ? userEmail.split('@')[0] : (userId || 'System');

        await logActivity(db, appId, username, action, details, {
            ...additionalData,
            originalUserId: userId // Keep the original UID for technical reference
        });
    }, [db, appId, userId, userEmail]);

    return { log };
};
