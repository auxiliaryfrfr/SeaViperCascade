import net from "node:net";

interface SafeUrlOptions {
  fieldName: string;
  allowHttp?: boolean;
  prependHttps?: boolean;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

export function normalizePublicWebUrl(rawUrl: string, options: SafeUrlOptions): string {
  const trimmed = rawUrl.trim();
  const candidate =
    options.prependHttps && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${options.fieldName} must be a valid URL.`);
  }

  const allowedProtocols = options.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`${options.fieldName} must use ${options.allowHttp ? "http or https" : "https"}.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${options.fieldName} must not contain embedded credentials.`);
  }

  if (isLocalOrPrivateHost(parsed.hostname)) {
    throw new Error(`${options.fieldName} must not target localhost or private network addresses.`);
  }

  return parsed.toString();
}
