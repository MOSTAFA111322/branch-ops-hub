import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("map and production-build safeguards", () => {
  const root = resolve(process.cwd());
  const map = readFileSync(resolve(root, "client/src/components/Map.tsx"), "utf8");
  const vite = readFileSync(resolve(root, "vite.config.ts"), "utf8");

  it("rejects failed map loads and shows an Arabic fallback instead of throwing", () => {
    expect(map).toContain('reject(new Error("Failed to load Google Maps script"))');
    expect(map).toContain('loadState === "error"');
    expect(map).toContain("تعذر تحميل الخريطة حاليًا");
    expect(map).toContain("يمكن متابعة بيانات الفروع من الجداول والتقارير");
  });

  it("keeps the JSX location transform limited to development mode", () => {
    expect(vite).toContain('process.env.NODE_ENV === "development" ? [jsxLocPlugin()] : []');
  });
});

