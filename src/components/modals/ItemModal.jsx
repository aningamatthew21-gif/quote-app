import React, { useState } from 'react';

const ItemModal = ({ item, onSave, onClose }) => {
    const [formData, setFormData] = useState(item || { name: '', vendor: '', stock: 0, price: 0, restockLimit: 10 });
    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };
    const handleSave = () => {
        onSave({ ...formData, id: item?.id });
    };

    return (
        <div className="fixed inset-0 bg-opacity-50 backdrop-blur flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">{item ? 'Edit Item' : 'Add New Item'}</h2>
                <div className="space-y-4"><div>
                    <label className="text-sm font-medium text-gray-700">Item Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" /></div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Vendor</label>
                        <input type="text" name="vendor" value={formData.vendor} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" />
                    </div><div className="grid grid-cols-3 gap-4"><div><label className="text-sm font-medium text-gray-700">Stock</label>
                        <input type="number" name="stock" value={formData.stock} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" />
                    </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Restock At</label>
                            <input type="number" name="restockLimit" value={formData.restockLimit} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Price (GHS)</label>
                            <input type="number" name="price" value={formData.price} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md" />
                        </div>
                    </div>

                </div>
                <div className="mt-8 flex justify-end space-x-4"><button onClick={onClose} className="py-2 px-4 border rounded-md">Cancel</button>
                    <button onClick={handleSave} className="py-2 px-4 text-white bg-blue-600 rounded-md">Save Item</button>
                </div>
            </div>
        </div>);
};

export default ItemModal;
