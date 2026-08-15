import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { createExpMcpServer } from "../src/server.js";
import type { ExpTransport, ExpTransportRequest } from "@exp/protocol/transport";

function transport(accepted: boolean): ExpTransport {
  return {
    send: async (request: ExpTransportRequest) => accepted
      ? {
        messageId: request.messageId,
        accepted: true,
        receivedAt: "2026-08-14T20:00:00.000Z",
        payload: request.payload,
      }
      : {
        messageId: request.messageId,
        accepted: false,
        receivedAt: "2026-08-14T20:00:00.000Z",
        error: { code: "EXP_UNAUTHORIZED", message: "Consent required.", retryable: false },
      },
  };
}

async function connectedServer(expTransport: ExpTransport) {
  const server = createExpMcpServer({
    transport: expTransport,
    readResource: async () => ({
      messageId: "resource-1",
      accepted: true,
      receivedAt: "2026-08-14T20:00:00.000Z",
      payload: new TextEncoder().encode('{"scope":"hospitality.seating"}'),
    }),
  });
  const client = new Client({ name: "exp-mcp-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

describe("EXP MCP adapter", () => {
  it("maps an authorized EXP delivery through an MCP tool", async () => {
    const { client, server } = await connectedServer(transport(true));
    const result = await client.callTool({
      name: "exp_deliver",
      arguments: {
        messageId: "mcp-message-1",
        operation: "context:read",
        senderId: "wallet",
        recipientId: "service",
        nonce: "mcp-test-nonce-0001",
        createdAt: "2026-08-14T20:00:00.000Z",
        payloadBase64: Buffer.from('{"scope":"hospitality.seating"}').toString("base64"),
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ accepted: true, messageId: "mcp-message-1" });
    await client.close();
    await server.close();
  });

  it("returns EXP authorization failures without bypassing consent", async () => {
    const { client, server } = await connectedServer(transport(false));
    const result = await client.callTool({
      name: "exp_deliver",
      arguments: {
        messageId: "mcp-message-2",
        operation: "context:read",
        senderId: "wallet",
        nonce: "mcp-test-nonce-0002",
        createdAt: "2026-08-14T20:00:00.000Z",
        payloadBase64: Buffer.from("{}").toString("base64"),
      },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ accepted: false, error: { code: "EXP_UNAUTHORIZED" } });
    await client.close();
    await server.close();
  });

  it("exposes authorized context as a read-only MCP resource", async () => {
    const { client, server } = await connectedServer(transport(true));
    const result = await client.readResource({ uri: "exp://authorized-context" });
    expect(result.contents[0]).toMatchObject({ mimeType: "application/json" });
    const resourcePayload = JSON.parse(result.contents[0]?.text ?? "{}") as { payloadBase64?: string };
    expect(Buffer.from(resourcePayload.payloadBase64 ?? "", "base64").toString("utf8")).toContain("hospitality.seating");
    await client.close();
    await server.close();
  });
});
