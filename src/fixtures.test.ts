/** Validates shipped conformance fixtures against their public profile contracts. */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogRegistrationSchema, signedCatalogDiscoveryQuerySchema } from "./catalog.js";
import { commerceIntentSchema, productOfferSchema } from "./commerce.js";
import { intentProjectionSchema } from "./foundation.js";
import { standingMatchNotificationSchema } from "./standing.js";
import { hospitalityIntentSchema, hospitalityServiceOfferSchema } from "./hospitality.js";

const examplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../examples");

/** Reads one checked-in JSON fixture without interpreting it before schema validation. */
async function fixture(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(examplesRoot, relativePath), "utf8")) as unknown;
}

describe("public conformance fixtures", () => {
  it("accepts the reciprocal Commerce Profile examples", async () => {
    expect(commerceIntentSchema.parse(await fixture("commerce/consumer-intent.valid.json")).direction).toBe("seek");
    expect(productOfferSchema.parse(await fixture("commerce/product-offer.valid.json")).availability).toBe("available");
  });

  it("accepts the additive Hospitality Profile examples", async () => {
    expect(hospitalityIntentSchema.parse(await fixture("hospitality/intent.valid.json")).profileId)
      .toBe("org.entity-exchange.profile.hospitality");
    expect(hospitalityServiceOfferSchema.parse(await fixture("hospitality/service-offer.valid.json")).serviceKind)
      .toBe("venue");
  });

  it("rejects an intent projection that includes raw conversation content", async () => {
    const invalidProjection = await fixture("foundation/raw-conversation.invalid.json");
    expect(() => intentProjectionSchema.parse(invalidProjection)).toThrow();
  });

  it("accepts a safe catalog reference and rejects indexed identity", async () => {
    expect(catalogRegistrationSchema.parse(await fixture("catalog/registration.valid.json")).containsIdentity).toBe(false);
    const identityLeak = await fixture("catalog/identity-leak.invalid.json");
    expect(() => catalogRegistrationSchema.parse(identityLeak)).toThrow();
  });

  it("accepts a signed, expiring discovery request", async () => {
    expect(signedCatalogDiscoveryQuerySchema.parse(await fixture("catalog/signed-discovery-query.valid.json")).nonce).toBeTruthy();
  });

  it("accepts a privacy-safe standing notification and rejects embedded counterparty identity", async () => {
    const safeNotification = await fixture("standing/notification.valid.json");
    expect(standingMatchNotificationSchema.parse(safeNotification).containsIdentity).toBe(false);
    const identityLeak = await fixture("standing/identity-leak.invalid.json");
    expect(() => standingMatchNotificationSchema.parse(identityLeak)).toThrow();
  });
});
