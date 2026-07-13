import Link from "next/link";
import { Leaf, ChevronLeft } from "lucide-react";

export default function BasicPageHeader({ title }: { title: string }) {
  return (
    <header className="border-b border-divider bg-card px-4 py-3 flex items-center gap-3">
      <Link
        href="/dashboard-basic"
        className="flex items-center gap-1 text-text-secondary hover:text-primary-strong transition-colors shrink-0"
      >
        <ChevronLeft className="w-5 h-5" />
      </Link>
      <div className="bg-primary text-primary-foreground p-2 rounded-lg shrink-0">
        <Leaf className="w-5 h-5" />
      </div>
      <span className="font-bold text-foreground truncate">{title}</span>
    </header>
  );
}
