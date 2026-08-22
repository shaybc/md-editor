const assert = require("node:assert/strict");
const test = require("node:test");

const { parseCertificate } = require("../resources/js/tools/certificate-decoder/certificate-parser.js");

const SAMPLE_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDYDCCAkigAwIBAgIUXo0OPmJjUC6LA72+gweG5s2WQoYwDQYJKoZIhvcNAQEL
BQAwPTELMAkGA1UEBhMCVVMxEjAQBgNVBAoMCU1EIEVkaXRvcjEaMBgGA1UEAwwR
Y2VydC1kZWNvZGVyLnRlc3QwHhcNMjYwODIyMDcxNzQxWhcNMjYwOTIxMDcxNzQx
WjA9MQswCQYDVQQGEwJVUzESMBAGA1UECgwJTUQgRWRpdG9yMRowGAYDVQQDDBFj
ZXJ0LWRlY29kZXIudGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
ALFoU4kPgpsGlAvz9utz+FCH5gU74SlPBnzx3zCorPFr3LSJTh8RVd5LyNCA+qsQ
WYyiAB0yWwIzAF834WoZ7wb3SlyRKochgaWAPz/luj07nUAB/heiY6X0M8L66eYE
zuCHYD7DnHEKrEAvQ+oEvt6p9z+LqBj434cj02nGBzaWFZjwWT4BjNHrHIt1DtoB
aQzCp6J72eGMqbg7m7Zki9U/oETm338WMAK6Tdy+urr1Byuik220g5iRzGXLLh1c
L2NmBz0I7KSUPfVC3x0lYLtwWQZ3yGiZVj/wd0VFceAUfxtnhhJIYJxB8MT1xyzX
yRkn5sAA8sM3XbV7OT+X0RUCAwEAAaNYMFYwJwYDVR0RBCAwHoIRY2VydC1kZWNv
ZGVyLnRlc3SCCWxvY2FsaG9zdDALBgNVHQ8EBAMCBaAwEwYDVR0lBAwwCgYIKwYB
BQUHAwEwCQYDVR0TBAIwADANBgkqhkiG9w0BAQsFAAOCAQEABpzG7NuHYgbIuMGS
3ZIrUXpwymQyL9DT075GUJFLEp4FiUZ+Gly2RoThnjTFIl6nJjGLUFuG5SDepPP9
Ry5t0Tl66TP9NI4eWSLLO13EBllt5pRO48Z0o12V6oquLUl5J+pRHt+zuNTZIxam
5pA3w5th1Akz5O4k/LJ/ShfNH5jm+9yxPMr27taMfVZ9pKUfISLEO7QXjU6maYx4
jI8oTHpnxCYR1++wLlA0e7qp+EYOwQLNm6jrKm45rrRIOooGXaVS0mEg/FzX6PEr
mV0EG7tXu8ea1+XPrzoYlAAeQy3fiM9hGd0uLfPVKEVKEU1Hh85Mtg+Et+bWcual
g50yTQ==
-----END CERTIFICATE-----`;

function extension(cert, oid) {
  return cert.extensions.find((entry) => entry.oid === oid);
}

test("decodes common X.509 certificate fields and extensions", () => {
  const cert = parseCertificate(SAMPLE_CERTIFICATE);

  assert.equal(cert.subject.text, "C=US, O=MD Editor, CN=cert-decoder.test");
  assert.equal(cert.issuer.text, "C=US, O=MD Editor, CN=cert-decoder.test");
  assert.equal(cert.version, "v3");
  assert.equal(cert.serialNumber, "5E8D0E3E6263502E8B03BDBE830786E6CD964286");
  assert.equal(cert.notBefore.iso, "2026-08-22 07:17:41 UTC");
  assert.equal(cert.notAfter.iso, "2026-09-21 07:17:41 UTC");
  assert.deepEqual(extension(cert, "2.5.29.17").values, ["DNS Name=cert-decoder.test", "DNS Name=localhost"]);
  assert.deepEqual(extension(cert, "2.5.29.15").values, ["Digital Signature", "Key Encipherment"]);
  assert.deepEqual(extension(cert, "2.5.29.37").values, ["Server Authentication (1.3.6.1.5.5.7.3.1)"]);
  assert.deepEqual(extension(cert, "2.5.29.19").values, ["Subject Type=End Entity", "Path Length Constraint=None"]);
});