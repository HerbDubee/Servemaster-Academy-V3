'use strict';

/**
 * Scripted role-plays — one per training module (module ids 1–30, matching
 * public/js/content.js `modules[]` and lib/tracks.js).
 *
 * Each role-play is stored in the `roleplays` table under the category
 * `module-<id>` so the training pages can serve the role-play that matches the
 * module/topic a learner is viewing (instead of the old hardcoded
 * `difficult-guests` category, which only ever surfaced the same 3 rows).
 *
 * `title` is UNIQUE in the DB, so titles here must stay distinct. Seeding uses
 * ON CONFLICT (title) DO UPDATE, so editing copy here updates the row on the
 * next server start. Keep each role-play on-topic for its module's current
 * title — if a module is renamed, revisit its role-play here.
 */

const ROLEPLAYS = [
  {
    moduleId: 1,
    title: 'The rushed lunch guest who just sat down',
    setup: 'A guest slides into a table at 12:40, glances at their watch, and has a meeting at 1:15. You are approaching for the first greeting.',
    dialogue: "Guest: Hi — I'm honestly in a bit of a rush, I've got a call at one fifteen.\nServer: Welcome in — thanks for letting me know. I'll get you looked after quickly. Can I bring you a drink while you glance at the menu, or would you like me to point you to our fastest dishes?\nGuest: The fast ones, please. I don't have time to decide.\nServer: Easy — the roast chicken and the grain bowl both fire in under ten minutes and they're excellent. Want me to put one in right now?",
    debrief: "Primary objective: Read the guest's pace in the first seconds and match it — a warm greeting is about fit, not a fixed script.\n\nWhy it matters: The opening 90 seconds set the guest's entire expectation. A time-pressed guest reads a leisurely, chatty welcome as tone-deaf; a relaxed guest reads a rushed one as cold. Great servers adjust before they finish their first sentence.\n\nPro tip: When a guest signals urgency, acknowledge it out loud ('thanks for letting me know') and immediately offer a concrete fast path. Naming two specific quick dishes removes decision fatigue and buys goodwill you'll keep for the whole visit.",
    voice_style_server: 'warm, brisk, reassuring',
    voice_style_guest: 'polite but hurried'
  },
  {
    moduleId: 2,
    title: 'The quiet couple who might be celebrating',
    setup: 'A couple is seated at a corner two-top. She has a small wrapped gift beside her plate; both are dressed up and speaking softly. They have not mentioned an occasion.',
    dialogue: "Server: Good evening, welcome in. Are we celebrating something special tonight, or just treating yourselves?\nGuest: It's actually our anniversary — five years.\nServer: Congratulations — that's wonderful. I'll make sure tonight feels like it. Would you like a quieter pace so you can take your time?\nGuest: That would be perfect, thank you.",
    debrief: "Primary objective: Gather the occasion by observation, then confirm it gently — never assume out loud until the guest hands you the cue.\n\nWhy it matters: Reading the table means collecting signals (the gift, the dress, the hushed tone) and tailoring service so guests feel understood without having to explain themselves. Getting the occasion right unlocks small touches that turn a meal into a memory.\n\nPro tip: Offer the observation as a soft, optional question ('celebrating something, or just treating yourselves?'). It invites the story without pressure — and if they say no, you've still shown attentiveness. Once confirmed, quietly flag the occasion to the kitchen and adjust your pacing.",
    voice_style_server: 'warm, perceptive, unhurried',
    voice_style_guest: 'soft-spoken, pleased'
  },
  {
    moduleId: 3,
    title: 'The table facing a 45-minute kitchen delay',
    setup: 'The kitchen is slammed and a four-top that ordered 40 minutes ago still has no mains. One guest waves you over, visibly hungry and losing patience.',
    dialogue: "Guest: We've been waiting almost forty-five minutes. What's going on with our food?\nServer: You're right, and I'm sorry — the kitchen hit a backup and your mains are running long. They're about eight minutes out now. Let me bring some warm bread and take care of your next round while you wait.\nGuest: Eight minutes, for real this time?\nServer: For real — I just checked the line myself. And the round's on me for the wait.",
    debrief: "Primary objective: Own the delay with a specific, honest timeline and a tangible gesture — never a vague 'it's coming soon.'\n\nWhy it matters: Guests forgive delays; they don't forgive feeling ignored or misled. Under high-volume pressure the instinct is to dodge the table, but the table you avoid is the table that turns hostile. Proactive, specific updates keep frustration from boiling over.\n\nPro tip: Give a real number you've verified ('I just checked the line myself') rather than a hopeful guess — a missed second estimate destroys trust completely. Pair the update with something in front of them right now (bread, a comped round) so the wait feels acknowledged, not just explained.",
    voice_style_server: 'calm, accountable, proactive',
    voice_style_guest: 'hungry and frustrated'
  },
  {
    moduleId: 4,
    title: 'Opening a bottle table-side during a rush',
    setup: 'A six-top orders a $120 bottle of Barolo on a packed Friday. You are opening and presenting it table-side while three other tables need you.',
    dialogue: "Guest: We'll take the Barolo — it's a big night for us.\nServer: Excellent choice. Let me present it before I open it — the 2019 Barolo, this is the one? \nGuest: That's the one.\nServer: Perfect. I'll open it here and pour a taste for you to approve. It's young and tightly wound, so I'd suggest letting it breathe a few minutes — I'll pour a small first round and top you up once it opens up.",
    debrief: "Primary objective: Deliver correct, unhurried wine-service ritual even when the floor is on fire — the guest should never feel your other tables.\n\nWhy it matters: Table-side wine service is theatre; a fumbled presentation or a rushed pour on an expensive bottle undercuts the whole experience the guest is paying for. Composure under pressure is the skill — the mechanics must be automatic so your calm is genuine.\n\nPro tip: Always present the label and confirm vintage before you cut the foil — it prevents the costly mistake of opening the wrong bottle. Offering a guiding note ('young, let it breathe') shows expertise and, conveniently, buys you a moment to handle your other tables between the taste and the top-up.",
    voice_style_server: 'polished, composed, knowledgeable',
    voice_style_guest: 'celebratory, expectant'
  },
  {
    moduleId: 5,
    title: 'Turning a plain order into a natural upsell',
    setup: "A guest orders a burger and a water. There's a genuine chance to enhance their experience without pushing.",
    dialogue: "Guest: I'll just do the burger and a water, thanks.\nServer: Great pick — the burger's a favourite. It comes with fries, but a lot of guests swap to the truffle parmesan ones for a couple of dollars; they're worth it. And can I get you a drink, or stick with water?\nGuest: The truffle fries sound good, actually. And maybe a local beer — what pairs well?\nServer: The amber ale — malty enough to stand up to the burger without overpowering it. Want me to bring it while the burger cooks?",
    debrief: "Primary objective: Upsell by guiding the guest to something they'll genuinely enjoy — enhancement, never pressure.\n\nWhy it matters: The subtle upsell raises the check and the guest's satisfaction at the same time, but only when it feels like a recommendation from someone who knows. A pushy or scripted upsell reads as selling and erodes trust.\n\nPro tip: Anchor the suggestion to a reason the guest cares about — flavour, popularity, pairing — not price. 'A lot of guests swap to these; they're worth it' invites, it doesn't corner. And always offer a pairing as a question, then follow with immediate action to lock it in.",
    voice_style_server: 'friendly, confident, low-pressure',
    voice_style_guest: 'casual, open to suggestions'
  },
  {
    moduleId: 6,
    title: 'Presenting and serving a bottle by the book',
    setup: 'A guest who clearly knows wine orders a bottle of white Burgundy. They are quietly watching to see if you handle the service correctly.',
    dialogue: "Guest: The Puligny-Montrachet, please.\nServer: An excellent choice. Presenting the 2021 Puligny-Montrachet — shall I open it? \nGuest: Please.\nServer: I'll pour a small taste for you first. (pours) When you're ready — and I'll serve the table before topping you up. I'm keeping it in the ice bucket to hold it right around 12 degrees; let me know if you'd prefer it a touch warmer.",
    debrief: "Primary objective: Execute the fundamentals flawlessly — present, confirm, open, offer the taste, serve host last, manage temperature.\n\nWhy it matters: Wine-service fundamentals are how a knowledgeable guest gauges the whole restaurant's competence. The order of operations isn't fussiness — presenting the label prevents mistakes, the host tastes first for quality control, and serving temperature makes or breaks the wine.\n\nPro tip: Serve the host's taste, then the rest of the table (traditionally guests before host), and top the host up last. Mentioning the serving temperature unprompted signals real expertise — and gives the guest an easy opening to tell you their preference.",
    voice_style_server: 'precise, professional, calm',
    voice_style_guest: 'knowledgeable, observant'
  },
  {
    moduleId: 7,
    title: 'Reading the guest who wants to be left alone',
    setup: 'A solo diner has a laptop open and headphones around their neck. They give short answers and keep glancing at their screen.',
    dialogue: "Server: Can I get you started with something to drink?\nGuest: Just a coffee. And I'm kind of working, so...\nServer: Say no more — I'll keep check-ins to a minimum. I'll top up your coffee quietly and you can wave me over whenever you're ready to order food.\nGuest: That's perfect, thanks.",
    debrief: "Primary objective: Read what this guest actually wants from the interaction — here, efficient invisibility — and deliver exactly that.\n\nWhy it matters: Guest psychology is about recognizing the emotional job the guest hired you for. Some want warmth and conversation; some want to be left in peace. Misreading a heads-down working guest as someone who wants friendly chatter makes them feel intruded upon.\n\nPro tip: Name the boundary back to them ('I'll keep check-ins to a minimum') so they know they've been heard and won't have to keep fending you off. Give them a clear, low-effort way to signal when they need you ('wave me over') so they can relax into their work.",
    voice_style_server: 'attentive, respectful, low-key',
    voice_style_guest: 'preoccupied, brief'
  },
  {
    moduleId: 8,
    title: 'The steak that came out overcooked',
    setup: "A guest ordered their steak medium-rare and it arrived well-done. They flag it politely but they're clearly disappointed.",
    dialogue: "Guest: Sorry to be that person, but I asked for medium-rare and this is pretty well done.\nServer: You're absolutely right to say something — that's not what you ordered, and I'm sorry. Let me get a new one fired right away, cooked properly. Can I take this back, and would you like me to hold the rest of your table's food warm, or bring yours out as soon as it's ready?\nGuest: Just bring mine when it's ready, thanks.\nServer: Done. I'll have the kitchen rush it, and I'll check back in two minutes.",
    debrief: "Primary objective: Resolve a simple complaint fast and without defensiveness — apologize, fix it, follow up.\n\nWhy it matters: Most complaints are simple and completely recoverable; how you handle them determines whether the guest remembers a mistake or remembers great recovery. Defending the kitchen or questioning the guest turns a small issue into a lost table.\n\nPro tip: Never make the guest justify the complaint — 'you're right to say something' disarms the awkwardness instantly. Offer a choice about the fix (rush it out, or hold the table's food) so the guest keeps control, then give a specific follow-up time and actually keep it.",
    voice_style_server: 'apologetic, decisive, warm',
    voice_style_guest: 'disappointed but reasonable'
  },
  {
    moduleId: 9,
    title: 'De-escalating the guest who is raising their voice',
    setup: "A guest's order was rung in wrong and they're now loudly upset at the table, drawing looks from nearby diners.",
    dialogue: "Guest: This is ridiculous! I've told you people twice and you still got it wrong!\nServer: You're right to be frustrated, and I own this — we got it wrong. Let me fix it right now. (lowers voice, steps in closer) Tell me exactly how you'd like it, and I'll make sure it's correct this time.\nGuest: I wanted it without the sauce. It's not complicated.\nServer: Without the sauce — got it. I'll walk this to the kitchen myself and stay on it. Give me five minutes and a coffee on the house while you wait?",
    debrief: "Primary objective: Lower the temperature first, solve second — validate the emotion, take ownership, and shift to calm, private problem-solving.\n\nWhy it matters: An angry guest is not looking for an explanation, they're looking to feel heard. Matching their energy or defending yourself escalates; genuine ownership and a lowered voice pull the interaction back down. De-escalation protects the guest, the room, and the team.\n\nPro tip: Physically lower your voice and step slightly closer — people instinctively match your energy, so calm is contagious. Say 'I own this' rather than 'I'm sorry you feel that way'; ownership defuses, deflection inflames. Then move immediately to a concrete fix.",
    voice_style_server: 'steady, grounded, empathetic',
    voice_style_guest: 'angry, loud at first'
  },
  {
    moduleId: 10,
    title: 'Composed presence when the room is chaos',
    setup: 'It is peak rush, tickets are backing up, and a newly seated table can sense the staff are stressed. You approach their table.',
    dialogue: "Guest: Wow, it's busy in here — are we going to be waiting forever?\nServer: (calm, unhurried) It's a full house tonight, but you're in good hands. I've got your table, and I'll take great care of you. Let's start with drinks — what can I bring you?\nGuest: Okay, you seem like you've got it handled. Two glasses of the rosé.\nServer: Two rosés coming up. I'll be back to walk you through the menu in just a moment.",
    debrief: "Primary objective: Project calm and control with your body and voice even while you're internally juggling ten things.\n\nWhy it matters: Your presence is contagious. If you look frantic, guests feel unsafe and their anxiety rises; if you move with steady purpose, they relax and trust you. Body language and tone communicate competence before a single dish arrives.\n\nPro tip: Slow your movements and your speech deliberately when you feel the rush — unhurried gestures and a lower, even voice read as 'I've got this.' Reassure with ownership ('I've got your table') rather than apologizing for being busy, which only highlights the chaos.",
    voice_style_server: 'calm, steady, confident',
    voice_style_guest: 'slightly anxious, watchful'
  },
  {
    moduleId: 11,
    title: 'Running a private dining room for twelve',
    setup: 'You are the lead server for a private room hosting a 12-person corporate dinner with a set menu. The host wants it to run seamlessly and impress their clients.',
    dialogue: "Host: I need this to go smoothly — these are important clients. Can we keep courses moving but not rushed?\nServer: Absolutely. Here's the plan: I'll synchronize each course so all twelve plates land together, pace roughly twenty minutes between courses, and I'll clear discreetly from the right. If you want to make a toast, give me a nod and I'll have everyone's glasses charged first.\nHost: That's exactly what I wanted. Thank you.\nServer: My pleasure. I'll check in with you quietly before each course so you stay in control of the timing.",
    debrief: "Primary objective: Command a private event with a clear plan — synchronized service, deliberate pacing, and discreet coordination with the host.\n\nWhy it matters: Private dining is a performance where the host is staking their reputation on your execution. Unlike à la carte, a group of twelve demands choreography: plates landing together, courses paced to the room, and the host kept informed so they can steer their own event.\n\nPro tip: Give the host the plan up front and a private signal system (a nod for toasts, a check-in before each course). It transfers a sense of control to the host, which is exactly what a nervous event host needs — and it lets you manage the timing without hovering.",
    voice_style_server: 'organized, discreet, assured',
    voice_style_guest: 'focused, quality-conscious'
  },
  {
    moduleId: 12,
    title: 'Catching the sommelier before a mistaken pour',
    setup: "The sommelier is about to serve a guest a bottle you're fairly sure is not the vintage the guest ordered. You need to flag it without undermining a senior colleague in front of the table.",
    dialogue: "Server: (quietly, aside) Chef somm — before you pour, I think table nine ordered the 2018, and this looks like the 2020. Mind if we double-check the label together?\nSommelier: ...You're right, good catch. Let me swap it.\nServer: (to guest) Apologies for the brief moment — we're just making sure you get exactly the vintage you chose. It'll be right with you.\nGuest: No problem at all — I appreciate the care.",
    debrief: "Primary objective: Protect the guest from an error while protecting your colleague's dignity — flag it privately, framed as a shared check.\n\nWhy it matters: Being right isn't enough; how you correct a senior teammate determines whether the team stays strong. Publicly contradicting the sommelier embarrasses them and rattles the guest. A discreet, collaborative catch fixes the mistake and preserves respect.\n\nPro tip: Frame the correction as 'let's check together,' not 'you're wrong' — it gives your colleague an easy, face-saving path to fix it. To the guest, reframe the pause as extra care ('making sure you get the vintage you chose') rather than confessing an error.",
    voice_style_server: 'discreet, collegial, tactful',
    voice_style_guest: 'relaxed, appreciative'
  },
  {
    moduleId: 13,
    title: 'Pacing a five-course tasting menu',
    setup: 'A two-top is doing the five-course tasting menu. One guest is a fast eater, the other slow, and you need to pace the courses so the kitchen and table stay in sync.',
    dialogue: "Guest: We're not in a rush tonight — we want to enjoy it.\nServer: Perfect, I'll pace it accordingly. I'll let each course settle before I fire the next, so you're never waiting with empty plates or rushed between them. If at any point you'd like to slow down or speed up, just say the word.\nGuest: Could we take a little breather before the main?\nServer: Of course — I'll hold the main and bring it out when you're ready. Just catch my eye.",
    debrief: "Primary objective: Control the rhythm of a multi-course meal so courses arrive at the guest's pace, not the kitchen's convenience.\n\nWhy it matters: Pacing is invisible when done well and glaring when done badly — plates that pile up feel rushed, long gaps feel forgotten. On a tasting menu the pacing IS the experience, and it requires constant communication between you, the table, and the line.\n\nPro tip: Read the slower eater to set the pace, and explicitly hand the guest a lever ('just say the word to slow down or speed up'). Fire the next course based on how the current one is going, not a fixed timer — and never fire until the table is genuinely ready.",
    voice_style_server: 'attentive, easygoing, precise',
    voice_style_guest: 'relaxed, savouring the meal'
  },
  {
    moduleId: 14,
    title: "The guest who asks 'what's good here?'",
    setup: 'A first-time guest is overwhelmed by the menu and asks the classic open question. You need to guide them confidently.',
    dialogue: "Guest: Honestly, it all looks good — what do you recommend?\nServer: Happy to steer you. Quick question: are you feeling something lighter, or a bit heartier tonight?\nGuest: Heartier, I think.\nServer: Then two I'd genuinely point you to — the braised short rib, which is our most popular for a reason, and the mushroom risotto if you want something rich but meat-free. Both are outstanding. Any dietary things I should know about?",
    debrief: "Primary objective: Turn an open-ended question into a confident, narrowed recommendation — never answer 'everything's good.'\n\nWhy it matters: Menu navigation is a core service skill: guests who feel guided order faster, happier, and often better. 'Everything's good' is a non-answer that leaves the guest exactly as lost as before; specific, honest picks build trust and drive the sale.\n\nPro tip: Ask one quick narrowing question (light vs. hearty) before recommending — it shrinks the whole menu to a manageable choice and makes your pick feel tailored. Name two genuine favourites with a vivid reason, and check for dietary needs before they have to raise it.",
    voice_style_server: 'knowledgeable, warm, decisive',
    voice_style_guest: 'undecided, trusting'
  },
  {
    moduleId: 15,
    title: 'A wine pairing on the spot during a rush',
    setup: 'A guest asks for a by-the-glass pairing for their duck main, and the floor is busy — you need a fast, confident recommendation.',
    dialogue: "Guest: I'm having the duck — what wine would you pair with it by the glass?\nServer: Great dish for a pairing. The Pinot Noir is my go-to — bright enough to cut the richness, with enough fruit to match the duck. If you'd like something bolder, the Syrah works too, but I'd lean Pinot.\nGuest: Let's do the Pinot.\nServer: Perfect choice — I'll bring it right out so it's ready when the duck lands.",
    debrief: "Primary objective: Deliver a fast, confident pairing under time pressure — one clear recommendation, with a backup only if useful.\n\nWhy it matters: Pairing under pressure tests whether your wine knowledge is deep enough to be instant. Guests want a guide, not a hedged menu of options during a busy service. A crisp, reasoned pick ('bright enough to cut the richness') sells the wine and elevates their meal.\n\nPro tip: Lead with your single best recommendation and the one-line reason it works, then offer at most one alternative. Timing the wine to arrive with the food shows you're thinking about the whole experience, not just moving product.",
    voice_style_server: 'confident, efficient, expert',
    voice_style_guest: 'curious, ready to be guided'
  },
  {
    moduleId: 16,
    title: 'The guest with a serious nut allergy',
    setup: 'A guest quietly tells you they have a severe tree-nut allergy before ordering. You must handle it with real rigour, not reassurance.',
    dialogue: "Guest: I need to mention — I have a severe tree-nut allergy. Like, epipen severe.\nServer: Thank you for telling me, that's really important and I'll take it seriously. I won't guess on anything — let me go through the dishes you're considering with the kitchen directly and confirm what's safe and how they'll avoid cross-contact. Which dishes were you looking at?\nGuest: The pesto pasta and the trout.\nServer: The pesto has pine nuts, so I'd steer you away from it. Let me confirm the trout and its sides with the chef and come right back — I won't put anything in front of you until I'm certain.",
    debrief: "Primary objective: Treat allergies as a safety issue, not a preference — never guess, verify with the kitchen, and address cross-contact.\n\nWhy it matters: A wrong answer here can send someone to the hospital. Allergen handling is where 'I think it's fine' is the single most dangerous phrase in the building. Guests with allergies need to see rigour and honesty, which also builds enormous trust.\n\nPro tip: Say explicitly that you won't guess and will confirm with the kitchen — the guest's safety depends on your humility about what you don't know. Address cross-contamination, not just ingredients, and never let a dish reach the table until you're certain. When in doubt, steer them away.",
    voice_style_server: 'serious, careful, reassuring',
    voice_style_guest: 'anxious, grateful for care'
  },
  {
    moduleId: 17,
    title: 'Coordinating a large order with the kitchen',
    setup: 'You just took a complicated order from a ten-top with three modifications and one allergy. You need to communicate it clearly to the kitchen mid-rush.',
    dialogue: "Server: (to kitchen) Firing table six, ten covers. Heads up — one severe shellfish allergy on the seafood pasta, needs a clean pan. Two burgers no onion, one steak medium instead of the menu temp. Big table, so can we fire it together?\nExpo: Copy — allergy plate flagged, clean pan, mods noted. Give me twelve minutes to fire together.\nServer: Twelve minutes, firing together, got it. I'll prep the table and come back to run it.\nExpo: Perfect.",
    debrief: "Primary objective: Communicate a complex order to the kitchen accurately and concisely — flag allergies loudly, confirm the plan, and close the loop.\n\nWhy it matters: Service is a team sport, and the ticket is where it succeeds or fails. Vague or incomplete communication with the kitchen causes remakes, delays, and dangerous mistakes. Clear, standardized callouts keep the whole floor moving as one.\n\nPro tip: Lead with the allergy and the safety step (clean pan), not buried at the end — the most critical information goes first. Confirm the kitchen's timing back to them ('twelve minutes, firing together') so both sides share the same plan, then position yourself to run the food on time.",
    voice_style_server: 'clear, efficient, team-focused',
    voice_style_guest: 'n/a (kitchen coordination)'
  },
  {
    moduleId: 18,
    title: 'Noticing the guest who is quietly unhappy',
    setup: "A guest hasn't complained, but you notice they've barely touched their plate and pushed it slightly away. They avoid eye contact when you pass.",
    dialogue: "Server: (approaching gently) I noticed the pasta isn't quite hitting the spot tonight — is everything alright with it?\nGuest: ...Honestly, it's a bit too salty for me. I didn't want to make a fuss.\nServer: I'm really glad you told me — never a fuss. Let me take that away and bring you something else, on us. Would you like to try a different dish, or a lighter version of this one?\nGuest: Maybe something lighter. Thank you for noticing.",
    debrief: "Primary objective: Read the non-verbal cues of an unhappy guest and open the door for them — many people will never complain unprompted.\n\nWhy it matters: The most damaging dissatisfaction is silent: the guest who leaves unhappy, never says why, and never returns. Reading subtle cues (an untouched plate, avoided eye contact) lets you rescue an experience the guest was quietly writing off.\n\nPro tip: Name what you observed as a gentle, low-pressure opening ('I noticed the pasta isn't quite hitting the spot') rather than the generic 'everything okay?' which invites a reflexive 'fine.' Make it clearly no trouble to speak up, and act generously once they do.",
    voice_style_server: 'observant, gentle, caring',
    voice_style_guest: 'reticent, conflict-averse'
  },
  {
    moduleId: 19,
    title: 'The guest who points out a dirty glass',
    setup: 'A guest lifts their water glass, sees a lipstick smudge from the wash, and holds it up to you with a slightly disgusted look.',
    dialogue: "Guest: Um... this glass isn't clean. There's a mark on it.\nServer: Oh — I'm sorry about that, you're right. That's not our standard. Let me take it and bring you a fresh one right away, and I'll check the rest of your glasses while I'm at it.\nGuest: Thanks. It just makes you wonder about the kitchen, you know?\nServer: Completely understandable, and I don't blame you for the thought. I'll bring you spotless glassware and we'll make sure the rest of your service is flawless.",
    debrief: "Primary objective: Treat a cleanliness slip as the visible promise it is — apologize, replace immediately, and proactively check the rest.\n\nWhy it matters: Guests judge the whole operation, including the kitchen they can't see, by the details they can touch: glassware, cutlery, menus, tables. A single dirty glass plants doubt about hygiene everywhere. Cleanliness standards are service, not back-of-house chores.\n\nPro tip: Don't just swap the one glass — proactively check and refresh the rest ('I'll check the others while I'm at it'). It shows the slip was an exception, not the norm, and heads off the guest's spiralling doubt about what else might be dirty.",
    voice_style_server: 'apologetic, thorough, reassuring',
    voice_style_guest: 'put off, slightly wary'
  },
  {
    moduleId: 20,
    title: 'Recovering after spilling wine on a guest',
    setup: "While clearing plates, you knock a half-full glass of red wine onto a guest's sleeve. The table goes quiet.",
    dialogue: "Server: I am so sorry — that was completely my fault. Let me get you some club soda and a clean cloth right now. (acts immediately) Please, let me help.\nGuest: It's my favourite shirt...\nServer: I understand, and I want to make this right. We'll cover the cleaning — let me get you our information for that, and I'll take care of your meal tonight. Again, I'm truly sorry.\nGuest: Okay... I appreciate you handling it like this.",
    debrief: "Primary objective: Own a service error instantly and completely, then move to concrete repair — no excuses, no minimizing.\n\nWhy it matters: How you recover from a mistake often leaves a stronger impression than flawless service would have. A guest who is met with immediate ownership, genuine care, and a real remedy frequently leaves more loyal than before. Deflecting or downplaying does the opposite.\n\nPro tip: Act before you finish apologizing — grab the club soda and cloth in the same breath as 'that was my fault.' Then offer tangible repair (cleaning, comping the meal) without the guest having to ask. Speed and generosity turn a disaster into a story about how well you handled it.",
    voice_style_server: 'sincerely apologetic, take-charge',
    voice_style_guest: 'startled, upset'
  },
  {
    moduleId: 21,
    title: 'Coaching the new server mid-shift',
    setup: 'A trainee you are mentoring just forgot to fire an appetizer and the table is waiting. They look panicked and are beating themselves up.',
    dialogue: "Trainee: I totally forgot to ring in their app, they've been waiting — I'm so sorry, I'm messing everything up.\nServer: Hey — breathe. This happens to everyone, including me. Here's the fix: ring it now marked as a rush, then go tell the table honestly that it's coming right up. Owning it is what makes you a pro.\nTrainee: What do I even say to them?\nServer: 'I'm sorry for the wait on your starter, it's being rushed now and it's on us.' Simple and honest. Go — I'll back you up if you need me.",
    debrief: "Primary objective: Steady the trainee, hand them a concrete fix, and turn the mistake into a teachable moment — build the server, not just patch the error.\n\nWhy it matters: Mentoring shapes whether a new server becomes confident or fearful. A panicked trainee who is criticized learns to hide mistakes; one who is coached calmly learns to own and fix them. Your response in these moments sets the culture.\n\nPro tip: Normalize the mistake first ('this happens to everyone') to drop their panic, then give a clear, ordered fix and even the exact words to say. Ending with 'I'll back you up' keeps their confidence intact so they walk to the table able to recover well.",
    voice_style_server: 'calm, encouraging, mentoring',
    voice_style_guest: 'flustered trainee'
  },
  {
    moduleId: 22,
    title: 'Closing out a table with a graceful goodbye',
    setup: 'A couple has finished a lovely meal and asked for the check. This is your last impression — the close can make or break the tip and the return visit.',
    dialogue: "Guest: That was a great meal, thank you. Can we get the check?\nServer: So glad you enjoyed it — I'll bring that right over. No rush at all; stay as long as you like. Can I get you a coffee or anything else before I do?\nGuest: Just the check, thanks.\nServer: Of course. (returns) Here you are. It was a real pleasure serving you tonight — I hope we see you again soon.",
    debrief: "Primary objective: End the interaction as warmly and attentively as it began — the close is a lasting impression, not an afterthought.\n\nWhy it matters: Guests remember beginnings and endings most. A rushed or transactional check drop can undo an otherwise great meal, while a gracious, unhurried close cements the memory and drives both the tip and the return visit.\n\nPro tip: Offer one last thing (coffee, dessert) before dropping the check, and make clear there's no rush — nothing sours a great meal like feeling flipped. Add a genuine, personal goodbye rather than a robotic 'have a good one'; sincerity in the final ten seconds pays off.",
    voice_style_server: 'warm, gracious, unhurried',
    voice_style_guest: 'satisfied, content'
  },
  {
    moduleId: 23,
    title: "The guest who can't find their wallet",
    setup: 'After the meal, a solo guest realizes they left their wallet at home and has no way to pay. They are mortified. This is an edge case that needs judgement.',
    dialogue: "Guest: This is so embarrassing — I've left my wallet at home. I don't have any way to pay right now.\nServer: It's alright, these things happen — let's figure it out together, no drama. Do you have a way to pay by phone, or could a friend send it? If not, let me get my manager, who can set up a simple way for you to settle it tomorrow.\nGuest: I could do a phone payment, actually.\nServer: Perfect, let's do that — I'll bring the terminal right over. Truly, don't worry about it.",
    debrief: "Primary objective: Handle an unusual situation with calm judgement and grace — reduce the guest's embarrassment while protecting the house.\n\nWhy it matters: Edge cases aren't in the script, so they reveal a server's real composure and judgement. A mortified guest handled with kindness becomes intensely loyal; one made to feel like a criminal never returns and tells everyone. Knowing when to involve a manager is part of the skill.\n\nPro tip: Lower the stakes immediately ('these things happen, no drama') so the guest can think clearly, then walk through options from least to most involved. Know your restaurant's policy for when to escalate to a manager, and never make the guest feel accused while you protect the business.",
    voice_style_server: 'calm, kind, resourceful',
    voice_style_guest: 'embarrassed, anxious'
  },
  {
    moduleId: 24,
    title: 'Taking charge when a section falls apart',
    setup: "A coworker is in the weeds, two tables are unhappy, and the floor is tipping toward chaos. You're the most senior server on and need to lead.",
    dialogue: "Coworker: I'm drowning — I've got two tables mad and I can't keep up.\nServer: I've got you. Take a breath. You handle drinks and check-backs on your top three tables; I'll run food and reset the two upset ones. (to upset table) Folks, I'm jumping in to get you sorted right now — here's what's happening and here's how I'll fix it.\nGuest: Finally, someone's on it.\nServer: On it now. Two minutes and you'll have everything you're waiting for.",
    debrief: "Primary objective: Step into leadership under pressure — stabilize your teammate, triage the floor, and take direct ownership of the worst tables.\n\nWhy it matters: Leadership on the floor isn't a title, it's what you do when the shift is collapsing. A senior server who organizes the chaos — dividing tasks, calming teammates, personally handling the hottest tables — saves the whole service. Freezing or blaming makes it worse.\n\nPro tip: Give your struggling teammate a narrowed, specific job ('drinks and check-backs on your top three') so they can succeed instead of flailing at everything. Take the hardest tables yourself and lead with a plan the guest can hear — visible command reassures both staff and guests.",
    voice_style_server: 'decisive, calm, commanding',
    voice_style_guest: 'relieved, impatient'
  },
  {
    moduleId: 25,
    title: 'Bridging the bar and the table for a cocktail order',
    setup: 'A guest wants a cocktail recommendation to start and another to pair with dessert. You need to coordinate timing with the bar so drinks land right.',
    dialogue: "Guest: I'd like a cocktail to start, and maybe something with dessert later — surprise me.\nServer: Love it. To start, our barrel-aged Negroni is a standout — bittersweet and not too heavy before dinner. For dessert, I'll have the bar do an espresso martini or an amaro, depending on how you're feeling by then. Sound good?\nGuest: The Negroni now, and we'll decide on dessert later.\nServer: Perfect — I'll fire the Negroni with the bar now, and I'll time the dessert drink so it arrives with the sweets, not before.",
    debrief: "Primary objective: Integrate bar service into the meal — recommend well and coordinate timing so drinks complement each course.\n\nWhy it matters: Bar service integration means the cocktails aren't an afterthought bolted onto the food — they're paced and paired as part of one experience. A server who bridges the bar and the table (right drink, right moment) raises both the check and the guest's enjoyment.\n\nPro tip: Recommend cocktails with the meal's arc in mind — something lighter to start, something to close — and communicate timing to the bar so drinks land with the course they're meant for, never stranded early. Coordinating that timing is the difference between a drink order and a beverage experience.",
    voice_style_server: 'enthusiastic, knowledgeable, coordinated',
    voice_style_guest: 'adventurous, open'
  },
  {
    moduleId: 26,
    title: 'A regular VIP arrives without a reservation',
    setup: 'A well-known regular who tips generously walks in on a fully booked night expecting to be accommodated, with a guest they want to impress.',
    dialogue: "Guest: Evening! I know I didn't call ahead, but I've brought someone special — can you work your magic?\nServer: Wonderful to see you — and welcome to your guest. We're fully committed tonight, but let me see what I can do; give me two minutes. (returns) I've arranged a spot at our chef's counter, which honestly might be the best seat in the house tonight. Will that work?\nGuest: That's perfect — you always take care of me.\nServer: Always. I'll make sure tonight is one to remember for both of you.",
    debrief: "Primary objective: Make a VIP feel uniquely valued without overpromising or breaking the room — find a genuine solution, framed as special.\n\nWhy it matters: Handling VIPs gracefully protects a relationship that drives loyalty and word of mouth. But 'graceful' isn't blind accommodation; it's making the guest feel prioritized while being honest about constraints and creative within them.\n\nPro tip: Never flatly say 'we're full' to a valued regular — buy a moment ('give me two minutes') and return with a real option reframed as a perk ('the best seat in the house tonight'). If you truly can't accommodate, be honest and offer the next best thing so they still feel prioritized rather than turned away.",
    voice_style_server: 'gracious, warm, resourceful',
    voice_style_guest: 'confident, expecting special treatment'
  },
  {
    moduleId: 27,
    title: 'Staying warm while flipping a packed section fast',
    setup: 'You have a full section on a Saturday night and management needs tables turned quickly, but guests must never feel rushed or like a number.',
    dialogue: "Guest: We're ready for the check whenever — no rush though, it's been lovely.\nServer: So happy to hear it. I'll bring it over so it's ready when you are, absolutely no pressure to hurry. Can I tempt you with a coffee or a dessert to go while you finish up?\nGuest: A dessert to go sounds great, actually.\nServer: Perfect — I'll box up the chocolate tart and have your check ready. Thank you both so much for coming in tonight.",
    debrief: "Primary objective: Move efficiently and turn tables without the guest ever feeling processed — speed hidden inside warmth.\n\nWhy it matters: High-volume nights demand turns, but a guest who feels rushed leaves resentful no matter how good the food was. The elite skill is being quick and efficient while every guest still feels like the only table you have. Warmth is what makes the speed invisible.\n\nPro tip: Create gentle momentum without pressure — dropping the check 'so it's ready when you are' and offering dessert-to-go nudges the turn while keeping the guest in control. Never let your efficiency read as impatience; a sincere thank-you at the close keeps a fast turn feeling gracious.",
    voice_style_server: 'warm, efficient, genuine',
    voice_style_guest: 'relaxed, appreciative'
  },
  {
    moduleId: 28,
    title: 'Serving a celebrity who wants privacy',
    setup: 'A recognizable public figure is dining with a small party and clearly wants discretion. Other guests and staff are starting to notice.',
    dialogue: "Guest: We'd really appreciate keeping things low-key tonight, if that's possible.\nServer: Absolutely — that's exactly how we'll handle it. I'll be your only point of contact, I'll keep approaches minimal, and I'll make sure the team gives you space. If anyone becomes intrusive, just signal me and I'll manage it discreetly.\nGuest: Thank you, that's a relief.\nServer: My pleasure. Enjoy your evening — you're in good hands and no one will make a thing of it.",
    debrief: "Primary objective: Deliver flawless, discreet service under the added pressure of visibility — protect the guest's privacy and composure.\n\nWhy it matters: High-pressure VIP and celebrity service adds a layer most shifts don't have: managing attention, staff excitement, and the guest's need to feel normal. The guest is paying, in part, for you to make the room's awareness disappear.\n\nPro tip: Reduce touchpoints — become the single point of contact so the guest deals with one calm professional, not a parade of star-struck staff. Proactively offer a discreet signal for intrusions, and brief your team to stay cool. Treating them as a normal guest is the highest compliment you can pay.",
    voice_style_server: 'composed, discreet, unfazed',
    voice_style_guest: 'guarded, seeking normalcy'
  },
  {
    moduleId: 29,
    title: 'Lifting the energy of a flat, quiet room',
    setup: 'It is an early, sparse evening. The dining room feels dead, and a couple who just arrived seems to feel the low energy. You can shape the room.',
    dialogue: "Guest: It's pretty quiet in here tonight, huh?\nServer: It's the calm before the rush — which honestly means you get the best of us tonight: unhurried attention, first pick of the specials, and the quiet corner. Let me get some music and warmth going for you. What are you two in the mood for?\nGuest: When you put it that way, this sounds perfect.\nServer: That's the spirit. Let's make it a great night — starting with a drink you'll love.",
    debrief: "Primary objective: Sense the room's energy and actively shape it — reframe a slow night as a perk and inject warmth rather than mirroring the flatness.\n\nWhy it matters: Reading and shaping the room means you're not just reacting to the atmosphere, you're influencing it. A server who absorbs a dead room's low energy amplifies it; one who brings genuine warmth and reframes the quiet lifts the whole guest experience.\n\nPro tip: Turn the perceived negative into a real positive ('quiet means you get the best of us') — guests take their emotional cue from your framing. Small environmental levers (music, lighting, your own energy) plus enthusiastic attention can transform how a sparse room feels.",
    voice_style_server: 'upbeat, warm, energizing',
    voice_style_guest: 'underwhelmed at first, won over'
  },
  {
    moduleId: 30,
    title: 'Turning a first-time guest into a regular',
    setup: 'A guest mentions it is their first visit and that they just moved to the neighbourhood. You have a chance to plant the seeds of a long-term relationship.',
    dialogue: "Guest: This is our first time here — we just moved in down the street.\nServer: Welcome to the neighbourhood, and to us — we're glad you found us. I'm Alex, and I'll take good care of you tonight. If you like tonight, we do a great weekend brunch and a Tuesday wine night the locals love. But first, let me make this dinner one that makes you want to come back.\nGuest: We'll definitely remember you, Alex.\nServer: I'll remember you too — next time, ask for my section and I'll look after you.",
    debrief: "Primary objective: Move beyond a single transaction toward a lasting relationship — personal connection, memory, and a reason to return.\n\nWhy it matters: Long-term guest relationship building is what turns a good restaurant into someone's restaurant. Regulars are the backbone of the business, and they're created one memorable, personal interaction at a time — starting the moment a first-timer walks in.\n\nPro tip: Exchange names and use theirs — a personal connection is what a guest remembers. Plant a specific, low-pressure reason to return ('Tuesday wine night the locals love') and invite them back to you personally ('ask for my section'). People return for people, not just food.",
    voice_style_server: 'warm, personable, genuine',
    voice_style_guest: 'friendly, new to the area'
  }
];

module.exports = { ROLEPLAYS };
