'use client';

import { useEffect, useState } from 'react';
import { getRestocks, getSales, SaleLineRow } from '@/api/sales';
import { getProducts } from '@/api/inventory';
import { Product, Restock } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const { user } = useAuth();
  const [sales, setSales] = useState<SaleLineRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role === 'manager') {
      router.push('/stock');
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadData() {
      if (user?.role !== 'admin') return; // Don't load dashboard data for managers
      try {
        const [s, p, r] = await Promise.all([getSales(), getProducts(), getRestocks()]);
        setSales(s);
        setProducts(p);
        setRestocks(r);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  if (loading || (user && user.role === 'manager')) return <div className="p-8">Loading dashboard...</div>;

  const salesWithHeaders = sales.filter(
    (s): s is SaleLineRow & { sales: NonNullable<SaleLineRow['sales']> } => s.sales != null
  );

  // --- Filtering Logic ---
  const applyFilter = (s: SaleLineRow & { sales: NonNullable<SaleLineRow['sales']> }) => {
    const saleDate = new Date(s.sales.date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (filterPeriod === 'today') {
      return saleDate.toDateString() === now.toDateString();
    }
    if (filterPeriod === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return saleDate >= weekAgo;
    }
    if (filterPeriod === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      return saleDate >= monthAgo;
    }
    if (filterPeriod === 'custom') {
      if (!dateFrom || !dateTo) return true;
      return saleDate >= new Date(dateFrom) && saleDate <= new Date(dateTo);
    }
    return true; // all
  };

  const filteredSales = salesWithHeaders.filter(applyFilter);

  // --- Calculations ---
  let totalRev = 0;
  let totalOrders = filteredSales.length;

  const prodMap = new Map<string, number>();
  const chanMap = new Map<string, number>();

  filteredSales.forEach(s => {
    totalRev += s.final_price;
    prodMap.set(s.product_name, (prodMap.get(s.product_name) || 0) + s.final_price);
    if (s.sales.channel) chanMap.set(s.sales.channel, (chanMap.get(s.sales.channel) || 0) + s.final_price);
  });

  const topProducts = Array.from(prodMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topChannels = Array.from(chanMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const maxProdRev = topProducts[0]?.[1] || 1;
  const maxChanRev = topChannels[0]?.[1] || 1;

  // Formatting helpers
  const pkr = (v: number) => 'PKR ' + Number(Math.round(v)).toLocaleString();
  const barColor = (pct: number) => {
    if (pct <= 0.2) return 'var(--red)';
    if (pct <= 0.4) return 'var(--amber)';
    return 'var(--gold)';
  };

  const statusBadge = (s: string) => {
    const map: any = { Paid: 'bg-[rgba(30,138,94,0.1)] text-[#1e8a5e]', Pending: 'bg-[rgba(192,112,16,0.1)] text-[#c07010]', Free: 'bg-[rgba(37,99,235,0.1)] text-[#2563eb]' };
    const cls = map[s] || 'bg-[rgba(139,147,168,0.1)] text-[#5a6175]';
    return <span className={`inline-flex items-center px-[9px] py-[3px] rounded-full text-[11.5px] font-semibold ${cls}`}>{s}</span>;
  };

  const lowStockCount = products.filter(p => {
    // Mirror Stock Levels logic: opening ("Initial Stock") + restocks - sold
    const sold = sales.filter(s => s.product_name === p.name).reduce((sum, row) => sum + row.qty, 0);
    const allRestocked = restocks
      .filter(r => r.product_name === p.name)
      .reduce((sum, row) => sum + row.qty, 0);

    const initialEntry = restocks.find(r => r.product_name === p.name && r.supplier === 'Initial Stock');
    const opening = initialEntry ? initialEntry.qty : 0;
    const restocked = allRestocked - opening;
    const total = opening + restocked;
    const current = total - sold;

    return current <= p.reorder_level;
  }).length;

  return (
    <div className="page active" id="page-dashboard">
      <div className="ph">
        <div>
          <h1>Dashboard</h1>
          <p>Real-time overview of MSK Aesthetics inventory & sales</p>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: "'DM Mono','Fira Code','Courier New',monospace" }}>
          {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="date-filter-bar">
        <span className="filter-label">Period:</span>
        <button className={`dfbtn ${filterPeriod === 'today' ? 'active' : ''}`} onClick={() => setFilterPeriod('today')}>Today</button>
        <button className={`dfbtn ${filterPeriod === 'week' ? 'active' : ''}`} onClick={() => setFilterPeriod('week')}>This Week</button>
        <button className={`dfbtn ${filterPeriod === 'month' ? 'active' : ''}`} onClick={() => setFilterPeriod('month')}>This Month</button>
        <button className={`dfbtn ${filterPeriod === 'all' ? 'active' : ''}`} onClick={() => setFilterPeriod('all')}>All Time</button>
        <button className={`dfbtn ${filterPeriod === 'custom' ? 'active' : ''}`} onClick={() => setFilterPeriod('custom')}>Custom</button>

        {filterPeriod === 'custom' && (
          <div className="date-custom" id="custom-range" style={{ display: 'flex' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span style={{ color: 'var(--text3)', fontSize: '12px' }}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        )}
        <span className="date-range-label">
          {filterPeriod === 'all' ? 'All time' : filterPeriod.charAt(0).toUpperCase() + filterPeriod.slice(1)}
        </span>
      </div>

      <div className="kpi-grid">
        <div className={`kpi gold ${!user || user.role !== 'admin' ? 'kpi-hidden' : ''}`}>
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-val">{pkr(totalRev)}</div>
          <div className="kpi-sub">Total revenue for selected period</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">Units Sold</div>
          <div className="kpi-val">{filteredSales.reduce((a, s) => a + s.qty, 0)}</div>
          <div className="kpi-sub">Across all channels</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Pending</div>
          <div className="kpi-val">
            {pkr(
              filteredSales
                .filter(s => s.sales.status === 'Pending')
                .reduce((a, s) => a + s.final_price, 0)
            )}
          </div>
          <div className="kpi-sub">Awaiting payment</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">Low Stock Alerts</div>
          <div className="kpi-val">{lowStockCount}</div>
          <div className="kpi-sub">Items at or below reorder level</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-title">Revenue by Product</div>
          <div className="bar-list">
            {topProducts.length === 0 ? <div className="p-4 text-center text-gray-500 text-sm">No data for this period</div> : topProducts.map((p, i) => (
              <div className="bar-item" key={i}>
                <div className="bar-meta">
                  <span className="name">{p[0]}</span>
                  <span className="val">{pkr(p[1])}</span>
                </div>
                <div className="prog"><div className="prog-fill" style={{ width: `${(p[1] / maxProdRev) * 100}%`, background: 'var(--gold)' }}></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Revenue by Channel</div>
          <div className="bar-list">
            {topChannels.length === 0 ? <div className="p-4 text-center text-gray-500 text-sm">No data for this period</div> : topChannels.map((c, i) => (
              <div className="bar-item" key={i}>
                <div className="bar-meta">
                  <span className="name">{c[0]}</span>
                  <span className="val">{pkr(c[1])}</span>
                </div>
                <div className="prog"><div className="prog-fill" style={{ width: `${(c[1] / maxChanRev) * 100}%`, background: 'var(--blue)' }}></div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Transactions <span>Showing up to 8 entries</span></div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ref</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Channel</th>
                <th>Final (PKR)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.slice(0, 8).map(s => (
                <tr key={s.id}>
                  <td className="mono">{s.sales.date}</td>
                  <td className="mono">{s.sales.ref}</td>
                  <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                  <td>{s.qty}</td>
                  <td><span className="badge b-gray">{s.sales.channel}</span></td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--gold)' }}>{pkr(s.final_price)}</td>
                  <td>{statusBadge(s.sales.status)}</td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: '32px' }}>No transactions found for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
