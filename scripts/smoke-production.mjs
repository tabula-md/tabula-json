const serviceUrl = trimTrailingSlash(process.env.TABULA_JSON_SMOKE_URL || "https://json.tabula.md");
const origin = process.env.TABULA_JSON_SMOKE_ORIGIN || "https://tabula.md";
const payload = new TextEncoder().encode(`tabula-json-smoke:${Date.now()}:${crypto.randomUUID()}`);

const health = await fetch(`${serviceUrl}/health`);
if (!health.ok) {
  throw new Error(`Health check failed: ${health.status} ${await health.text()}`);
}

const createResponse = await fetch(`${serviceUrl}/api/v2/post/`, {
  body: payload,
  headers: {
    "content-type": "application/octet-stream",
    origin,
  },
  method: "POST",
});
if (!createResponse.ok) {
  throw new Error(`Create failed: ${createResponse.status} ${await createResponse.text()}`);
}

const created = await createResponse.json();
if (!isRecord(created) || typeof created.id !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(created.id)) {
  throw new Error("Create failed: invalid id in service response.");
}

const expectedDataUrl = `${serviceUrl}/api/v2/${created.id}`;
if (created.data !== expectedDataUrl) {
  throw new Error(`Create failed: expected data URL ${expectedDataUrl}, got ${String(created.data)}`);
}

const readResponse = await fetch(created.data);
if (!readResponse.ok) {
  throw new Error(`Read failed: ${readResponse.status} ${await readResponse.text()}`);
}

const actual = new Uint8Array(await readResponse.arrayBuffer());
if (!byteEquals(actual, payload)) {
  throw new Error("Read failed: returned bytes did not match uploaded bytes.");
}

console.log(`tabula-json production smoke passed: ${created.id}`);

function byteEquals(left, right) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
