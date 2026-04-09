import { SocialPost } from '../../models/SocialPost.js';

class SocialAnalyticsService {
  // ── Overview stats ────────────────────────────────────────────────────────

  async getOverview(userId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const posts = await SocialPost.find({
      user_id:    userId,
      deleted_at: null,
      createdAt:  { $gte: since },
    }).lean();

    const stats = {
      total:     posts.length,
      published: posts.filter(p => ['published', 'partially_published'].includes(p.status)).length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
      failed:    posts.filter(p => p.status === 'failed').length,
      draft:     posts.filter(p => p.status === 'draft').length,
    };

    // Per-platform breakdown
    const byPlatform = {};
    for (const post of posts) {
      for (const t of post.targets || []) {
        if (!byPlatform[t.platform]) {
          byPlatform[t.platform] = { posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0 };
        }
        byPlatform[t.platform].posts++;
        if (t.analytics) {
          byPlatform[t.platform].likes       += t.analytics.likes       || 0;
          byPlatform[t.platform].comments    += t.analytics.comments    || 0;
          byPlatform[t.platform].shares      += t.analytics.shares      || 0;
          byPlatform[t.platform].impressions += t.analytics.impressions || 0;
          byPlatform[t.platform].clicks      += t.analytics.clicks      || 0;
        }
      }
    }

    // Add engagement rate per platform
    for (const p of Object.values(byPlatform)) {
      p.engagement_rate = p.impressions > 0
        ? +((( p.likes + p.comments + p.shares) / p.impressions) * 100).toFixed(2)
        : 0;
    }

    return { stats, byPlatform };
  }

  // ── Engagement over time (daily) ──────────────────────────────────────────

  async getEngagementTimeline(userId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const posts = await SocialPost.find({
      user_id:     userId,
      deleted_at:  null,
      published_at: { $gte: since },
      status:      { $in: ['published', 'partially_published'] },
    }).lean();

    // Bucket by day
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, likes: 0, comments: 0, shares: 0, impressions: 0, posts: 0 };
    }

    for (const post of posts) {
      const key = new Date(post.published_at).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      buckets[key].posts++;
      for (const t of post.targets || []) {
        if (!t.analytics) continue;
        buckets[key].likes       += t.analytics.likes       || 0;
        buckets[key].comments    += t.analytics.comments    || 0;
        buckets[key].shares      += t.analytics.shares      || 0;
        buckets[key].impressions += t.analytics.impressions || 0;
      }
    }

    return Object.values(buckets);
  }

  // ── Top performing posts ──────────────────────────────────────────────────

  async getTopPosts(userId, limit = 5) {
    const posts = await SocialPost.find({
      user_id:    userId,
      deleted_at: null,
      status:     { $in: ['published', 'partially_published'] },
    }).lean();

    // Score = likes*3 + comments*5 + shares*4 + impressions*0.1
    const scored = posts.map(post => {
      let score = 0;
      for (const t of post.targets || []) {
        if (!t.analytics) continue;
        score += (t.analytics.likes * 3) + (t.analytics.comments * 5) +
                 (t.analytics.shares * 4) + (t.analytics.impressions * 0.1);
      }
      const totalEngagement = post.targets.reduce((sum, t) => {
        if (!t.analytics) return sum;
        return sum + (t.analytics.likes || 0) + (t.analytics.comments || 0) + (t.analytics.shares || 0);
      }, 0);
      const totalImpressions = post.targets.reduce((sum, t) => sum + (t.analytics?.impressions || 0), 0);
      return {
        _id:              post._id,
        title:            post.title,
        content:          post.content.slice(0, 100),
        platforms:        [...new Set(post.targets.map(t => t.platform))],
        published_at:     post.published_at,
        score,
        total_engagement: totalEngagement,
        engagement_rate:  totalImpressions > 0 ? +((totalEngagement / totalImpressions) * 100).toFixed(2) : 0,
        analytics: {
          likes:       post.targets.reduce((s, t) => s + (t.analytics?.likes || 0), 0),
          comments:    post.targets.reduce((s, t) => s + (t.analytics?.comments || 0), 0),
          shares:      post.targets.reduce((s, t) => s + (t.analytics?.shares || 0), 0),
          impressions: post.targets.reduce((s, t) => s + (t.analytics?.impressions || 0), 0),
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ── Profile vs Page performance ───────────────────────────────────────────

  async getProfileVsPage(userId) {
    const posts = await SocialPost.find({
      user_id:    userId,
      deleted_at: null,
      status:     { $in: ['published', 'partially_published'] },
    }).lean();

    const result = { profile: { posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0 },
                     page:    { posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0 } };

    for (const post of posts) {
      for (const t of post.targets || []) {
        const key = t.account_type === 'profile' ? 'profile' : 'page';
        result[key].posts++;
        if (t.analytics) {
          result[key].likes       += t.analytics.likes       || 0;
          result[key].comments    += t.analytics.comments    || 0;
          result[key].shares      += t.analytics.shares      || 0;
          result[key].impressions += t.analytics.impressions || 0;
        }
      }
    }

    for (const key of ['profile', 'page']) {
      const r = result[key];
      r.engagement_rate = r.impressions > 0
        ? +((( r.likes + r.comments + r.shares) / r.impressions) * 100).toFixed(2)
        : 0;
    }

    return result;
  }
}

export const socialAnalyticsService = new SocialAnalyticsService();
