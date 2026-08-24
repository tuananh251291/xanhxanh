// Suy ra tiến độ sắp xếp/đóng gói của 1 đơn CONFIRMED từ pickedQuantity1-3 trên từng OrderItem (xem
// order-pick-table.tsx) — không có cột trạng thái riêng trong DB, dùng chung cho /orders/pack và
// /orders/list (mục "Đơn đã xác nhận").
export type OrderPackStatus = {
  label: string;
  variant: "completed" | "in-progress" | "info" | "outline";
};

export function getOrderPackStatus(order: {
  assignedTo: unknown;
  items: { quantity: number; pickedQuantity1: number; pickedQuantity2: number; pickedQuantity3: number }[];
}): OrderPackStatus {
  const fullyPicked = order.items.length > 0 && order.items.every(
    (i) => i.pickedQuantity1 + i.pickedQuantity2 + i.pickedQuantity3 >= i.quantity
  );
  const anyPicked = order.items.some((i) => i.pickedQuantity1 + i.pickedQuantity2 + i.pickedQuantity3 > 0);

  if (fullyPicked) return { label: "Đã sắp xếp xong", variant: "completed" };
  if (anyPicked) return { label: "Đang sắp xếp", variant: "in-progress" };
  if (order.assignedTo) return { label: "Đã phân công", variant: "info" };
  return { label: "Chưa phân công", variant: "outline" };
}
