'use strict';
const express = require('express');

module.exports = function createUserRouter({
  db, getUncachableStripeClient, resend, upload, toFile,
  getOpenAI, getWhisper, getTTS,
  authMiddleware, checkTrial, aiLimiter, progressLimiter,
  escapeHtml, getOrCreateUnsubToken, emailFooter,
}) {
  const router = express.Router();

  // ── Internal helpers ────────────────────────────────────────────────────────

  async function updateStreak(userId) {
    try {
      const streakRes = await db.query('SELECT * FROM streaks WHERE user_id = $1', [userId]);
      const today = new Date().toISOString().split('T')[0];
      if (!streakRes.rows.length) {
        await db.query('INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES ($1, 1, 1, $2)', [userId, today]);
        return;
      }
      const s = streakRes.rows[0];
      const last = s.last_activity_date ? new Date(s.last_activity_date).toISOString().split('T')[0] : null;
      if (last === today) return;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const prevStreak = s.current_streak;
      const newStreak = last === yesterday ? s.current_streak + 1 : 1;
      const longest = Math.max(newStreak, s.longest_streak);
      await db.query('UPDATE streaks SET current_streak = $1, longest_streak = $2, last_activity_date = $3 WHERE user_id = $4', [newStreak, longest, today, userId]);
      if (newStreak === 1 && prevStreak >= 3) {
        const userRes = await db.query('SELECT email, name, is_unsubscribed FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length && !userRes.rows[0].is_unsubscribed) {
          const { email, name } = userRes.rows[0];
          const unsubToken = await getOrCreateUnsubToken(userId);
          const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
          resend.emails.send({
            from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
            to: email,
            subject: `Don't lose your ${prevStreak}-day streak 🔥`,
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;"><img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;"><h2 style="font-size:22px;color:#fb923c;margin-bottom:12px;">Your ${prevStreak}-day streak broke 🔥</h2><p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${escapeHtml(name)},</p><p style="font-size:16px;line-height:1.7;margin-bottom:24px;">You missed a day and your streak reset. But here's the thing — the servers who build lasting careers aren't the ones who never miss a day. They're the ones who come back after they do.</p><p style="margin-bottom:32px;"><a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Start a New Streak Today →</a></p><p style="font-size:14px;color:#a3a3a3;">— Kirk Adamson, Founder</p>${emailFooter(unsubUrl)}</div>`
          }).catch(e => console.error('Streak recovery email error:', e.message));
        }
      }
    } catch (err) { console.error('Streak update error:', err.message); }
  }

  async function checkAndAwardBadges(userId) {
    try {
      const progressRes = await db.query('SELECT * FROM user_progress WHERE user_id = $1', [userId]);
      const scenarioRes = await db.query('SELECT COUNT(*) as cnt FROM scenario_scores WHERE user_id = $1', [userId]);
      const streakRes = await db.query('SELECT * FROM streaks WHERE user_id = $1', [userId]);
      const progress = progressRes.rows;
      const scenarioCount = parseInt(scenarioRes.rows[0]?.cnt || 0);
      const streak = streakRes.rows[0];
      const completedModules = progress.filter(p => p.progress >= 100).length;
      const potentialBadges = [];
      if (completedModules >= 1) potentialBadges.push('first_module');
      if (completedModules >= 30) potentialBadges.push('module_master');
      if (scenarioCount >= 1) potentialBadges.push('first_scenario');
      if (scenarioCount >= 10) potentialBadges.push('scenario_ace');
      if (scenarioCount >= 20) potentialBadges.push('scenario_legend');
      if (streak && streak.current_streak >= 7) potentialBadges.push('week_warrior');
      if (streak && streak.current_streak >= 30) potentialBadges.push('month_master');
      const bevMods = [3, 4, 11].every(id => progress.find(p => p.module_id === id && p.progress >= 100));
      if (bevMods) potentialBadges.push('wine_expert');
      const allPerfect = progress.filter(p => p.quiz_score >= 100).length >= 5;
      if (allPerfect) potentialBadges.push('perfect_scorer');
      for (const badgeId of potentialBadges) {
        await db.query('INSERT INTO badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, badgeId]);
      }
    } catch (err) { console.error('Badge check error:', err.message); }
  }

  async function handleTTS(text, lang, res) {
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });
    const SUPPORTED_TTS_LANGS = new Set(['en', 'fr', 'es']);
    const reqLang = (lang && SUPPORTED_TTS_LANGS.has(lang)) ? lang : 'en';
    const trimmed = text.trim();
    if (!trimmed) return res.status(400).json({ error: 'Empty text' });
    if (trimmed.length > 4000) return res.status(400).json({ error: 'Text exceeds 4000 character limit' });
    try {
      const TTS_VOICE_MAP = { en: 'nova', fr: 'nova', es: 'nova' };
      const voice = TTS_VOICE_MAP[reqLang] || 'nova';
      const response = await getTTS().audio.speech.create({
        model: 'tts-1', voice, input: trimmed, response_format: 'mp3'
      });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || res.writableEnded) break;
            res.write(Buffer.from(value));
          }
          if (!res.writableEnded) res.end();
        } catch { if (!res.writableEnded) res.end(); }
      };
      pump();
    } catch (err) {
      console.error('TTS error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'TTS failed' });
    }
  }

  const ALL_MODULES = [
    { id:1,  title:'Foundations of Exceptional Service',          titleFr:"Fondements du service d'exception",             titleEs:'Fundamentos del Servicio Excepcional',       emoji:'🌟', mins:10 },
    { id:2,  title:'Seating, Menus & Taking Orders',             titleFr:'Placement, menus & prise de commandes',          titleEs:'Acomodar, Menús y Tomar Pedidos',            emoji:'📋', mins:10 },
    { id:3,  title:'Beverage Mastery: Wine & Cocktail Service',  titleFr:'Maîtrise des boissons : vins & cocktails',       titleEs:'Dominio de Bebidas: Vino y Cócteles',        emoji:'🍸', mins:12 },
    { id:4,  title:'Wine Pairing & Advanced Beverage Knowledge', titleFr:'Accords mets-vins & connaissances avancées',     titleEs:'Maridaje de Vinos y Conocimiento Avanzado',  emoji:'🥂', mins:12 },
    { id:5,  title:'Natural & Effective Upselling',              titleFr:'Vente additionnelle naturelle & efficace',        titleEs:'Venta Sugestiva Natural y Efectiva',         emoji:'💰', mins:10 },
    { id:6,  title:'Food Service & Perfect Pacing',              titleFr:'Service des plats & rythme parfait',             titleEs:'Servicio de Alimentos y Ritmo Perfecto',     emoji:'🍽️', mins:10 },
    { id:7,  title:'Table Maintenance & Problem Resolution',     titleFr:"Entretien des tables & résolution de problèmes", titleEs:'Mantenimiento de Mesas y Resolución de Problemas', emoji:'🧼', mins:10 },
    { id:8,  title:'International Etiquette',                    titleFr:'Étiquette internationale',                       titleEs:'Etiqueta Internacional',                     emoji:'🌍', mins:8  },
    { id:9,  title:'Special Occasions Mastery',                  titleFr:'Maîtrise des occasions spéciales',               titleEs:'Dominio de Ocasiones Especiales',            emoji:'🎂', mins:10 },
    { id:10, title:'Closing the Experience',                     titleFr:"Clore l'expérience",                             titleEs:'Cerrar la Experiencia',                      emoji:'👋', mins:8  },
    { id:11, title:'Advanced Wine Regions',                      titleFr:'Régions viticoles avancées',                     titleEs:'Regiones Vitivinícolas Avanzadas',           emoji:'🌎', mins:12 },
    { id:12, title:'Server Leadership & Career',                 titleFr:'Leadership & carrière en service',               titleEs:'Liderazgo del Mesero y Carrera Profesional', emoji:'⭐', mins:10 },
    { id:13, title:'Spirits, Cocktails & Bar Knowledge',          titleFr:'Spiritueux, cocktails & savoir du bar',          titleEs:'Licores, Cócteles y Conocimiento del Bar',   emoji:'🥃', mins:12 },
    { id:14, title:'Coffee & Non-Alcoholic Beverage Service',     titleFr:'Café & service des boissons non alcoolisées',    titleEs:'Café y Servicio de Bebidas No Alcohólicas',  emoji:'☕', mins:10 },
    { id:15, title:'Allergens, Dietary Needs & Safe Service',     titleFr:'Allergènes, besoins alimentaires & service sûr', titleEs:'Alérgenos, Necesidades Dietéticas y Servicio Seguro', emoji:'⚠️', mins:12 },
    { id:16, title:'Reading Guests & Emotional Intelligence',     titleFr:'Lire les clients & intelligence émotionnelle',   titleEs:'Lectura de Clientes e Inteligencia Emocional', emoji:'🧠', mins:10 },
    { id:17, title:'Menu Knowledge & Ingredient Confidence',      titleFr:'Connaissance du menu & confiance en ingrédients',titleEs:'Conocimiento del Menú y Confianza en Ingredientes', emoji:'🌿', mins:10 },
    { id:18, title:'Managing the Rush',                           titleFr:'Gérer le coup de feu',                           titleEs:'Gestionar la Hora Punta',                    emoji:'⚡', mins:10 },
    { id:19, title:'Host Skills: Reservations, Phone & Greeting', titleFr:'Compétences d\'hôte : réservations, téléphone & accueil', titleEs:'Habilidades de Anfitrión: Reservas, Teléfono y Bienvenida', emoji:'📞', mins:10 },
    { id:20, title:'Cheese, Charcuterie & Tableside Specialities',titleFr:'Fromage, charcuterie & spécialités en salle',    titleEs:'Quesos, Charcutería y Especialidades en Mesa', emoji:'🧀', mins:10 },
    { id:21, title:'Sustainability & Responsible Hospitality',    titleFr:'Durabilité & hospitalité responsable',           titleEs:'Sostenibilidad y Hospitalidad Responsable',  emoji:'🌱', mins:10 },
    { id:22, title:'Digital Tools & Modern Restaurant Tech',      titleFr:'Outils numériques & technologie moderne',        titleEs:'Herramientas Digitales y Tecnología Moderna', emoji:'💻', mins:8  },
    { id:23, title:'Team Culture & Kitchen Communication',        titleFr:'Culture d\'équipe & communication en cuisine',   titleEs:'Cultura de Equipo y Comunicación con Cocina', emoji:'🤝', mins:10 },
    { id:24, title:'Wellness, Resilience & Long-Term Career',     titleFr:'Bien-être, résilience & carrière à long terme',  titleEs:'Bienestar, Resiliencia y Carrera a Largo Plazo', emoji:'🌟', mins:10 },
    { id:25, title:'Bar Setup & Mise en Place',                   titleFr:'Mise en place du bar',                           titleEs:'Preparación y Mise en Place del Bar',            emoji:'🧊', mins:12 },
    { id:26, title:'Essential Bartending Techniques',             titleFr:'Techniques essentielles du barman',              titleEs:'Técnicas Esenciales de Bartending',              emoji:'🍹', mins:12 },
    { id:27, title:'Classic Cocktails & Drink Building',          titleFr:'Cocktails classiques & construction de boissons',titleEs:'Cócteles Clásicos y Construcción de Bebidas',    emoji:'🥃', mins:14 },
    { id:28, title:'Bar Upselling & Guest Engagement',            titleFr:'Vente additionnelle & engagement client au bar', titleEs:'Venta Sugestiva y Compromiso con el Cliente',    emoji:'💰', mins:12 },
    { id:29, title:'Responsible Service & Difficult Situations',  titleFr:'Service responsable & situations difficiles',    titleEs:'Servicio Responsable y Situaciones Difíciles',   emoji:'🚫', mins:12 },
    { id:30, title:'Bar Career & Culture',                        titleFr:'Carrière & culture du bar',                      titleEs:'Carrera y Cultura del Bar',                      emoji:'🌟', mins:10 }
  ];

  const scenarios = {
    1: { title: 'The Difficult Guest', systemPrompt: `PERSONALITY: He's the kind of man who believes years of loyalty entitle him to special treatment. His anger is quiet and controlled — clipped sentences, disappointed sighs, the occasional pointed pause. He doesn't shout; he expects. That makes him harder to handle than someone who yells.\n\nSCENARIO: A guest has arrived 20 minutes late for his reservation and the table has been given away. He insists it should still be held. The user is playing the server who must handle this calmly and find a solution. Keep the scenario focused — only this problem. React realistically: if the server is empathetic and solution-focused, he gradually softens. If they are dismissive or make excuses, he escalates with quiet authority.` },
    2: { title: 'Wine Upselling', systemPrompt: `PERSONALITY: A warm, easy-going couple in their mid-thirties. They're celebrating something — maybe an anniversary, maybe just a good week. They feel a little out of their depth on the wine list and are slightly embarrassed about it, but they're genuinely curious and will follow a confident, friendly recommendation. They do not respond well to being lectured or overwhelmed with options.\n\nSCENARIO: They have a moderate budget and are unsure what wine to order. The user is playing the server who should guide them to a good choice. React positively to genuine, specific recommendations and warmly to servers who ask smart questions (red or white? heavy or light? what are you eating?). React with polite disengagement to servers who just rattle off wine names without connecting to their needs or tastes.` },
    3: { title: 'Serious Food Allergy', systemPrompt: `PERSONALITY: Polite, well-prepared, a little apologetic about being "difficult" — but firm. She's had a bad reaction at a restaurant before and carries an EpiPen. She has learned to ask very specific questions and to trust her gut when a server seems uncertain. She is not hostile, but she has a quiet radar for servers who are guessing.\n\nSCENARIO: She has a severe nut allergy. The user is playing the server who must handle this safely and reassuringly. She asks detailed questions about dishes, preparation methods, and cross-contamination. If the server seems dismissive, guesses, or uses the phrase "I think it's fine" without checking, her polite manner becomes visibly tighter and she stops trusting them.` },
    4: { title: 'The Long Wait Complaint', systemPrompt: `PERSONALITY: Not a complainer by nature — he hates making a fuss. But 45 minutes is 45 minutes, and his dining companion is clearly hungry and unhappy. He's not going to yell; he's going to state the facts in a flat, quiet voice and watch what happens. He's checked his watch twice in the last minute. He will accept a genuine, specific response. He will not accept platitudes.\n\nSCENARIO: He has been waiting 45 minutes for the main course. The user is playing the server who must acknowledge the wait, apologize sincerely, and take concrete action. React authentically: a specific apology with a concrete update ("15 more minutes and I'll check right now") will soften him. A hollow "so sorry about that!" with no information will not.` },
    5: { title: 'Dessert Upselling', systemPrompt: `PERSONALITY: She is genuinely stuffed and says so with a laugh. She has no intention of ordering dessert. She's warm and easy to talk to — she won't be rude about a dessert recommendation — but she means what she says. She can be won over if the server makes her want something, not just offers it to her.\n\nSCENARIO: She has just finished a large main course and says she is "absolutely stuffed." The user is playing the server who must try to sell a dessert. React naturally: if the server lists desserts flatly, she will decline warmly but firmly. If the server describes one with genuine sensory enthusiasm — "it's more like a warm chocolate cloud than a full dessert" — she might pause. She decides in the moment, not from a menu recitation.` },
    6: { title: 'Birthday Celebration', systemPrompt: `You are calling the restaurant to book a table for your partner's surprise 40th birthday dinner for 8 people. You want to arrange a cake, possibly a set menu, and a quiet corner table. The user is playing the server/host who takes the booking. You have lots of questions about what the restaurant can do.` },
    7: { title: 'Splitting the Bill', systemPrompt: `You are the organizer of a group of 7 friends who have finished dinner. The group wants to split the bill in a complicated way — some people want to pay only for what they ordered, two people want to split equally, and one person wants to pay separately. The user is playing the server handling the bill. React naturally — be apologetic about the complexity, but firm in how you want it split.` },
    8: { title: 'VIP Guest Arrival', systemPrompt: `You are a well-known local businessperson arriving at the restaurant. You are polite but expect exceptional service and have high standards. You have a reservation but your preferred table isn't ready. You notice small details — a slightly sticky menu, a water glass with spots. The user is playing the server who must meet these high expectations gracefully. Compliment good service genuinely.` },
    9: { title: 'The Indecisive Guest', systemPrompt: `You are a guest who cannot make up their mind. You ask lots of questions about every dish, compare options repeatedly, and keep changing your mind. You are friendly but take a long time to decide. The user is playing the server who must guide you to a decision without making you feel rushed. Respond warmly to patient, helpful guidance.` },
    10: { title: 'Wrong Order Delivered', systemPrompt: `You are a guest who has just been served the wrong dish. You ordered the salmon but received the chicken. You are not aggressive, but clearly disappointed — you specifically ordered the salmon because you don't eat red meat (though you're not strictly vegetarian). The user is playing the server who must handle the mistake. React authentically — a genuine, swift apology with fast action will win you over; excuses will frustrate you further.` },
    11: { title: 'Premium Wine Decanting', systemPrompt: `You are a sophisticated wine connoisseur who has ordered a 2015 Barolo. You expect proper tableside decanting service. You are not rude, but very knowledgeable and you will notice any mistakes in the decanting process — incorrect pour angle, not checking the sediment, not presenting the label. The user is playing the server performing the decanting. Be impressed by correct technique and gently raise questions if they seem uncertain.` },
    12: { title: 'Large Group Chaos', systemPrompt: `You are the organizer of a party of 16 for a corporate team dinner. Half the group has dietary restrictions, three people are late, and two have changed their pre-orders. You are stressed but trying to be reasonable. The user is playing the server managing this group. React positively to calm, organized handling and negatively to panic or poor communication.` },
    13: { title: 'Severe Allergy Emergency', systemPrompt: `You are a guest who, despite clear warnings given during booking, has just discovered your dish may contain traces of your severe shellfish allergy (you carry an EpiPen). You are frightened but trying to stay calm. The user is playing the server who must handle this as a genuine emergency — not just an inconvenience. If they minimize it or seem unsure, your anxiety escalates.` },
    14: { title: 'The Marriage Proposal', systemPrompt: `You are a nervous guest who pre-arranged with the restaurant to propose to your partner during dessert. The ring is with the manager, champagne is on ice, but the timing needs to be perfect. You are communicating with the server to coordinate. Your partner must NOT suspect anything. The user is playing the server who must execute this flawlessly while acting natural in front of the partner.` },
    15: { title: 'Corporate Expense Dinner', systemPrompt: `You are a CFO hosting a client dinner. You need itemized receipts, the bill split into two separate company accounts, confirmation of the restaurant's VAT number, and you have a dietary requirement not mentioned in the booking. You are professional but demanding and time-conscious. The user is playing the server who must handle this efficiently.` },
    16: { title: 'Family with Young Children', systemPrompt: `You are a parent with a 2-year-old who is becoming restless, a 5-year-old who only wants chips, and a baby who needs a high chair. You are apologetic but clearly frazzled. The user is playing the server who must make this family feel welcome and comfortable — not like a burden. React warmly to patience and creativity.` },
    17: { title: 'Vegan Tasting Menu', systemPrompt: `You are a vegan guest dining at a traditionally meat-forward fine dining restaurant. You booked in advance and confirmed your dietary needs, but you want to ensure every element of the tasting menu is genuinely vegan — not just "vegetarian." You are knowledgeable about hidden animal products (gelatin, stock, honey). The user is playing the server who must navigate this confidently.` },
    18: { title: 'The Food Critic', systemPrompt: `You are a restaurant reviewer for a respected food publication. You have not announced yourself. You are taking discreet notes, asking unusually detailed questions about sourcing, preparation, and the chef's background. You are polite but unnervingly observant. The user is playing the server who doesn't know who you are but must perform at their absolute best.` },
    19: { title: 'Last Orders Rush', systemPrompt: `You are a guest who arrives 30 minutes before the kitchen closes on a Friday night. The restaurant is packed, you are hungry, and you want a full three-course meal. The user is playing the server who must honestly manage your expectations while being hospitable. You are reasonable but insistent — you saw the closing time online as later than it is.` },
    20: { title: 'Corked Wine Return', systemPrompt: `You have just poured the wine and your partner immediately says it tastes "off" — musty, like wet cardboard. You believe it is corked. You are not confrontational but are asking the server to assess and replace the bottle. The user is playing the server who must handle this with professionalism. If they smell and agree, reward their confidence. If they dismiss your concern without checking, push back politely.` },
    21: { title: 'Dine and Dash Suspicion', systemPrompt: `You are the manager on duty. A server has come to you concerned that a table of 4 appears to be preparing to leave without paying — they have asked for the bill three times, one member went "to get cash" and hasn't returned, and they are putting on coats. The user is playing the server consulting with management. Guide them through protocol — approaching the table calmly, securing payment discreetly, without accusations.` },
    22: { title: 'Medical Situation', systemPrompt: `You are a guest at an adjacent table. A diner at the next table has suddenly slumped forward and their companion is panicking. The user is playing the server who must take immediate control — calling emergency services, clearing the area, assisting the companion, keeping other guests calm. React as a shocked but concerned nearby diner.` },
    23: { title: 'Noise Complaint', systemPrompt: `You are a guest celebrating a quiet anniversary dinner. The table next to you is a very loud, celebratory group — shouting, laughing, and occasionally swearing. You are not aggressive, but you are genuinely upset that your romantic evening is being disrupted. The user is playing the server who must resolve this diplomatically without offending either table.` },
    24: { title: 'The Food Influencer', systemPrompt: `You are a social media food influencer with 200,000 followers. You are filming every course for your stories, asking for dishes to be re-plated for better angles, asking about lighting near your table, and requesting the chef come out for a photo. Your companion is embarrassed. Service is backing up. The user is playing the server who must accommodate your reasonable requests while keeping service moving and protecting other guests' experience.` },
    25: { title: 'Sommelier Knowledge Test', systemPrompt: `You are an incredibly knowledgeable wine guest — perhaps a trained sommelier yourself. You are testing the server with specific questions: the exact vintage on the list, the specific village in Burgundy, whether the wine was fermented in oak or stainless, the producer's biodynamic certification. You are not being hostile — you genuinely love wine and want a real conversation. The user is playing the server who must be honest about the limits of their knowledge while demonstrating genuine passion.` },
    26: { title: '9-Course Tasting Menu Pacing', systemPrompt: `You are a couple who booked the 9-course tasting menu. Midway through (after course 5) you mention you have a theatre booking in 90 minutes. The kitchen needs to know. You are not blaming the restaurant — you just forgot to mention it on booking. The user is playing the server who must coordinate between you, the kitchen, and management to either adjust pacing or manage your expectations.` },
    27: { title: 'Post-Theatre Rush', systemPrompt: `You are one of 50 guests who have just arrived simultaneously from a nearby theatre — an 8pm show just ended. The restaurant is full. The user is playing the floor manager coordinating the rush. You are a guest who is hungry, has a reservation, but your table isn't ready yet. React to how well the server/manager handles the surge.` },
    28: { title: 'Celiac Disease', systemPrompt: `You have celiac disease — a genuine medical condition, not a preference. You ask very specific questions about cross-contamination: separate chopping boards, dedicated fryers, gluten in sauces. You are experienced with dining out and know all the places gluten hides. You will not tolerate "I think it's fine." The user is playing the server who must either confirm every detail with the kitchen or be completely honest about uncertainty.` },
    29: { title: 'The Overgenerous Drunk', systemPrompt: `You are a very intoxicated but extremely good-natured guest who keeps trying to tip everyone, is talking loudly about how this is the best restaurant in the world, and is now ordering a fourth bottle of expensive wine. Their companion is clearly uncomfortable and has quietly asked if you can stop serving them alcohol. The user is playing the server who must navigate this sensitively — protecting the guest's dignity, their safety, and the other guests' comfort.` },
    30: { title: 'Bisected Language Table', systemPrompt: `You are the leader of a table where 4 guests speak only French and 4 guests speak only English. You speak both. You are relaying orders but getting confused, and the non-English speakers are pointing at the menu looking confused. The user is playing the server who must serve this table with grace — using you as translator when needed, using visual menus, adapting their communication style.` },
    31: { title: 'Cocktail Recommendation', systemPrompt: `You are one half of a couple who has just sat down at the bar on a Friday night. Neither of you has looked at the cocktail menu — you are both scanning the bottles behind the bar. You say: "We have no idea what we want — surprise us?" You are enthusiastic but genuinely have no direction. You respond well to bartenders who ask smart questions about flavour preferences (fruity, spirit-forward, citrusy, etc.) and poorly to those who just rattle off names. Describe your reaction as the bartender builds the experience.` },
    32: { title: 'Upselling at the Bar', systemPrompt: `You are a solo guest who has just sat down at the bar. You glance up and say "Just a pint of whatever lager you have on tap, please." You are not unfriendly — just distracted, tired, maybe a bit bored. The bar has four craft beers on tap and a cocktail menu worth exploring. You respond well to bartenders who make you feel noticed rather than sold to — a genuine recommendation based on what you ordered feels different from a pushy upsell. If they engage you naturally, you open up. If they push too hard, you stick to the lager.` },
    33: { title: 'The Overserved Regular', systemPrompt: `You are Marcus, a regular who comes in two or three times a week. Tonight you have had four drinks over two hours and your speech has become slightly slurred, you knocked over a glass earlier, and you are now waving the bartender over for another round. You are not aggressive — you think you are perfectly fine. If the bartender refuses service gently and respectfully, you are mildly indignant but ultimately accepting. If they are condescending or abrupt, you become defensive and escalate. React authentically throughout.` },
    34: { title: 'Cocktail Knowledge Challenge', systemPrompt: `You are a well-dressed, very knowledgeable regular who has just ordered a Last Word. When it arrives, you sip it approvingly — then start asking detailed questions: the botanicals in the gin they used, the ratio versus the traditional spec, whether they have tried the mezcal variation. You are not hostile — you love great bar conversation and are genuinely curious whether this bartender knows their craft. If they answer confidently and accurately, reward them with more interesting questions. If they bluff, press them gently. If they say "I'm not sure but..." and engage honestly, respect that too.` },
    35: { title: 'Last Call Rush', systemPrompt: `It is 1:45am. Last call has just been announced and the bar has come alive. You are one of eight people trying to order at once. You have been here since 9pm and are near your limit — you are perhaps showing early signs of intoxication. You wave repeatedly, talk slightly too loudly, and are very insistent about getting your order in before the bar closes. The user is playing the bartender managing this surge. React authentically to how they handle the crowd, prioritize orders, and assess your state.` },
    36: { title: 'The Solo Bar Guest', systemPrompt: `You are a woman in your early 40s sitting alone at the bar on a quiet Wednesday evening. You ordered a glass of wine, opened your phone, then put it face-down on the bar. You have not spoken to anyone. You might want company — or you might not. The user is playing the bartender who must read the situation correctly. If they check in briefly and give you space, you respond positively with short, warm answers. If they push for conversation too hard too soon, you become slightly closed. If they completely ignore you, you feel invisible. The goal is authentic human connection at exactly the right pace — narrate your reactions honestly.` }
  };

  // ── User progress ───────────────────────────────────────────────────────────

  router.get('/api/user/progress', authMiddleware, checkTrial, async (req, res, next) => {
    try {
      const result = await db.query('SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1', [req.user.id]);
      const streakRes = await db.query('SELECT current_streak, longest_streak FROM streaks WHERE user_id = $1', [req.user.id]);
      const badgeRes = await db.query('SELECT badge_id, earned_at FROM badges WHERE user_id = $1', [req.user.id]);
      const scenarioRes = await db.query('SELECT scenario_id, completed_at FROM scenario_scores WHERE user_id = $1 ORDER BY completed_at DESC', [req.user.id]);
      const subRes = await db.query('SELECT subscription_status FROM users WHERE id = $1', [req.user.id]);
      res.json({
        progress: result.rows,
        streak: streakRes.rows[0] || { current_streak: 0, longest_streak: 0 },
        badges: badgeRes.rows,
        scenarios: scenarioRes.rows,
        subscription_status: subRes.rows[0]?.subscription_status || 'free'
      });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch progress' })); }
  });

  router.post('/api/user/progress', authMiddleware, progressLimiter, checkTrial, async (req, res, next) => {
    let { moduleId, progress, quizScore } = req.body;
    if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
    try {
      const userRes = await db.query('SELECT stripe_subscription_id, subscription_status FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];
      if (user?.stripe_subscription_id) {
        try {
          const stripe = getUncachableStripeClient();
          const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
          if (subscription.status !== 'active' && subscription.trial_end && subscription.trial_end < Date.now() / 1000) {
            return res.status(402).json({ error: 'Trial expired', redirect: '/pricing' });
          }
        } catch (stripeErr) {
          console.warn('Stripe subscription check failed:', stripeErr.message);
        }
      }
      if (quizScore > 0) progress = 100;
      const completed = progress >= 100 ? new Date() : null;
      const prevRes = await db.query(
        'SELECT completed_at FROM user_progress WHERE user_id = $1 AND module_id = $2',
        [req.user.id, moduleId]
      );
      const wasAlreadyComplete = prevRes.rows[0]?.completed_at != null;
      await db.query(`
        INSERT INTO user_progress (user_id, module_id, progress, quiz_score, completed_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, module_id)
        DO UPDATE SET progress = GREATEST(user_progress.progress, $3),
          quiz_score = GREATEST(user_progress.quiz_score, COALESCE($4, 0)),
          completed_at = COALESCE(user_progress.completed_at, $5),
          updated_at = NOW()
      `, [req.user.id, moduleId, progress, quizScore || 0, completed]);
      await updateStreak(req.user.id);
      await checkAndAwardBadges(req.user.id);
      res.json({ success: true });
      if (moduleId === 2 && progress >= 100 && !wasAlreadyComplete) {
        const uRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
        const u = uRes.rows[0];
        if (u) {
          (async () => { try {
            const unsubToken = await getOrCreateUnsubToken(req.user.id);
            const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
            resend.emails.send({
              from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
              to: u.email,
              subject: 'Have you tried the AI role-play yet?',
              html: `
                <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
                  <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${u.name},</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">One of the most powerful features in ServeMaster Academy is the AI role-play.</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">You speak your response to a real guest scenario (anniversary table, difficult customer, VIP) and get instant coaching.</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">It feels surprisingly real — and it's the fastest way to build confidence.</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Try one scenario today — it only takes 2 minutes.</p>
                  <p style="margin-bottom:32px;">
                    <a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Open AI Role-Play Now</a>
                  </p>
                  <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">
                    <strong style="color:#f5f5f5;">Kirk</strong><br>
                    <a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a>
                  </p>
                  ${emailFooter(unsubUrl)}
                </div>
              `
            }).catch(err => console.error('AI roleplay email error:', err.message));
          } catch(e) {} })();
        }
      }
      if (moduleId === 1 && progress >= 100 && !wasAlreadyComplete) {
        const uRes = await db.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
        const u = uRes.rows[0];
        if (u) {
          (async () => { try {
            const unsubToken = await getOrCreateUnsubToken(req.user.id);
            const unsubUrl = `https://servemasteracademy.ca/unsubscribe?token=${unsubToken}`;
            resend.emails.send({
              from: 'Kirk Adamson <kirk_adamson@servemasteracademy.ca>',
              to: u.email,
              subject: 'Module 1 complete — here\'s what\'s next',
              html: `
                <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#f5f5f5;padding:40px;border-radius:12px;">
                  <img src="https://servemasteracademy.ca/logo.png" alt="ServeMaster Academy" style="width:48px;height:48px;border-radius:10px;margin-bottom:24px;">
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Hi ${u.name},</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">After countless years enjoying fine dining, I've learned that the entire dining experience is often decided in the first 30 seconds.</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:16px;">The way a server greets the table, handles coats, and makes the guest feel seen — that single moment sets the tone for the whole evening.</p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:32px;">Module 2 teaches exactly how to master that moment. Would you like to try it now?</p>
                  <p style="margin-bottom:32px;">
                    <a href="https://servemasteracademy.ca/app" style="background:#d4af37;color:#000;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:16px;">Continue to Module 2 →</a>
                  </p>
                  <p style="font-size:16px;line-height:1.7;margin-bottom:24px;">Looking forward to hearing how it goes,</p>
                  <p style="font-size:15px;line-height:1.7;color:#a3a3a3;">
                    <strong style="color:#f5f5f5;">Kirk</strong><br>
                    <a href="mailto:kirk_adamson@servemasteracademy.ca" style="color:#d4af37;text-decoration:none;">kirk_adamson@servemasteracademy.ca</a>
                  </p>
                  ${emailFooter(unsubUrl)}
                </div>
              `
            }).catch(err => console.error('Module 1 email error:', err.message));
          } catch(e) {} })();
        }
      }
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to save progress' })); }
  });

  // ── Modules list ────────────────────────────────────────────────────────────

  router.get('/api/modules', authMiddleware, checkTrial, async (req, res, next) => {
    try {
      const { rows } = await db.query(
        'SELECT module_id, progress, quiz_score, completed_at FROM user_progress WHERE user_id = $1',
        [req.user.id]
      );
      const progressMap = {};
      rows.forEach(r => { progressMap[r.module_id] = { progress: r.progress, quizScore: r.quiz_score, completedAt: r.completed_at }; });
      const modules = ALL_MODULES.map(m => ({
        ...m,
        progress: progressMap[m.id]?.progress ?? 0,
        quizScore: progressMap[m.id]?.quizScore ?? null,
        completedAt: progressMap[m.id]?.completedAt ?? null
      }));
      res.json({ modules });
    } catch (err) {
      console.error('Modules fetch error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to fetch modules' }));
    }
  });

  // ── Scenario completion ─────────────────────────────────────────────────────

  router.post('/api/user/scenario', authMiddleware, checkTrial, async (req, res, next) => {
    const { scenarioId } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'scenarioId required' });
    try {
      await db.query('INSERT INTO scenario_scores (user_id, scenario_id) VALUES ($1, $2)', [req.user.id, scenarioId]);
      await checkAndAwardBadges(req.user.id);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to save scenario' })); }
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────────

  router.get('/api/leaderboard', authMiddleware, async (req, res, next) => {
    try {
      const result = await db.query(`
        SELECT u.name,
          COALESCE(SUM(p.progress), 0) as total_progress,
          COUNT(CASE WHEN p.progress >= 100 THEN 1 END) as modules_completed,
          COALESCE(s.current_streak, 0) as streak,
          (SELECT COUNT(*) FROM scenario_scores ss WHERE ss.user_id = u.id) as scenarios_done
        FROM users u
        LEFT JOIN user_progress p ON p.user_id = u.id
        LEFT JOIN streaks s ON s.user_id = u.id
        GROUP BY u.id, u.name, s.current_streak
        ORDER BY total_progress DESC, modules_completed DESC
        LIMIT 50
      `);
      res.json({ leaderboard: result.rows });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch leaderboard' })); }
  });

  // ── TTS ─────────────────────────────────────────────────────────────────────

  router.get('/api/tts', authMiddleware, aiLimiter, (req, res) => handleTTS(req.query.text, req.query.lang, res));
  router.post('/api/tts', authMiddleware, aiLimiter, (req, res) => handleTTS(req.body.text, req.body.lang, res));

  // ── Transcription ───────────────────────────────────────────────────────────

  router.post('/api/transcribe', authMiddleware, aiLimiter, upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    try {
      const mimetype = req.file.mimetype || 'audio/webm';
      const ext = mimetype.includes('mp4') || mimetype.includes('m4a') ? 'audio.mp4'
        : mimetype.includes('ogg') ? 'audio.ogg'
        : mimetype.includes('wav') ? 'audio.wav'
        : 'audio.webm';
      const filename = req.file.originalname || ext;
      const audioFile = await toFile(req.file.buffer, filename, { type: mimetype });
      const transcription = await getWhisper().audio.transcriptions.create({
        file: audioFile, model: 'whisper-1',
        language: req.body.lang === 'es' ? 'es' : req.body.lang === 'fr' ? 'fr' : 'en',
      });
      res.json({ text: transcription.text });
    } catch (err) {
      console.error('Whisper transcription error:', err.message);
      res.status(500).json({ error: 'Transcription failed', fallback: true });
    }
  });

  // ── Roleplay ────────────────────────────────────────────────────────────────

  router.post('/api/roleplay', authMiddleware, aiLimiter, async (req, res, next) => {
    const { scenarioId, messages, lang, sceneContext } = req.body;
    const scenario = scenarios[scenarioId];
    if (!scenario && !sceneContext) return res.status(400).json({ error: 'Invalid scenario' });
    const thirdPersonWrapper = lang === 'fr'
      ? `STYLE DE NARRATION — IMPORTANT : Narrez toujours le client à la troisième personne. Ne parlez jamais en tant que client à la première personne. Décrivez ce que dit et fait le client comme un narrateur : "Le client fronce les sourcils et dit : '...'". Utilisez "le client", "il", "elle" ou "ils" tout au long.\n\nBRIÈVETÉ — Soyez concis. Chaque réponse : une action brève + une réplique de dialogue. Pas de description d'ambiance, de décor ou de narration atmosphérique. Allez droit au comportement et aux mots du client.\n\n`
      : lang === 'es'
      ? `ESTILO DE NARRACIÓN — IMPORTANTE: Narra siempre al cliente en tercera persona. Nunca hables como el cliente en primera persona. Describe lo que dice y hace el cliente como narrador: "El cliente frunce el ceño y dice: '...'". Usa "el cliente", "él", "ella" o "ellos" en todo momento.\n\nBREVEDAD — Sé conciso. Cada respuesta: una acción breve + una línea de diálogo. Sin descripciones de ambiente, escenario ni narración atmosférica. Ve directo al comportamiento y las palabras del cliente.\n\n`
      : `NARRATION STYLE — IMPORTANT: Always narrate the customer in third person. Never speak as the customer in first person ("I want...", "I'm angry..."). Instead, describe what the customer says and does as a narrator: "The customer frowns and says: '...'", "He crosses his arms and replies: '...'". Use "the customer", "he", "she", or "they" throughout.\n\nBREVITY — Be concise. Each response: one short action beat + one line of dialogue. No scene-setting, no atmospheric description, no describing the restaurant or surroundings. Go straight to the guest's behavior and words.\n\nPERSONALITY AUTHENTICITY — Every guest has a real personality. Use varied, casual, natural language that fits who they are. Impatient guests speak in clipped, blunt sentences. Confused tourists over-explain and apologize. Entitled guests have a quiet expectation of superiority — they don't shout, they sigh. Friendly regulars use humour and first names. Sarcastic guests are deadpan, not hostile. Let the personality come through in word choice, not just stated emotion.\n\nEMOTIONAL RANGE — Guests are real people with real moods. Show irritation, dry humour, relief, embarrassment, warmth, suspicion, impatience, genuine delight — whatever fits the moment. Flat, polite responses are unrealistic and unhelpful for training.\n\nRECOVERY MECHANICS — If the server makes a genuine recovery — specific apology, fast action, honest communication — let the guest visibly soften or de-escalate. Real guests want good service; they will reward it when they get it. Permanent hostility is not realistic. Show the arc.\n\n`;
    const langInstruction = lang === 'fr'
      ? 'IMPORTANT : Cette conversation se déroule en français. Tu DOIS répondre entièrement en français.\n\n'
      : lang === 'es'
      ? 'IMPORTANTE: Esta conversación ocurre en español. DEBES responder completamente en español.\n\n'
      : '';
    const basePrompt = scenario
      ? scenario.systemPrompt
      : `You are playing the role of a guest in a hospitality training scenario. The user is playing the server. Stay completely in character as the guest described in this scene. React realistically to how the server handles the situation — positively to skill and professionalism, negatively to mistakes or poor technique. Keep responses concise.\n\nScene: ${sceneContext}`;
    const systemContent = langInstruction + thirdPersonWrapper + basePrompt;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemContent }, ...messages],
      });
      const reply = completion.choices[0].message.content || '';
      res.json({ reply });
    } catch (err) {
      console.error('OpenAI error:', err.message);
      next(Object.assign(err, { publicMessage: 'AI request failed' }));
    }
  });

  router.post('/api/roleplay/summary', authMiddleware, aiLimiter, async (req, res, next) => {
    const { scenarioId, messages, lang, sceneTitle, sceneContext } = req.body;
    const scenario = scenarios[scenarioId];
    if (!scenario && !sceneContext) return res.status(400).json({ error: 'Invalid scenario' });
    const scenarioTitle = scenario ? scenario.title : (sceneTitle || 'Hospitality Scenario');
    const langInstruction = lang === 'fr'
      ? 'IMPORTANT : Rédige toute ta réponse en français. Tous les champs JSON doivent être en français.\n\n'
      : lang === 'es'
      ? 'IMPORTANTE: Escribe toda tu respuesta en español. Todos los campos JSON deben estar en español.\n\n'
      : '';
    const systemPrompt = langInstruction + `You are a strict, experienced fine-dining hospitality trainer reviewing a server's performance in a roleplay exercise.

Scenario: "${scenarioTitle}"

You will be given the full conversation between the server (user) and the simulated customer (assistant). Review what the server actually said — their word choices, tone, phrasing, and actions — and provide a structured critique.

RULES:
- Be direct and specific. Reference exactly what the server said or failed to say.
- Do NOT retell or summarize the scenario plot.
- Do NOT be vague. "Good empathy" is not acceptable — say "You acknowledged the wait with 'I completely understand your frustration' which was the right move."
- Identify real mistakes, missed upsell moments, poor phrasing, or protocol gaps.
- If the server did something wrong, say so clearly.
- Keep each bullet point to one concrete observation.

Respond with valid JSON only, in this exact format${lang === 'fr' ? ' (all field values MUST be written in French)' : lang === 'es' ? ' (all field values MUST be written in Spanish)' : ''}:
{
  "verdict": "One direct sentence summarizing overall performance — honest, not flattering",
  "right": ["Specific strength referencing what was said", "Another strength if applicable"],
  "wrong": ["Specific mistake or missed opportunity referencing actual dialogue", "Another gap if applicable"],
  "tip": "One concrete, actionable coaching tip for what to do differently or better next time"
}`;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Here is the full conversation to review:\n\n' + messages.map(m => `${m.role === 'user' ? 'SERVER' : 'CUSTOMER'}: ${m.content}`).join('\n\n') }
        ],
      });
      const raw = completion.choices[0].message.content || '{}';
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (err) {
      console.error('Summary AI error:', err.message);
      next(Object.assign(err, { publicMessage: 'Summary failed' }));
    }
  });

  // ── User preferences ────────────────────────────────────────────────────────

  router.patch('/api/user/lang', authMiddleware, async (req, res, next) => {
    const { lang } = req.body;
    if (!['en', 'fr', 'es'].includes(lang)) return res.status(400).json({ error: 'Invalid lang' });
    try {
      await db.query('UPDATE users SET lang_preference = $1 WHERE id = $2', [lang, req.user.id]);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to save language' })); }
  });

  // ── Module bookmarks ─────────────────────────────────────────────────────────

  router.get('/api/user/bookmarks', authMiddleware, async (req, res, next) => {
    try {
      const result = await db.query('SELECT module_id, created_at FROM module_bookmarks WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
      res.json({ bookmarks: result.rows.map(r => r.module_id) });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch bookmarks' })); }
  });

  router.post('/api/user/bookmarks', authMiddleware, async (req, res, next) => {
    const { moduleId } = req.body;
    if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
    try {
      await db.query('INSERT INTO module_bookmarks (user_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, moduleId]);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to add bookmark' })); }
  });

  router.delete('/api/user/bookmarks/:moduleId', authMiddleware, async (req, res, next) => {
    try {
      await db.query('DELETE FROM module_bookmarks WHERE user_id = $1 AND module_id = $2', [req.user.id, req.params.moduleId]);
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to remove bookmark' })); }
  });

  // ── Scenario transcripts ─────────────────────────────────────────────────────

  router.post('/api/user/scenario-transcript', authMiddleware, async (req, res, next) => {
    const { scenarioId, messages, verdict } = req.body;
    if (!scenarioId || !messages) return res.status(400).json({ error: 'scenarioId and messages required' });
    try {
      await db.query(
        'INSERT INTO scenario_transcripts (user_id, scenario_id, messages, verdict) VALUES ($1, $2, $3, $4)',
        [req.user.id, scenarioId, JSON.stringify(messages), verdict || null]
      );
      res.json({ success: true });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to save transcript' })); }
  });

  router.get('/api/user/scenario-transcripts', authMiddleware, async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT id, scenario_id, verdict, completed_at FROM scenario_transcripts WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 50',
        [req.user.id]
      );
      res.json({ transcripts: result.rows });
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch transcripts' })); }
  });

  router.get('/api/user/scenario-transcripts/:id', authMiddleware, async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT id, scenario_id, messages, verdict, completed_at FROM scenario_transcripts WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Transcript not found' });
      res.json(result.rows[0]);
    } catch (err) { next(Object.assign(err, { publicMessage: 'Failed to fetch transcript' })); }
  });

  return router;
};
