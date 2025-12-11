import React, { useState } from 'react';

const ItemModal = ({ item, onSave, onClose }) => {
    // Default form data structure
    const [formData, setFormData] = useState(item || { name: '', vendor: '', stock: 0, price: 0, restockLimit: 10 });

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        let finalValue = value;

        if (type === 'number') {
            // Parse based on field type
            const numVal = parseFloat(value);
            // Prevent negative numbers logic
            if (numVal < 0) return;
            finalValue = isNaN(numVal) ? '' : numVal;
        }

        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleSave = () => {
        // Final validation before save
        const cleanData = {
            ...formData,
            id: item?.id,
            // Ensure stock is integer
            stock: Math.floor(Math.max(0, Number(formData.stock) || 0)),
            // Ensure restock limit is integer
            restockLimit: Math.floor(Math.max(0, Number(formData.restockLimit) || 0)),
            // Ensure price is float, non-negative
            price: Math.max(0, Number(formData.price) || 0)
        };
        onSave(cleanData);
    };

    return (
        <div className="fixed inset-0 bg-opacity-50 backdrop-blur flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">{item ? 'Edit Item' : 'Add New Item'}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-gray-700">Item Name</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Vendor</label>
                        <input type="text" name="vendor" value={formData.vendor} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Stock</label>
                            <input
                                type="number"
                                name="stock"
                                value={formData.stock}
                                onChange={handleChange}
                                className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                                min="0"
                                step="1"
                                onKeyDown={(e) => ['-', '.', 'e'].includes(e.key) && e.preventDefault()}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Restock At</label>
                            <input
                                type="number"
                                name="restockLimit"
                                value={formData.restockLimit}
                                onChange={handleChange}
                                className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                                min="0"
                                step="1"
                                onKeyDown={(e) => ['-', '.', 'e'].includes(e.key) && e.preventDefault()}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Price (GHS)</label>
                            <input
                                type="number"
                                name="price"
                                value={formData.price}
                                onChange={handleChange}
                                className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                                min="0"
                                step="0.01"
                                onKeyDown={(e) => ['-', 'e'].includes(e.key) && e.preventDefault()}
                            />
                        </div>
                    </div>
                </div>
                <div className="mt-8 flex justify-end space-x-4">
                    <button onClick={onClose} className="py-2 px-4 border rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="py-2 px-4 text-white bg-blue-600 rounded-md hover:bg-blue-700">Save Item</button>
                </div>
            </div>
        </div>
    );
};

export default ItemModal;
