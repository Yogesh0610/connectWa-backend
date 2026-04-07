import { metaAdSetService } from "../services/ads/meta/meta-adset.service.js";
import { metaCreativeService } from "../services/ads/meta/meta-creative.service.js";
import { metaLeadFormService } from "../services/ads/meta/meta-leadform.service.js";
import { MetaAdSet } from "../models/MetaAdSet.js";
import { MetaAd } from "../models/MetaAd.js";
import { AdAccount } from "../models/AdAccount.js";

// ─── Ad Sets ────────────────────────────────────────────────
export const createAdSet = async (req, res) => {
  try {
    const adset = await metaAdSetService.createAdSet(req.user._id, req.body.campaign_id, req.body);
    res.status(201).json({ success: true, data: adset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdSets = async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (req.query.campaign_id) filter.campaign_id = req.query.campaign_id;
    const adsets = await MetaAdSet.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: adsets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdSet = async (req, res) => {
  try {
    const adset = await metaAdSetService.updateAdSet(req.params.id, req.body);
    res.json({ success: true, data: adset });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const searchInterests = async (req, res) => {
  try {
    const account = await AdAccount.findById(req.query.ad_account_id);
    const results = await metaAdSetService.searchInterests(req.query.q, account.meta_access_token);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCustomAudiences = async (req, res) => {
  try {
    const account = await AdAccount.findById(req.query.ad_account_id);
    const results = await metaAdSetService.getCustomAudiences(
      account.meta_ad_account_id,
      account.meta_access_token
    );
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Ads + Creatives ────────────────────────────────────────
export const uploadImage = async (req, res) => {
  try {
    const account = await AdAccount.findById(req.body.ad_account_id);
    const result = await metaCreativeService.uploadImage(
      account.meta_ad_account_id,
      account.meta_access_token,
      req.file.buffer,
      req.file.mimetype
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createAd = async (req, res) => {
  try {
    const ad = await metaCreativeService.createAd(req.user._id, req.body.adset_id, req.body);
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAds = async (req, res) => {
  try {
    const filter = { user_id: req.user._id };
    if (req.query.adset_id) filter.adset_id = req.query.adset_id;
    if (req.query.campaign_id) filter.campaign_id = req.query.campaign_id;
    const ads = await MetaAd.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: ads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Lead Forms ─────────────────────────────────────────────
export const getLeadForms = async (req, res) => {
  try {
    const account = await AdAccount.findById(req.query.ad_account_id);
    const page = account.meta_pages.find((p) => p.page_id === req.query.page_id);
    if (!page) return res.status(404).json({ success: false, message: "Page not found" });
    const forms = await metaLeadFormService.getLeadForms(page.page_id, page.page_access_token);
    res.json({ success: true, data: forms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createLeadForm = async (req, res) => {
  try {
    const account = await AdAccount.findById(req.body.ad_account_id);
    const page = account.meta_pages.find((p) => p.page_id === req.body.page_id);
    if (!page) return res.status(404).json({ success: false, message: "Page not found" });
    const form = await metaLeadFormService.createLeadForm(page.page_id, page.page_access_token, req.body);
    res.status(201).json({ success: true, data: form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};