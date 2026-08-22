const assert = require("node:assert/strict");
const test = require("node:test");

const jwt = require("../resources/js/tools/jwt/jwt-codec.js");

test("encodes and decodes an HS256 JWT", async () => {
  const token = await jwt.encodeToken(
    '{"alg":"HS256","typ":"JWT"}',
    '{"sub":"123","name":"Ada","iat":1516239022}',
    { algorithm: "HS256", secret: "secret" }
  );

  const decoded = jwt.decodeToken(token);

  assert.equal(decoded.header.alg, "HS256");
  assert.equal(decoded.payload.sub, "123");
  assert.equal(decoded.payload.name, "Ada");
});

test("validates matching and mismatched HMAC signatures", async () => {
  const token = await jwt.encodeToken(
    '{"alg":"HS256","typ":"JWT"}',
    '{"iss":"issuer-a","aud":"audience-a","exp":4102444800}',
    { algorithm: "HS256", secret: "secret" }
  );

  const valid = await jwt.validateToken(token, {
    validateSignature: true,
    secret: "secret",
    validateIssuer: true,
    issuers: "issuer-a",
    validateAudience: true,
    audiences: "audience-a",
    validateLifetime: true
  });
  const invalid = await jwt.validateToken(token, { validateSignature: true, secret: "wrong" });

  assert.ok(valid.messages.some((message) => message.text === "Signature is valid."));
  assert.ok(valid.messages.some((message) => message.text === "Issuer is valid."));
  assert.ok(valid.messages.some((message) => message.text === "Audience is valid."));
  assert.ok(invalid.messages.some((message) => message.text === "Signature is invalid."));
});

test("accepts Authorization Bearer prefixes when decoding", async () => {
  const token = await jwt.encodeToken(
    '{"alg":"HS384","typ":"JWT"}',
    '{"scope":"read"}',
    { algorithm: "HS384", secret: "secret" }
  );

  const decoded = jwt.decodeToken(`Authorization: Bearer ${token}`);

  assert.equal(decoded.header.alg, "HS384");
  assert.equal(decoded.payload.scope, "read");
});