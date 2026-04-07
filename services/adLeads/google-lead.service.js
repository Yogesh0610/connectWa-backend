import crypto from "crypto";
import { AdLeadSource } from "../../models/AdLeadSource.js";
import { AdLead } from "../../models/AdLead.js";
import { leadProcessorService } from "./lead-processor.service.js";

class GoogleLeadService {

  // Google webhook signature verify karo
  verifySignature(payload, signature, secret) {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(JSON.stringify(payload));
    const expected = hmac.digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  }

  // Google field data normalize karo
  normalizeFields(columnData = [], userColumnData = []) {
    const map = {};

    // System columns
    for (const col of columnData) {
      map[col.column_id] = col.string_values?.[0] || "";
    }
    // Custom columns
    for (const col of userColumnData) {
      map[col.column_id] = col.string_values?.[0] || "";
    }

    return {
      name: `${map["GIVEN_NAME"] || ""} ${map["FAMILY_NAME"] || ""}`.trim() || map["FULL_NAME"] || "",
      email: map["EMAIL"] || "",
      phone: map["PHONE_NUMBER"] || "",
      city: map["CITY"] || "",
      state: map["PROVINCE"] || map["STATE"] || "",
      country: map["COUNTRY"] || "",
      company: map["COMPANY_NAME"] || "",
      message: map["COMMENTS"] || "",
    };
  }

  async processWebhookPayload(payload, customerId) {
    try {
      const source = await AdLeadSource.findOne({
        google_customer_id: customerId,
        source_type: "google",
        is_active: true,
      });

      if (!source) {
        console.warn(`No active Google source for customer_id: ${customerId}`);
        return;
      }

      const leads = payload.google_ads_leads || [];

      for (const googleLead of leads) {
        const leadId = googleLead.lead_id;

        // Duplicate check
        const exists = await AdLead.findOne({
          platform_lead_id: leadId,
          source_type: "google",
        });
        if (exists) continue;

        const lead_data = this.normalizeFields(
          googleLead.column_data,
          googleLead.user_column_data
        );

        const lead = await AdLead.create({
          workspace_id: source.workspace_id,
          source_id: source._id,
          source_type: "google",
          platform_lead_id: leadId,
          platform_ad_id: googleLead.ad_id,
          platform_campaign_id: googleLead.campaign_id,
          lead_data,
          raw_fields: [
            ...(googleLead.column_data || []),
            ...(googleLead.user_column_data || []),
          ],
          raw_payload: googleLead,
          status: "new",
        });

        await leadProcessorService.process(lead, source);
      }
    } catch (error) {
      console.error("Google lead processing error:", error.message);
    }
  }
}

export const googleLeadService = new GoogleLeadService();