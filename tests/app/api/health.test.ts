import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getHealth } from "@/app/api/health/route";
import * as repoModule from "@/lib/db/repo";
import * as configModule from "@/lib/config";

describe("GET /api/health (Section 14.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with health details and Cache-Control: no-store", async () => {
    vi.spyOn(repoModule, "checkDatabaseConnection").mockResolvedValue(true);
    vi.spyOn(configModule, "getConfig").mockReturnValue({
      APP_MODE: "live",
      QLOO_API_KEY: "secret-key",
      LLM_API_KEY: "llm-key",
    } as ReturnType<typeof configModule.getConfig>);

    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await getHealth(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.mode).toBe("live");
    expect(data.qlooConfigured).toBe(true);
    expect(data.llmConfigured).toBe(true);
    expect(data.dbOk).toBe(true);
    expect(data.now).toBeDefined();

    // Never leak secrets or connection strings
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("secret-key");
    expect(serialized).not.toContain("llm-key");
  });

  it("returns ok: false when db check fails", async () => {
    vi.spyOn(repoModule, "checkDatabaseConnection").mockResolvedValue(false);

    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await getHealth(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.dbOk).toBe(false);
  });
});
