"use client";

import { useEffect, useState } from "react";

// Giỏ hàng của Khách hàng lan — lưu localStorage (chỉ là tiện ích trên máy khách; đơn thật chỉ tạo khi gửi).
const KEY = "orchid-cart";
const EVENT = "orchid-cart-change";

export type Cart = Record<string, number>;

function read(): Cart {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(cart: Cart) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    // trình duyệt chặn storage — giỏ chỉ sống trong phiên hiện tại
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useOrchidCart() {
  const [cart, setCart] = useState<Cart>({});
  useEffect(() => {
    const sync = () => setCart(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return {
    cart,
    setQuantity(productId: string, qty: number) {
      const next = { ...read() };
      if (qty > 0) next[productId] = qty;
      else delete next[productId];
      write(next);
    },
    add(productId: string, qty: number) {
      const next = read();
      next[productId] = (next[productId] ?? 0) + qty;
      write(next);
    },
    clear() {
      write({});
    },
  };
}
