// ============================================================
// PASSWORD RESET + AUTH COMPLETION — Day 11
// Full auth lifecycle: reset, verify, 2FA, sessions, API keys
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { createHash, randomBytes } from "crypto";

// --- Types ---
interface PasswordResetToken {
  token: string;
  email: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

interface VerificationToken {
  token: string;
  email: string;
  userId: string;
  expiresAt: Date;
  verified: boolean;
}

interface Session {
  id: string;
  userId: string;
  device: string;
  ip: string;
  createdAt: Date;
  lastActive: Date;
  expiresAt: Date;
  active: boolean;
}

interface ApiKey {
  id: string;
  userId: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsed: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}

// --- In-memory stores ---
const resetTokens: Map<string, PasswordResetToken> = new Map();
const verifyTokens: Map<string, VerificationToken> = new Map();
const sessions: Map<string, Session> = new Map();
const apiKeys: Map<string, ApiKey> = new Map();

// --- Helpers ---
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// --- Mock Email Service ---
const emailQueue: Array<{
  to: string;
  subject: string;
  body: string;
  timestamp: Date;
}> = [];

function queueEmail(to: string, subject: string, body: string): void {
  emailQueue.push({ to, subject, body, timestamp: new Date() });
  console.log(`[EMAIL] Queued to ${to}: ${subject}`);
}

export const passwordResetRouter = createRouter({
  // === PASSWORD RESET FLOW ===
  // PR-01: requestReset — Request password reset link
  requestReset: publicQuery
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(({ input }) => {
      const token = generateToken();
      const hashedToken = hashToken(token);

      // In production: lookup user by email, get userId
      const mockUserId = `user_${hashToken(input.email).slice(0, 8)}`;

      const reset: PasswordResetToken = {
        token: hashedToken,
        email: input.email,
        userId: mockUserId,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        used: false,
        createdAt: new Date(),
      };
      resetTokens.set(hashedToken, reset);

      // Queue email with reset link
      const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
      queueEmail(
        input.email,
        "ONX Intelligence — Password Reset Request",
        `You requested a password reset.\n\nClick this link to reset:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`
      );

      return {
        sent: true,
        email: input.email,
        message: "Password reset link sent to your email",
        expiresIn: "1 hour",
      };
    }),

  // PR-02: verifyToken — Verify reset token is valid
  verifyToken: publicQuery
    .input(z.object({ token: z.string() }))
    .query(({ input }) => {
      const hashed = hashToken(input.token);
      const reset = resetTokens.get(hashed);

      if (!reset) return { valid: false, reason: "TOKEN_NOT_FOUND" };
      if (reset.used) return { valid: false, reason: "TOKEN_ALREADY_USED" };
      if (new Date() > reset.expiresAt) return { valid: false, reason: "TOKEN_EXPIRED" };

      return {
        valid: true,
        email: reset.email,
        expiresAt: reset.expiresAt,
      };
    }),

  // PR-03: resetPassword — Reset password with token
  resetPassword: publicQuery
    .input(z.object({
      token: z.string(),
      newPassword: z.string().min(8).max(128),
    }))
    .mutation(({ input }) => {
      const hashed = hashToken(input.token);
      const reset = resetTokens.get(hashed);

      if (!reset) throw new Error("INVALID_TOKEN");
      if (reset.used) throw new Error("TOKEN_ALREADY_USED");
      if (new Date() > reset.expiresAt) throw new Error("TOKEN_EXPIRED");

      // In production: hash password with bcrypt and update user record
      reset.used = true;

      return {
        reset: true,
        email: reset.email,
        message: "Password successfully reset. You can now log in.",
      };
    }),

  // === EMAIL VERIFICATION ===
  // PR-04: requestVerification — Send verification email
  requestVerification: publicQuery
    .input(z.object({
      email: z.string().email(),
      userId: z.string(),
    }))
    .mutation(({ input }) => {
      const token = generateToken();
      const hashedToken = hashToken(token);

      const verify: VerificationToken = {
        token: hashedToken,
        email: input.email,
        userId: input.userId,
        expiresAt: new Date(Date.now() + 86400000), // 24 hours
        verified: false,
      };
      verifyTokens.set(hashedToken, verify);

      const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/verify-email?token=${token}`;
      queueEmail(
        input.email,
        "ONX Intelligence — Verify Your Email",
        `Welcome to ONX Intelligence.\n\nClick to verify your email:\n${verifyUrl}\n\nThis link expires in 24 hours.`
      );

      return { sent: true, email: input.email, expiresIn: "24 hours" };
    }),

  // PR-05: verifyEmail — Verify email with token
  verifyEmail: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(({ input }) => {
      const hashed = hashToken(input.token);
      const verify = verifyTokens.get(hashed);

      if (!verify) throw new Error("INVALID_TOKEN");
      if (verify.verified) throw new Error("ALREADY_VERIFIED");
      if (new Date() > verify.expiresAt) throw new Error("TOKEN_EXPIRED");

      verify.verified = true;

      return {
        verified: true,
        email: verify.email,
        message: "Email verified successfully",
      };
    }),

  // === SESSION MANAGEMENT ===
  // PR-06: createSession — Create new session
  createSession: publicQuery
    .input(z.object({
      userId: z.string(),
      device: z.string(),
      ip: z.string(),
      duration: z.number().default(86400000), // 24 hours default
    }))
    .mutation(({ input }) => {
      const id = `sess_${generateToken().slice(0, 16)}`;
      const now = new Date();
      const session: Session = {
        id,
        userId: input.userId,
        device: input.device,
        ip: input.ip,
        createdAt: now,
        lastActive: now,
        expiresAt: new Date(now.getTime() + input.duration),
        active: true,
      };
      sessions.set(id, session);
      return { created: true, sessionId: id, expiresAt: session.expiresAt };
    }),

  // PR-07: listSessions — List user sessions
  listSessions: publicQuery
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => {
      const userSessions = Array.from(sessions.values())
        .filter((s) => s.userId === input.userId)
        .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
      return userSessions.map((s) => ({
        id: s.id,
        device: s.device,
        ip: s.ip,
        createdAt: s.createdAt,
        lastActive: s.lastActive,
        expiresAt: s.expiresAt,
        active: s.active && new Date() < s.expiresAt,
      }));
    }),

  // PR-08: revokeSession — Revoke a session
  revokeSession: publicQuery
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ input }) => {
      const session = sessions.get(input.sessionId);
      if (!session) throw new Error("SESSION_NOT_FOUND");
      session.active = false;
      return { revoked: true, sessionId: input.sessionId };
    }),

  // PR-09: revokeAllSessions — Emergency revoke all
  revokeAllSessions: publicQuery
    .input(z.object({ userId: z.string(), exceptSessionId: z.string().optional() }))
    .mutation(({ input }) => {
      let count = 0;
      for (const [id, session] of sessions) {
        if (session.userId === input.userId && id !== input.exceptSessionId) {
          session.active = false;
          count++;
        }
      }
      return { revoked: count, userId: input.userId };
    }),

  // === API KEY MANAGEMENT ===
  // PR-10: createApiKey — Create API key
  createApiKey: publicQuery
    .input(z.object({
      userId: z.string(),
      name: z.string(),
      permissions: z.array(z.string()).default(["intelligence:read"]),
      expiresInDays: z.number().optional(), // null = no expiry
    }))
    .mutation(({ input }) => {
      const keyId = `key_${generateToken().slice(0, 12)}`;
      const keySecret = `onx_${generateToken()}`;

      const apiKey: ApiKey = {
        id: keyId,
        userId: input.userId,
        name: input.name,
        key: keySecret,
        permissions: input.permissions,
        lastUsed: null,
        createdAt: new Date(),
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : null,
      };
      apiKeys.set(keyId, apiKey);

      return {
        created: true,
        keyId,
        key: keySecret, // Only shown once
        name: input.name,
        permissions: input.permissions,
        expiresAt: apiKey.expiresAt,
        warning: "Store this key securely — it will not be shown again",
      };
    }),

  // PR-11: listApiKeys — List user's API keys
  listApiKeys: publicQuery
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => {
      return Array.from(apiKeys.values())
        .filter((k) => k.userId === input.userId)
        .map((k) => ({
          id: k.id,
          name: k.name,
          permissions: k.permissions,
          lastUsed: k.lastUsed,
          createdAt: k.createdAt,
          expiresAt: k.expiresAt,
          active: !k.expiresAt || new Date() < k.expiresAt,
        }));
    }),

  // PR-12: revokeApiKey — Revoke API key
  revokeApiKey: publicQuery
    .input(z.object({ keyId: z.string() }))
    .mutation(({ input }) => {
      apiKeys.delete(input.keyId);
      return { revoked: true, keyId: input.keyId };
    }),

  // === 2FA / TOTP ===
  // PR-13: setup2FA — Generate TOTP secret
  setup2FA: publicQuery
    .input(z.object({ userId: z.string() }))
    .mutation(({ input }) => {
      const secret = generateToken().slice(0, 16).match(/.{4}/g)?.join(" ") || "";
      const qrUri = `otpauth://totp/ONX:${input.userId}?secret=${secret.replace(/ /g, "")}&issuer=ONX-Intelligence`;

      return {
        secret,
        qrUri,
        backupCodes: Array.from({ length: 8 }, () => randomBytes(4).toString("hex").toUpperCase()),
        message: "Scan QR code with authenticator app, then verify",
      };
    }),

  // PR-14: verify2FA — Verify TOTP code
  verify2FA: publicQuery
    .input(z.object({
      userId: z.string(),
      code: z.string().length(6),
    }))
    .mutation(({ input }) => {
      // In production: verify against stored secret using speakeasy or otplib
      const isValid = input.code.length === 6 && /^\d{6}$/.test(input.code);
      return { verified: isValid, enabled: isValid, userId: input.userId };
    }),

  // === STATS & ADMIN ===
  // PR-15: stats — Auth system statistics
  stats: publicQuery.query(() => ({
    passwordResets: {
      total: resetTokens.size,
      used: Array.from(resetTokens.values()).filter((t) => t.used).length,
      expired: Array.from(resetTokens.values()).filter((t) => !t.used && new Date() > t.expiresAt).length,
    },
    verifications: {
      total: verifyTokens.size,
      verified: Array.from(verifyTokens.values()).filter((t) => t.verified).length,
    },
    sessions: {
      total: sessions.size,
      active: Array.from(sessions.values()).filter((s) => s.active && new Date() < s.expiresAt).length,
    },
    apiKeys: {
      total: apiKeys.size,
      active: Array.from(apiKeys.values()).filter((k) => !k.expiresAt || new Date() < k.expiresAt).length,
    },
    emailsQueued: emailQueue.length,
  })),

  // PR-16: emailLog — View queued emails (admin)
  emailLog: publicQuery
    .input(z.object({ limit: z.number().default(10) }))
    .query(({ input }) => ({
      emails: emailQueue.slice(-input.limit),
      total: emailQueue.length,
    })),
});
