import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const gate = readFileSync(new URL("../client/src/components/AuthGate.tsx", import.meta.url), "utf8");

describe("authenticated dashboard gate", () => {
  it("wraps the home route with AuthGate", () => {
    expect(app).toContain("<AuthGate><Home /></AuthGate>");
  });

  it("offers local and institutional login without exposing sensitive credential data", () => {
    expect(gate).toContain("trpc.auth.localLogin.useMutation");
    expect(gate).toContain("startLogin()");
    expect(gate).not.toContain("passwordHash");
    expect(gate).toContain("لا يتم عرض أي أرقام افتراضية عند غياب الجلسة");
  });
});
