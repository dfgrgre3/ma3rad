export type ConflictPolicy = 'DETECT' | 'SOURCE_WINS' | 'MANUAL' | 'APPEND_ONLY' | 'TOMBSTONE';

export class ConflictResolver {
  policyFor(entityType: string): ConflictPolicy {
    const map: Record<string, ConflictPolicy> = {
      product: 'DETECT',
      price_list: 'SOURCE_WINS',
      customer: 'DETECT',
      supplier: 'DETECT',
      sales_invoice: 'APPEND_ONLY',
      sales_return: 'APPEND_ONLY',
      purchase_invoice: 'APPEND_ONLY',
      purchase_return: 'APPEND_ONLY',
      payment: 'APPEND_ONLY',
      inventory_transaction: 'APPEND_ONLY',
      stock_transfer: 'APPEND_ONLY',
      accounting_entry: 'APPEND_ONLY',
      settings: 'SOURCE_WINS',
    };
    return map[entityType] || 'DETECT';
  }
  detectConcurrentEdit(localVersion: number, incomingVersion: number): boolean {
    return localVersion !== incomingVersion && incomingVersion > 0;
  }
  resolveVersion(local: number, incoming: number): number {
    return Math.max(local, incoming) + 1;
  }
}
