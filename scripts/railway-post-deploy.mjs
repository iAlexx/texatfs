/**
 * After Railway deploy: verify health + print webhook registration command.
 * Usage: node scripts/railway-post-deploy.mjs https://your-app.up.railway.app
 */
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/railway-post-deploy.mjs <railway-public-url>");
  process.exit(1);
}

const healthUrl = `${base}/api/health`;
const webhookUrl = `${base}/api/telegram/webhook`;

const health = await fetch(healthUrl);
const healthJson = await health.json().catch(() => ({}));
const webhookGet = await fetch(webhookUrl);

console.log(
  JSON.stringify(
    {
      health: { url: healthUrl, status: health.status, body: healthJson },
      webhookGet: { url: webhookUrl, status: webhookGet.status },
      nextSteps: [
        `npm run telegram:webhook -- ${webhookUrl}`,
        "npm run telegram:check",
      ],
    },
    null,
    2
  )
);

if (!health.ok) process.exit(1);
