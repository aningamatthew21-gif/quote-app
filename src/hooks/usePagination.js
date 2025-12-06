import { useState, useEffect, useCallback, useRef } from 'react';
import { query, collection, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';

const ITEMS_PER_PAGE = 20;

// Pagination hook
export const usePagination = (db, collectionPath, queryConstraints = []) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const lastDocRef = useRef(null);
    const [error, setError] = useState(null);

    const loadMore = useCallback(async (reset = false) => {
        if (!db) return;

        try {
            setLoading(true);
            setError(null);

            let q = query(
                collection(db, collectionPath),
                ...queryConstraints,
                orderBy('date', 'desc'),
                limit(ITEMS_PER_PAGE)
            );

            if (reset) {
                lastDocRef.current = null;
            } else if (lastDocRef.current) {
                q = query(q, startAfter(lastDocRef.current));
            }

            const snapshot = await getDocs(q);
            const newData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (reset) {
                setData(newData);
            } else {
                setData(prev => [...prev, ...newData]);
            }

            lastDocRef.current = snapshot.docs[snapshot.docs.length - 1] || null;
            setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);
        } catch (err) {
            console.error("Pagination Error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [db, collectionPath, queryConstraints]);

    const reset = useCallback(() => {
        setData([]);
        lastDocRef.current = null;
        setHasMore(true);
        loadMore(true);
    }, [loadMore]);

    useEffect(() => {
        if (db) {
            loadMore(true);
        }
    }, [db, collectionPath, loadMore]);

    return { data, loading, hasMore, error, loadMore, reset };
};
