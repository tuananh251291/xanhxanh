import { Card, CardContent } from "@/components/ui/card";

export default function NoCustomerLinked() {
  return (
    <Card>
      <CardContent className="p-6 text-center text-text-secondary">
        Tài khoản của bạn chưa được gắn với hồ sơ khách hàng. Vui lòng liên hệ nhân viên phụ trách.
      </CardContent>
    </Card>
  );
}
