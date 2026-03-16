export type Role = 'admin' | 'manager';

export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    password?: string;
    created_at?: string;
}

export interface Product {
    id?: string;
    name: string;
    price: number;
    reorder_level: number;
    created_at?: string;
}

export interface ConfigList {
    id?: string;
    type: 'channel' | 'city' | 'platform' | 'discount';
    value: string;
    pct?: number | null;
    created_at?: string;
}

export interface Restock {
    id?: string;
    date: string;
    product_name: string;
    qty: number;
    city?: string;
    supplier: string;
    notes: string;
    created_at?: string;
}

export interface Sale {
    id?: string;
    date: string;
    ref: string;
    channel: string;
    sale_type: string;
    city: string;
    platform: string;
    customer: string;
    payment_type?: string;
    status: 'Paid' | 'Pending' | 'Free';
    notes: string;
    is_deleted: boolean;
    deleted_at?: string;
    deleted_by?: string;
    created_at?: string;
}

export interface SaleItem {
    id?: string;
    sale_id: string;
    product_name: string;
    qty: number;
    unit_price: number;
    disc_label: string;
    disc_pct: number;
    disc_amt: number;
    final_price: number;
    created_at?: string;
}

export interface QuoteItem {
    id?: string;
    quote_id?: string;
    product_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
}

export interface Quote {
    id?: string;
    ref: string;
    date: string;
    valid_until?: string;
    client: string;
    contact?: string;
    address?: string;
    city?: string;
    subtotal: number;
    disc_pct: number;
    disc_amt: number;
    total: number;
    status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
    notes?: string;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
    items?: QuoteItem[];
}

export interface ActivityLog {
    id?: string;
    type: 'add' | 'del' | 'edit' | 'auth' | 'pw';
    user_name: string;
    role: string;
    message: string;
    created_at?: string;
}
