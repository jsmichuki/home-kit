import "server-only";

export const REDACTED_LOG_VALUE = "[REDACTED]";

const MAX_COLLECTION_ENTRIES = 25;
const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 512;

const sensitiveFieldName = /(?:^|[_-])(?:access[_-]?token|api[_-]?key|authorization|card|confirmation|cookie|cvv|password|secret|session|signature|token)(?:$|[_-])/i;
const payloadFieldName = /(?:^|[_-])(?:body|headers?|payload|raw|request|response)(?:$|[_-])/i;
const sensitiveQueryName = /^(?:access[_-]?token|api[_-]?key|authorization|code|confirmation|password|secret|signature|token)$/i;

export type SafeLogLevel = "error" | "info" | "warn";

type ConsoleLike = Pick<Console, SafeLogLevel>;

/**
 * Masks an email address while retaining enough information for support
 * correlation. Do not use this as an identifier across systems.
 */
export function maskEmailForLog(email: string) {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return REDACTED_LOG_VALUE;
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

function truncate(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]`
    : value;
}

function redactUrlQueryValues(value: string) {
  return value.replace(/https?:\/\/[^\s"']+/gi, (candidate) => {
    try {
      const url = new URL(candidate);

      for (const key of url.searchParams.keys()) {
        if (sensitiveQueryName.test(key)) {
          url.searchParams.set(key, REDACTED_LOG_VALUE);
        }
      }

      return url.toString();
    } catch {
      return candidate;
    }
  });
}

/** Redacts common secret and payment data forms in an otherwise safe string. */
export function redactSensitiveText(value: string) {
  return truncate(
    redactUrlQueryValues(value)
      .replace(/(\/downloads\/)[A-Za-z0-9_-]{16,}/gi, `$1${REDACTED_LOG_VALUE}`)
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, `$1${REDACTED_LOG_VALUE}`)
      .replace(/\b(?:re|sb_secret)_[A-Za-z0-9_-]{8,}\b/gi, REDACTED_LOG_VALUE)
      .replace(/\bsk_(?:test|live)_[A-Za-z0-9_-]{8,}\b/gi, REDACTED_LOG_VALUE)
      .replace(
        /\b(?:access[_-]?token|api[_-]?key|authorization|confirmation|password|secret|signature|token)\s*[=:]\s*["']?[^,\s"'&}]+/gi,
        (match) => `${match.split(/[=:]/, 1)[0]}=${REDACTED_LOG_VALUE}`,
      )
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        maskEmailForLog,
      )
      .replace(/\b(?:\d[ -]?){12,18}\d\b/g, REDACTED_LOG_VALUE),
  );
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Produces a bounded, serializable log value. Raw request, response, payload,
 * header, and credential fields are deliberately omitted rather than sampled.
 */
export function sanitizeForLog(
  value: unknown,
  depth = 0,
  visited = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return undefined;
  }

  if (depth >= MAX_DEPTH) {
    return "[TRUNCATED_DEPTH]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      message: redactSensitiveText(value.message),
      name: value.name,
    };
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (visited.has(value)) {
    return "[CIRCULAR]";
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_COLLECTION_ENTRIES)
      .map((item) => sanitizeForLog(item, depth + 1, visited));
  }

  if (!isPlainRecord(value)) {
    return "[UNSUPPORTED_OBJECT]";
  }

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value).slice(0, MAX_COLLECTION_ENTRIES)) {
    if (sensitiveFieldName.test(key) || payloadFieldName.test(key)) {
      result[key] = REDACTED_LOG_VALUE;
      continue;
    }

    result[key] = sanitizeForLog(item, depth + 1, visited);
  }

  return result;
}

/**
 * Server-side structured logging for operational events. Callers must submit
 * concise event metadata only; never pass an untrusted provider payload.
 */
export function logOperationalEvent(
  level: SafeLogLevel,
  event: string,
  details: Record<string, unknown> = {},
  logger: ConsoleLike = console,
) {
  logger[level]("[home-kit]", {
    details: sanitizeForLog(details),
    event: redactSensitiveText(event),
    timestamp: new Date().toISOString(),
  });
}
