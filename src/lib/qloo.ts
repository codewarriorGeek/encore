import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// One long-lived `qloo mcp` process per server. It is a stdio server, so this
// app must run on a VM or container (not serverless), with QLOO_API_KEY set.
let clientPromise: Promise<Client> | null = null;

function connect(): Promise<Client> {
  const client = new Client({ name: "encore", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.env.QLOO_BIN ?? "qloo",
    args: ["mcp"],
    // The SDK forwards only a small default env; QLOO_API_KEY must reach the server.
    env: process.env as Record<string, string>,
  });
  transport.onclose = () => {
    clientPromise = null;
  };
  return client.connect(transport).then(() => client);
}

export function qloo(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

// Readiness check that does not call the Qloo API.
export async function qlooReady(): Promise<boolean> {
  const result = await (await qloo()).callTool({ name: "qloo_capabilities", arguments: {} });
  const content = result.structuredContent as { adapter?: { ready?: boolean } } | undefined;
  return content?.adapter?.ready === true;
}

export type QlooTool = { name: string; description: string; inputSchema: Record<string, unknown> };

// Qloo MCP tools, provider-neutral. qloo_capabilities is left out:
// it is a health check, not something the agent needs.
export async function qlooTools(): Promise<QlooTool[]> {
  const { tools } = await (await qloo()).listTools();
  return tools
    .filter((t) => t.name !== "qloo_capabilities")
    .map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema }));
}

// Runs one Qloo tool and returns its result envelope as JSON text
// (status ok | empty | needs_input | partial | degraded | error).
export async function callQloo(name: string, args: unknown): Promise<{ text: string; isError: boolean }> {
  const result = await (await qloo()).callTool({
    name,
    arguments: (args ?? {}) as Record<string, unknown>,
  });
  const envelope = (result.structuredContent ?? {}) as { status?: string };
  return {
    text: JSON.stringify(result.structuredContent ?? result.content),
    isError: result.isError === true || envelope.status === "error",
  };
}
