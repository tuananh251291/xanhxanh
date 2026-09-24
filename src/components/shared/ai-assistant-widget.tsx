"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Web Speech API (ghi âm → chữ, chữ → giọng nói) — chạy hoàn toàn ở trình duyệt người dùng, KHÔNG gọi
// qua Anthropic nên không tốn thêm token, chỉ là lớp chuyển đổi trước/sau lời gọi /api/ai-assistant vẫn
// giữ nguyên. TypeScript chưa có type sẵn cho SpeechRecognition nên khai báo tối giản ở đây.
type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

// Trợ lý AI nội bộ — Giai đoạn 1 chỉ hiện cho SUPER_ADMIN/ADMIN_KY_THUAT (server cũng tự chặn ở
// /api/ai-assistant, đây chỉ là ẩn UI cho vai trò khác). KHÔNG lưu lịch sử — state mất khi tải lại trang,
// đúng theo lựa chọn "chỉ giữ trong phiên làm việc".
export default function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Câu vừa gửi bằng giọng nói cần TỰ ĐỘNG gửi luôn (không chờ bấm nút) — cờ này tránh đóng closure cũ của
  // send() đọc nhầm input rỗng do setState bất đồng bộ.
  const pendingVoiceTextRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognitionCtor && typeof window.speechSynthesis !== "undefined");
  }, []);

  // Chrome trên điện thoại (và hầu hết trình duyệt mobile) chỉ cho speechSynthesis.speak() phát ra tiếng
  // nếu nó bắt nguồn TRỰC TIẾP, ĐỒNG BỘ từ 1 thao tác chạm của người dùng — câu trả lời thật lại đến SAU
  // 1 lượt gọi API (có độ trễ) nên bị chặn âm thầm, không kêu. Cách xử lý chuẩn: phát 1 utterance rỗng
  // ngay TRONG sự kiện bấm nút (primeSpeech, gọi ở các onClick bên dưới) để "mở khoá" — sau đó speak()
  // thật ở đây mới phát được dù gọi muộn/bất đồng bộ. Chỉ cần mở khoá 1 lần/phiên trang.
  const speechPrimedRef = useRef(false);
  const primeSpeech = () => {
    if (speechPrimedRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    speechPrimedRef.current = true;
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.volume = 0;
    window.speechSynthesis.speak(unlock);
  };

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Android Chrome đôi khi bỏ qua utterance.lang nếu không gán thẳng .voice — ưu tiên tìm đúng giọng
    // tiếng Việt đã cài trên máy, không có thì vẫn phát bằng giọng mặc định (còn hơn im lặng).
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "vi-VN";
    utterance.rate = speechRate;
    const viVoice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("vi"));
    if (viVoice) utterance.voice = viVoice;
    // .resume() phòng trường hợp hàng đợi phát bị "kẹt" ở trạng thái paused — lỗi đã biết trên Chrome sau
    // khi tab bị chuyển nền/không hoạt động một lúc.
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, [speechRate]);

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
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
      const reply = json.reply as string;
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
      if (voiceReplyEnabled) speak(reply);
    } catch {
      toast.error("Không thể kết nối tới Trợ lý AI");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, voiceReplyEnabled, speak]);

  const toggleListening = () => {
    if (!speechSupported) {
      toast.error("Trình duyệt này không hỗ trợ ghi âm giọng nói — thử Chrome trên máy tính hoặc Android.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition!;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
      if (e.results[e.results.length - 1]?.isFinal) pendingVoiceTextRef.current = transcript;
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      if (pendingVoiceTextRef.current) {
        const text = pendingVoiceTextRef.current;
        pendingVoiceTextRef.current = null;
        send(text);
      }
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
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
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 text-primary-strong">
              <Sparkles className="w-5 h-5" /> Trợ lý AI
            </SheetTitle>
            {speechSupported && (
              <div className="flex items-center gap-1.5">
                {voiceReplyEnabled && (
                  <select
                    value={speechRate}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      setSpeechRate(rate);
                      // Đổi tốc độ ngay khi đang đọc dở — đọc lại câu hiện tại (SpeechSynthesisUtterance
                      // không cho đổi .rate của utterance đang phát) theo đúng tốc độ mới chọn.
                      const lastReply = [...messages].reverse().find((m) => m.role === "assistant")?.content;
                      if (window.speechSynthesis?.speaking && lastReply) {
                        window.speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance(lastReply);
                        utterance.lang = "vi-VN";
                        utterance.rate = rate;
                        const viVoice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("vi"));
                        if (viVoice) utterance.voice = viVoice;
                        window.speechSynthesis.speak(utterance);
                      }
                    }}
                    title="Tốc độ đọc"
                    className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={voiceReplyEnabled ? "Tắt đọc câu trả lời" : "Bật đọc câu trả lời bằng giọng nói"}
                  onClick={() => {
                    if (voiceReplyEnabled) {
                      window.speechSynthesis?.cancel();
                    } else {
                      primeSpeech();
                    }
                    setVoiceReplyEnabled((v) => !v);
                  }}
                >
                  {voiceReplyEnabled ? <Volume2 className="w-4 h-4 text-primary-strong" /> : <VolumeX className="w-4 h-4 text-text-muted" />}
                </Button>
              </div>
            )}
          </div>
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
                primeSpeech();
                send();
              }
            }}
            placeholder={listening ? "Đang nghe… nói câu hỏi của anh" : "Hỏi về tồn kho, đơn hàng, cảnh báo, hoặc cách thao tác…"}
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {speechSupported && (
            <Button
              size="icon"
              variant={listening ? "default" : "outline"}
              className={listening ? "bg-destructive hover:bg-destructive/90 shrink-0 animate-pulse" : "shrink-0"}
              disabled={loading}
              title={listening ? "Dừng ghi âm" : "Ghi âm câu hỏi"}
              onClick={() => { primeSpeech(); toggleListening(); }}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
          <Button size="icon" className="bg-primary hover:bg-primary-hover shrink-0" disabled={loading || !input.trim()} onClick={() => { primeSpeech(); send(); }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
