import { Prisma } from "@prisma/client";

// Postgres huỷ 1 trong 2 transaction Serializable đụng nhau bằng lỗi write conflict — Prisma bọc lại
// thành PrismaClientKnownRequestError mã P2034 ("Transaction failed due to a write conflict...").
// Dùng chung cho mọi route có $transaction mức cô lập Serializable (xem transfers/route.ts, orders/route.ts).
export function isSerializationFailure(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
}
