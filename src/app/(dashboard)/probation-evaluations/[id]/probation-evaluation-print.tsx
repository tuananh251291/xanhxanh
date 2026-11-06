import { format } from "date-fns";
import type { Evaluation } from "./probation-evaluation-form";
import "./print-evaluation.css";

const RESULT_LABEL: Record<string, string> = { DAT: "Đạt", CAN_CAI_THIEN: "Cần cải thiện", KHONG_DAT: "Không đạt" };
const dmy = (d: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "—");

// Phiếu in của 1 đợt đánh giá đã hoàn thành — chỉ hiện khi in (xem print-evaluation.css).
export default function ProbationEvaluationPrint({ data }: { data: Evaluation }) {
  const selfTotal = data.rows.reduce((s, r) => s + (r.selfScore ?? 0), 0);
  const managerTotal = data.rows.reduce((s, r) => s + (r.managerScore ?? 0), 0);

  return (
    <div className="pe-sheet">
      <header className="pe-header">
        <h1 className="pe-title">PHIẾU ĐÁNH GIÁ THỬ VIỆC</h1>
        <p className="pe-subtitle">Tuần {data.weekNumber} — {data.sectionTitle}</p>
      </header>

      <div className="pe-info">
        <span>Nhân viên: <b>{data.staff.name}</b></span>
        <span>Mã nhân viên: <b>{data.staff.code}</b></span>
        <span>Thời gian: <b>{dmy(data.weekStart)} – {dmy(data.weekEnd)}</b></span>
        <span>Mã phiếu: <b>{data.code}</b></span>
        <span>Người chấm: <b>{data.manager?.name ?? "—"}{data.manager ? ` (${data.manager.code})` : ""}</b></span>
        <span>Ngày chấm: <b>{dmy(data.managerScoredAt)}</b></span>
      </div>

      <table className="pe-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Nội dung đánh giá</th>
            <th className="pe-num">NV tự chấm</th>
            <th className="pe-num">NV kỹ thuật chấm</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.label}</td>
              <td className="pe-num">{row.selfScore ?? "—"}</td>
              <td className="pe-num">{row.managerScore ?? "—"}</td>
            </tr>
          ))}
          <tr className="pe-total">
            <td colSpan={2}>Tổng điểm (tối đa {data.rows.length * 10})</td>
            <td className="pe-num">{selfTotal}</td>
            <td className="pe-num">{managerTotal}</td>
          </tr>
        </tbody>
      </table>

      <div className="pe-result">
        <span>Kết quả tuần {data.weekNumber}: {data.managerPercent}%</span>
        <span>{data.result ? RESULT_LABEL[data.result] : "—"}</span>
      </div>
      <p className="pe-legend">
        Kết quả tính theo điểm NV kỹ thuật chấm. Đạt: 90–100%. Cần cải thiện: 70 – dưới 90%. Không đạt: dưới 70%.
      </p>

      <div className="pe-block">
        <p className="pe-block-title">Ý kiến của nhân viên cấy mô</p>
        <p className="pe-block-text">{data.selfComment || "—"}</p>
      </div>
      <div className="pe-block">
        <p className="pe-block-title">Nhận xét của quản lý kĩ thuật</p>
        <p className="pe-block-text">{data.managerComment || "—"}</p>
      </div>

      <div className="pe-signatures">
        <div>
          <p className="pe-sign-title">Nhân viên cấy mô</p>
          <p className="pe-sign-note">(Ký, ghi rõ họ tên)</p>
          <p className="pe-sign-name">{data.staff.name}</p>
        </div>
        <div>
          <p className="pe-sign-title">Quản lý kĩ thuật</p>
          <p className="pe-sign-note">(Ký, ghi rõ họ tên)</p>
          <p className="pe-sign-name">{data.manager?.name ?? ""}</p>
        </div>
      </div>
    </div>
  );
}
