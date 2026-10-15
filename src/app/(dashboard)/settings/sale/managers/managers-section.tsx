"use client";

import { useState } from "react";
import ManagersBoard from "./managers-board";
import ManagersImportPanel from "./managers-import-panel";

// Gói bảng phân công + phần nhập Excel — áp xong file (Admin cấp cao tải lên / duyệt) thì dựng lại bảng để tải lại.
export default function ManagersSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [boardKey, setBoardKey] = useState(0);
  return (
    <div className="space-y-4">
      <ManagersImportPanel isSuperAdmin={isSuperAdmin} onApplied={() => setBoardKey((k) => k + 1)} />
      <ManagersBoard key={boardKey} />
    </div>
  );
}
