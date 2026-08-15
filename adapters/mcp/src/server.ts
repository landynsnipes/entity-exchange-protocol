import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type {
  ExpTransport,
  ExpTransportOptions,
  ExpTransportRequest,
  ExpTransportResponse,
  ExpTransportSignature,
} from "@exp/protocol/transport";

const signatureSchema = z.object({
  algorithm: z.string().min(1).max(100),
  keyId: z.string().min(1).max(500),
  signature: z.string().min(16).max(4096),
  signedAt: z.string().datetime(),
});

const requestSchema = z.object({
  messageId: z.string().min(1).max(256),
  operation: z.string().min(1).max(256),
  senderId: z.string().min(1).max(256),
  recipientId: z.string().min(1).max(256).optional(),
  nonce: z.string().min(16).max(256),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  payloadBase64: z.string().min(1).max(1_500_000),
  signature: signatureSchema.optional(),
  deadlineAt: z.string().datetime().optional(),
  requestId: z.string().min(1).max(256).optional(),
});

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  status: z.number().int().optional(),
  requestId: z.string().optional(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});

const responseSchema = z.object({
  messageId: z.string(),
  accepted: z.boolean(),
  receivedAt: z.string().datetime(),
  payloadBase64: z.string().optional(),
  error: errorSchema.optional(),
});

export type ExpMcpRequest = z.infer<typeof requestSchema>;
export type ExpMcpResponse = z.infer<typeof responseSchema>;

export interface ExpMcpServerOptions {
  readonly transport: ExpTransport;
  readonly name?: string;
  readonly version?: string;
  readonly readResource?: (uri: string) => Promise<ExpTransportResponse>;
}

function decodePayload(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function encodePayload(value: Uint8Array | undefined): string | undefined {
  return value === undefined ? undefined : Buffer.from(value).toString("base64");
}

function toRequest(input: ExpMcpRequest): {
  readonly request: ExpTransportRequest;
  readonly options: ExpTransportOptions;
} {
  const {
    deadlineAt,
    requestId,
    messageId,
    operation,
    senderId,
    recipientId,
    nonce,
    createdAt,
    expiresAt,
    payloadBase64,
    signature,
  } = input;
  return {
    request: {
      messageId,
      operation,
      senderId,
      ...(recipientId === undefined ? {} : { recipientId }),
      nonce,
      createdAt,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      payload: decodePayload(payloadBase64),
      ...(signature === undefined ? {} : { signature: signature as ExpTransportSignature }),
    },
    options: {
      ...(deadlineAt === undefined ? {} : { deadlineAt }),
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
}

function toResponse(response: ExpTransportResponse): ExpMcpResponse {
  return {
    messageId: response.messageId,
    accepted: response.accepted,
    receivedAt: response.receivedAt,
    ...(encodePayload(response.payload) === undefined ? {} : { payloadBase64: encodePayload(response.payload) }),
    ...(response.error === undefined ? {} : { error: response.error }),
  };
}

export function createExpMcpServer(options: ExpMcpServerOptions): McpServer {
  const server = new McpServer({
    name: options.name ?? "exp-mcp-adapter",
    version: options.version ?? "0.1.0",
  });

  server.registerTool(
    "exp_deliver",
    {
      title: "Deliver an EXP message",
      description: "Deliver one user-authorized, signed EXP message through MCP.",
      inputSchema: requestSchema,
      outputSchema: responseSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      const { request, options: requestOptions } = toRequest(input);
      const result = toResponse(await options.transport.send(request, requestOptions));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
        ...(result.accepted ? {} : { isError: true }),
      };
    },
  );

  if (options.readResource !== undefined) {
    server.registerResource(
      "exp-authorized-context",
      "exp://authorized-context",
      {
        title: "Authorized EXP context",
        description: "Read-only context returned only after EXP authorization.",
        mimeType: "application/json",
      },
      async (uri) => {
        const result = await options.readResource?.(uri.href);
        if (result === undefined || !result.accepted) {
          throw new Error("EXP authorization is required before reading context.");
        }
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(toResponse(result)),
          }],
        };
      },
    );
  }

  return server;
}
