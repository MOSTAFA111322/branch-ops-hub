import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Request } from "express";
import { parse } from "cookie";
import { eq } from "drizzle-orm";
import { users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { LOCAL_SESSION_COOKIE } from "@shared/const";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export async function createLocalSession(user: Pick<User, "id" | "username">) {
  return new SignJWT({ typ: "local", uid: user.id, username: user.username ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function authenticateLocalRequest(req: Request): Promise<User | null> {
  const token = parse(req.headers.cookie ?? "")[LOCAL_SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.typ !== "local" || typeof payload.uid !== "number") return null;
    const db = await getDb();
    if (!db) return null;
    const [user] = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
    if (!user || !user.isActive || !user.passwordHash) return null;
    return user;
  } catch {
    return null;
  }
}

export function lockoutAfterFailedAttempt(failedAttempts: number) {
  if (failedAttempts < MAX_FAILED_ATTEMPTS) return null;
  return new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
}

export function isLocked(lockedUntil: Date | null) {
  return Boolean(lockedUntil && lockedUntil.getTime() > Date.now());
}

export const LOCAL_AUTH_LIMITS = { maxFailedAttempts: MAX_FAILED_ATTEMPTS, lockMinutes: LOCK_MINUTES } as const;
