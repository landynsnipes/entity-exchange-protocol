/**
 * Module: EXP compatibility contracts
 * Purpose: Publishes explicit version capabilities and deterministic negotiation helpers.
 */
import { z } from "zod";
import { EXP_FOUNDATION_VERSION } from "./foundation.js";
import { EXP_COMMERCE_PROFILE_VERSION } from "./commerce.js";
import { EXP_RELATIONSHIP_PROFILE_VERSION } from "./relationship.js";
import { EXP_CATALOG_VERSION } from "./catalog.js";
import { EXP_STANDING_VERSION } from "./standing.js";
import { EXP_TRUST_VERSION } from "./trust.js";
import { EXP_WALLET_PROFILE_VERSION } from "./wallet.js";
import { EXP_HOSPITALITY_PROFILE_VERSION } from "./hospitality.js";

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

/** Identifies the wire-level EXP version independently from profile versions. */
export const EXP_PROTOCOL_VERSION = "0.1.0" as const;

/** Identifies the first profile schema set. */
export const EXP_PROFILE_VERSION = "0.1.0" as const;

export const expVersionSchema = z.string().regex(versionPattern, "Version must use semantic version notation.");

export const expVersionFamilySchema = z.enum([
  "protocol",
  "profile",
  "foundation",
  "catalog",
  "standing",
  "trust",
  "wallet",
  "commerce",
  "relationship",
  "hospitality",
]);

export const versionCapabilitiesSchema = z.object({
  protocol: z.array(expVersionSchema).min(1),
  profile: z.array(expVersionSchema).min(1),
  foundation: z.array(expVersionSchema).min(1),
  catalog: z.array(expVersionSchema).min(1),
  standing: z.array(expVersionSchema).min(1),
  trust: z.array(expVersionSchema).min(1),
  wallet: z.array(expVersionSchema).min(1),
  commerce: z.array(expVersionSchema).min(1),
  relationship: z.array(expVersionSchema).min(1),
  hospitality: z.array(expVersionSchema).min(1),
}).strict().superRefine((capabilities, context) => {
  for (const [family, versions] of Object.entries(capabilities)) {
    if (new Set(versions).size !== versions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [family],
        message: "Supported versions must be unique.",
      });
    }
  }
});

export type ExpVersionFamily = z.infer<typeof expVersionFamilySchema>;
export type VersionCapabilities = z.infer<typeof versionCapabilitiesSchema>;

/**
 * The versions implemented by this public release. Future versions must be
 * explicitly added here and covered by new schemas and conformance fixtures.
 */
export const EXP_SUPPORTED_VERSIONS: VersionCapabilities = versionCapabilitiesSchema.parse({
  protocol: [EXP_PROTOCOL_VERSION],
  profile: [EXP_PROFILE_VERSION],
  foundation: [EXP_FOUNDATION_VERSION],
  catalog: [EXP_CATALOG_VERSION],
  standing: [EXP_STANDING_VERSION],
  trust: [EXP_TRUST_VERSION],
  wallet: [EXP_WALLET_PROFILE_VERSION],
  commerce: [EXP_COMMERCE_PROFILE_VERSION],
  relationship: [EXP_RELATIONSHIP_PROFILE_VERSION],
  hospitality: [EXP_HOSPITALITY_PROFILE_VERSION],
});

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | undefined;
}

function parseVersion(version: string): ParsedVersion {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(version);
  if (match === null) throw new Error(`Unsupported version format: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return a.major - b.major
    || a.minor - b.minor
    || a.patch - b.patch
    || (a.prerelease === undefined ? 1 : b.prerelease === undefined ? -1 : a.prerelease.localeCompare(b.prerelease));
}

/** Returns whether this release explicitly supports one family/version pair. */
export function supportsVersion(family: ExpVersionFamily, version: string): boolean {
  return EXP_SUPPORTED_VERSIONS[family].includes(version);
}

/** Throws when a family/version pair is not explicitly supported by this release. */
export function assertSupportedVersion(family: ExpVersionFamily, version: string): void {
  if (!expVersionSchema.safeParse(version).success || !supportsVersion(family, version)) {
    throw new Error(`Unsupported EXP ${family} version: ${version}`);
  }
}

/**
 * Selects the highest exact version shared by two capability lists.
 * Major-version compatibility is never inferred from a matching major number.
 */
export function negotiateVersion(
  family: ExpVersionFamily,
  localVersions: readonly string[],
  remoteVersions: readonly string[],
): string | undefined {
  const local = new Set(localVersions.filter((version) => supportsVersion(family, version)));
  return [...new Set(remoteVersions)]
    .filter((version) => local.has(version) && supportsVersion(family, version))
    .sort(compareVersions)
    .at(-1);
}
