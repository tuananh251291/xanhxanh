"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Sprout, Leaf, Loader2, type LucideIcon } from "lucide-react";

type RankingEntry = { staffId: string; name: string; total: number };
type LeaderboardData = { finished: RankingEntry[]; mother: RankingEntry[] };

const RANK_BADGE_STYLES = [
  "bg-achievement text-achievement-foreground",
  "bg-muted text-foreground",
  "bg-warning-light text-warning-foreground",
];

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) {
    return <span className="w-6 h-6 shrink-0 flex items-center justify-center text-xs text-text-muted">{rank}</span>;
  }
  return (
    <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${RANK_BADGE_STYLES[rank - 1]}`}>
      {rank}
    </span>
  );
}

function RankingTable({
  title, icon: Icon, entries, unit,
}: {
  title: string;
  icon: LucideIcon;
  entries: RankingEntry[];
  unit: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-primary-strong" /> {title}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-text-muted">Chưa có dữ liệu tuần này</p>
      ) : (
        <ScrollArea className="h-72 pr-2">
          <div className="space-y-1">
            {entries.map((entry, idx) => (
              <div key={entry.staffId} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted">
                <RankBadge rank={idx + 1} />
                <span className="flex-1 text-sm text-foreground truncate">{entry.name}</span>
                <span className="text-sm font-medium text-foreground whitespace-nowrap">
                  {entry.total.toLocaleString("vi-VN")} {unit}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export default function ProductivityLeaderboard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LeaderboardData | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next && !data && !loading) {
      setLoading(true);
      fetch("/api/leaderboard/weekly")
        .then((r) => r.json())
        .then((json) => setData({ finished: json.finished ?? [], mother: json.mother ?? [] }))
        .finally(() => setLoading(false));
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-primary-light transition-colors w-full text-left bg-white"
      >
        <div className="p-2.5 rounded-xl shrink-0 bg-warning-light text-warning-foreground">
          <Trophy className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-foreground">Bảng thi đua năng suất tuần</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-warning-foreground" /> Bảng thi đua năng suất tuần này
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border gap-4 sm:gap-0">
            <div className="sm:pr-4">
              <RankingTable title="Cây ra rễ nhiều nhất" icon={Leaf} entries={data?.finished ?? []} unit="cây" />
            </div>
            <div className="sm:pl-4">
              <RankingTable title="Cụm mẫu mẹ nhiều nhất" icon={Sprout} entries={data?.mother ?? []} unit="cụm" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
