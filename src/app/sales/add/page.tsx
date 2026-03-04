'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProducts, getConfigLists } from '@/api/inventory';
import { addSale } from '@/api/sales';
import { addActivityLog } from '@/api/quotes';
import { Product, ConfigList, Sale } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

export default function AddSale() {
    const { user } = useAuth();
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [configs, setConfigs] = useState<ConfigList[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [ref, setRef] = useState('');
    const [productName, setProductName] = useState('');
    const [qty, setQty] = useState(1);
    const [channel, setChannel] = useState('');
    const [saleType, setSaleType] = useState<
        '' | 'Full Price' | 'Percentage Discount' | 'Free / Complimentary'
    >('');
    const [branch, setBranch] = useState('');
    const [platform, setPlatform] = useState('');
    const [customer, setCustomer] = useState('');
    const [unitPrice, setUnitPrice] = useState(0);
    const [discPct, setDiscPct] = useState<string>('');
    const [status, setStatus] = useState<'Paid' | 'Pending' | 'Free' | ''>('');
    const [notes, setNotes] = useState('');

    const [saving, setSaving] = useState(false);

    const generateOrderRef = () => {
        const ts = Date.now().toString().slice(-5);
        return `ORD-${ts}`;
    };

    useEffect(() => {
        async function load() {
            try {
                const [p, c] = await Promise.all([getProducts(), getConfigLists()]);
                setProducts(p);
                setConfigs(c);
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

    const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const pName = e.target.value;
        setProductName(pName);
        const prod = products.find(x => x.name === pName);
        if (prod) {
            setUnitPrice(prod.price);
        }
    };

    const calcVars = () => {
        const price = unitPrice || 0;
        const quantity = qty || 1;
        const pctNum = discPct ? parseFloat(discPct) || 0 : 0;
        const discAmt = Math.round(price * quantity * pctNum);
        const final = Math.round(price * quantity * (1 - pctNum));
        return { discAmt, final, pctNum };
    };

    const { discAmt, final, pctNum } = calcVars();

    const handleSave = async () => {
        if (
            !productName ||
            !date ||
            !ref ||
            !channel ||
            !saleType ||
            !branch ||
            !platform ||
            !customer ||
            !status ||
            discPct === '' ||
            qty < 1
        ) {
            alert('Please fill out all mandatory fields.');
            return;
        }

        setSaving(true);
        try {
            const generatedRef = ref;
            const activeDisc = getDiscounts().find(
                d => String(d.pct ?? 0) === discPct
            );
            const discLabel = activeDisc
                ? activeDisc.value
                : `${(pctNum * 100).toFixed(0)}%`;

            const newSale: Omit<Sale, 'id' | 'created_at' | 'is_deleted' | 'deleted_at' | 'deleted_by'> = {
                date,
                ref: generatedRef,
                product_name: productName,
                qty,
                channel,
                sale_type: saleType,
                city: branch,
                platform,
                customer,
                unit_price: unitPrice,
                disc_label: discLabel,
                disc_pct: pctNum,
                disc_amt: discAmt,
                final_price: final,
                status,
                notes
            };

            await addSale(newSale);

            if (user) {
                await addActivityLog({
                    type: 'add',
                    user_name: user.name,
                    role: user.role,
                    message: `Recorded sale <strong>${generatedRef}</strong> — ${productName} × ${qty} (PKR ${final.toLocaleString()})`
                });
            }

            router.push('/sales');
        } catch (e) {
            console.error(e);
            alert('Failed to save sale.');
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
                        <label>Product*</label>
                        <select required value={productName} onChange={handleProductChange}>
                            <option value="">Select product…</option>
                            {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="fg"><label>Quantity*</label><input type="number" required min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} /></div>

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
                    <div className="fg"><label>Unit Price (PKR)*</label><input type="number" required value={unitPrice} onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)} /></div>

                    <div className="fg">
                        <label>Discount %*</label>
                        <select
                            required
                            value={discPct}
                            onChange={e => setDiscPct(e.target.value)}
                        >
                            <option value="">Select discount…</option>
                            {getDiscounts().map(d => (
                                <option key={d.id} value={String(d.pct ?? 0)}>
                                    {d.value}
                                </option>
                            ))}
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

                    <div className="price-preview">
                        <div className="lbl">Final Price (PKR)</div>
                        <div className="val">{pkr(final)}</div>
                    </div>
                    <div className="price-preview" style={{ borderColor: 'rgba(224,92,92,.3)' }}>
                        <div className="lbl" style={{ color: 'var(--red)' }}>Discount Amount</div>
                        <div className="val" style={{ color: 'var(--red)' }}>{pkr(discAmt)}</div>
                    </div>
                </div>

                <div className="btn-row">
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Sale'}</button>
                    <button className="btn btn-secondary" onClick={() => router.push('/sales')}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
