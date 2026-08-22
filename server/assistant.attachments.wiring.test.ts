import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("interactive assistant and attachment preview wiring", () => {
  const root = resolve(process.cwd());
  const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
  const home = readFileSync(resolve(root, "client/src/pages/Home.tsx"), "utf8");

  it("exposes a protected Arabic assistant procedure grounded in operations data", () => {
    expect(router).toContain("assistant: router");
    expect(router).toContain("roleProcedure([\"admin\", \"area_manager\"])");
    expect(router).toContain("getOperationsOverview(ctx.user, input.period, undefined, input.year, input.month)");
    expect(router).toContain("branchId: z.number");
    expect(router).toContain("from: z.string().date()");
    expect(router).toContain("to: z.string().date()");
    expect(router).toContain("invokeLLM");
    expect(router).toContain("لا تخترع بيانات أو تقييمات");
  });

  it("mounts AIChatBox with mutation state and Arabic suggested prompts", () => {
    expect(home).toContain("trpc.assistant.ask.useMutation");
    expect(home).toContain("<AIChatBox");
    expect(home).toContain("isLoading={assistantAsk.isPending}");
    expect(home).toContain("ما أفضل 3 فروع ولماذا؟");
    expect(home).toContain("تحديد فرع للمساعد");
    expect(home).toContain("تحديد الفترة للمساعد");
    expect(home).toContain("exportAssistantConversationPdf");
  });

  it("provides keyboard-accessible attachment preview for images and PDFs", () => {
    expect(home).toContain("setAttachmentPreview(attachment)");
    expect(home).toContain("aria-modal=\"true\"");
    expect(home).toContain("attachmentPreview.type.startsWith(\"image/\")");
    expect(home).toContain("<iframe");
    expect(home).toContain("download={attachmentPreview.name}");
    expect(home).toContain("حفظ PDF");
  });
});
