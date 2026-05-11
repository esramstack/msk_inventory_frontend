import { StockTransfer, StockTransferItem } from '../lib/types';
import { apiClient } from './client';

export async function getTransfers() {
    const { data } = await apiClient.get<StockTransfer[]>('/transfers');
    return data;
}

export async function addTransfer(
    transferData: Omit<StockTransfer, 'id' | 'created_at' | 'items' | 'is_undone' | 'undone_by' | 'undone_at'>,
    items: Omit<StockTransferItem, 'id' | 'transfer_id' | 'created_at'>[]
) {
    const { data } = await apiClient.post<StockTransfer>('/transfers', { transferData, items });
    return data;
}

export async function undoTransfer(id: string) {
    const { data } = await apiClient.put<{ success: boolean }>(`/transfers/${id}/undo`);
    return data;
}
