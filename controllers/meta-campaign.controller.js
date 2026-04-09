import { metaCampaignService } from "../services/ads/meta/meta-campaign.service.js";
import { MetaCampaign } from "../models/MetaCampaign.js";

export const getCampaigns = async (req, res) => {
  try {
    const { ad_account_id, status, search, page = 1, limit = 20 } = req.query;
    const filter = { user_id: req.user._id };
    if (ad_account_id) filter.ad_account_id = ad_account_id;
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [campaigns, total] = await Promise.all([
      MetaCampaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      MetaCampaign.countDocuments(filter),
    ]);

    res.json({ success: true, data: campaigns, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCampaign = async (req, res) => {
  try {
    const campaign = await metaCampaignService.createCampaign(req.user._id, req.body.ad_account_id, req.body);
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const syncCampaigns = async (req, res) => {
  try {
    const campaigns = await metaCampaignService.syncCampaigns(req.params.adAccountId);
    res.json({ success: true, data: campaigns, message: "Campaigns synced" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCampaignStatus = async (req, res) => {
  try {
    const campaign = await metaCampaignService.updateStatus(req.params.id, req.body.status);
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCampaignInsights = async (req, res) => {
  try {
    const insights = await metaCampaignService.getInsights(req.params.id, req.query.date_preset);
    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    await metaCampaignService.deleteCampaign(req.params.id);
    res.json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const refreshAccountToken = async (req, res) => {
  try {
    const result = await metaCampaignService.refreshToken(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};