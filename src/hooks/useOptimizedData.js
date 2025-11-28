import { useState, useEffect } from 'react';
import { query, collection, getDocs } from 'firebase/firestore';
import { getCachedData, setCachedData } from '../utils/cache';

// Optimized data fetching hook
export const useOptimizedData = (db, collectionPath, queryConstraints = [], cacheKey = null) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!db) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Check cache first
                if (cacheKey) {
                    const cached = getCachedData(cacheKey);
                    if (cached) {
                        setData(cached);
                        setLoading(false);
                        return;
                    }
                }

                const q = query(collection(db, collectionPath), ...queryConstraints);
                const snapshot = await getDocs(q);
                const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                setData(result);

                // Cache the result
                if (cacheKey) {
                    setCachedData(cacheKey, result);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [db, collectionPath, queryConstraints, cacheKey]);

    return { data, loading, error };
};
