// Reminder delivery adapters for NMCC. Provider credentials must be Cloudflare Worker secrets.
const parseRecipients = raw => {
  const entered = String(raw || "").split(",").map(v => v.trim()).filter(Boolean);
  const digits = entered.map(v => v.replace(/[^0-9]/g, ""));
  return { recipients: [...new Set(digits)], invalid: digits.filter(v => !/^268[0-9]{8}$/.test(v)) };
};
const safeDetail = (value, max = 300) => String(value || "Unknown delivery error").replace(/[\r\n\t]+/g, " ").slice(0, max);

async function sendTemplate(env, recipient, msg) {
  const version = String(env.WHATSAPP_API_VERSION || "").trim();
  if (!/^v[0-9]+\.[0-9]+$/.test(version)) throw new Error("WHATSAPP_API_VERSION must be set to a supported Meta Graph API version.");
  const url = "https://graph.facebook.com/" + version + "/" + encodeURIComponent(String(env.WHATSAPP_PHONE_NUMBER_ID || "").trim()) + "/messages";
  const payload = { messaging_product: "whatsapp", to: recipient, type: "template", template: {
    name: String(env.WHATSAPP_TEMPLATE_NAME || "").trim(),
    language: { code: String(env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US").trim() },
    components: [{ type: "body", parameters: [
      { type: "text", text: safeDetail(msg.subject, 1000) },
      { type: "text", text: safeDetail(msg.body, 1000) }
    ] }]
  } };
  const response = await fetch(url, { method: "POST", headers: {
    authorization: "Bearer " + env.WHATSAPP_ACCESS_TOKEN, "content-type": "application/json"
  }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error(safeDetail(body?.error?.message || ("WhatsApp API returned HTTP " + response.status)));
  }
  return String(body.messages[0].id || "");
}

// Keep SMS short and ASCII-only to reduce multipart/Unicode SMS charges.
function smsBody(msg) {
  let body = String(msg.subject || "NMCC Youth reminder") + ". " + String(msg.body || "");
  body = body.replace(/🎉 Happy Birthday, ([^!]+)!.*?Enjoy your special day! 💚🎂/gs,
    "Birthday today: $1. Remember to send birthday wishes.");
  body = body.replace(/🎂\s*/g, "").replace(/[’‘]/g, "'").replace(/[–—]/g, "-");
  body = body.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  if (body.length > 150) body = body.slice(0, 146).trimEnd() + "...";
  return body;
}

async function sendSms(env, recipient, msg) {
  const sid = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(env.TWILIO_FROM_NUMBER || "").trim();
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) throw new Error("TWILIO_ACCOUNT_SID must be a valid Twilio Account SID.");
  if (!token) throw new Error("TWILIO_AUTH_TOKEN is missing.");
  if (!/^\+[1-9][0-9]{7,14}$/.test(from)) throw new Error("TWILIO_FROM_NUMBER must be a verified E.164 phone number, such as +12345678900.");
  const endpoint = "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json";
  const form = new URLSearchParams({ To: "+" + recipient, From: from, Body: smsBody(msg) });
  const response = await fetch(endpoint, { method: "POST", headers: {
    authorization: "Basic " + btoa(sid + ":" + token), "content-type": "application/x-www-form-urlencoded"
  }, body: form.toString() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.sid) throw new Error(safeDetail(body?.message || ("Twilio returned HTTP " + response.status)));
  return String(body.sid);
}

async function deliverToRecipients(env, msg, recipients, send, providerLabel) {
  let accepted = 0;
  const failures = [];
  for (const recipient of recipients) {
    const previous = await env.DB.prepare("SELECT status FROM notification_deliveries WHERE job=? AND report_date=? AND recipient=?").bind(msg.job, msg.report_date, recipient).first();
    if (previous?.status === "sent") { accepted++; continue; }
    const stamp = new Date().toISOString();
    await env.DB.prepare("INSERT INTO notification_deliveries(job,report_date,recipient,status,message_id,detail,updated_at) VALUES(?,?,?,'pending',NULL,NULL,?) ON CONFLICT(job,report_date,recipient) DO UPDATE SET status='pending',detail=NULL,updated_at=excluded.updated_at").bind(msg.job, msg.report_date, recipient, stamp).run();
    try {
      const messageId = await send(recipient, msg);
      await env.DB.prepare("UPDATE notification_deliveries SET status='sent',message_id=?,detail=?,updated_at=? WHERE job=? AND report_date=? AND recipient=?").bind(messageId, "Accepted by " + providerLabel + " for delivery", new Date().toISOString(), msg.job, msg.report_date, recipient).run();
      accepted++;
    } catch (err) {
      const detail = safeDetail(err?.message || err);
      await env.DB.prepare("UPDATE notification_deliveries SET status='failed',detail=?,updated_at=? WHERE job=? AND report_date=? AND recipient=?").bind(detail, new Date().toISOString(), msg.job, msg.report_date, recipient).run();
      failures.push(detail);
    }
  }
  if (failures.length || accepted !== recipients.length) return {
    status: "failed",
    detail: providerLabel + " accepted " + accepted + " of " + recipients.length + " recipient message(s). " + failures.slice(0, 2).join(" | ")
  };
  return { status: "sent", detail: providerLabel + " accepted reminder messages for " + accepted + " recipient(s)." };
}

export async function deliver(env, msg) {
  const provider = String(env.NOTIFY_PROVIDER || "none").trim().toLowerCase();
  if (provider === "none") return { status: "generated", detail: "Reminder generated only; SMS/WhatsApp delivery has not been enabled." };
  if (provider !== "whatsapp_cloud_api" && provider !== "twilio_sms") return { status: "failed", detail: "Unknown notification provider." };
  const isSms = provider === "twilio_sms";
  const required = isSms ? [
    ["TWILIO_ACCOUNT_SID", env.TWILIO_ACCOUNT_SID], ["TWILIO_AUTH_TOKEN", env.TWILIO_AUTH_TOKEN],
    ["TWILIO_FROM_NUMBER", env.TWILIO_FROM_NUMBER], ["SMS_RECIPIENTS", env.SMS_RECIPIENTS]
  ] : [
    ["WHATSAPP_ACCESS_TOKEN", env.WHATSAPP_ACCESS_TOKEN], ["WHATSAPP_PHONE_NUMBER_ID", env.WHATSAPP_PHONE_NUMBER_ID],
    ["WHATSAPP_API_VERSION", env.WHATSAPP_API_VERSION], ["WHATSAPP_TEMPLATE_NAME", env.WHATSAPP_TEMPLATE_NAME],
    ["WHATSAPP_RECIPIENTS", env.WHATSAPP_RECIPIENTS]
  ];
  const missing = required.filter(([name, value]) => !String(value || "").trim()).map(([name]) => name);
  if (missing.length) return { status: "failed", detail: (isSms ? "SMS" : "WhatsApp") + " setup incomplete: " + missing.join(", ") + "." };
  const parsed = parseRecipients(isSms ? env.SMS_RECIPIENTS : env.WHATSAPP_RECIPIENTS);
  if (!parsed.recipients.length) return { status: "failed", detail: "No " + (isSms ? "SMS" : "WhatsApp") + " recipients configured." };
  if (parsed.invalid.length) return { status: "failed", detail: "Recipient configuration contains an invalid Eswatini number. Use country code 268 followed by exactly 8 national digits." };
  return deliverToRecipients(env, msg, parsed.recipients,
    isSms ? (recipient, message) => sendSms(env, recipient, message) : (recipient, message) => sendTemplate(env, recipient, message),
    isSms ? "Twilio" : "WhatsApp API");
}
