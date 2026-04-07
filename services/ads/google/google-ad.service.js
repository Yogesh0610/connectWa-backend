import { getGoogleCustomer, toMicros } from "./google-client.helper.js";
import { GoogleAd } from "../../../models/GoogleAd.js";
import { GoogleAdGroup } from "../../../models/GoogleAdGroup.js";
import { GoogleCampaign } from "../../../models/GoogleCampaign.js";

class GoogleAdService {

  // ─── RSA (Responsive Search Ad) ─────────────────────────
  async createRSA(userId, adGroupDbId, payload) {
    const adGroup = await GoogleAdGroup.findById(adGroupDbId);
    if (!adGroup) throw new Error("Ad Group not found");

    const customer = await getGoogleCustomer(adGroup.ad_account_id);

    const { name, rsa, status = "PAUSED" } = payload;

    // Validate RSA — min 3 headlines, min 2 descriptions
    if (!rsa.headlines || rsa.headlines.length < 3) {
      throw new Error("RSA requires at least 3 headlines");
    }
    if (!rsa.descriptions || rsa.descriptions.length < 2) {
      throw new Error("RSA requires at least 2 descriptions");
    }

    const adRes = await customer.ads.create([
      {
        responsive_search_ad: {
          headlines: rsa.headlines.map((h) => ({
            text: h.text,
            ...(h.pinned_field && { pinned_field: h.pinned_field }),
          })),
          descriptions: rsa.descriptions.map((d) => ({
            text: d.text,
            ...(d.pinned_field && { pinned_field: d.pinned_field }),
          })),
          path1: rsa.path1 || "",
          path2: rsa.path2 || "",
        },
        final_urls: rsa.final_urls,
        name,
        status,
      },
    ]);

    const googleAdId = adRes.results[0].resource_name.split("/").pop();

    // Link ad to ad group
    await customer.adGroupAds.create([
      {
        ad_group: `customers/${adGroup.google_customer_id}/adGroups/${adGroup.google_adgroup_id}`,
        ad: { resource_name: adRes.results[0].resource_name },
        status,
      },
    ]);

    return await GoogleAd.create({
      user_id: userId,
      ad_account_id: adGroup.ad_account_id,
      campaign_id: adGroup.campaign_id,
      adgroup_id: adGroupDbId,
      google_ad_id: googleAdId,
      google_adgroup_id: adGroup.google_adgroup_id,
      google_customer_id: adGroup.google_customer_id,
      name,
      ad_type: "RESPONSIVE_SEARCH_AD",
      status,
      rsa,
      is_synced: true,
      last_synced_at: new Date(),
    });
  }

  // ─── Responsive Display Ad ───────────────────────────────
  async createDisplayAd(userId, adGroupDbId, payload) {
    const adGroup = await GoogleAdGroup.findById(adGroupDbId);
    if (!adGroup) throw new Error("Ad Group not found");

    const customer = await getGoogleCustomer(adGroup.ad_account_id);
    const { name, display, status = "PAUSED" } = payload;

    // Upload images first
    const marketingImageAssets = await this._uploadAssets(
      customer,
      adGroup.google_customer_id,
      display.marketing_images || [],
      "IMAGE"
    );

    const logoAssets = await this._uploadAssets(
      customer,
      adGroup.google_customer_id,
      display.logo_images || [],
      "IMAGE"
    );

    const adRes = await customer.ads.create([
      {
        responsive_display_ad: {
          headlines: display.headlines.map((h) => ({ text: h.text })),
          long_headline: { text: display.long_headline },
          descriptions: display.descriptions.map((d) => ({ text: d.text })),
          business_name: display.business_name,
          marketing_images: marketingImageAssets.map((a) => ({ asset: a.resource_name })),
          logo_images: logoAssets.map((a) => ({ asset: a.resource_name })),
          call_to_action_text: display.call_to_action_text || "Learn More",
        },
        final_urls: display.final_urls,
        name,
        status,
      },
    ]);

    const googleAdId = adRes.results[0].resource_name.split("/").pop();

    await customer.adGroupAds.create([
      {
        ad_group: `customers/${adGroup.google_customer_id}/adGroups/${adGroup.google_adgroup_id}`,
        ad: { resource_name: adRes.results[0].resource_name },
        status,
      },
    ]);

    return await GoogleAd.create({
      user_id: userId,
      ad_account_id: adGroup.ad_account_id,
      campaign_id: adGroup.campaign_id,
      adgroup_id: adGroupDbId,
      google_ad_id: googleAdId,
      google_adgroup_id: adGroup.google_adgroup_id,
      google_customer_id: adGroup.google_customer_id,
      name,
      ad_type: "RESPONSIVE_DISPLAY_AD",
      status,
      display: {
        ...display,
        marketing_images: marketingImageAssets.map((a, i) => ({
          asset_id: a.resource_name.split("/").pop(),
          url: display.marketing_images[i]?.url,
        })),
        logo_images: logoAssets.map((a, i) => ({
          asset_id: a.resource_name.split("/").pop(),
          url: display.logo_images[i]?.url,
        })),
      },
      is_synced: true,
      last_synced_at: new Date(),
    });
  }

  // ─── Performance Max Ad (Asset Group) ───────────────────
  async createPMaxAssetGroup(userId, campaignDbId, payload) {
    const campaign = await GoogleCampaign.findById(campaignDbId);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.campaign_type !== "PERFORMANCE_MAX") {
      throw new Error("Campaign must be PERFORMANCE_MAX type");
    }

    const customer = await getGoogleCustomer(campaign.ad_account_id);
    const { name, pmax, status = "PAUSED" } = payload;

    // Upload image/logo assets
    const imageAssets = await this._uploadAssets(
      customer,
      campaign.google_customer_id,
      pmax.images || [],
      "IMAGE"
    );
    const logoAssets = await this._uploadAssets(
      customer,
      campaign.google_customer_id,
      pmax.logos || [],
      "IMAGE"
    );

    // Create text assets
    const textAssets = await this._createTextAssets(customer, campaign.google_customer_id, [
      ...pmax.headlines.map((h) => ({ text: h, type: "HEADLINE" })),
      ...pmax.descriptions.map((d) => ({ text: d, type: "DESCRIPTION" })),
      { text: pmax.long_headlines?.[0] || pmax.headlines[0], type: "LONG_HEADLINE" },
      { text: pmax.business_name, type: "BUSINESS_NAME" },
    ]);

    // Create asset group
    const assetGroupRes = await customer.assetGroups.create([
      {
        campaign: `customers/${campaign.google_customer_id}/campaigns/${campaign.google_campaign_id}`,
        name,
        status,
        final_urls: pmax.final_urls,
        call_to_action: pmax.call_to_action || "LEARN_MORE",
        assets: [
          ...imageAssets.map((a) => ({
            asset: a.resource_name,
            field_type: "MARKETING_IMAGE",
          })),
          ...logoAssets.map((a) => ({
            asset: a.resource_name,
            field_type: "LOGO",
          })),
          ...textAssets,
        ],
      },
    ]);

    const assetGroupId = assetGroupRes.results[0].resource_name.split("/").pop();

    return await GoogleAd.create({
      user_id: userId,
      ad_account_id: campaign.ad_account_id,
      campaign_id: campaignDbId,
      adgroup_id: campaignDbId, // PMax doesn't have adgroups
      google_ad_id: assetGroupId,
      google_customer_id: campaign.google_customer_id,
      name,
      ad_type: "PERFORMANCE_MAX_AD",
      status,
      pmax: {
        ...pmax,
        asset_group_id: assetGroupId,
      },
      is_synced: true,
      last_synced_at: new Date(),
    });
  }

  // ─── Lead Form Extension ─────────────────────────────────
  async createLeadFormExtension(userId, campaignDbId, payload) {
    const campaign = await GoogleCampaign.findById(campaignDbId);
    if (!campaign) throw new Error("Campaign not found");

    const customer = await getGoogleCustomer(campaign.ad_account_id);

    const { lead_form, status = "ENABLED" } = payload;

    // Create lead form asset
    const assetRes = await customer.assets.create([
      {
        name: lead_form.form_name,
        lead_form_asset: {
          call_to_action_type: lead_form.call_to_action,
          call_to_action_description: lead_form.call_to_action_description,
          headline: lead_form.headline,
          description: lead_form.description,
          privacy_policy_url: lead_form.privacy_policy_url,
          fields: lead_form.questions.map((q) => ({
            input_type: q.type,
            is_required: q.is_required || false,
            ...(q.custom_question_text && {
              single_choice_answers: {
                answers: q.custom_question_answers || [],
              },
            }),
          })),
          ...(lead_form.delivery_methods?.webhook && {
            delivery_methods: [
              {
                webhook: {
                  advertiser_webhook_url: lead_form.delivery_methods.webhook.advertiser_webhook_url,
                  google_secret: lead_form.delivery_methods.webhook.google_secret,
                },
              },
            ],
          }),
        },
      },
    ]);

    const leadFormAssetId = assetRes.results[0].resource_name.split("/").pop();

    // Link to campaign
    await customer.campaignAssets.create([
      {
        campaign: `customers/${campaign.google_customer_id}/campaigns/${campaign.google_campaign_id}`,
        asset: assetRes.results[0].resource_name,
        field_type: "LEAD_FORM",
        status,
      },
    ]);

    return await GoogleAd.create({
      user_id: userId,
      ad_account_id: campaign.ad_account_id,
      campaign_id: campaignDbId,
      adgroup_id: campaignDbId,
      google_ad_id: leadFormAssetId,
      google_customer_id: campaign.google_customer_id,
      name: lead_form.form_name,
      ad_type: "LEAD_FORM_AD",
      status,
      lead_form: {
        ...lead_form,
        google_lead_form_id: leadFormAssetId,
      },
      is_synced: true,
      last_synced_at: new Date(),
    });
  }

  // ─── Asset Upload Helper ─────────────────────────────────
  async _uploadAssets(customer, customerId, images, assetType) {
    if (!images.length) return [];

    const assets = await Promise.all(
      images.map(async (img) => {
        if (img.asset_id) return { resource_name: `customers/${customerId}/assets/${img.asset_id}` };

        // Upload from URL
        const response = await fetch(img.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString("base64");

        const res = await customer.assets.create([
          {
            type: assetType,
            image_asset: { data: base64 },
          },
        ]);

        return res.results[0];
      })
    );

    return assets;
  }

  async _createTextAssets(customer, customerId, texts) {
    const assets = await Promise.all(
      texts.map(async (t) => {
        const res = await customer.assets.create([
          {
            type: "TEXT",
            text_asset: { text: t.text },
          },
        ]);
        return {
          asset: res.results[0].resource_name,
          field_type: t.type,
        };
      })
    );
    return assets;
  }

  // Update ad status
  async updateAdStatus(adDbId, status) {
    const ad = await GoogleAd.findById(adDbId);
    if (!ad) throw new Error("Ad not found");

    const customer = await getGoogleCustomer(ad.ad_account_id);

    await customer.adGroupAds.update([
      {
        resource_name: `customers/${ad.google_customer_id}/adGroupAds/${ad.google_adgroup_id}~${ad.google_ad_id}`,
        status,
      },
    ]);

    return await GoogleAd.findByIdAndUpdate(adDbId, { status }, { new: true });
  }
}

export const googleAdService = new GoogleAdService();