import axios from 'axios';
import { SocialAccount } from '../../models/SocialAccount.js';

const LINKEDIN_API = 'https://api.linkedin.com/v2';
const LINKEDIN_AUTH = 'https://www.linkedin.com/oauth/v2';

class LinkedInService {
  // ── OAuth ────────────────────────────────────────────────────────────────────

  getAuthUrl(userId) {
    const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     process.env.LINKEDIN_CLIENT_ID,
      redirect_uri:  `${process.env.BACKEND_URL}/api/social/linkedin/callback`,
      state,
      scope:         'openid profile email w_member_social r_organization_social w_organization_social',
    });
    return `${LINKEDIN_AUTH}/authorization?${params}`;
  }

  async exchangeCode(code) {
    const res = await axios.post(`${LINKEDIN_AUTH}/accessToken`, null, {
      params: {
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${process.env.BACKEND_URL}/api/social/linkedin/callback`,
        client_id:     process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      },
    });
    return res.data; // { access_token, expires_in, token_type }
  }

  async refreshTokenIfNeeded(account) {
    if (!account.token_expires_at) return account.access_token;
    const expiresAt = new Date(account.token_expires_at);
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (expiresAt > sevenDaysOut) return account.access_token;

    // LinkedIn standard OAuth doesn't support refresh tokens — user must re-auth.
    // Log a warning; the scheduler will skip this post.
    console.warn(`[LinkedIn] Token for account ${account._id} expires soon — user needs to reconnect`);
    return account.access_token;
  }

  // ── Profile ──────────────────────────────────────────────────────────────────

  async getProfile(accessToken) {
    const [profileRes, emailRes] = await Promise.all([
      axios.get(`${LINKEDIN_API}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      // Try to get profile picture separately (userinfo may not include it in some apps)
      axios.get(`${LINKEDIN_API}/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => null),
    ]);

    const info = profileRes.data;
    let picture = null;
    if (profileRes.data.picture) {
      picture = profileRes.data.picture;
    } else if (emailRes?.data?.profilePicture) {
      const elements = emailRes.data.profilePicture?.['displayImage~']?.elements;
      picture = elements?.[elements.length - 1]?.identifiers?.[0]?.identifier || null;
    }

    return {
      id:      info.sub || emailRes?.data?.id,
      name:    info.name || `${info.given_name || ''} ${info.family_name || ''}`.trim(),
      email:   info.email,
      picture,
      urn:     `urn:li:person:${info.sub || emailRes?.data?.id}`,
    };
  }

  // ── Company Pages ────────────────────────────────────────────────────────────

  async getOrganizations(accessToken) {
    const res = await axios.get(
      `${LINKEDIN_API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,name,logoV2(original~:playableStreams))))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return (res.data.elements || []).map(el => {
      const org = el['organization~'] || {};
      const logoElements = org?.logoV2?.['original~']?.elements;
      const picture = logoElements?.[logoElements.length - 1]?.identifiers?.[0]?.identifier || null;
      return {
        page_id:      String(org.id || ''),
        page_name:    org.name?.localized?.en_US || org.name?.preferredLocale ? Object.values(org.name?.localized || {})[0] : String(org.id),
        page_picture: picture,
        linkedin_urn: `urn:li:organization:${org.id}`,
        account_type: 'company',
        platform:     'linkedin',
      };
    });
  }

  // ── Save / Connect ────────────────────────────────────────────────────────────

  async connectAccount(userId, accessToken, expiresIn) {
    const profile   = await this.getProfile(accessToken);
    const pages     = await this.getOrganizations(accessToken).catch(() => []);
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const account = await SocialAccount.findOneAndUpdate(
      { user_id: userId, platform: 'linkedin', account_id: profile.id },
      {
        $set: {
          user_id:          userId,
          platform:         'linkedin',
          account_type:     'profile',
          account_id:       profile.id,
          account_name:     profile.name,
          profile_picture:  profile.picture,
          access_token:     accessToken,
          token_expires_at: expiresAt,
          linkedin_urn:     profile.urn,
          pages,
          is_active:        true,
          deleted_at:       null,
        },
      },
      { upsert: true, new: true }
    );

    return account;
  }

  // ── Upload Image → LinkedIn Media URN ─────────────────────────────────────────

  async uploadImage(accessToken, authorUrn, imageBuffer, mimeType = 'image/jpeg') {
    // Step 1: Register upload
    const registerRes = await axios.post(
      `${LINKEDIN_API}/assets?action=registerUpload`,
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier:       'urn:li:userGeneratedContent',
          }],
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    const uploadUrl  = registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const assetUrn   = registerRes.data.value.asset;

    // Step 2: Upload binary
    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
    });

    return assetUrn; // e.g. urn:li:digitalmediaAsset:XXXXX
  }

  // ── Create Post ────────────────────────────────────────────────────────────────

  async createPost(accessToken, authorUrn, { content, hashtags = [], link_url, media_urns = [] }) {
    // Combine content + hashtags
    const text = hashtags.length
      ? `${content}\n\n${hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
      : content;

    let shareMediaCategory = 'NONE';
    const mediaArray = [];

    if (media_urns.length > 0) {
      shareMediaCategory = 'IMAGE';
      media_urns.forEach(urn => {
        mediaArray.push({ status: 'READY', media: urn });
      });
    } else if (link_url) {
      shareMediaCategory = 'ARTICLE';
      mediaArray.push({ status: 'READY', originalUrl: link_url });
    }

    const body = {
      author:         authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory,
          ...(mediaArray.length && { media: mediaArray }),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const res = await axios.post(`${LINKEDIN_API}/ugcPosts`, body, {
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    return res.data.id; // LinkedIn post URN
  }

  // ── Analytics ────────────────────────────────────────────────────────────────

  async getPostAnalytics(accessToken, postUrn) {
    try {
      const encoded = encodeURIComponent(postUrn);
      const res = await axios.get(
        `${LINKEDIN_API}/socialActions/${encoded}`,
        { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }
      );
      return {
        likes:    res.data.likesSummary?.totalLikes || 0,
        comments: res.data.commentsSummary?.totalFirstLevelComments || 0,
        shares:   0,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0 };
    }
  }

  async getOrganizationAnalytics(accessToken, orgUrn) {
    try {
      const encoded = encodeURIComponent(orgUrn);
      const res = await axios.get(
        `${LINKEDIN_API}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encoded}`,
        { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }
      );
      const el = res.data?.elements?.[0]?.totalShareStatistics || {};
      return {
        impressions: el.impressionCount || 0,
        clicks:      el.clickCount      || 0,
        likes:       el.likeCount       || 0,
        shares:      el.shareCount      || 0,
        comments:    el.commentCount    || 0,
      };
    } catch {
      return { impressions: 0, clicks: 0, likes: 0, shares: 0, comments: 0 };
    }
  }
}

export const linkedInService = new LinkedInService();
