import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifySignature } from "../src/github/signature.js";

const secret = "s3cret";
const body = Buffer.from('{"hello":"world"}');
const sign = (payload: Buffer, key = secret) => `sha256=${createHmac("sha256", key).update(payload).digest("hex")}`;

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    assert.equal(verifySignature(secret, body, sign(body)), true);
  });

  it("rejects a tampered body", () => {
    assert.equal(verifySignature(secret, Buffer.from('{"hello":"w0rld"}'), sign(body)), false);
  });

  it("rejects a signature made with the wrong secret", () => {
    assert.equal(verifySignature(secret, body, sign(body, "other")), false);
  });

  it("rejects a missing header or wrong prefix", () => {
    assert.equal(verifySignature(secret, body, undefined), false);
    assert.equal(verifySignature(secret, body, sign(body).replace("sha256=", "sha1=")), false);
  });

  it("rejects non-hex and wrong-length signatures without throwing", () => {
    assert.equal(verifySignature(secret, body, "sha256=not-hex-at-all"), false);
    assert.equal(verifySignature(secret, body, "sha256=abcd"), false);
    assert.equal(verifySignature(secret, body, "sha256="), false);
  });
});
