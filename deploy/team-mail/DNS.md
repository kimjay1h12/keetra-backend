# Team mail — DNS and deliverability

Point your **MX** records at the public hostname of your self-hosted SMTP server (the machine running Postfix, Mailu, docker-mailserver, etc.).

## Records to configure (per domain)

| Type | Name / host | Value | Purpose |
| ---- | ------------- | ----- | ------- |
| MX | `@` (apex) | `10 mail.example.com.` | Inbound mail routing |
| A / AAAA | `mail` (or your MX target) | Your server IP | Resolves the MX hostname |
| TXT | `@` | `v=spf1 mx a ip4:YOUR_IP ~all` | SPF — who may send as this domain |
| TXT | `default._domainkey` or provider-specific | DKIM public key | Message signing (set per your stack) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain` | DMARC policy (start with `p=none`) |

## KeeTra domain verification

For **custom** domains (not matching `TEAM_MAIL_DEFAULT_DOMAIN` on the API), KeeTra requires a one-time TXT proof at the **apex** of the domain:

```txt
kmeet-mail-verify=<token shown in the UI>
```

After DNS propagates, use **Check DNS** in the team admin UI.

## Reverse DNS (PTR)

Ask your VPS provider to set **PTR** for your outbound IP to match the hostname used in SMTP EHLO (e.g. `mail.example.com`). This improves deliverability.

## Operational notes

- Warm up sending gradually; avoid bulk mail from a new IP.
- Monitor bounces and spam complaints; keep Rspamd/SpamAssassin updated.
- TLS certificates: use Let’s Encrypt on the IMAP/SMTP/Webmail endpoints.
