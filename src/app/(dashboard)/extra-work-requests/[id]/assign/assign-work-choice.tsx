"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, PackageOpen, ArrowLeft, ArrowRight, Send } from "lucide-react";
import SealingTaskForm from "./sealing-task-form";

type Choice = "instruction" | "hantui";

export default function AssignWorkChoice({
  requestId,
  staffName,
  staffCode,
  requestType,
  instructionCode,
}: {
  requestId: string;
  staffName: string;
  staffCode: string;
  requestType: "EARLY_COMPLETION" | "OVERTIME";
  instructionCode: string | null;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Giao việc
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {staffName} <span className="font-mono text-xs">({staffCode})</span> —{" "}
          {requestType === "EARLY_COMPLETION"
            ? `đã hoàn thành sớm${instructionCode ? ` chỉ định ${instructionCode}` : ""}, sẵn sàng nhận thêm việc`
            : "đã đăng ký làm thêm ngoài giờ"}
        </p>
      </div>

      {choice === null && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setChoice("instruction")}>
            <CardContent className="py-8 flex flex-col items-center text-center gap-3">
              <ClipboardList className="w-8 h-8 text-primary-strong" />
              <div>
                <p className="font-bold text-foreground">Giao thêm chỉ định cấy</p>
                <p className="text-sm text-text-secondary mt-1">Chỉ định cấy dự phòng hoặc chỉ định cấy xử lý chưa gán NV</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setChoice("hantui")}>
            <CardContent className="py-8 flex flex-col items-center text-center gap-3">
              <PackageOpen className="w-8 h-8 text-primary-strong" />
              <div>
                <p className="font-bold text-foreground">Giao việc hàn túi</p>
                <p className="text-sm text-text-secondary mt-1">Hỗ trợ Kho thành phẩm hàn/đóng gói lại túi sản phẩm</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {choice === "instruction" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setChoice(null)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Quay lại
          </Button>
          <p className="text-sm text-text-secondary">
            Vào 1 trong 2 trang bên dưới, tìm đúng {staffName} trong danh sách &quot;NV đã đăng ký&quot; ở dòng chỉ định muốn giao và bấm Bàn giao.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="py-6 flex flex-col items-center text-center gap-3">
                <ClipboardList className="w-7 h-7 text-primary-strong" />
                <p className="font-medium text-foreground">Chỉ định cấy dự phòng</p>
                <Link href="/instructions" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline">
                  Mở trang Chỉ định cấy <ArrowRight className="w-4 h-4" />
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-6 flex flex-col items-center text-center gap-3">
                <ClipboardList className="w-7 h-7 text-primary-strong" />
                <p className="font-medium text-foreground">Chỉ định cấy xử lý</p>
                <Link href="/instruction-quantity-edit" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline">
                  Mở trang Chỉ định cấy <ArrowRight className="w-4 h-4" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {choice === "hantui" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setChoice(null)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Quay lại
          </Button>
          <SealingTaskForm requestId={requestId} />
        </div>
      )}
    </div>
  );
}
