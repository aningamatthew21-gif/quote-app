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
    // Real-time inventory data fetching for immediate updates
    const { data: inventory, loading: inventoryLoading } = useRealtimeInventory(db, appId);
    const { userEmail } = useApp();
    const username = userEmail ? userEmail.split('@')[0] : (userId || 'System');

    // Logging
    const { log } = useActivityLog();
    const [invSearch, setInvSearch] = useState('');
    const debouncedSearch = useDebounce(invSearch, 1000);

    useEffect(() => {
        if (debouncedSearch && debouncedSearch.trim().length > 2) {
            log('SEARCH_QUERY', `Searched inventory for: "${debouncedSearch}"`, {
                category: 'user_action',
                searchDetails: {
                    term: debouncedSearch,
                    context: 'inventory'
                }
            });
        }
    }, [debouncedSearch, log]);

    const handleSaveItem = async (itemToSave) => {
        const id = itemToSave.id || `SKU-${Date.now()}`;
        const finalItem = { ...itemToSave, id };

        // Get existing item for comparison
        let existingItem = null;
        if (itemToSave.id) {
            try {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, itemToSave.id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    existingItem = docSnap.data();
                }
            } catch (error) {
                console.error("Error fetching existing item:", error);
            }
        }

        await setDoc(doc(db, `artifacts/${appId}/public/data/inventory`, id), finalItem, { merge: true });

        const changes = {
            stockBefore: existingItem?.stock,
            stockAfter: finalItem.stock,
            priceBefore: existingItem?.price,
            priceAfter: finalItem.price,
            restockLimitBefore: existingItem?.restockLimit,
            restockLimitAfter: finalItem.restockLimit,
            stockChange: existingItem ? finalItem.stock - existingItem.stock : null,
            priceChange: existingItem ? finalItem.price - existingItem.price : null,
            impact: existingItem ?
                `Stock: ${existingItem.stock} → ${finalItem.stock} (${finalItem.stock - existingItem.stock > 0 ? '+' : ''}${finalItem.stock - existingItem.stock}), Price: ${formatCurrency(existingItem.price)} → ${formatCurrency(finalItem.price)}` :
                `New item created with ${finalItem.stock} units at ${formatCurrency(finalItem.price)} each`
        };

        await logInventoryActivity(db, appId, username, itemToSave.id ? 'Updated' : 'Created', finalItem, changes);

        // Invalidate cache for other components to ensure consistency
        invalidateCache('inventory');

        // Show success notification
        setNotification({
            type: 'success',
            message: itemToSave.id ?
                `Item "${finalItem.name}" updated successfully!` :
                `Item "${finalItem.name}" added successfully!`
        });

        setIsModalOpen(false);
        setEditingItem(null);
    };
    const handleConfirmDelete = async () => {
        if (deletingItemId) {
            // Get item details before deletion
            let deletedItem = null;
            try {
                const docRef = doc(db, `artifacts/${appId}/public/data/inventory`, deletingItemId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    deletedItem = { id: deletingItemId, ...docSnap.data() };
                }
            } catch (error) {
                console.error("Error fetching item for deletion:", error);
            }

            await deleteDoc(doc(db, `artifacts/${appId}/public/data/inventory`, deletingItemId));

            if (deletedItem) {
                await logInventoryActivity(db, appId, username, 'Deleted', deletedItem, {
                    impact: `Removed ${deletedItem.name} (SKU: ${deletingItemId}) with ${deletedItem.stock} units valued at ${formatCurrency(deletedItem.price * deletedItem.stock)}`,
                    financialImpact: {
                        type: 'deletion',
                        value: deletedItem.price * deletedItem.stock
                    }
                });
            } else {
                await logActivity(db, appId, username, 'Deleted Item', `SKU: ${deletingItemId}`, {
                    category: 'inventory',
                    error: 'Could not fetch item details before deletion'
                });
            }

            // Invalidate cache for other components to ensure consistency
            invalidateCache('inventory');
            setDeletingItemId(null);
        }
    };
    const handleConfirmImport = async () => {
        if (!pendingImport) return;

        console.log('🚀 [DEBUG] Starting batch import:', {
            itemCount: pendingImport.length,
            batchSize: 500 // Firebase batch limit
        });

        try {
            // Firebase has a 500 operation limit per batch, so we need to chunk large imports
            const batchSize = 500;
            const chunks = [];
            for (let i = 0; i < pendingImport.length; i += batchSize) {
                chunks.push(pendingImport.slice(i, i + batchSize));
            }

            console.log(`📦 [DEBUG] Processing ${chunks.length} batches`);

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

                console.log(`✅ [DEBUG] Batch ${chunkIndex + 1}/${chunks.length} completed: ${chunk.length} items`);

                // Update progress notification
                setNotification({
                    type: 'info',
                    message: `Importing... ${totalProcessed}/${pendingImport.length} items processed`
                });
            }

            await logActivity(db, appId, username, 'Imported Inventory', `Bulk import: ${pendingImport.length} items with total value of ${formatCurrency(totalValue)}`, {
                category: 'inventory',
                importDetails: {
                    itemCount: pendingImport.length,
                    totalValue: totalValue,
                    items: pendingImport.map(item => ({
                        id: item.id,
                        name: item.name,
                        vendor: item.vendor,
                        stock: item.stock,
                        price: item.price,
                        value: item.price * item.stock
                    }))
                },
                financialImpact: {
                    type: 'bulk_import',
                    totalValue: totalValue,
                    itemCount: pendingImport.length
                }
            });

            // Invalidate cache for other components to ensure consistency
            invalidateCache('inventory');
            setPendingImport(null);

            setNotification({
                type: 'success',
                message: `Successfully imported ${pendingImport.length} items! Total value: ${formatCurrency(totalValue)}`
            });

        } catch (error) {
            console.error('❌ [DEBUG] Import error:', error);
            setNotification({
                type: 'error',
                message: `Import failed: ${error.message}`
            });
        }
    };
    const handleOpenModal = (item = null) => { setEditingItem(item); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingItem(null); };
    const handleDeleteRequest = (itemId) => setDeletingItemId(itemId);
    const handleCancelDelete = () => setDeletingItemId(null);
    const handleCancelImport = () => setPendingImport(null);
    const handleExportToCSV = () => { const headers = ["id", "name", "vendor", "stock", "price", "restockLimit"]; const csvRows = [headers.join(','), ...inventory.map(item => headers.map(header => `"${String(item[header] || '').replace(/"/g, '""')}"`).join(','))]; const csvString = csvRows.join('\n'); const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.setAttribute('hidden', ''); a.setAttribute('href', url); a.setAttribute('download', 'inventory_template.csv'); document.body.appendChild(a); a.click(); document.body.removeChild(a); };
    const handleImportClick = () => fileInputRef.current.click();
    const handleFileImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // File size validation (50MB limit for large inventory imports)
        if (file.size > 50 * 1024 * 1024) {
            setNotification({ type: 'error', message: 'File size must be less than 50MB' });
            return;
        }

        console.log('📁 [DEBUG] Processing CSV file:', {
            name: file.name,
            size: file.size,
            type: file.type
        });

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');

                console.log('📊 [DEBUG] CSV parsing:', {
                    totalLines: lines.length,
                    dataRows: lines.length - 1
                });

                if (lines.length < 2) {
                    setNotification({ message: "Import file is empty or has no data rows." });
                    return;
                }

                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                const expectedHeaders = ["id", "name", "vendor", "stock", "price", "restockLimit"];

                console.log('📋 [DEBUG] Headers found:', headers);
                console.log('📋 [DEBUG] Expected headers:', expectedHeaders);

                if (headers.length !== expectedHeaders.length || !expectedHeaders.every((h, i) => h === headers[i])) {
                    setNotification({ message: "Invalid CSV format or headers. Expected: " + expectedHeaders.join(', ') });
                    return;
                }

                let validItems = 0;
                let invalidItems = 0;

                const importedInventory = lines.slice(1).map((rowStr, index) => {
                    try {
                        // Improved CSV parsing that handles empty fields and malformed data
                        const parseCSVRow = (row) => {
                            const result = [];
                            let current = '';
                            let inQuotes = false;

                            for (let i = 0; i < row.length; i++) {
                                const char = row[i];

                                if (char === '"') {
                                    inQuotes = !inQuotes;
                                } else if (char === ',' && !inQuotes) {
                                    result.push(current.trim());
                                    current = '';
                                } else {
                                    current += char;
                                }
                            }

                            // Add the last field
                            result.push(current.trim());

                            // Ensure we have the right number of fields, pad with empty strings if needed
                            while (result.length < headers.length) {
                                result.push('');
                            }

                            return result;
                        };

                        const values = parseCSVRow(rowStr);

                        if (values.length < headers.length) {
                            console.warn(`⚠️ [DEBUG] Row ${index + 2}: Invalid column count`, {
                                expected: headers.length,
                                found: values.length,
                                row: rowStr.substring(0, 100) + '...'
                            });
                            invalidItems++;
                            return null;
                        }

                        const item = {};
                        headers.forEach((header, i) => {
                            item[header] = values[i].replace(/^"|"$/g, '').trim();
                        });

                        // More lenient validation - only require ID and name
                        if (!item.id || !item.name) {
                            console.warn(`⚠️ [DEBUG] Row ${index + 2}: Missing required fields`, {
                                id: item.id,
                                name: item.name,
                                vendor: item.vendor || 'No Vendor'
                            });
                            invalidItems++;
                            return null;
                        }

                        validItems++;
                        return {
                            id: item.id,
                            name: item.name,
                            vendor: item.vendor || 'No Vendor', // Default vendor if empty
                            stock: parseInt(item.stock, 10) || 0,
                            price: parseFloat(item.price) || 0,
                            restockLimit: parseInt(item.restockLimit, 10) || 0
                        };
                    } catch (error) {
                        console.error(`❌ [DEBUG] Row ${index + 2} parsing error:`, error);
                        invalidItems++;
                        return null;
                    }
                }).filter(Boolean);

                console.log('✅ [DEBUG] Import results:', {
                    totalRows: lines.length - 1,
                    validItems: validItems,
                    invalidItems: invalidItems,
                    importedItems: importedInventory.length
                });

                if (importedInventory.length > 0) {
                    setPendingImport(importedInventory);
                    setNotification({
                        type: 'success',
                        message: `Successfully parsed ${importedInventory.length} items from ${lines.length - 1} rows. ${invalidItems > 0 ? `${invalidItems} rows were skipped due to validation errors.` : ''}`
                    });
                } else {
                    setNotification({
                        type: 'error',
                        message: `Could not find any valid items in the imported file. Please check the CSV format. Expected format: id,name,vendor,stock,price,restockLimit (all 6 columns required). ${invalidItems > 0 ? `${invalidItems} rows had format issues.` : ''}`
                    });
                }
            } catch (error) {
                console.error('❌ [DEBUG] CSV parsing error:', error);
                setNotification({ type: 'error', message: 'Error parsing CSV file: ' + error.message });
            }
        };

        reader.onerror = () => {
            setNotification({ type: 'error', message: 'Error reading file. Please try again.' });
        };

        reader.readAsText(file, 'UTF-8');
        event.target.value = '';

    };
    const [invField, setInvField] = useState('all'); // all | sku | name
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
