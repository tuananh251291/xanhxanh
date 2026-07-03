import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import PlantCategoryDialog from "./plant-category-dialog";
import PlantCategoryList from "./plant-category-list";

export default async function PlantTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/plant-types"))) redirect("/dashboard");

  const categories = await prisma.plantCategory.findMany({
    orderBy: { code: "asc" },
    include: { plantTypes: { orderBy: { seq: "asc" } } },
  });
  const totalPlantTypes = categories.reduce((s, c) => s + c.plantTypes.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý loại cây</h1>
          <p className="text-gray-500 text-sm mt-1">
            {categories.length} loại cây · {totalPlantTypes} chi tiết loại cây — mã cây đầy đủ = mã loại cây + số thứ tự (VD: MT001)
          </p>
        </div>
        <PlantCategoryDialog />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Chưa có loại cây nào — bấm &quot;Thêm loại cây&quot; để bắt đầu</p>
      ) : (
        <PlantCategoryList categories={categories} />
      )}
    </div>
  );
}
