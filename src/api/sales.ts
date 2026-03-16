import { Sale, SaleItem, Restock } from '../lib/types';
import { apiClient } from './client';

export interface SaleLineRow {
    id: string;
    sale_id: string;
    product_name: string;
    qty: number;
    unit_price: number;
    disc_label: string;
    disc_pct: number;
    disc_amt: number;
    final_price: number;
    created_at: string;
    sales: Sale;
}

export async function getSales() {
    const { data } = await apiClient.get<SaleLineRow[]>('/sales');
    return data;
}

export async function getDeletedSales() {
    const { data } = await apiClient.get<Sale[]>('/sales/deleted');
    return data;
}

export interface CreateSalePayload {
    header: Omit<Sale, 'id' | 'is_deleted' | 'deleted_at' | 'deleted_by' | 'created_at'>;
    items: Omit<SaleItem, 'id' | 'sale_id' | 'created_at'>[];
}

export async function addSale(payload: CreateSalePayload) {
    const { data } = await apiClient.post<{ sale: Sale; items: SaleItem[] }>('/sales', payload);
    return data;
}

export async function softDeleteSale(id: string, userName: string) {
    await apiClient.delete(`/sales/${id}`);
}

export async function clearDeletedSales() {
    await apiClient.delete('/sales/permanent/deleted');
}

export async function getRestocks() {
    const { data } = await apiClient.get<Restock[]>('/sales/restocks');
    return data;
}

export async function addRestock(restock: Omit<Restock, 'id' | 'created_at'>) {
    const { data } = await apiClient.post<Restock>('/sales/restocks', restock);
    return data;
}

export async function deleteRestock(id: string) {
    await apiClient.delete(`/sales/restocks/${id}`);
}
