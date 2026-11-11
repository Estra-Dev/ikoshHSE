import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Private local-disk storage for attachment bytes.
 *
 * Storage keys are server-generated opaque identifiers. Client-supplied
 * filenames never participate in the on-disk path, and keys are validated
 * against a strict pattern before being resolved, preventing traversal.
 */

const STORAGE_KEY_PATTERN = /^[a-f0-9]{64}$/;

/** Returns the configured private storage directory. */
export function getAttachmentStorageDir(): string {
  const configured = process.env.ATTACHMENT_STORAGE_DIR?.trim();

  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), "storage", "attachments");
}

export function isAttachmentStorageKey(value: string): boolean {
  return STORAGE_KEY_PATTERN.test(value);
}

/** Generates an opaque storage key that carries no filename information. */
export function generateAttachmentStorageKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Resolves a storage key to an absolute path, refusing any key that could
 * escape the configured storage directory.
 */
export function resolveAttachmentPath(storageKey: string): string {
  if (!isAttachmentStorageKey(storageKey)) {
    throw new Error("Invalid attachment storage key.");
  }

  const directory = getAttachmentStorageDir();
  const resolved = path.resolve(directory, storageKey);
  const relative = path.relative(directory, resolved);

  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Invalid attachment storage key.");
  }

  return resolved;
}

export async function saveAttachmentBytes(buffer: Buffer): Promise<string> {
  const storageKey = generateAttachmentStorageKey();
  const directory = getAttachmentStorageDir();
  const target = resolveAttachmentPath(storageKey);

  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(target, buffer, { flag: "wx", mode: 0o600 });

  return storageKey;
}

export async function readAttachmentBytes(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveAttachmentPath(storageKey));
}

export async function deleteAttachmentBytes(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveAttachmentPath(storageKey));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}

/** SHA-256 hex digest of the stored bytes. */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Removes directory components and control characters from a client-supplied
 * filename. The result is display metadata only; the storage key remains the
 * sole on-disk identifier.
 */
export function sanitizeOriginalFilename(filename: string): string {
  const withoutPaths = filename.replace(/\\/g, "/");
  const base = path.posix.basename(withoutPaths);
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "attachment";
  }

  return cleaned.slice(0, 255);
}
