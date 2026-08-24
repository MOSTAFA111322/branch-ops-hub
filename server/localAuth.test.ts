import { describe, expect, it } from "vitest";
import { hashPassword, isLocked, lockoutAfterFailedAttempt, verifyPassword } from "./localAuth";

describe("local authentication helpers", () => {
  it("hashes passwords without retaining the original and verifies them", () => {
    const password = "CoffeeBranch!2026";
    const hash = hashPassword(password);
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(password);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("locks after the fifth failed attempt and does not lock earlier", () => {
    expect(lockoutAfterFailedAttempt(4)).toBeNull();
    const lockUntil = lockoutAfterFailedAttempt(5);
    expect(lockUntil).toBeInstanceOf(Date);
    expect(isLocked(lockUntil)).toBe(true);
  });

  it("does not treat expired locks as active", () => {
    expect(isLocked(new Date(Date.now() - 1000))).toBe(false);
    expect(isLocked(null)).toBe(false);
  });
});
