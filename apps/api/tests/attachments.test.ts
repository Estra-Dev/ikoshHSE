import request from "supertest";
import { promises as fs } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Attachment } from "../src/models/Attachment.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { attachmentSizeLimit } from "../src/lib/validation/attachment.js";
import {
  generateAttachmentStorageKey,
  getAttachmentStorageDir,
  resolveAttachmentPath,
  sanitizeOriginalFilename,
} from "../src/lib/attachments/storage.js";
import { signInAsIkoshUser } from "./helpers.js";

const storageDir = getAttachmentStorageDir();
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
]);

let sequence = 0;

async function createSite() {
  sequence += 1;
  const project = await Project.create({
    name: `Project ${sequence}`,
    code: `PRJ${sequence}`,
  });
  return Site.create({
    project: project._id,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
  });
}

function upload(
  authorization: string,
  buffer: Buffer,
  options: {
    filename?: string;
    contentType?: string;
    entityId?: string;
    entityType?: string;
    checksum?: string;
  } = {},
) {
  const call = request(app)
    .post("/api/attachments")
    .set("Authorization", authorization)
    .attach("file", buffer, {
      filename: options.filename ?? "evidence.png",
      contentType: options.contentType ?? "image/png",
    });

  if (options.entityType) call.field("entityType", options.entityType);
  if (options.entityId) call.field("entityId", options.entityId);
  if (options.checksum) call.field("checksum", options.checksum);

  return call;
}

describe("attachment storage utilities", () => {
  it("rejects storage keys that could traverse outside the storage root", () => {
    expect(() => resolveAttachmentPath("../../etc/passwd")).toThrow();
    expect(() => resolveAttachmentPath("not-a-valid-key")).toThrow();
    expect(() => resolveAttachmentPath("a".repeat(64))).not.toThrow();
    expect(generateAttachmentStorageKey()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sanitizes unsafe client filenames for display", () => {
    expect(sanitizeOriginalFilename("../../evil.png")).toBe("evil.png");
    expect(sanitizeOriginalFilename("..\\..\\evil.png")).toBe("evil.png");
    expect(sanitizeOriginalFilename("bad\u0000name.png")).toBe("badname.png");
    expect(sanitizeOriginalFilename("..")).toBe("attachment");
  });
});

describe("attachments API", () => {
  beforeEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires authentication for uploads and downloads", async () => {
    const uploadResponse = await request(app).post("/api/attachments");
    const downloadResponse = await request(app).get(
      "/api/attachments/000000000000000000000000/download",
    );

    expect(uploadResponse.status).toBe(401);
    expect(downloadResponse.status).toBe(401);
  });

  it("uploads, stores and streams a valid file with a verified checksum", async () => {
    const site = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const created = await upload(authorization, PNG, {
      entityType: "site",
      entityId: String(site._id),
    });

    expect(created.status).toBe(201);
    expect(created.body.attachment).toMatchObject({
      originalFilename: "evidence.png",
      mimeType: "image/png",
      size: PNG.length,
      entityType: "site",
      entityId: String(site._id),
    });
    expect(created.body.attachment).not.toHaveProperty("storageKey");

    const stored = await Attachment.findById(created.body.attachment.id);
    expect(stored).not.toBeNull();
    expect(stored?.storageKey).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.storageKey).not.toContain("evidence");

    const downloaded = await request(app)
      .get(`/api/attachments/${created.body.attachment.id}/download`)
      .set("Authorization", authorization);

    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toContain("image/png");
    expect(downloaded.headers["x-content-type-options"]).toBe("nosniff");
    expect(downloaded.body).toHaveLength(PNG.length);
    expect(Buffer.from(downloaded.body).equals(PNG)).toBe(true);
  });

  it("rejects files whose content does not match the declared MIME type", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const response = await upload(authorization, Buffer.from("not an image"), {
      filename: "spoofed.png",
      contentType: "image/png",
    });

    expect(response.status).toBe(400);
    expect(await Attachment.countDocuments({})).toBe(0);
  });

  it("rejects files above the configured size limit", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const oversized = Buffer.alloc(attachmentSizeLimit + 1, 0x41);

    const response = await upload(authorization, oversized, {
      filename: "big.txt",
      contentType: "text/plain",
    });

    expect(response.status).toBe(413);
    expect(await Attachment.countDocuments({})).toBe(0);
  });

  it("rejects a client checksum that does not match the uploaded bytes", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const response = await upload(authorization, PNG, {
      checksum: "a".repeat(64),
    });

    expect(response.status).toBe(400);
    expect(await Attachment.countDocuments({})).toBe(0);
  });

  it("removes the stored file when the database write fails", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    vi.spyOn(AuditLog, "create").mockRejectedValue(
      new Error("audit store unavailable"),
    );

    const response = await upload(authorization, PNG);

    expect(response.status).toBe(500);
    expect(await Attachment.countDocuments({})).toBe(0);

    const files = await fs.readdir(storageDir).catch(() => []);
    expect(files).toEqual([]);
  });

  it("prevents path traversal through client filenames", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const response = await upload(authorization, PNG, {
      filename: "../../evil.png",
    });

    expect(response.status).toBe(201);
    expect(response.body.attachment.originalFilename).toBe("evil.png");

    const files = await fs.readdir(storageDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("restricts downloads to the uploader, HSE management or assigned site", async () => {
    const siteA = await createSite();
    const siteB = await createSite();
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const employeeA = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [siteA._id],
    });
    const employeeB = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [siteB._id],
    });
    const unassigned = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const linked = await upload(manager.authorization, PNG, {
      entityType: "site",
      entityId: String(siteA._id),
    });

    const allowed = await request(app)
      .get(`/api/attachments/${linked.body.attachment.id}/download`)
      .set("Authorization", employeeA.authorization);
    const crossSite = await request(app)
      .get(`/api/attachments/${linked.body.attachment.id}/download`)
      .set("Authorization", employeeB.authorization);
    const noAssignment = await request(app)
      .get(`/api/attachments/${linked.body.attachment.id}/download`)
      .set("Authorization", unassigned.authorization);

    expect(allowed.status).toBe(200);
    expect(crossSite.status).toBe(404);
    expect(noAssignment.status).toBe(404);

    const employeeUploadToOtherSite = await upload(employeeB.authorization, PNG, {
      entityType: "site",
      entityId: String(siteA._id),
    });

    expect(employeeUploadToOtherSite.status).toBe(404);
  });

  it("allows owners to download their own unlinked files only", async () => {
    const owner = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const other = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const created = await upload(owner.authorization, PNG);
    expect(created.status).toBe(201);

    const ownDownload = await request(app)
      .get(`/api/attachments/${created.body.attachment.id}/download`)
      .set("Authorization", owner.authorization);
    const otherDownload = await request(app)
      .get(`/api/attachments/${created.body.attachment.id}/download`)
      .set("Authorization", other.authorization);

    expect(ownDownload.status).toBe(200);
    expect(otherDownload.status).toBe(404);
  });

  it("refuses to stream a file whose bytes no longer match the checksum", async () => {
    const site = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const created = await upload(authorization, PNG, {
      entityType: "site",
      entityId: String(site._id),
    });
    const stored = await Attachment.findById(created.body.attachment.id);

    expect(stored).not.toBeNull();

    await fs.writeFile(
      resolveAttachmentPath(String(stored?.storageKey)),
      Buffer.from("tampered"),
    );

    const response = await request(app)
      .get(`/api/attachments/${created.body.attachment.id}/download`)
      .set("Authorization", authorization);

    expect(response.status).toBe(409);
  });

  it("audits attachment metadata updates reliably", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await upload(manager.authorization, PNG);
    expect(created.status).toBe(201);

    const updated = await request(app)
      .patch(`/api/attachments/${created.body.attachment.id}`)
      .set("Authorization", manager.authorization)
      .send({ description: "Scene photograph" });

    expect(updated.status).toBe(200);

    const log = await AuditLog.findOne({ action: "attachment.updated" }).lean();
    expect(log).not.toBeNull();
    expect(String(log?.entityId)).toBe(created.body.attachment.id);
    expect(log?.after).toMatchObject({ mimeType: "image/png" });
    expect(log?.after).not.toHaveProperty("storageKey");
  });
});
