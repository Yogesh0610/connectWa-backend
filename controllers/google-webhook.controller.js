import crypto from "crypto";
import { AdLeadSource } from "../models/AdLeadSource.js";
import { googleLeadService } from "../services/adLeads/google-lead.service.js";

const normalizeCustomerId = (id) => id?.replace(/-/g, "").trim();

export const getGoogleWebhookInfo = async (req, res) => {
  try {
    const { source_name, customer_id } = req.body;
    const normalizedId = normalizeCustomerId(customer_id); // ✅ normalize before saving

    if (!normalizedId) {
      return res.status(400).json({ success: false, message: "customer_id is required" });
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const source = await AdLeadSource.findOneAndUpdate(
      { google_customer_id: normalizedId, user_id: req.user._id },
      {
        user_id: req.user._id,
        source_type: "google",
        name: source_name || `Google Ads ${normalizedId}`,
        google_customer_id: normalizedId,
        google_webhook_secret: secret,
        is_active: true,
        connection_method: "webhook",
      },
      { upsert: true, new: true }
    );

    const webhookUrl = `${process.env.APP_URL}/api/ad-leads/webhook/google`;

    res.json({
      success: true,
      data: {
        source_id: source._id,
        webhook_url: webhookUrl,
        webhook_secret: secret,
        customer_id: normalizedId,
        instructions: [
          "1. Google Ads Console → Tools → Conversions",
          "2. Lead Form → Settings → Webhook",
          `3. Webhook URL: ${webhookUrl}`,
          `4. Key: ${secret}`,
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const receiveGoogleLead = async (req, res) => {
  try {
    const signature = req.headers["google-lead-signature"] || req.headers["x-goog-signature"] || "";
    const rawId = req.body?.customer_id || req.headers["x-goog-customer-id"];
    const customerId = normalizeCustomerId(rawId); // ✅ normalize before lookup

    if (!customerId) {
      return res.status(400).json({ message: "Missing customer_id" });
    }

    const source = await AdLeadSource.findOne({
      google_customer_id: customerId,
      source_type: "google",
      is_active: true,
    });

    if (!source) {
      return res.status(404).json({ message: "Source not found" });
    }

    if (source.google_webhook_secret && signature) {
      const hmac = crypto.createHmac("sha256", source.google_webhook_secret);
      hmac.update(JSON.stringify(req.body));
      const expected = hmac.digest("hex");

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature.replace("sha256=", ""), "hex"),
        Buffer.from(expected, "hex")
      );

      if (!isValid) {
        return res.status(401).json({ message: "Invalid signature" });
      }
    }

    res.status(200).json({ message: "Lead received" });

    googleLeadService.processWebhookPayload(req.body, customerId).catch(console.error);
  } catch (error) {
    console.error("Google webhook error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal error" });
    }
  }
};