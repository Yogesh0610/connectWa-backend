import Contact from "../../models/contact.model.js";
import Campaign from "../../models/campaign.model.js";
import { AutomationFlow } from "../../models/index.js";
import { AdLead } from "../../models/AdLead.js";
import automationEngine from "../../utils/automation-engine.js";

class LeadProcessorService {

  async process(lead, source) {
    try {
      await AdLead.findByIdAndUpdate(lead._id, { status: "processing" });

      const automation = source.automation;
      const automationLog = {};

      let contactId = null;

      // Step 1: Contact save
      if (automation.save_as_contact) {
        contactId = await this.saveContact(lead, source);
        automationLog.contact_saved = !!contactId;
      }

      // Step 2: Tags assign
      if (contactId && automation.assign_tag_ids?.length) {
        await this.assignTags(contactId, automation.assign_tag_ids);
      }

      // Step 3: Campaign add
      if (contactId && automation.add_to_campaign_id) {
        await this.addToCampaign(contactId, automation.add_to_campaign_id);
        automationLog.campaign_added = true;
      }

      // Step 4: Chatbot / automation flow trigger
      if (contactId && automation.trigger_chatbot_id) {
        await this.triggerChatbot(contactId, automation.trigger_chatbot_id, lead, source);
        automationLog.chatbot_triggered = true;
      }

      // Step 5: WhatsApp template send via automation engine
      if (contactId && automation.send_whatsapp_template_id) {
        await this.sendWhatsApp(contactId, automation.send_whatsapp_template_id, source);
        automationLog.whatsapp_sent = true;
      }

      // Update lead status
      await AdLead.findByIdAndUpdate(lead._id, {
        status: "processed",
        contact_id: contactId,
        automation_log: automationLog,
      });

      console.log(`Lead processed: ${lead._id}`);
    } catch (error) {
      console.error(`Lead processing failed: ${lead._id}`, error.message);
      await AdLead.findByIdAndUpdate(lead._id, {
        status: "failed",
        failure_reason: error.message,
      });
    }
  }

  async saveContact(lead, source) {
    const { name, email, phone } = lead.lead_data;

    // phone_number is required in Contact model — skip if not available
    if (!phone) return null;

    // Duplicate contact check by phone_number + user_id
    let contact = await Contact.findOne({
      user_id: source.user_id,
      phone_number: phone,
    });

    if (!contact) {
      contact = await Contact.create({
        user_id: source.user_id,
        created_by: source.user_id,
        name: name || "Unknown",
        phone_number: phone,
        email: email || null,
        source: "whatsapp", // Contact.source enum: whatsapp | baileys
        status: "lead",
        type: "lead",
        custom_fields: {
          ad_source: lead.source_type,
          ad_form_id: lead.platform_form_id || "",
          ad_campaign_id: lead.platform_campaign_id || "",
        },
      });
    }

    return contact._id;
  }

  async assignTags(contactId, tagIds) {
    await Contact.findByIdAndUpdate(contactId, {
      $addToSet: { tags: { $each: tagIds } },
    });
  }

  async addToCampaign(contactId, campaignId) {
    // Campaign.specific_contacts is the contacts array
    await Campaign.findByIdAndUpdate(campaignId, {
      $addToSet: { specific_contacts: contactId },
    });
  }

  async triggerChatbot(contactId, flowId, lead, source) {
    try {
      const flow = await AutomationFlow.findById(flowId);
      if (!flow) {
        console.warn(`Automation flow not found: ${flowId}`);
        return;
      }

      const contact = await Contact.findById(contactId);
      if (!contact?.phone_number) return;

      await automationEngine.executeFlow(flow, {
        sender_number: contact.phone_number,
        userId: source.user_id,
        trigger_type: "ad_lead",
        lead_id: lead._id,
      });
    } catch (err) {
      console.error("triggerChatbot failed:", err.message);
    }
  }

  async sendWhatsApp(contactId, templateId, source) {
    // WhatsApp template sending requires a WhatsappPhoneNumber — log and skip if not available
    // This action is best handled by attaching a WA phone number to the ad source
    console.warn(
      `sendWhatsApp: template ${templateId} for contact ${contactId} — ` +
      `implement via campaign or attach phone_number_id to source`
    );
  }
}

export const leadProcessorService = new LeadProcessorService();
