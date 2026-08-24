"use client";

import { UploadCloud, Users, Layers, Sprout, ClipboardList, Send, Leaf, PenLine, Handshake } from "lucide-react";
import ExcelImportCard from "@/components/shared/excel-import-card";

export default function DataImportBoard() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <UploadCloud className="w-6 h-6 text-primary" /> Nhập liệu trực tiếp
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tải mẫu Excel, điền dữ liệu thực tế (kể cả dữ liệu đang dở dang giữa tuần: chỉ định cấy đang
          thực hiện, phiếu bàn giao chưa xác nhận...) rồi tải lên — hệ thống kiểm tra toàn bộ file
          trước khi ghi, không để dữ liệu nửa vời nếu có dòng lỗi. Mỗi lượt tải lên chỉ THÊM dữ liệu
          mới, không xoá/thay thế dữ liệu đã có trong hệ thống. Nên nhập theo đúng thứ tự bên dưới vì
          các mục sau tham chiếu tới dữ liệu của mục trước.
        </p>
      </div>

      <ExcelImportCard
        icon={<Users className="w-5 h-5" />}
        title="1. Người dùng hàng loạt"
        description="Tạo nhiều tài khoản nhân viên cùng lúc — làm trước nếu các mục bên dưới cần gán mã NV phụ trách."
        templateUrl="/api/data-import/users"
        uploadUrl="/api/data-import/users"
        successLabel={(n) => `Đã tạo ${n} người dùng`}
      />

      <ExcelImportCard
        icon={<Leaf className="w-5 h-5" />}
        title="2. Loại cây mới"
        description="Khai báo mã cây (Loại cây cha + chi tiết) chưa có trong hệ thống — khu sản xuất mới thường trồng thêm mã cây mới, mọi mục bên dưới đều cần chọn mã cây đã tồn tại."
        templateUrl="/api/data-import/plant-types"
        uploadUrl="/api/data-import/plant-types"
        successLabel={(n) => `Đã tạo ${n} mã cây`}
      />

      <ExcelImportCard
        icon={<Layers className="w-5 h-5" />}
        title="3. Nhóm giàn kệ"
        description="Tạo Nhóm giàn kệ / khe trong lịch xoay vòng Nhóm tuần mẫu mẹ, ra rễ — làm trước mục Giàn kệ mới nếu khu sản xuất mới đã có sẵn cách chia nhóm tuần riêng ngoài đời."
        templateUrl="/api/data-import/shelf-groups"
        uploadUrl="/api/data-import/shelf-groups"
        successLabel={(n) => `Đã tạo ${n} nhóm giàn kệ`}
      />

      <ExcelImportCard
        icon={<Layers className="w-5 h-5" />}
        title="4. Giàn kệ mới"
        description={'Tạo hàng loạt kệ mới cho 1 hoặc nhiều kho/phòng cùng lúc — mỗi dòng tự khai Mã kho sản xuất → Loại phòng (Phòng mẫu mẹ/Phòng ra rễ) → Phân loại kệ mẫu mẹ (Kho mẫu mẹ chung/đã chia), có thể gán mã cây/mã NV/nhóm tuần/số lượng ban đầu ngay lúc tạo. Khác trang "Kho & Kệ" (chỉ sửa kệ đã có).'}
        templateUrl="/api/data-import/shelves"
        uploadUrl="/api/data-import/shelves"
        successLabel={(n) => `Đã tạo ${n} kệ mới`}
      />

      <ExcelImportCard
        icon={<Sprout className="w-5 h-5" />}
        title="5. Lô tồn kho hiện có"
        description={'Nhập lô mẫu mẹ/ra rễ đang trên kệ hoặc lô thành phẩm đang trong kho — nền tảng bắt buộc để Chỉ định cấy và Phiếu bàn giao bên dưới có lô để tham chiếu. CẬP NHẬT THAY THẾ: chỉ đúng combo (vị trí + mã cây + quy cách) có dòng khai trong file mới bị ghi đè số lượng (để trống ô = 0). Vị trí/combo không xuất hiện trong file thì giữ nguyên số lượng cũ, không đụng tới.'}
        templateUrl="/api/data-import/lots"
        uploadUrl="/api/data-import/lots"
        successLabel={(n) => `Đã cập nhật ${n} lô`}
      />

      <ExcelImportCard
        icon={<ClipboardList className="w-5 h-5" />}
        title="6. Chỉ định cấy đang hoạt động"
        description="Nhập các chỉ định cấy đang thực hiện dở ngoài đời — mỗi dòng là 1 chỉ định với 1 quy cách nguồn (M05) duy nhất, cần đã có lô nguồn (mục 5) trên kệ. Chỉ định &quot;Đang thực hiện&quot; có thể kèm luôn dữ liệu cấy hàng ngày (thêm dòng cùng Mã chỉ định để nhập nhiều ngày) thay vì phải dùng riêng mục 7."
        templateUrl="/api/data-import/instructions"
        uploadUrl="/api/data-import/instructions"
        successLabel={(n) => `Đã tạo ${n} chỉ định cấy`}
      />

      <ExcelImportCard
        icon={<PenLine className="w-5 h-5" />}
        title="7. Cập nhật dữ liệu cấy"
        description="Bù dữ liệu cấy hàng ngày (nhật ký cấy) cho chỉ định đang thực hiện — mỗi dòng là 1 ngày của 1 chỉ định, tự tạo lô vào Phòng tối của NV phụ trách. Cần chỉ định đã có ở mục 6."
        templateUrl="/api/data-import/daily-records"
        uploadUrl="/api/data-import/daily-records"
        successLabel={(n) => `Đã nhập dữ liệu cho ${n} ngày`}
      />

      <ExcelImportCard
        icon={<Send className="w-5 h-5" />}
        title="8. Phiếu bàn giao đang treo"
        description="Nhập các phiếu bàn giao đang chờ xác nhận (PENDING) ngoài đời — cần lô nguồn đã có trong hệ thống (mục 5)."
        templateUrl="/api/data-import/transfers"
        uploadUrl="/api/data-import/transfers"
        successLabel={(n) => `Đã nhập ${n} lô vào phiếu bàn giao`}
      />

      <ExcelImportCard
        icon={<Handshake className="w-5 h-5" />}
        title="9. Danh sách khách hàng"
        description={'Nhập/cập nhật danh sách khách hàng (CRM Sale) — chỉ 4 cột Tên công ty/Website/Thị trường/Trạng thái bắt buộc. CẬP NHẬT THAY THẾ theo Website: khớp Website đã có thì ghi đè, chưa có thì tạo mới. Mã NV phụ trách cần đã có trong hệ thống (mục 1) và Mã thị trường cần tạo sẵn ở Cài đặt chung hệ thống CSDL → Thị trường trước. Có thể điền thêm Mã NV quản lý để tự gán/cập nhật luôn người quản lý cho từng NV phụ trách theo thị trường (thay cho vào tay ở Cài đặt chung hệ thống CSDL → NV quản lý).'}
        templateUrl="/api/data-import/customers"
        uploadUrl="/api/data-import/customers"
        successLabel={(n) => `Đã nhập/cập nhật ${n} khách hàng`}
      />
    </div>
  );
}
