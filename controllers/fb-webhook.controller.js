import { fbLeadService } from '../services/adLeads/fb-lead.service.js';
const FB_VERIFY_TOKEN = process.env.FB_LEAD_VERIFY_TOKEN || "whatsdesk_fb_leads_token";

// GET - FB webhook verification
export const verifyFbWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("FB Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ message: "Verification failed" });
};

// POST - FB/Instagram lead receive
export const receiveFbLead = async (req, res) => {
  try {
    // Immediately 200 return karo (FB 20s timeout hai)
    res.status(200).send("EVENT_RECEIVED");

    const body = req.body;

    if (body.object !== "page") {
      console.log("Not a page event:", body.object);
      return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const pageId = entry.id;
      await fbLeadService.processWebhookEntry(entry, pageId);
    }
  } catch (error) {
    console.error("FB webhook error:", error.message);
  }
};