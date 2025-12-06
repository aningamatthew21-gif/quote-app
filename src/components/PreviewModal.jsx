import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PDFService } from '../services/PDFService.js';
import { useApp } from '../context/AppContext';

export default function PreviewModal({ open, onClose, payload, mode = 'invoice', onConfirm, isDistribution = false, onEmail }) {
  const { appId } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfBase64, setPdfBase64] = useState(null);
  const iframeRef = useRef(null);
  const [zoom, setZoom] = useState('page-width'); // 'page-width' | 'page-fit' | numeric string

  useEffect(() => {
    console.log('🟡 [DEBUG] PreviewModal mount/update', { open, mode, hasPayload: !!payload });
  }, [open, mode, payload]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPdfBase64(null);
    setLoading(true);

    const generatePDF = async () => {
      try {
        console.log('🟠 [DEBUG] Generating preview PDF...', { mode });
        // Generate PDF using the exact same pipeline
        const pdf = mode === 'quote'
          ? await PDFService.generateQuotePDF(payload, appId)
          : await PDFService.generateInvoicePDF(payload, appId);
        // Convert to base64 for iframe
        const dataUri = pdf.output('datauristring');
        const base64 = dataUri.replace('data:application/pdf;filename=generated.pdf;base64,', '');
        setPdfBase64(base64);
        setLoading(false);
        console.log('✅ [DEBUG] Preview PDF generated');
      } catch (err) {
        console.error('Preview generation failed:', err);
        setError(err.message || 'Failed to generate preview');
        setLoading(false);
      }
    };

    generatePDF();
  }, [open, mode, payload, appId]);

  if (!open) return null;

  const iframeSrc = useMemo(() => {
    if (!pdfBase64) return null;
    // Compose viewer fragment with zoom and first page
    const zoomParam = encodeURIComponent(zoom);
    const src = `data:application/pdf;base64,${pdfBase64}#zoom=${zoomParam}&page=1`;
    console.log('🟢 [DEBUG] iframe src prepared (length):', src.length);
    return src;
  }, [pdfBase64]);
  useEffect(() => {
    // trigger re-render of iframe when zoom changes
    if (!pdfBase64) return;
    if (iframeRef.current) {
      // assigning src forces reload with new zoom
      const zoomParam = encodeURIComponent(zoom);
      iframeRef.current.src = `data:application/pdf;base64,${pdfBase64}#zoom=${zoomParam}&page=1`;
    }
  }, [zoom, pdfBase64]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-label="Preview document">
      <div className="bg-white w-screen h-screen flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isDistribution ? 'Invoice Preview' : 'Preview — Document you’re submitting for approval'}
          </h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800" aria-label="Close preview">✕</button>
        </div>
        <div className="flex-1 p-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <span className="hidden sm:inline">
                {isDistribution
                  ? 'This is the final approved document.'
                  : 'This is a preview — the final PDF will be generated if you Continue & Submit.'}
              </span>
              <label className="flex items-center gap-2">
                <span className="text-gray-500">Zoom</span>
                <select value={zoom} onChange={(e) => setZoom(e.target.value)} className="border rounded px-2 py-1 text-sm">
                  <option value="page-width">Fit width</option>
                  <option value="page-fit">Fit page</option>
                  <option value="75">75%</option>
                  <option value="100">100%</option>
                  <option value="125">125%</option>
                  <option value="150">150%</option>
                  <option value="175">175%</option>
                  <option value="200">200%</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              {iframeSrc && (
                <button
                  onClick={() => {
                    const fileName = `${payload.customer?.name || 'Customer'} - ${payload.invoiceNumber || payload.invoiceId || payload.quoteId || 'Document'}.pdf`;
                    const link = document.createElement('a');
                    link.href = `data:application/pdf;base64,${pdfBase64}`;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    console.log('🔵 [DEBUG] Download triggered:', fileName);
                  }}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm flex items-center"
                >
                  <span className="mr-1">⬇️</span> Download
                </button>
              )}

              {isDistribution ? (
                <>
                  {onEmail && (
                    <button onClick={onEmail} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
                      Send Email
                    </button>
                  )}
                  <button onClick={onClose} className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { console.log('🟡 [DEBUG] PreviewModal Back & Edit'); onClose?.(); }} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded">Back & Edit</button>
                  <button onClick={() => { console.log('🟢 [DEBUG] PreviewModal Continue & Submit'); onConfirm?.(); }} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded" disabled={loading}>Continue & Submit</button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 border rounded-md overflow-auto bg-gray-50">
            {loading && (
              <div className="flex items-center text-gray-700"><div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mr-2" />Generating preview…</div>
            )}
            {!loading && error && (
              <div className="text-red-600 text-sm">
                <p className="font-medium mb-2">Failed to generate preview.</p>
                <p className="mb-3">{error}</p>
                <button onClick={() => {
                  console.log('🟠 [DEBUG] Retry preview');
                  setError(null);
                  setLoading(true);
                  setPdfBase64(null);
                  setTimeout(async () => {
                    try {
                      const pdf = mode === 'quote'
                        ? await PDFService.generateQuotePDF(payload, appId)
                        : await PDFService.generateInvoicePDF(payload, appId);
                      const dataUri = pdf.output('datauristring');
                      const base64 = dataUri.replace('data:application/pdf;filename=generated.pdf;base64,', '');
                      setPdfBase64(base64);
                      setLoading(false);
                      console.log('✅ [DEBUG] Retry success');
                    } catch (e) {
                      console.error('❌ [ERROR] Retry failed', e);
                      setError(e.message || 'Failed again');
                      setLoading(false);
                    }
                  }, 0);
                }} className="px-3 py-2 bg-blue-600 text-white rounded">Retry</button>
              </div>
            )}
            {!loading && !error && iframeSrc && (
              <iframe ref={iframeRef} title="PDF Preview" src={iframeSrc} className="w-full h-full" onLoad={() => console.log('🟢 [DEBUG] PDF iframe loaded')} />
            )}
          </div>
        </div>
      </div>
    </div >
  );
}


