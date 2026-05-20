function normalizeText(value) {
  return String(value || "").trim();
}

function credentialRecord(applicationId, accessKey) {
  const normalizedApplicationId = normalizeText(applicationId);
  const normalizedAccessKey = normalizeText(accessKey);
  if (!normalizedApplicationId || !normalizedAccessKey) return null;
  return {
    applicationId: normalizedApplicationId,
    accessKey: normalizedAccessKey,
    bucketKey: `${normalizedApplicationId}:${normalizedAccessKey}`,
  };
}

export function normalizeRakutenApplications(widget = {}) {
  const candidates = [];
  candidates.push(credentialRecord(widget.applicationId, widget.accessKey));

  if (Array.isArray(widget.applications)) {
    for (const application of widget.applications) {
      candidates.push(credentialRecord(application?.applicationId, application?.accessKey));
    }
  }

  const seen = new Set();
  return candidates.filter((credential) => {
    if (!credential || seen.has(credential.bucketKey)) return false;
    seen.add(credential.bucketKey);
    return true;
  });
}

const DEFAULT_BLOCKED_CREDENTIAL_TTL_MS = 10 * 60 * 1000;

function shouldBlockStatus(status) {
  return status === 401 || status === 403;
}

export function createRakutenCredentialPicker({
  now = () => Date.now(),
  blockedCredentialTtlMs = DEFAULT_BLOCKED_CREDENTIAL_TTL_MS,
} = {}) {
  const cursors = new Map();
  const blockedUntilByBucketKey = new Map();

  const isBlocked = (bucketKey) => {
    const blockedUntil = blockedUntilByBucketKey.get(bucketKey);
    if (!blockedUntil) return false;
    if (blockedUntil <= now()) {
      blockedUntilByBucketKey.delete(bucketKey);
      return false;
    }
    return true;
  };

  return {
    next(widgetKey, applications, { exclude = new Set() } = {}) {
      if (!Array.isArray(applications) || applications.length === 0) return null;
      const current = cursors.get(widgetKey) || 0;
      for (let offset = 0; offset < applications.length; offset += 1) {
        const index = (current + offset) % applications.length;
        const credential = applications[index];
        if (exclude.has(credential.bucketKey) || isBlocked(credential.bucketKey)) continue;
        cursors.set(widgetKey, (index + 1) % applications.length);
        return credential;
      }
      return null;
    },
    reportStatus(credential, status) {
      if (!credential?.bucketKey) return;
      if (shouldBlockStatus(status)) {
        blockedUntilByBucketKey.set(credential.bucketKey, now() + blockedCredentialTtlMs);
      } else if (status === 200) {
        blockedUntilByBucketKey.delete(credential.bucketKey);
      }
    },
    reset() {
      cursors.clear();
      blockedUntilByBucketKey.clear();
    },
  };
}
