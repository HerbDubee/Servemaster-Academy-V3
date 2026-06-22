'use strict';

/**
 * Start all scheduled digest / cron tasks.
 * Called once at server startup after adminRouter is mounted.
 * `sendWeeklyManagerDigests` is defined in server.js (hoisted function declaration)
 * and is also passed to the admin router — accept it here as a dep.
 */
module.exports = function startCronJobs({
  db,
  sendOpenClawWeeklyDigest,
  sendKirkTrialDigest,
  sendWeeklyManagerDigests,
}) {

  // ── OpenClaw digest cron ─────────────────────────────────────────────────────
  async function maybeRunOpenClawDigestCron() {
    try {
      const now = new Date();
      const torontoFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Toronto', weekday: 'short', hour: 'numeric', hour12: false
      }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
      const isMonday = torontoFmt.weekday === 'Mon';
      const hour = parseInt(torontoFmt.hour);
      if (!isMonday || hour < 8 || hour >= 9) return;
      const last = await db.query(`SELECT value FROM site_settings WHERE key='openclaw_digest_last_sent_at'`);
      const lastIso = last.rows[0]?.value;
      if (lastIso) {
        const lastDate = new Date(lastIso);
        const sinceMs = now.getTime() - lastDate.getTime();
        if (sinceMs < 6 * 24 * 60 * 60 * 1000) return;
      }
      await sendOpenClawWeeklyDigest();
    } catch (e) { console.error('[OpenClaw digest] cron error:', e.message); }
  }

  // ── Manager weekly digest — Monday 8 am ET, idempotent ───────────────────────
  async function maybeRunManagerDigestCron() {
    try {
      const torontoFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        weekday: 'short', hour: 'numeric', hour12: false
      }).formatToParts(new Date()).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
      if (torontoFmt.weekday !== 'Mon') return;
      const hour = parseInt(torontoFmt.hour, 10);
      if (hour < 8 || hour >= 9) return;

      const key = 'manager_digest_last_sent_at';
      const settingRes = await db.query(`SELECT value FROM site_settings WHERE key = $1`, [key]);
      if (settingRes.rows.length) {
        const lastSent = new Date(settingRes.rows[0].value);
        const sinceMs = Date.now() - lastSent.getTime();
        if (sinceMs < 6 * 24 * 60 * 60 * 1000) return;
      }

      const { sent, skipped } = await sendWeeklyManagerDigests();
      const now = new Date().toISOString();
      await db.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, now]
      );
      console.log(`[Manager digest] sent=${sent} skipped=${skipped} at ${now}`);
    } catch (e) { console.error('[Manager digest] cron error:', e.message); }
  }

  // ── Kirk trial digest cron ───────────────────────────────────────────────────
  async function maybeRunKirkTrialDigestCron() {
    try {
      const torontoFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', hour: 'numeric', hour12: false
      }).formatToParts(new Date()).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
      const hour = parseInt(torontoFmt.hour, 10);

      const hourSettingRes = await db.query(`SELECT value FROM site_settings WHERE key = 'kirk_trial_digest_hour_et'`);
      const parsedHour = hourSettingRes.rows.length ? parseInt(hourSettingRes.rows[0].value, 10) : NaN;
      const targetHour = (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) ? parsedHour : 8;

      if (hour < targetHour || hour >= targetHour + 1) return;

      const key = 'kirk_trial_digest_last_sent_at';
      const settingRes = await db.query(`SELECT value FROM site_settings WHERE key = $1`, [key]);
      if (settingRes.rows.length) {
        const lastSent = new Date(settingRes.rows[0].value);
        if (Date.now() - lastSent.getTime() < 20 * 60 * 60 * 1000) return;
      }

      const { sent } = await sendKirkTrialDigest();
      await db.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, new Date().toISOString()]
      );
      if (sent > 0) console.log(`[Kirk trial digest] cron fired, ${sent} request(s) included`);
    } catch (e) { console.error('[Kirk trial digest] cron error:', e.message); }
  }

  // ── Start intervals ──────────────────────────────────────────────────────────
  setInterval(maybeRunOpenClawDigestCron, 60 * 60 * 1000);
  setTimeout(maybeRunOpenClawDigestCron, 30 * 1000);

  setInterval(maybeRunManagerDigestCron, 60 * 60 * 1000);
  setTimeout(maybeRunManagerDigestCron, 45 * 1000);

  setInterval(maybeRunKirkTrialDigestCron, 60 * 60 * 1000);
  setTimeout(maybeRunKirkTrialDigestCron, 60 * 1000);
};
