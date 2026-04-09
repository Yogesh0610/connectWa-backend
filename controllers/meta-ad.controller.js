import { metaCreativeService } from "../services/ads/meta/meta-creative.service.js";
import { MetaAd } from "../models/MetaAd.js";
import { AdAccount } from "../models/AdAccount.js";

// ─── Image Upload ────────────────────────────────────────────────────────────
export const uploadImage = async (req, res) => {
  try {
    const account = await AdAccount.findOne({
      _id: req.body.ad_account_id,
      user_id: req.user._id,
    });
    if (!account) return res.status(404).json({ success: false, message: "Ad account not found" });

    const result = await metaCreativeService.uploadImage(
      account.meta_ad_account_id,
      account.meta_access_token,
      req.file.buffer,
      req.file.mimetype
    );
    res.json({ success: true, data: result });
  } catch (error) {
    const metaError = error.response?.data?.error;
    const message = metaError
      ? `Meta API: ${metaError.message} (code: ${metaError.code}) — ${metaError.error_user_msg || ""}`
      : error.message;
    console.error("uploadImage error:", message);
    res.status(500).json({ success: false, message });
  }
};

// ─── Create Ad ───────────────────────────────────────────────────────────────
export const createAd = async (req, res) => {
  try {
    const { adset_id } = req.body;
    if (!adset_id) return res.status(400).json({ success: false, message: "adset_id is required" });

    const ad = await metaCreativeService.createAd(req.user._id, adset_id, req.body);
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    const metaError = error.response?.data?.error;
    const message = metaError
      ? `Meta API: ${metaError.message} (code: ${metaError.code}, subcode: ${metaError.error_subcode}) — ${metaError.error_user_msg || ""}`
      : error.message;
    console.error("createAd error:", JSON.stringify(metaError || error.message));
    res.status(500).json({ success: false, message });
  }
};

// ─── Get Ads ─────────────────────────────────────────────────────────────────
export const getAds = async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (req.query.adset_id)   filter.adset_id   = req.query.adset_id;
    if (req.query.campaign_id) filter.campaign_id = req.query.campaign_id;
    if (req.query.ad_type)    filter.ad_type     = req.query.ad_type;

    const ads = await MetaAd.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: ads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
