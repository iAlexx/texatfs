/** رسائل البوت بالعربية — الأوامر تبقى بالإنجليزي (/start, /genkey). */

export function miniAppHint(url?: string): string {
  const link = url?.trim();
  return link
    ? `\n\nافتح لوحة التحكم:\n${link}`
    : "\n\nافتح تكساس فاندز من قائمة البوت.";
}

export const botAr = {
  welcomeBackActive: (name: string, url?: string) =>
    `أهلاً بعودتك ${name}! اشتراكك فعّال.${miniAppHint(url)}`,
  subscriptionExpired:
    "انتهى اشتراكك. تواصل مع المسؤول للحصول على مفتاح ترخيص جديد.",
  sessionDbError:
    "تعذر بدء التسجيل (خطأ قاعدة بيانات). تواصل مع الدعم أو أعد المحاولة.",
  welcomeNew:
    "أهلاً بك في تكساس فاندز.\n\nالخطوة ١ من ٣ — أرسل اسم المستخدم أو البريد كما يظهر في agents.texas4win.com (الحروف مهمة، مثال: Alitest@Regional.Nsp):",
  sessionFetchError: "خطأ في جلسة التسجيل. أرسل /start للمحاولة من جديد.",
  sendStart: "أرسل /start لبدء التسجيل.",
  sessionInvalid: "الجلسة غير صالحة. أرسل /start للبدء من جديد.",
  loginInvalid:
    "بيانات دخول غير صالحة. أرسل اسم المستخدم أو البريد (٣–١٢٨ حرفاً، بدون مسافات). مثال: Alitest@Regional.Nsp",
  loginSaveError: "تعذر حفظ بيانات الدخول. أرسل /start وأعد المحاولة.",
  stepPassword:
    "الخطوة ٢ من ٣ — أرسل كلمة مرور لوحة تكساس.\n\n(تُشفّر الرسالة قبل التخزين.)",
  passwordShort: "كلمة المرور قصيرة جداً. أعد الإرسال.",
  passwordSaveError: "تعذر حفظ كلمة المرور. أرسل /start وأعد المحاولة.",
  stepLicense:
    "الخطوة ٣ من ٣ — أرسل مفتاح الترخيص (مثال: TEXAS-XXXX-XXXX-XXXX):",
  sessionExpired: "انتهت الجلسة. أرسل /start للتسجيل من جديد.",
  validating: "جاري التحقق من حساب تكساس ومفتاح الترخيص…",
  registrationComplete: (endDate: string) =>
    `اكتمل التسجيل.\n\nالاشتراك فعّال حتى: ${endDate}${miniAppHint()}`,
  licenseInvalid:
    "مفتاح ترخيص غير صالح أو مستخدم مسبقاً. تحقق من المفتاح وأعد الإرسال.",
  telegramAlreadyRegistered:
    "هذا حساب تيليغرام مسجّل مسبقاً. أرسل /start.",
  texasLoginFailed: (detail: string) =>
    `فشل دخول تكساس. استخدم اسم المستخدم وكلمة المرور من agents.texas4win.com (حساسة لحالة الأحرف).${detail}\n\nأرسل /start للمحاولة من جديد.`,
  registrationFailed: (msg: string) =>
    `فشل التسجيل: ${msg}\n\nأرسل /start للمحاولة من جديد.`,
  genkeyUsage:
    "الاستخدام: /genkey [1|3|6|12]\nمثال: /genkey 12",
  genkeyFailed: (msg: string) => `تعذر إنشاء المفتاح: ${msg}`,
  genkeySuccess: (duration: string, key: string) =>
    `مفتاح ترخيص جديد (${duration} شهر):\n\n<code>${key}</code>\n\nشاركه مع الماستر أثناء التسجيل.`,
} as const;
