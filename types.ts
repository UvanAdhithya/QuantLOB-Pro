
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum OrderStatus {
  ACTIVE = 'ACTIVE',
  FILLED = 'FILLED',
  PARTIAL = 'PARTIAL',
  CANCELLED = 'CANCELLED'
}

export interface Order {
  id: string;
  side: OrderSide;
  price: number;
  originalQty: number;
  remainingQty: number;
  timestamp: number;
  status: OrderStatus;
}

export interface Level {
  price: number;
  quantity: number;
  orderCount: number;
  cumulativeQty?: number;
}

export interface Trade {
  id: string;
  timestamp: number;
  price: number;
  quantity: number;
  aggressorSide: OrderSide;
}

export interface MarketState {
  bids: Level[];
  asks: Level[];
  trades: Trade[];
  activeOrders: Order[];
  completedOrders: Order[];
  cancelledOrders: Order[];
  lastPrice: number;
  timestamp: number;
}

export enum AppMode {
  LIVE = 'LIVE',
  REPLAY = 'REPLAY'
}

export enum EventType {
  ORDER_ADDED = 'ORDER_ADDED',
  ORDER_MATCHED = 'ORDER_MATCHED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  TRADE_EXECUTED = 'TRADE_EXECUTED',
  BOOK_SNAPSHOT = 'BOOK_SNAPSHOT'
}

export interface MarketEvent {
  type: EventType;
  timestamp: number;
  data: any;
}
