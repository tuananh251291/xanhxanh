import { Card, CardContent } from "@/components/ui/card";

export default function NoPointLinked() {
  return (
    <Card>
      <CardContent className="p-6 text-center text-text-secondary">Tài khoản chưa được gắn với điểm bán nào. Vui lòng liên hệ quản lý.</CardContent>
    </Card>
  );
}
