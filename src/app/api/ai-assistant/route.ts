import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { AI_ASSISTANT_TOOLS, AI_ASSISTANT_GUIDE, runAiAssistantTool } from "@/lib/ai-assistant-tools";

// "Trợ lý AI" — Giai đoạn 1 CHỈ mở cho SUPER_ADMIN/ADMIN_KY_THUAT (cố tình hẹp hơn isAdminRole, KHÔNG bao
// gồm ADMIN thường — theo đúng phạm vi anh chốt). Không lưu lịch sử hội thoại vào DB — client tự giữ toàn
// bộ mảng messages trong state và gửi lại mỗi lượt hỏi (mất khi tải lại trang).
const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN_KY_THUAT"] as const;

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
});

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ITERATIONS = 5;

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ message: "Không có quyền dùng Trợ lý AI" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ message: "Chưa cấu hình ANTHROPIC_API_KEY trên server" }, { status: 500 });
  }

  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        output_config: { effort: "low" },
        system: [
          {
            type: "text",
            text: `Bạn là trợ lý AI nội bộ của Xanh Xanh — hệ thống ERP quản lý nuôi cấy mô cây giống. Trả lời NGẮN GỌN, đúng trọng tâm, bằng tiếng Việt. Khi được hỏi về số liệu (tồn kho, đơn hàng, cảnh báo), LUÔN dùng công cụ tra cứu thay vì đoán số liệu. Khi được hỏi cách thao tác, dùng kiến thức nghiệp vụ dưới đây để hướng dẫn. Nếu không có công cụ phù hợp hoặc không tìm thấy dữ liệu, nói rõ là không có dữ liệu thay vì bịa số liệu.\n\n${AI_ASSISTANT_GUIDE}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: AI_ASSISTANT_TOOLS,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({ reply: text || "Xin lỗi, em chưa có câu trả lời cho câu hỏi này." });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await runAiAssistantTool(block.name, block.input);
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: result.content,
            is_error: result.is_error,
          };
        })
      );
      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ reply: "Câu hỏi này cần tra cứu quá nhiều bước, anh thử hỏi cụ thể/ngắn gọn hơn giúp em." });
  } catch (err) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ message: "Có lỗi khi gọi trợ lý AI, thử lại sau." }, { status: 500 });
  }
}
