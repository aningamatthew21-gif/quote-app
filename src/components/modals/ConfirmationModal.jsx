import React from 'react';

const ConfirmationModal = ({ onConfirm, onCancel, title, message, confirmText, confirmColor }) => (
    <div className="fixed inset-0 bg-white-50 bg-opacity-50 flex justify-center items-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">{title}</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex justify-end space-x-4">
                <button onClick={onCancel} className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                <button onClick={onConfirm} className={`py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${confirmColor}`}>{confirmText}</button>
            </div>
        </div>
    </div>
);

export default ConfirmationModal;
