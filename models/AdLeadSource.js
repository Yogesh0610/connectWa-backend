import mongoose from "mongoose";

const adLeadSourceSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    workspace_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },

    source_type: {
      type: String,
      enum: ["facebook", "instagram", "google"],
      required: true,
    },

    name: { type: String, required: true },

    connection_method: {
      type: String,
      enum: ["oauth", "manual", "webhook"],
      default: "manual",
    },

    // Facebook / Instagram
    fb_page_id: { type: String, index: true },
    fb_page_name: { type: String },
    fb_access_token: { type: String },
    fb_long_lived_token: { type: String },
    fb_form_ids: [{ type: String }],

    // Google
    google_customer_id: { type: String },
    google_webhook_secret: { type: String },

    is_active: { type: Boolean, default: true },
    last_synced_at: { type: Date },

    // Owner-defined automation rules
    automation: {
      save_as_contact: { type: Boolean, default: true },
      add_to_campaign_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Campaign", 
        default: null 
      },
      trigger_chatbot_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Chatbot", 
        default: null 
      },
      send_whatsapp_template_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Template", 
        default: null 
      },
      assign_tag_ids: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Tag" 
      }],
    },
  },
  { timestamps: true }
);

adLeadSourceSchema.index({ user_id: 1, source_type: 1 });
adLeadSourceSchema.index({ workspace_id: 1, source_type: 1 });
adLeadSourceSchema.index({ fb_page_id: 1 }, { sparse: true });
adLeadSourceSchema.index({ google_customer_id: 1 }, { sparse: true });

export const AdLeadSource = mongoose.model("AdLeadSource", adLeadSourceSchema);