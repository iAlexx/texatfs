/** رسائل البوت — أسلوب شامي مختصر. الأوامر بالإنجليزي (/start, /genkey). */

export function miniAppReadyLine(): string {
  return "\n\nجاهز ✅\nافتح التطبيق من زر القائمة بالأسفل.";
}

export const botAr = {
  welcomeBackActive: (name: string) =>
    `أهلاً ${name}! اشتراكك شغّال.${miniAppReadyLine()}`,
  subscriptionExpired:
    "اشتراكك خلص. تواصل مع الإدارة لتحصل على مفتاح تجديد.",
  sessionDbError:
    "ما قدرنا نبدأ التسجيل. جرّب /start مرة تانية أو تواصل مع الدعم.",
  chooseMode:
    "أهلاً بك بتكساس فاندز 👋\n\n1️⃣ عندي حساب — بدي سجّل دخول\n2️⃣ حساب جديد\n\nأرسل 1 أو 2",
  chooseModeInvalid: "اختار 1 لتسجيل الدخول أو 2 لحساب جديد.",
  stepLoginExisting:
    "أرسل اسم المستخدم أو الإيميل تبع لوحة تكساس:",
  stepLoginNew: "أرسل اسم المستخدم أو الإيميل لحسابك الجديد:",
  welcomeNew:
    "أهلاً بك 👋\n\nالخطوة ١ — أرسل اسم المستخدم أو الإيميل من لوحة تكساس:",
  sessionFetchError: "صار خطأ بالجلسة. أرسل /start من جديد.",
  sendStart: "أرسل /start للبدء.",
  sessionInvalid: "الجلسة انتهت. أرسل /start من جديد.",
  loginInvalid:
    "بيانات الدخول مو صح. أرسل اسم مستخدم أو إيميل (٣–١٢٨ حرف).",
  loginSaveError: "ما انحفظت البيانات. أرسل /start وجرّب مرة تانية.",
  stepPassword:
    "الخطوة ٢ — أرسل كلمة مرور لوحة تكساس.\n(بتتشفّر قبل التخزين.)",
  passwordShort: "كلمة المرور قصيرة. أعد الإرسال.",
  passwordSaveError: "ما انحفظت كلمة المرور. أرسل /start وجرّب مرة تانية.",
  stepLicense:
    "الخطوة ٣ — أرسل مفتاح الترخيص:\nمثال: TEXAS-XXXX-XXXX-XXXX",
  stepRenewalLicense:
    "اشتراك الحساب خلص. أرسل مفتاح تجديد صالح:",
  sessionExpired: "انتهت الجلسة. أرسل /start من جديد.",
  validating: "عم نتحقق من حساب تكساس والمفتاح…",
  registrationComplete: (endDate: string) =>
    `تم التسجيل ✅\n\nالاشتراك شغّال لحد: ${endDate}${miniAppReadyLine()}`,
  relinkSuccess: (endDate: string) =>
    `رجّعت على حسابك ✅\n\nالاشتراك شغّال لحد: ${endDate}${miniAppReadyLine()}`,
  relinkNoLicenseNeeded:
    "حسابك موجود واشتراكك شغّال — ما بتحتاج مفتاح جديد.",
  licenseInvalidNew: "المفتاح مو صالح أو مستخدم. تحقق وأعد الإرسال.",
  renewalLicenseInvalid: "مفتاح التجديد مو صالح أو مستخدم.",
  renewalLicenseAlreadyOnAccount:
    "هاد مفتاح الحساب الأصلي ومستخدم مسبقاً. أرسل مفتاح تجديد جديد.",
  licenseInvalid: "مفتاح الترخيص مو صالح أو مستخدم.",
  accountLinkedOtherTelegram:
    "هاد الحساب مربوط بتيليغرام تاني. تواصل مع الدعم.",
  accountNotFoundUseNew:
    "ما لقينا حساب بهالاسم. اختار «حساب جديد» من /start.",
  accountExistsUseLogin:
    "في حساب بهالاسم. اختار «تسجيل دخول» من /start.",
  subscriptionExpiredRenewal:
    "اشتراك الحساب خلص. أرسل مفتاح تجديد للمتابعة.",
  telegramAlreadyRegistered: "هاد التيليغرام مسجّل مسبقاً. أرسل /start.",
  texasLoginFailed: (detail: string) =>
    `فشل دخول تكساس. تأكد من الاسم وكلمة المرور.${detail}\n\nأرسل /start وجرّب مرة تانية.`,
  registrationFailed: (msg: string) =>
    `فشل التسجيل: ${msg}\n\nأرسل /start وجرّب مرة تانية.`,
  genkeyUsage:
    "الاستخدام:\n/genkey week | 1 | 3 | 6 | 12\nأو: /genkey 1w | 7d",
  genkeyFailed: (msg: string) => `ما انعمل المفتاح: ${msg}`,
  genkeySuccess: (label: string, key: string) =>
    `مفتاح جديد (${label}):\n\n<code>${key}</code>\n\nشاركه مع الماستر.`,
  channelGateRequired:
    "قبل ما نكمل، اشترك بقناة التحديثات الرسمية 👇\n\n@Texas0NEWS",
  channelGateVerified: `تمام ✅${miniAppReadyLine()}`,
  channelGateNotMember:
    "لسا ما اشتركت بالقناة. اشترك بـ @Texas0NEWS واضغط «تحققت».",
  broadcastUsage: "الاستخدام: /broadcast رسالتك هون",
  broadcastStarted: (total: number) =>
    `📢 بلّش الإرسال لـ ${total} مستخدم…`,
  broadcastDone: (sent: number, failed: number, skipped: number) =>
    `📢 انتهى البث\n✅ ${sent} | ❌ ${failed} | ⏭ ${skipped}`,
} as const;
