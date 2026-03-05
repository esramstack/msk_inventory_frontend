import { Sale, Restock } from '../lib/types';
import { apiClient } from './client';

export async function getSales() {
    const { data } = await apiClient.get<Sale[]>('/sales');
    return data;
}

export async function getDeletedSales() {
    const { data } = await apiClient.get<Sale[]>('/sales/deleted');
    return data;
}

export async function addSale(sale: Omit<Sale, 'id' | 'created_at' | 'is_deleted' | 'deleted_at' | 'deleted_by'>) {
    const { data } = await apiClient.post<Sale>('/sales', sale);
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
