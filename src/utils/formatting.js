export const formatCurrency = (amount) => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || !isFinite(numAmount)) {
        console.warn('⚠️ [WARNING] formatCurrency: Invalid amount', { amount, numAmount });
        return 'GH₵0.00';
    }
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(numAmount);
};
