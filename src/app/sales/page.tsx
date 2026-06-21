'use client';

import React from 'react';
import { useEffect, useState } from 'react';
import { getSales, softDeleteSale, SaleLineRow } from '@/api/sales';
import { Sale } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

const PAGE_SIZE = 50;

function buildPages(
    refs: string[],
    groups: Record<string, (SaleLineRow & { sales: Sale })[]>,
    pageSize: number
): string[][] {
    const pages: string[][] = [];
    let current: string[] = [];
    let lineCount = 0;

    for (const ref of refs) {
        const size = groups[ref].length;
        if (current.length > 0 && lineCount + size > pageSize) {
            pages.push(current);
            current = [];
            lineCount = 0;
        }
        current.push(ref);
        lineCount += size;
    }
    if (current.length > 0) pages.push(current);
    return pages;
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = new Set<number>([1, total]);
    for (let p = current - 1; p <= current + 1; p++) {
        if (p >= 1 && p <= total) pages.add(p);
    }
    const sorted = Array.from(pages).sort((a, b) => a - b);
    const result: (number | 'ellipsis')[] = [];
    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('ellipsis');
        result.push(sorted[i]);
    }
    return result;
}

export default function SalesLog() {
    const { user } = useAuth();
    const [rows, setRows] = useState<SaleLineRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    const [productFilter, setProductFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [datePreset, setDatePreset] = useState<''
        | 'today'
        | 'last7'
        | 'thisMonth'>('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [pendingDelete, setPendingDelete] = useState<Sale | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const loadData = async () => {
        try {
            const data = await getSales();
            setRows(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, branchFilter, productFilter, paymentFilter, datePreset, fromDate, toDate]);

    const isAdmin = user?.role === 'admin';

    const handleDelete = (row: SaleLineRow) => {
        if (!user || !isAdmin) return;
        const header = row.sales;
        const saleId = header?.id ?? row.sale_id;
        if (!saleId) return;
        setPendingDelete({ ...header, id: saleId } as Sale);
    };

    const confirmDelete = async () => {
        if (!user || !pendingDelete) return;
        if (!pendingDelete.id) return;
        setDeleting(true);
        try {
            await softDeleteSale(pendingDelete.id, user.name);
            await loadData(); // Reload
            setPendingDelete(null);
        } catch (e) {
            console.error(e);
            alert('Failed to delete sale');
        } finally {
            setDeleting(false);
        }
    };

    // Compute active date window
    const today = new Date();
    let activeFrom = fromDate;
    let activeTo = toDate;

    if (datePreset) {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const y = today.getFullYear();
        const m = today.getMonth() + 1;
        const d = today.getDate();
        const todayStr = `${y}-${pad(m)}-${pad(d)}`;

        if (datePreset === 'today') {
            activeFrom = todayStr;
            activeTo = todayStr;
        } else if (datePreset === 'last7') {
            const from = new Date(today);
            from.setDate(from.getDate() - 6);
            const fy = from.getFullYear();
            const fm = from.getMonth() + 1;
            const fd = from.getDate();
            activeFrom = `${fy}-${pad(fm)}-${pad(fd)}`;
            activeTo = todayStr;
        } else if (datePreset === 'thisMonth') {
            activeFrom = `${y}-${pad(m)}-01`;
            activeTo = todayStr;
        }
    }

    const rowsWithSales = rows.filter((r): r is SaleLineRow & { sales: Sale } => r.sales != null);

    const filteredRows = rowsWithSales.filter(r => {
        const s = r.sales;
        const matchesSearch = (r.product_name + s.channel + s.customer + s.ref + s.city + s.notes)
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesStatus = !statusFilter || s.status === statusFilter;
        const matchesBranch = !branchFilter || s.city === branchFilter;
        const matchesProduct = !productFilter || r.product_name === productFilter;
        const matchesPayment = !paymentFilter || s.payment_type === paymentFilter;

        let matchesDate = true;
        const saleDate = s.date; // YYYY-MM-DD
        if (activeFrom) {
            matchesDate = matchesDate && saleDate >= activeFrom;
        }
        if (activeTo) {
            matchesDate = matchesDate && saleDate <= activeTo;
        }

        return matchesSearch && matchesStatus && matchesBranch && matchesProduct && matchesPayment && matchesDate;
    });

    // Sum of all displayed line-item final prices after filters are applied.
    const grandTotal = filteredRows.reduce((sum, r) => sum + (r.final_price || 0), 0);
    const totalQty = filteredRows.reduce((sum, r) => sum + (r.qty || 0), 0);

    const branchOptions = Array.from(new Set(rowsWithSales.map(r => r.sales.city).filter(Boolean))) as string[];
    const productOptions = Array.from(new Set(rowsWithSales.map(r => r.product_name).filter(Boolean))) as string[];
    const paymentOptions = Array.from(new Set(rowsWithSales.map(r => r.sales.payment_type).filter(Boolean))) as string[];

    // Group sales by order reference so multi-line orders appear together
    const groupedByRef = filteredRows.reduce((acc: Record<string, (SaleLineRow & { sales: Sale })[]>, row) => {
        const ref = row.sales.ref;
        if (!acc[ref]) acc[ref] = [];
        acc[ref].push(row);
        return acc;
    }, {});

    const orderedRefs = Object.keys(groupedByRef).sort((a, b) => {
        const aDate = groupedByRef[a][0]?.sales.date || '';
        const bDate = groupedByRef[b][0]?.sales.date || '';
        // Descending: newer first
        return bDate.localeCompare(aDate);
    });

    const pages = buildPages(orderedRefs, groupedByRef, PAGE_SIZE);
    const totalPages = Math.max(1, pages.length);
    const safePage = Math.min(currentPage, totalPages);
    const paginatedRefs = pages[safePage - 1] ?? [];
    const totalLineItems = filteredRows.length;
    const pageLineItems = paginatedRefs.reduce((n, ref) => n + groupedByRef[ref].length, 0);
    const linesBeforePage = pages.slice(0, safePage - 1).reduce(
        (n, page) => n + page.reduce((sum, ref) => sum + groupedByRef[ref].length, 0),
        0
    );
    const rangeStart = totalLineItems === 0 ? 0 : linesBeforePage + 1;
    const rangeEnd = totalLineItems === 0 ? 0 : linesBeforePage + pageLineItems;

    const pkr = (v: number) => 'PKR ' + Number(Math.round(v)).toLocaleString();
    const statusBadge = (s: string) => {
        const map: any = { Paid: 'bg-[rgba(30,138,94,0.1)] text-[#1e8a5e]', Pending: 'bg-[rgba(192,112,16,0.1)] text-[#c07010]', Free: 'bg-[rgba(37,99,235,0.1)] text-[#2563eb]' };
        const cls = map[s] || 'bg-[rgba(139,147,168,0.1)] text-[#5a6175]';
        return <span className={`inline-flex items-center px-[9px] py-[3px] rounded-full text-[11.5px] font-semibold ${cls}`}>{s}</span>;
    };

    // --- Export Logic ---
    const exportCSV = () => {
        const headers = ["Date", "Ref", "Product", "Qty", "Channel", "Customer", "Branch", "Payment", "Total", "Discount", "Final", "Status", "Notes"];
        const rows = filteredRows.map(r => [
            r.sales.date,
            r.sales.ref,
            r.product_name,
            r.qty,
            r.sales.channel,
            r.sales.customer || '',
            r.sales.city || '',
            r.sales.payment_type || '',
            (r.unit_price * r.qty).toFixed(0),
            r.disc_label || '0%',
            r.final_price.toFixed(0),
            r.sales.status,
            r.sales.notes || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `sales_log_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportPDF = async () => {
        const html2pdf = (await import('html2pdf.js')).default;
        const element = document.getElementById('sales-tbl-wrap');
        if (!element) return;

        const opt = {
            margin: 10,
            filename: `sales_log_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'landscape' as const }
        };
        html2pdf().from(element).set(opt).save();
    };

    if (loading) return <div className="p-8">Loading sales log...</div>;

    return (
        <div className="page active" id="page-sales">
            <div className="ph">
                <div>
                    <h1>Sales Log</h1>
                    <p>Complete history of all recorded transactions</p>
                </div>
                <div className="export-row">
                    <button className="btn-export" onClick={exportCSV}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Export CSV
                    </button>
                    <button className="btn-export" onClick={exportPDF}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                        Export PDF
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="search-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <input
                        type="text"
                        placeholder="Search by ref, product, customer…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ flex: '1 1 180px', minWidth: '160px' }}
                    />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">All statuses</option>
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Free">Free / Gift</option>
                    </select>
                    <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
                        <option value="">All branches</option>
                        {branchOptions.map(b => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                    <select value={productFilter} onChange={e => setProductFilter(e.target.value)}>
                        <option value="">All products</option>
                        {productOptions.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                    <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
                        <option value="">All payment types</option>
                        {paymentOptions.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                <div className="search-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Date:</span>
                    <select
                        value={datePreset}
                        onChange={e => setDatePreset(e.target.value as any)}
                    >
                        <option value="">All time</option>
                        <option value="today">Today</option>
                        <option value="last7">Last 7 days</option>
                        <option value="thisMonth">This month</option>
                    </select>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>From</span>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={e => {
                            setFromDate(e.target.value);
                            setDatePreset('');
                        }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>To</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={e => {
                            setToDate(e.target.value);
                            setDatePreset('');
                        }}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0 12px',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: 12
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Total Qty</span>
                        <span style={{
                            fontWeight: 800,
                            color: 'var(--gold)',
                            fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
                            fontSize: 16
                        }}>
                            {totalQty.toLocaleString()}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Total (Final Price)</span>
                        <span style={{
                            fontWeight: 800,
                            color: 'var(--gold)',
                            fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
                            fontSize: 16
                        }}>
                            {pkr(grandTotal)}
                        </span>
                    </div>
                </div>

                <div className="tbl-wrap" id="sales-tbl-wrap">
                    <table id="sales-tbl">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Order Ref</th>
                                <th>Product</th>
                                <th>Qty</th>
                                <th>Channel</th>
                                <th>Customer</th>
                                <th>Branch</th>
                                <th>Payment</th>
                                <th>Total</th>
                                <th>Discount</th>
                                <th>Final Price</th>
                                <th>Status</th>
                                <th>Notes</th>
                                <th className="no-export"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRefs.map(ref => {
                                const group = groupedByRef[ref];
                                const first = group[0];
                                const groupTotal = group.reduce((sum, r) => sum + r.final_price, 0);

                                return (
                                    <React.Fragment key={ref}>
                                        {group.map((r, idx) => (
                                            <tr key={r.id}>
                                                {idx === 0 && (
                                                    <>
                                                        <td className="mono" rowSpan={group.length}>{first.sales.date}</td>
                                                        <td className="mono" rowSpan={group.length}>
                                                            {first.sales.ref}
                                                            {group.length > 1 && (
                                                                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                                                                    {group.length} items
                                                                </div>
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                                <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                                                <td>{r.qty}</td>
                                                <td><span className="badge b-gray" style={{ fontSize: '11px' }}>{first.sales.channel}</span></td>
                                                <td className="muted">{first.sales.customer || '—'}</td>
                                                <td className="muted">{first.sales.city || '—'}</td>
                                                <td className="muted">{first.sales.payment_type || '—'}</td>
                                                <td className="mono">{pkr(r.unit_price * r.qty)}</td>
                                                <td className="mono" style={{ color: 'var(--amber)' }}>{r.disc_label || '0%'}</td>
                                                <td style={{ fontWeight: 600, color: 'var(--gold)', fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}>{pkr(r.final_price)}</td>
                                                <td>{statusBadge(first.sales.status)}</td>
                                                <td className="muted">{first.sales.notes || '—'}</td>
                                                <td className="no-export">
                                                    {isAdmin && (
                                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>✕</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <td colSpan={10}></td>
                                            <td style={{ fontWeight: 600, fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}>
                                                {pkr(groupTotal)}
                                            </td>
                                            <td colSpan={3} style={{ fontSize: '11px', color: 'var(--text3)' }}>
                                                Order total
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                            {orderedRefs.length === 0 && (
                                <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--text3)', padding: '32px' }}>No sales found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {totalLineItems > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid var(--border)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8
                        }}>
                            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                                Showing {rangeStart}–{rangeEnd} of {totalLineItems.toLocaleString()} lines
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    disabled={safePage <= 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                >
                                    Previous
                                </button>
                                <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                                    Page {safePage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                        {totalPages > 1 && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 4,
                                flexWrap: 'wrap'
                            }}>
                                {getPageNumbers(safePage, totalPages).map((item, idx) =>
                                    item === 'ellipsis' ? (
                                        <span
                                            key={`ellipsis-${idx}`}
                                            style={{ fontSize: 12, color: 'var(--text3)', padding: '0 4px' }}
                                        >
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={item}
                                            type="button"
                                            className={`btn btn-sm ${item === safePage ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setCurrentPage(item)}
                                            disabled={item === safePage}
                                            aria-current={item === safePage ? 'page' : undefined}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={!!pendingDelete}
                title="Delete sale"
                message={pendingDelete ? (
                    <>
                        You are about to delete sale <strong>{pendingDelete.ref}</strong> for{' '}
                        <strong>{pendingDelete.customer}</strong>. This will remove all line items for this order. This cannot be undone.
                    </>
                ) : null}
                confirmLabel="Delete sale"
                cancelLabel="Cancel"
                confirming={deleting}
                onConfirm={confirmDelete}
                onCancel={() => !deleting && setPendingDelete(null)}
            />
        </div>
    );
}
