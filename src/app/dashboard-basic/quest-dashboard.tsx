"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Flame, Trophy, Swords, Sparkles, Medal, Bell, CheckCircle2, XCircle,
  PackageCheck, PenLine, Moon, Send, Loader2, Volume2, VolumeX, CalendarPlus, ChevronRight, PackageMinus, type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import ProductivityLeaderboard from "@/components/shared/productivity-leaderboard";
import type { CayMoQuestStats, Quest, MilestoneBadge } from "@/lib/cay-mo-quest-stats";
import { generateConfettiPieces } from "@/lib/confetti";
import { playTaskCompleteSound, playBadgeUnlockSound, playLevelUpSound, playPerfectDaySound } from "@/lib/sound-effects";
import { loadQuestProgressSnapshot, saveQuestProgressSnapshot } from "@/lib/quest-progress-snapshot";

const QUEST_ICONS: Record<Quest["key"], LucideIcon> = {
  motherReceived: PackageCheck,
  dailyRecordDone: PenLine,
  contaminationChecked: Moon,
  handoverDone: Send,
  surplusHandover: PackageMinus,
};

const MUTE_STORAGE_KEY = "caymo-quest-sound-muted";

type ChecklistItem = { id: string; title: string; completed: boolean; assignedDate: string };

export default function CayMoQuestDashboard({
  stats, userName, userId, quote, today,
}: {
  stats: CayMoQuestStats;
  userName: string;
  userId: string;
  quote: string;
  today: string;
}) {
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [sideQuestsAllDone, setSideQuestsAllDone] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mutePrefLoaded, setMutePrefLoaded] = useState(false);
  const celebratedAllRef = useRef(false);
  const celebratedProgressRef = useRef(false);

  const mainQuestsAllDone = stats.quests.every((q) => q.done);
  const doneCount = stats.quests.filter((q) => q.done).length;
  const xpPercent = Math.round((stats.xpIntoLevel / stats.xpTarget) * 100);

  const fireConfetti = useCallback(() => setConfettiBurst((b) => b + 1), []);
  const handleSideQuestAllDoneChange = useCallback((done: boolean) => setSideQuestsAllDone(done), []);

  const celebrateTaskDone = useCallback(() => {
    fireConfetti();
    if (!muted) playTaskCompleteSound();
  }, [fireConfetti, muted]);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage có thể bị chặn — bỏ qua, không chặn UI.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setMuted(window.localStorage.getItem(MUTE_STORAGE_KEY) === "1");
      } catch {
        // giữ mặc định không tắt tiếng
      } finally {
        setMutePrefLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    if (mainQuestsAllDone && sideQuestsAllDone && !celebratedAllRef.current) {
      celebratedAllRef.current = true;
      fireConfetti();
      if (!muted) playPerfectDaySound();
      toast.success("Hoàn hảo! Bạn đã hoàn thành mọi nhiệm vụ hôm nay. Cảm ơn vì sự nỗ lực của bạn!", {
        icon: <Trophy className="w-4 h-4 text-achievement-foreground" />,
      });
    }
  }, [mainQuestsAllDone, sideQuestsAllDone, fireConfetti, muted]);

  useEffect(() => {
    if (!mutePrefLoaded || celebratedProgressRef.current) return;
    celebratedProgressRef.current = true;

    Promise.resolve().then(() => {
      const earnedBadgeKeys = stats.badges.filter((b) => b.earned).map((b) => b.key);
      const previous = loadQuestProgressSnapshot(userId);
      if (previous) {
        const newlyEarned = stats.badges.filter((b) => b.earned && !previous.earnedBadgeKeys.includes(b.key));
        const leveledUp = stats.level > previous.level;
        if (newlyEarned.length > 0) {
          fireConfetti();
          if (!muted) playBadgeUnlockSound();
          toast.success(`Mở khoá huy hiệu mới: ${newlyEarned.map((b) => b.label).join(", ")}!`, {
            icon: <Medal className="w-4 h-4 text-achievement-foreground" />,
          });
        } else if (leveledUp) {
          fireConfetti();
          if (!muted) playLevelUpSound();
          toast.success(`Chúc mừng! Bạn đã lên cấp ${stats.level}.`, {
            icon: <Trophy className="w-4 h-4 text-achievement-foreground" />,
          });
        }
      }
      saveQuestProgressSnapshot(userId, { level: stats.level, earnedBadgeKeys });
    });
  }, [mutePrefLoaded, stats.badges, stats.level, userId, fireConfetti, muted]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="bg-card border border-border rounded-3xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-16 h-16 rounded-full border-4 border-primary bg-primary-light flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-primary-strong leading-none">CẤP</span>
            <span className="text-xl font-bold text-primary-strong leading-none">{stats.level}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
              <button
                type="button"
                onClick={toggleMuted}
                title={muted ? "Bật âm thanh" : "Tắt âm thanh"}
                className="shrink-0 p-1.5 rounded-lg text-text-muted hover:bg-muted hover:text-text-secondary transition-colors"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-text-secondary text-sm mt-0.5 capitalize">Nhân viên nuôi cấy mô · {today}</p>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Kinh nghiệm cấp {stats.level}</span>
                <span>{stats.xpIntoLevel}/{stats.xpTarget}</span>
              </div>
              <Progress value={xpPercent} />
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1 bg-warning-light rounded-2xl px-3 py-2 animate-pop-in">
            <Flame className="w-5 h-5 text-warning-foreground" />
            <span className="text-lg font-bold text-warning-foreground leading-none">{stats.currentStreak}</span>
            <span className="text-[10px] text-warning-foreground/80 whitespace-nowrap">ngày liên tục</span>
          </div>
        </div>
      </div>

      <p className="text-sm font-bold text-primary-strong bg-primary-light border border-primary-light rounded-2xl px-4 py-3">
        {quote}
      </p>

      <Link href="/dashboard-basic/dang-ky-cay-them" className="block">
        <Card className="hover:border-primary transition-colors">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="bg-secondary text-secondary-foreground p-2.5 rounded-xl shrink-0">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Đăng ký cấy thêm</p>
              <p className="text-xs text-text-secondary">Hoàn thành sớm chỉ định hoặc đăng ký làm thêm ngoài giờ/Chủ nhật</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {stats.unreadInspectionResults > 0 && (
        <Link href="/handover-record" className="block">
          <Card className="border border-warning bg-warning-light">
            <CardContent className="py-4 flex items-center gap-3">
              <Bell className="w-5 h-5 text-warning-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning-foreground">
                  Có {stats.unreadInspectionResults} phiếu bàn giao đã có kết quả kiểm tra
                </p>
                <p className="text-xs text-warning-foreground/80">Bấm để xem số lượng được ghi nhận</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      <section className="space-y-3">
        <ProductivityLeaderboard label="Xếp hạng năng lực cấy" variant="heading" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary-strong" /> Nhiệm vụ chính hôm nay
          </h2>
          <Badge variant="secondary">{doneCount}/{stats.quests.length}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {stats.quests.map((quest, idx) => (
            <QuestCard key={quest.key} quest={quest} icon={QUEST_ICONS[quest.key]} delayMs={idx * 60} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-secondary-foreground" /> Nhiệm vụ phụ
        </h2>
        <SideQuestList onAllDoneChange={handleSideQuestAllDoneChange} onItemCompleted={celebrateTaskDone} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Medal className="w-4 h-4 text-achievement-foreground" /> Huy hiệu cột mốc
        </h2>
        <div className="flex flex-wrap gap-3">
          {stats.badges.map((badge) => (
            <BadgeChip key={badge.key} badge={badge} />
          ))}
        </div>
      </section>

      <Confetti burst={confettiBurst} />
    </div>
  );
}

function QuestCard({ quest, icon: Icon, delayMs }: { quest: Quest; icon: LucideIcon; delayMs: number }) {
  return (
    <Link
      href={quest.href}
      style={{ animationDelay: `${delayMs}ms` }}
      className={`animate-in fade-in slide-in-from-bottom-1 flex items-center justify-between gap-3 p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md ${
        quest.done ? "bg-primary-light border-primary-light" : "bg-card border-border hover:border-primary"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl shrink-0 ${quest.done ? "bg-primary text-primary-foreground" : "bg-muted text-text-secondary"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{quest.title}</p>
          <p className="text-xs text-text-secondary truncate">{quest.description}</p>
        </div>
      </div>
      <Badge
        className={`shrink-0 gap-1 ${quest.done ? "bg-primary text-primary-foreground hover:bg-primary" : "bg-danger-light text-destructive hover:bg-danger-light"}`}
      >
        {quest.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {quest.done ? "Xong" : "Chưa xong"}
      </Badge>
    </Link>
  );
}

function BadgeChip({ badge }: { badge: MilestoneBadge }) {
  return (
    <div
      title={badge.description}
      className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-semibold transition-all ${
        badge.earned
          ? "bg-achievement text-achievement-foreground border-transparent animate-pop-in"
          : "bg-muted text-text-muted border-divider opacity-70"
      }`}
    >
      <Medal className="w-3.5 h-3.5" />
      {badge.label}
    </div>
  );
}

function SideQuestList({
  onAllDoneChange, onItemCompleted,
}: {
  onAllDoneChange: (done: boolean) => void;
  onItemCompleted: () => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/checklist/today")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Không có nhiệm vụ phụ nào (vd role chưa có ChecklistTemplate) thì coi như đã xong hết —
    // nếu không, banner "hoàn thành mọi nhiệm vụ" sẽ không bao giờ bật được cho các role đó.
    if (!loading) onAllDoneChange(items.length === 0 || items.every((i) => i.completed));
  }, [items, loading, onAllDoneChange]);

  const toggle = async (item: ChecklistItem) => {
    const completing = !item.completed;
    setSavingId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: completing } : i)));
    try {
      const res = await fetch(`/api/checklist/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: completing }),
      });
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: item.completed } : i)));
        return;
      }
      if (completing) {
        onItemCompleted();
        const allDone = items.every((i) => i.id === item.id || i.completed);
        toast.success(
          allDone
            ? "Xuất sắc! Hôm nay bạn đã hoàn thành toàn bộ nhiệm vụ trong ngày. Cảm ơn vì sự nỗ lực của bạn!"
            : `Đã hoàn thành '${item.title}' — làm tốt lắm!`,
          { icon: <Trophy className="w-4 h-4 text-achievement-foreground" /> }
        );
      }
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-text-muted px-1">Đang tải nhiệm vụ phụ...</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-text-muted px-1">Chưa có nhiệm vụ phụ nào hôm nay.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item, idx) => (
        <label
          key={item.id}
          style={{ animationDelay: `${idx * 60}ms` }}
          className={`animate-in fade-in slide-in-from-bottom-1 flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
            item.completed ? "bg-primary-light border-primary-light" : "bg-card border-border hover:border-primary"
          }`}
        >
          <Checkbox checked={item.completed} disabled={savingId === item.id} onCheckedChange={() => toggle(item)} />
          <span className={`text-sm flex-1 ${item.completed ? "line-through text-text-muted" : "text-foreground"}`}>
            {item.title}
          </span>
          {savingId === item.id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
          ) : item.completed ? (
            <Sparkles className="w-4 h-4 text-primary-strong" />
          ) : null}
        </label>
      ))}
    </div>
  );
}

function Confetti({ burst }: { burst: number }) {
  const pieces = useMemo(() => generateConfettiPieces(burst), [burst]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`absolute top-0 w-2 h-3 rounded-sm animate-confetti-fall ${p.color}`}
          style={
            {
              left: `${p.left}%`,
              animationDelay: `${p.delayMs}ms`,
              animationDuration: `${p.durationMs}ms`,
              "--confetti-fall-distance": "100vh",
              "--confetti-spin": `${p.spinDeg}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
