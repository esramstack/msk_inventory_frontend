'use client';

import { useEffect, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { getSales, SaleLineRow } from '@/api/sales';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function AnalyticsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [sales, setSales] = useState<SaleLineRow[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [dateRange, setDateRange] = useState('ALL');

    useEffect(() => {
        if (user && user.role !== 'admin') {
            router.push('/stock'); // Protection
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

    // Filter Sales By Date
    const filterDate = new Date();
    if (dateRange === '30D') filterDate.setDate(filterDate.getDate() - 30);
    if (dateRange === '90D') filterDate.setDate(filterDate.getDate() - 90);
    if (dateRange === '1Y') filterDate.setFullYear(filterDate.getFullYear() - 1);
    if (dateRange === 'ALL') filterDate.setFullYear(2000);

    const salesWithHeaders = sales.filter((s): s is SaleLineRow & { sales: NonNullable<SaleLineRow['sales']> } => s.sales != null);
    const filteredSales = salesWithHeaders.filter(s => new Date(s.sales.date) >= filterDate);

    // Revenue Over Time (Group by Date)
    const revByDateMap = new Map<string, number>();
    filteredSales.forEach(s => {
        revByDateMap.set(s.sales.date, (revByDateMap.get(s.sales.date) || 0) + s.final_price);
    });
    const revOverTime = Array.from(revByDateMap.entries())
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Top Products (by Revenue)
    const prodMap = new Map<string, { rev: number, qty: number }>();
    filteredSales.forEach(s => {
        const current = prodMap.get(s.product_name) || { rev: 0, qty: 0 };
        prodMap.set(s.product_name, { rev: current.rev + s.final_price, qty: current.qty + s.qty });
    });
    const topProducts = Array.from(prodMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 5);

    // Top Channels
    const chanMap = new Map<string, number>();
    filteredSales.forEach(s => {
        if (s.sales.channel) chanMap.set(s.sales.channel, (chanMap.get(s.sales.channel) || 0) + s.final_price);
    });
    const topChannels = Array.from(chanMap.entries())
        .map(([name, rev]) => ({ name, rev }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 4);

    // Top Cities
    const cityMap = new Map<string, number>();
    filteredSales.forEach(s => {
        if (s.sales.city) cityMap.set(s.sales.city, (cityMap.get(s.sales.city) || 0) + s.final_price);
    });
    const topCities = Array.from(cityMap.entries())
        .map(([name, rev]) => ({ name, rev }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 4);

    // Discount Analysis
    const totalRev = filteredSales.reduce((a, s) => a + s.final_price, 0);
    const totalDisc = filteredSales.reduce((a, s) => a + (s.disc_amt || 0), 0);
    const discPercentage = totalRev > 0 ? (totalDisc / (totalRev + totalDisc) * 100).toFixed(1) : '0';

    // Helpers
    const pkr = (v: number) => 'PKR ' + Number(Math.round(v)).toLocaleString();

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
                    <p>Revenue trends, top performers & insights</p>
                </div>
            </div>

            {/* Range Toggle */}
            <div style={{ marginBottom: '18px', display: 'flex', gap: '8px' }}>
                {['30D', '90D', '1Y', 'ALL'].map(r => (
                    <button
                        key={r}
                        className={`dfbtn ${dateRange === r ? 'active' : ''}`}
                        onClick={() => setDateRange(r)}
                    >
                        {r}
                    </button>
                ))}
            </div>

            {/* Monthly Revenue Trend */}
            <div className="card" style={{ marginBottom: '18px' }}>
                <div className="card-title">
                    📈 Monthly Revenue Trend
                    <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: '12px' }}>
                        {dateRange === 'ALL' ? 'Lifetime' : `Last ${dateRange}`}
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

            {/* Top Performers Grid */}
            <div className="top-grid">
                {/* Top Products */}
                <div className="card">
                    <div className="card-title">🏆 Top Products <span style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: '12px' }}>Total Sale</span></div>
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

                {/* Top Channels */}
                <div className="card">
                    <div className="card-title">📣 Top Channels</div>
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

            <div className="top-grid">
                {/* Top Branches */}
                <div className="card">
                    <div className="card-title">🏙️ Top Branches</div>
                    <div className="rank-list">
                        {topCities.map((c, i) => (
                            <div className="rank-item" key={c.name}>
                                <div className={`rank-num r${i + 1}`}>{i + 1}</div>
                                <div className="rank-info">
                                    <div className="rank-name">{c.name}</div>
                                    <div className="rank-sub">{filteredSales.filter(s => s.sales.city === c.name).length} transactions</div>
                                </div>
                                <div className="rank-val">{pkr(c.rev)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Discount Analysis */}
                <div className="card">
                    <div className="card-title">💳 Discount Analysis</div>
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
                            Impact of discounts on gross revenue for the selected data set.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
