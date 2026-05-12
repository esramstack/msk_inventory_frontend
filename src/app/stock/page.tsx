'use client';

import { useEffect, useState } from 'react';
import { getProducts } from '@/api/inventory';
import { getSales, getRestocks } from '@/api/sales';
import { getTransfers } from '@/api/transfers';
import { buildBranchStockMap, normalizeKey } from '@/lib/stockUtils';

// ── Types ──────────────────────────────────────────────────────────────────
interface StockRow {
    product: string;
    opening: number;
    restocked: number;
    total: number;
    sold: number;
    current: number;
    reorder: number;
    healthPct: number;
    daysLeft: number | '∞';
}

interface BranchProductRow {
    product: string;
    restocked: number;
    sold: number;
    current: number;
    healthPct: number;
}

interface BranchData {
    branch: string;
    branchKey: string;
    products: BranchProductRow[];
    totalCurrent: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const CITY_COLORS = ['var(--blue)', 'var(--green)', 'var(--gold)', 'var(--amber)', 'var(--red)'];

const barColor = (pct: number) => {
    if (pct <= 0.2) return 'var(--red)';
    if (pct <= 0.4) return 'var(--amber)';
    return 'var(--gold)';
};

const StockBadge = ({ cur, reorder }: { cur: number; reorder: number }) => {
    if (cur <= 0) return <span className="badge b-red">Out of Stock</span>;
    if (cur <= reorder) return <span className="badge b-amber">Low Stock</span>;
    return <span className="badge b-green">In Stock</span>;
};

// ── Component ──────────────────────────────────────────────────────────────
export default function StockLevels() {
    const [stockRows, setStockRows] = useState<StockRow[]>([]);
    const [branchData, setBranchData] = useState<BranchData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'branch'>('overview');

    useEffect(() => {
        async function loadData() {
            try {
                const [products, salesData, restockData, transferData] = await Promise.all([
                    getProducts(), getSales(), getRestocks(), getTransfers()
                ]);

                const { branchCards, sumCurrentByProductKey } = buildBranchStockMap(
                    salesData,
                    restockData,
                    transferData,
                    products
                );

                const branchUi: BranchData[] = branchCards.map(c => ({
                    branch: c.branchLabel,
                    branchKey: c.branchKey,
                    totalCurrent: c.totalCurrent,
                    products: c.products.map(p => ({
                        product: p.productLabel,
                        restocked: p.restocked,
                        sold: p.sold,
                        current: p.current,
                        healthPct: p.healthPct
                    }))
                }));
                setBranchData(branchUi);

                const startDate = new Date('2025-06-01');
                const daysSince = Math.max(
                    1,
                    Math.round((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                );

                const rows: StockRow[] = products.map(p => {
                    const pk = normalizeKey(p.name);
                    // Match sales log baseline: count only rows that have a visible sale header.
                    const sold = salesData
                        .filter(r => r.sales != null && normalizeKey(r.product_name) === pk)
                        .reduce((sum, r) => sum + r.qty, 0);
                    const allRestocked = restockData
                        .filter(r => normalizeKey(r.product_name) === pk)
                        .reduce((sum, r) => sum + r.qty, 0);
                    const initialEntry = restockData.find(
                        r => normalizeKey(r.product_name) === pk && r.supplier === 'Initial Stock'
                    );
                    const opening = initialEntry ? initialEntry.qty : 0;
                    const restocked = allRestocked - opening;
                    const total = opening + restocked;
                    const current = sumCurrentByProductKey.get(pk) ?? 0;
                    const healthPct = total > 0 ? Math.max(0, current / total) : 0;
                    const avgDaily = sold / daysSince;
                    const daysLeft: number | '∞' =
                        avgDaily > 0 ? Math.round(current / avgDaily) : '∞';
                    return {
                        product: p.name,
                        opening,
                        restocked,
                        total,
                        sold,
                        current,
                        reorder: p.reorder_level,
                        healthPct,
                        daysLeft
                    };
                });

                setStockRows(rows);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    if (loading) return (
        <div className="page active">
            <div className="ph"><div><h1>Stock Levels</h1><p>Loading…</p></div></div>
        </div>
    );

    return (
        <div className="page active" id="page-stock">
            <div className="ph">
                <div>
                    <h1>Stock Levels</h1>
                    <p>Live inventory across all products</p>
                </div>
            </div>

            <div className="stock-tabs">
                <button
                    className={`stock-tab${activeTab === 'overview' ? ' active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                    id="tab-overview"
                >
                    📦 Overview
                </button>
                <button
                    className={`stock-tab${activeTab === 'branch' ? ' active' : ''}`}
                    onClick={() => setActiveTab('branch')}
                    id="tab-branch"
                >
                    🏙️ By Branch
                </button>
            </div>

            {activeTab === 'overview' && (
                <div id="stock-tab-overview">
                    <div className="card">
                        <div className="tbl-wrap">
                            <table id="stock-tbl">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Opening</th>
                                        <th>Restocked</th>
                                        <th>Total</th>
                                        <th>Sold</th>
                                        <th>Current</th>
                                        <th>Reorder At</th>
                                        <th style={{ minWidth: '100px' }}>Stock %</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockRows.map(r => (
                                        <tr key={r.product}>
                                            <td style={{ fontWeight: 600 }}>{r.product}</td>
                                            <td className="mono">{r.opening}</td>
                                            <td style={{ color: 'var(--green)', fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}>
                                                {r.restocked}
                                            </td>
                                            <td className="mono">{r.total}</td>
                                            <td className="mono">{r.sold}</td>
                                            <td style={{
                                                fontWeight: 700,
                                                fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
                                                color: r.current <= r.reorder ? 'var(--red)' : r.current <= r.reorder * 2 ? 'var(--amber)' : 'var(--text)'
                                            }}>
                                                {r.current}
                                            </td>
                                            <td className="mono">{r.reorder}</td>
                                            <td style={{ minWidth: '100px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className="prog" style={{ flex: 1 }}>
                                                        <div className="prog-fill" style={{ width: `${Math.round(r.healthPct * 100)}%`, background: barColor(r.healthPct) }} />
                                                    </div>
                                                    <span style={{ fontSize: '11.5px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", minWidth: '32px' }}>
                                                        {Math.round(r.healthPct * 100)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td><StockBadge cur={r.current} reorder={r.reorder} /></td>
                                        </tr>
                                    ))}
                                    {stockRows.length === 0 && (
                                        <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text3)', padding: '28px' }}>No products configured</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'branch' && (
                <div id="stock-tab-branch">
                    <div className="card">
                        <div className="card-title">Current Inventory by Branch</div>
                        <div className="branch-stock-grid" id="branch-stock-grid">
                            {branchData.map((d, ci) => {
                                const color = CITY_COLORS[ci % CITY_COLORS.length];
                                return (
                                    <div className="branch-stock-card" key={d.branchKey}>
                                        <div className="branch-name">
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                            {d.branch}
                                            <span className="branch-total">
                                                {d.totalCurrent} units in stock
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', gap: '4px 8px', marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Product</span>
                                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right' }}>Restocked</span>
                                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right' }}>Current</span>
                                            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right' }}>Status</span>
                                        </div>
                                        {d.products.length === 0 ? (
                                            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No inventory movements yet</div>
                                        ) : d.products.map(b => (
                                            <div
                                                className="branch-prod-row"
                                                key={`${d.branchKey}:${normalizeKey(b.product)}`}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 80px 80px 100px',
                                                    gap: '4px 8px',
                                                    alignItems: 'center',
                                                    marginBottom: '12px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                                                    <div className="branch-prod-name">{b.product}</div>
                                                </div>
                                                <div className="branch-prod-qty" style={{ textAlign: 'right', fontWeight: 600 }}>
                                                    {b.restocked}
                                                </div>
                                                <div className="branch-prod-current" style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: '13px' }}>
                                                    {b.current}
                                                </div>
                                                <div className="branch-prod-status" style={{ textAlign: 'right' }}>
                                                    <span
                                                        style={{
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            color:
                                                                b.current <= 0
                                                                    ? 'var(--red)'
                                                                    : b.current < 10
                                                                        ? 'var(--amber)'
                                                                        : 'var(--green)'
                                                        }}
                                                    >
                                                        {b.current <= 0
                                                            ? 'Out of stock'
                                                            : b.current < 10
                                                                ? 'Low on stock'
                                                                : 'In stock'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                            {branchData.length === 0 && (
                                <div style={{ color: 'var(--text3)', fontSize: '13px', padding: '8px' }}>No branch data available yet</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
