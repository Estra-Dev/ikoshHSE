import { describe, expect, it, vi } from "vitest";
import { buildManagementOfChangeSearchParams } from "./management-of-change";

vi.mock("./client", () => ({
  useApi: vi.fn(),
}));

describe("management of change list search params", () => {
  it("sends default paging and omits empty filters", () => {
    const params = buildManagementOfChangeSearchParams({});

    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("20");
    expect(params.get("status")).toBeNull();
    expect(params.get("projectId")).toBeNull();
    expect(params.get("siteId")).toBeNull();
    expect(params.get("q")).toBeNull();
  });

  it("sends trimmed search text and explicit filters", () => {
    const params = buildManagementOfChangeSearchParams({
      page: 3,
      limit: 50,
      status: "ASSESSMENT",
      projectId: "507f1f77bcf86cd799439011",
      siteId: "507f1f77bcf86cd799439012",
      q: "  pump replacement  ",
    });

    expect(params.get("page")).toBe("3");
    expect(params.get("limit")).toBe("50");
    expect(params.get("status")).toBe("ASSESSMENT");
    expect(params.get("projectId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("siteId")).toBe("507f1f77bcf86cd799439012");
    expect(params.get("q")).toBe("pump replacement");
  });

  it("drops a whitespace-only search instead of sending it", () => {
    const params = buildManagementOfChangeSearchParams({ q: "   " });

    expect(params.get("q")).toBeNull();
  });
});
