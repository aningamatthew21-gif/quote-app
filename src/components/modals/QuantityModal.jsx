import React, { useState } from 'react';

const QuantityModal = ({ item, onClose, onConfirm }) => {
    const [quantity, setQuantity] = useState(''); // Start with an empty string

    const handleQuantityChange = (e) => {
        const value = e.target.value;
        // Allow empty string or positive integers only
        if (value === '' || /^[1-9]\d*$/.test(value)) {
            setQuantity(value);
        }
    };

    const parsedQuantity = parseInt(quantity, 10);
    const isInvalid = isNaN(parsedQuantity) || parsedQuantity < 1;

    const handleConfirm = () => {
        if (!isInvalid) {
            onConfirm(item, parsedQuantity);
        }
    };

    return (
        <div className="fixed inset-0 bg-white-50 bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Add Item to Quote</h2>
                <p className="text-gray-600 mb-6">Enter quantity for: <span className="font-medium">{item.name}</span></p>
                <input
                    type="number"
                    value={quantity}
                    onChange={handleQuantityChange}
                    placeholder="Enter quantity..."
                    className="w-full text-center text-lg p-2 border border-gray-300 rounded-md"
                    min="1"
                    autoFocus
                />
                <div className="flex justify-end space-x-4 mt-8">
                    <button onClick={onClose} className="py-2 px-4 border rounded-md">Cancel</button>
                    <button
                        onClick={handleConfirm}
                        disabled={isInvalid}
                        className={`py-2 px-4 border border-transparent rounded-md text-white transition-colors ${isInvalid ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        Add to Quote
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuantityModal;
