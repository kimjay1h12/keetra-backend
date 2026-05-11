#!/usr/bin/env node
/**
 * Minimal reference bridge: receives KeeTra provision webhooks and logs actions.
 * Wire this to your mail stack (doveadm, postfixadmin API, LDAP, etc.).
 *
 * Run: TEAM_MAIL_BRIDGE_SECRET=yoursecret node example-bridge.mjs
 * Set KeeTra TEAM_MAIL_PROVISION_URL=http://host:4099/mail-provision
 *     and TEAM_MAIL_PROVISION_SECRET to the same value.
 */

import http from "node:http";

const secret = process.env.TEAM_MAIL_BRIDGE_SECRET || "";
const port = Number(process.env.TEAM_MAIL_BRIDGE_PORT || "4099");

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/mail-provision") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    if (secret && req.headers["x-team-mail-secret"] !== secret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    try {
      const payload = JSON.parse(body || "{}");
      console.log("[team-mail-provision]", new Date().toISOString(), JSON.stringify(payload));
      // TODO: create/update/delete mailbox in Postfix/Dovecot/Mailu here
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
});

server.listen(port, () => {
  console.log(`Team mail bridge listening on :${port} POST /mail-provision`);
});
