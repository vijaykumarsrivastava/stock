export type TxType = 'BUY' | 'SELL';

export interface User {
  id: string;
  /** Name as typed, for display. */
  name: string;
  /** Normalized name used to detect duplicates. */
  nameKey: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  /** Owner of this transaction. */
  userId: string;
  type: TxType;
  /** Normalized name used for matching. */
  stockKey: string;
  /** Name as the user typed it, used for display. */
  stockName: string;
  /** Positive integer. */
  quantity: number;
  /** Rupees per share, greater than zero. */
  price: number;
  /** ISO date yyyy-mm-dd. */
  date: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** The part of a SELL matched to one BUY lot. */
export interface Allocation {
  id: string;
  sellId: string;
  lotId: string;
  quantity: number;
}

/** A BUY transaction with derived remaining quantity. */
export interface Lot {
  id: string;
  stockKey: string;
  stockName: string;
  date: string;
  price: number;
  quantity: number;
  remaining: number;
  createdAt: string;
}

export interface Holding {
  stockKey: string;
  stockName: string;
  totalQuantity: number;
  averagePrice: number;
}

export interface AllocationInput {
  lotId: string;
  quantity: number;
}

export interface TradeInput {
  type: TxType;
  stockName: string;
  quantity: number;
  price: number;
  date: string;
}

export type LotSortColumn = 'date' | 'price' | 'quantity' | 'remaining';
export type SortDirection = 'asc' | 'desc';
