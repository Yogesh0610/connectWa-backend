import { metaAdSetService } from "../services/ads/meta/meta-adset.service.js";
import { MetaAdSet } from "../models/MetaAdSet.js";
import { AdAccount } from "../models/AdAccount.js";

export const createAdSet = async (req, res) => {
  try {
    const adset = await metaAdSetService.createAdSet(
      req.user._id,
      req.body.campaign_id,
      req.body
    );
    res.status(201).json({ success: true, data: adset });
  } catch (error) {
    const metaError = error.response?.data?.error;
    const message = metaError ? `Meta API: ${metaError.message}` : error.message;
    console.error("createAdSet error:", metaError || error.message);
    res.status(500).json({ success: false, message });
  }
};

export const getAdSets = async (req, res) => {
  try {
    const { campaign_id, ad_account_id, status, page = 1, limit = 20 } = req.query;
    const filter = { user_id: req.user._id };

    if (campaign_id) filter.campaign_id = campaign_id;
    if (ad_account_id) filter.ad_account_id = ad_account_id;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [adsets, total] = await Promise.all([
      MetaAdSet.find(filter)
        .populate("campaign_id", "name objective status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      MetaAdSet.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: adsets,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdSetById = async (req, res) => {
  try {
    const adset = await MetaAdSet.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    })
      .populate("campaign_id", "name objective status")
      .populate("ad_account_id", "name meta_ad_account_id currency");

    if (!adset) {
      return res.status(404).json({ success: false, message: "Ad Set not found" });
    }

    res.json({ success: true, data: adset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdSet = async (req, res) => {
  try {
    // Verify ownership
    const existing = await MetaAdSet.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Ad Set not found" });
    }

    const adset = await metaAdSetService.updateAdSet(req.params.id, req.body);
    res.json({ success: true, data: adset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdSetStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["ACTIVE", "PAUSED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status. Use ACTIVE or PAUSED" });
    }

    const existing = await MetaAdSet.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Ad Set not found" });
    }

    const adset = await metaAdSetService.updateAdSet(req.params.id, { status });
    res.json({ success: true, data: adset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAdSet = async (req, res) => {
  try {
    const adset = await MetaAdSet.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    }).populate("ad_account_id", "meta_access_token");

    if (!adset) {
      return res.status(404).json({ success: false, message: "Ad Set not found" });
    }

    // Delete on Meta
    await metaAdSetService.updateAdSet(req.params.id, { status: "DELETED" });

    // Soft delete locally
    await MetaAdSet.findByIdAndUpdate(req.params.id, { status: "DELETED" });

    res.json({ success: true, message: "Ad Set deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const searchInterests = async (req, res) => {
  try {
    const { q, ad_account_id } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Query must be at least 2 characters" });
    }

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    }).select("meta_access_token");

    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const results = await metaAdSetService.searchInterests(q.trim(), account.meta_access_token);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const searchBehaviors = async (req, res) => {
  try {
    const { ad_account_id } = req.query;

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    }).select("meta_access_token");

    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const results = await metaAdSetService.searchBehaviors(account.meta_access_token);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCustomAudiences = async (req, res) => {
  try {
    const { ad_account_id } = req.query;

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    }).select("meta_access_token meta_ad_account_id");

    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const results = await metaAdSetService.getCustomAudiences(
      account.meta_ad_account_id,
      account.meta_access_token
    );
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdSetInsights = async (req, res) => {
  try {
    const { date_preset = "last_30d" } = req.query;

    const adset = await MetaAdSet.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    }).populate("ad_account_id", "meta_access_token");

    if (!adset) {
      return res.status(404).json({ success: false, message: "Ad Set not found" });
    }

    // Use metaAdSetService or direct axios call
    const axios = (await import("axios")).default;
    const res2 = await axios.get(
      `https://graph.facebook.com/v19.0/${adset.meta_adset_id}/insights`,
      {
        params: {
          access_token: adset.ad_account_id.meta_access_token,
          fields: "impressions,clicks,spend,cpm,cpc,ctr,actions,cost_per_action_type",
          date_preset,
        },
      }
    );

    res.json({ success: true, data: res2.data.data?.[0] || {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};