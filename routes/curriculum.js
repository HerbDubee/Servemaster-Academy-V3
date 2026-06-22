'use strict';
const express = require('express');

module.exports = function createCurriculumRouter({ db, getGrok, adminMiddleware }) {
  const router = express.Router();

  // ── Roleplays ────────────────────────────────────────────────────────────────
  router.get('/api/roleplays', async (req, res) => {
    try {
      const { category } = req.query;
      const result = await db.query(
        'SELECT * FROM roleplays WHERE category = $1 ORDER BY id ASC',
        [category || 'difficult-guests']
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load roleplays' });
    }
  });

  // ── Quizzes ──────────────────────────────────────────────────────────────────
  router.get('/api/quizzes', async (req, res) => {
    try {
      const { module } = req.query;
      const result = await db.query(
        'SELECT * FROM quizzes WHERE module_name = $1',
        [module || 'wine-service']
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load quiz' });
    }
  });

  // ── Curriculum Check ─────────────────────────────────────────────────────────
  router.get('/check-curriculum', async (req, res) => {
    try {
      const roleplays = await db.query('SELECT * FROM roleplays WHERE category = $1', ['difficult-guests']);
      const quizzes = await db.query('SELECT * FROM quizzes WHERE module_name = $1', ['wine-service']);
      res.json({ roleplays: roleplays.rows, quizzes: quizzes.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Expanded Curriculum Setup (admin) ────────────────────────────────────────
  router.get('/setup-curriculum-expanded', adminMiddleware, async (req, res) => {
    try {
      const roleplays = [
        {
          category: 'difficult-guests',
          title: 'The guest who says the wine is wrong',
          setup: 'A couple is celebrating their anniversary. The guest orders a Pinot Noir, takes one sip, and immediately declares it "bad" and "not what they asked for."',
          dialogue: "Guest: This isn't right. I asked for a Pinot Noir and this tastes completely off.\nServer: I'm sorry it's not meeting your expectations. May I ask what seems off about it to you?\nGuest: It tastes sharp… almost sour. I don't like it at all.\nServer: Thank you for letting me know. I did serve the Pinot Noir you selected, but I understand it may not be the style you were hoping for. Would you like me to suggest a couple of softer, more fruit-forward options?",
          debrief: "Primary objective: Never argue with the guest's perception of taste — taste is subjective, and the guest's experience is always valid.\n\nWhy this matters in fine dining: Guests expect the server to be a knowledgeable guide, not a defender of the wine list. When a guest says a wine is wrong, they are communicating discomfort. Your job is to resolve that discomfort quickly and gracefully — especially on a celebratory occasion where the emotional stakes are high.\n\nCommon mistakes to avoid:\n• Saying \"This is the wine you ordered\" — factually true but dismissive\n• Arguing about the wine's quality or style\n• Leaving the guest with a glass they dislike\n• Failing to offer an alternative quickly\n\nPro tip: Always offer to remove the glass immediately, even before proposing an alternative. This signals empathy and decisiveness. Then ask one clarifying question — \"too sharp,\" \"too dry,\" \"too heavy?\" — to guide your recommendation. Keep the guest's focus on the celebration, not the complaint.",
          voice_style_server: 'calm, polished, reassuring',
          voice_style_guest: 'disappointed but not aggressive'
        },
        {
          category: 'difficult-guests',
          title: 'The guest who feels ignored and turns hostile',
          setup: 'A four-top has waited 12 minutes for service during a busy shift. One guest is visibly frustrated when the server finally approaches.',
          dialogue: "Guest: Finally! Does anyone actually work this section?\nServer: I'm truly sorry for the wait — you're right to expect a faster welcome. I'm here now and ready to take excellent care of you.\nGuest: We've been sitting here forever. This is not a great start.\nServer: I completely understand. Let me get your drink order in right away and help turn this around.",
          debrief: "Primary objective: Acknowledge the delay immediately and without defensiveness — then move swiftly to action.\n\nWhy this matters: Guests in upscale restaurants pay for a seamless experience from the moment they sit down. A 12-minute wait with no acknowledgment feels like indifference. When a guest finally vents that frustration, the instinct is to defend yourself or explain the situation — resist this entirely. Your explanation is irrelevant to the guest's experience in that moment.\n\nCommon mistakes to avoid:\n• Blaming the host, the kitchen, or a coworker — it reflects poorly on the whole team\n• Over-explaining why the wait happened\n• Matching the guest's energy or becoming defensive\n• Offering a hollow \"sorry for the wait\" without immediate action\n\nPro tip: Use the phrase \"I'm here now and ready to take excellent care of you\" — it resets the interaction by shifting focus from the past (the wait) to the present (attentive service). Follow it immediately with action: take the drink order, bring water, or offer something tangible. Recovery speed is everything.",
          voice_style_server: 'steady, apologetic but confident',
          voice_style_guest: 'irritated and sarcastic'
        },
        {
          category: 'difficult-guests',
          title: 'The guest who wants rules broken for a special occasion',
          setup: 'A birthday table wants to open a bottle they brought in, but corkage is not allowed that evening.',
          dialogue: "Guest: It's my sister's birthday. We brought a special bottle — can you open it for us?\nServer: Happy birthday to your sister! Thank you for celebrating with us. Unfortunately, we're not able to open outside bottles this evening due to policy.\nGuest: That's ridiculous. Can't you make one exception?\nServer: I understand this is disappointing, especially on a special night. While I can't override the policy, I'd love to help make the celebration memorable — may I suggest a bottle from our list that might feel equally special?",
          debrief: "Primary objective: Validate the special occasion first, then state the policy clearly — and always redirect toward a positive alternative.\n\nWhy this matters: Special occasions are emotionally charged. When a guest has planned to bring a meaningful bottle for a birthday or anniversary, being told no feels like a personal rejection. The way you deliver the policy determines whether they leave frustrated or impressed.\n\nCommon mistakes to avoid:\n• A cold \"Sorry, it's our policy\" with no warmth or alternative\n• Pretending you'll \"check\" and returning with the same answer — this wastes time and erodes trust\n• Apologizing so much that you seem uncertain about the policy\n• Failing to offer a compelling alternative from the wine list\n\nPro tip: Acknowledge the occasion before the policy — always. \"Happy birthday to your sister\" before \"unfortunately\" changes the entire tone of the conversation. Then offer a specific alternative, not a vague gesture. \"We have a lovely Champagne we reserve for special celebrations\" is far more effective than \"we have some nice wines.\" Make the alternative feel like an upgrade, not a consolation.",
          voice_style_server: 'gracious, composed, warm',
          voice_style_guest: 'emotionally invested and insistent'
        }
      ];

      for (const rp of roleplays) {
        await db.query(
          `INSERT INTO roleplays (category, title, setup, dialogue, debrief, voice_style_server, voice_style_guest)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (title) DO UPDATE SET
             setup = EXCLUDED.setup,
             dialogue = EXCLUDED.dialogue,
             debrief = EXCLUDED.debrief,
             voice_style_server = EXCLUDED.voice_style_server,
             voice_style_guest = EXCLUDED.voice_style_guest`,
          [rp.category, rp.title, rp.setup, rp.dialogue, rp.debrief, rp.voice_style_server, rp.voice_style_guest]
        );
      }

      res.send(`<!DOCTYPE html><html><head><style>body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px;background:#09090b;color:#fafafa;}h1{color:#4ade80;}</style></head><body>
        <h1>✅ Expanded Curriculum Updated!</h1>
        <p>The 3 difficult-guest role-plays now have full expanded debriefs including objectives, why it matters, common mistakes, and pro tips.</p>
        <p><a href="/api/roleplays?category=difficult-guests" style="color:#FF5E3A;">View updated role-plays →</a></p>
        <p><a href="/training" style="color:#FF5E3A;">View Training Hub →</a></p>
        <p><a href="/admin" style="color:#a1a1aa;">← Back to Admin</a></p>
      </body></html>`);
    } catch (e) {
      console.error('Expanded curriculum error:', e.message);
      res.status(500).send('Error: ' + e.message);
    }
  });

  // ── Curriculum Setup (admin) ─────────────────────────────────────────────────
  router.get('/setup-curriculum', adminMiddleware, async (req, res) => {
    try {
      console.log('Starting curriculum insertion...');

      await db.query(`
        INSERT INTO roleplays (category, title, setup, dialogue, debrief, voice_style_server, voice_style_guest)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7),
          ($8,$9,$10,$11,$12,$13,$14),
          ($15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (title) DO NOTHING
      `, [
        'difficult-guests',
        'The guest who says the wine is wrong',
        'A couple is celebrating their anniversary. The guest orders a Pinot Noir, takes one sip, and immediately declares it "bad" and "not what they asked for."',
        'Guest: This isn\'t right. I asked for a Pinot Noir and this tastes completely off.\nServer: I\'m sorry it\'s not meeting your expectations. May I ask what seems off about it to you?\nGuest: It tastes sharp… almost sour. I don\'t like it at all.\nServer: Thank you for letting me know. I did serve the Pinot Noir you selected, but I understand it may not be the style you were hoping for. Would you like me to suggest a couple of softer, more fruit-forward options?',
        'Never argue with the guest\'s perception. Gather information calmly, offer solutions, and protect the celebratory mood.',
        'calm, polished, reassuring',
        'disappointed but not aggressive',

        'difficult-guests',
        'The guest who feels ignored and turns hostile',
        'A four-top has waited 12 minutes for service during a busy shift. One guest is visibly frustrated when the server finally approaches.',
        'Guest: Finally! Does anyone actually work this section?\nServer: I\'m truly sorry for the wait — you\'re right to expect a faster welcome. I\'m here now and ready to take excellent care of you.\nGuest: We\'ve been sitting here forever. This is not a great start.\nServer: I completely understand. Let me get your drink order in right away and help turn this around.',
        'Acknowledge the poor experience immediately. Stay solution-focused and never blame other staff.',
        'steady, apologetic but confident',
        'irritated and sarcastic',

        'difficult-guests',
        'The guest who wants rules broken for a special occasion',
        'A birthday table wants to open a bottle they brought in, but corkage is not allowed that evening.',
        'Guest: It\'s my sister\'s birthday. We brought a special bottle — can you open it for us?\nServer: Happy birthday to your sister! Thank you for celebrating with us. Unfortunately, we\'re not able to open outside bottles this evening due to policy.\nGuest: That\'s ridiculous. Can\'t you make one exception?\nServer: I understand this is disappointing, especially on a special night. While I can\'t override the policy, I\'d love to help make the celebration memorable.',
        'Show genuine empathy. State the policy clearly and kindly. Always offer alternatives.',
        'gracious, composed, warm',
        'emotionally invested and insistent'
      ]);

      const wineQuestions = [
        {
          id: 1, type: 'multiple-choice',
          question: 'When presenting a bottle of wine to the host, what is the main purpose?',
          options: [
            'To confirm the bottle\'s price',
            'To confirm the producer, varietal, and vintage before opening',
            'To let the host smell the cork first',
            'To begin pouring immediately'
          ],
          correct: 1,
          explanation: 'The presentation confirms the correct bottle before opening and helps avoid service mistakes.'
        },
        {
          id: 2, type: 'multiple-choice',
          question: 'What does it mean when a guest says a wine is "corked"?',
          options: [
            'The cork broke during opening',
            'The wine is too young and needs more time',
            'The wine has a musty, wet cardboard smell from TCA contamination',
            'The wine was over-chilled'
          ],
          correct: 2,
          explanation: 'A "corked" wine is contaminated with TCA (trichloroanisole), which produces a musty or wet cardboard smell. It is a wine fault, not a preference issue.'
        },
        {
          id: 3, type: 'multiple-choice',
          question: 'After the host approves the wine, who should be served first?',
          options: [
            'The host, since they ordered and approved it',
            'The eldest guest at the table',
            'Guests clockwise from the host\'s right, with the host poured last',
            'Whoever asks first'
          ],
          correct: 2,
          explanation: 'Proper wine service protocol is to pour guests first — typically ladies before gentlemen, then the host last to ensure quality control throughout.'
        },
        {
          id: 4, type: 'multiple-choice',
          question: 'When should a red wine typically be decanted?',
          options: [
            'Every red wine should be decanted regardless of age',
            'Only wines over 30 years old',
            'Young tannic wines that benefit from aeration, or older wines with sediment',
            'Only when requested by the sommelier'
          ],
          correct: 2,
          explanation: 'Decanting serves two purposes: aerating young, tannic reds to soften them, and separating sediment from older wines.'
        },
        {
          id: 5, type: 'multiple-choice',
          question: 'At what temperature should most white wines be served?',
          options: [
            'Ice cold — straight from the freezer (28–32°F / -2–0°C)',
            'Cellar temperature (55–65°F / 13–18°C)',
            'Chilled (45–55°F / 7–13°C)',
            'Room temperature (68–72°F / 20–22°C)'
          ],
          correct: 2,
          explanation: 'White wines are best served chilled at 45–55°F (7–13°C) to preserve their freshness and aromatics without masking them.'
        },
        {
          id: 6, type: 'multiple-choice',
          question: 'What is the correct fill level for a standard 5 oz red wine pour?',
          options: [
            'Fill to the brim to show generosity',
            'Fill to three-quarters of the glass',
            'Fill to approximately one-third of the glass',
            'Fill to the halfway point'
          ],
          correct: 2,
          explanation: 'Pouring to one-third allows room for the wine to breathe and for the guest to swirl, releasing aromas without risking spills.'
        },
        {
          id: 7, type: 'multiple-choice',
          question: 'A guest tastes the wine and says it tastes "flat" and "boring" — but the wine has no faults. You should:',
          options: [
            'Agree with them and replace the bottle immediately',
            'Argue that the wine is correct and they are wrong',
            'Calmly describe the wine\'s characteristics and offer an alternative style',
            'Get the manager right away without attempting resolution'
          ],
          correct: 2,
          explanation: '"Flat" is a preference, not a fault. Listen, acknowledge, then offer an alternative that better matches their taste profile — this protects the experience and the house.'
        },
        {
          id: 8, type: 'multiple-choice',
          question: 'When opening a bottle of Champagne or sparkling wine, you should:',
          options: [
            'Twist the cork vigorously until it pops loudly',
            'Hold the cork still and twist the bottle slowly, releasing with a soft sigh',
            'Shake the bottle gently to build pressure first',
            'Use a regular corkscrew like any still wine'
          ],
          correct: 1,
          explanation: 'Twist the bottle — not the cork — and aim for a soft sigh rather than a loud pop. Loud pops waste wine and can be dangerous.'
        },
        {
          id: 9, type: 'multiple-choice',
          question: 'Why do servers wipe the bottle neck after each pour?',
          options: [
            'To cool the wine faster',
            'To prevent drips and maintain a polished, professional presentation',
            'To check the wine\'s colour',
            'To remove dust from storage'
          ],
          correct: 1,
          explanation: 'Wiping the bottle prevents drips on the tablecloth, linen, or guest — a small detail that communicates professionalism and care.'
        },
        {
          id: 10, type: 'multiple-choice',
          question: 'A guest at a table of four asks for "a glass of red." What is the best response?',
          options: [
            'Bring whatever red is cheapest by the glass',
            'Ask if they prefer something light, medium, or full-bodied and offer two or three options',
            'Bring the house red without further discussion',
            'Tell them to look at the wine list themselves'
          ],
          correct: 1,
          explanation: 'Asking about preference before suggesting options demonstrates expertise and drives upsell. Guests appreciate guidance — it feels like service, not selling.'
        }
      ];

      await db.query(`
        INSERT INTO quizzes (module_name, title, questions)
        VALUES ($1, $2, $3)
        ON CONFLICT (module_name, title) DO UPDATE SET questions = EXCLUDED.questions
      `, ['wine-service', 'Wine Service Quiz', JSON.stringify(wineQuestions)]);

      console.log('Curriculum content inserted successfully.');
      res.send(`<!DOCTYPE html><html><head><title>Curriculum Setup</title><style>body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:0 20px;background:#09090b;color:#fafafa;} h1{color:#FF5E3A;} .ok{color:#4ade80;} .item{margin:8px 0;}</style></head><body>
        <h1>Curriculum Setup Complete</h1>
        <div class="ok">✓ 3 difficult-guest role-plays inserted</div>
        <div class="ok">✓ Wine Service Quiz (10 questions) inserted</div>
        <p style="color:#a1a1aa;margin-top:24px;">You can now query the <code>roleplays</code> and <code>quizzes</code> tables. This route is admin-protected and can only be run once per content set (ON CONFLICT DO NOTHING).</p>
        <p><a href="/admin" style="color:#FF5E3A;">← Back to Admin</a></p>
      </body></html>`);
    } catch (e) {
      console.error('Curriculum setup error:', e.message);
      res.status(500).send('Error inserting curriculum: ' + e.message);
    }
  });

  // ── Chat config ──────────────────────────────────────────────────────────────
  router.get('/api/chat-config', async (req, res) => {
    try {
      const r = await db.query(`SELECT value FROM site_settings WHERE key = 'chat_enabled'`);
      const enabled = r.rows.length > 0 && r.rows[0].value === 'true';
      res.json({ enabled });
    } catch (e) { res.json({ enabled: false }); }
  });

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const CHAT_SYSTEM_PROMPT = `You are the AI assistant for ServeMaster Academy (servemasteracademy.ca), a professional hospitality training platform based in Canada. You help visitors learn about the platform and decide if it's right for them.

About ServeMaster Academy:
- 30 expert training modules covering all aspects of professional restaurant service
- 150+ AI roleplay scenarios with an AI guest across 5 categories (Guest Relations, Wine & Beverage, Special Occasions, Rush & Pressure, Health & Safety)
- Voice practice using Whisper AI transcription — speak out loud like the real floor
- Completion certificate (PDF download) after finishing all 30 modules
- Gamification: badges, daily streaks, leaderboard
- Trilingual: English, French, Spanish (EN/FR/ES)
- Manager Dashboard for restaurant owners/managers to track staff progress, assign modules, get weekly digest emails
- PWA — works offline, mobile-first design

Pricing (CAD, all with 14-day free trial):
- Free: $0 — 3 modules, 5 AI scenarios, forever free
- Premium Monthly: $19/mo — all 30 modules, 150+ scenarios, voice roleplay, certificate
- Premium Annual: $149/yr (~$12.42/mo, save 35%) — same as Premium + 2 months free
- Starter Team: $99/mo — up to 10 staff, manager dashboard, assign required modules, weekly digest
- Pro Team: $199/mo — unlimited staff, custom AI scenarios, advanced analytics, priority support
- Starter Team Annual: $990/yr (~$82.50/mo, save ~17%)
- Pro Team Annual: $1,990/yr (~$165.83/mo, save ~17%)
- Enterprise: custom pricing — multi-location, white-label, SSO, API access

Keep answers concise, helpful, and friendly. If someone asks about pricing, always mention the free tier and 14-day trial. If they want to sign up, direct them to /signup. If they have a billing issue, direct them to support@servemasteracademy.ca. Answer in the same language the visitor uses.`;

  router.post('/api/chat', async (req, res) => {
    try {
      const settingRow = await db.query(`SELECT value FROM site_settings WHERE key = 'chat_enabled'`);
      const chatEnabled = settingRow.rows.length > 0 && settingRow.rows[0].value === 'true';
      if (!chatEnabled) return res.status(403).json({ error: 'Chat not enabled' });

      const { message, history = [] } = req.body;
      if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });

      const messages = [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...history.slice(-10)
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: String(m.content).slice(0, 1000) })),
        { role: 'user', content: message.slice(0, 500) }
      ];

      const grok = getGrok();
      const completion = await grok.chat.completions.create({
        model: 'grok-3-mini',
        messages,
        max_tokens: 400,
        temperature: 0.7
      });

      const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
      res.json({ reply });
    } catch (e) {
      console.error('Chat error:', e.message);
      res.status(500).json({ error: 'Chat service unavailable' });
    }
  });

  return router;
};
