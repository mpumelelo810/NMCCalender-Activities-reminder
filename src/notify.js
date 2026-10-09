// WhatsApp Cloud API delivery adapter for NMCC reminders.
// Requires approved template + Cloudflare secrets; never logs access tokens.
const parseRecipients = raw => {
  const entered = String(raw || "").split(",").map(v => v.trim()).filter(Boolean);
  const digits = entered.map(v => v.replace(/[^0-9]/g, ""));
  return { recipients: [...new Set(digits)], invalid: digits.filter(v => !/^268[0-9]{8}$/.test(v)) };
};

const safeDetail = (value, max = 300) => String(value || "Unknown delivery error").replace(/[\r\n\t]+/g, " ").slice(0, max);

async function sendTemplate(env, recipient, msg) {
  const version = String(env.WHATSAPP_API_VERSION || "").trim();
  if (!/^v[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error("WHATSAPP_API_VERSION must be set to a supported Meta Graph API version.");
  }
  const url = "https://graph.facebook.com/" + version + "/" +
    encodeURIComponent(String(env.WHATSAPP_PHONE_NUMBER_ID || "").trim()) + "/messages";
  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: String(env.WHATSAPP_TEMPLATE_NAME || "").trim(),
      language: { code: String(env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US").trim() },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: safeDetail(msg.subject, 1000) },
          { type: "text", text: safeDetail(msg.body, 1000) }
        ]
      }]
    }
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.WHATSAPP_ACCESS_TOKEN,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.messages) || body.messages.length === 0) {
    const apiMessage = body?.error?.message || ("WhatsApp API returned HTTP " + response.status);
    throw new Error(safeDetail(apiMessage));
  }
  return String(body.messages[0].id || "");
}

export async function deliver(env, msg) {
  const provider = String(env.NOTIFY_PROVIDER || "none").trim().toLowerCase();
  if (provider === "none") {
    return { status: "generated", detail: "Reminder generated only; WhatsApp delivery has not been enabled." };
  }
  if (provider !== "whatsapp_cloud_api") {
    return { status: "failed", detail: "Unknown notification provider." };
  }

  const required = [
    ["WHATSAPP_ACCESS_TOKEN", env.WHATSAPP_ACCESS_TOKEN],
    ["WHATSAPP_PHONE_NUMBER_ID", env.WHATSAPP_PHONE_NUMBER_ID],
    ["WHATSAPP_API_VERSION", env.WHATSAPP_API_VERSION],
    ["WHATSAPP_TEMPLATE_NAME", env.WHATSAPP_TEMPLATE_NAME],
    ["WHATSAPP_RECIPIENTS", env.WHATSAPP_RECIPIENTS]
  ];
  const missing = required.filter(([name, value]) => !String(value || "").trim()).map(([name]) => name);
  if (missing.length) {
    return { status: "failed", detail: "WhatsApp setup incomplete: " + missing.join(", ") + "." };
  }

  const parsedRecipients = parseRecipients(env.WHATSAPP_RECIPIENTS);
  const recipients = parsedRecipients.recipients;
  if (!recipients.length) return { status: "failed", detail: "No WhatsApp recipients configured." };
  if (parsedRecipients.invalid.length) {
    return { status: "failed", detail: "Recipient configuration contains an invalid Eswatini number. Check both full numbers: country code 268 followed by exactly 8 national digits." };
  }

  let accepted = 0;
  const failures = [];
  for (const recipient of recipients) {
    const previous = await env.DB.prepare(
      "SELECT status FROM notification_deliveries WHERE job=? AND report_date=? AND recipient=?"
    ).bind(msg.job, msg.report_date, recipient).first();

    // Each recipient is tracked separately so a retry does not resend to a recipient
    // whose message was already accepted by Meta.
    if (previous?.status === "sent") { accepted++; continue; }

    const stamp = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO notification_deliveries(job,report_date,recipient,status,message_id,detail,updated_at) VALUES(?,?,?,'pending',NULL,NULL,?) " +
      "ON CONFLICT(job,report_date,recipient) DO UPDATE SET status='pending',detail=NULL,updated_at=excluded.updated_at"
    ).bind(msg.job, msg.report_date, recipient, stamp).run();

    try {
      const messageId = await sendTemplate(env, recipient, msg);
      await env.DB.prepare(
        "UPDATE notification_deliveries SET status='sent',message_id=?,detail=?,updated_at=? WHERE job=? AND report_date=? AND recipient=?"
      ).bind(messageId, "Accepted by WhatsApp API", new Date().toISOString(), msg.job, msg.report_date, recipient).run();
      accepted++;
    } catch (err) {
      const detail = safeDetail(err?.message || err);
      await env.DB.prepare(
        "UPDATE notification_deliveries SET status='failed',detail=?,updated_at=? WHERE job=? AND report_date=? AND recipient=?"
      ).bind(detail, new Date().toISOString(), msg.job, msg.report_date, recipient).run();
      failures.push(detail);
    }
  }

  if (failures.length || accepted !== recipients.length) {
    return {
      status: "failed",
      detail: "WhatsApp accepted " + accepted + " of " + recipients.length +
        " recipient message(s). " + failures.slice(0, 2).join(" | ")
    };
  }
  return {
    status: "sent",
    detail: "WhatsApp API accepted reminder messages for " + accepted + " recipient(s)."
  };
}
