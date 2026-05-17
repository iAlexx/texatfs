export class SubscriptionExpiredError extends Error {
  readonly code = "SUBSCRIPTION_EXPIRED";

  constructor(userId?: string) {
    super(
      userId
        ? `Subscription expired for user ${userId}`
        : "Subscription expired"
    );
    this.name = "SubscriptionExpiredError";
  }
}
