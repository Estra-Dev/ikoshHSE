import { describe, expect, it, vi } from "vitest";
import { EMPTY_PERMIT_FILTERS } from "../permits";
import { buildListSearchParams } from "./permits";
vi.mock("./client", () => ({
  useApi: vi.fn(),
}));

describe("permit list search params", () => {
  it("omits attention when the register is not in an attention view", () => {
    const params = buildListSearchParams(EMPTY_PERMIT_FILTERS);

    expect(params.get("attention")).toBeNull();
  });

  it("sends the attention filter with its implied ACTIVE status", () => {
    const params = buildListSearchParams({
      ...EMPTY_PERMIT_FILTERS,
      status: "ACTIVE",
      attention: "ACTIVE_EXPIRING_SOON",
      siteId: "507f1f77bcf86cd799439011",
      page: 1,
      limit: 1,
    });

    expect(params.get("attention")).toBe("ACTIVE_EXPIRING_SOON");
    expect(params.get("status")).toBe("ACTIVE");
    expect(params.get("siteId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("limit")).toBe("1");
  });
});
