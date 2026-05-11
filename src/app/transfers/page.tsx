'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getProducts, getConfigLists } from '@/api/inventory';
import { getTransfers, addTransfer, undoTransfer } from '@/api/transfers';
import { getSales, getRestocks, SaleLineRow } from '@/api/sales';
import { addActivityLog } from '@/api/quotes';
import { Product, Restock, StockTransfer } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

type LineItem = { id: string; product_name: string; qty: number };
type InsufficientDetail = { product_name: string; requested: number; available: number };

const dateOnly = (v: string) => new Date(v).toISOString().split('T')[0];
const transferActiveAsOf = (t: StockTransfer, asOfDate: string) => {
    if (!t.is_undone) return true;
    if (!t.undone_at) return true;
    return dateOnly(t.undone_at) > asOfDate;
};

export default function TransfersPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>([]);
    const [branches, setBranches] = useState<string[]>([]);
    const [transfers, setTransfers] = useState<StockTransfer[]>([]);
    const [sales, setSales] = useState<SaleLineRow[]>([]);
    const [restocks, setRestocks] = useState<Restock[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [undoing, setUndoing] = useState(false);
    const [pendingUndo, setPendingUndo] = useState<StockTransfer | null>(null);

    const [fromCity, setFromCity] = useState('');
    const [toCity, setToCity] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: Math.random().toString(), product_name: '', qty: 1 }
    ]);
    const [errorDialog, setErrorDialog] = useState<null | { title: string; message: ReactNode }>(null);

    const showError = (title: string, message: ReactNode) => {
        setErrorDialog({ title, message });
    };

    useEffect(() => {
        if (user?.role === 'manager') {
            router.push('/stock');
        }
    }, [user, router]);

    const loadData = async () => {
        try {
            const [p, configLists, t, s, r] = await Promise.all([
                getProducts(),
                getConfigLists(),
                getTransfers(),
                getSales(),
                getRestocks()
            ]);
            setProducts(p);
            setBranches(configLists.filter(c => c.type === 'city').map(c => c.value));
            setTransfers(t);
            setSales(s);
            setRestocks(r);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setLoading(false);
            return;
        }
        if (user.role !== 'admin') {
            setLoading(false);
            return;
        }
        loadData();
    }, [user, authLoading]);

    const resetForm = () => {
        setFromCity('');
        setToCity('');
        setDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setLineItems([{ id: Math.random().toString(), product_name: '', qty: 1 }]);
    };

    const buildRequestedByProduct = () => {
        const map = new Map<string, number>();
        for (const item of lineItems) {
            const key = item.product_name.trim();
            map.set(key, (map.get(key) || 0) + item.qty);
        }
        return map;
    };

    const computeAvailableAsOf = (productName: string, branch: string, asOfDate: string) => {
        const opening = restocks
            .filter(r => r.city === branch && r.product_name === productName && r.supplier === 'Initial Stock' && r.date <= asOfDate)
            .reduce((sum, r) => sum + Number(r.qty || 0), 0);

        const restocked = restocks
            .filter(r => r.city === branch && r.product_name === productName && r.supplier !== 'Initial Stock' && r.date <= asOfDate)
            .reduce((sum, r) => sum + Number(r.qty || 0), 0);

        const sold = sales
            .filter(s => s.product_name === productName && s.sales?.city === branch && !s.sales?.is_deleted && Boolean(s.sales?.date) && (s.sales?.date || '') <= asOfDate)
            .reduce((sum, s) => sum + Number(s.qty || 0), 0);

        const transferredIn = transfers
            .filter(t => t.to_city === branch && t.date <= asOfDate && transferActiveAsOf(t, asOfDate))
            .flatMap(t => t.items || [])
            .filter(i => i.product_name === productName)
            .reduce((sum, i) => sum + Number(i.qty || 0), 0);

        const transferredOut = transfers
            .filter(t => t.from_city === branch && t.date <= asOfDate && transferActiveAsOf(t, asOfDate))
            .flatMap(t => t.items || [])
            .filter(i => i.product_name === productName)
            .reduce((sum, i) => sum + Number(i.qty || 0), 0);

        return Math.max(0, opening + restocked - sold + transferredIn - transferredOut);
    };

    const handleSave = async () => {
        if (!fromCity || !toCity || fromCity === toCity) {
            showError('Invalid transfer', 'Select two different branches.');
            return;
        }
        if (!branches.includes(fromCity) || !branches.includes(toCity)) {
            showError('Invalid branch selection', 'Please select valid “From” and “To” branches.');
            return;
        }
        if (lineItems.length === 0 || lineItems.some(i => !i.product_name || !Number.isInteger(i.qty) || i.qty < 1)) {
            showError('Invalid quantity', 'Add at least one product with integer quantity >= 1.');
            return;
        }

        const requestedByProduct = buildRequestedByProduct();
        const insuff: InsufficientDetail[] = [];
        for (const [product_name, requested] of Array.from(requestedByProduct.entries())) {
            const available = computeAvailableAsOf(product_name, fromCity, date);
            if (requested > available) {
                insuff.push({ product_name, requested, available });
            }
        }

        if (insuff.length) {
            showError(
                'Insufficient stock',
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ color: 'var(--text2)' }}>
                        Not enough stock available in <strong>{fromCity}</strong> for the selected items (as-of <strong>{date}</strong>).
                    </div>
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)' }}>
                            {insuff.map(x => (
                                <li key={x.product_name}>
                                    <strong>{x.product_name}</strong>: requested {x.requested}, available {x.available}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            );
            return;
        }

        setSaving(true);
        try {
            await addTransfer(
                {
                    date,
                    from_city: fromCity,
                    to_city: toCity,
                    notes: notes || undefined,
                    created_by: user?.name || 'Unknown'
                },
                lineItems.map(i => ({ product_name: i.product_name, qty: i.qty }))
            );

            if (user) {
                await addActivityLog({
                    type: 'add',
                    user_name: user.name,
                    role: user.role,
                    message: `Stock transfer <strong>${fromCity}</strong> → <strong>${toCity}</strong> (${lineItems.map(i => `${i.product_name}×${i.qty}`).join(', ')})`
                });
            }

            resetForm();
            setShowForm(false);
            await loadData();
        } catch (e: any) {
            console.error(e);
            const details = e?.response?.data?.details as InsufficientDetail[] | undefined;
            if (Array.isArray(details) && details.length) {
                showError(
                    'Insufficient stock',
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ color: 'var(--text2)' }}>
                            Not enough stock available in <strong>{fromCity}</strong> for the selected items (as-of <strong>{date}</strong>).
                        </div>
                        <div style={{ maxHeight: 220, overflow: 'auto' }}>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)' }}>
                                {details.map(x => (
                                    <li key={x.product_name}>
                                        <strong>{x.product_name}</strong>: requested {x.requested}, available {x.available}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                );
            } else {
                showError('Save failed', 'Failed to save transfer.');
            }
        } finally {
            setSaving(false);
        }
    };

    const confirmUndo = async () => {
        if (!pendingUndo?.id) return;
        setUndoing(true);
        try {
            await undoTransfer(pendingUndo.id);
            await loadData();
            setPendingUndo(null);
        } catch (e) {
            console.error(e);
            showError('Undo failed', 'Failed to undo transfer.');
        } finally {
            setUndoing(false);
        }
    };

    const updateLine = (idx: number, patch: Partial<LineItem>) => {
        const next = [...lineItems];
        next[idx] = { ...next[idx], ...patch };
        setLineItems(next);
    };

    const removeLine = (idx: number) => {
        const next = [...lineItems];
        next.splice(idx, 1);
        setLineItems(next.length ? next : [{ id: Math.random().toString(), product_name: '', qty: 1 }]);
    };

    if (authLoading) {
        return (
            <div className="page active">
                <div className="ph"><div><h1>Stock Transfers</h1></div></div>
                <div style={{ color: 'var(--text3)', padding: '32px', textAlign: 'center' }}>Loading...</div>
            </div>
        );
    }

    if (!user || user.role !== 'admin') {
        return (
            <div className="page active">
                <div className="ph"><div><h1>Stock Transfers</h1></div></div>
                <p style={{ padding: '24px', color: 'var(--text3)' }}>Redirecting...</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="page active">
                <div className="ph"><div><h1>Stock Transfers</h1></div></div>
                <div style={{ color: 'var(--text3)', padding: '32px', textAlign: 'center' }}>Loading...</div>
            </div>
        );
    }

    return (
        <div className="page active" id="page-transfers">
            <div className="ph">
                <div>
                    <h1>Stock Transfers</h1>
                    <p>Move inventory between branches (admin only). Transfers apply immediately.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
                    {showForm ? 'Hide form' : 'New Transfer'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '18px', borderColor: 'rgba(184,134,11,.25)' }}>
                    <div className="card-title" style={{ color: 'var(--gold)' }}>New transfer</div>
                    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '16px' }}>
                        <div className="fg">
                            <label>From branch</label>
                            <select value={fromCity} onChange={e => setFromCity(e.target.value)}>
                                <option value="">Select...</option>
                                {branches.map(b => (
                                    <option key={`from-${b}`} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                        <div className="fg">
                            <label>To branch</label>
                            <select value={toCity} onChange={e => setToCity(e.target.value)}>
                                <option value="">Select...</option>
                                {branches.map(b => (
                                    <option key={`to-${b}`} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                        <div className="fg">
                            <label>Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="fg" style={{ gridColumn: '1 / -1' }}>
                            <label>Notes (optional)</label>
                            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reference, carrier, etc." />
                        </div>
                    </div>

                    <div className="card-title" style={{ fontSize: '13px', marginBottom: '8px' }}>Products</div>
                    <div className="qi-table-wrap">
                        <div className="qi-row-header">
                            <span>Product</span>
                            <span>Qty</span>
                            <span />
                        </div>
                        {lineItems.map((row, idx) => (
                            <div className="qi-row" key={row.id}>
                                <select
                                    value={row.product_name}
                                    onChange={e => updateLine(idx, { product_name: e.target.value })}
                                >
                                    <option value="">Select product...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={row.qty}
                                    onChange={e => updateLine(idx, { qty: parseInt(e.target.value, 10) || 1 })}
                                />
                                <button type="button" className="qi-del-btn" onClick={() => removeLine(idx)}>✕</button>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm mt-[4px]"
                            onClick={() => setLineItems([...lineItems, { id: Math.random().toString(), product_name: '', qty: 1 }])}
                        >
                            + Add item
                        </button>
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save transfer'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => { resetForm(); setShowForm(false); }} disabled={saving}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-title">Transfer history</div>
                <div className="tbl-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>From</th>
                                <th>To</th>
                                <th>Products</th>
                                <th>Notes</th>
                                <th>Created by</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.map(t => {
                                const items = t.items || [];
                                const summary = items.map(i => `${i.product_name}×${i.qty}`).join('; ') || '—';
                                const undone = Boolean(t.is_undone);
                                return (
                                    <tr key={t.id}>
                                        <td className="mono">{t.date}</td>
                                        <td>{t.from_city}</td>
                                        <td>{t.to_city}</td>
                                        <td style={{ maxWidth: '220px', fontSize: '12px' }}>{summary}</td>
                                        <td className="muted" style={{ maxWidth: '140px' }}>{t.notes || '—'}</td>
                                        <td className="muted">{t.created_by || '—'}</td>
                                        <td>
                                            {undone ? (
                                                <span className="badge b-gray">Undone</span>
                                            ) : (
                                                <span className="badge b-green">Active</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                disabled={undone}
                                                onClick={() => setPendingUndo(t)}
                                            >
                                                Undo
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {transfers.length === 0 && (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: '28px' }}>
                                        No transfers yet
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmDialog
                open={!!pendingUndo}
                title="Undo transfer"
                message={
                    pendingUndo ? (
                        <>
                            Reverse this transfer from <strong>{pendingUndo.from_city}</strong> to{' '}
                            <strong>{pendingUndo.to_city}</strong>? Branch stock levels will update immediately.
                        </>
                    ) : null
                }
                confirmLabel="Undo transfer"
                cancelLabel="Cancel"
                confirming={undoing}
                onConfirm={confirmUndo}
                onCancel={() => !undoing && setPendingUndo(null)}
            />

            <ConfirmDialog
                open={!!errorDialog}
                title={errorDialog?.title || 'Error'}
                message={errorDialog?.message || null}
                confirmLabel="OK"
                cancelLabel="Close"
                confirming={false}
                onConfirm={() => setErrorDialog(null)}
                onCancel={() => setErrorDialog(null)}
            />
        </div>
    );
}
