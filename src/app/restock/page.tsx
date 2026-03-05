'use client';

import { useEffect, useState } from 'react';
import { getProducts, getConfigLists } from '@/api/inventory';
import { getRestocks, addRestock, deleteRestock } from '@/api/sales';
import { addActivityLog } from '@/api/quotes';
import { Product, Restock } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function RestockPage() {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [restocks, setRestocks] = useState<Restock[]>([]);
    const [branches, setBranches] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingDelete, setPendingDelete] = useState<Restock | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Form State
    const [productName, setProductName] = useState('');
    const [qty, setQty] = useState(10);
    const [branch, setBranch] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [supplier, setSupplier] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        try {
            const [p, r, configLists] = await Promise.all([getProducts(), getRestocks(), getConfigLists()]);
            setProducts(p);
            setRestocks(r);
            setBranches(configLists.filter(c => c.type === 'city').map(c => c.value));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleAdd = async () => {
        if (!productName || qty < 1) {
            alert('Please select a product and valid quantity.');
            return;
        }
        setSaving(true);
        try {
            await addRestock({ product_name: productName, qty, city: branch, date, supplier, notes });

            if (user) {
                await addActivityLog({
                    type: 'add',
                    user_name: user.name,
                    role: user.role,
                    message: `Restocked <strong>${productName}</strong> +${qty} units${branch ? ' → ' + branch : ''}`,
                });
            }
            setQty(10);
            setBranch('');
            setSupplier('');
            setNotes('');
            await loadData();
        } catch (e) {
            console.error(e);
            alert('Failed to add restock.');
        } finally {
            setSaving(false);
        }
    };

    const isAdmin = user?.role === 'admin';

    const handleDelete = (r: Restock) => {
        if (!user || !isAdmin) return;
        setPendingDelete(r);
    };

    const confirmDelete = async () => {
        if (!user || !pendingDelete || !pendingDelete.id) return;
        setDeleting(true);
        try {
            await deleteRestock(pendingDelete.id);
            await loadData();
            setPendingDelete(null);
        } catch (e) {
            console.error(e);
            alert('Failed to delete restock record.');
        } finally {
            setDeleting(false);
        }
    };

    if (loading) return <div className="page active"><div className="ph"><div><h1>Restock</h1></div></div><div style={{ color: 'var(--text3)', padding: '32px', textAlign: 'center' }}>Loading...</div></div>;

    return (
        <div className="page active" id="page-restock">
            <div className="ph">
                <div>
                    <h1>Restock</h1>
                    <p>Add stock to existing products</p>
                </div>
            </div>

            <div className="restock-layout" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '18px', alignItems: 'start' }}>

                {/* ADD STOCK FORM */}
                <div className="card">
                    <div className="card-title">Add Stock</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="fg">
                            <label>Product</label>
                            <select value={productName} onChange={e => setProductName(e.target.value)}>
                                <option value="">Select product…</option>
                                {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="fg">
                            <label>Units to Add</label>
                            <input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
                        </div>
                        <div className="fg">
                            <label>Destination Branch</label>
                            <select value={branch} onChange={e => setBranch(e.target.value)}>
                                <option value="">Select branch…</option>
                                {branches.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="fg">
                            <label>Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="fg">
                            <label>Supplier / Source</label>
                            <input type="text" placeholder="Supplier name…" value={supplier} onChange={e => setSupplier(e.target.value)} />
                        </div>
                        <div className="fg">
                            <label>Notes</label>
                            <input type="text" placeholder="Batch, lot, etc." value={notes} onChange={e => setNotes(e.target.value)} />
                        </div>
                    </div>
                    <div className="btn-row">
                        <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                            {saving ? 'Adding...' : 'Add Stock'}
                        </button>
                    </div>
                </div>

                {/* RESTOCK HISTORY */}
                <div className="card">
                    <div className="card-title">Restock History</div>
                    <div className="tbl-wrap">
                        <table id="rs-tbl">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Product</th>
                                    <th>Branch</th>
                                    <th>Units Added</th>
                                    <th>Supplier</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {restocks.map(r => (
                                    <tr key={r.id}>
                                        <td className="mono">{r.date}</td>
                                        <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                                        <td><span className="badge b-blue" style={{ fontSize: '11px' }}>{r.city || '—'}</span></td>
                                        <td style={{ color: 'var(--green)', fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace", fontWeight: 700 }}>+{r.qty}</td>
                                        <td className="muted">{r.supplier || '—'}</td>
                                        <td className="muted">{r.notes || '—'}</td>
                                        <td>
                                            {isAdmin && (
                                                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(r)} title="Delete restock">✕</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {restocks.length === 0 && (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: '28px' }}>No restock entries yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            <ConfirmDialog
                open={!!pendingDelete}
                title="Delete restock record"
                message={pendingDelete ? (
                    <>
                        You are about to delete the restock record: <strong>{pendingDelete.product_name}</strong>, +{pendingDelete.qty} units
                        {pendingDelete.city ? ` at ${pendingDelete.city}` : ''} ({pendingDelete.date}). This cannot be undone.
                    </>
                ) : null}
                confirmLabel="Delete"
                cancelLabel="Cancel"
                confirming={deleting}
                onConfirm={confirmDelete}
                onCancel={() => !deleting && setPendingDelete(null)}
            />
        </div>
    );
}
