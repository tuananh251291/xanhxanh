import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import PlantCategoryDialog from "./plant-category-dialog";
import PlantTypeDialog from "./plant-type-dialog";
import PlantTypeTable from "./plant-type-table";
import PlantVariantGroupDialog from "./plant-variant-group-dialog";
import PlantVariantGroupDeleteButton from "./plant-variant-group-delete-button";

export default async function PlantTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/plant-types"))) redirect("/dashboard");

  const categories = await prisma.plantCategory.findMany({ orderBy: { code: "asc" } });
  const plantTypes = await prisma.plantType.findMany({
    orderBy: { code: "asc" },
    include: { category: { select: { id: true, code: true, name: true } } },
  });
  const variantGroups = await prisma.plantVariantGroup.findMany({
    orderBy: { createdAt: "asc" },
    include: { members: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } } },
  });
  const otherGroupedIds = new Set(plantTypes.filter((p) => p.variantGroupId).map((p) => p.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý loại cây</h1>
          <p className="text-text-secondary text-sm mt-1">
            {categories.length} loại cây · {plantTypes.length} chi tiết loại cây — mã cây đầy đủ = mã loại cây + số thứ tự (VD: MT001)
          </p>
        </div>
        <PlantTypeDialog categories={categories} existingCodes={plantTypes.map((p) => p.code)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <div key={c.id} className="inline-flex items-center gap-1 border rounded-full pl-3 pr-1 py-1 text-sm bg-white">
            <span className="font-mono font-bold text-primary-strong">{c.code}</span>
            <span className="text-foreground">{c.name}</span>
            <PlantCategoryDialog category={c} />
          </div>
        ))}
        <PlantCategoryDialog />
      </div>

      {plantTypes.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-12">Chưa có chi tiết loại cây nào — bấm &quot;Thêm chi tiết loại cây&quot; để bắt đầu</p>
      ) : (
        <PlantTypeTable plantTypes={plantTypes} categories={categories} />
      )}

      <div className="border-t pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Nhóm biến thể (đột biến)</h2>
            <p className="text-text-secondary text-sm mt-1">
              Chỉ định cấy dùng mã cây thuộc 1 nhóm bên dưới sẽ có thêm lựa chọn &quot;Phát sinh cây cần phân loại&quot; lúc nhập dữ liệu cấy —
              mỗi mã cây chỉ thuộc đúng 1 nhóm.
            </p>
          </div>
          <PlantVariantGroupDialog allPlantTypes={plantTypes} otherGroupedIds={otherGroupedIds} />
        </div>

        {variantGroups.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Chưa có nhóm biến thể nào</p>
        ) : (
          <div className="space-y-2">
            {variantGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
                <div>
                  <p className="font-medium text-foreground">{g.name}</p>
                  <p className="text-sm text-text-secondary font-mono">{g.members.map((m) => m.code).join(", ")}</p>
                </div>
                <div className="flex items-center gap-1">
                  <PlantVariantGroupDialog
                    allPlantTypes={plantTypes}
                    group={g}
                    otherGroupedIds={new Set(Array.from(otherGroupedIds).filter((id) => !g.members.some((m) => m.id === id)))}
                  />
                  <PlantVariantGroupDeleteButton id={g.id} name={g.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
