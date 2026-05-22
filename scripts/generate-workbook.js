'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT_DIR  = path.join(__dirname, '../books/workbooks');
const OUT_FILE = path.join(OUT_DIR, 'book1-workbook.pdf');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  black:    '#0a0a0a',
  white:    '#f9f5ef',
  cream:    '#f2ece0',
  gold:     '#b8963e',
  goldDark: '#8a6f28',
  ink:      '#1a1208',
  muted:    '#6b5e4a',
  rule:     '#d4c4a0',
  bg:       '#faf7f2',
};

// ── Content ───────────────────────────────────────────────────────────────────
const CHAPTERS = [
  {
    num: 1,
    title: 'The City That Starts Without You',
    location: 'Florence, Italy — Gucci Osteria da Massimo Bottura',
    summary: `Sofia Vale arrives in Florence for her first shift at Gucci Osteria (one Michelin star, Chef Karime López). Under floor manager Elena, she saves a tray of tortellini mid-service using instinct she didn't know she'd built, oversees a Barolo presentation at an anniversary table, and wins over a six-year-old with a kitchen detour. By the time she cycles home along the Arno, "technique" has become something she owns rather than follows.`,
    mc: [
      {
        q: 'Elena presents the 2016 Barolo Castiglione as:',
        opts: ['A long recitation of its technical profile', 'A brief story, offered to the room — not at it', 'A formal pairing recommendation with the menu', 'A question about the guests\' regional preferences'],
        ans: 1,
        explain: 'Elena offers the wine with a brief story rather than a recitation, inviting the couple in rather than lecturing them. The wife leans forward. That lean is the goal.'
      },
      {
        q: 'The correct sequence for pouring wine at a restaurant table is:',
        opts: ['Left to right regardless of seating', 'Host first, then clockwise', 'Clockwise from the right, host last', 'Ladies first, then gentlemen'],
        ans: 2,
        explain: 'Pour clockwise from the right, beginning with the first guest to the host\'s right, saving the host for last. This lets the host confirm the wine is correct before their guests are served.'
      },
      {
        q: 'Sofia\'s tray save worked because she:',
        opts: ['Slowed down and called for help', 'Passed the tray to a nearby busser', 'Snapped her elbow to her ribs, threw her hip weight left, and kept moving forward', 'Set the tray down on the nearest surface immediately'],
        ans: 2,
        explain: 'The save was a body response — elbow in, hip counter-shift — executed in under a second without stopping. Stopping would have made it worse. The key was that the technique had been practiced until it became reflex, not decision.'
      },
      {
        q: 'Elena\'s Barolo was described as pairing beautifully tonight with:',
        opts: ['The risotto allo zafferano', 'The tortellini in brodo', 'The vitello (veal)', 'The amuse bouche'],
        ans: 2,
        explain: '"Beautiful tonight with the vitello" — Elena offers the pairing as something alive and present, not a rote fact. The word "tonight" makes it feel like a discovery.'
      }
    ],
    scenario: `A six-year-old at table eight pushes away his amuse bouche with maximum drama. His mother is mortified. Three surrounding tables hold their breath.\n\nUsing Sofia's approach as a model, walk through exactly what you do — step by step, from the moment you notice the tension forming. Explain why each move matters.`,
    checklist: [
      'I can carry a full service tray and correct a tilt without stopping or drawing attention',
      'I pour clockwise from the right, saving the host for last',
      'I read a table\'s pace and emotional state before I reach it',
      'I describe wine as a brief story offered to the room — not a sales pitch at the guest',
      'When a child creates tension in the dining room, I work with the child, not around them',
    ]
  },
  {
    num: 2,
    title: 'Paris Precision',
    location: 'Paris, France — Plénitude at Hôtel Cheval Blanc (Three Michelin Stars)',
    summary: `Luca Voss, a Munich-trained server shaped equally by his engineer father's precision and his Amalfi mother's instinct for reading people, is three months into a stage at Plénitude. At table nine, he manages a high-stakes dinner for a Lyonnais tech executive and his Tokyo associate. When the pigeon course is delayed two minutes, Luca doesn't wait — he bridges the table with a 2015 Clos de Tart, turning the gap into a gift. After service he writes three words in his notebook: "Precision and warmth. Not opposites."`,
    mc: [
      {
        q: 'When the kitchen pings a two-minute delay on the main course, Luca\'s correct move is:',
        opts: ['Go to the table immediately and apologize for the wait', 'Say nothing and allow the natural pause to extend', 'Offer a bridge wine without framing it as compensation for a delay', 'Offer a complimentary dessert course at the end'],
        ans: 2,
        explain: 'A bridge wine makes the delay invisible. Luca doesn\'t say "I\'m sorry, kitchen is behind" — he says "allow me a bridge." The table never experiences a delay. They experience a bonus.'
      },
      {
        q: 'The Clos de Tart is from which appellation?',
        opts: ['Gevrey-Chambertin', 'Chambolle-Musigny', 'Morey-Saint-Denis', 'Pommard'],
        ans: 2,
        explain: 'Clos de Tart is a grand cru monopole in Morey-Saint-Denis, Côte de Nuits. Luca describes it as "violet and earth, nothing heavy" — precise but accessible language that doesn\'t exclude Sato-san.'
      },
      {
        q: 'How does Luca present the bottle of 1998 Lafite to Monsieur Laurent?',
        opts: ['Upright, with the label facing outward', 'Horizontally, label angled toward the light so Laurent can confirm', 'Already opened and resting in a decanter', 'From a wine cart, label-down in a cradle'],
        ans: 1,
        explain: 'Presenting the bottle horizontally with the label in the light invites the guest to confirm their choice. It\'s a small gesture of respect — the final decision stays with them.'
      },
      {
        q: 'After completing the pour at table nine, Luca retreats how many paces?',
        opts: ['One pace, staying within reach', 'Two paces, close but not hovering', 'Five paces, to the far wall', 'He stays tableside until Laurent nods'],
        ans: 1,
        explain: 'Two paces. Close enough to read the table, far enough not to crowd it. Proximity without presence is the goal — available but not intrusive.'
      }
    ],
    scenario: `The kitchen tells you the main course for your best table is running six minutes late. The host — a sharp-eyed executive — has already glanced at his watch twice.\n\nYou have a strong wine list and a well-stocked amuse station. Walk through exactly what you say, how you frame it, and what you physically do at the table. Why does your approach work better than a simple apology?`,
    checklist: [
      'I know how to offer a bridge wine or bite without mentioning the delay',
      'I present bottles horizontally with the label toward the guest',
      'I can identify which wines on my list work as mid-meal bridges',
      'I pour clockwise, host last, with a clean twist at the finish',
      'I retreat two paces after pouring and read the table with peripheral attention',
    ]
  },
  {
    num: 3,
    title: 'The Near Miss',
    location: 'Paris, France — Pont des Arts / Jardin du Luxembourg',
    summary: `Sofia and Luca are in the same city but never quite connect — she sketches his restaurant's windows from the Pont des Arts at dusk while he runs past; they shelter under neighbouring café awnings in a Luxembourg rainstorm but don't cross the ten feet between them. Each encounter leaves a trace: a silhouette in a sketchbook, a notebook entry, the persistent feeling of having seen something you recognise but can't name.`,
    mc: [
      {
        q: 'Sofia\'s months in service have transformed the habit of reading people into:',
        opts: ['A conscious checklist she runs at every table', 'A professional skill she can switch off outside of work', 'An involuntary reflex she applies everywhere — trains, queues, café windows', 'A technique she uses only in fine-dining contexts'],
        ans: 2,
        explain: '"You couldn\'t un-learn it." Real service awareness becomes ambient — it stops being a professional tool and starts being how you experience the world.'
      },
      {
        q: 'Luca\'s mother Rosaria\'s philosophy of service was:',
        opts: ['"Systems work cleaner alone"', '"You learn or you don\'t"', '"Precision before warmth, always"', '"Arrive early; leave last"'],
        ans: 1,
        explain: 'A Amalfi-born woman who could read a stranger\'s mood from across a terrace — her entire teaching was this single sentence. It\'s an observation about the nature of hospitality, not a rule.'
      },
      {
        q: 'Elena "offers the wine to the room, not at the room." What does this mean in practice?',
        opts: ['Speaking loudly enough for all guests within earshot', 'Making the description feel like shared discovery rather than a sales pitch', 'Avoiding direct eye contact while presenting the bottle', 'Letting the host make all wine decisions without input'],
        ans: 1,
        explain: 'The distinction is the posture of the offer. "At the room" is a pitch — "to the room" is an invitation. The guests feel they\'re discovering something, not being sold to.'
      },
      {
        q: 'In hospitality, sensing what a guest needs before they articulate it is called:',
        opts: ['Reactive service', 'Anticipatory service', 'Prescriptive service', 'Passive attentiveness'],
        ans: 1,
        explain: 'Anticipatory service is the hallmark of Michelin-level hospitality — the need is met before it becomes a request. Luca builds this from observation; Sofia has it as instinct.'
      }
    ],
    scenario: `A guest at your station has glanced toward the kitchen three times in two minutes. They haven't said a word. Nothing is technically wrong — their water is full, their napkin is fine.\n\nWhat are your options? What do you do first, and why? What does this look like if you get it right versus if you get it wrong?`,
    checklist: [
      'I read a table\'s energy before I reach it — pace, posture, eye movement',
      'I describe wine as an invitation, not a presentation',
      'I can distinguish when a guest needs attention versus when they need space',
      'I stay slightly ahead of the meal\'s rhythm, not behind it',
      'I act on what I observe even before it\'s been said',
    ]
  },
  {
    num: 4,
    title: 'Florence Rhythm',
    location: 'Florence, Italy — Gucci Osteria (six months in)',
    summary: `Sofia has found her footing. The chapter follows a full day — pre-dawn market run, Mercato Centrale with old Giuseppe, lunch and dinner service. At table eleven, an unhappy guest declares his risotto "stone cold." Sofia listens fully, asks one question before doing anything, replaces the dish, and adds four glasses of amaro Nonino as an unannounced gift. He leaves twenty percent. Post-shift drinks with Paolo and Maria. A call with Avó.`,
    mc: [
      {
        q: 'When the guest at table eleven holds his fork over his risotto and declares it cold, Sofia\'s first move is:',
        opts: ['Immediately apologise and take the plate to the kitchen', 'Explain that risotto is always served at a specific temperature', 'Ask "When did you notice it cooling?" — then listen fully before responding', 'Signal Marco and let the floor manager handle it'],
        ans: 2,
        explain: 'The question disarms the complaint. He was braced for an excuse. Instead he\'s given space to be heard. Sofia doesn\'t interrupt, doesn\'t nod too quickly — she just receives it. That\'s the whole move.'
      },
      {
        q: 'Amaro Nonino is best described as:',
        opts: ['A sparkling aperitivo from Friuli', 'A bitter alpine digestif with grappa base', 'A light, dry white wine', 'A sweet dessert wine'],
        ans: 1,
        explain: 'Amaro Nonino is a bitter herbal digestif with a grappa base, produced in Friuli. Amber, fragrant, complex. Sofia brings it as a gift — not as a comp, and certainly not announced as one.'
      },
      {
        q: 'Sofia returns the replacement dish with four amaro glasses. She delivers this by:',
        opts: ['Announcing it as a complimentary gesture for the inconvenience', 'Setting the glasses down as if this had always been part of the evening\'s plan', 'Asking the table\'s permission before pouring', 'Handing the amaro only to the complaining guest'],
        ans: 1,
        explain: 'A comp announced as a comp is a transaction. A comp delivered as a gift is hospitality. The word "complimentary" never appears. The amaro simply arrives, amber and warm, as though the meal had always included it.'
      },
      {
        q: 'Brunello di Montalcino — moved at three tables during the evening service — is a wine from:',
        opts: ['Tuscany', 'Piedmont', 'Veneto', 'Umbria'],
        ans: 0,
        explain: 'Brunello di Montalcino is a DOCG from the hills of Montalcino in Tuscany, made from Sangiovese Grosso. It\'s one of Italy\'s most age-worthy reds.'
      }
    ],
    scenario: `A guest sends back a pasta course, saying it\'s overcooked. You\'ve been watching the kitchen struggle tonight — the printer died at 8 p.m. and they\'ve been calling tickets by memory.\n\nHow do you handle the table — what do you say and what is your tone? What do you say to the kitchen afterward, and how do you frame it?`,
    checklist: [
      'I receive a complaint without deflecting, over-apologising, or interrupting',
      'I listen fully — eye contact, no nod until the guest is finished — before I respond',
      'I know what a recovery gesture looks like: small, unannounced, delivered as a gift',
      'I never use the word "complimentary" when delivering a comp',
      'I follow up with the kitchen constructively — not as blame, but as information',
    ]
  },
  {
    num: 5,
    title: 'Paris Deepening',
    location: 'Paris, France — Table at 12 rue de Prague (Bruno Verjus)',
    summary: `Luca trials at Bruno Verjus's restaurant Table — twelve covers, ingredient-obsessed, the philosophical opposite of Plénitude. He arrives expecting to deploy his architecture of precision and quickly realises it's the floor, not the ceiling. His colleague Camille silently delivers warm bread to a table bracing for a kitchen delay, and Luca notices the gap between seeing a problem and solving it. Verjus's debrief: "Precision is the frame. Empathy fills it."`,
    mc: [
      {
        q: 'Verjus\'s philosophy at Table is captured in the line:',
        opts: ['Speed above all else — covers per hour is what matters', 'Systems running cleanly produce warmth automatically', '"Precision is the frame. Empathy fills it."', '"Warmth without structure collapses under pressure"'],
        ans: 2,
        explain: 'For Verjus, precision doesn\'t replace humanity — it creates the conditions for it. The technically correct service creates a frame; the human connection is what fills that frame with meaning.'
      },
      {
        q: 'Camille solves the kitchen delay at table five by:',
        opts: ['Apologising and offering a small discount on the bill', 'Asking the couple if they\'d prefer to start the cheese course early', 'Placing warm rye bread silently, as though it had always been planned', 'Flagging the kitchen and asking them to expedite'],
        ans: 2,
        explain: 'No apology, no acknowledgment that there is a delay. Just bread, warm, appearing at the right moment. The table never experiences a wait — they experience a gift. Luca sees the problem; Camille solves it.'
      },
      {
        q: 'Verjus evaluates produce — including the radishes — primarily by:',
        opts: ['Measuring diameter against a size chart', 'Tasting and listening for whether it "sings" — a subjective aliveness', 'Checking colour against a reference card', 'Calling the farmer and asking about growing conditions'],
        ans: 1,
        explain: '"Feel it. Does it sing?" Verjus is teaching sensory authority — trust your palate over the spec sheet. Luca tries to measure; then he eats the radish. The measurement becomes irrelevant.'
      },
      {
        q: 'When Luca writes "Precision and warmth. Not opposites" at the end of Chapter 2, he means:',
        opts: ['Empathy can replace precision when dealing with upset guests', 'Technical excellence and human connection reinforce each other', 'You must choose one depending on the restaurant\'s style', 'Warmth is for guests; precision is for the kitchen'],
        ans: 1,
        explain: 'This is the book\'s central thesis, first articulated quietly after Chapter 2\'s service. Precision without warmth is cold; warmth without precision is chaos. Each makes the other possible.'
      }
    ],
    scenario: `You\'re across the room when you notice a guest\'s shoulders drop slightly. She\'s been waiting for her main. Nothing has been said, nothing is technically wrong — her water is full.\n\nYou haven\'t been called. Your manager hasn\'t signalled. What do you do, when do you do it, and how do you explain your decision afterward at the debrief?`,
    checklist: [
      'I can identify when a guest\'s body signals a need before they speak it',
      'I deliver a bridge — bread, amuse, tisane — without framing it as a delay acknowledgment',
      'I understand the difference between observing a problem and solving it',
      'I act within my station on instinct, without waiting for direction',
      'I can articulate my service decisions in a post-shift debrief',
    ]
  },
  {
    num: 6,
    title: 'The City That Shouts',
    location: 'Barcelona, Spain — Quimet i Quimet (Est. 1914)',
    summary: `Sofia moves to Barcelona and stages at Quimet i Quimet — a standing-room tapas bar that's been family-run since 1914, twenty square meters, turning twenty covers an hour at peak. No tables. No menu as such. Speed-first, read the eyes not the mouths, and carry four glasses in your arms simultaneously. Then: evenings at Le Cordon Bleu Barcelona, wine foundations, late nights in the Gothic Quarter. And at the end, Quim himself tells her to apply to Disfrutar.`,
    mc: [
      {
        q: 'Quimet i Quimet has been family-run since:',
        opts: ['1814', '1914', '1952', '1978'],
        ans: 1,
        explain: 'Founded in 1914 on Carrer del Poeta Cabanyes, now run by the fourth generation. A standing-room institution — no tables, no reservations, no apologies.'
      },
      {
        q: 'When a tourist couple stares at the conservas shelf "delighted but slightly overwhelmed," Sofia:',
        opts: ['Hands them a written menu and gives them time', 'Asks what kind of fish they usually enjoy', 'Brings razor clams without being asked — and watches their faces shift', 'Calls Quim over to handle the table'],
        ans: 2,
        explain: 'She reads the uncertainty as a request for guidance and acts on it before they have to ask. This is anticipatory service at a tapas bar — no words needed, just the right thing arriving at the right moment.'
      },
      {
        q: '"Conservas" at a Spanish bar like Quimet i Quimet refers to:',
        opts: ['House-made pickled vegetables', 'Premium tinned seafood and preserved produce', 'Spanish cured meats sliced to order', 'A style of tapas presentation on small ceramic plates'],
        ans: 1,
        explain: 'Conservas are premium tinned and jarred seafood — razor clams, spider crab, sea urchin, cockles, anchovies. At Quimet, they line floor-to-ceiling shelves and are considered serious product, not convenience food.'
      },
      {
        q: 'On her last shift, Quim\'s parting advice to Sofia is to apply to:',
        opts: ['El Bulli (Ferran Adrià\'s legendary restaurant)', 'Tickets (Albert Adrià\'s Barcelona spot)', 'Disfrutar (three stars, Oriol Castro\'s team)', 'La Boqueria (the central market)'],
        ans: 2,
        explain: '"You got the speed." Quim is pointing her from his world — controlled chaos, instinct — toward the precision end of the spectrum. Disfrutar\'s three-star kitchen operates at the millimeter scale.'
      }
    ],
    scenario: `A guest at your tapas bar speaks no Spanish, has never been before, and is frozen in front of the menu. You have a full bar, twelve people queued behind them, and thirty seconds.\n\nWhat do you do — exactly? What do you say (or not say), what do you bring, and how do you make them feel like the best thing that\'s happened to them today?`,
    checklist: [
      'I can assess a customer\'s familiarity level within the first three seconds',
      'I guide a choice confidently and warmly without overwhelming or condescending',
      'I carry multiple items simultaneously in tight, standing-room spaces',
      'I recover tray balance without stopping, drawing attention, or breaking stride',
      'I maintain accuracy during speed — I don\'t sacrifice one for the other',
    ]
  },
  {
    num: 7,
    title: 'Millimeter Work',
    location: 'Barcelona, Spain — Disfrutar (Three Michelin Stars)',
    summary: `Sofia stages at Disfrutar under Javier and Carla, serving Oriol Castro's tasting menu — deconstructed paella, birch sap spheres, a nitro-frozen espuma tower that melts tableside in fifteen seconds. The kitchen operates at millimeter precision; "silence means awe — don't interrupt awe." In the tenth shift, a shoulder clip nearly sends the espuma down. Sofia catches it with a two-handed save she'd never drilled. The German couple doesn't notice. Javier sees everything: "Millimeter save."`,
    mc: [
      {
        q: 'Carla\'s instruction — "silence means awe, don\'t interrupt awe" — means:',
        opts: ['Keep speaking during placement to fill any silence', 'After placing a transforming course, step back and let the moment happen at its own pace', 'Check in every ninety seconds during a dramatic course', 'Ask the guest if they\'re enjoying the experience'],
        ans: 1,
        explain: 'The espuma tower melts. The sphere bursts. The consommé shifts color. The guest\'s silence is their pleasure, not their confusion. Walking back in with words breaks the spell.'
      },
      {
        q: 'The "liquid forest" progression at Disfrutar consists of:',
        opts: ['Three cocktails with foraged botanicals', 'Birch sap spheres, moss gelée in porcelain hollows, and a nitro-frozen espuma tower', 'A sequence of forest mushroom dishes', 'A tableside smoke infusion over three courses'],
        ans: 1,
        explain: 'Three courses that build as a narrative arc: birch sap (cold, effervescent), moss gelée (still, earthy), espuma tower (dramatic transformation into mushroom consommé in fifteen seconds).'
      },
      {
        q: 'The espuma tower\'s key service challenge is that:',
        opts: ['It must be consumed immediately before the guest speaks', 'Contact with any surface will permanently deflate it', 'Temperature change begins a fifteen-second timed transformation — the guest watches it happen', 'It must be kept upright in a magnetic cradle until placement'],
        ans: 2,
        explain: '"Mushroom forest mist — melts in fifteen." The clock starts when it hits the table\'s warmth. Sofia announces it, steps back, and lets the transformation happen. Her job at the table is already done.'
      },
      {
        q: 'Sofia\'s espuma save involved:',
        opts: ['Calling for help from Carla, who stabilised the tray', 'Setting the tray down on the nearest surface and composing herself', 'A two-handed correction — thumb driving the tray edge, free hand\'s pinky feathering under the espuma base', 'Slowing her pace and leaning against the service trolley'],
        ans: 2,
        explain: 'She\'d never drilled this specific geometry, but the body knew it. Quimet gave her speed; Florence gave her the tray reflex. Disfrutar required both at once, at a precision she hadn\'t encountered before.'
      }
    ],
    scenario: `You\'re serving a course that transforms visibly at the table — a frozen element that melts, a gel that dissolves, a sauce poured tableside. You have one sentence of announcement before the transformation begins, then you need to step back.\n\nWrite out exactly what you say. Then explain why every word earns its place — and what you deliberately chose not to say.`,
    checklist: [
      'I can adjust my physical technique from tapas-bar speed to fine-dining millimeter precision',
      'I know when silence is the best service I can offer',
      'I announce a course transformation clearly, then get out of its way',
      'I distinguish the silence of pleasure from the silence of confusion',
      'I rehearse physical placement in an empty dining room before service begins',
    ]
  },
  {
    num: 8,
    title: 'The Widower\'s Wine',
    location: 'Paris, France — Le Gabriel at La Réserve (Two Michelin Stars)',
    summary: `Luca has moved to Le Gabriel — 28 covers, intimate, the guests here come because they are lonely. Raoul says so plainly. Luca keeps a notebook of regular guests' preferences and emotional states. Monsieur Henriot, a widower, dines every Thursday at 20:02. Over three weeks Luca has quietly pieced together that Henriot's late wife loved Chassagne-Montrachet. One Thursday, without being asked, Luca brings the bottle. Henriot says "She would have liked this room." Luca retreats and doesn't look back for twelve minutes.`,
    mc: [
      {
        q: 'Why does Luca bring Monsieur Henriot the Chassagne-Montrachet?',
        opts: ['It\'s on promotion and fits Henriot\'s spending habits', 'He\'s overheard Henriot mention a vineyard visit, and Raoul confirmed Henriot\'s wife loved this wine', 'It\'s the most expensive white on the list and Henriot always orders well', 'Henriot requested it via the reservation notes'],
        ans: 1,
        explain: 'Luca pieces this together from fragments over three weeks — a passing mention, information from Raoul, careful observation. He never asked directly. The gift works because it came from genuine attention, not data.'
      },
      {
        q: 'Chassagne-Montrachet is:',
        opts: ['A red Burgundy from the Côte de Nuits', 'A white Burgundy from the Côte de Beaune', 'A Champagne-method sparkling wine from the Mâconnais', 'A Loire Valley Chenin Blanc'],
        ans: 1,
        explain: 'Chassagne-Montrachet is a premier and grand cru village appellation on the Côte de Beaune, producing some of Burgundy\'s finest Chardonnays. The 2014 Luca brings has bergamot and hazelnut notes.'
      },
      {
        q: 'After presenting the wine and pouring two fingers for Henriot, Luca:',
        opts: ['Stays tableside and talks through the wine\'s complete tasting profile', 'Retreats two paces and doesn\'t look back for twelve minutes', 'Returns after three minutes to ask if everything is satisfactory', 'Waits at arm\'s length in case Henriot wants to speak'],
        ans: 1,
        explain: '"Henriot deserved those twelve minutes to sit with whatever the wine had opened in him." The work is done. Returning too soon would interrupt something private.'
      },
      {
        q: 'Raoul tells Luca: "The guests here come because they\'re lonely." The practical implication for service is:',
        opts: ['Offer companionship and conversation as part of the service experience', 'Maintain strict professional distance to avoid crossing into personal territory', 'A guest\'s emotional state shapes what they actually need tonight — read it and respond accordingly', 'Always ask about personal circumstances during the amuse course'],
        ans: 2,
        explain: 'Not companionship, not prying — awareness. Knowing that Henriot is lonely doesn\'t mean Luca talks more. It means he reads what Henriot needs that evening, which turns out to be a specific bottle and then space.'
      }
    ],
    scenario: `A solo guest has eaten in your section every Thursday for a month. You\'ve noticed: they always order the same wine, they eat slowly, they look at the room a lot. Tonight they seem heavier somehow — quieter than usual.\n\nHow do you serve this person? What might you bring that you haven\'t been asked for? What do you leave completely alone?`,
    checklist: [
      'I keep notes on regular guests\' preferences, patterns, and emotional tells',
      'I know the difference between a personal touch that lands and one that intrudes',
      'I give space after a meaningful gesture — I don\'t hover to watch it land',
      'I understand that some guests come for the room as much as the food',
      'I use memory as a form of welcome — quietly, without announcing what I\'ve noticed',
    ]
  },
  {
    num: 9,
    title: 'London Borough Market',
    location: 'London, UK — Ikoyi at St James\'s Market / Borough Market',
    summary: `Luca has transferred to London and is staging at Ikoyi — two Michelin stars, West African cuisine, a flavor profile he has never studied. He adapts: off-dry Riesling for scotch bonnet heat, chilled sorrel tisane as a palate bridge. At Borough Market on a Saturday, he stands at the oyster stall next to a woman writing pairing notes in her notebook. He reads them — they're excellent — has a thought about finger lime, opens his mouth, and his phone goes off. He leaves a single oyster shell on the ledge.`,
    mc: [
      {
        q: 'For West African dishes with layers of scotch bonnet heat, Luca\'s pairing choice is:',
        opts: ['A tannic red Bordeaux to match the dish\'s intensity', 'An off-dry Riesling, whose residual sweetness cools the heat', 'An oaked Chardonnay to complement the richness', 'Champagne to cleanse the palate between bites'],
        ans: 1,
        explain: 'Residual sugar in an off-dry Riesling soothes capsaicin heat. Tannins in a red would amplify the burn. This is one of the most practical pairings in modern hospitality — heat + sweetness = relief.'
      },
      {
        q: 'The Whitstable rock oyster Sofia tastes at Borough Market is described as having:',
        opts: ['A creamy, buttery finish with hints of brie', 'A sharp citrus and black pepper profile', 'Sea brine, a green melon mid-note, and a chalk mineral finish', 'A clean, neutral flavor with no particular mineral character'],
        ans: 2,
        explain: 'Sofia writes: "sea brine, green melon, chalk finish." Luca reads the same notes upside-down. The writing\'s quality is part of what makes him stop — she\'s using the syntax of someone who thinks in flavors.'
      },
      {
        q: 'For the plantain gnocchi with fermented shrimp butter at Ikoyi, Luca\'s pairing is:',
        opts: ['White Burgundy (Chardonnay)', 'South African Chenin Blanc', 'Australian Riesling', 'Spanish Albariño'],
        ans: 1,
        explain: 'South African Chenin Blanc — stone fruit to echo the caramelised edge of the plantain, enough acidity to cut the fermented shrimp butter. It\'s a cross-cultural pairing that works because of flavor logic, not geography.'
      },
      {
        q: 'The sorrel tisane Luca serves at Ikoyi is described as:',
        opts: ['A warm tea service between courses', 'Hibiscus and pineapple leaf, chilled, used as a palate-reset bridge', 'A cold-brew coffee served after dessert', 'A house shrub made from Nigerian palm wine'],
        ans: 1,
        explain: 'Hibiscus acidity and pineapple-leaf brightness served cold — it\'s the same logic as a wine bridge: interrupt the build of spice heat before it peaks, without stopping the momentum of the meal.'
      }
    ],
    scenario: `You\'re working a restaurant whose cuisine is outside your training — you\'ve never studied these flavor profiles. A guest asks what wine to pair with the chef\'s signature dish.\n\nHow do you navigate this honestly, without losing the guest\'s confidence? What do you say? What does intellectual honesty look like in a service context — and how is it different from admitting you don\'t know?`,
    checklist: [
      'I know that off-dry whites (Riesling, Chenin Blanc) cool heat rather than amplify it',
      'I taste every dish on the menu before I recommend a pairing for it',
      'I can explain a pairing in plain, sensory language — not technical jargon',
      'I adapt my wine knowledge to unfamiliar cuisines using flavor logic, not geography',
      'When I\'m learning, I frame it as curiosity — not as a gap I\'m hiding',
    ]
  },
  {
    num: 10,
    title: 'Barcelona Farewell',
    location: 'Barcelona, Spain — Le Cordon Bleu Barcelona / Quimet i Quimet final shift',
    summary: `Sofia passes her Le Cordon Bleu sommelier exam with 98% — a Distinction. She describes the Rioja while pouring it (black cherry, vanilla oak, tannins that cut fat) in the language of truth, not performance. Three seconds of stillness first. Then the farewell shift at Quimet i Quimet: the whole crew, conservas jars glowing under bare bulbs, Quim hugging her and saying "mi americana con alma española." She packs her sketchbook and flies to London.`,
    mc: [
      {
        q: 'Sofia describes the Rioja as pairing well with jamón because:',
        opts: ['They come from the same region and share terroir characteristics', 'The wine\'s tannins cut the fat of the cured meat — a structural pairing', 'It\'s the lightest red on the list and won\'t overwhelm the flavour', 'The producer specifically recommends it in their tasting notes'],
        ans: 1,
        explain: '"Black cherry, vanilla oak, the tannins cut the fat of the jamón" — structural pairing logic: the tannin in the wine binds to the fat protein in the jamón, cleansing the palate for the next bite. This is why red wine and charcuterie work.'
      },
      {
        q: 'At the exam station, the correct timing for a service description is:',
        opts: ['Speak first, then pour — so the guest knows what\'s coming', 'Begin speaking while you pour — description concurrent with the first pour', 'Pour all glasses first, then describe — so guests have the wine as you speak', 'Let the guest smell the bottle before any verbal description'],
        ans: 1,
        explain: 'Description concurrent with pouring — the language and the wine arrive together. It\'s a single sensory event, not a presentation followed by a pour. Elena taught Sofia this in Florence.'
      },
      {
        q: 'Priorat is a wine region located in:',
        opts: ['The Rioja DOC, near Logroño', 'Castile-La Mancha, in central Spain', 'Catalonia, in north-eastern Spain', 'Andalusia, near Jerez'],
        ans: 2,
        explain: 'Priorat (or Priorato) is a DOCa in Catalonia known for intense, mineral red wines from old Grenache and Carignan vines grown in llicorella (slate) soils. Sofia pairs it with octopus at the exam.'
      },
      {
        q: 'Sofia\'s three-second stillness before beginning her exam pour is:',
        opts: ['Visible nerves that the examiner notes as a negative', 'An Elena technique: look before you pour — the stillness is about reading the room', 'A mandatory Le Cordon Bleu exam requirement', 'An improvised delay to compose herself'],
        ans: 1,
        explain: '"Look before you pour." Sofia has done this at the start of every service since Florence. It started as a floor-reading habit; at the exam it becomes its own small statement of readiness.'
      }
    ],
    scenario: `You\'re at an exam station. The brief: describe and pour a Rioja. You have the bottle, the glass, a host, and thirty seconds before your first pour.\n\nWrite out your full description — what you say, how you say it, when you pour. Then list three things you deliberately chose not to say, and why.`,
    checklist: [
      'I can describe a wine in flavor, texture, and pairing terms without notes',
      'I speak concurrent with the pour — description and action arrive together',
      'I know the basic structural pairing logic: tannins cut fat, acidity cuts richness',
      'I maintain eye contact while pouring — I trust my hands without watching them',
      'I accept a 98% as information, not ego — and go back to find the 2%',
    ]
  },
  {
    num: 11,
    title: 'London Ikoyi',
    location: 'London, UK — Ikoyi at St James\'s Market',
    summary: `Six weeks in, Luca has a storytelling breakthrough. Jeremy Chan's instruction: "Food without story is fuel — tell them where it swam, who harvested it." At table eight, Luca narrates the plantain's journey from Accra markets to grass-fed tallow fry. The woman says "I've never been to Accra." He says "You taste it now." That exchange is the whole chapter. He stays out for dumplings with Kwame and Elena afterward — two months ago he would have left at 23:45 exactly.`,
    mc: [
      {
        q: 'Jeremy Chan\'s instruction to Luca about service narration is:',
        opts: ['"Get the technical description right and everything else follows"', '"Food without story is fuel — tell them where it swam, who harvested it"', '"Precision must come before personality at all times"', '"Let the guest lead; your job is to respond"'],
        ans: 1,
        explain: 'Not decoration — information. The story of an ingredient is its reason for existing on the plate. When Luca tells the guest about Accra\'s dawn markets and Kano\'s yaji spice route, the dish becomes an experience of place, not just taste.'
      },
      {
        q: 'The suya lamb shoulder\'s yaji spice rub originates in:',
        opts: ['Lagos', 'Kano', 'Abuja', 'Accra'],
        ans: 1,
        explain: 'Kano, in northern Nigeria, is the heartland of suya culture and the yaji spice blend — grains of paradise, grains of Selim, alligator pepper, peanuts toasted street-side. Geography is flavor here.'
      },
      {
        q: '"Egusi" — used in the sauce at Ikoyi — is:',
        opts: ['A Nigerian fermented pepper and palm oil sauce', 'A smoked dried fish used as a seasoning', 'Ground melon seed, cooked into a rich, earthy sauce with depth and sweetness', 'A West African fresh herb similar to basil'],
        ans: 2,
        explain: 'Egusi seeds come from a variety of melon grown across West Africa. When ground and cooked, they produce a thick sauce with earthy, slightly sweet, and savory depth — a key ingredient in Nigerian and West African cooking.'
      },
      {
        q: 'When Luca tells the guest "You taste it now," he is demonstrating:',
        opts: ['The power of closing a sale with confidence', 'How storytelling transfers a sense of place — the guest experiences Accra through the dish', 'A sales technique recommended by Ikoyi management', 'How to handle a guest who is unfamiliar with the cuisine'],
        ans: 1,
        explain: '"I\'ve never been to Accra." "You taste it now." This is the whole point of provenance storytelling: the food becomes a vehicle for transport. Precision delivered what Chan called "the thing itself."'
      }
    ],
    scenario: `Choose a dish from your current menu — or invent one. Write your full tableside narration for it: the ingredient\'s origin, how it was grown or raised, what the technique does to it, and what the guest will experience.\n\nKeep it under 45 seconds spoken aloud. Then annotate it: for each sentence, explain why it earns its place and what you cut.`,
    checklist: [
      'I know the provenance of every dish on my current menu — farm, region, technique',
      'I can tell an ingredient\'s story in 30 seconds without it sounding like a pitch',
      'I read whether a guest wants the story before I start telling it',
      'I understand the difference between storytelling and performing',
      'I connect the story to what the guest is about to experience on the plate',
    ]
  },
  {
    num: 12,
    title: 'The Almost',
    location: 'London, UK — Honourable Artillery Company, Armoury Lane',
    summary: `At a hospitality mixer in London, Sofia and Luca are steered toward each other by their respective colleagues. They meet, shake hands, begin a conversation. He notices her calluses match his. She thinks: "I've seen that half-smile before." He is composing the right question — Paris? Barcelona? The market? — when the fire alarm goes off. Two hundred people evacuate. They end up twenty meters apart across a rain-soaked lane, looking at each other for three seconds before a fire truck drives between them. He goes home and writes: "Not yet."`,
    mc: [
      {
        q: 'When Luca takes Sofia\'s hand for the first time, he notices:',
        opts: ['That it\'s cold and formally professional, as expected', 'A softness that surprises him given her reputation', 'That her calluses match his — tray work, bottle work, the specific friction of the job', 'That she\'s watching him more than the conversation'],
        ans: 2,
        explain: '"Callused in the places that matched his." The handshake is a form of recognition — two people who have done the same work, in the same way, for years. The body knows before the mind catches up.'
      },
      {
        q: 'Luca\'s final notebook entry for the chapter is:',
        opts: ['"Florence. Natural awareness. Variable."', '"HAC. Three seconds. Armoury Lane."', '"Precision and warmth. Not opposites."', '"Paris precision. Keep working."'],
        ans: 1,
        explain: '"HAC. Three seconds. Armoury Lane." Below the entry from months ago that started as a professional observation, now something else entirely. The last two words of the novel are "not yet" — which is both an ending and a beginning.'
      },
      {
        q: 'Sofia recognises Luca across the rain-soaked lane because:',
        opts: ['Clara tells her just before the alarm goes off', 'She recognises his running shoes from the Pont des Arts', 'She knows it the way a chord resolves — not with argument, but with the whole body', 'His name badge is still attached from the event'],
        ans: 2,
        explain: 'The recognition doesn\'t come from the face — she never drew his face. She recognises the quality of presence: the precise hands, the way he holds his shoulders, the laugh she heard at La Boqueria. The body knows the pattern before the mind has filed the evidence.'
      },
      {
        q: 'In hospitality, "offering to the room rather than at the room" describes a service posture where:',
        opts: ['The server speaks loudly enough for all guests to hear', 'The presentation feels like shared discovery rather than a sales pitch directed at one person', 'The server allows guests to serve themselves from a central platter', 'The maître d\' makes all wine decisions on behalf of the table'],
        ans: 1,
        explain: 'This phrase appears first in Chapter 1 and anchors the book\'s service philosophy. The difference between a pitch and an invitation is entirely in the posture of the person making it.'
      }
    ],
    scenario: `Think about a service moment from your own work — or one described in the novel — where everything was technically correct, but something felt missing.\n\nWhat was absent? What would "precision with soul" have looked like in that moment? Use at least one specific example from First Crossings to frame your answer.`,
    checklist: [
      'I understand the difference between executing service and being genuinely present in it',
      'I can describe what "precision with soul" looks like in a real shift',
      'I can name one character moment from First Crossings I want to carry into my own work',
      'I know the one thing I want to practise most after reading this book',
      'I have written down something from this workbook worth keeping',
    ]
  }
];

// ── Answer key ────────────────────────────────────────────────────────────────
// Each chapter × 4 questions, answer index (0-based) + short explanation already in CHAPTERS above.
// Compiled to answer-key page at the back.

// ── PDF builder ───────────────────────────────────────────────────────────────
const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  info: {
    Title:    'First Crossings — Companion Workbook',
    Author:   'ServeMaster Academy',
    Subject:  'Hospitality training companion to First Crossings (Book 1)',
    Keywords: 'hospitality, wine, service, Michelin, training',
  }
});

const stream = fs.createWriteStream(OUT_FILE);
doc.pipe(stream);

// ── Helpers ───────────────────────────────────────────────────────────────────
const W  = 612 - 144; // usable width
const LH = 14;        // base line height

function rule(y, color = C.rule) {
  doc.save().moveTo(72, y).lineTo(540, y).strokeColor(color).lineWidth(0.5).stroke().restore();
}

function checkRemaining(needed = 80) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function sectionLabel(text) {
  checkRemaining(40);
  doc.moveDown(0.8)
     .fontSize(7.5).fillColor(C.gold).font('Helvetica-Bold')
     .text(text.toUpperCase(), { letterSpacing: 1.5, characterSpacing: 1.5 });
  doc.moveDown(0.3);
}

function bodyText(text, opts = {}) {
  doc.fontSize(10).fillColor(C.ink).font('Helvetica')
     .text(text, { lineGap: 3, ...opts });
}

function smallText(text, opts = {}) {
  doc.fontSize(8.5).fillColor(C.muted).font('Helvetica')
     .text(text, { lineGap: 2, ...opts });
}

// ── Cover page ────────────────────────────────────────────────────────────────
doc.rect(0, 0, 612, 792).fill(C.black);

doc.fillColor(C.gold).fontSize(9).font('Helvetica')
   .text('SERVEM ASTER ACADEMY', 72, 72, { characterSpacing: 3 });

doc.fillColor(C.white).fontSize(42).font('Helvetica-Bold')
   .text('First', 72, 160, { lineGap: 6 })
   .text('Crossings', 72, 202);

doc.fillColor(C.gold).fontSize(14).font('Helvetica')
   .text('Companion Workbook', 72, 268);

doc.moveTo(72, 300).lineTo(200, 300)
   .strokeColor(C.gold).lineWidth(1).stroke();

doc.fillColor(C.muted).fontSize(10).font('Helvetica')
   .text('Exercises, wine pairings, and service scenarios\ndrawn from each of the twelve chapters.', 72, 316, { lineGap: 5 });

doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
   .text('Answers at the back.', 72, 370);

doc.fillColor('#333').fontSize(8).font('Helvetica')
   .text('servemasteracademy.ca', 72, 720, { characterSpacing: 0.5 });

// ── How to use this workbook ──────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, 612, 792).fill(C.bg);

doc.fillColor(C.gold).fontSize(9).font('Helvetica-Bold')
   .text('HOW TO USE THIS WORKBOOK', 72, 72, { characterSpacing: 1.5 });
rule(90);

doc.moveDown(1).fontSize(11).fillColor(C.ink).font('Helvetica-Bold')
   .text('Each chapter has three parts:', 72);

doc.moveDown(0.7);
const parts = [
  ['Knowledge Check', 'Four multiple-choice questions drawn from wine, service technique, and the chapter\'s setting. There is always one best answer — the others represent common mistakes or partial truths.'],
  ['Scenario Prompt', 'An open-ended situation drawn from the chapter\'s key service moment. There\'s no single right answer, but there are better and worse ones. Write freely, then review against your own experience.'],
  ['Skills Checklist', 'Five statements about the chapter\'s core skills. Rate yourself honestly: tick what you own, circle what you\'re working on. Return to this page after your next shift.'],
];

for (const [title, desc] of parts) {
  checkRemaining(50);
  doc.fontSize(10).fillColor(C.gold).font('Helvetica-Bold').text(`► ${title}`, 72);
  doc.fontSize(10).fillColor(C.ink).font('Helvetica').text(desc, 84, doc.y, { width: W - 12, lineGap: 3 });
  doc.moveDown(0.6);
}

doc.moveDown(1);
rule(doc.y);
doc.moveDown(0.8);
doc.fontSize(10).fillColor(C.ink).font('Helvetica')
   .text('Answers to the Knowledge Check questions are in the Answer Key at the back of this workbook, with a brief explanation of why each answer is correct and what makes the wrong answers wrong.', 72, doc.y, { width: W, lineGap: 3 });

// ── Chapter pages ──────────────────────────────────────────────────────────────
for (const ch of CHAPTERS) {
  doc.addPage();
  doc.rect(0, 0, 612, 792).fill(C.bg);

  // Chapter header
  doc.fillColor(C.gold).fontSize(8.5).font('Helvetica-Bold')
     .text(`CHAPTER ${ch.num}`, 72, 72, { characterSpacing: 1.5 });
  doc.fillColor(C.ink).fontSize(18).font('Helvetica-Bold')
     .text(ch.title, 72, 88, { width: W });

  const afterTitle = doc.y + 4;
  doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
     .text(ch.location, 72, afterTitle);

  rule(doc.y + 8);

  // Summary
  sectionLabel('Chapter Summary');
  bodyText(ch.summary, { width: W, lineGap: 4 });

  // Knowledge check
  sectionLabel('Knowledge Check');
  doc.moveDown(0.3);

  for (let qi = 0; qi < ch.mc.length; qi++) {
    const q = ch.mc[qi];
    checkRemaining(90);
    doc.fontSize(10).fillColor(C.ink).font('Helvetica-Bold')
       .text(`${qi + 1}.  ${q.q}`, 72, doc.y, { width: W, lineGap: 3 });
    doc.moveDown(0.3);

    const labels = ['A)', 'B)', 'C)', 'D)'];
    for (let oi = 0; oi < q.opts.length; oi++) {
      doc.fontSize(10).fillColor(C.ink).font('Helvetica')
         .text(`${labels[oi]}  ${q.opts[oi]}`, 88, doc.y, { width: W - 16, lineGap: 2 });
    }
    doc.moveDown(0.7);
  }

  // Scenario
  checkRemaining(100);
  sectionLabel('Service Scenario');
  doc.fontSize(10).fillColor(C.ink).font('Helvetica-Bold')
     .text(ch.scenario, 72, doc.y, { width: W, lineGap: 4 });

  // Response lines
  doc.moveDown(0.8);
  for (let i = 0; i < 8; i++) {
    const ly = doc.y + 4;
    if (ly + 16 < doc.page.height - doc.page.margins.bottom) {
      doc.moveTo(72, ly).lineTo(540, ly).strokeColor(C.rule).lineWidth(0.4).stroke();
      doc.moveDown(1.1);
    }
  }

  // Checklist
  checkRemaining(120);
  sectionLabel('Skills Checklist');
  smallText('Tick what you own · Circle what you\'re working on · Leave blank what you haven\'t started', { width: W });
  doc.moveDown(0.5);

  for (const item of ch.checklist) {
    checkRemaining(22);
    const cy = doc.y + 1;
    // Checkbox
    doc.save()
       .rect(72, cy, 10, 10)
       .strokeColor(C.rule).lineWidth(0.8).stroke()
       .restore();
    doc.fontSize(9.5).fillColor(C.ink).font('Helvetica')
       .text(item, 90, cy, { width: W - 18, lineGap: 2 });
    doc.moveDown(0.6);
  }

  // Footer
  doc.fontSize(8).fillColor(C.muted).font('Helvetica')
     .text(`Chapter ${ch.num}  ·  First Crossings Companion Workbook  ·  servemasteracademy.ca`,
            72, doc.page.height - 54, { align: 'center', width: W });
}

// ── Answer key ────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, 612, 792).fill(C.black);

doc.fillColor(C.gold).fontSize(9).font('Helvetica-Bold')
   .text('ANSWER KEY', 72, 72, { characterSpacing: 2 });
doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
   .text('Knowledge Check\nAnswers', 72, 92, { lineGap: 6 });
doc.fillColor(C.muted).fontSize(10).font('Helvetica')
   .text('With explanations.', 72, 148);

doc.moveTo(72, 168).lineTo(200, 168).strokeColor(C.gold).lineWidth(1).stroke();

// Answer columns
const LABELS = ['A', 'B', 'C', 'D'];
let y = 192;
const colW = 220;
const gutter = 20;
let col = 0;

for (const ch of CHAPTERS) {
  const blockH = 16 + ch.mc.length * 60; // estimate
  if (y + blockH > doc.page.height - 72) {
    if (col === 0) {
      col = 1;
      y = 192;
    } else {
      doc.addPage();
      doc.rect(0, 0, 612, 792).fill(C.black);
      doc.fillColor(C.gold).fontSize(8).font('Helvetica-Bold')
         .text('ANSWER KEY (continued)', 72, 72, { characterSpacing: 1.5 });
      col = 0;
      y = 96;
    }
  }

  const xBase = col === 0 ? 72 : 72 + colW + gutter;

  // Chapter label
  doc.fillColor(C.gold).fontSize(8).font('Helvetica-Bold')
     .text(`CH. ${ch.num} — ${ch.title.toUpperCase()}`, xBase, y, { width: colW, characterSpacing: 0.5 });
  y += 14;

  for (let qi = 0; qi < ch.mc.length; qi++) {
    const q = ch.mc[qi];
    const correct = LABELS[q.ans];

    // Question number + answer letter
    doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold')
       .text(`${qi + 1}.  Answer: ${correct}  —  ${q.opts[q.ans]}`, xBase, y, { width: colW, lineGap: 1 });
    y += 12;

    // Explanation
    doc.fillColor('#aaa').fontSize(7.5).font('Helvetica')
       .text(q.explain, xBase + 8, y, { width: colW - 8, lineGap: 1 });
    y += doc.heightOfString(q.explain, { width: colW - 8, fontSize: 7.5 }) + 8;
  }
  y += 12;
}

// ── Back cover ────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, 612, 792).fill(C.black);

doc.fillColor(C.gold).fontSize(30).font('Helvetica-Bold')
   .text('Keep going.', 72, 300);
doc.fillColor(C.muted).fontSize(11).font('Helvetica')
   .text('ServeMaster Academy — Training the next generation\nof hospitality professionals.', 72, 350, { lineGap: 5 });
doc.fillColor('#333').fontSize(8.5).font('Helvetica')
   .text('servemasteracademy.ca', 72, 720, { characterSpacing: 0.5 });

// ── Finalise ──────────────────────────────────────────────────────────────────
doc.end();
stream.on('finish', () => {
  const size = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
  console.log(`✓  Workbook written → ${OUT_FILE}  (${size} KB)`);
});
stream.on('error', err => { console.error('PDF write error:', err); process.exit(1); });
