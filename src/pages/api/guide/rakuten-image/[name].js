import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { isGuideImage, looksLikeJpeg, upstreamImageUrl } from "components/guide/rakuten-image/images.mjs";
import { CONF_DIR } from "utils/config/config";

// Serves the guide's official Rakuten example images from a local copy, fetching each from Rakuten
// the first time it is asked for. Only the fixed names in GUIDE_IMAGES are accepted, so this route
// cannot be pointed at any other address.
const MAX_BYTES = 2 * 1024 * 1024;
const inflight = new Map();

function cacheDir() {
  return join(CONF_DIR, "cache", "rakuten-image-guide");
}

async function fetchAndKeep(name) {
  const response = await fetch(upstreamImageUrl(name), { redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`upstream status ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES || !looksLikeJpeg(bytes)) throw new Error("upstream did not return a JPEG");

  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  const target = join(dir, name);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
  return bytes;
}

async function loadImage(name) {
  try {
    const bytes = await readFile(join(cacheDir(), name));
    if (looksLikeJpeg(bytes)) return bytes;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!inflight.has(name)) {
    inflight.set(
      name,
      fetchAndKeep(name).finally(() => inflight.delete(name)),
    );
  }
  return inflight.get(name);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ["GET", "HEAD"]);
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { name } = req.query;
  if (typeof name !== "string" || !isGuideImage(name)) {
    return res.status(404).json({ error: "not_found" });
  }

  try {
    const bytes = await loadImage(name);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "public, max-age=604800");
    return res.status(200).send(req.method === "HEAD" ? undefined : bytes);
  } catch {
    return res.status(502).json({ error: "image_unavailable" });
  }
}
