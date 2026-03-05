'use client';

import { useEffect, useState } from 'react';
import { getSales, softDeleteSale } from '@/api/sales';
import { Sale } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function SalesLog() {
    const { user } = useAuth();
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [pendingDelete, setPendingDelete] = useState<Sale | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadData = async () => {
        try {
            const data = await getSales();
            setSales(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const isAdmin = user?.role === 'admin';

    const handleDelete = (sale: Sale) => {
        if (!user || !isAdmin) return;
        setPendingDelete(sale);
    };

    const confirmDelete = async () => {
        if (!user || !pendingDelete) return;
        setDeleting(true);
        try {
            await softDeleteSale(pendingDelete.id!, user.name);
            await loadData(); // Reload
            setPendingDelete(null);
        } catch (e) {
            console.error(e);
            alert('Failed to delete sale');
        } finally {
            setDeleting(false);
        }
    };

    const filteredSales = sales.filter(s => {
        const matchesSearch = (s.product_name + s.channel + s.customer + s.ref + s.city + s.notes)
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesStatus = !statusFilter || s.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const pkr = (v: number) => 'PKR ' + Number(Math.round(v)).toLocaleString();
    const statusBadge = (s: string) => {
        const map: any = { Paid: 'bg-[rgba(30,138,94,0.1)] text-[#1e8a5e]', Pending: 'bg-[rgba(192,112,16,0.1)] text-[#c07010]', Free: 'bg-[rgba(37,99,235,0.1)] text-[#2563eb]' };
        const cls = map[s] || 'bg-[rgba(139,147,168,0.1)] text-[#5a6175]';
        return <span className={`inline-flex items-center px-[9px] py-[3px] rounded-full text-[11.5px] font-semibold ${cls}`}>{s}</span>;
    };

    // --- Export Logic ---
    const exportCSV = () => {
        const headers = ["Date", "Ref", "Product", "Qty", "Channel", "Customer", "Branch", "Payment", "Total", "Discount", "Final", "Status", "Notes"];
        const rows = filteredSales.map(s => [
            s.date,
            s.ref,
            s.product_name,
            s.qty,
            s.channel,
            s.customer || '',
            s.city || '',
            s.payment_type || '',
            (s.unit_price * s.qty).toFixed(0),
            s.disc_label || '0%',
            s.final_price.toFixed(0),
            s.status,
            s.notes || ''
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
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Export CSV
                    </button>
                    <button className="btn-export" onClick={exportPDF}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                        Export PDF
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="search-row">
                    <input
                        type="text"
                        placeholder="Search by ref, product, customer…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">All statuses</option>
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Free">Free / Gift</option>
                    </select>
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
                            {filteredSales.map(s => (
                                <tr key={s.id}>
                                    <td className="mono">{s.date}</td>
                                    <td className="mono">{s.ref}</td>
                                    <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                                    <td>{s.qty}</td>
                                    <td><span className="badge b-gray" style={{ fontSize: '11px' }}>{s.channel}</span></td>
                                    <td className="muted">{s.customer || '—'}</td>
                                    <td className="muted">{s.city || '—'}</td>
                                    <td className="muted">{s.payment_type || '—'}</td>
                                    <td className="mono">{pkr(s.unit_price * s.qty)}</td>
                                    <td className="mono" style={{ color: 'var(--amber)' }}>{s.disc_label || '0%'}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--gold)', fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace" }}>{pkr(s.final_price)}</td>
                                    <td>{statusBadge(s.status)}</td>
                                    <td className="muted">{s.notes || '—'}</td>
                                    <td className="no-export">
                                        {isAdmin && (
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}>✕</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredSales.length === 0 && (
                                <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--text3)', padding: '32px' }}>No sales found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmDialog
                open={!!pendingDelete}
                title="Delete sale"
                message={pendingDelete ? (
                    <>
                        You are about to delete sale <strong>{pendingDelete.ref}</strong> for{' '}
                        <strong>{pendingDelete.product_name}</strong> ({pendingDelete.qty} units,{' '}
                        PKR {pendingDelete.final_price.toLocaleString()}). This cannot be undone.
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
