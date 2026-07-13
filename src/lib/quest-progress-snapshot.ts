// Ghi nhớ lần cuối thấy cấp độ / huy hiệu của từng người dùng (theo userId) để phát hiện
// "vừa lên cấp" / "vừa mở khoá huy hiệu mới" — tách theo userId vì trình duyệt có thể dùng chung
// giữa nhiều nhân viên (máy dùng chung ở kho/xưởng).

type ProgressSnapshot = {
  level: number;
  earnedBadgeKeys: string[];
};

function storageKey(userId: string) {
  return `caymo-quest-progress-${userId}`;
}

export function loadQuestProgressSnapshot(userId: string): ProgressSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProgressSnapshot;
    if (typeof parsed.level !== "number" || !Array.isArray(parsed.earnedBadgeKeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuestProgressSnapshot(userId: string, snapshot: ProgressSnapshot) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh) — bỏ qua, không chặn UI.
  }
}
