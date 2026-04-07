import { metaLeadFormService } from "../services/ads/meta/meta-leadform.service.js";
import { AdAccount } from "../models/AdAccount.js";

// Get all lead forms for a page
export const getLeadForms = async (req, res) => {
  try {
    const { ad_account_id, page_id } = req.query;

    if (!ad_account_id || !page_id) {
      return res.status(400).json({ success: false, message: "ad_account_id and page_id required" });
    }

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    });
    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const page = account.meta_pages.find((p) => p.page_id === page_id);
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found in this account" });
    }

    const forms = await metaLeadFormService.getLeadForms(page.page_id, page.page_access_token);
    res.json({ success: true, data: forms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single lead form detail
export const getLeadFormById = async (req, res) => {
  try {
    const { ad_account_id, page_id } = req.query;

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    });
    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const page = account.meta_pages.find((p) => p.page_id === page_id);
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    const axios = (await import("axios")).default;
    const res2 = await axios.get(
      `https://graph.facebook.com/v19.0/${req.params.formId}`,
      {
        params: {
          access_token: page.page_access_token,
          fields: "id,name,status,questions,privacy_policy,thank_you_page,leads_count,created_time",
        },
      }
    );

    res.json({ success: true, data: res2.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new lead form
export const createLeadForm = async (req, res) => {
  try {
    const { ad_account_id, page_id, ...formPayload } = req.body;

    if (!ad_account_id || !page_id) {
      return res.status(400).json({ success: false, message: "ad_account_id and page_id required" });
    }

    // Validate required fields
    if (!formPayload.name) {
      return res.status(400).json({ success: false, message: "Form name is required" });
    }

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    });
    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const page = account.meta_pages.find((p) => p.page_id === page_id);
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    const form = await metaLeadFormService.createLeadForm(
      page.page_id,
      page.page_access_token,
      formPayload
    );

    res.status(201).json({ success: true, data: form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get leads from a specific form
export const getFormLeads = async (req, res) => {
  try {
    const { ad_account_id, page_id, after } = req.query;
    const { formId } = req.params;

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    });
    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const page = account.meta_pages.find((p) => p.page_id === page_id);
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    const leads = await metaLeadFormService.getFormLeads(
      formId,
      page.page_access_token,
      after || null
    );

    res.json({ success: true, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Archive/delete a lead form
export const archiveLeadForm = async (req, res) => {
  try {
    const { ad_account_id, page_id } = req.body;
    const { formId } = req.params;

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    });
    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const page = account.meta_pages.find((p) => p.page_id === page_id);
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    const axios = (await import("axios")).default;
    await axios.post(
      `https://graph.facebook.com/v19.0/${formId}`,
      { status: "ARCHIVED" },
      { params: { access_token: page.page_access_token } }
    );

    res.json({ success: true, message: "Lead form archived" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get pages list from ad account (for form creation)
export const getAccountPages = async (req, res) => {
  try {
    const { ad_account_id } = req.query;

    const account = await AdAccount.findOne({
      _id: ad_account_id,
      user_id: req.user._id,
    }).select("meta_pages name");

    if (!account) {
      return res.status(404).json({ success: false, message: "Ad account not found" });
    }

    const pages = account.meta_pages.map((p) => ({
      page_id: p.page_id,
      page_name: p.page_name,
      has_instagram: !!p.instagram_actor_id,
      instagram_actor_id: p.instagram_actor_id,
    }));

    res.json({ success: true, data: pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};