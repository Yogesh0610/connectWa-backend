import { AdLeadSource } from "../models/AdLeadSource.js";
import { AdLead } from "../models/AdLead.js";

export const getSources = async (req, res) => {
  try {
    const sources = await AdLeadSource.find({ workspace_id: req.workspace_id })
      .populate("automation.add_to_campaign_id", "name")
      .populate("automation.trigger_chatbot_id", "name")
      .populate("automation.send_whatsapp_template_id", "name")
      .populate("automation.assign_tag_ids", "name color")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: sources });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createSource = async (req, res) => {
  try {
    const source = await AdLeadSource.create({
      ...req.body,
      workspace_id: req.workspace_id,
      user_id: req.user._id,
    });
    res.status(201).json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSource = async (req, res) => {
  try {
    const source = await AdLeadSource.findOneAndUpdate(
      { _id: req.params.id, workspace_id: req.workspace_id },
      req.body,
      { new: true }
    );
    if (!source) return res.status(404).json({ success: false, message: "Source not found" });
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteSource = async (req, res) => {
  try {
    await AdLeadSource.findOneAndDelete({ _id: req.params.id, workspace_id: req.workspace_id });
    res.json({ success: true, message: "Source deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLeads = async (req, res) => {
  try {
    const { source_id, status, source_type, page = 1, limit = 50 } = req.query;
    const filter = { workspace_id: req.workspace_id };

    if (source_id) filter.source_id = source_id;
    if (status) filter.status = status;
    if (source_type) filter.source_type = source_type;

    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      AdLead.find(filter)
        .populate("source_id", "name source_type")
        .populate("contact_id", "name phone email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AdLead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Manually retry failed lead
export const retryLead = async (req, res) => {
  try {
    const lead = await AdLead.findOne({ _id: req.params.id, workspace_id: req.workspace_id });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const source = await AdLeadSource.findById(lead.source_id);
    if (!source) return res.status(404).json({ success: false, message: "Source not found" });

    res.json({ success: true, message: "Retry initiated" });

    const { leadProcessorService } = await import("../services/adLeads/lead-processor.service.js");
    await leadProcessorService.process(lead, source);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};