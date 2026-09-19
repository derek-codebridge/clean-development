import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireDirectoryLock, acquireDirectoryLockSync, writeJsonExclusive } from "../src/io.js";

function staleLockFixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-lock-")));
  const lock = path.join(root, "stale.lock");
  const owner = path.join(lock, "owner.json");
  fs.mkdirSync(lock);
  fs.writeFileSync(owner, `${JSON.stringify({
    schemaVersion: 1,
    token: "stale-token",
    pid: 2_147_483_647,
    acquiredAt: new Date(Date.now() - 10_000).toISOString()
  })}\n`);
  const stale = new Date(Date.now() - 10_000);
  fs.utimesSync(lock, stale, stale);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { lock, owner };
}

function preventOwnerRemoval(owner, callback) {
  const unlinkSync = fs.unlinkSync;
  fs.unlinkSync = (file) => {
    if (path.resolve(file) === path.resolve(owner)) {
      const error = new Error("simulated busy lock owner");
      error.code = "EBUSY";
      throw error;
    }
    return unlinkSync(file);
  };
  try {
    return callback();
  } finally {
    fs.unlinkSync = unlinkSync;
  }
}

test("an unremovable stale async lock still honors its timeout", async (t) => {
  const { lock, owner } = staleLockFixture(t);
  await preventOwnerRemoval(owner, () => assert.rejects(
    acquireDirectoryLock(lock, { timeoutMs: 0 }),
    /Timed out waiting for setup lock/
  ));
});

test("an unremovable stale sync lock still honors its timeout", (t) => {
  const { lock, owner } = staleLockFixture(t);
  preventOwnerRemoval(owner, () => assert.throws(
    () => acquireDirectoryLockSync(lock, { timeoutMs: 0 }),
    /Timed out waiting for runtime lock/
  ));
});

test("exclusive JSON creation never replaces an existing project file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-exclusive-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "project.json");
  fs.writeFileSync(file, "user-owned\n");
  assert.throws(() => writeJsonExclusive(file, { owner: "clean-development" }), { code: "EEXIST" });
  assert.equal(fs.readFileSync(file, "utf8"), "user-owned\n");
});
