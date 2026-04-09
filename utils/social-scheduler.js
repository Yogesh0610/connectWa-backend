import { SocialPost } from '../models/SocialPost.js';
import { socialPostService } from '../services/social/social-post.service.js';

class SocialScheduler {
  constructor() {
    this.running  = false;
    this.interval = null;
    this.checkIntervalMs = 60_000; // every 60 s
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[SocialScheduler] Started');
    this._check(); // immediate first run
    this.interval = setInterval(() => this._check(), this.checkIntervalMs);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.interval);
    this.interval = null;
    console.log('[SocialScheduler] Stopped');
  }

  async _check() {
    try {
      const due = await SocialPost.find({
        status:       'scheduled',
        scheduled_at: { $lte: new Date() },
        deleted_at:   null,
      }).limit(20);

      if (!due.length) return;
      console.log(`[SocialScheduler] ${due.length} post(s) due for publishing`);

      for (const post of due) {
        // Mark as publishing immediately to prevent double-processing
        await SocialPost.findByIdAndUpdate(post._id, { status: 'publishing' });
        socialPostService.publishNow(post._id).catch(err => {
          console.error(`[SocialScheduler] Failed to publish post ${post._id}:`, err.message);
          SocialPost.findByIdAndUpdate(post._id, { status: 'failed' }).catch(() => {});
        });
      }
    } catch (err) {
      console.error('[SocialScheduler] Check error:', err.message);
    }
  }
}

export default new SocialScheduler();
