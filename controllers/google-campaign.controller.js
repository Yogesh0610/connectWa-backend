import { googleCampaignService } from "../services/ads/google/google-campaign.service.js";
import { getGoogleCustomer } from "../services/ads/google/google-client.helper.js";
import { GoogleCampaign } from "../models/GoogleCampaign.js";

export const getCampaigns = async (req, res) => {
  try {
    const { ad_account_id, campaign_type, status, search, page = 1, limit = 20 } = req.query;
    const filter = { user_id: req.user._id };
    if (ad_account_id) filter.ad_account_id = ad_account_id;
    if (campaign_type) filter.campaign_type = campaign_type;
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [campaigns, total] = await Promise.all([
      GoogleCampaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      GoogleCampaign.countDocuments(filter),
    ]);

    res.json({ success: true, data: campaigns, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCampaign = async (req, res) => {
  try {
    const campaign = await googleCampaignService.createCampaign(
      req.user._id,
      req.body.ad_account_id,
      req.body
    );
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const syncCampaigns = async (req, res) => {
  try {
    const campaigns = await googleCampaignService.syncCampaigns(req.params.adAccountId);
    res.json({ success: true, data: campaigns, message: "Campaigns synced" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCampaignStatus = async (req, res) => {
  try {
    const campaign = await googleCampaignService.updateStatus(req.params.id, req.body.status);
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCampaignBudget = async (req, res) => {
  try {
    const campaign = await googleCampaignService.updateBudget(req.params.id, req.body.budget_amount);
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCampaignInsights = async (req, res) => {
  try {
    const insights = await googleCampaignService.getInsights(req.params.id, req.query.date_range);
    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const campaign = await GoogleCampaign.findOneAndDelete({ _id: req.params.id, user_id: req.user._id });
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    res.json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const searchGeoTargets = async (req, res) => {
  try {
    const customer = await getGoogleCustomer(req.query.ad_account_id);
    const results = await googleCampaignService.searchGeoTargets(req.query.q, customer);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};