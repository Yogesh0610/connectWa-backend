import axios from "axios";
import { MetaCampaign } from "../../../models/MetaCampaign.js";
import { AdAccount } from "../../../models/AdAccount.js";

class MetaCampaignService {
  constructor() {
    this.apiVersion = "v19.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  async getToken(adAccountDbId) {
    const account = await AdAccount.findById(adAccountDbId).select("meta_access_token meta_ad_account_id");
    if (!account) throw new Error("Ad account not found");
    return { token: account.meta_access_token, accountId: account.meta_ad_account_id };
  }

  // Create campaign on Meta + save locally
  async createCampaign(userId, adAccountDbId, payload) {
    const { token, accountId } = await this.getToken(adAccountDbId);

    const {
      name,
      objective,
      status = "PAUSED",
      special_ad_categories = [],
      daily_budget,
      lifetime_budget,
      bid_strategy = "LOWEST_COST_WITHOUT_CAP",
      start_time,
      end_time,
    } = payload;

    // Call Meta API
    const res = await axios.post(
      `${this.baseUrl}/${accountId}/campaigns`,
      {
        name,
        objective,
        status,
        special_ad_categories,
        ...(daily_budget && { daily_budget: Math.round(daily_budget * 100) }),
        ...(lifetime_budget && { lifetime_budget: Math.round(lifetime_budget * 100) }),
        bid_strategy,
        ...(start_time && { start_time: new Date(start_time).toISOString() }),
        ...(end_time && { end_time: new Date(end_time).toISOString() }),
      },
      { params: { access_token: token } }
    );

    // Save to DB
    const campaign = await MetaCampaign.create({
      user_id: userId,
      ad_account_id: adAccountDbId,
      meta_campaign_id: res.data.id,
      name,
      objective,
      status,
      special_ad_categories,
      daily_budget: daily_budget ? Math.round(daily_budget * 100) : null,
      lifetime_budget: lifetime_budget ? Math.round(lifetime_budget * 100) : null,
      bid_strategy,
      start_time,
      end_time,
      is_synced: true,
      last_synced_at: new Date(),
    });

    return campaign;
  }

  // Get all campaigns from Meta + sync
  async syncCampaigns(adAccountDbId) {
    const { token, accountId } = await this.getToken(adAccountDbId);

    const res = await axios.get(
      `${this.baseUrl}/${accountId}/campaigns`,
      {
        params: {
          access_token: token,
          fields: "id,name,objective,status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,insights{impressions,clicks,spend,actions}",
          limit: 100,
        },
      }
    );

    const campaigns = res.data.data;

    // Upsert all
    for (const c of campaigns) {
      const leads = c.insights?.data?.[0]?.actions?.find((a) => a.action_type === "lead")?.value || 0;
      await MetaCampaign.findOneAndUpdate(
        { meta_campaign_id: c.id },
        {
          meta_campaign_id: c.id,
          name: c.name,
          objective: c.objective,
          status: c.status,
          daily_budget: c.daily_budget,
          lifetime_budget: c.lifetime_budget,
          bid_strategy: c.bid_strategy,
          start_time: c.start_time,
          end_time: c.stop_time,
          is_synced: true,
          last_synced_at: new Date(),
          stats: {
            impressions: c.insights?.data?.[0]?.impressions || 0,
            clicks: c.insights?.data?.[0]?.clicks || 0,
            leads: Number(leads),
            spend: c.insights?.data?.[0]?.spend || 0,
          },
        },
        { upsert: true, new: true }
      );
    }

    return await MetaCampaign.find({ ad_account_id: adAccountDbId }).sort({ createdAt: -1 });
  }

  // Update campaign status (ACTIVE/PAUSED)
  async updateStatus(campaignDbId, status) {
    const campaign = await MetaCampaign.findById(campaignDbId).populate("ad_account_id");
    if (!campaign) throw new Error("Campaign not found");

    const token = campaign.ad_account_id.meta_access_token;

    await axios.post(
      `${this.baseUrl}/${campaign.meta_campaign_id}`,
      { status },
      { params: { access_token: token } }
    );

    return await MetaCampaign.findByIdAndUpdate(campaignDbId, { status }, { new: true });
  }

  // Delete campaign
  async deleteCampaign(campaignDbId) {
    const campaign = await MetaCampaign.findById(campaignDbId).populate("ad_account_id");
    if (!campaign) throw new Error("Campaign not found");

    const token = campaign.ad_account_id.meta_access_token;

    await axios.delete(
      `${this.baseUrl}/${campaign.meta_campaign_id}`,
      { params: { access_token: token } }
    );

    await MetaCampaign.findByIdAndUpdate(campaignDbId, { status: "DELETED" });
    return { success: true };
  }

  // Get insights / stats
  async getInsights(campaignDbId, datePreset = "last_30d") {
    const campaign = await MetaCampaign.findById(campaignDbId).populate("ad_account_id");
    const token = campaign.ad_account_id.meta_access_token;

    const res = await axios.get(
      `${this.baseUrl}/${campaign.meta_campaign_id}/insights`,
      {
        params: {
          access_token: token,
          fields: "impressions,clicks,spend,cpm,cpc,ctr,actions,cost_per_action_type",
          date_preset: datePreset,
        },
      }
    );

    return res.data.data?.[0] || {};
  }
}

export const metaCampaignService = new MetaCampaignService();