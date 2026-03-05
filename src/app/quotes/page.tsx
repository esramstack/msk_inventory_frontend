'use client';

import { useEffect, useState, useRef } from 'react';
import { getQuotes, addQuote, updateQuoteStatus, deleteQuote } from '@/api/quotes';
import { getProducts, getConfigLists } from '@/api/inventory';
import { addActivityLog } from '@/api/quotes';
import { Quote, QuoteItem, Product, ConfigList } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

const DEFAULT_BRANCH_ADDRESS = '2nd Floor, Spogmay Plaza, MSK Aesthetics, Univ road, Peshawar';

export default function QuotesPage() {
    const { user } = useAuth();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [configs, setConfigs] = useState<ConfigList[]>([]);
    const [loading, setLoading] = useState(true);

    const [statusFilter, setStatusFilter] = useState('');

    // Builder State
    const [showBuilder, setShowBuilder] = useState(false);
    const [saving, setSaving] = useState(false);
    const [printOverlay, setPrintOverlay] = useState(false);
    const [currentPrintHtml, setCurrentPrintHtml] = useState('');

    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [validUntil, setValidUntil] = useState('');
    const [ref, setRef] = useState('');
    const [client, setClient] = useState('');
    const [contact, setContact] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [branchAddress, setBranchAddress] = useState(DEFAULT_BRANCH_ADDRESS);
    const [createdBy, setCreatedBy] = useState('');
    const [discPct, setDiscPct] = useState(0);
    const [status, setStatus] = useState<'Draft' | 'Sent' | 'Accepted' | 'Rejected'>('Draft');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<{ id: string, product_name: string, qty: number, unit_price: number }[]>([]);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [pendingDeleteRef, setPendingDeleteRef] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadData = async () => {
        try {
            const [q, p, c] = await Promise.all([getQuotes(), getProducts(), getConfigLists()]);
            setQuotes(q);
            setProducts(p);
            setConfigs(c);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleOpenBuilder = () => {
        setDate(new Date().toISOString().split('T')[0]);

        const nextQDate = new Date();
        nextQDate.setDate(nextQDate.getDate() + 7);
        setValidUntil(nextQDate.toISOString().split('T')[0]);

        setRef(`QT-${Date.now().toString().slice(-5)}`);
        setClient(''); setContact(''); setBranch(''); setAddress('');
        setBranchAddress(DEFAULT_BRANCH_ADDRESS);
        setCreatedBy(user?.name || '');
        setDiscPct(0); setStatus('Draft'); setNotes('');
        setItems([{ id: Math.random().toString(), product_name: '', qty: 1, unit_price: 0 }]);
        setShowBuilder(true);
    };

    const handleProductSelect = (idx: number, pName: string) => {
        const newItems = [...items];
        newItems[idx].product_name = pName;
        const prod = products.find(x => x.name === pName);
        if (prod) newItems[idx].unit_price = prod.price;
        setItems(newItems);
    };

    const updateItemQty = (idx: number, value: number) => {
        const newItems = [...items];
        newItems[idx].qty = value;
        setItems(newItems);
    };
    const updateItemPrice = (idx: number, value: number) => {
        const newItems = [...items];
        newItems[idx].unit_price = value;
        setItems(newItems);
    };
    const removeItem = (idx: number) => {
        const newItems = [...items];
        newItems.splice(idx, 1);
        setItems(newItems);
    };

    // Calculations
    const subtotal = items.reduce((acc, curr) => acc + (curr.qty * curr.unit_price), 0);
    const discAmt = Math.round(subtotal * discPct);
    const total = subtotal - discAmt;

    const handleSave = async () => {
        if (!client || items.length === 0 || items.some(i => !i.product_name)) {
            alert('Please provide a client name and ensure all line items have products selected.');
            return;
        }

        setSaving(true);
        try {
            const dbItems = items.map(i => ({
                product_name: i.product_name,
                qty: i.qty,
                unit_price: i.unit_price,
                line_total: i.qty * i.unit_price
            }));

            await addQuote({
                ref, date, valid_until: validUntil, client, contact, address, city: branch,
                subtotal, disc_pct: discPct, disc_amt: discAmt, total, status, notes,
                created_by: createdBy || (user ? user.name : 'Unknown')
            }, dbItems);

            if (user) {
                await addActivityLog({
                    type: 'add',
                    user_name: user.name,
                    role: user.role,
                    message: `Created Quote <strong>${ref}</strong> for ${client} (PKR ${total.toLocaleString()})`
                });
            }

            setShowBuilder(false);
            await loadData();
        } catch (e) {
            console.error(e);
            alert('Failed to save quote');
        } finally {
            setSaving(false);
        }
    };

    const handleChangeStatus = async (id: string, newStatus: string) => {
        try {
            await updateQuoteStatus(id, newStatus);
            await loadData();
        } catch (e) {
            console.error(e);
            alert('Failed to update status');
        }
    };

    const isAdmin = user?.role === 'admin';

    const handleDelete = (id: string, qRef: string) => {
        if (!isAdmin) return;
        setPendingDeleteId(id);
        setPendingDeleteRef(qRef);
    };

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        setDeleting(true);
        try {
            await deleteQuote(pendingDeleteId);
            await loadData();
            setPendingDeleteId(null);
            setPendingDeleteRef(null);
        } catch (e) {
            console.error(e);
            alert('Failed to delete quote');
        } finally {
            setDeleting(false);
        }
    };

    // Printing logic
    const handlePreviewPDF = () => {
        const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/msk-logo.png` : '/msk-logo.png';
        // Generate the HTML for the PDF representation based on the native CSS class structures.
        const itemsHtml = items.map(i => `
      <tr>
        <td style="font-weight:600">${i.product_name || 'Item'}</td>
        <td style="text-align:center">${i.qty}</td>
        <td style="text-align:right">${pkr(i.unit_price)}</td>
        <td style="text-align:right;font-weight:600">${pkr(i.qty * i.unit_price)}</td>
      </tr>
    `).join('');

        const html = `
      <div class="inv-wrap">
        <div class="inv-header-block">
          <div class="inv-header">
            <div>
              <img src="${logoUrl}" class="inv-logo" alt="MSK Aesthetics" />
            <!--   <div class="inv-tagline">Premium Hair &amp; Skin Care Solutions</div> -->
            </div>
            <div class="inv-meta">
              <strong>${status === 'Accepted' || status === 'Sent' ? 'INVOICE' : 'QUOTE'}</strong>
              Ref: ${ref}<br>
              Date: ${new Date(date).toLocaleDateString()}<br>
              Created By: ${createdBy || user?.name || ''}
            </div>
          </div>
        </div>
        <hr class="inv-divider" />
        <div class="inv-parties">
          <div>
            <div class="inv-party-label">Billed To:</div>
            <div class="inv-party-name">${client || 'Client Name'}</div>
            <div class="inv-party-detail">
              ${contact ? `Contact: ${contact}<br>` : ''}
              ${address ? `${address}` : ''}
            </div>
          </div>
          <div>
            <div class="inv-party-label">From:</div>
            <div class="inv-party-name">MSK Aesthetics</div>
            <div class="inv-party-detail">
              ${branchAddress.replace(/\n/g, '<br>')}
            </div>
          </div>
        </div>
        <table class="inv-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:right">Unit Price</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2"></td>
              <td style="text-align:right">Subtotal:</td>
              <td style="text-align:right">${pkr(subtotal)}</td>
            </tr>
            ${discPct > 0 ? `
            <tr>
              <td colspan="2"></td>
              <td style="text-align:right;color:#c0392b">Discount (${discPct * 100}%):</td>
              <td style="text-align:right;color:#c0392b">− ${pkr(discAmt)}</td>
            </tr>` : ''}
            <tr class="grand-total">
              <td colspan="2"></td>
              <td style="text-align:right">Total:</td>
              <td style="text-align:right">${pkr(total)}</td>
            </tr>
          </tfoot>
        </table>
        ${notes ? `<div class="inv-notes"><strong>Notes / Terms:</strong><br>${notes}</div>` : ''}
        ${validUntil ? `<div class="inv-validity" style="margin-left:auto; display:block; width:fit-content">Valid until: ${new Date(validUntil).toLocaleDateString()}</div>` : ''}
        <div class="inv-footer">
          Thank you for choosing MSK Aesthetics.<br>
          This is a computer-generated document and requires no signature.
        </div>
      </div>
    `;

        setCurrentPrintHtml(html);
        setPrintOverlay(true);
    };

    const handleExportPDF = async () => {
        // dynamically load html2pdf
        const html2pdf = (await import('html2pdf.js')).default;
        const wrapper = document.createElement('div');
        wrapper.style.background = '#ffffff';
        wrapper.style.minHeight = '297mm';
        wrapper.style.width = '210mm';
        wrapper.style.margin = '0 auto';
        wrapper.style.padding = '0';
        wrapper.style.boxSizing = 'border-box';
        wrapper.innerHTML = currentPrintHtml;

        // Inject the global styles via a style tag so html2pdf can see it
        const style = document.createElement('style');
        // Get all page stylesheets
        for (let sheet of Array.from(document.styleSheets)) {
            try {
                for (let rule of Array.from(sheet.cssRules)) {
                    style.innerHTML += rule.cssText;
                }
            } catch (e) {
                // cross origin exception
            }
        }
        wrapper.appendChild(style);

        const opt = {
            margin: 0,
            filename: `MSK_${ref}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in' as const, format: 'a4', orientation: 'portrait' as const }
        };

        html2pdf().from(wrapper).set(opt).save();
    };

    if (loading) return <div className="p-8">Loading quotes...</div>;

    const getBranches = () => configs.filter(c => c.type === 'city');
    const getDiscounts = () => configs.filter(c => c.type === 'discount').sort((a, b) => (a.pct || 0) - (b.pct || 0));

    const pkr = (v: number) => 'PKR ' + Number(Math.round(v)).toLocaleString();
    const qStatusBadge = (s: string) => {
        const map: any = { Draft: 'q-draft', Sent: 'q-sent', Accepted: 'q-accepted', Rejected: 'q-rejected' };
        return <span className={`q-status-badge ${map[s] || 'q-draft'}`}>{s}</span>;
    };

    const filteredQuotes = quotes.filter(q => !statusFilter || q.status === statusFilter);

    return (
        <div className="page active" id="page-quotes">
            <div className="ph">
                <div>
                    <h1>Quotes &amp; Invoices</h1>
                    <p>Create reseller quotes, export as PDF &amp; track status</p>
                </div>
                <button className="btn btn-primary flex items-center gap-2" onClick={handleOpenBuilder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                    New Quote
                </button>
            </div>

            {showBuilder && (
                <div className="card" style={{ borderColor: 'rgba(184,134,11,.3)' }}>
                    <div className="card-title" style={{ color: 'var(--gold)' }}>
                        <span className="flex items-center gap-2">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            New Quote
                        </span>
                        <button className="btn btn-secondary btn-sm ml-auto" onClick={() => setShowBuilder(false)}>✕ Cancel</button>
                    </div>

                    <div className="quote-builder">
                        <div>
                            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '20px' }}>
                                <div className="fg"><label>Quote / Invoice #</label><input type="text" value={ref} onChange={e => setRef(e.target.value)} /></div>
                                <div className="fg"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                                <div className="fg"><label>Valid Until</label><input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
                                <div className="fg"><label>Reseller / Client Name</label><input type="text" placeholder="e.g. Ali Traders" value={client} onChange={e => setClient(e.target.value)} /></div>
                                <div className="fg"><label>Contact / Phone</label><input type="text" placeholder="e.g. +92 300 1234567" value={contact} onChange={e => setContact(e.target.value)} /></div>
                                <div className="fg">
                                    <label>Branch</label>
                                    <select value={branch} onChange={e => setBranch(e.target.value)}>
                                        <option value="">Select branch…</option>
                                        {getBranches().map(c => <option key={c.id} value={c.value}>{c.value}</option>)}
                                    </select>
                                </div>
                                <div className="fg" style={{ gridColumn: '1/-1' }}><label>Reseller Address (optional)</label><input type="text" placeholder="Shop/street address…" value={address} onChange={e => setAddress(e.target.value)} /></div>
                                <div className="fg" style={{ gridColumn: '1/-1' }}><label>Branch Address (for invoice)</label><input type="text" placeholder="Branch address on invoice" value={branchAddress} onChange={e => setBranchAddress(e.target.value)} /></div>
                                <div className="fg"><label>Created By (for invoice)</label><input type="text" placeholder="Name" value={createdBy} onChange={e => setCreatedBy(e.target.value)} /></div>
                            </div>

                            <div className="card-title" style={{ fontSize: '13px', marginBottom: '10px' }}>
                                <span className="flex items-center gap-2">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                                    Line Items
                                </span>
                            </div>

                            <div className="qi-table-wrap">
                                <div className="qi-row-header">
                                    <span>Product</span>
                                    <span>Qty</span>
                                    <span>Unit Price</span>
                                    <span></span>
                                </div>
                                {items.map((it, idx) => (
                                    <div className="qi-row" key={it.id}>
                                        <select value={it.product_name} onChange={e => handleProductSelect(idx, e.target.value)}>
                                            <option value="">Select product...</option>
                                            {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                        </select>
                                        <input type="number" min="1" value={it.qty} onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)} />
                                        <input type="number" min="0" value={it.unit_price} onChange={e => updateItemPrice(idx, parseFloat(e.target.value) || 0)} />
                                        <button className="qi-del-btn" onClick={() => removeItem(idx)}>✕</button>
                                    </div>
                                ))}
                                <button className="btn btn-secondary btn-sm mt-[4px]" onClick={() => setItems([...items, { id: Math.random().toString(), product_name: '', qty: 1, unit_price: 0 }])}>+ Add Item</button>
                            </div>

                            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '20px' }}>
                                <div className="fg">
                                    <label>Overall Discount %</label>
                                    <select value={discPct} onChange={e => setDiscPct(parseFloat(e.target.value) || 0)}>
                                        {getDiscounts().map(d => <option key={d.id} value={d.pct || 0}>{d.value}</option>)}
                                    </select>
                                </div>
                                <div className="fg">
                                    <label>Status</label>
                                    <select value={status} onChange={e => setStatus(e.target.value as any)}>
                                        <option>Draft</option><option>Sent</option>
                                        <option>Accepted</option><option>Rejected</option>
                                    </select>
                                </div>
                                <div className="fg" style={{ gridColumn: '1/-1' }}><label>Notes / Terms</label><input type="text" placeholder="e.g. Payment within 7 days…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
                            </div>
                        </div>

                        <div>
                            <div className="card quote-summary-card">
                                <div className="card-title" style={{ fontSize: '13px' }}>Live Summary</div>
                                <div className="quote-total-box">
                                    <div className="row"><span>Subtotal</span><span className="val">{pkr(subtotal)}</span></div>
                                    <div className="row"><span>Discount</span><span className="val" style={{ color: 'var(--red)' }}>− {pkr(discAmt)}</span></div>
                                    <div className="row total"><span>Total</span><span className="val">{pkr(total)}</span></div>
                                </div>
                                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>{saving ? 'Saving...' : 'Save Quote'}</button>
                                    <button className="btn btn-secondary" onClick={handlePreviewPDF} style={{ width: '100%' }}>Preview PDF</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            <div className="card">
                <div className="card-title">
                    <span className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        All Quotes
                    </span>
                    <div className="ml-auto" style={{ display: 'flex', gap: '8px' }}>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text)', padding: '5px 10px', fontSize: '12px', fontFamily: "'DM Sans', -apple-system, sans-serif", outline: 'none' }}>
                            <option value="">All statuses</option>
                            <option>Draft</option><option>Sent</option>
                            <option>Accepted</option><option>Rejected</option>
                        </select>
                    </div>
                </div>
                <div className="tbl-wrap">
                    <table>
                        <thead><tr>
                            <th>Date</th><th>Quote #</th><th>Client</th><th>Branch</th>
                            <th>Items</th><th>Subtotal</th><th>Discount</th><th>Total</th>
                            <th>Status</th><th>Created By</th><th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {filteredQuotes.map(q => (
                                <tr key={q.id}>
                                    <td className="mono">{q.date}</td>
                                    <td className="mono" style={{ color: 'var(--text3)' }}>{q.ref}</td>
                                    <td style={{ fontWeight: 500 }}>{q.client}</td>
                                    <td className="muted">{q.city || '—'}</td>
                                    <td className="mono">{(q.items || []).length}</td>
                                    <td className="mono">{pkr(q.subtotal)}</td>
                                    <td style={{ color: 'var(--amber)' }} className="mono">{q.disc_pct * 100}%</td>
                                    <td style={{ fontWeight: 600, color: 'var(--gold)', fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}>{pkr(q.total)}</td>
                                    <td>{qStatusBadge(q.status)}</td>
                                    <td className="muted">{q.created_by || '—'}</td>
                                    <td>
                                        <select
                                            value={q.status}
                                            onChange={e => handleChangeStatus(q.id!, e.target.value)}
                                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', padding: '3px 5px', fontSize: '11px', outline: 'none' }}
                                        >
                                            <option>Draft</option><option>Sent</option><option>Accepted</option><option>Rejected</option>
                                        </select>
                                        {isAdmin && (
                                            <button className="btn btn-danger btn-sm ml-2" onClick={() => handleDelete(q.id!, q.ref)}>✕</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredQuotes.length === 0 && (
                                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text3)', padding: '28px' }}>No quotes found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmDialog
                open={!!pendingDeleteId}
                title="Delete quote"
                message={pendingDeleteRef ? (
                    <>You are about to permanently delete quote <strong>{pendingDeleteRef}</strong>. This cannot be undone.</>
                ) : null}
                confirmLabel="Delete quote"
                cancelLabel="Cancel"
                confirming={deleting}
                onConfirm={confirmDelete}
                onCancel={() => !deleting && (setPendingDeleteId(null), setPendingDeleteRef(null))}
            />

            {printOverlay && (
                <div id="pdf-overlay" className="show">
                    <div id="pdf-modal">
                        <div id="pdf-modal-header">
                            <h3>Preview PDF Document</h3>
                            <div id="pdf-modal-actions">
                                <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>Download PDF</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setPrintOverlay(false)}>Close</button>
                            </div>
                        </div>
                        <div id="pdf-frame" dangerouslySetInnerHTML={{ __html: currentPrintHtml }} />
                    </div>
                </div>
            )}
        </div>
    );
}
