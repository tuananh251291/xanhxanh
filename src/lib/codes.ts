import { prisma } from "@/lib/prisma";

export async function generateInstructionCode(): Promise<string> {
  const today = new Date();
  const prefix = `CI-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.plantingInstruction.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function generateTransferCode(): Promise<string> {
  const today = new Date();
  const prefix = `BG-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.transfer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function generateLotCode(stage: "MAU_ME" | "THANH_PHAM"): Promise<string> {
  const prefix = stage === "MAU_ME" ? "MM" : "TP";
  const today = new Date();
  const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const fullPrefix = `${prefix}-${datePart}`;
  const last = await prisma.lot.findFirst({
    where: { code: { startsWith: fullPrefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${fullPrefix}-${String(seq).padStart(4, "0")}`;
}

export async function generateOrderCode(): Promise<string> {
  const today = new Date();
  const prefix = `DH-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.order.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}
