import type { Product, Restock, StockTransfer } from '@/lib/types';
import type { SaleLineRow } from '@/api/sales';

/** Lowercase and strip all whitespace for resilient matching (products and branches). */
export function normalizeKey(s: string | null | undefined): string {
    return (s ?? '').toLowerCase().replace(/\s/g, '');
}

/** Branch bucket key; lines without a usable city are excluded (no Unassigned bucket). */
export function branchKeyFromCity(city: string | null | undefined): string | null {
    const t = (city ?? '').trim();
    if (!t) return null;
    return normalizeKey(t);
}

const dateOnly = (v: string) => new Date(v).toISOString().split('T')[0];

/** Matches transfers page: undone transfers after asOfDate still affect stock as-of that date. */
export function transferActiveAsOf(t: StockTransfer, asOfDate: string): boolean {
    if (!t.is_undone) return true;
    if (!t.undone_at) return true;
    return dateOnly(t.undone_at) > asOfDate;
}

export interface BranchProductStockRow {
    productLabel: string;
    restocked: number;
    sold: number;
    current: number;
    healthPct: number;
}

export interface BranchStockCard {
    branchKey: string;
    branchLabel: string;
    products: BranchProductStockRow[];
    totalCurrent: number;
}

export interface BuildBranchStockResult {
    branchCards: BranchStockCard[];
    /** Sum of branch current inventory per normalized product key (matches Overview Current). */
    sumCurrentByProductKey: Map<string, number>;
}

function catalogLabelForKey(catalogProducts: Product[], normProductKey: string, fallback: string): string {
    const hit = catalogProducts.find(p => normalizeKey(p.name) === normProductKey);
    return hit?.name ?? fallback;
}

/**
 * Per-branch stock: opening + restocked − sold + transferIn − transferOut.
 * Overview current for a SKU = sum of `current` across all branch cards for that SKU.
 */
export function buildBranchStockMap(
    salesData: SaleLineRow[],
    restockData: Restock[],
    transferData: StockTransfer[],
    catalogProducts: Product[]
): BuildBranchStockResult {
    const branchLabels = new Map<string, string>();

    const registerBranch = (raw: string | null | undefined) => {
        const bk = branchKeyFromCity(raw);
        if (!bk) return;
        if (!branchLabels.has(bk)) branchLabels.set(bk, (raw ?? '').trim());
    };

    salesData.forEach(r => registerBranch(r.sales?.city));
    restockData.forEach(r => registerBranch(r.city));
    transferData.forEach(t => {
        registerBranch(t.from_city);
        registerBranch(t.to_city);
    });

    const branchCards: BranchStockCard[] = Array.from(branchLabels.keys()).map(branchKey => {
        const branchLabel = branchLabels.get(branchKey)!;

        const branchSales = salesData.filter(r => branchKeyFromCity(r.sales?.city) === branchKey);
        const branchRestocks = restockData.filter(r => branchKeyFromCity(r.city) === branchKey);

        const normKeys = new Set<string>();
        const firstProductLabel = new Map<string, string>();

        const noteProduct = (raw: string | undefined) => {
            const k = normalizeKey(raw);
            if (!k) return;
            normKeys.add(k);
            if (!firstProductLabel.has(k)) firstProductLabel.set(k, (raw ?? '').trim());
        };

        branchSales.forEach(r => noteProduct(r.product_name));
        branchRestocks.forEach(r => noteProduct(r.product_name));
        transferData.forEach(t => {
            if (t.is_undone) return;
            if (branchKeyFromCity(t.to_city) !== branchKey && branchKeyFromCity(t.from_city) !== branchKey) return;
            (t.items ?? []).forEach(i => noteProduct(i.product_name));
        });

        const products: BranchProductStockRow[] = Array.from(normKeys).map(normProductKey => {
            const prodSales = branchSales.filter(r => normalizeKey(r.product_name) === normProductKey);
            const prodRestocks = branchRestocks.filter(r => normalizeKey(r.product_name) === normProductKey);

            const sold = prodSales.reduce((a, s) => a + s.qty, 0);
            const allRestocked = prodRestocks.reduce((a, r) => a + r.qty, 0);

            const initialEntry = prodRestocks.find(r => r.supplier === 'Initial Stock');
            const opening = initialEntry ? initialEntry.qty : 0;
            const restocked = allRestocked - opening;

            const transferredIn = transferData
                .filter(t => !t.is_undone && branchKeyFromCity(t.to_city) === branchKey)
                .flatMap(t => t.items ?? [])
                .filter(i => normalizeKey(i.product_name) === normProductKey)
                .reduce((a, i) => a + i.qty, 0);

            const transferredOut = transferData
                .filter(t => !t.is_undone && branchKeyFromCity(t.from_city) === branchKey)
                .flatMap(t => t.items ?? [])
                .filter(i => normalizeKey(i.product_name) === normProductKey)
                .reduce((a, i) => a + i.qty, 0);

            const current = opening + restocked - sold + transferredIn - transferredOut;
            const total = opening + restocked;
            const healthPct = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;

            const productLabel = catalogLabelForKey(
                catalogProducts,
                normProductKey,
                firstProductLabel.get(normProductKey) ?? normProductKey
            );

            return {
                productLabel,
                restocked,
                sold,
                current,
                healthPct
            };
        }).filter(p => p.restocked > 0 || p.sold > 0 || p.current > 0);

        const totalCurrent = products.reduce((a, p) => a + p.current, 0);

        return {
            branchKey,
            branchLabel,
            products,
            totalCurrent
        };
    });

    branchCards.sort((a, b) => b.totalCurrent - a.totalCurrent);

    const sumCurrentByProductKey = new Map<string, number>();
    for (const card of branchCards) {
        for (const row of card.products) {
            const pk = normalizeKey(row.productLabel);
            sumCurrentByProductKey.set(pk, (sumCurrentByProductKey.get(pk) ?? 0) + row.current);
        }
    }

    return { branchCards, sumCurrentByProductKey };
}

/**
 * Branch quantity available as-of a calendar date (restocks/sales/transfers on or before that date).
 * Aligns with {@link buildBranchStockMap} but date-scoped for transfer validation.
 */
export function getBranchAvailableAsOf(
    sales: SaleLineRow[],
    restocks: Restock[],
    transfers: StockTransfer[],
    productName: string,
    branchName: string,
    asOfDate: string
): number {
    const pk = normalizeKey(productName);
    const bk = branchKeyFromCity(branchName);
    if (!bk) return 0;

    const opening = restocks
        .filter(
            r =>
                branchKeyFromCity(r.city) === bk &&
                normalizeKey(r.product_name) === pk &&
                r.supplier === 'Initial Stock' &&
                r.date <= asOfDate
        )
        .reduce((sum, r) => sum + Number(r.qty || 0), 0);

    const restocked = restocks
        .filter(
            r =>
                branchKeyFromCity(r.city) === bk &&
                normalizeKey(r.product_name) === pk &&
                r.supplier !== 'Initial Stock' &&
                r.date <= asOfDate
        )
        .reduce((sum, r) => sum + Number(r.qty || 0), 0);

    const sold = sales
        .filter(
            s =>
                normalizeKey(s.product_name) === pk &&
                branchKeyFromCity(s.sales?.city) === bk &&
                !s.sales?.is_deleted &&
                Boolean(s.sales?.date) &&
                (s.sales?.date || '') <= asOfDate
        )
        .reduce((sum, s) => sum + Number(s.qty || 0), 0);

    const transferredIn = transfers
        .filter(t => branchKeyFromCity(t.to_city) === bk && t.date <= asOfDate && transferActiveAsOf(t, asOfDate))
        .flatMap(t => t.items || [])
        .filter(i => normalizeKey(i.product_name) === pk)
        .reduce((sum, i) => sum + Number(i.qty || 0), 0);

    const transferredOut = transfers
        .filter(t => branchKeyFromCity(t.from_city) === bk && t.date <= asOfDate && transferActiveAsOf(t, asOfDate))
        .flatMap(t => t.items || [])
        .filter(i => normalizeKey(i.product_name) === pk)
        .reduce((sum, i) => sum + Number(i.qty || 0), 0);

    return Math.max(0, opening + restocked - sold + transferredIn - transferredOut);
}
