/** Browser-native EXP wallet adapters built on fetch and WebCrypto Ed25519. */
import {
  ExpWalletSdk,
  walletSigningBytes,
  type ExpWalletSdkOptions,
  type WalletFetch,
  type WalletPresentationSigner,
  type WalletRequestVerifier,
} from "./wallet-sdk.js";
import type { WalletConnectRequest } from "./wallet.js";

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Keeps the non-extractable private CryptoKey outside EXP records. */
export class WebCryptoEd25519Signer implements WalletPresentationSigner {
  public constructor(public readonly keyId: string, private readonly privateKey: CryptoKey) {
    if (privateKey.type !== "private" || privateKey.algorithm.name !== "Ed25519")
      throw new Error("EXP browser signer requires a private Ed25519 CryptoKey.");
  }

  public async sign(canonicalPayload: Uint8Array): Promise<string> {
    const signature = await crypto.subtle.sign("Ed25519", this.privateKey, new Uint8Array(canonicalPayload));
    return base64UrlEncode(new Uint8Array(signature));
  }
}

/** Verifies application requests only with keys the wallet has pinned through its trust policy. */
export class PinnedWebCryptoRequestVerifier implements WalletRequestVerifier {
  public constructor(private readonly keys: ReadonlyMap<string, CryptoKey>) {}

  public async verify(request: WalletConnectRequest, canonicalPayload: Uint8Array): Promise<boolean> {
    const key = this.keys.get(request.signature.keyId);
    if (key === undefined || key.type !== "public" || key.algorithm.name !== "Ed25519") return false;
    try {
      return await crypto.subtle.verify("Ed25519", key, base64UrlDecode(request.signature.value), new Uint8Array(canonicalPayload));
    } catch { return false; }
  }
}

/** Adapts the browser fetch implementation without exposing Response internals to the core SDK. */
export const browserWalletFetch: WalletFetch = async (input, init) => {
  const response = await fetch(input, init);
  return { ok: response.ok, status: response.status, json: () => response.json() as Promise<unknown> };
};

export interface BrowserWalletKeyMaterial {
  readonly signer: WebCryptoEd25519Signer;
  readonly publicKeyRaw: Uint8Array<ArrayBuffer>;
}

/** Generates a non-extractable Ed25519 private key and an exportable public key for registration. */
export async function generateBrowserWalletKey(keyId: string): Promise<BrowserWalletKeyMaterial> {
  const pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { signer: new WebCryptoEd25519Signer(keyId, pair.privateKey), publicKeyRaw };
}

/** Imports one trusted requester key; trust selection remains the wallet operator's responsibility. */
export async function importRequesterPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(raw), "Ed25519", false, ["verify"]);
}

export interface BrowserWalletSdkOptions extends Omit<ExpWalletSdkOptions, "fetch"> {
  readonly fetch?: WalletFetch;
}

/** Creates the complete outbound-only browser client with no inbound listener or server requirement. */
export function createBrowserWalletSdk(options: BrowserWalletSdkOptions): ExpWalletSdk {
  return new ExpWalletSdk({ ...options, fetch: options.fetch ?? browserWalletFetch });
}

export { walletSigningBytes };
