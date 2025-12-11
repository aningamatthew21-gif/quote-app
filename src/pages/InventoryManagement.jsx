import React, { useState, useRef, useEffect } from 'react';
import { doc, setDoc, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import Icon from '../components/common/Icon';
import Notification from '../components/common/Notification';
import ItemModal from '../components/modals/ItemModal';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { logInventoryActivity, logActivity } from '../utils/logger';
import { formatCurrency } from '../utils/formatting';
import { invalidateCache } from '../utils/cache';
import { useRealtimeInventory } from '../hooks/useRealtimeInventory';
import { useDebounce } from '../hooks/useDebounce';
import { useActivityLog } from '../hooks/useActivityLog';
import { useApp } from '../context/AppContext';

const InventoryManagement = ({ navigateTo, db, appId, userId }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [deletingItemId, setDeletingItemId] = useState(null);
    const [pendingImport, setPendingImport] = useState(null);
    const [notification, setNotification] = useState(null);
    const fileInputRef = useRef(null);
    const { data: inventory, loading: inventoryLoading } = useRealtimeInventory(db, appId);
    const { userEmail } = useApp();
    const username = userEmail ? userEmail.split('@')[0] : (userId || 'System');
    const { log } = useActivityLog();
    const [invSearch, setInvSearch] = useState('');
    const debouncedSearch = useDebounce(invSearch, 1000);

    useEffect(() => {
        if (debouncedSearch && debouncedSearch.trim().length > 2) {
            log('SEARCH_QUERY', `Searched inventory for: "${debouncedSearch}"`, {
                category: 'user_action',
                searchDetails: { term: debouncedSearch, context: 'inventory' }
            });
        }
    }, [debouncedSearch, log]);

    const handleSaveItem = async (itemToSave) => {
        const id = itemToSave.id || `SKU-${Date.now()}`;

        // --- UNIFIED COUNTING FIX ---
        // Ensure values are sanitized even if they came from the modal
        const finalItem = {
            ...itemToSave,
            id,
            stock: Math.max(0, parseInt(itemToSave.stock || 0, 10)),
            price: Math.max(0, parseFloat(itemToSave.price || 0)),
            restockLimit: Math.max(0, parseInt(itemToSave.restockLimit || 0, 10))
        };

        let existingItem = null;
        if (itemToSave.id) {
            try {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, itemToSave.id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) existingItem = docSnap.data();
            } catch (error) { console.error("Error fetching existing item:", error); }
        }

        await setDoc(doc(db, `artifacts/${appId}/public/data/inventory`, id), finalItem, { merge: true });

        const changes = {
            stockBefore: existingItem?.stock,
            stockAfter: finalItem.stock,
            priceBefore: existingItem?.price,
            priceAfter: finalItem.price,
            stockChange: existingItem ? finalItem.stock - existingItem.stock : null,
            priceChange: existingItem ? finalItem.price - existingItem.price : null,
        };

        await logInventoryActivity(db, appId, username, itemToSave.id ? 'Updated' : 'Created', finalItem, changes);
        invalidateCache('inventory');
        setNotification({ type: 'success', message: itemToSave.id ? `Item "${finalItem.name}" updated successfully!` : `Item "${finalItem.name}" added successfully!` });
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleConfirmDelete = async () => {
        if (deletingItemId) {
            let deletedItem = null;
            try {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, deletingItemId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) deletedItem = { id: deletingItemId, ...docSnap.data() };
            } catch (error) { console.error("Error fetching item for deletion:", error); }

            await deleteDoc(doc(db, `artifacts/${appId}/public/data/inventory`, deletingItemId));

            if (deletedItem) {
                await logInventoryActivity(db, appId, username, 'Deleted', deletedItem, {
                    impact: `Removed ${deletedItem.name} (SKU: ${deletingItemId})`,
                    financialImpact: { type: 'deletion', value: deletedItem.price * deletedItem.stock }
                });
            }
            invalidateCache('inventory');
            setDeletingItemId(null);
        }
    };

    const handleConfirmImport = async () => {
        if (!pendingImport) return;
        try {
            const batchSize = 500;
            const chunks = [];
            for (let i = 0; i < pendingImport.length; i += batchSize) {
                chunks.push(pendingImport.slice(i, i + batchSize));
            }
            let totalProcessed = 0;
            const totalValue = pendingImport.reduce((sum, item) => sum + (item.price * item.stock), 0);

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex];
                const batch = writeBatch(db);
                chunk.forEach(item => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, item.id);
                    batch.set(docRef, item, { merge: true });
                });
                await batch.commit();
                totalProcessed += chunk.length;
                setNotification({ type: 'info', message: `Importing... ${totalProcessed}/${pendingImport.length} items processed` });
            }

            await logActivity(db, appId, username, 'Imported Inventory', `Bulk import: ${pendingImport.length} items`, { category: 'inventory' });
            invalidateCache('inventory');
            setPendingImport(null);
            setNotification({ type: 'success', message: `Successfully imported ${pendingImport.length} items!` });
        } catch (error) {
            console.error('Import error:', error);
            setNotification({ type: 'error', message: `Import failed: ${error.message}` });
        }
    };

    const handleFileImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) { setNotification({ type: 'error', message: 'File size must be less than 50MB' }); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
                if (lines.length < 2) { setNotification({ message: "Import file is empty or has no data rows." }); return; }

                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                const expectedHeaders = ["id", "name", "vendor", "stock", "price", "restockLimit"];

                // Simple parser logic
                const importedInventory = lines.slice(1).map((rowStr) => {
                    // Quick fix for CSV parsing (handles simple commas, ideally use a library)
                    const values = rowStr.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                    if (values.length < expectedHeaders.length) return null;

                    const item = {};
                    headers.forEach((header, i) => { item[header] = values[i]; });

                    if (!item.id || !item.name) return null;

                    return {
                        id: item.id,
                        name: item.name,
                        vendor: item.vendor || 'No Vendor',
                        // --- UNIFIED COUNTING FIX FOR IMPORTS ---
                        stock: Math.max(0, parseInt(item.stock, 10) || 0),
                        price: Math.max(0, parseFloat(item.price) || 0),
                        restockLimit: Math.max(0, parseInt(item.restockLimit, 10) || 0)
                    };
                }).filter(Boolean);

                if (importedInventory.length > 0) {
                    setPendingImport(importedInventory);
                    setNotification({ type: 'success', message: `Parsed ${importedInventory.length} valid items.` });
                } else {
                    setNotification({ type: 'error', message: `No valid items found. Check CSV format.` });
                }
            } catch (error) {
                setNotification({ type: 'error', message: 'Error parsing CSV file.' });
            }
        };
        reader.readAsText(file, 'UTF-8');
        event.target.value = '';
    };

    // ... (Keep handleOpenModal, handleCloseModal, handleDeleteRequest, handleExportToCSV, etc. same as before) ...
    const handleOpenModal = (item = null) => { setEditingItem(item); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingItem(null); };
    const handleDeleteRequest = (itemId) => setDeletingItemId(itemId);
    const handleCancelDelete = () => setDeletingItemId(null);
    const handleCancelImport = () => setPendingImport(null);
    const handleImportClick = () => fileInputRef.current.click();
    const handleExportToCSV = () => { const headers = ["id", "name", "vendor", "stock", "price", "restockLimit"]; const csvRows = [headers.join(','), ...inventory.map(item => headers.map(header => `"${String(item[header] || '').replace(/"/g, '""')}"`).join(','))]; const csvString = csvRows.join('\n'); const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.setAttribute('hidden', ''); a.setAttribute('href', url); a.setAttribute('download', 'inventory_template.csv'); document.body.appendChild(a); a.click(); document.body.removeChild(a); };

    const [invField, setInvField] = useState('all');
    const filteredInventory = inventory.filter(item => {
        if (!invSearch.trim()) return true;
        const q = invSearch.toLowerCase();
        if (invField === 'sku') return (item.id || '').toLowerCase().includes(q);
        if (invField === 'name') return (item.name || '').toLowerCase().includes(q);
        return (item.id || '').toLowerCase().includes(q) || (item.name || '').toLowerCase().includes(q);
    });

    return (<div className="min-h-screen bg-gray-100">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
            {isModalOpen && <ItemModal item={editingItem} onSave={handleSaveItem} onClose={handleCloseModal} />}
            {deletingItemId && <ConfirmationModal title="Confirm Deletion" message="This item will be permanently deleted." onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} confirmText="Delete" confirmColor="bg-red-600 hover:bg-red-700" />}
            {pendingImport && <ConfirmationModal title="Confirm Import" message={`Found ${pendingImport.length} items. This will update/add to inventory.`} onConfirm={handleConfirmImport} onCancel={handleCancelImport} confirmText="Update & Add" confirmColor="bg-blue-600 hover:bg-blue-700" />}
            <header className="bg-white p-4 rounded-xl shadow-md mb-8 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Inventory Management</h1>
                <button onClick={() => navigateTo('controllerDashboard')} className="text-sm text-gray-600 hover:text-blue-600"><Icon id="arrow-left" className="mr-1" /> Back to Dashboard</button>
            </header>
            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                    <h2 className="text-xl font-semibold text-gray-700">All Inventory Items</h2>
                    <div className="flex flex-wrap items-center gap-2"><input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".csv" />
                        <button onClick={handleImportClick} className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium">Import</button>
                        <button onClick={handleExportToCSV} className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium">Export</button>
                        <button onClick={() => handleOpenModal()} className="py-2 px-4 border-transparent rounded-md text-sm font-medium text-white bg-blue-600">Add New</button>
                        <div className="flex items-center gap-2 ml-2"><input value={invSearch} onChange={(e) => setInvSearch(e.target.value)} placeholder="Search inventory..." className="p-2 border rounded-md text-sm w-56" />
                            <select value={invField} onChange={(e) => setInvField(e.target.value)} className="p-2 border rounded-md text-sm"><option value="all">All</option>
                                <option value="sku">SKU</option><option value="name">Name</option></select></div></div></div><div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50"><tr><th className="p-4 font-semibold text-sm">SKU</th>
                            <th className="p-4 font-semibold text-sm">Item Name</th><th className="p-4 font-semibold text-sm">Vendor</th>
                            <th className="p-4 font-semibold text-sm text-center">Stock</th><th className="p-4 font-semibold text-sm text-center">Restock At</th>
                            <th className="p-4 font-semibold text-sm text-right">Price</th><th className="p-4 font-semibold text-sm text-center">Actions</th></tr>
                        </thead>
                        <tbody>{filteredInventory.map((item) => (<tr key={item.id} className="border-b hover:bg-gray-50"><td className="p-4 text-sm">{item.id}</td>
                            <td className="p-4 font-medium">{item.name}</td><td className="p-4 text-sm">{item.vendor}</td>
                            <td className={`p-4 text-sm text-center font-semibold ${item.stock <= item.restockLimit ? 'text-red-600' : 'text-gray-800'}`}>{item.stock}</td>
                            <td className="p-4 text-sm text-center">{item.restockLimit}</td><td className="p-4 text-sm text-right">{formatCurrency(item.price)}</td>
                            <td className="p-4 text-center space-x-4"><button onClick={() => handleOpenModal(item)} className="text-blue-600 font-medium">Edit</button>
                                <button onClick={() => handleDeleteRequest(item.id)} className="text-red-600 font-medium">Delete</button></td></tr>))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    );
};

export default InventoryManagement;
