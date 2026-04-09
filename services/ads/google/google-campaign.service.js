import { getGoogleCustomer, toMicros, fromMicros } from "./google-client.helper.js";
import { GoogleCampaign } from "../../../models/GoogleCampaign.js";
import { GoogleAdAccount } from "../../../models/GoogleAdAccount.js";

class GoogleCampaignService {

  async createCampaign(userId, adAccountDbId, payload) {
    const customer = await getGoogleCustomer(adAccountDbId);
    const account = await GoogleAdAccount.findById(adAccountDbId);

    const {
      name,
      campaign_type,
      budget_amount,
      budget_type = "DAILY",
      bidding_strategy = "MAXIMIZE_CONVERSIONS",
      target_cpa,
      target_roas,
      start_date,
      end_date,
      network_settings,
      geo_targets,
      language_codes = ["1000"], // English
      status = "PAUSED",
    } = payload;

    // Step 1: Create budget
    const budgetRes = await customer.campaignBudgets.create([
      {
        name: `Budget for ${name}`,
        amount_micros: toMicros(budget_amount),
        delivery_method: "STANDARD",
        explicitly_shared: false,
      },
    ]);

    const budgetResourceName = budgetRes.results[0].resource_name;
    const googleBudgetId = budgetResourceName.split("/").pop();

    // Step 2: Build campaign object
    const campaignObj = {
      name,
      status,
      campaign_budget: budgetResourceName,
      advertising_channel_type: campaign_type,

      // Bidding
      ...this._buildBiddingStrategy(bidding_strategy, target_cpa, target_roas),

      // Schedule
      ...(start_date && { start_date: start_date.replace(/-/g, "") }),
      ...(end_date && { end_date: end_date.replace(/-/g, "") }),

      // Network (Search/Display only)
      ...(["SEARCH", "DISPLAY"].includes(campaign_type) && {
        network_settings: {
          target_google_search: network_settings?.target_google_search ?? true,
          target_search_network: network_settings?.target_search_network ?? true,
          target_content_network: campaign_type === "DISPLAY",
          target_partner_search_network: false,
        },
      }),
    };

    // Step 3: Create campaign
    const campaignRes = await customer.campaigns.create([campaignObj]);
    const googleCampaignId = campaignRes.results[0].resource_name.split("/").pop();

    // Step 4: Geo targeting
    if (geo_targets?.length) {
      await this._addGeoTargets(customer, googleCampaignId, geo_targets);
    }

    // Step 5: Language targeting
    if (language_codes?.length) {
      await this._addLanguageTargets(customer, googleCampaignId, language_codes);
    }

    // Step 6: Save to DB
    const campaign = await GoogleCampaign.create({
      user_id: userId,
      ad_account_id: adAccountDbId,
      google_campaign_id: googleCampaignId,
      google_customer_id: account.google_customer_id,
      name,
      campaign_type,
      status,
      budget_amount: toMicros(budget_amount),
      budget_type,
      google_budget_id: googleBudgetId,
      bidding_strategy,
      ...(target_cpa && { target_cpa_micros: toMicros(target_cpa) }),
      ...(target_roas && { target_roas }),
      start_date,
      end_date,
      network_settings,
      geo_targets,
      language_codes,
      is_synced: true,
      last_synced_at: new Date(),
    });

    return campaign;
  }

  _buildBiddingStrategy(strategy, targetCpa, targetRoas) {
    switch (strategy) {
      case "TARGET_CPA":
        return { target_cpa: { target_cpa_micros: toMicros(targetCpa || 0) } };
      case "TARGET_ROAS":
        return { target_roas: { target_roas: targetRoas || 1 } };
      case "MAXIMIZE_CONVERSIONS":
        return { maximize_conversions: {} };
      case "MAXIMIZE_CONVERSION_VALUE":
        return { maximize_conversion_value: {} };
      case "MANUAL_CPC":
        return { manual_cpc: { enhanced_cpc_enabled: false } };
      case "ENHANCED_CPC":
        return { manual_cpc: { enhanced_cpc_enabled: true } };
      default:
        return { maximize_conversions: {} };
    }
  }

  async _addGeoTargets(customer, campaignId, geoTargets) {
    const criteria = geoTargets.map((g) => ({
      campaign: `customers/${customer.credentials.customer_id}/campaigns/${campaignId}`,
      location: { geo_target_constant: `geoTargetConstants/${g.criterion_id}` },
    }));
    await customer.campaignCriteria.create(criteria);
  }

  async _addLanguageTargets(customer, campaignId, languageCodes) {
    const criteria = languageCodes.map((code) => ({
      campaign: `customers/${customer.credentials.customer_id}/campaigns/${campaignId}`,
      language: { language_constant: `languageConstants/${code}` },
    }));
    await customer.campaignCriteria.create(criteria);
  }

  // Sync campaigns from Google
  async syncCampaigns(adAccountDbId) {
    const customer = await getGoogleCustomer(adAccountDbId);
    const account = await GoogleAdAccount.findById(adAccountDbId).select("user_id google_customer_id");
    if (!account) throw new Error("Google Ad Account not found");

    const campaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign.start_date,
        campaign.end_date,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.id DESC
      LIMIT 100
    `);

    for (const row of campaigns) {
      const c = row.campaign;
      const m = row.metrics;

      await GoogleCampaign.findOneAndUpdate(
        { google_campaign_id: String(c.id), ad_account_id: adAccountDbId },
        {
          $set: {
            user_id: account.user_id,
            ad_account_id: adAccountDbId,
            google_customer_id: account.google_customer_id,
            google_campaign_id: String(c.id),
            name: c.name,
            status: c.status,
            campaign_type: c.advertising_channel_type,
            bidding_strategy: c.bidding_strategy_type,
            is_synced: true,
            last_synced_at: new Date(),
            stats: {
              impressions: Number(m.impressions || 0),
              clicks: Number(m.clicks || 0),
              conversions: Number(m.conversions || 0),
              spend_micros: Number(m.cost_micros || 0),
              ctr: Number(m.ctr || 0),
              average_cpc: Number(m.average_cpc || 0),
            },
          },
        },
        { upsert: true, new: true }
      );
    }

    return await GoogleCampaign.find({ ad_account_id: adAccountDbId }).sort({ createdAt: -1 });
  }

  // Update status
  async updateStatus(campaignDbId, status) {
    const campaign = await GoogleCampaign.findById(campaignDbId);
    if (!campaign) throw new Error("Campaign not found");

    const customer = await getGoogleCustomer(campaign.ad_account_id);

    await customer.campaigns.update([
      {
        resource_name: `customers/${campaign.google_customer_id}/campaigns/${campaign.google_campaign_id}`,
        status,
      },
    ]);

    return await GoogleCampaign.findByIdAndUpdate(campaignDbId, { status }, { new: true });
  }

  // Update budget
  async updateBudget(campaignDbId, budgetAmount) {
    const campaign = await GoogleCampaign.findById(campaignDbId);
    if (!campaign) throw new Error("Campaign not found");

    const customer = await getGoogleCustomer(campaign.ad_account_id);

    await customer.campaignBudgets.update([
      {
        resource_name: `customers/${campaign.google_customer_id}/campaignBudgets/${campaign.google_budget_id}`,
        amount_micros: toMicros(budgetAmount),
      },
    ]);

    return await GoogleCampaign.findByIdAndUpdate(
      campaignDbId,
      { budget_amount: toMicros(budgetAmount) },
      { new: true }
    );
  }

  // Get insights
  async getInsights(campaignDbId, dateRange = "LAST_30_DAYS") {
    const campaign = await GoogleCampaign.findById(campaignDbId);
    if (!campaign) throw new Error("Campaign not found");

    const customer = await getGoogleCustomer(campaign.ad_account_id);

    const results = await customer.query(`
      SELECT
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion,
        segments.date
      FROM campaign
      WHERE
        campaign.id = ${campaign.google_campaign_id}
        AND segments.date DURING ${dateRange}
      ORDER BY segments.date DESC
    `);

    return results.map((r) => ({
      date: r.segments?.date,
      impressions: Number(r.metrics?.impressions || 0),
      clicks: Number(r.metrics?.clicks || 0),
      conversions: Number(r.metrics?.conversions || 0),
      spend: fromMicros(Number(r.metrics?.cost_micros || 0)),
      ctr: Number(r.metrics?.ctr || 0),
      avg_cpc: fromMicros(Number(r.metrics?.average_cpc || 0)),
      cost_per_conversion: fromMicros(Number(r.metrics?.cost_per_conversion || 0)),
    }));
  }

  // Search geo locations
  async searchGeoTargets(query, customer) {
    const res = await customer.geoTargetConstants.suggest({
      locale: "en",
      search_term: query,
    });
    return res.geo_target_constant_suggestions?.map((s) => ({
      criterion_id: s.geo_target_constant.id,
      name: s.geo_target_constant.name,
      type: s.geo_target_constant.target_type,
      country_code: s.geo_target_constant.country_code,
    })) || [];
  }
}

export const googleCampaignService = new GoogleCampaignService();