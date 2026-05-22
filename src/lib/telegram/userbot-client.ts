/**
 * Telegram Userbot Client (gramjs)
 *
 * Used EXCLUSIVELY for the one-time automated group creation flow.
 * All ongoing management (topics, daily reports, webhooks) uses the Bot API.
 *
 * Required Railway env vars:
 *   TELEGRAM_API_ID=37826091
 *   TELEGRAM_API_HASH=ac84088293facf4f9ff424d7e3c10674
 *   TELEGRAM_USER_SESSION=<StringSession string — generated once via the session script>
 *   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=Texas_funds_Bot
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";

// ── Error types ───────────────────────────────────────────────────────────────

export type UserbotErrorCode =
  | "not_configured"
  | "flood_wait"
  | "privacy"
  | "generic";

export class UserbotError extends Error {
  constructor(
    message: string,
    readonly code: UserbotErrorCode,
    /** Only set for flood_wait — seconds until the client may retry. */
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "UserbotError";
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig(): { sessionStr: string; apiId: number; apiHash: string } {
  const sessionStr = process.env.TELEGRAM_USER_SESSION;
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!sessionStr || !apiId || !apiHash) {
    throw new UserbotError(
      "Telegram Userbot غير مُهيَّأ. يرجى تعيين TELEGRAM_USER_SESSION و TELEGRAM_API_ID و TELEGRAM_API_HASH في Railway.",
      "not_configured"
    );
  }
  return { sessionStr, apiId, apiHash };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Convert MTProto channel ID → Telegram Bot API chat_id format (negative). */
function toBotApiChatId(channelId: { toString(): string }): number {
  return Number(`-100${channelId.toString()}`);
}

/**
 * gramjs uses the `big-integer` package internally, whose BigInteger type does
 * not align with native `bigint` at the TypeScript level.
 * This cast is always safe at runtime since both are integer representations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gbi(n: unknown): any {
  return n;
}

/** Normalise any gramjs/network error into a typed UserbotError. */
function wrapError(err: unknown, context: string): UserbotError {
  if (err instanceof UserbotError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const ctorName =
    (err as { constructor?: { name?: string } })?.constructor?.name ?? "";

  if (ctorName === "FloodWaitError" || msg.includes("FLOOD_WAIT")) {
    const seconds = (err as { seconds?: number })?.seconds ?? 60;
    return new UserbotError(
      `تم تجاوز حد الطلبات. انتظر ${seconds} ثانية ثم أعد المحاولة.`,
      "flood_wait",
      seconds
    );
  }

  if (
    ctorName === "UserPrivacyRestrictedError" ||
    msg.includes("PRIVACY_RESTRICTED") ||
    msg.includes("UserPrivacy")
  ) {
    return new UserbotError(
      "قيود الخصوصية تمنع العملية. استخدم خطوات التفعيل اليدوي.",
      "privacy"
    );
  }

  return new UserbotError(`${context}: ${msg}`, "generic");
}

// ── Public result type ────────────────────────────────────────────────────────

export interface AutoCreateResult {
  /** Telegram Bot API chat_id (negative, e.g. –1001234567890). */
  chatId: number;
  chatTitle: string;
}

// ── Core automation function ──────────────────────────────────────────────────

const STEP_DELAY_MS = 350;

/**
 * Automatically creates a Texas tracking supergroup and configures the official
 * bot as its administrator. Runs exactly 4 sequential MTProto steps:
 *
 *   A. CreateChannel  — supergroup: "[masterName] - Texas Tracking 🔥"
 *   B. ToggleForum    — enable Topics (Forum) mode
 *   C. InviteToChannel— add the official bot
 *   D. EditAdmin      — grant manageTopics + postMessages + related rights
 *
 * A fresh TelegramClient is created for every call and is always disconnected
 * in a `finally` block to prevent open sockets from lingering.
 *
 * @param _userId     The master's Supabase user_id (reserved for future audit logging).
 * @param masterName  Display name used in the group title.
 */
export async function autoCreateTelegramTrackerGroup(
  _userId: string,
  masterName: string
): Promise<AutoCreateResult> {
  const { sessionStr, apiId, apiHash } = getConfig();

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    throw new UserbotError(
      "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME غير مُعيَّن في Railway.",
      "not_configured"
    );
  }

  const client = new TelegramClient(
    new StringSession(sessionStr),
    apiId,
    apiHash,
    {
      connectionRetries: 3,
      useWSS: true, // WebSocket/TLS — most reliable in Railway cloud environment
    }
  );

  try {
    await client.connect();

    const title = `${masterName} - Texas Tracking 🔥`;

    // ── Step A: Create supergroup ───────────────────────────────────────────
    let inputChannel: Api.InputChannel;
    let chatId: number;

    try {
      const result = (await client.invoke(
        new Api.channels.CreateChannel({
          title,
          about:
            "Texas Funds automated tracking — موضوع لكل وكيل فرعي، تقرير يومي 4:00 ص دمشق.",
          megagroup: true,
        })
      )) as Api.Updates & { chats?: Api.TypeChat[] };

      const rawChannel = result.chats?.[0];
      if (!rawChannel || !(rawChannel instanceof Api.Channel)) {
        throw new UserbotError(
          "لم يتم إنشاء المجموعة: الاستجابة لا تحتوي على Channel صالح.",
          "generic"
        );
      }

      inputChannel = new Api.InputChannel({
        channelId: gbi(rawChannel.id),
        accessHash: gbi(rawChannel.accessHash ?? BigInt(0)),
      });
      chatId = toBotApiChatId(rawChannel.id);
      console.info("[userbot] A ✓ group created", { title, chatId });
    } catch (err) {
      throw wrapError(err, "فشل إنشاء المجموعة");
    }

    await sleep(STEP_DELAY_MS);

    // ── Step B: Enable Topics (Forum) mode ─────────────────────────────────
    try {
      await client.invoke(
        new Api.channels.ToggleForum({
          channel: inputChannel,
          enabled: true,
        })
      );
      console.info("[userbot] B ✓ forum mode enabled");
    } catch (err) {
      throw wrapError(err, "فشل تفعيل وضع المواضيع");
    }

    await sleep(STEP_DELAY_MS);

    // ── Step C: Invite the bot ──────────────────────────────────────────────
    let inputBot: Api.InputUser;

    try {
      const handle = botUsername.startsWith("@")
        ? botUsername
        : `@${botUsername}`;
      const botEntity = await client.getEntity(handle);

      if (!(botEntity instanceof Api.User)) {
        throw new UserbotError(
          `لم يتم العثور على البوت @${botUsername}. تحقق من NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.`,
          "generic"
        );
      }

      inputBot = new Api.InputUser({
        userId: gbi(botEntity.id),
        accessHash: gbi(botEntity.accessHash ?? BigInt(0)),
      });

      await client.invoke(
        new Api.channels.InviteToChannel({
          channel: inputChannel,
          users: [inputBot],
        })
      );
      console.info("[userbot] C ✓ bot invited");
    } catch (err) {
      throw wrapError(err, "فشل إضافة البوت");
    }

    await sleep(STEP_DELAY_MS);

    // ── Step D: Promote bot to admin ────────────────────────────────────────
    try {
      await client.invoke(
        new Api.channels.EditAdmin({
          channel: inputChannel,
          userId: inputBot,
          adminRights: new Api.ChatAdminRights({
            changeInfo: false,
            postMessages: true,
            editMessages: false,
            deleteMessages: true,
            banUsers: false,
            inviteUsers: true,
            pinMessages: true,
            addAdmins: false,
            anonymous: false,
            manageCall: false,
            other: false,
            manageTopics: true,
          }),
          rank: "",
        })
      );
      console.info("[userbot] D ✓ bot promoted to admin");
    } catch (err) {
      throw wrapError(err, "فشل ترقية البوت لمشرف");
    }

    return { chatId, chatTitle: title };
  } finally {
    // Always disconnect to free the socket — never let it linger in Railway.
    try {
      await client.disconnect();
      console.info("[userbot] client disconnected cleanly");
    } catch {
      // Disconnect errors are non-fatal; log and continue.
      console.warn("[userbot] disconnect threw (non-fatal)");
    }
  }
}
