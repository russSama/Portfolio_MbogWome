import { randomBytes, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 16_384;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function getOrigin(event) {
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  return host ? `${protocol}://${host}` : null;
}

function isSameOrigin(event) {
  const origin = event.headers.origin;
  const expectedOrigin = getOrigin(event);
  return Boolean(origin && expectedOrigin && origin === expectedOrigin);
}

function getCookie(event, name) {
  const cookies = event.headers.cookie || "";
  const cookie = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clean(value, maxLength) {
  return value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, maxLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export default async (event) => {
  if (event.httpMethod === "GET") {
    const csrf = randomBytes(32).toString("hex");
    const secure = process.env.CONTEXT === "production" ? "; Secure" : "";
    return respond(200, { csrf }, {
      "Set-Cookie": `portfolio_csrf=${encodeURIComponent(csrf)}; Path=/.netlify/functions/contact; HttpOnly; SameSite=Strict; Max-Age=1800${secure}`
    });
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Méthode non autorisée." }, { Allow: "GET, POST" });
  }

  if (!isSameOrigin(event)) {
    return respond(403, { error: "Origine de requête refusée." });
  }

  const contentLength = Number(event.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES || !event.body || Buffer.byteLength(event.body) > MAX_BODY_BYTES) {
    return respond(413, { error: "Le formulaire est trop volumineux." });
  }

  const contentType = event.headers["content-type"] || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return respond(415, { error: "Format de formulaire non pris en charge." });
  }
  const fields = Object.fromEntries(new URLSearchParams(event.body));

  if (fields.company) return respond(200, { ok: true });

  const cookieToken = getCookie(event, "portfolio_csrf");
  const submittedToken = String(fields.csrf || "");
  if (!cookieToken || !submittedToken || !safeEqual(cookieToken, submittedToken)) {
    return respond(403, { error: "Session expirée. Rechargez la page puis réessayez." });
  }

  const name = clean(String(fields.name || ""), 80);
  const email = clean(String(fields.email || ""), 254);
  const subject = clean(String(fields.subject || ""), 120);
  const message = clean(String(fields.message || ""), 4000);
  if (name.length < 2 || !EMAIL_PATTERN.test(email) || subject.length < 2 || message.length < 10) {
    return respond(400, { error: "Vérifiez les champs : nom, email, sujet et message (10 caractères minimum)." });
  }

  const { RESEND_API_KEY, CONTACT_EMAIL, FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_EMAIL || !FROM_EMAIL) {
    console.error("Contact form email provider is not configured.");
    return respond(503, { error: "La réception des messages n’est pas encore configurée." });
  }

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [CONTACT_EMAIL],
        reply_to: email,
        subject: `Portfolio — ${subject}`,
        text: `Nom : ${name}\nEmail : ${email}\n\n${message}`,
        html: `<p><strong>Nom :</strong> ${escapeHtml(name)}</p><p><strong>Email :</strong> ${escapeHtml(email)}</p><p><strong>Message :</strong></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    console.error("Email provider request failed.");
    return respond(502, { error: "Le service email est temporairement indisponible." });
  }

  if (!response.ok) {
    console.error(`Email provider returned status ${response.status}.`);
    return respond(502, { error: "L’envoi du message a échoué. Réessayez plus tard." });
  }

  return respond(200, { ok: true });
};
