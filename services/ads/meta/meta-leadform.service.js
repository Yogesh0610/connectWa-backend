import axios from "axios";
import { AdAccount } from "../../../models/AdAccount.js";

class MetaLeadFormService {
  constructor() {
    this.apiVersion = "v19.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // Get existing lead forms for a page
  async getLeadForms(pageId, pageAccessToken) {
    const res = await axios.get(
      `${this.baseUrl}/${pageId}/leadgen_forms`,
      {
        params: {
          access_token: pageAccessToken,
          fields: "id,name,status,leads_count,questions,created_time",
          limit: 50,
        },
      }
    );
    return res.data.data;
  }

  // Create new lead form
  async createLeadForm(pageId, pageAccessToken, payload) {
    const {
      name,
      questions,
      privacy_policy_url,
      thank_you_page,
      locale = "en_US",
      block_display_for_non_targeted_viewer = false,
      follow_up_action_url,
      context_card,
    } = payload;

    // Default questions if not provided
    const defaultQuestions = questions || [
      { type: "FULL_NAME" },
      { type: "EMAIL" },
      { type: "PHONE" },
    ];

    const res = await axios.post(
      `${this.baseUrl}/${pageId}/leadgen_forms`,
      {
        name,
        questions: defaultQuestions,
        privacy_policy: { url: privacy_policy_url || "https://yourdomain.com/privacy" },
        ...(thank_you_page && {
          thank_you_page: {
            title: thank_you_page.title || "Thank you!",
            body: thank_you_page.body || "We will contact you shortly.",
            ...(follow_up_action_url && {
              button_text: thank_you_page.button_text || "Visit Website",
              website_url: follow_up_action_url,
            }),
          },
        }),
        locale,
        block_display_for_non_targeted_viewer,
        ...(context_card && {
          context_card: {
            title: context_card.title,
            style: context_card.style || "LIST_STYLE",
            content: context_card.content || [],
          },
        }),
      },
      { params: { access_token: pageAccessToken } }
    );

    return { form_id: res.data.id, name };
  }

  // Get leads from a form
  async getFormLeads(formId, pageAccessToken, after = null) {
    const res = await axios.get(
      `${this.baseUrl}/${formId}/leads`,
      {
        params: {
          access_token: pageAccessToken,
          fields: "id,created_time,field_data,ad_id,campaign_id",
          limit: 100,
          ...(after && { after }),
        },
      }
    );
    return res.data;
  }

  // Get page access token from AdAccount
  async getPageToken(adAccountDbId, pageId) {
    const account = await AdAccount.findById(adAccountDbId);
    const page = account.meta_pages.find((p) => p.page_id === pageId);
    if (!page) throw new Error("Page not found in this account");
    return page.page_access_token;
  }
}

export const metaLeadFormService = new MetaLeadFormService();