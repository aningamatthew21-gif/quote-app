import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import companyLogo from '../assets/company-logo.png';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// Utility functions
const formatCurrency = (amount) => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || !isFinite(numAmount)) {
        console.warn('⚠️ [WARNING] PDFService formatCurrency: Invalid amount', { amount, numAmount });
        return '0.00';
    }
    return `${numAmount.toFixed(2)}`;
};

// Helper to fetch settings
const fetchInvoiceSettings = async (appId) => {
    try {
        const settingsRef = doc(db, `artifacts/${appId}/public/data/settings`, 'invoice');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) return snap.data();
    } catch (e) {
        console.error('Failed to fetch invoice settings:', e);
    }
    return null;
};

/**
 * Dynamic Tax Configuration Example:
 * 
 * const taxConfig = {
 *     nhil: { enabled: true, rate: 2.5, label: 'NHIL' },
 *     getfund: { enabled: true, rate: 2.5, label: 'GETFund' },
 *     covidLevy: { enabled: true, rate: 1.0, label: 'COVID-19 Levy' },
 *     vat: { enabled: true, rate: 15.0, label: 'VAT' }
 * };
 * 
 * // Pass taxConfig to invoiceData.taxConfig when generating PDF
 * const invoiceData = {
 *     subtotal: 10000,
 *     taxConfig: taxConfig,
 *     // ... other invoice data
 * };
 */

const calculateTaxes = (subtotal, taxConfig = null) => {
    // Default tax configuration if none provided (for backward compatibility)
    const defaultTaxConfig = {
        nhil: { enabled: true, rate: 5.0, label: 'GETFund/NHIL' },
        getfund: { enabled: true, rate: 5.0, label: 'GETFund/NHIL' },
        covidLevy: { enabled: true, rate: 1.0, label: 'COVID-19 Levy' },
        vat: { enabled: true, rate: 15.0, label: 'VAT' }
    };

    const config = taxConfig || defaultTaxConfig;

    let subtotalAmount = subtotal;
    const taxes = {
        subtotal: subtotalAmount,
        enabledTaxes: [],
        grandTotal: subtotalAmount
    };

    // Calculate NHIL and GETFund (applied to initial subtotal)
    if (config.nhil?.enabled) {
        const nhilAmount = subtotalAmount * (config.nhil.rate / 100);
        taxes.nhil = {
            amount: nhilAmount,
            rate: config.nhil.rate,
            label: config.nhil.label
        };
        taxes.enabledTaxes.push(taxes.nhil);
    }

    if (config.getfund?.enabled) {
        const getfundAmount = subtotalAmount * (config.getfund.rate / 100);
        taxes.getfund = {
            amount: getfundAmount,
            rate: config.getfund.rate,
            label: config.getfund.label
        };
        taxes.enabledTaxes.push(taxes.getfund);
    }

    // Calculate levy total (subtotal + NHIL + GETFund)
    const levyTotal = subtotalAmount +
        (taxes.nhil?.amount || 0) +
        (taxes.getfund?.amount || 0);

    taxes.levyTotal = levyTotal;

    // Calculate COVID-19 Levy (applied to levy total)
    if (config.covidLevy?.enabled) {
        const covidLevyAmount = levyTotal * (config.covidLevy.rate / 100);
        taxes.covidLevy = {
            amount: covidLevyAmount,
            rate: config.covidLevy.rate,
            label: config.covidLevy.label
        };
        taxes.enabledTaxes.push(taxes.covidLevy);
    }

    // Calculate VAT (applied to levy total)
    if (config.vat?.enabled) {
        const vatAmount = levyTotal * (config.vat.rate / 100);
        taxes.vat = {
            amount: vatAmount,
            rate: config.vat.rate,
            label: config.vat.label
        };
        taxes.enabledTaxes.push(taxes.vat);
    }

    // Calculate grand total
    taxes.grandTotal = levyTotal +
        (taxes.covidLevy?.amount || 0) +
        (taxes.vat?.amount || 0);

    return taxes;
};

// New function to calculate taxes from the controller's tax configuration
const calculateTaxesFromConfig = (subtotal, taxConfig) => {
    let subtotalAmount = subtotal;
    const taxes = {
        subtotal: subtotalAmount,
        enabledTaxes: [],
        grandTotal: subtotalAmount
    };

    let levyTotal = subtotalAmount;

    // Apply taxes to subtotal (NHIL, GETFund, etc.)
    taxConfig.filter(t => t.on === 'subtotal' && t.enabled).forEach(t => {
        const taxAmount = subtotalAmount * (t.rate / 100);
        taxes[t.id] = {
            amount: taxAmount,
            rate: t.rate,
            label: t.name
        };
        taxes.enabledTaxes.push(taxes[t.id]);
        levyTotal += taxAmount;
    });

    taxes.levyTotal = levyTotal;

    // Apply taxes to levy total (VAT, COVID-19 Levy, etc.)
    let grandTotal = levyTotal;
    taxConfig.filter(t => t.on === 'levyTotal' && t.enabled).forEach(t => {
        const taxAmount = levyTotal * (t.rate / 100);
        taxes[t.id] = {
            amount: taxAmount,
            rate: t.rate,
            label: t.name
        };
        taxes.enabledTaxes.push(taxes[t.id]);
        grandTotal += taxAmount;
    });

    taxes.grandTotal = grandTotal;

    return taxes;
};

export class PDFService {
    static async generateInvoicePDF(invoiceData, appId = 'default-app-id') {
        // Fetch settings if not present
        if (!invoiceData.invoiceSettings) {
            console.log('🔍 [DEBUG] PDFService: Fetching dynamic invoice settings...');
            const settings = await fetchInvoiceSettings(appId);
            if (settings) {
                invoiceData.invoiceSettings = settings;
            }
        }
        try {
            console.log('🔍 [DEBUG] PDFService: generateInvoicePDF called', {
                invoiceId: invoiceData?.invoiceId || invoiceData?.id,
                hasCustomer: !!invoiceData?.customer,
                hasItems: !!invoiceData?.items,
                hasControllerSignature: !!invoiceData?.controllerSignature,
                controllerName: invoiceData?.controllerName,
                controllerSubsidiary: invoiceData?.controllerSubsidiary,
                signatureSize: invoiceData?.controllerSignature?.length
            });

            console.log('[PDFService] Generating invoice PDF with fixed layout...');

            // Create PDF with mm units for easier positioning
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = 210;
            const pageHeight = 297;
            const leftMargin = 10;
            const rightMargin = 185;

            // Current Y position tracker
            let currentY = 20;

            // 1. HEADER SECTION
            // Company Branding (Left) - Use Image
            try {
                // Add logo image
                pdf.addImage(companyLogo, 'PNG', leftMargin, currentY, 40, 15); // Adjust dimensions as needed
            } catch (e) {
                console.warn('Failed to add company logo', e);
                // Fallback to text if logo fails
                pdf.setFontSize(24);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(237, 28, 36);
                pdf.text('margins', leftMargin, currentY + 10);
                pdf.setFontSize(8);
                pdf.setTextColor(0, 102, 204);
                pdf.text('ID SYSTEMS', leftMargin + 35, currentY + 17);
            }

            // Company Info (Right Side)
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);

            const companyInfoX = rightMargin - 60;
            let infoY = currentY;

            // Dynamic Company Info
            const companyAddr = invoiceData.invoiceSettings?.companyAddress || {};
            const poBox = companyAddr.poBox || 'P.O. Box KN 785';
            const city = companyAddr.city || 'Accra, Ghana';
            const tel = companyAddr.tel || 'Tel: +233 302 220 180';
            const fax = companyAddr.fax || 'Fax: +233 302 220 180';
            const email = companyAddr.email || 'sales@margins-id.com';

            pdf.text(poBox, companyInfoX, infoY);
            infoY += 4;
            pdf.text(city, companyInfoX, infoY);
            infoY += 4;
            pdf.text(tel, companyInfoX, infoY);
            infoY += 4;
            pdf.text(fax, companyInfoX, infoY);
            infoY += 4;

            pdf.text('E-mail:', companyInfoX, infoY);
            pdf.setTextColor(0, 0, 255);
            pdf.textWithLink(email, companyInfoX + 12, infoY, { url: `mailto:${email}` });
            pdf.setTextColor(0, 0, 0);

            // 2. CUSTOMER AND INVOICE DETAILS
            currentY += 25; // Shifted up slightly as requested

            // Customer Details Box (Left)
            const boxX = leftMargin;
            const boxY = currentY;
            const boxWidth = 80;
            const boxHeight = 30;

            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.5);
            pdf.rect(boxX, boxY, boxWidth, boxHeight);

            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');

            let customerTextY = boxY + 6;
            const customerX = boxX + 2;

            // Customer Name
            const cName = invoiceData.customer?.name || '';
            pdf.text(`[ ${cName || 'CUSTOMER NAME'} ]`, customerX, customerTextY);
            customerTextY += 6;

            // Customer Location
            const cLoc = invoiceData.customer?.location || '';
            pdf.text(`[ ${cLoc || 'CUSTOMER LOCATION'} ]`, customerX, customerTextY);
            customerTextY += 6;

            // Customer P.O. Box
            const cBox = invoiceData.customer?.poBox || '';
            pdf.text(`[ ${cBox || 'CUSTOMER P. O BOX'} ]`, customerX, customerTextY);
            customerTextY += 6;

            // Region
            const cReg = invoiceData.customer?.region || '';
            pdf.text(`[ ${cReg || 'REGION'} ]`, customerX, customerTextY);

            // Invoice Details (Right Side)
            // Align with the customer box
            const invoiceDetailsX = rightMargin - 60;
            let invoiceDetailsY = boxY + 15;

            pdf.setFont('helvetica', 'bold');
            pdf.text('Date:', invoiceDetailsX, invoiceDetailsY);
            const iDate = invoiceData.invoiceDate || invoiceData.date || new Date().toISOString().split('T')[0];
            pdf.text(`[ ${iDate} ]`, rightMargin, invoiceDetailsY, { align: 'right' });

            invoiceDetailsY += 8;
            pdf.setTextColor(0, 51, 153); // Dark Blue
            pdf.text('SALES INVOICE', invoiceDetailsX, invoiceDetailsY);

            pdf.setTextColor(0, 0, 0); // Black
            pdf.setFont('helvetica', 'normal');
            const iNum = invoiceData.invoiceNumber || invoiceData.invoiceId || 'N/A';
            pdf.text(iNum, rightMargin, invoiceDetailsY, { align: 'right' });

            // 3. ITEMS TABLE
            // Add space between customer box and table as requested
            currentY = boxY + boxHeight + 15;

            console.log('🔍 [DEBUG] PDFService: Invoice data received', {
                invoiceId: invoiceData.id,
                hasItems: !!invoiceData.items,
                itemsCount: invoiceData.items?.length || 0
            });

            const tableData = (invoiceData.items || []).map((item, index) => {
                const price = Number(item.finalPrice || item.price || 0);
                const quantity = Number(item.quantity || 0);
                const total = price * quantity;

                return [
                    (index + 1).toString(), // Item is now the count/index
                    quantity.toString(), // Quantity
                    item.name || item.description || '', // Description contains the item name
                    formatCurrency(price), // Unit Price
                    formatCurrency(total) // Amount
                ];
            });

            const currencyLabel = (invoiceData.currency === 'USD') ? 'USD' : 'GHC';
            const formatWithSymbol = (n) => `${currencyLabel} ${formatCurrency(n || 0)}`;

            autoTable(pdf, {
                head: [['Item', 'Quantity', 'Description', `Unit Price\n${currencyLabel}`, `Amount\n${currencyLabel}`]],
                body: tableData,
                startY: currentY,
                margin: { left: leftMargin, right: 20 },
                styles: {
                    fontSize: 9,
                    cellPadding: 3,
                    lineColor: [0, 0, 0],
                    lineWidth: 0.5, // Thicker border as per image
                    textColor: [0, 0, 0]
                },
                headStyles: {
                    fillColor: [255, 255, 255], // White background
                    textColor: [0, 51, 153], // Dark Blue text
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: 0.5,
                    lineColor: [0, 0, 0]
                },
                columnStyles: {
                    0: { cellWidth: 40, halign: 'left' },
                    1: { cellWidth: 20, halign: 'center' },
                    2: { cellWidth: 65, halign: 'left' },
                    3: { cellWidth: 30, halign: 'center' },
                    4: { cellWidth: 30, halign: 'center' }
                },
                didDrawPage: function (data) {
                    currentY = data.cursor.y;
                }
            });

            // Get the Y position after the table
            currentY = pdf.lastAutoTable.finalY + 10;

            // 4. TOTALS SECTION
            // Use autoTable for the totals grid to match the image

            // Prepare totals data
            let t = invoiceData.totals || {};
            // Handle different naming conventions for tax configuration
            const taxConfig = invoiceData.taxConfig || invoiceData.taxes || [];

            // Recalculate if totals are missing (fallback)
            if (!invoiceData.totals) {
                const taxRes = calculateTaxesFromConfig(invoiceData.subtotal || 0, taxConfig);
                t = {
                    subtotal: invoiceData.subtotal || 0,
                    levyTotal: taxRes.levyTotal,
                    grandTotal: taxRes.grandTotal,
                    ...taxRes
                };
            }

            // Helper to find tax data (amount and rate)
            const getTaxData = (namePart) => {
                if (!taxConfig || !Array.isArray(taxConfig)) return { amount: 0, rate: 0 };
                // Find all taxes matching the name part (e.g. GETFUND might be separate or combined)
                const matchingTaxes = taxConfig.filter(x => x.name && x.name.toUpperCase().includes(namePart) && x.enabled);

                if (matchingTaxes.length === 0) return { amount: 0, rate: 0 };

                const amount = matchingTaxes.reduce((sum, tax) => sum + (t[tax.id] || tax.amount || 0), 0);
                const rate = matchingTaxes.reduce((sum, tax) => sum + (Number(tax.rate) || 0), 0);

                return { amount, rate };
            };

            const nhil = getTaxData('NHIL');
            const getfund = getTaxData('GETFUND');
            const covid = getTaxData('COVID');
            const vat = getTaxData('VAT');

            // Combined GETFund/NHIL logic
            let getfundNhilAmount = nhil.amount + getfund.amount;
            let getfundNhilRate = nhil.rate + getfund.rate;

            // Format rate helper
            const fmtRate = (r) => r > 0 ? `${r.toFixed(2)}%` : '';

            const totalsBody = [
                ["GROSS TOTAL", "", formatWithSymbol(t.subtotal || 0)],
                ["GETFUND/NHIL", fmtRate(getfundNhilRate), formatWithSymbol(getfundNhilAmount)],
                ["COVID 19 LEVY", fmtRate(covid.rate), formatWithSymbol(covid.amount)],
                ["SUB TOTAL", "", formatWithSymbol(t.levyTotal || 0)],
                ["VAT", fmtRate(vat.rate), formatWithSymbol(vat.amount)],
                ["GRAND TOTAL", "", formatWithSymbol(t.grandTotal || 0)]
            ];

            // Draw Totals Table
            // Align to the right side of the page
            const totalsWidth = 100;
            const totalsMarginLeft = pageWidth - rightMargin + 60; // Adjust to align with right

            autoTable(pdf, {
                head: [['', 'RATE', '']],
                body: totalsBody,
                startY: currentY + 5,
                margin: { left: 100 }, // Push to right
                styles: {
                    fontSize: 9,
                    cellPadding: 2,
                    lineColor: [0, 51, 153], // Dark Blue borders
                    lineWidth: 0.4,
                    textColor: [0, 51, 153] // Dark Blue text
                },
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 51, 153],
                    halign: 'center',
                    fontStyle: 'normal'
                },
                columnStyles: {
                    0: { cellWidth: 40, halign: 'left', fontStyle: 'bold' },
                    1: { cellWidth: 25, halign: 'center' }, // Rate column (empty for now as per image)
                    2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage: function (data) {
                    currentY = data.cursor.y;
                }
            });

            currentY = pdf.lastAutoTable.finalY + 10;

            // 5. FOOTER SECTION (Terms, Payment, Account, Signature)

            // Terms and Conditions Title
            pdf.setFontSize(10);
            pdf.setTextColor(0, 51, 153); // Dark Blue
            pdf.setFont('helvetica', 'bold');
            pdf.text('TERMS AND CONDITIONS', leftMargin, currentY);

            currentY += 6;

            // Payment Terms
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0); // Black
            pdf.text('Payment Terms', leftMargin, currentY, { underline: true });
            currentY += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.text('100% - 10 days from invoice date', leftMargin, currentY);
            currentY += 5;
            pdf.text('Invoice is valid for 14 days', leftMargin, currentY);

            currentY += 8;
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 51, 153); // Dark Blue
            pdf.text('*Please note that the stated prices are a reflection of the prevailing forex rate and is valid for 14 days and may change if', leftMargin, currentY);
            currentY += 5;
            pdf.text('payment is not made within 14 days*', leftMargin, currentY);

            currentY += 8;
            pdf.setTextColor(0, 0, 0); // Black
            pdf.setFont('helvetica', 'normal');
            pdf.text('Pay this invoice into Account Details below or issue cheque in the company\'s name', leftMargin, currentY);

            currentY += 6;

            // Account Details Table-like structure
            const accountLabelsX = leftMargin;
            const accountValuesX = leftMargin + 40;

            const drawAccountLine = (label, value) => {
                pdf.setFont('helvetica', 'normal');
                pdf.text(label, accountLabelsX, currentY);
                pdf.setTextColor(0, 51, 153); // Dark Blue for values
                pdf.text(value, accountValuesX, currentY);
                pdf.setTextColor(0, 0, 0); // Reset
                currentY += 5;
            };

            // Dynamic Account Details
            const accountDet = invoiceData.invoiceSettings?.accountDetails || {};
            const accName = accountDet.accountName || 'Margins ID Systems Applications Ltd.';
            const bankers = accountDet.bankers || 'Fidelity Bank Limited';
            const bankAddr = accountDet.address || 'Ridge Towers, Cruickshank Road, Ridge, Accra';
            const accNums = accountDet.accountNumbers || '1070033129318 - GHC';

            drawAccountLine('Account Name', accName);
            drawAccountLine('Bankers', bankers);
            drawAccountLine('Address', bankAddr);
            drawAccountLine('Account Numbers', accNums);

            // Bottom Section: Location Address & Signature

            // We need to ensure we are at the bottom of the page
            // But if content pushed us down, we continue.
            // Let's check space.
            if (currentY > pageHeight - 50) {
                pdf.addPage();
                currentY = 20;
            } else {
                currentY = Math.max(currentY + 10, pageHeight - 50);
            }

            // Location Address (Left)
            const locationY = currentY;
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 51, 153); // Dark Blue
            pdf.text('Location Address', leftMargin, locationY);

            // Dynamic Location Address
            const locAddr = invoiceData.invoiceSettings?.locationAddress || {};
            const locName = locAddr.companyName || 'Margins ID Systems Applications Ltd.';
            const locUnit = locAddr.unit || 'Unit B607, Octagon';
            const locStreet = locAddr.street || 'Barnes Road, Accra Central';

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text(locName, leftMargin, locationY + 5);
            pdf.text(locUnit, leftMargin, locationY + 9);
            pdf.text(locStreet, leftMargin, locationY + 13);

            // Signature (Right)
            // Dotted line separator
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.1);
            pdf.setLineDash([1, 1], 0);
            pdf.line(rightMargin - 80, locationY, rightMargin, locationY);
            pdf.setLineDash([]); // Reset

            const signatureY = locationY + 5;
            const signatureCenterX = rightMargin - 40;

            // Add controller signature if available
            if (invoiceData.controllerSignature) {
                try {
                    const signatureImage = new Image();
                    signatureImage.src = invoiceData.controllerSignature;
                    // Add signature image above the text
                    pdf.addImage(signatureImage, 'PNG', signatureCenterX - 20, signatureY - 15, 40, 20);
                } catch (e) {
                    console.warn('Failed to add signature image', e);
                }
            }

            pdf.setFontSize(9);
            pdf.setTextColor(0, 51, 153); // Dark Blue
            pdf.text('MIDSA', signatureCenterX, signatureY, { align: 'center' });

            console.log('✅ [DEBUG] PDFService: Invoice PDF generated successfully');
            return pdf;
        } catch (error) {
            console.error('❌ [ERROR] PDFService: Error generating invoice PDF:', error);
            console.error('❌ [ERROR] Error details:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    static async generateQuotePDF(quoteData, appId = 'default-app-id') {
        // Fetch settings if not present
        if (!quoteData.invoiceSettings) {
            console.log('🔍 [DEBUG] PDFService: Fetching dynamic quote settings...');
            const settings = await fetchInvoiceSettings(appId);
            if (settings) {
                quoteData.invoiceSettings = settings;
            }
        }
        try {
            console.log('[PDFService] Generating quote PDF with fixed layout...');

            // Create PDF with mm units for easier positioning
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Set PDF Metadata
            const docTitle = `${quoteData.customer?.name || 'Customer'} - ${quoteData.quoteId || 'Quote'}`;
            pdf.setProperties({
                title: docTitle,
                subject: 'Sales Quote',
                author: 'Margins ID Systems',
                keywords: 'quote, sales, margins',
                creator: 'PQ System'
            });

            const pageWidth = 210;
            const pageHeight = 297;
            const leftMargin = 20;
            const rightMargin = 190;

            // Current Y position tracker
            let currentY = 20;

            // 1. HEADER SECTION
            // Company Branding with proper spacing
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');

            // Calculate text widths for proper spacing
            const marginsText = 'margins';
            const idSystemsText = 'ID SYSTEMS';
            const applicationText = ' APPLICATION LIMITED';

            pdf.setTextColor(255, 0, 0); // Red
            pdf.text(marginsText, leftMargin, currentY);

            const marginsWidth = pdf.getTextWidth(marginsText);
            pdf.setTextColor(0, 0, 255); // Blue
            pdf.text(idSystemsText, leftMargin + marginsWidth, currentY);

            const idSystemsWidth = pdf.getTextWidth(idSystemsText);
            pdf.setTextColor(0, 0, 0); // Black
            pdf.text(applicationText, leftMargin + marginsWidth + idSystemsWidth, currentY);

            // Company Address
            currentY += 8;
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');

            const companyAddr = quoteData.invoiceSettings?.companyAddress || {};
            const locAddr = quoteData.invoiceSettings?.locationAddress || {};

            // Use location address for the main address line if available, else hardcoded fallback
            const mainAddress = locAddr.street ? `Address: ${locAddr.street}, ${locAddr.city || 'Accra'}` : 'Address: Ridge Towers, Cruickshank Road, Ridge, Accra';
            pdf.text(mainAddress, leftMargin, currentY);

            // Contact Information (right side)
            pdf.setFontSize(9);

            const poBox = companyAddr.poBox || 'P.O. Box KN 785, Kaneshie - Accra, Ghana.';
            const tel = companyAddr.tel ? `Tel: ${companyAddr.tel}` : 'Tel: +233 302 220 180';
            const fax = companyAddr.fax ? `Fax: ${companyAddr.fax}` : 'Fax: +233 302 220 180';
            const email = companyAddr.email ? `E-mail: ${companyAddr.email}` : 'E-mail: sales@margins-id.com';

            const contactInfo = [
                poBox,
                tel,
                fax,
                email
            ];

            let contactY = 20;
            contactInfo.forEach(line => {
                pdf.text(line, rightMargin, contactY, { align: 'right' });
                contactY += 5;
            });

            // Document Title
            currentY += 15;
            pdf.setFontSize(16);
            pdf.setFont('helvetica', 'bold');
            pdf.text('SALES QUOTE', pageWidth / 2, currentY, { align: 'center' });

            // 2. CUSTOMER AND QUOTE DETAILS
            currentY += 15;
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Customer:', leftMargin, currentY);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(quoteData.customer?.name || 'N/A', leftMargin, currentY + 5);

            // Customer Address
            currentY += 12;
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Customer Address:', leftMargin, currentY);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(quoteData.customer?.location || 'N/A', leftMargin, currentY + 5);

            // Quote Details (right side)
            let quoteY = currentY - 12;
            pdf.setFontSize(9);
            pdf.text(`Quote No: ${quoteData.quoteId || 'N/A'}`, rightMargin, quoteY, { align: 'right' });
            pdf.text(`Quote Date: ${new Date().toISOString().split('T')[0]}`, rightMargin, quoteY + 5, { align: 'right' });

            // Payment Terms
            currentY += 12;
            pdf.setFontSize(9);
            pdf.text('Payment Terms: 100% - Upon order confirmation', leftMargin, currentY);
            pdf.text('Quote is valid for 14 days', leftMargin, currentY + 5);

            // Instructions
            currentY += 12;
            pdf.setFont('helvetica', 'bold');
            pdf.text('This quote is subject to acceptance within the validity period', leftMargin, currentY);
            pdf.text('Please note that the stated prices are inclusive of all taxes.', leftMargin, currentY + 5);

            // 3. ITEMS TABLE
            currentY += 15;

            const tableData = (quoteData.items || []).map((item, index) => {
                const price = Number(item.finalPrice || item.price || 0);
                const quantity = Number(item.quantity || 0);
                const total = price * quantity;

                return [
                    (index + 1).toString(),
                    item.name || item.description || '',
                    quantity.toString(),
                    formatCurrency(price),
                    formatCurrency(total)
                ];
            });

            const qCurrencyLabel = (quoteData.currency === 'USD') ? 'USD' : 'GHC';
            const qFormatWithSymbol = (n) => `${qCurrencyLabel} ${formatCurrency(n || 0)}`;
            autoTable(pdf, {
                head: [['S/N', 'Item Description', 'Qty', `Unit Price (${qCurrencyLabel})`, `Total (${qCurrencyLabel})`]],
                body: tableData,
                startY: currentY,
                margin: { left: leftMargin, right: 20 },
                styles: {
                    fontSize: 9,
                    cellPadding: 3,
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1
                },
                headStyles: {
                    fillColor: [0, 102, 204],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    halign: 'center'
                },
                columnStyles: {
                    0: { cellWidth: 15, halign: 'center' },
                    1: { cellWidth: 80, halign: 'left' },
                    2: { cellWidth: 20, halign: 'center' },
                    3: { cellWidth: 35, halign: 'right' },
                    4: { cellWidth: 35, halign: 'right' }
                },
                didDrawPage: function (data) {
                    currentY = data.cursor.y;
                }
            });

            // Get the Y position after the table
            currentY = pdf.lastAutoTable.finalY + 10;

            // 4. TOTALS SECTION
            // Prepare data for the totals table
            const t2 = quoteData.totals || {};
            // Handle various property names for tax configuration
            const taxConfig = quoteData.taxConfig || quoteData.taxes || quoteData.taxConfiguration || [];

            // Helper to find tax amount and rate
            const getTaxData = (keyword) => {
                const taxes = taxConfig.filter(t => t.enabled && t.name.toUpperCase().includes(keyword));
                const amount = taxes.reduce((sum, t) => sum + (Number(t2[t.id]) || 0), 0);
                const rate = taxes.reduce((sum, t) => sum + (Number(t.rate) || 0), 0);
                return { amount, rate };
            };

            const getFundNhil = getTaxData('GETFUND') || { amount: 0, rate: 0 };
            const nhil = getTaxData('NHIL'); // Check if NHIL is separate if not caught by above
            if (nhil.amount > 0 && getFundNhil.amount === 0) {
                // If GETFUND didn't catch it but NHIL did (unlikely if named GETFUND/NHIL but possible)
                Object.assign(getFundNhil, nhil);
            } else if (nhil.amount > 0 && !taxConfig.some(t => t.name.toUpperCase().includes('GETFUND') && t.name.toUpperCase().includes('NHIL'))) {
                // If they are separate distinct taxes, add them
                getFundNhil.amount += nhil.amount;
                getFundNhil.rate += nhil.rate;
            }

            const covid = getTaxData('COVID');
            const vat = getTaxData('VAT');

            const totalsTableData = [
                ['GROSS TOTAL', '', qFormatWithSymbol(t2.subtotal || 0)],
                ['GETFUND/NHIL', `${getFundNhil.rate.toFixed(2)}%`, qFormatWithSymbol(getFundNhil.amount)],
                ['COVID 19 LEVY', `${covid.rate.toFixed(2)}%`, qFormatWithSymbol(covid.amount)],
                ['SUB TOTAL', '', qFormatWithSymbol(t2.levyTotal || 0)],
                ['VAT', `${vat.rate.toFixed(2)}%`, qFormatWithSymbol(vat.amount)],
                ['GRAND TOTAL', '', qFormatWithSymbol(t2.grandTotal || 0)]
            ];

            // Draw Totals Table
            // Calculate X position to align to the right
            const tableWidth = 100;
            const tableX = pdf.internal.pageSize.width - tableWidth - rightMargin + 10; // Align right

            autoTable(pdf, {
                head: [['', 'RATE', '']],
                body: totalsTableData,
                startY: currentY,
                margin: { left: tableX },
                tableWidth: tableWidth,
                styles: {
                    fontSize: 9,
                    cellPadding: 3,
                    lineColor: [0, 102, 204], // Blue border
                    lineWidth: 0.1,
                    textColor: [0, 51, 102] // Dark blue text
                },
                headStyles: {
                    fillColor: [255, 255, 255], // White header
                    textColor: [0, 102, 204], // Blue text
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: 0.1,
                    lineColor: [0, 102, 204]
                },
                columnStyles: {
                    0: { cellWidth: 40, halign: 'left', fontStyle: 'bold' },
                    1: { cellWidth: 20, halign: 'center' },
                    2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
                },
                didParseCell: function (data) {
                    // Style specific rows if needed
                    if (data.row.index === 0 || data.row.index === 3 || data.row.index === 5) {
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            currentY = pdf.lastAutoTable.finalY + 10;

            // 5. QUOTE TERMS
            currentY += 10;
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text('QUOTE TERMS', leftMargin, currentY);

            currentY += 6;
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');

            const termsText = [
                'This quote is valid for 14 days from the date of issue',
                'Prices are subject to change based on prevailing forex rates',
                'Payment terms: 100% upon order confirmation',
                'Delivery: Subject to stock availability and payment confirmation',
                '',
                'Account Name: Margins ID Systems Applications Ltd.',
                'Bankers: Fidelity Bank Limited',
                'Address: Ridge Towers, Cruickshank Road, Ridge, Accra',
                'Account Numbers: 1070033129318 - GHC'
            ];

            termsText.forEach(line => {
                if (line) {
                    const lines = pdf.splitTextToSize(line, 170);
                    lines.forEach(splitLine => {
                        pdf.text(splitLine, leftMargin, currentY);
                        currentY += 4;
                    });
                } else {
                    currentY += 2;
                }
            });

            // 6. FOOTER
            currentY = pageHeight - 30;
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');

            const footerLines = [
                'Region: N/A',
                'E-mail: sales@margins-id.com',
                'Tel: +233 302 220 180',
                'Fax: +233 302 220 180',
                'P.O. Box KN 785, Kaneshie - Accra, Ghana.'
            ];

            footerLines.forEach(line => {
                pdf.text(line, leftMargin, currentY);
                currentY += 4;
            });

            // Company branding in footer
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');

            const footerBrandY = pageHeight - 10;
            const footerBrandX = pageWidth / 2;

            pdf.setTextColor(255, 0, 0);
            const marginsFooterWidth = pdf.getTextWidth('margins');
            pdf.text('margins', footerBrandX - marginsFooterWidth - 5, footerBrandY);

            pdf.setTextColor(0, 0, 255);
            pdf.text('ID SYSTEMS', footerBrandX + 5, footerBrandY);

            pdf.setTextColor(0, 0, 0); // Reset to black

            return pdf;
        } catch (error) {
            console.error('[PDFService] Error generating quote PDF:', error);
            throw error;
        }
    }

    static downloadInvoicePDF(invoiceData) {
        try {
            console.log('🔍 [DEBUG] PDFService: downloadInvoicePDF called', {
                invoiceId: invoiceData?.invoiceId || invoiceData?.id,
                hasControllerSignature: !!invoiceData?.controllerSignature
            });

            console.log('[PDFService] Downloading invoice PDF...');
            const pdf = this.generateInvoicePDF(invoiceData);
            // Create descriptive filename: Invoice-{ID}-{CustomerName}-GHC{Total}.pdf
            // Example: Invoice-INV-2024-1234567890-John-Doe-Company-GHC1500.00.pdf
            const customerName = invoiceData.customerName || invoiceData.customer?.name || 'Unknown';
            const grandTotal = invoiceData.total || invoiceData.grandTotal || 0;

            // Handle different total formats and ensure it's a valid number
            let formattedTotal;
            if (typeof grandTotal === 'number' && !isNaN(grandTotal)) {
                formattedTotal = grandTotal.toFixed(2);
            } else if (typeof grandTotal === 'string') {
                const parsed = parseFloat(grandTotal);
                formattedTotal = !isNaN(parsed) ? parsed.toFixed(2) : '0.00';
            } else {
                formattedTotal = '0.00';
            }

            // Clean customer name for filename (remove special characters)
            const cleanCustomerName = customerName
                .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
                .trim();

            // Ensure cleanCustomerName is not empty after cleaning
            const finalCustomerName = cleanCustomerName || 'Unknown-Customer';

            const fileName = `Invoice-${invoiceData.invoiceId || 'INV-' + Date.now()}-${finalCustomerName}-${(invoiceData.currency === 'USD' ? 'USD' : 'GHC')}${formattedTotal}.pdf`;

            console.log('📁 [DEBUG] PDFService: Generated filename:', {
                originalCustomerName: customerName,
                cleanCustomerName,
                finalCustomerName,
                grandTotal,
                formattedTotal,
                finalFileName: fileName
            });

            pdf.save(fileName);
            console.log('✅ [DEBUG] PDFService: Invoice PDF downloaded successfully');
        } catch (error) {
            console.error('❌ [ERROR] PDFService: Error downloading invoice PDF:', error);
            console.error('❌ [ERROR] Error details:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    static downloadQuotePDF(quoteData) {
        try {
            console.log('[PDFService] Downloading quote PDF...');
            const pdf = this.generateQuotePDF(quoteData);
            const fileName = `Quote-${quoteData.quoteId || 'QTE-' + Date.now()}.pdf`;
            pdf.save(fileName);
            console.log('[PDFService] Quote PDF downloaded successfully');
        } catch (error) {
            console.error('[PDFService] Error downloading quote PDF:', error);
            throw error;
        }
    }
}
