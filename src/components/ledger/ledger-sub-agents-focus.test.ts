import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGenkeyArgs, licenseDurationLabel } from "@/lib/telegram/admin";

function readSrc(rel: string): string {
  return readFileSync(
    join(process.cwd(), "src", rel.replace(/^src\//, "")),
    "utf8"
  );
}

describe("premium sub-agents UI", () => {
  it("DailyLedgerView uses card dashboard not table or history tabs", () => {
    const src = readSrc("components/ledger/DailyLedgerView.tsx");
    assert.ok(src.includes("SubAgentsDashboard"));
    assert.ok(!src.includes("LedgerHistoryNav"));
    assert.ok(!src.includes("LedgerTabBar"));
    assert.ok(!src.includes("SubAgentsTabPanel"));
    assert.ok(!src.includes('activeTab === "history"'));
    assert.ok(!src.includes("ExecutiveLedgerReport"));
  });

  it("SubAgentsDashboard uses cards not table columns", () => {
    const src = readSrc("components/ledger/SubAgentsDashboard.tsx");
    assert.ok(src.includes("AgentCard"));
    assert.ok(src.includes("AgentDetailSheet"));
    assert.ok(!src.includes("SUBAGENTS_COL_HEADERS"));
    assert.ok(!src.includes("MiniStat"));
    assert.ok(!src.includes("<table"));
    assert.ok(src.includes("agentsHeroTitle"));
  });

  it("AgentDetailSheet shows metrics only in sheet", () => {
    const src = readSrc("components/ledger/AgentDetailSheet.tsx");
    assert.ok(src.includes("MetricGrid"));
    assert.ok(src.includes("ar.tebat"));
    assert.ok(src.includes("ar.alNihai"));
    assert.ok(src.includes("metricsSourceLabel"));
  });
});

describe("premium TMA navigation", () => {
  it("bottom nav has four sections including WhatsApp", () => {
    const src = readSrc("components/tma/TmaBottomNav.tsx");
    assert.ok(src.includes('href: "/home"'));
    assert.ok(src.includes('href: "/ledger"'));
    assert.ok(src.includes('href: "/whatsapp"'));
    assert.ok(src.includes('href: "/profile"'));
    assert.ok(src.includes("ar.navWhatsapp"));
  });

  it("home uses premium page without accounting totals", () => {
    const home = readSrc("app/(tma)/home/page.tsx");
    assert.ok(home.includes("PremiumHomePage"));
    const premium = readSrc("components/tma/PremiumHomePage.tsx");
    assert.ok(!premium.includes("al_nihai"));
    assert.ok(!premium.includes("network_total_burn"));
    assert.ok(!premium.includes("VaultChart"));
  });

  it("whatsapp route exists", () => {
    const src = readSrc("app/(tma)/whatsapp/page.tsx");
    assert.ok(src.includes("WhatsAppPage"));
  });
});

describe("forbidden user-facing labels", () => {
  it('no "حسابي" or "سجل المحاسبة" in main TMA flow', () => {
    const files = [
      "components/tma/PremiumHomePage.tsx",
      "components/tma/TmaBottomNav.tsx",
      "components/tma/ProfilePage.tsx",
      "components/tma/WhatsAppCenter.tsx",
      "components/ledger/DailyLedgerView.tsx",
      "components/ledger/SubAgentsDashboard.tsx",
    ];
    for (const f of files) {
      const src = readSrc(f);
      assert.ok(!src.includes("حسابي"), `${f} must not contain حسابي`);
      assert.ok(!src.includes("سجل المحاسبة"), `${f} must not contain سجل المحاسبة`);
    }
  });

  it('ar.tebat is تعبئات not تبات', () => {
    const src = readSrc("lib/i18n/ar.ts");
    assert.ok(src.includes('tebat: "تعبئات"'));
    assert.ok(!src.includes('tebat: "تبات"'));
  });
});

describe("genkey week duration", () => {
  it("parses week aliases", () => {
    assert.equal(parseGenkeyArgs("/genkey week"), "week");
    assert.equal(parseGenkeyArgs("/genkey 1w"), "week");
    assert.equal(parseGenkeyArgs("/genkey 7d"), "week");
    assert.equal(parseGenkeyArgs("/genkey 12"), "12");
  });

  it("labels week in Arabic", () => {
    assert.equal(licenseDurationLabel("week"), "أسبوع");
  });
});
