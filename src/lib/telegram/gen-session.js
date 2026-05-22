const { TelegramClient } = require("gramjs");
const { StringSession } = require("gramjs/sessions");
const readline = require("readline");

const apiId = 37826091;
const apiHash = "ac84088293facf4f9ff424d7e3c10674";
const stringSession = new StringSession(""); // جلسة جديدة فارغة

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

(async () => {
    console.log("⚡ جاري الاتصال بسيرفرات تيليغرام وبدء جلسة التحقق...");
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: "+963986961331",
        password: async () => new Promise((resolve) => rl.question("🔐 أدخل رمز التحقق بخطوتين 2FA (إذا كنت مفعله، أو اضغط Enter): ", resolve)),
        phoneCode: async () => new Promise((resolve) => rl.question("📩 أدخل الكود الذي وصلك على تطبيق تيليغرام الآن: ", resolve)),
        onError: (err) => console.log("❌ حدث خطأ:", err),
    });

    console.log("\n✅ تم تسجيل الدخول بنجاح التام!");
    console.log("\n👇 انسخ هذا الكود الطويل بالكامل وضعه في Railway 👇");
    console.log("==========================================================================");
    console.log(client.session.save()); // هذا هو السحر الذي سيطبع السيرنج جيسشن
    console.log("==========================================================================\n");
    
    rl.close();
    process.exit(0);
})();