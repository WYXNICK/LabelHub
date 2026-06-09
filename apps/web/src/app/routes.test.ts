import { describe, expect, it } from "vitest";

import { isRolePathAllowed, roleHomePath } from "./routes";

describe("role routes", () => {
  it("maps roles to isolated home paths", () => {
    expect(roleHomePath.OWNER).toBe("/owner/tasks");
    expect(roleHomePath.LABELER).toBe("/labeler/marketplace");
    expect(roleHomePath.REVIEWER).toBe("/reviewer/ai-review-queue");
  });

  it("allows only paths under the current role prefix", () => {
    expect(isRolePathAllowed("OWNER", "/owner/tasks")).toBe(true);
    expect(isRolePathAllowed("OWNER", "/labeler/marketplace")).toBe(false);
    expect(isRolePathAllowed("REVIEWER", "/reviewer")).toBe(true);
  });
});
