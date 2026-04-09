import axios from "axios";
import { MetaAdSet } from "../../../models/MetaAdSet.js";
import { MetaCampaign } from "../../../models/MetaCampaign.js";
import { AdAccount } from "../../../models/AdAccount.js";

class MetaAdSetService {
  constructor() {
    this.apiVersion = "v21.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  async getToken(adAccountDbId) {
    const account = await AdAccount.findById(adAccountDbId).select("meta_access_token meta_ad_account_id");
    return { token: account.meta_access_token, accountId: account.meta_ad_account_id };
  }

  async createAdSet(userId, campaignDbId, payload) {
    const campaign = await MetaCampaign.findById(campaignDbId).populate("ad_account_id");
    if (!campaign) throw new Error("Campaign not found");

    const token = campaign.ad_account_id.meta_access_token;
    const accountId = campaign.ad_account_id.meta_ad_account_id;

    const {
      name,
      daily_budget,
      lifetime_budget,
      bid_amount,
      billing_event = "IMPRESSIONS",
      optimization_goal = "LEAD_GENERATION",
      start_time,
      end_time,
      targeting = {},
      promoted_object,
      status = "PAUSED",
    } = payload;

    // Build Meta targeting spec
    const targeting_spec = {
      age_min: targeting.age_min || 18,
      age_max: targeting.age_max || 65,
      ...(targeting.genders?.length && { genders: targeting.genders }),
      geo_locations: targeting.geo_locations || { countries: ["IN"] },
      ...(targeting.interests?.length && {
        flexible_spec: [{ interests: targeting.interests.map((i) => ({ id: i.id, name: i.name })) }],
      }),
      ...(targeting.behaviors?.length && {
        flexible_spec: [{ behaviors: targeting.behaviors.map((b) => ({ id: b.id, name: b.name })) }],
      }),
      ...(targeting.custom_audiences?.length && {
        custom_audiences: targeting.custom_audiences.map((a) => ({ id: a.id, name: a.name })),
      }),
      ...(targeting.excluded_custom_audiences?.length && {
        excluded_custom_audiences: targeting.excluded_custom_audiences.map((a) => ({ id: a.id })),
      }),
      device_platforms: targeting.device_platforms || ["mobile", "desktop"],
      publisher_platforms: targeting.publisher_platforms || ["facebook", "instagram"],
      ...(targeting.facebook_positions?.length && { facebook_positions: targeting.facebook_positions }),
      ...(targeting.instagram_positions?.length && { instagram_positions: targeting.instagram_positions }),
      ...(targeting.languages?.length && { locales: targeting.languages }),
    };

    // Call Meta API
    const metaPayload = {
      name,
      campaign_id:       campaign.meta_campaign_id,
      billing_event,
      optimization_goal,
      status,
      targeting:         targeting_spec,
      ...(daily_budget    && { daily_budget:    Math.round(daily_budget    * 100) }),
      ...(lifetime_budget && { lifetime_budget: Math.round(lifetime_budget * 100) }),
      ...(bid_amount      && { bid_amount:      Math.round(bid_amount      * 100) }),
      ...(start_time && { start_time: new Date(start_time).toISOString() }),
      ...(end_time   && { end_time:   new Date(end_time).toISOString()   }),
      ...(promoted_object && { promoted_object }),
    };
    console.log(`[MetaAdSet] Creating ad set → POST act_${accountId}/adsets`, JSON.stringify({
      optimization_goal: metaPayload.optimization_goal,
      billing_event:     metaPayload.billing_event,
      campaign_id:       metaPayload.campaign_id,
      promoted_object:   metaPayload.promoted_object,
      daily_budget:      metaPayload.daily_budget,
    }));
    const res = await axios.post(
      `${this.baseUrl}/${accountId}/adsets`,
      metaPayload,
      { params: { access_token: token } }
    );

    // Save locally
    const adSet = await MetaAdSet.create({
      user_id: userId,
      ad_account_id: campaign.ad_account_id._id,
      campaign_id: campaignDbId,
      meta_adset_id: res.data.id,
      meta_campaign_id: campaign.meta_campaign_id,
      name,
      status,
      daily_budget: daily_budget ? Math.round(daily_budget * 100) : null,
      lifetime_budget: lifetime_budget ? Math.round(lifetime_budget * 100) : null,
      bid_amount: bid_amount ? Math.round(bid_amount * 100) : null,
      billing_event,
      optimization_goal,
      start_time,
      end_time,
      targeting,
      promoted_object,
      is_synced: true,
      last_synced_at: new Date(),
    });

    return adSet;
  }

  // Search interests for targeting
  async searchInterests(query, accessToken) {
    const res = await axios.get(`${this.baseUrl}/search`, {
      params: {
        type: "adinterest",
        q: query,
        access_token: accessToken,
        limit: 20,
      },
    });
    return res.data.data;
  }

  // Search behaviors
  async searchBehaviors(accessToken) {
    const res = await axios.get(`${this.baseUrl}/search`, {
      params: {
        type: "adTargetingCategory",
        class: "behaviors",
        access_token: accessToken,
      },
    });
    return res.data.data;
  }

  // Get custom audiences
  async getCustomAudiences(adAccountId, accessToken) {
    const res = await axios.get(`${this.baseUrl}/${adAccountId}/customaudiences`, {
      params: {
        access_token: accessToken,
        fields: "id,name,subtype,approximate_count",
        limit: 100,
      },
    });
    return res.data.data;
  }

  async updateAdSet(adsetDbId, payload) {
    const adset = await MetaAdSet.findById(adsetDbId)
      .populate({ path: "ad_account_id", select: "meta_access_token" });

    const token = adset.ad_account_id.meta_access_token;
    const { status, daily_budget, bid_amount } = payload;

    await axios.post(
      `${this.baseUrl}/${adset.meta_adset_id}`,
      {
        ...(status && { status }),
        ...(daily_budget && { daily_budget: Math.round(daily_budget * 100) }),
        ...(bid_amount && { bid_amount: Math.round(bid_amount * 100) }),
      },
      { params: { access_token: token } }
    );

    return await MetaAdSet.findByIdAndUpdate(adsetDbId, payload, { new: true });
  }
}

export const metaAdSetService = new MetaAdSetService();