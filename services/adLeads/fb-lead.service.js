import axios from "axios";
import { AdLeadSource } from "../../models/AdLeadSource.js";
import { AdLead } from "../../models/AdLead.js";
import { leadProcessorService } from "./lead-processor.service.js";

class FbLeadService {

  // FB se full lead data fetch karo (leadgen_id se)
  async fetchLeadData(leadgenId, accessToken) {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/${leadgenId}`,
        {
          params: {
            access_token: accessToken,
            fields: "id,created_time,ad_id,form_id,field_data",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("FB lead fetch error:", error?.response?.data || error.message);
      throw error;
    }
  }

  // Normalize FB field_data → lead_data
  normalizeFields(fieldData = []) {
    const map = {};
    for (const field of fieldData) {
      map[field.name] = field.values?.[0] || "";
    }

    return {
      name: map["full_name"] || map["first_name"]
        ? `${map["first_name"] || ""} ${map["last_name"] || ""}`.trim()
        : map["full_name"] || "",
      email: map["email"] || "",
      phone: map["phone_number"] || map["phone"] || "",
      city: map["city"] || "",
      state: map["state"] || "",
      country: map["country"] || "",
      company: map["company_name"] || map["company"] || "",
      message: map["message"] || map["comments"] || "",
    };
  }

  // Webhook se aaya lead process karo
  async processWebhookEntry(entry, pageId) {
    try {
      // Source find karo from page_id
      const source = await AdLeadSource.findOne({
        fb_page_id: pageId,
        is_active: true,
      });

      if (!source) {
        console.warn(`No active source found for page_id: ${pageId}`);
        return;
      }

      const changes = entry.changes || [];

      for (const change of changes) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, form_id, ad_id, page_id } = change.value;

        // Duplicate check
        const exists = await AdLead.findOne({
          platform_lead_id: leadgen_id,
          source_type: { $in: ["facebook", "instagram"] },
        });
        if (exists) {
          console.log(`Duplicate lead skipped: ${leadgen_id}`);
          continue;
        }

        // FB se full data fetch karo
        const fbData = await this.fetchLeadData(leadgen_id, source.fb_access_token);
        const lead_data = this.normalizeFields(fbData.field_data);

        // Determine source type (FB or Insta)
        const source_type = source.source_type; // "facebook" or "instagram"

        // Lead save karo
        const lead = await AdLead.create({
          workspace_id: source.workspace_id,
          source_id: source._id,
          source_type,
          platform_lead_id: leadgen_id,
          platform_form_id: form_id,
          platform_ad_id: ad_id,
          platform_page_id: page_id,
          lead_data,
          raw_fields: fbData.field_data,
          raw_payload: change.value,
          status: "new",
        });

        // Automation trigger karo
        await leadProcessorService.process(lead, source);
      }
    } catch (error) {
      console.error("FB webhook entry processing error:", error.message);
    }
  }
}

export const fbLeadService = new FbLeadService();