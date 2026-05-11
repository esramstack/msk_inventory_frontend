'use client';

import { useEffect, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar
} from 'recharts';
import { getSales, SaleLineRow } from '@/api/sales';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

type SaleRowWithHeader = SaleLineRow & { sales: NonNullable<SaleLineRow['sales']> };

export default function AnalyticsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [sales, setSales] = useState<SaleLineRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [dateRange, setDateRange] = useState('ALL');
    const [branchFilter, setBranchFilter] = useState('ALL');

    useEffect(() => {
        if (user && user.role !== 'admin') {
            router.push('/stock');
            return;
        }

        async function load() {
            try {
                const data = await getSales();
                setSales(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [user, router]);

    if (loading || !user || user.role !== 'admin') return <div className="p-8 text-center text-[var(--text3)]">Loading analytics...</div>;

    const filterDate = new Date();
    if (dateRange === '30D') filterDate.setDate(filterDate.getDate() - 30);
    if (dateRange === '90D') filterDate.setDate(filterDate.getDate() - 90);
    if (dateRange === '1Y') filterDate.setFullYear(filterDate.getFullYear() - 1);
    if (dateRange === 'ALL') filterDate.setFullYear(2000);

    const salesWithHeaders = sales.filter((s): s is SaleRowWithHeader => s.sales != null);

    const branchOptions = Array.from(
        new Set(salesWithHeaders.map(s => s.sales.city).filter(Boolean))
    ) as string[];

    const filteredSales = salesWithHeaders.filter(s =>
        new Date(s.sales.date) >= filterDate &&
        (branchFilter === 'ALL' || s.sales.city === branchFilter)
    );

    const revByDateMap = new Map<string, number>();
    filteredSales.forEach(s => {
        revByDateMap.set(s.sales.date, (revByDateMap.get(s.sales.date) || 0) + s.final_price);
    });
    const revOverTime = Array.from(revByDateMap.entries())
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const prodMap = new Map<string, { rev: number; qty: number }>();
    filteredSales.forEach(s => {
        const current = prodMap.get(s.product_name) || { rev: 0, qty: 0 };
        prodMap.set(s.product_name, { rev: current.rev + s.final_price, qty: current.qty + s.qty });
    });
    const topProducts = Array.from(prodMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 5);

    const chanMap = new Map<string, number>();
    filteredSales.forEach(s => {
        if (s.sales.channel) chanMap.set(s.sales.channel, (chanMap.get(s.sales.channel) || 0) + s.final_price);
    });
    const topChannels = Array.from(chanMap.entries())
        .map(([name, rev]) => ({ name, rev }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 4);

    const branchRevMap = new Map<string, number>();
    filteredSales.forEach(s => {
        if (s.sales.city) branchRevMap.set(s.sales.city, (branchRevMap.get(s.sales.city) || 0) + s.final_price);
    });
    const branchRevData = Array.from(branchRevMap.entries())
        .map(([name, rev]) => ({ name, rev }))
        .sort((a, b) => b.rev - a.rev);

    const totalRev = filteredSales.reduce((a, s) => a + s.final_price, 0);
    const totalUnits = filteredSales.reduce((a, s) => a + s.qty, 0);
    const pendingRev = filteredSales
        .filter(s => s.sales.status === 'Pending')
        .reduce((a, s) => a + s.final_price, 0);
    const totalDisc = filteredSales.reduce((a, s) => a + (s.disc_amt || 0), 0);
    const discPercentage = totalRev > 0 ? (totalDisc / (totalRev + totalDisc) * 100).toFixed(1) : '0';

    const breakdownMap = new Map<string, { product: string; branch: string; qty: number; revenue: number; discAmt: number; orders: Set<string> }>();
    filteredSales.forEach(s => {
        const branch = s.sales.city || '—';
        const key = `${s.product_name}||${branch}`;
        const cur = breakdownMap.get(key) || {
            product: s.product_name,
            branch,
            qty: 0,
            revenue: 0,
            discAmt: 0,
            orders: new Set<string>()
        };
        cur.qty += s.qty;
        cur.revenue += s.final_price;
        cur.discAmt += s.disc_amt || 0;
        cur.orders.add(s.sales.ref);
        breakdownMap.set(key, cur);
    });
    const breakdownRows = Array.from(breakdownMap.values())
        .map(r => ({ ...r, orderCount: r.orders.size }))
        .sort((a, b) => b.revenue - a.revenue);

    const pkr = (v: number) => 'PKR ' + Number(Math.round(v)).toLocaleString();

    const rangeLabel = dateRange === 'ALL' ? 'Lifetime' : `Last ${dateRange}`;
    const branchLabel = branchFilter === 'ALL' ? 'All branches' : branchFilter;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '10px', borderRadius: '8px', color: 'var(--text)' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
                    <p style={{ margin: 0, color: 'var(--gold)' }}>PKR {Number(payload[0].value).toLocaleString()}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="page active" id="page-analytics">
            <div className="ph">
                <div>
                    <h1>Analytics</h1>
                    <p>Revenue trends, top performers & branch insights</p>
                </div>
            </div>

            <div style={{ marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {['30D', '90D', '1Y', 'ALL'].map(r => (
                    <button
                        key={r}
                        type="button"
                        className={`dfbtn ${dateRange === r ? 'active' : ''}`}
                        onClick={() => setDateRange(r)}
                    >
                        {r}
                    </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Branch</span>
                    <button
                        type="button"
                        className={`dfbtn ${branchFilter === 'ALL' ? 'active' : ''}`}
                        onClick={() => setBranchFilter('ALL')}
                    >
                        All Branches
                    </button>
                    {branchOptions.map(b => (
                        <button
                            key={b}
                            type="button"
                            className={`dfbtn ${branchFilter === b ? 'active' : ''}`}
                            onClick={() => setBranchFilter(b)}
                        >
                            {b}
                        </button>
                    ))}
                </div>
            </div>

            <div className="kpi-grid" style={{ marginBottom: '18px' }}>
                <div className="kpi gold">
                    <div className="kpi-label">Total Revenue</div>
                    <div className="kpi-val">{pkr(totalRev)}</div>
                    <div className="kpi-sub">{rangeLabel} · {branchLabel}</div>
                </div>
                <div className="kpi green">
                    <div className="kpi-label">Units Sold</div>
                    <div className="kpi-val">{totalUnits.toLocaleString()}</div>
                    <div className="kpi-sub">Line items in scope</div>
                </div>
                <div className="kpi amber">
                    <div className="kpi-label">Pending Revenue</div>
                    <div className="kpi-val">{pkr(pendingRev)}</div>
                    <div className="kpi-sub">Status: Pending</div>
                </div>
                <div className="kpi red">
                    <div className="kpi-label">Discount Given</div>
                    <div className="kpi-val">{pkr(totalDisc)}</div>
                    <div className="kpi-sub">Sum of line discounts</div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '18px' }}>
                <div className="card-title">
                    Revenue trend
                    <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: '12px' }}>
                        {rangeLabel} · {branchLabel}
                    </span>
                </div>
                <div className="line-chart-wrap" style={{ height: '280px' }}>
                    {revOverTime.length === 0 ? (
                        <div className="chart-empty">No sales data available for this period</div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={revOverTime} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="date" stroke="var(--text3)" tick={{ fontSize: 11 }} />
                                <YAxis stroke="var(--text3)" tick={{ fontSize: 11 }} tickFormatter={v => `${v / 1000}k`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey="revenue" stroke="var(--gold)" strokeWidth={3} dot={{ r: 4, fill: 'var(--gold)', stroke: 'var(--surface)' }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            <div className="top-grid">
                <div className="card">
                    <div className="card-title">Top Products <span style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: '12px' }}>Total Sale</span></div>
                    <div className="rank-list">
                        {topProducts.map((p, i) => (
                            <div className="rank-item" key={p.name}>
                                <div className={`rank-num r${i + 1}`}>{i + 1}</div>
                                <div className="rank-info">
                                    <div className="rank-name">{p.name}</div>
                                    <div className="rank-sub">{p.qty} units sold</div>
                                </div>
                                <div className="rank-val">{pkr(p.rev)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">Top Channels</div>
                    <div className="rank-list">
                        {topChannels.map((c, i) => (
                            <div className="rank-item" key={c.name}>
                                <div className={`rank-num r${i + 1}`}>{i + 1}</div>
                                <div className="rank-info">
                                    <div className="rank-name">{c.name}</div>
                                    <div className="rank-sub">via {c.name}</div>
                                </div>
                                <div className="rank-val">{pkr(c.rev)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div
                className="top-grid"
                style={branchFilter !== 'ALL' ? { gridTemplateColumns: '1fr' } : undefined}
            >
                {branchFilter === 'ALL' && (
                    <div className="card">
                        <div className="card-title">
                            Revenue by branch
                            <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: '12px' }}>{rangeLabel}</span>
                        </div>
                        <div className="line-chart-wrap" style={{ height: '280px' }}>
                            {branchRevData.length === 0 ? (
                                <div className="chart-empty">No branch data for this period</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={branchRevData} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="name" stroke="var(--text3)" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                                        <YAxis stroke="var(--text3)" tick={{ fontSize: 11 }} tickFormatter={v => `${v / 1000}k`} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="rev" fill="var(--gold)" radius={[6, 6, 0, 0]} name="Revenue" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                )}

                <div className="card">
                    <div className="card-title">Discount Analysis</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Total Revenue (Filtered)</span>
                            <span style={{ fontStyle: 'italic', fontWeight: 600 }}>{pkr(totalRev)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Total Discount Given</span>
                            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{pkr(totalDisc)}</span>
                        </div>
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>Effective Discount Rate</span>
                            <span className="badge b-red">{discPercentage}%</span>
                        </div>
                        <p style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.4 }}>
                            Impact of discounts on gross revenue for the selected date range and branch scope.
                        </p>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-title">
                    Sales by product {branchFilter === 'ALL' ? 'and branch' : ''}
                    <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: '12px' }}>
                        {rangeLabel} · {branchLabel}
                    </span>
                </div>
                <div className="tbl-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                {branchFilter === 'ALL' && <th>Branch</th>}
                                <th>Units Sold</th>
                                <th>Revenue</th>
                                <th>Discount Given</th>
                                <th>Orders</th>
                            </tr>
                        </thead>
                        <tbody>
                            {breakdownRows.map((row, idx) => (
                                <tr key={`${row.product}-${row.branch}-${idx}`}>
                                    <td style={{ fontWeight: 600 }}>{row.product}</td>
                                    {branchFilter === 'ALL' && <td className="muted">{row.branch}</td>}
                                    <td className="mono">{row.qty}</td>
                                    <td className="mono" style={{ fontWeight: 600, color: 'var(--gold)' }}>{pkr(row.revenue)}</td>
                                    <td className="mono" style={{ color: 'var(--red)' }}>{pkr(row.discAmt)}</td>
                                    <td className="mono">{row.orderCount}</td>
                                </tr>
                            ))}
                            {breakdownRows.length === 0 && (
                                <tr>
                                    <td colSpan={branchFilter === 'ALL' ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '28px' }}>
                                        No sales in this scope
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
