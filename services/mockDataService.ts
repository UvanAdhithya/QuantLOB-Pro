
import { EventType, OrderSide, OrderStatus, MarketEvent } from '../types';

export const generateRandomId = () => Math.random().toString(36).substr(2, 9);

let basePrice = 45000;
let lastTimestamp = Date.now();

export const createOrderEvent = (side?: OrderSide, priceShift?: number): MarketEvent => {
  const sideValue = side || (Math.random() > 0.5 ? OrderSide.BUY : OrderSide.SELL);
  const spread = 2.0;
  const currentPrice = basePrice + (Math.random() * 20 - 10);
  basePrice = currentPrice;

  const price = sideValue === OrderSide.BUY 
    ? Math.floor(currentPrice - (Math.random() * 5 + spread/2)) 
    : Math.ceil(currentPrice + (Math.random() * 5 + spread/2));

  lastTimestamp += Math.floor(Math.random() * 500) + 100;

  return {
    type: EventType.ORDER_ADDED,
    timestamp: lastTimestamp,
    data: {
      id: generateRandomId(),
      side: sideValue,
      price,
      quantity: Math.floor(Math.random() * 10) + 1,
      status: OrderStatus.ACTIVE
    }
  };
};

export const createMatchEvent = (price: number, qty: number, side: OrderSide): MarketEvent => {
  lastTimestamp += 10;
  return {
    type: EventType.ORDER_MATCHED,
    timestamp: lastTimestamp,
    data: {
      price,
      quantity: qty,
      side,
      tradeId: generateRandomId()
    }
  };
};

export const createCancelEvent = (orderId: string): MarketEvent => {
  lastTimestamp += 50;
  return {
    type: EventType.ORDER_CANCELLED,
    timestamp: lastTimestamp,
    data: { orderId }
  };
};

// Generates a seed of historical events
export const generateHistory = (count: number): MarketEvent[] => {
  const history: MarketEvent[] = [];
  for (let i = 0; i < count; i++) {
    history.push(createOrderEvent());
  }
  return history.sort((a, b) => a.timestamp - b.timestamp);
};
