import assert from "node:assert/strict";
import { bookingUnavailableMessage } from "../src/lib/operator-actions";
import { makeDeliveryKey, retryDelayMs } from "../src/lib/delivery";
import { uploadStorageMode } from "../src/lib/uploads";
import {
  canRevokeOperatorAccess,
  hasOperatorAccess,
  hasSuperAdminAccess,
} from "../src/lib/auth";

assert.equal(uploadStorageMode({ production: true, blobToken: "" }), "database");
assert.equal(uploadStorageMode({ production: true, blobToken: "configured" }), "blob");
assert.equal(uploadStorageMode({ production: false, blobToken: "" }), "database");

const bookingMessage = bookingUnavailableMessage();
assert.match(bookingMessage, /not automated/i);
assert.doesNotMatch(bookingMessage, /\bbooked\b/i);
assert.doesNotMatch(bookingMessage, /calendar invites/i);

assert.equal(retryDelayMs(1), 30_000);
assert.equal(retryDelayMs(2), 60_000);
assert.equal(retryDelayMs(8), 3_600_000);
assert.equal(makeDeliveryKey("intro", "match-1", "a"), makeDeliveryKey("intro", "match-1", "a"));
assert.notEqual(makeDeliveryKey("intro", "match-1", "a"), makeDeliveryKey("intro", "match-1", "b"));

assert.equal(hasOperatorAccess({ isOperator: true, isSuperAdmin: false }), true);
assert.equal(hasOperatorAccess({ isOperator: false, isSuperAdmin: true }), false);
assert.equal(hasSuperAdminAccess({ isOperator: true, isSuperAdmin: true }), true);
assert.equal(hasSuperAdminAccess({ isOperator: true, isSuperAdmin: false }), false);
assert.equal(hasSuperAdminAccess({ isOperator: false, isSuperAdmin: true }), false);
assert.equal(
  canRevokeOperatorAccess(
    { id: "super", isOperator: true, isSuperAdmin: true },
    { id: "operator", isOperator: true, isSuperAdmin: false },
  ),
  true,
);
assert.equal(
  canRevokeOperatorAccess(
    { id: "operator", isOperator: true, isSuperAdmin: false },
    { id: "other", isOperator: true, isSuperAdmin: false },
  ),
  false,
);
assert.equal(
  canRevokeOperatorAccess(
    { id: "super", isOperator: true, isSuperAdmin: true },
    { id: "other-super", isOperator: true, isSuperAdmin: true },
  ),
  false,
);

console.log("launch pure checks passed");
