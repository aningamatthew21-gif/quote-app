import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { setCachedData } from '../utils/cache';

export const useRealtimeCustomers = (db, appId) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!db || !appId) return;

        const unsubscribe = onSnapshot(
            collection(db, `artifacts/${appId}/public/data/customers`),
            (snapshot) => {
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setData(result);
                setLoading(false);
                setError(null);

                // Update cache for other components
                setCachedData(`customers-${appId}`, result);
                setCachedData(`quoting-customers-${appId}`, result);
                setCachedData(`invoice-editor-customers-${appId}`, result);
            },
            (err) => {
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [db, appId]);

    return { data, loading, error };
};
