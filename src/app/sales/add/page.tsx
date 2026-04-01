'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProducts, getConfigLists } from '@/api/inventory';
import { addSale, getSales, getRestocks, CreateSalePayload, SaleLineRow } from '@/api/sales';
import { addActivityLog } from '@/api/quotes';
import { Product, ConfigList, Restock } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function AddSale() {
    const { user } = useAuth();
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [configs, setConfigs] = useState<ConfigList[]>([]);
    const [loading, setLoading] = useState(true);
    const [sales, setSales] = useState<SaleLineRow[]>([]);
    const [restocks, setRestocks] = useState<Restock[]>([]);
    const [errorOpen, setErrorOpen] = useState(false);
    const [errorTitle, setErrorTitle] = useState('');
    const [errorMessage, setErrorMessage] = useState<React.ReactNode>('');

    // Header / shared form state
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [ref, setRef] = useState('');
    const [channel, setChannel] = useState('');
    const [saleType, setSaleType] = useState<
        '' | 'Full Price' | 'Percentage Discount' | 'Free / Complimentary'
    >('');
    const [branch, setBranch] = useState('');
    const [platform, setPlatform] = useState('');
    const [customer, setCustomer] = useState('');
    const [paymentType, setPaymentType] = useState<'Cash' | 'Bank Transfer' | 'Debit/Credit Card' | ''>('');
    const [status, setStatus] = useState<'Paid' | 'Pending' | 'Free' | ''>('');
    const [notes, setNotes] = useState('');

    // Line items
    type LineItem = {
        id: string;
        productName: string;
        qty: number;
        unitPrice: number;
        discPct: string; // string from select; parsed when calculating
    };

    const [items, setItems] = useState<LineItem[]>([
        {
            id: 'item-1',
            productName: '',
            qty: 1,
            unitPrice: 0,
            discPct: ''
        }
    ]);

    // Overall discount at sale level (header)
    const [overallDiscPct, setOverallDiscPct] = useState<string>('');

    const [saving, setSaving] = useState(false);

    const generateOrderRef = () => {
        const ts = Date.now().toString().slice(-5);
        return `ORD-${ts}`;
    };

    useEffect(() => {
        async function load() {
            try {
                const [p, c, s, r] = await Promise.all([
                    getProducts(),
                    getConfigLists(),
                    getSales(),
                    getRestocks()
                ]);
                setProducts(p);
                setConfigs(c);
                setSales(s);
                setRestocks(r);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
        // Seed a reference number by default, but keep it editable
        setRef(prev => prev || generateOrderRef());
    }, []);

    const handleItemChange = (id: string, updater: (item: LineItem) => LineItem) => {
        setItems(prev =>
            prev.map(it => (it.id === id ? updater(it) : it))
        );
    };

    const addItemRow = () => {
        setItems(prev => [
            ...prev,
            {
                id: `item-${prev.length + 1}-${Date.now()}`,
                productName: '',
                qty: 1,
                unitPrice: 0,
                discPct: ''
            }
        ]);
    };

    const removeItemRow = (id: string) => {
        setItems(prev => (prev.length <= 1 ? prev : prev.filter(it => it.id !== id)));
    };

    const calcLineVars = (item: LineItem) => {
        const price = item.unitPrice || 0;
        const quantity = item.qty || 1;
        const pctNum = item.discPct ? parseFloat(item.discPct) || 0 : 0;
        const discAmt = Math.round(price * quantity * pctNum);
        const final = Math.round(price * quantity * (1 - pctNum));
        return { discAmt, final, pctNum };
    };

    const calcTotals = () => {
        let subtotal = 0;
        items.forEach(it => {
            const { final } = calcLineVars(it);
            subtotal += final;
        });

        const overallPctNum = overallDiscPct ? parseFloat(overallDiscPct) || 0 : 0;
        const overallDiscAmt = Math.round(subtotal * overallPctNum);
        const overallFinal = Math.max(0, subtotal - overallDiscAmt);

        return { subtotal, overallDiscAmt, overallFinal, overallPctNum };
    };

    const { subtotal, overallDiscAmt, overallFinal } = calcTotals();

    const getBranchAvailable = (prodName: string, branchName: string) => {
        if (!prodName || !branchName) return 0;

        const prodSales = sales.filter(
            r => r.product_name === prodName && r.sales?.city === branchName
        );
        const prodRestocks = restocks.filter(
            r => r.product_name === prodName && r.city === branchName
        );

        const sold = prodSales.reduce((a, s) => a + s.qty, 0);
        const allRestocked = prodRestocks.reduce((a, r) => a + r.qty, 0);

        const initialEntry = prodRestocks.find(r => r.supplier === 'Initial Stock');
        const opening = initialEntry ? initialEntry.qty : 0;

        const restocked = allRestocked - opening;
        const current = opening + restocked - sold;

        return Math.max(0, current);
    };

    const getGlobalAvailable = (prodName: string) => {
        if (!prodName) return 0;

        const prodSales = sales.filter(r => r.product_name === prodName);
        const prodRestocks = restocks.filter(r => r.product_name === prodName);

        const sold = prodSales.reduce((a, s) => a + s.qty, 0);
        const allRestocked = prodRestocks.reduce((a, r) => a + r.qty, 0);

        const current = allRestocked - sold;
        return Math.max(0, current);
    };

    const showError = (title: string, message: React.ReactNode) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setErrorOpen(true);
    };

    const handleSave = async () => {
        if (
            !date ||
            !ref ||
            !channel ||
            !saleType ||
            !branch ||
            !platform ||
            !customer ||
            !paymentType ||
            !status
        ) {
            showError('Missing information', 'Please fill out all mandatory header fields.');
            return;
        }

        if (items.length === 0) {
            showError('No items', 'Please add at least one product to this sale.');
            return;
        }

        const perItemErrors: string[] = [];

        items.forEach(it => {
            if (!it.productName) {
                perItemErrors.push('Each line must have a product selected.');
            }
            if (!it.qty || it.qty < 1) {
                perItemErrors.push(`Quantity for ${it.productName || 'one item'} must be at least 1.`);
            }
        });

        if (perItemErrors.length > 0) {
            showError(
                'Line item issues',
                <ul style={{ paddingLeft: '18px', margin: 0 }}>
                    {perItemErrors.map((e, idx) => <li key={idx}>{e}</li>)}
                </ul>
            );
            return;
        }

        // ── Stock checks per line ─────────────────────────────────────
        const stockErrors: string[] = [];

        items.forEach(it => {
            if (!it.productName) return;
            const branchAvailable = getBranchAvailable(it.productName, branch);
            const globalAvailable = getGlobalAvailable(it.productName);

            if (globalAvailable <= 0) {
                stockErrors.push(`No stock available for ${it.productName}. Please restock before recording a sale.`);
                return;
            }

            if (branchAvailable <= 0) {
                stockErrors.push(`No stock available for ${it.productName} at ${branch}. Please select another branch or restock this branch.`);
                return;
            }

            if (it.qty > branchAvailable) {
                stockErrors.push(`Only ${branchAvailable} unit(s) available for ${it.productName} at ${branch}. Please reduce the quantity.`);
            }
        });

        if (stockErrors.length > 0) {
            showError(
                'Stock issues',
                <ul style={{ paddingLeft: '18px', margin: 0 }}>
                    {stockErrors.map((e, idx) => <li key={idx}>{e}</li>)}
                </ul>
            );
            return;
        }

        setSaving(true);
        try {
            const generatedRef = ref;
            const discounts = getDiscounts();

            const header: CreateSalePayload['header'] = {
                date,
                ref: generatedRef,
                channel,
                sale_type: saleType,
                city: branch,
                platform,
                customer,
                payment_type: paymentType,
                status,
                notes
            };

            const itemsPayload: CreateSalePayload['items'] = items.map(it => {
                const { discAmt, final, pctNum } = calcLineVars(it);
                const activeDisc = discounts.find(
                    d => String(d.pct ?? 0) === it.discPct
                );
                const discLabel = activeDisc
                    ? activeDisc.value
                    : `${(pctNum * 100).toFixed(0)}%`;

                return {
                    product_name: it.productName,
                    qty: it.qty,
                    unit_price: it.unitPrice,
                    disc_label: discLabel,
                    disc_pct: pctNum,
                    disc_amt: discAmt,
                    final_price: final
                };
            });

            await addSale({ header, items: itemsPayload });

            if (user) {
                await addActivityLog({
                    type: 'add',
                    user_name: user.name,
                    role: user.role,
                    message: `Recorded sale <strong>${generatedRef}</strong> — ${items.length} item(s) (PKR ${overallFinal.toLocaleString()})`
                });
            }

            router.push('/sales');
        } catch (e) {
            console.error(e);
            showError('Error', 'Failed to save sale.');
        } finally {
            setSaving(false);
        }
    };

    const pkr = (v: number) => Number(Math.round(v)).toLocaleString();

    if (loading) return <div className="p-8">Loading form...</div>;

    const getChannels = () => configs.filter(c => c.type === 'channel');
    const getBranches = () => configs.filter(c => c.type === 'city');
    const getPlatforms = () => configs.filter(c => c.type === 'platform');
    const getDiscounts = () => configs.filter(c => c.type === 'discount').sort((a, b) => (a.pct || 0) - (b.pct || 0));

    return (
        <div className="page active" id="page-add-sale">
            <div className="ph">
                <div>
                    <h1>Add Sale</h1>
                    <p>Record a new transaction</p>
                </div>
            </div>

            <div className="card" style={{ maxWidth: '800px' }}>
                <div className="card-title">Order Details <span style={{ float: 'right', fontSize: '11px', fontWeight: 'normal', color: 'var(--text3)' }}>* Mandatory Fields</span></div>

                <div className="form-grid">
                    <div className="fg"><label>Date*</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
                    <div className="fg"><label>Order Reference</label><input type="text"  placeholder="e.g. ORD-001" value={ref} onChange={e => setRef(e.target.value)} /></div>

                    <div className="fg">
                        <label>Sales Channel*</label>
                        <select required value={channel} onChange={e => setChannel(e.target.value)}>
                            <option value="">Select channel…</option>
                            {getChannels().map(c => <option key={c.id} value={c.value}>{c.value}</option>)}
                        </select>
                    </div>

                    <div className="fg">
                        <label>Sale Type*</label>
                        <select required value={saleType} onChange={e => setSaleType(e.target.value as any)}>
                            <option value="">Select sale type…</option>
                            <option value="Full Price">Full Price</option>
                            <option value="Percentage Discount">Percentage Discount</option>
                            <option value="Free / Complimentary">Free / Complimentary</option>
                        </select>
                    </div>

                    <div className="fg">
                        <label>Branch*</label>
                        <select required value={branch} onChange={e => setBranch(e.target.value)}>
                            <option value="">Select branch…</option>
                            {getBranches().map(c => <option key={c.id} value={c.value}>{c.value}</option>)}
                        </select>
                    </div>

                    <div className="fg">
                        <label>Platform*</label>
                        <select required value={platform} onChange={e => setPlatform(e.target.value)}>
                            <option value="">Select platform…</option>
                            {getPlatforms().map(c => <option key={c.id} value={c.value}>{c.value}</option>)}
                        </select>
                    </div>

                    <div className="fg"><label>Customer / Recipient*</label><input type="text" required placeholder="Name or handle" value={customer} onChange={e => setCustomer(e.target.value)} /></div>
                    <div className="fg">
                        <label>Payment Type*</label>
                        <select required value={paymentType} onChange={e => setPaymentType(e.target.value as any)}>
                            <option value="">Select payment type…</option>
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Debit/Credit Card">Debit/Credit Card</option>
                        </select>
                    </div>

                    <div className="fg">
                        <label>Payment Status*</label>
                        <select
                            required
                            value={status}
                            onChange={e => setStatus(e.target.value as any)}
                        >
                            <option value="">Select status…</option>
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
                            <option value="Free">Free</option>
                        </select>
                    </div>

                    <div className="fg full"><label>Notes</label><input type="text" placeholder="Optional notes, tracking info…" value={notes} onChange={e => setNotes(e.target.value)} /></div>

                    {/* Line items table */}
                    <div className="fg full">
                        <label>Line Items*</label>
                        <div className="tbl-wrap" style={{ maxHeight: 'none' }}>
                            <table className="mini-table" style={{ width: '100%', fontSize: '13px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>Product</th>
                                        <th style={{ textAlign: 'right', width: '80px' }}>Qty</th>
                                        <th style={{ textAlign: 'right', width: '120px' }}>Unit Price</th>
                                        <th style={{ textAlign: 'right', width: '140px' }}>Discount %</th>
                                        <th style={{ textAlign: 'right', width: '140px' }}>Line Final</th>
                                        <th style={{ width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(it => {
                                        const { final } = calcLineVars(it);
                                        return (
                                            <tr key={it.id}>
                                                <td>
                                                    <select
                                                        required
                                                        value={it.productName}
                                                        onChange={e => {
                                                            const newName = e.target.value;
                                                            const prod = products.find(x => x.name === newName);
                                                            handleItemChange(it.id, prev => ({
                                                                ...prev,
                                                                productName: newName,
                                                                unitPrice: prod ? prod.price : prev.unitPrice
                                                            }));
                                                        }}
                                                    >
                                                        <option value="">Select product…</option>
                                                        {products.map(p => (
                                                            <option key={p.id} value={p.name}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={it.qty}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value) || 1;
                                                            handleItemChange(it.id, prev => ({ ...prev, qty: val }));
                                                        }}
                                                        style={{ width: '72px', textAlign: 'right' }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <input
                                                        type="number"
                                                        value={it.unitPrice}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            handleItemChange(it.id, prev => ({ ...prev, unitPrice: val }));
                                                        }}
                                                        style={{ width: '110px', textAlign: 'right' }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <select
                                                        value={it.discPct}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            handleItemChange(it.id, prev => ({ ...prev, discPct: val }));
                                                        }}
                                                        style={{ width: '130px' }}
                                                    >
                                                        <option value="">Select discount…</option>
                                                        {getDiscounts().map(d => (
                                                            <option key={d.id} value={String(d.pct ?? 0)}>
                                                                {d.value}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ textAlign: 'right', fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}>
                                                    {pkr(final)}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => removeItemRow(it.id)}
                                                        disabled={items.length <= 1}
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ marginTop: '8px' }}
                            onClick={addItemRow}
                        >
                            + Add item
                        </button>
                    </div>

                    {/* Overall discount & totals */}
                    <div className="fg">
                        <label>Overall Discount % (optional)</label>
                        <select
                            value={overallDiscPct}
                            onChange={e => setOverallDiscPct(e.target.value)}
                        >
                            <option value="">No overall discount</option>
                            {getDiscounts().map(d => (
                                <option key={d.id} value={String(d.pct ?? 0)}>
                                    {d.value}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="price-preview">
                        <div className="lbl">Subtotal (PKR)</div>
                        <div className="val">{pkr(subtotal)}</div>
                    </div>
                    <div className="price-preview" style={{ borderColor: 'rgba(224,92,92,.3)' }}>
                        <div className="lbl" style={{ color: 'var(--red)' }}>Overall Discount</div>
                        <div className="val" style={{ color: 'var(--red)' }}>{pkr(overallDiscAmt)}</div>
                    </div>
                    <div className="price-preview" style={{ borderColor: 'rgba(52,211,153,0.3)' }}>
                        <div className="lbl" style={{ color: 'var(--green)' }}>Final Payable (PKR)</div>
                        <div className="val" style={{ color: 'var(--green)' }}>{pkr(overallFinal)}</div>
                    </div>
                </div>

                <div className="btn-row">
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Sale'}</button>
                    <button className="btn btn-secondary" onClick={() => router.push('/sales')}>Cancel</button>
                </div>
            </div>

            <ConfirmDialog
                open={errorOpen}
                title={errorTitle}
                message={errorMessage}
                confirmLabel="OK"
                cancelLabel="Close"
                confirming={false}
                onConfirm={() => setErrorOpen(false)}
                onCancel={() => setErrorOpen(false)}
            />
        </div>
    );
}
