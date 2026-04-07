import mongoose from "mongoose";

const adLeadSchema = new mongoose.Schema(
  {
    workspace_id: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    source_id: { type: mongoose.Schema.Types.ObjectId, ref: "AdLeadSource", required: true },

    // Source info
    source_type: {
      type: String,
      enum: ["facebook", "instagram", "google", "csv"],
      required: true,
    },

    // Raw IDs from platform
    platform_lead_id: { type: String },       // FB leadgen_id / Google gclid
    platform_form_id: { type: String },       // FB form_id
    platform_ad_id: { type: String },
    platform_campaign_id: { type: String },
    platform_page_id: { type: String },

    // Lead data (normalized)
    lead_data: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      company: { type: String },
      message: { type: String },
    },

    // Raw fields from platform (for custom form fields)
    raw_fields: [
      {
        name: { type: String },
        values: [{ type: String }],
      },
    ],

    // Processing status
    status: {
      type: String,
      enum: ["new", "processing", "processed", "failed"],
      default: "new",
    },
    failure_reason: { type: String },

    // Linked contact (after processing)
    contact_id: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },

    // Automation tracking
    automation_log: {
      contact_saved: { type: Boolean, default: false },
      campaign_added: { type: Boolean, default: false },
      chatbot_triggered: { type: Boolean, default: false },
      whatsapp_sent: { type: Boolean, default: false },
    },

    // Raw webhook payload (for debugging)
    raw_payload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Duplicate check index
adLeadSchema.index({ platform_lead_id: 1, source_type: 1 }, { unique: true, sparse: true });
adLeadSchema.index({ workspace_id: 1, createdAt: -1 });
adLeadSchema.index({ source_id: 1 });

export const AdLead = mongoose.model("AdLead", adLeadSchema);