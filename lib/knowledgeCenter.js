'use strict';

/**
 * Knowledge Center — the gated, in-app reference library.
 *
 * This is intentionally SEPARATE from the public blog (which stays public for
 * SEO). These entries are curriculum-aligned quick references / field guides
 * and are served only through the authenticated, progress-gated API
 * (GET /api/user/knowledge) — never shipped in public JS. Bodies are withheld
 * for levels the learner hasn't unlocked yet.
 *
 * level: 'basic' (unlocks after Foundations) | 'intermediate' (after Craft) |
 *        'advanced' (after Mastery).
 */

const ENTRIES = [
  // ── Foundations-level references (unlock after Foundations) ────────────────
  {
    id: 'the-ten-second-welcome',
    level: 'basic', track: 'foundations', emoji: '🌟',
    title: 'The Ten-Second Welcome',
    titleFr: "L'accueil en dix secondes", titleEs: 'La Bienvenida de Diez Segundos',
    summary: 'A field guide to the first table touch — what to do before you say a word.',
    summaryFr: "Guide du premier contact — quoi faire avant même de parler.",
    summaryEs: 'Guía del primer contacto — qué hacer antes de decir una palabra.',
    body: `<p>The guest decides how they feel about your service in the first ten seconds — long before the food arrives. Master the arrival and everything after it runs downhill.</p>
<h3>The sequence</h3>
<ol>
<li><strong>Acknowledge on sight (within 30s).</strong> Even mid-task, a nod and "I'll be right with you" resets the guest's internal clock.</li>
<li><strong>Approach square, not sideways.</strong> Face the table. Hands visible, not in pockets.</li>
<li><strong>Read before you speak.</strong> Celebration? Business lunch? First date? Match your energy to theirs.</li>
<li><strong>Lead with warmth, not the script.</strong> "Welcome in — first time with us?" beats "Hi, my name is…"</li>
</ol>
<h3>Craft note</h3>
<p>Great servers don't rush the welcome to save time — they invest ten seconds to earn the next ninety minutes.</p>`,
  },
  {
    id: 'reading-the-table-basics',
    level: 'basic', track: 'foundations', emoji: '👀',
    title: 'Reading the Table: The Basics',
    titleFr: 'Lire la table : les bases', titleEs: 'Leer la Mesa: Lo Básico',
    summary: 'The cues every server should catch — pace, mood, and who is really deciding.',
    summaryFr: 'Les signaux à repérer — rythme, humeur et qui décide vraiment.',
    summaryEs: 'Las señales a captar — ritmo, ánimo y quién decide realmente.',
    body: `<h3>Three things to read on every table</h3>
<ul>
<li><strong>Pace.</strong> Menus closed = ready. Still talking with menus open = give them room.</li>
<li><strong>Mood.</strong> Match it. A quiet anniversary table wants calm; a birthday group wants energy.</li>
<li><strong>The decider.</strong> Someone is host tonight. Find them — they set the tone and usually the tab.</li>
</ul>
<h3>Micro-signals</h3>
<p>Scanning the room = needs something. Phone face-down = engaged. Leaning back after the plate = pace the next course. You're reading a room, not just taking an order.</p>`,
  },
  {
    id: 'pacing-the-meal',
    level: 'basic', track: 'foundations', emoji: '⏱️',
    title: 'Pacing the Meal',
    titleFr: 'Rythmer le repas', titleEs: 'Ritmo de la Comida',
    summary: 'The invisible skill — timing courses so the table never waits and never feels rushed.',
    summaryFr: 'Le savoir-faire invisible — synchroniser les plats sans attente ni précipitation.',
    summaryEs: 'La habilidad invisible — sincronizar los tiempos sin esperas ni prisas.',
    body: `<h3>The rhythm</h3>
<p>Pacing is the difference between a meal and an experience. The kitchen fires; you conduct.</p>
<ul>
<li><strong>Fire the next course when the current one is ~2/3 eaten</strong>, not when plates are cleared.</li>
<li><strong>Never let a guest sit with an empty table.</strong> Water, bread, a check-back — presence fills the gap.</li>
<li><strong>Slow tables down gracefully</strong> for celebrations; speed up for the business lunch on a clock.</li>
</ul>
<h3>Craft note</h3>
<p>When a table says "that flew by," you paced it right. When they say "we were here forever," you didn't.</p>`,
  },
  {
    id: 'the-graceful-close',
    level: 'basic', track: 'foundations', emoji: '👋',
    title: 'The Graceful Close',
    titleFr: 'La clôture élégante', titleEs: 'El Cierre Elegante',
    summary: 'Ending the experience so the last impression is as strong as the first.',
    summaryFr: 'Terminer pour que la dernière impression égale la première.',
    summaryEs: 'Cerrar para que la última impresión iguale a la primera.',
    body: `<h3>The close is part of the meal</h3>
<ul>
<li><strong>Never make the check a chase.</strong> Drop it when they signal, then step away — don't hover.</li>
<li><strong>Thank them by something specific.</strong> "Enjoy the rest of the anniversary" lands harder than "have a good night."</li>
<li><strong>Reset for the next guest the moment they stand</strong>, not before.</li>
</ul>
<h3>Craft note</h3>
<p>The tip is decided at the table, but the return visit is decided at the door.</p>`,
  },

  // ── Craft-level references (unlock after Craft) ────────────────────────────
  {
    id: 'wine-service-sequence',
    level: 'intermediate', track: 'craft', emoji: '🍷',
    title: 'The Wine Service Sequence',
    titleFr: 'La séquence du service du vin', titleEs: 'La Secuencia del Servicio de Vino',
    summary: 'Present, open, taste, pour — the full ritual done without a fumble.',
    summaryFr: 'Présenter, ouvrir, goûter, servir — le rituel complet, sans faux pas.',
    summaryEs: 'Presentar, abrir, catar, servir — el ritual completo, sin titubeos.',
    body: `<h3>The sequence</h3>
<ol>
<li><strong>Present</strong> the bottle to the host, label facing them. State producer, wine, vintage.</li>
<li><strong>Open</strong> tableside. Cut foil below the lip, wipe the neck, draw the cork quietly.</li>
<li><strong>Offer the cork</strong> to the host (don't insist), then pour a taste — about an ounce.</li>
<li><strong>On approval, serve</strong> guests to the host's left, ladies first if it suits the table, host last.</li>
</ol>
<h3>Pour levels</h3>
<p>Whites & sparkling: two-thirds. Reds: to the widest point of the bowl. Never fill to the rim — the wine needs room to breathe and swirl.</p>`,
  },
  {
    id: 'upsell-without-selling',
    level: 'intermediate', track: 'craft', emoji: '💰',
    title: 'Upselling Without Selling',
    titleFr: 'Vendre plus sans vendre', titleEs: 'Vender Más Sin Vender',
    summary: 'Language that lifts the check by making the meal better, not pushier.',
    summaryFr: 'Un langage qui augmente l\'addition en améliorant le repas.',
    summaryEs: 'Un lenguaje que sube la cuenta mejorando la comida.',
    body: `<h3>The principle</h3>
<p>You're not selling more — you're guiding a better experience. Recommend what you'd order.</p>
<h3>Language that works</h3>
<ul>
<li><strong>Specific over generic:</strong> "The burrata is coming in perfect right now" beats "want an appetizer?"</li>
<li><strong>Pair, don't push:</strong> "That steak loves the Malbec" gives a reason, not pressure.</li>
<li><strong>Assume the yes on the small things:</strong> "Still or sparkling?" — not "would you like water?"</li>
<li><strong>Always leave the exit open.</strong> A guest who never feels cornered orders more, not less.</li>
</ul>`,
  },
  {
    id: 'allergen-safe-service',
    level: 'intermediate', track: 'craft', emoji: '⚠️',
    title: 'Allergen-Safe Service',
    titleFr: 'Service sûr face aux allergènes', titleEs: 'Servicio Seguro ante Alérgenos',
    summary: 'The non-negotiable protocol when a guest says the word "allergy."',
    summaryFr: 'Le protocole non négociable dès qu\'un client dit « allergie ».',
    summaryEs: 'El protocolo innegociable cuando un cliente dice "alergia".',
    body: `<h3>When you hear "allergy," everything changes</h3>
<ul>
<li><strong>Never guess.</strong> "Let me confirm with the kitchen" is always the right answer.</li>
<li><strong>Flag it verbally and on the ticket.</strong> The kitchen must know before the pan is hot.</li>
<li><strong>Own the plate to the table.</strong> Don't let a runner deliver an allergy plate blind.</li>
<li><strong>Cross-contact is real.</strong> Shared fryers, tongs, and cutting boards all count.</li>
</ul>
<h3>Craft note</h3>
<p>This is the one area where warmth takes a back seat to precision. A guest's trust — and safety — is on the plate.</p>`,
  },
  {
    id: 'managing-the-rush',
    level: 'intermediate', track: 'craft', emoji: '⚡',
    title: 'Holding Grace Under the Rush',
    titleFr: 'Garder son calme dans le coup de feu', titleEs: 'Mantener la Calma en la Hora Punta',
    summary: 'Systems that keep a full section from becoming a lost section.',
    summaryFr: 'Des méthodes pour qu\'une section pleine ne devienne pas ingérable.',
    summaryEs: 'Sistemas para que una sección llena no se convierta en un caos.',
    body: `<h3>Work the section, not the table</h3>
<ul>
<li><strong>Never make a trip with empty hands.</strong> Something goes out, something comes back — every pass.</li>
<li><strong>Batch by zone, not by guest.</strong> Refill every water on the way through, not one at a time.</li>
<li><strong>Triage out loud in your head:</strong> who's waiting on food, who's waiting on you, who just needs to be seen.</li>
<li><strong>A ten-second "I've got you, back in two" buys you two minutes.</strong> Silence loses the table.</li>
</ul>`,
  },

  // ── Mastery-level references (unlock after Mastery) ────────────────────────
  {
    id: 'reading-guests-advanced',
    level: 'advanced', track: 'mastery', emoji: '🧠',
    title: 'Emotional Intelligence at the Table',
    titleFr: "L'intelligence émotionnelle à table", titleEs: 'Inteligencia Emocional en la Mesa',
    summary: 'The master-level skill — serving the person, not just the order.',
    summaryFr: 'Le savoir-faire ultime — servir la personne, pas juste la commande.',
    summaryEs: 'La habilidad maestra — servir a la persona, no solo el pedido.',
    body: `<h3>Beyond the order</h3>
<p>At the highest level, service is emotional labor done invisibly. You're managing a mood, a moment, sometimes a relationship.</p>
<ul>
<li><strong>Name the moment silently.</strong> Grief dinner, reconciliation, big promotion — each needs a different you.</li>
<li><strong>Regulate the table's energy.</strong> You can calm a tense table or lift a flat one just by how you carry yourself.</li>
<li><strong>Know when to disappear.</strong> The deepest hospitality is often absence at exactly the right time.</li>
</ul>`,
  },
  {
    id: 'difficult-situations',
    level: 'advanced', track: 'mastery', emoji: '🚫',
    title: 'Recovering the Difficult Situation',
    titleFr: 'Rattraper une situation difficile', titleEs: 'Recuperar la Situación Difícil',
    summary: 'Turning complaints, mistakes, and over-service into loyalty.',
    summaryFr: 'Transformer plaintes et erreurs en fidélité.',
    summaryEs: 'Convertir quejas y errores en lealtad.',
    body: `<h3>The recovery is the memory</h3>
<p>Guests rarely remember the flawless meal. They remember how you handled the one thing that went wrong.</p>
<ul>
<li><strong>Own it fully, fast, and without excuses.</strong> "That's on us — let me make it right."</li>
<li><strong>Fix the feeling before the food.</strong> Acknowledge the frustration first; the remade dish comes second.</li>
<li><strong>Responsible service is care, not confrontation.</strong> Slow the pour, offer food and water, involve a manager early.</li>
<li><strong>Follow through visibly.</strong> The guest needs to see the fix happen, not just hear the promise.</li>
</ul>`,
  },
  {
    id: 'leadership-on-the-floor',
    level: 'advanced', track: 'mastery', emoji: '⭐',
    title: 'Leadership on the Floor',
    titleFr: 'Le leadership en salle', titleEs: 'Liderazgo en el Salón',
    summary: 'How senior servers lift a whole shift — and build a career.',
    summaryFr: 'Comment les serveurs seniors élèvent tout un service.',
    summaryEs: 'Cómo los meseros senior elevan todo un turno.',
    body: `<h3>From server to leader</h3>
<ul>
<li><strong>Run the pre-shift in your head.</strong> Know the 86s, the VIPs, the specials — before the doors open.</li>
<li><strong>Pick up the trip nobody else saw.</strong> The best on the floor make everyone around them look good.</li>
<li><strong>Communicate up and down.</strong> Kitchen, bar, host, management — you're the connective tissue.</li>
<li><strong>Protect the culture.</strong> How you treat a new hire on a bad night defines the room more than any policy.</li>
</ul>
<h3>Craft note</h3>
<p>Mastery isn't the last module — it's the point where the work becomes a craft you own.</p>`,
  },
];

const LEVELS = ['basic', 'intermediate', 'advanced'];

/**
 * Build the gated payload for a learner.
 * @param {object} unlockedLevels - { basic, intermediate, advanced } booleans
 * @param {object} [opts] - { isAdmin } admins see everything
 */
function buildPayload(unlockedLevels = {}, opts = {}) {
  const isAdmin = !!opts.isAdmin;
  const entries = ENTRIES.map((e) => {
    const unlocked = isAdmin || !!unlockedLevels[e.level];
    const base = {
      id: e.id, level: e.level, track: e.track, emoji: e.emoji,
      title: e.title, titleFr: e.titleFr, titleEs: e.titleEs,
      locked: !unlocked,
    };
    if (unlocked) {
      base.summary = e.summary; base.summaryFr = e.summaryFr; base.summaryEs = e.summaryEs;
      base.body = e.body;
    }
    return base;
  });
  return { levels: LEVELS, unlockedLevels: { basic: !!unlockedLevels.basic, intermediate: !!unlockedLevels.intermediate, advanced: !!unlockedLevels.advanced }, entries };
}

module.exports = { ENTRIES, LEVELS, buildPayload };
