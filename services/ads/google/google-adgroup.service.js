import { getGoogleCustomer, toMicros } from "./google-client.helper.js";
import { GoogleAdGroup } from "../../../models/GoogleAdGroup.js";
import { GoogleCampaign } from "../../../models/GoogleCampaign.js";

class GoogleAdGroupService {

  async createAdGroup(userId, campaignDbId, payload) {
    const campaign = await GoogleCampaign.findById(campaignDbId);
    if (!campaign) throw new Error("Campaign not found");

    const customer = await getGoogleCustomer(campaign.ad_account_id);

    const {
      name,
      cpc_bid,
      cpm_bid,
      target_cpa,
      status = "PAUSED",
      ad_group_type = "SEARCH_STANDARD",
      keywords = [],
      audiences = [],
    } = payload;

    // Create ad group
    const adGroupRes = await customer.adGroups.create([
      {
        name,
        campaign: `customers/${campaign.google_customer_id}/campaigns/${campaign.google_campaign_id}`,
        type: ad_group_type,
        status,
        ...(cpc_bid && { cpc_bid_micros: toMicros(cpc_bid) }),
        ...(cpm_bid && { cpm_bid_micros: toMicros(cpm_bid) }),
        ...(target_cpa && { target_cpa_micros: toMicros(target_cpa) }),
      },
    ]);

    const googleAdGroupId = adGroupRes.results[0].resource_name.split("/").pop();

    // Add keywords (Search campaigns)
    if (keywords.length) {
      await this._addKeywords(customer, campaign.google_customer_id, googleAdGroupId, keywords);
    }

    // Add audience targeting (Display/PMax)
    if (audiences.length) {
      await this._addAudiences(customer, campaign.google_customer_id, googleAdGroupId, audiences);
    }

    // Save to DB
    const adGroup = await GoogleAdGroup.create({
      user_id: userId,
      ad_account_id: campaign.ad_account_id,
      campaign_id: campaignDbId,
      google_adgroup_id: googleAdGroupId,
      google_campaign_id: campaign.google_campaign_id,
      google_customer_id: campaign.google_customer_id,
      name,
      status,
      ad_group_type,
      cpc_bid_micros: cpc_bid ? toMicros(cpc_bid) : null,
      cpm_bid_micros: cpm_bid ? toMicros(cpm_bid) : null,
      target_cpa_micros: target_cpa ? toMicros(target_cpa) : null,
      keywords,
      audiences,
      is_synced: true,
      last_synced_at: new Date(),
    });

    return adGroup;
  }

  async _addKeywords(customer, customerId, adGroupId, keywords) {
    const criteria = keywords.map((kw) => ({
      ad_group: `customers/${customerId}/adGroups/${adGroupId}`,
      status: "ENABLED",
      keyword: {
        text: kw.text,
        match_type: kw.match_type || "BROAD",
      },
      ...(kw.cpc_bid && { cpc_bid_micros: toMicros(kw.cpc_bid) }),
    }));

    await customer.adGroupCriteria.create(criteria);
  }

  async _addAudiences(customer, customerId, adGroupId, audiences) {
    const criteria = audiences.map((aud) => ({
      ad_group: `customers/${customerId}/adGroups/${adGroupId}`,
      ...(aud.type === "USER_LIST" && {
        user_list: { user_list: `customers/${customerId}/userLists/${aud.criterion_id}` },
      }),
      ...(aud.type === "USER_INTEREST" && {
        user_interest: { user_interest_category: `userInterests/${aud.criterion_id}` },
      }),
    }));

    await customer.adGroupCriteria.create(criteria);
  }

  // Add keywords to existing ad group
  async addKeywords(adGroupDbId, keywords) {
    const adGroup = await GoogleAdGroup.findById(adGroupDbId);
    if (!adGroup) throw new Error("Ad Group not found");

    const customer = await getGoogleCustomer(adGroup.ad_account_id);
    await this._addKeywords(customer, adGroup.google_customer_id, adGroup.google_adgroup_id, keywords);

    return await GoogleAdGroup.findByIdAndUpdate(
      adGroupDbId,
      { $push: { keywords: { $each: keywords } } },
      { new: true }
    );
  }

  // Pause/remove keyword
  async updateKeywordStatus(adGroupDbId, criterionId, status) {
    const adGroup = await GoogleAdGroup.findById(adGroupDbId);
    const customer = await getGoogleCustomer(adGroup.ad_account_id);

    await customer.adGroupCriteria.update([
      {
        resource_name: `customers/${adGroup.google_customer_id}/adGroupCriteria/${adGroup.google_adgroup_id}~${criterionId}`,
        status,
      },
    ]);

    return { success: true };
  }

  // Keyword ideas
  async getKeywordIdeas(adAccountDbId, keywords, url) {
    const customer = await getGoogleCustomer(adAccountDbId);
    const account = await GoogleAdGroup.findOne({ ad_account_id: adAccountDbId });

    const res = await customer.generateKeywordIdeas({
      customer_id: account?.google_customer_id,
      keywords,
      ...(url && { url }),
      language: "languageConstants/1000",
      geo_target_constants: ["geoTargetConstants/2356"], // India
      keyword_plan_network: "GOOGLE_SEARCH",
    });

    return res.results?.map((r) => ({
      text: r.text,
      avg_monthly_searches: r.keyword_idea_metrics?.avg_monthly_searches,
      competition: r.keyword_idea_metrics?.competition,
      avg_cpc_micros: r.keyword_idea_metrics?.average_cpc_micros,
    })) || [];
  }

  async updateAdGroupStatus(adGroupDbId, status) {
    const adGroup = await GoogleAdGroup.findById(adGroupDbId);
    if (!adGroup) throw new Error("Ad Group not found");

    const customer = await getGoogleCustomer(adGroup.ad_account_id);

    await customer.adGroups.update([
      {
        resource_name: `customers/${adGroup.google_customer_id}/adGroups/${adGroup.google_adgroup_id}`,
        status,
      },
    ]);

    return await GoogleAdGroup.findByIdAndUpdate(adGroupDbId, { status }, { new: true });
  }
}

export const googleAdGroupService = new GoogleAdGroupService();