'use strict';

const KIRK_DIGEST_EMAIL = 'kirk_adamson@servemasteracademy.ca';

/**
 * createDigests({ db, resend, escapeHtml, APP_URL })
 *
 * Provides OpenClaw weekly attribution digest + Kirk trial digest.
 * Exports: { buildWeeklyAttribution, sendOpenClawWeeklyDigest, sendKirkTrialDigest }
 */
module.exports = function createDigests({ db, resend, escapeHtml, APP_URL }) {

  // ── Weekly attribution helpers ──────────────────────────────────────────
  function _mostRecentMondayMidnightET(now) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
    });
    const parts = fmt.formatToParts(now).reduce((a, p) => (a[p.type] = p.value, a), {});
    const wdMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const wd = wdMap[parts.weekday] ?? 1;
    const daysSinceMon = (wd + 6) % 7;
    let candidate = new Date(Date.UTC(
      parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day) - daysSinceMon,
      5, 0, 0
    ));
    for (let i = 0; i < 3; i++) {
      const c = fmt.formatToParts(candidate).reduce((a, p) => (a[p.type] = p.value, a), {});
      const drift = (parseInt(c.hour) * 3600 + parseInt(c.minute) * 60 + parseInt(c.second));
      if (drift === 0) break;
      candidate = new Date(candidate.getTime() - drift * 1000);
    }
    return candidate;
  }

  async function buildWeeklyAttribution() {
    const now = new Date();
    const periodEnd = _mostRecentMondayMidnightET(now);
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const priorEnd = periodStart;
    const priorStart = new Date(priorEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const norm = (r) => ({
      utm_source: r.utm_source || '(direct)',
      utm_medium: r.utm_medium || '(none)',
      utm_campaign: r.utm_campaign || '(none)',
      count: parseInt(r.cnt) || 0,
    });

    async function agg(sql, start, end) {
      const r = await db.query(sql, [start, end]);
      return r.rows.map(norm);
    }

    const signupSql = `
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM users
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY cnt DESC`;
    const teamReqSql = `
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM contact_messages
      WHERE created_at >= $1 AND created_at < $2
        AND message LIKE '[TEAM TRIAL REQUEST]%'
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY cnt DESC`;
    const conversionSql = `
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM users
      WHERE paid_started_at >= $1 AND paid_started_at < $2
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY cnt DESC`;

    const [
      signupsCur, signupsPrev,
      teamCur, teamPrev,
      convCur, convPrev,
    ] = await Promise.all([
      agg(signupSql, periodStart, periodEnd),
      agg(signupSql, priorStart, priorEnd),
      agg(teamReqSql, periodStart, periodEnd),
      agg(teamReqSql, priorStart, priorEnd),
      agg(conversionSql, periodStart, periodEnd),
      agg(conversionSql, priorStart, priorEnd),
    ]);

    function diffRows(curRows, prevRows) {
      const key = (r) => r.utm_source + '|' + r.utm_medium + '|' + r.utm_campaign;
      const prevMap = {};
      prevRows.forEach(r => { prevMap[key(r)] = r.count; });
      const seen = {};
      const merged = curRows.map(r => {
        seen[key(r)] = true;
        const prev = prevMap[key(r)] || 0;
        return {
          utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
          count: r.count, prior_count: prev, delta: r.count - prev,
        };
      });
      prevRows.forEach(r => {
        if (!seen[key(r)]) {
          merged.push({
            utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
            count: 0, prior_count: r.count, delta: -r.count,
          });
        }
      });
      return merged.sort((a, b) => b.count - a.count || b.prior_count - a.prior_count);
    }

    const signupsRows = diffRows(signupsCur, signupsPrev);
    const teamRows    = diffRows(teamCur, teamPrev);
    const convRows    = diffRows(convCur, convPrev);

    const sumCount = (rows) => rows.reduce((s, r) => s + r.count, 0);
    const sumPrior = (rows) => rows.reduce((s, r) => s + r.prior_count, 0);

    const totals = {
      signups:       { current: sumCount(signupsRows), prior: sumPrior(signupsRows) },
      team_requests: { current: sumCount(teamRows),    prior: sumPrior(teamRows)    },
      conversions:   { current: sumCount(convRows),    prior: sumPrior(convRows)    },
    };

    const campaignScore = {};
    signupsRows.forEach(r => {
      const k = r.utm_source + ' / ' + r.utm_campaign;
      campaignScore[k] = (campaignScore[k] || 0) + r.count;
    });
    convRows.forEach(r => {
      const k = r.utm_source + ' / ' + r.utm_campaign;
      campaignScore[k] = (campaignScore[k] || 0) + r.count * 5;
    });
    const topCampaignKey = Object.keys(campaignScore).sort((a, b) => campaignScore[b] - campaignScore[a])[0] || null;

    return {
      generated_at: now.toISOString(),
      period_start: periodStart.toISOString(),
      period_end:   periodEnd.toISOString(),
      prior_start:  priorStart.toISOString(),
      prior_end:    priorEnd.toISOString(),
      totals,
      signups:       signupsRows,
      team_requests: teamRows,
      conversions:   convRows,
      top_campaign:  topCampaignKey,
    };
  }

  function _renderAttributionDigestHtml(data) {
    const fmtPct = (cur, prev) => {
      if (!prev) return cur > 0 ? '<span style="color:#10b981;">new</span>' : '<span style="color:#71717a;">—</span>';
      const pct = Math.round(((cur - prev) / prev) * 100);
      const colour = pct >= 0 ? '#10b981' : '#ef4444';
      const sign = pct >= 0 ? '+' : '';
      return `<span style="color:${colour};font-weight:600;">${sign}${pct}%</span>`;
    };
    const fmtRange = (start, end) => {
      const s = new Date(start), e = new Date(end);
      const opt = { month: 'short', day: 'numeric', timeZone: 'America/Toronto' };
      return s.toLocaleDateString('en-CA', opt) + ' – ' + e.toLocaleDateString('en-CA', opt);
    };
    function renderTable(title, rows) {
      if (!rows.length) {
        return `<h3 style="font-family:Montserrat,sans-serif;color:#FF5E3A;margin:24px 0 8px;">${title}</h3>
          <p style="color:#71717a;font-size:14px;margin:4px 0 0;">0 this week.</p>`;
      }
      const trs = rows.slice(0, 12).map(r => `
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:13px;">${escapeHtml(r.utm_source)}</td>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#a1a1aa;">${escapeHtml(r.utm_medium)}</td>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#a1a1aa;">${escapeHtml(r.utm_campaign)}</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;">${r.count}</td>
          <td style="padding:6px 0 6px 12px;font-size:12px;color:#71717a;text-align:right;">prev ${r.prior_count}</td>
        </tr>`).join('');
      return `<h3 style="font-family:Montserrat,sans-serif;color:#FF5E3A;margin:24px 0 8px;">${title}</h3>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid #27272a;">
            <th style="text-align:left;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Source</th>
            <th style="text-align:left;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Medium</th>
            <th style="text-align:left;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Campaign</th>
            <th style="text-align:right;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">7d</th>
            <th style="text-align:right;padding:6px 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Δ</th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>`;
    }
    const adminUrl = `${APP_URL}/admin#attribution`;
    const totals = data.totals;
    const headlineRow = (label, t) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#a1a1aa;">${label}</td>
        <td style="padding:8px 0;font-size:18px;font-weight:700;text-align:right;">${t.current}</td>
        <td style="padding:8px 0 8px 16px;font-size:13px;text-align:right;">${fmtPct(t.current, t.prior)}</td>
      </tr>`;
    return `<div style="font-family:Inter,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:32px;max-width:680px;margin:0 auto;border-radius:12px;">
      <h1 style="font-family:Montserrat,sans-serif;color:#FF5E3A;margin:0 0 4px;font-size:24px;">OpenClaw Weekly Digest</h1>
      <p style="color:#a1a1aa;margin:0 0 24px;font-size:14px;">${fmtRange(data.period_start, data.period_end)} (vs prior 7 days)</p>
      <table style="width:100%;border-collapse:collapse;background:#18181b;border-radius:8px;padding:8px;">
        <tbody>
          ${headlineRow('New free signups', totals.signups)}
          ${headlineRow('Team trial requests', totals.team_requests)}
          ${headlineRow('Free → Premium conversions', totals.conversions)}
        </tbody>
      </table>
      ${data.top_campaign ? `<p style="margin:16px 0 0;font-size:14px;color:#d4d4d8;">🏆 Top-performing campaign: <strong style="color:#FF5E3A;">${escapeHtml(data.top_campaign)}</strong></p>` : ''}
      ${renderTable('Signups by source', data.signups)}
      ${renderTable('Team trial requests by source', data.team_requests)}
      ${renderTable('Free → Premium conversions by source', data.conversions)}
      <p style="margin:32px 0 0;font-size:13px;color:#71717a;">
        <a href="${adminUrl}" style="color:#FF5E3A;text-decoration:none;font-weight:600;">Open the live attribution panel →</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#52525b;">Buckets shown as <code>(direct)</code> / <code>(none)</code> are visits with no UTM tag (typed URLs, untagged links). Pre–this-week signups are not back-attributed.</p>
    </div>`;
  }

  async function sendOpenClawWeeklyDigest() {
    try {
      const data = await buildWeeklyAttribution();
      const html = _renderAttributionDigestHtml(data);
      await resend.emails.send({
        from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
        to: KIRK_DIGEST_EMAIL,
        subject: `OpenClaw weekly digest — ${data.totals.signups.current} signups, ${data.totals.team_requests.current} team trial requests`,
        html,
      });
      await db.query(
        `INSERT INTO site_settings (key, value) VALUES ('openclaw_digest_last_sent_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [new Date().toISOString()]
      );
      console.log('[OpenClaw digest] sent to', KIRK_DIGEST_EMAIL);
      return { sent: true };
    } catch (e) {
      console.error('[OpenClaw digest] send error:', e.message);
      throw e;
    }
  }

  async function sendKirkTrialDigest() {
    const rows = await db.query(`
      SELECT id, name, email, message, utm_source, utm_medium, utm_campaign, utm_content, attribution_referrer, created_at
      FROM contact_messages
      WHERE message LIKE '[TEAM TRIAL REQUEST]%'
        AND kirk_trial_digest_notified = FALSE
      ORDER BY created_at ASC
    `);
    if (!rows.rows.length) return { sent: 0 };

    const requests = rows.rows;
    const ids = requests.map(r => r.id);
    const dateLabel = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const rowsHtml = requests.map(r => {
      const receivedAt = new Date(r.created_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' });
      const msgMatch = r.message.match(/\[TEAM TRIAL REQUEST\] Restaurant: ([^|]+?)(?:\s*\|\s*Staff:\s*(\S+))?$/);
      const restName = msgMatch ? msgMatch[1].trim() : '(unknown)';
      const staffCount = msgMatch && msgMatch[2] ? msgMatch[2].trim() : null;
      const utmParts = [];
      if (r.utm_source)   utmParts.push(`source: <strong>${escapeHtml(r.utm_source)}</strong>`);
      if (r.utm_medium)   utmParts.push(`medium: <strong>${escapeHtml(r.utm_medium)}</strong>`);
      if (r.utm_campaign) utmParts.push(`campaign: <strong>${escapeHtml(r.utm_campaign)}</strong>`);
      const attrib = utmParts.length ? utmParts.join(' · ') : '<em style="color:#71717a;">direct / untagged</em>';
      return `<tr style="border-bottom:1px solid #27272a;">
        <td style="padding:12px 8px;font-weight:600;">${escapeHtml(r.name)}</td>
        <td style="padding:12px 8px;"><a href="mailto:${escapeHtml(r.email)}" style="color:#FF5E3A;">${escapeHtml(r.email)}</a></td>
        <td style="padding:12px 8px;">${escapeHtml(restName)}</td>
        <td style="padding:12px 8px;text-align:center;">${staffCount ? escapeHtml(staffCount) : '—'}</td>
        <td style="padding:12px 8px;font-size:12px;color:#a1a1aa;">${escapeHtml(receivedAt)} ET</td>
        <td style="padding:12px 8px;font-size:12px;color:#a1a1aa;">${attrib}</td>
      </tr>`;
    }).join('');

    const subjectCount = requests.length === 1 ? '1 new team trial request' : `${requests.length} new team trial requests`;
    await resend.emails.send({
      from: 'ServeMaster Academy <kirk_adamson@servemasteracademy.ca>',
      to: 'kirk_adamson@servemasteracademy.ca',
      subject: `[Daily Digest] ${subjectCount} — ${dateLabel}`,
      html: `<div style="font-family:sans-serif;max-width:720px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:32px;border-radius:12px;">
        <h2 style="color:#FF5E3A;margin-top:0;">Team Trial Request Digest</h2>
        <p style="font-size:13px;color:#a1a1aa;margin:0 0 24px 0;">${dateLabel} &nbsp;·&nbsp; ${requests.length} request${requests.length === 1 ? '' : 's'} pending your action</p>
        <div style="overflow-x:auto;">
          <table style="font-size:14px;width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid #3f3f46;color:#a1a1aa;text-align:left;">
                <th style="padding:8px 8px 12px;">Name</th>
                <th style="padding:8px 8px 12px;">Email</th>
                <th style="padding:8px 8px 12px;">Restaurant</th>
                <th style="padding:8px 8px 12px;text-align:center;">Staff</th>
                <th style="padding:8px 8px 12px;">Received</th>
                <th style="padding:8px 8px 12px;">Attribution</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <p style="margin-top:24px;font-size:13px;color:#71717a;line-height:1.6;">
          Click an email address above to open a new message, or hit Reply to reach the last requester.<br>
          Each requester has already received their "request received" confirmation.
        </p>
      </div>`
    });

    await db.query(
      `UPDATE contact_messages SET kirk_trial_digest_notified = TRUE WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`[Kirk trial digest] sent digest covering ${ids.length} request(s)`);
    return { sent: ids.length };
  }

  return { buildWeeklyAttribution, sendOpenClawWeeklyDigest, sendKirkTrialDigest };
};
