"use client";

export function SubscriptionExpiredOverlay({
  subscriptionEndDate,
}: {
  subscriptionEndDate?: string | null;
}) {
  const formatted = subscriptionEndDate
    ? new Date(subscriptionEndDate).toLocaleDateString("ar-SY", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/95 px-6">
      <div className="panel-steel max-w-sm p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-steel-500">
          TEXAS FUNDS
        </p>
        <h2 className="mt-2 text-xl font-semibold text-accent-negative">
          Subscription Expired
        </h2>
        <p className="mt-3 text-sm text-steel-400" dir="rtl">
          انتهى اشتراكك. يرجى التواصل مع المسؤول للحصول على مفتاح ترخيص جديد.
        </p>
        {formatted && (
          <p className="mt-2 font-mono text-xs text-steel-600">
            Ended: {formatted}
          </p>
        )}
        <p className="mt-4 text-xs text-steel-600">
          Send /start to the Telegram bot after renewal.
        </p>
      </div>
    </div>
  );
}
