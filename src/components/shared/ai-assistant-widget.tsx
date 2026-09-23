"use client";

import { useState, useRef, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Trợ lý AI nội bộ — Giai đoạn 1 chỉ hiện cho SUPER_ADMIN/ADMIN_KY_THUAT (server cũng tự chặn ở
// /api/ai-assistant, đây chỉ là ẩn UI cho vai trò khác). KHÔNG lưu lịch sử — state mất khi tải lại trang,
// đúng theo lựa chọn "chỉ giữ trong phiên làm việc".
export default function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        setMessages(messages);
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: json.reply as string }]);
    } catch {
      toast.error("Không thể kết nối tới Trợ lý AI");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-primary hover:bg-primary-hover shadow-lg p-0"
            aria-label="Mở Trợ lý AI"
          />
        }
      >
        <Sparkles className="w-6 h-6" />
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 flex flex-col">
        <SheetHeader className="border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-primary-strong">
            <Sparkles className="w-5 h-5" /> Trợ lý AI
          </SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-text-secondary bg-info-light text-info-foreground rounded-lg px-3 py-2">
              Xin chào! Em có thể giúp anh tra cứu nhanh tồn kho, đơn hàng, cảnh báo, hoặc hướng dẫn thao tác trên hệ thống.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground whitespace-pre-wrap"
                    : "max-w-[85%] rounded-lg px-3 py-2 text-sm bg-card border border-border text-foreground whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 bg-card border border-border">
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex items-end gap-2 shrink-0">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Hỏi về tồn kho, đơn hàng, cảnh báo, hoặc cách thao tác…"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button size="icon" className="bg-primary hover:bg-primary-hover shrink-0" disabled={loading || !input.trim()} onClick={send}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
