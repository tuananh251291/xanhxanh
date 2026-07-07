import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import PlantCategoryDialog from "./plant-category-dialog";
import PlantTypeDialog from "./plant-type-dialog";
import PlantTypeTable from "./plant-type-table";

export default async function PlantTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/plant-types"))) redirect("/dashboard");

  const categories = await prisma.plantCategory.findMany({ orderBy: { code: "asc" } });
  const plantTypes = await prisma.plantType.findMany({
    orderBy: { code: "asc" },
    include: { category: { select: { id: true, code: true, name: true } } },
  });

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
    </div>
  );
}
