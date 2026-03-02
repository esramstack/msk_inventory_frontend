'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProducts, addProduct, updateProduct, deleteProduct, getConfigLists, addConfigList, deleteConfigList } from '@/api/inventory';
import { Product, ConfigList } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

export default function ConfigPage() {
    const { user } = useAuth();
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [configs, setConfigs] = useState<ConfigList[]>([]);
    const [loading, setLoading] = useState(true);

    // New Products
    const [npName, setNpName] = useState('');
    const [npPrice, setNpPrice] = useState(0);
    const [npReorder, setNpReorder] = useState(10);

    // New Config Items
    const [ncChannel, setNcChannel] = useState('');
    const [ncCity, setNcCity] = useState('');
    const [ncPlatform, setNcPlatform] = useState('');

    // New Discount
    const [ndLabel, setNdLabel] = useState('');
    const [ndPct, setNdPct] = useState(0);

    useEffect(() => {
        if (user && user.role !== 'admin') {
            router.push('/stock'); // Protection
            return;
        }

        loadData();
    }, [user, router]);

    const loadData = async () => {
        try {
            const [p, c] = await Promise.all([getProducts(), getConfigLists()]);
            setProducts(p);
            setConfigs(c);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Products ---
    const handleAddProduct = async () => {
        if (!npName) return;
        try {
            await addProduct({ name: npName, price: npPrice, reorder_level: npReorder });
            setNpName(''); setNpPrice(0); setNpReorder(10);
            await loadData();
        } catch (e) { console.error(e); alert('Failed to add product'); }
    };

    const handleUpdateProduct = async (id: string, updates: Partial<Product>) => {
        try {
            await updateProduct(id, updates);
            await loadData();
        } catch (e) { console.error(e); alert('Failed to update product'); }
    };

    const handleDeleteProduct = async (id: string, name: string) => {
        if (!confirm(`Remove product ${name}?`)) return;
        try {
            await deleteProduct(id);
            await loadData();
        } catch (e) { console.error(e); alert('Failed to delete product'); }
    };

    // --- Configs ---
    const handleAddConfig = async (type: 'channel' | 'city' | 'platform' | 'discount', value: string, pct?: number) => {
        if (!value) return;
        try {
            await addConfigList({ type, value, pct });
            if (type === 'channel') setNcChannel('');
            if (type === 'city') setNcCity('');
            if (type === 'platform') setNcPlatform('');
            if (type === 'discount') { setNdLabel(''); setNdPct(0); }
            await loadData();
        } catch (e) { console.error(e); alert(`Failed to add ${type}`); }
    };

    const handleDeleteConfig = async (id: string) => {
        try {
            await deleteConfigList(id);
            await loadData();
        } catch (e) { console.error(e); alert('Failed to delete item'); }
    };

    if (loading || !user || user.role !== 'admin') return <div className="p-8">Loading configuration...</div>;

    const channels = configs.filter(c => c.type === 'channel');
    const cities = configs.filter(c => c.type === 'city');
    const platforms = configs.filter(c => c.type === 'platform');
    const discounts = configs.filter(c => c.type === 'discount').sort((a, b) => (a.pct || 0) - (b.pct || 0));

    return (
        <div className="page active" id="page-config">
            <div className="ph">
                <div>
                    <h1>Configuration</h1>
                    <p>Manage products, pricing, channels &amp; dropdown lists</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '18px' }}>
                <div className="card-title">📦 Products &amp; Prices</div>
                <p style={{ color: 'var(--text3)', fontSize: '12.5px', marginBottom: '16px' }}>
                    Edit product names, default prices, and reorder levels. Changes apply everywhere immediately.
                </p>

                <div id="cfg-products">
                    {products.map(p => (
                        <div className="cfg-row" key={p.id}>
                            <span className="cfg-row-name">{p.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="cfg-inp-label">PKR</span>
                                <input className="cfg-inp" type="number" value={p.price} min="0" onChange={e => handleUpdateProduct(p.id!, { price: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}>
                                <span className="cfg-inp-label">Reorder</span>
                                <input className="cfg-inp small" type="number" value={p.reorder_level} min="1" onChange={e => handleUpdateProduct(p.id!, { reorder_level: parseInt(e.target.value) || 1 })} />
                            </div>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProduct(p.id!, p.name)}>Remove</button>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px auto', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)', alignItems: 'end' }}>
                    <div className="fg"><label>New Product Name</label><input type="text" placeholder="e.g. Face Serum 50ml" value={npName} onChange={e => setNpName(e.target.value)} /></div>
                    <div className="fg"><label>Price (PKR)</label><input type="number" placeholder="2500" min="0" value={npPrice} onChange={e => setNpPrice(parseFloat(e.target.value) || 0)} /></div>
                    <div className="fg"><label>Reorder At</label><input type="number" placeholder="10" min="1" value={npReorder} onChange={e => setNpReorder(parseInt(e.target.value) || 1)} /></div>
                    <div className="fg"><label>&nbsp;</label><button className="btn btn-primary" onClick={handleAddProduct}>+ Add</button></div>
                </div>
            </div>

            <div className="cfg-sections">
                <div className="card">
                    <div className="card-title">📣 Sales Channels</div>
                    <div className="list-editor">
                        {channels.map(c => (
                            <div className="list-item" key={c.id}>
                                <input type="text" value={c.value} readOnly />
                                <button className="del" onClick={() => handleDeleteConfig(c.id!)}>✕</button>
                            </div>
                        ))}
                    </div>
                    <div className="add-list-item">
                        <input type="text" placeholder="New channel…" value={ncChannel} onChange={e => setNcChannel(e.target.value)} />
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddConfig('channel', ncChannel)}>+ Add</button>
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">🏙️ Cities</div>
                    <div className="list-editor">
                        {cities.map(c => (
                            <div className="list-item" key={c.id}>
                                <input type="text" value={c.value} readOnly />
                                <button className="del" onClick={() => handleDeleteConfig(c.id!)}>✕</button>
                            </div>
                        ))}
                    </div>
                    <div className="add-list-item">
                        <input type="text" placeholder="New city…" value={ncCity} onChange={e => setNcCity(e.target.value)} />
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddConfig('city', ncCity)}>+ Add</button>
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">📱 Platforms</div>
                    <div className="list-editor">
                        {platforms.map(c => (
                            <div className="list-item" key={c.id}>
                                <input type="text" value={c.value} readOnly />
                                <button className="del" onClick={() => handleDeleteConfig(c.id!)}>✕</button>
                            </div>
                        ))}
                    </div>
                    <div className="add-list-item">
                        <input type="text" placeholder="New platform…" value={ncPlatform} onChange={e => setNcPlatform(e.target.value)} />
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddConfig('platform', ncPlatform)}>+ Add</button>
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">💸 Discount Options</div>
                    <div className="list-editor">
                        {discounts.map(d => (
                            <div className="list-item" key={d.id}>
                                <input type="text" value={d.value} readOnly style={{ width: '80px' }} />
                                <span style={{ color: 'var(--text3)', fontSize: '11px' }}>→ {Math.round((d.pct || 0) * 100)}%</span>
                                <button className="del" onClick={() => handleDeleteConfig(d.id!)}>✕</button>
                            </div>
                        ))}
                    </div>
                    <div className="add-list-item">
                        <input type="text" placeholder="Label (e.g. 45%)" value={ndLabel} onChange={e => setNdLabel(e.target.value)} />
                        <input type="number" placeholder="Dec (e.g. 0.45)" step="0.01" max="1" min="0" value={ndPct} onChange={e => setNdPct(parseFloat(e.target.value))} />
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddConfig('discount', ndLabel, ndPct)}>+ Add</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
