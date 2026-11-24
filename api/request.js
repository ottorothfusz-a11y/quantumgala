// Quantum Gala: stores a seat request and sends a branded confirmation email.
// Runs as a Vercel serverless function at /api/request. No npm packages needed.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   SUPABASE_URL                 e.g. https://abcd.supabase.co (NEXT_PUBLIC_SUPABASE_URL also works)
//   SUPABASE_SERVICE_ROLE_KEY    Supabase > Project Settings > API > service_role key (keep secret)
//   RESEND_API_KEY               Resend > API Keys
//   MAIL_FROM                    e.g. Quantum Gala <gala@quantumgala.nl>  (domain must be verified in Resend)
//   NOTIFY_EMAIL                 where you get a short "new request" email (optional)
//   SITE_URL                     e.g. https://quantumgala.nl (used for the logo in the email)

const SITE = (process.env.SITE_URL || "https://quantumgala.nl").replace(/\/$/, "");

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function confirmationHtml(first) {
  const step = (n, title, sub) => `
    <tr><td style="padding:14px 0;border-top:1px solid #262626">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="30" valign="top" style="font:600 14px Arial,sans-serif;color:#f5f5f7">${n}</td>
        <td style="font:600 16px Arial,sans-serif;color:#f5f5f7">${title}
          <div style="font:400 14px Arial,sans-serif;color:#8b8d8d;margin-top:3px">${sub}</div></td>
      </tr></table></td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Quantum Gala</title></head>
<body style="margin:0;padding:0;background:#000000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000"><tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td align="center" style="padding-bottom:36px">
      <img src="${SITE}/email-logo.png" width="220" alt="QUANTUM" style="display:block;width:220px;height:auto;border:0">
      <div style="font:400 11px Arial,sans-serif;letter-spacing:4px;color:#8b8d8d;margin-top:14px">GALA &middot; DECEMBER 2026</div>
    </td></tr>
    <tr><td style="font:600 30px Arial,sans-serif;letter-spacing:-0.5px;color:#f5f5f7;line-height:1.15">
      You're on the list, ${esc(first)}.</td></tr>
    <tr><td style="font:400 16px Arial,sans-serif;color:#c7c8c8;line-height:1.5;padding:12px 0 26px">
      We received your request for the Quantum Gala. Only 10 seats are open to non-members, so we review every request personally.</td></tr>
    ${step(1, "We review your request", "Within 48 hours.")}
    ${step(2, "We contact you on WhatsApp", "With tickets and availability.")}
    ${step(3, "You secure your seat", "Then you get the location and all details.")}
    <tr><td style="padding:30px 0 8px">
      <a href="https://www.instagram.com/quantumagecapital" style="display:inline-block;background:#f5f5f7;color:#000000;font:600 15px Arial,sans-serif;text-decoration:none;padding:14px 26px;border-radius:980px">Follow Quantum on Instagram</a>
    </td></tr>
    <tr><td style="font:400 12px Arial,sans-serif;color:#5c5e5e;line-height:1.5;padding-top:36px;border-top:1px solid #1a1a1a">
      Quantum Gala &middot; A Quantum Age Capital Limited Edition<br>You get this email because you requested a seat on quantumgala.nl.</td></tr>
  </table>
</td></tr></table></body></html>`;
}

function confirmationText(first) {
  return `You're on the list, ${first}.

We received your request for the Quantum Gala. Only 10 seats are open to non-members, so we review every request personally.

1. We review your request (within 48 hours)
2. We contact you on WhatsApp (tickets and availability)
3. You secure your seat (then you get the location and all details)

Instagram: https://www.instagram.com/quantumagecapital

Quantum Gala, a Quantum Age Capital Limited Edition`;
}

async function sendEmail(payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("resend " + r.status + " " + (await r.text()));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false }); }

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  // Honeypot: real people never fill the hidden "website" field.
  if (b.website) return res.status(200).json({ ok: true });

  const name = String(b.name || "").trim().slice(0, 120);
  const phone = String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 20);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const source = String(b.source || "site").slice(0, 40);
  if (!name || phone.replace(/\D/g, "").length < 9 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "invalid" });
  }

  // 1. Save to Supabase
  const SB = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const r = await fetch(`${SB}/rest/v1/gala_requests`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name, phone, email, source, user_agent: String(req.headers["user-agent"] || "").slice(0, 300) }),
    });
    if (!r.ok) throw new Error("supabase " + r.status + " " + (await r.text()));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "save" });
  }

  // 2. Emails. A failed email never loses the request: it is already saved.
  const first = name.split(/\s+/)[0];
  const from = process.env.MAIL_FROM || "Quantum Gala <gala@quantumgala.nl>";
  const jobs = [];
  if (process.env.RESEND_API_KEY) {
    jobs.push(sendEmail({ from, to: [email], subject: `You're on the list, ${first}`, html: confirmationHtml(first), text: confirmationText(first) }));
    if (process.env.NOTIFY_EMAIL) {
      jobs.push(sendEmail({
        from, to: [process.env.NOTIFY_EMAIL], subject: `New gala request: ${name}`,
        text: `Name: ${name}\nWhatsApp: ${phone}\nEmail: ${email}\nSource: ${source}\nWhatsApp link: https://wa.me/${phone.replace(/\D/g, "")}`,
      }));
    }
  }
  const results = await Promise.allSettled(jobs);
  results.forEach(r => { if (r.status === "rejected") console.error(r.reason); });

  return res.status(200).json({ ok: true });
};

module.exports.confirmationHtml = confirmationHtml;
