import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { getWeekTemplate, computeAutoScores } from "@/lib/probation-evaluation";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const evaluation = await prisma.probationEvaluation.findUnique({
    where: { id },
    select: {
      id: true, code: true, weekNumber: true, weekStart: true, weekEnd: true, status: true,
      selfComment: true, selfScoredAt: true, managerComment: true, managerScoredAt: true,
      managerPercent: true, result: true,
      staffId: true, staff: { select: { name: true, code: true, workplaceWarehouseId: true } },
      managerId: true, manager: { select: { name: true, code: true } },
      items: { select: { rowId: true, selfScore: true, managerScore: true } },
    },
  });
  if (!evaluation) return NextResponse.json({ message: "Không tìm thấy đánh giá" }, { status: 404 });

  const isOwner = evaluation.staffId === session.user.id;
  const isKyThuatSameWarehouse = session.user.role === "KY_THUAT" && session.user.workplaceWarehouseId === evaluation.staff.workplaceWarehouseId;
  if (!isOwner && !isKyThuatSameWarehouse && !isAdminRole(session.user.role) && session.user.role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const template = getWeekTemplate(evaluation.weekNumber);
  if (!template) return NextResponse.json({ message: "Không tìm thấy mẫu phiếu tuần này" }, { status: 500 });

  const itemByRowId = new Map(evaluation.items.map((i) => [i.rowId, i]));
  const autoScores = evaluation.status === "COMPLETED" ? {} : await computeAutoScores(evaluation.staffId, template, evaluation.weekStart, evaluation.weekEnd);

  const rows = template.rows.map((row) => {
    const saved = itemByRowId.get(row.id);
    const auto = row.type !== "MANUAL" ? (saved?.selfScore ?? autoScores[row.id] ?? 0) : undefined;
    return {
      id: row.id,
      label: row.label,
      type: row.type,
      selfScore: row.type === "MANUAL" ? (saved?.selfScore ?? null) : auto,
      managerScore: row.type === "MANUAL" ? (saved?.managerScore ?? null) : auto,
    };
  });

  return NextResponse.json({
    id: evaluation.id,
    code: evaluation.code,
    weekNumber: evaluation.weekNumber,
    weekStart: evaluation.weekStart,
    weekEnd: evaluation.weekEnd,
    status: evaluation.status,
    sectionTitle: template.sectionTitle,
    staff: evaluation.staff,
    manager: evaluation.manager,
    selfComment: evaluation.selfComment,
    selfScoredAt: evaluation.selfScoredAt,
    managerComment: evaluation.managerComment,
    managerScoredAt: evaluation.managerScoredAt,
    managerPercent: evaluation.managerPercent,
    result: evaluation.result,
    rows,
  });
}

const patchSchema = z.object({
  action: z.enum(["self", "manager"]),
  items: z.array(z.object({ rowId: z.string(), score: z.number().int().min(0).max(10) })),
  comment: z.string().trim().min(1, "Cần nhập ý kiến/nhận xét"),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const evaluation = await prisma.probationEvaluation.findUnique({
    where: { id },
    select: {
      id: true, code: true, weekNumber: true, weekStart: true, weekEnd: true, status: true,
      staffId: true, staff: { select: { code: true, workplaceWarehouseId: true } },
    },
  });
  if (!evaluation) return NextResponse.json({ message: "Không tìm thấy đánh giá" }, { status: 404 });

  const template = getWeekTemplate(evaluation.weekNumber);
  if (!template) return NextResponse.json({ message: "Không tìm thấy mẫu phiếu tuần này" }, { status: 500 });

  const autoScores = await computeAutoScores(evaluation.staffId, template, evaluation.weekStart, evaluation.weekEnd);
  const submittedByRowId = new Map(parsed.data.items.map((i) => [i.rowId, i.score]));

  if (parsed.data.action === "self") {
    if (evaluation.staffId !== session.user.id) {
      return NextResponse.json({ message: "Bạn không được tự chấm phiếu này" }, { status: 403 });
    }
    if (evaluation.status !== "PENDING_SELF") {
      return NextResponse.json({ message: "Phiếu này đã tự chấm rồi" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const row of template.rows) {
        const score = row.type === "MANUAL" ? (submittedByRowId.get(row.id) ?? 0) : autoScores[row.id];
        await tx.probationEvaluationItem.upsert({
          where: { evaluationId_rowId: { evaluationId: id, rowId: row.id } },
          create: { evaluationId: id, rowId: row.id, selfScore: score },
          update: { selfScore: score },
        });
      }
      await tx.probationEvaluation.update({
        where: { id },
        data: { status: "PENDING_MANAGER", selfComment: parsed.data.comment, selfScoredAt: new Date() },
      });
    });

    if (evaluation.staff.workplaceWarehouseId) {
      const kyThuat = await prisma.user.findFirst({
        where: { role: "KY_THUAT", workplaceWarehouseId: evaluation.staff.workplaceWarehouseId, isActive: true },
        select: { id: true },
      });
      if (kyThuat) {
        await createAlert({
          type: "PROBATION_EVALUATION_MANAGER_DUE",
          title: "Đến lượt chấm điểm đánh giá thử việc",
          message: `NV ${evaluation.staff.code} đã tự chấm xong tuần ${evaluation.weekNumber} — vào "Đánh giá thử việc" để chấm lại (phiếu ${evaluation.code}).`,
          userId: kyThuat.id,
          relatedId: evaluation.id,
          relatedType: "ProbationEvaluation",
        });
      }
    }

    return NextResponse.json({ success: true });
  }

  // action === "manager"
  const isKyThuatSameWarehouse = session.user.role === "KY_THUAT" && session.user.workplaceWarehouseId === evaluation.staff.workplaceWarehouseId;
  if (!isKyThuatSameWarehouse && !isAdminRole(session.user.role)) {
    return NextResponse.json({ message: "Không có quyền chấm phiếu này" }, { status: 403 });
  }
  if (evaluation.status !== "PENDING_MANAGER") {
    return NextResponse.json({ message: "Phiếu này chưa được NV tự chấm, hoặc đã hoàn thành rồi" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    let totalScore = 0;
    for (const row of template.rows) {
      const score = row.type === "MANUAL" ? (submittedByRowId.get(row.id) ?? 0) : autoScores[row.id];
      totalScore += score;
      await tx.probationEvaluationItem.update({
        where: { evaluationId_rowId: { evaluationId: id, rowId: row.id } },
        data: { managerScore: score },
      });
    }
    const percent = Math.round((totalScore / (template.rows.length * 10)) * 1000) / 10;
    const resultLabel = percent < 70 ? "KHONG_DAT" : percent < 90 ? "CAN_CAI_THIEN" : "DAT";
    await tx.probationEvaluation.update({
      where: { id },
      data: {
        status: "COMPLETED",
        managerId: session.user.id,
        managerComment: parsed.data.comment,
        managerScoredAt: new Date(),
        managerPercent: percent,
        result: resultLabel,
      },
    });
    return { percent, resultLabel };
  });

  const resultVnLabel = result.resultLabel === "DAT" ? "Đạt" : result.resultLabel === "CAN_CAI_THIEN" ? "Cần cải thiện" : "Không đạt";
  await createAlert({
    type: "PROBATION_EVALUATION_COMPLETED",
    title: "Đã có kết quả đánh giá thử việc",
    message: `Tuần ${evaluation.weekNumber} (phiếu ${evaluation.code}): ${result.percent}% — ${resultVnLabel}.`,
    userId: evaluation.staffId,
    relatedId: evaluation.id,
    relatedType: "ProbationEvaluation",
  });
  await createAlert({
    type: "PROBATION_EVALUATION_COMPLETED",
    title: "Đã có kết quả đánh giá thử việc",
    message: `NV ${evaluation.staff.code} — tuần ${evaluation.weekNumber} (phiếu ${evaluation.code}): ${result.percent}% — ${resultVnLabel}.`,
    targetRole: "HANH_CHINH_NHAN_SU",
    relatedId: evaluation.id,
    relatedType: "ProbationEvaluation",
  });

  return NextResponse.json({ success: true });
}
