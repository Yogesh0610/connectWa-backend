import { googleAdGroupService } from "../services/ads/google/google-adgroup.service.js";
import { googleAdService } from "../services/ads/google/google-ad.service.js";
import { GoogleAdGroup } from "../models/GoogleAdGroup.js";
import { GoogleAd } from "../models/GoogleAd.js";

// ─── Ad Groups ──────────────────────────────────────────────
export const createAdGroup = async (req, res) => {
  try {
    const adGroup = await googleAdGroupService.createAdGroup(
      req.user._id,
      req.body.campaign_id,
      req.body
    );
    res.status(201).json({ success: true, data: adGroup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdGroups = async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (req.query.campaign_id) filter.campaign_id = req.query.campaign_id;

    const [adGroups, total] = await Promise.all([
      GoogleAdGroup.find(filter)
        .populate("campaign_id", "name campaign_type status")
        .sort({ createdAt: -1 }),
      GoogleAdGroup.countDocuments(filter),
    ]);

    res.json({ success: true, data: adGroups, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdGroupStatus = async (req, res) => {
  try {
    const adGroup = await googleAdGroupService.updateAdGroupStatus(req.params.id, req.body.status);
    res.json({ success: true, data: adGroup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addKeywords = async (req, res) => {
  try {
    const adGroup = await googleAdGroupService.addKeywords(req.params.id, req.body.keywords);
    res.json({ success: true, data: adGroup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getKeywordIdeas = async (req, res) => {
  try {
    const { ad_account_id, keywords, url } = req.query;
    const ideas = await googleAdGroupService.getKeywordIdeas(
      ad_account_id,
      keywords?.split(",") || [],
      url
    );
    res.json({ success: true, data: ideas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Ads ────────────────────────────────────────────────────
export const createRSA = async (req, res) => {
  try {
    const ad = await googleAdService.createRSA(req.user._id, req.body.adgroup_id, req.body);
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createDisplayAd = async (req, res) => {
  try {
    const ad = await googleAdService.createDisplayAd(req.user._id, req.body.adgroup_id, req.body);
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createPMaxAssetGroup = async (req, res) => {
  try {
    const ad = await googleAdService.createPMaxAssetGroup(req.user._id, req.body.campaign_id, req.body);
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createLeadFormExtension = async (req, res) => {
  try {
    const ad = await googleAdService.createLeadFormExtension(req.user._id, req.body.campaign_id, req.body);
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAds = async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (req.query.adgroup_id) filter.adgroup_id = req.query.adgroup_id;
    if (req.query.campaign_id) filter.campaign_id = req.query.campaign_id;
    if (req.query.ad_type) filter.ad_type = req.query.ad_type;

    const ads = await GoogleAd.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: ads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdStatus = async (req, res) => {
  try {
    const ad = await googleAdService.updateAdStatus(req.params.id, req.body.status);
    res.json({ success: true, data: ad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};