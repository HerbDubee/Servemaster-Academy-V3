'use strict';

const VOICES = {
  sofia: { id: 'dAlhI9qAHVIjXuVppzhW', name: 'Sofia' },
  luca:  { id: 'dAlhI9qAHVIjXuVppzhW', name: 'Luca'  },
};

const BOOK1_CHAPTERS = [
  { key: 'book1-ch01', file: 'Book1_Ch1_v2.md',                num: 1,  title: 'The City That Starts Without You', voice: 'sofia' },
  { key: 'book1-ch02', file: 'Book1_Ch2_v2.md',                num: 2,  title: 'Paris Precision',                  voice: 'luca'  },
  { key: 'book1-ch03', file: 'Book1_Ch3_Paris_NearMiss_v2.md', num: 3,  title: 'The Near Miss',                    voice: 'luca'  },
  { key: 'book1-ch04', file: 'Book1_Ch4_v2.md',                num: 4,  title: 'Florence Rhythm',                  voice: 'sofia' },
  { key: 'book1-ch05', file: 'Book1_Ch5_v2.md',                num: 5,  title: 'Paris Deepening',                  voice: 'luca'  },
  { key: 'book1-ch06', file: 'Book1_Ch6_v2.md',                num: 6,  title: 'The City That Shouts',             voice: 'sofia' },
  { key: 'book1-ch07', file: 'Book1_Ch7_v2.md',                num: 7,  title: 'Millimeter Work',                  voice: 'sofia' },
  { key: 'book1-ch08', file: 'Book1_Ch8_v2.md',                num: 8,  title: 'The Widower\'s Wine',              voice: 'luca'  },
  { key: 'book1-ch09', file: 'Book1_Ch9_v2.md',                num: 9,  title: 'London Borough Market',            voice: 'luca'  },
  { key: 'book1-ch10', file: 'Book1_Ch10_v2.md',               num: 10, title: 'Barcelona Farewell',               voice: 'sofia' },
  { key: 'book1-ch11', file: 'Book1_Ch11_v2.md',               num: 11, title: 'London Ikoyi',                     voice: 'luca'  },
  { key: 'book1-ch12', file: 'Book1_Ch12_v2.md',               num: 12, title: 'The Almost',                       voice: 'luca'  },
];

const BOOK2_CHAPTERS = [
  { key: 'book2-ch01', file: 'Book2_Ch1.md',  num: 1,  title: 'Tokyo / Separate Mastery',                     voice: 'sofia' },
  { key: 'book2-ch02', file: 'Book2_Ch2.md',  num: 2,  title: 'Bangkok / Heat, Tempo, Orbit',                 voice: 'luca'  },
  { key: 'book2-ch03', file: 'Book2_Ch3.md',  num: 3,  title: 'Yaowarat / Evidence',                          voice: 'luca'  },
  { key: 'book2-ch04', file: 'Book2_Ch4.md',  num: 4,  title: 'After Evidence / Daily Contact',               voice: 'sofia' },
  { key: 'book2-ch05', file: 'Book2_Ch5.md',  num: 5,  title: 'The Story Points to Her',                      voice: 'luca'  },
  { key: 'book2-ch06', file: 'Book2_Ch6.md',  num: 6,  title: 'The Faster Rhythm',                            voice: 'sofia' },
  { key: 'book2-ch07', file: 'Book2_Ch7.md',  num: 7,  title: 'Pressure Becomes Real',                        voice: 'luca'  },
  { key: 'book2-ch08', file: 'Book2_Ch8.md',  num: 8,  title: 'Futures That May Split Them',                  voice: 'sofia' },
  { key: 'book2-ch09', file: 'Book2_Ch9.md',  num: 9,  title: 'The Room Under Strain',                        voice: 'sofia' },
  { key: 'book2-ch10', file: 'Book2_Ch10.md', num: 10, title: 'Decision Cutoff / Final Singapore Evenings',   voice: 'luca'  },
  { key: 'book2-ch11', file: 'Book2_Ch11.md', num: 11, title: 'Marina Bay / First Kiss',                      voice: 'sofia' },
  { key: 'book2-ch12', file: 'Book2_Ch12.md', num: 12, title: 'Opposite Terminals',                           voice: 'sofia' },
];

const BOOK3_CHAPTERS = [
  { key: 'book3-ch01', file: 'Book3_Ch1.md',  num: 1,  title: 'The Heat Returns',                  voice: 'luca'  },
  { key: 'book3-ch02', file: 'Book3_Ch2.md',  num: 2,  title: 'Don Julio',                          voice: 'sofia' },
  { key: 'book3-ch03', file: 'Book3_Ch3.md',  num: 3,  title: 'The First Night',                    voice: 'sofia' },
  { key: 'book3-ch04', file: 'Book3_Ch4.md',  num: 4,  title: 'What We\'re Building',               voice: 'luca'  },
  { key: 'book3-ch05', file: 'Book3_Ch5.md',  num: 5,  title: 'A Day in the City',                  voice: 'luca'  },
  { key: 'book3-ch06', file: 'Book3_Ch6.md',  num: 6,  title: 'The Visa Question',                  voice: 'sofia' },
  { key: 'book3-ch07', file: 'Book3_Ch7.md',  num: 7,  title: 'Sydney',                             voice: 'luca'  },
  { key: 'book3-ch08', file: 'Book3_Ch8.md',  num: 8,  title: 'The Harbour',                        voice: 'sofia' },
  { key: 'book3-ch09', file: 'Book3_Ch9.md',  num: 9,  title: 'Melbourne',                          voice: 'sofia' },
  { key: 'book3-ch10', file: 'Book3_Ch10.md', num: 10, title: 'The Table We Want',                  voice: 'luca'  },
  { key: 'book3-ch11', file: 'Book3_Ch11.md', num: 11, title: 'The Parting',                        voice: 'luca'  },
  { key: 'book3-ch12', file: 'Book3_Ch12.md', num: 12, title: 'The Seed',                           voice: 'luca'  },
];

const BOOK4_CHAPTERS = [
  { key: 'book4-ch01', file: 'Book4_Ch1.md',  num: 1,  title: 'Arrivals',                        voice: 'sofia' },
  { key: 'book4-ch02', file: 'Book4_Ch2.md',  num: 2,  title: 'Measurement',                     voice: 'luca'  },
  { key: 'book4-ch03', file: 'Book4_Ch3.md',  num: 3,  title: 'What the Room Is Telling You',     voice: 'sofia' },
  { key: 'book4-ch04', file: 'Book4_Ch4.md',  num: 4,  title: 'How to Hold a Tray',              voice: 'luca'  },
  { key: 'book4-ch05', file: 'Book4_Ch5.md',  num: 5,  title: 'The Justice Project',             voice: 'sofia' },
  { key: 'book4-ch06', file: 'Book4_Ch6.md',  num: 6,  title: 'The First Failure',               voice: 'luca'  },
  { key: 'book4-ch07', file: 'Book4_Ch7.md',  num: 7,  title: 'The Space Between',               voice: 'sofia' },
  { key: 'book4-ch08', file: 'Book4_Ch8.md',  num: 8,  title: 'The Soft Launch',                 voice: 'luca'  },
  { key: 'book4-ch09', file: 'Book4_Ch9.md',  num: 9,  title: 'The Sommelier',                   voice: 'sofia' },
  { key: 'book4-ch10', file: 'Book4_Ch10.md', num: 10, title: 'The Beta Network',                voice: 'luca'  },
  { key: 'book4-ch11', file: 'Book4_Ch11.md', num: 11, title: 'The Thing That Tries to Take It', voice: 'sofia' },
  { key: 'book4-ch12', file: 'Book4_Ch12.md', num: 12, title: 'The Full Arc',                    voice: 'luca'  },
];

const _byKey = {};
for (const ch of [...BOOK1_CHAPTERS, ...BOOK2_CHAPTERS, ...BOOK3_CHAPTERS, ...BOOK4_CHAPTERS]) {
  if (_byKey[ch.key]) throw new Error(`Duplicate chapter key in voice-map: ${ch.key}`);
  _byKey[ch.key] = ch;
}

function getChapter(key) {
  const ch = _byKey[key];
  if (!ch) throw new Error(`Unknown chapter key: "${key}". No fallback voice is permitted.`);
  return { ...ch, voiceId: VOICES[ch.voice].id, voiceName: VOICES[ch.voice].name };
}

const BOOKS_BY_ID = { book1: BOOK1_CHAPTERS, book2: BOOK2_CHAPTERS, book3: BOOK3_CHAPTERS, book4: BOOK4_CHAPTERS };

function getAllChapters(book) {
  // No argument → default to Book 1 (backward compatibility with the
  // first-crossings reader). An explicit but unknown book id (e.g. 'book4'
  // before its content exists) returns an empty list rather than silently
  // falling back to Book 1.
  const source = book == null ? BOOK1_CHAPTERS : (BOOKS_BY_ID[book] || []);
  return source.map(ch => ({
    ...ch,
    voiceId: VOICES[ch.voice].id,
    voiceName: VOICES[ch.voice].name,
  }));
}

module.exports = { getChapter, getAllChapters, VOICES, BOOK2_CHAPTERS, BOOK3_CHAPTERS, BOOK4_CHAPTERS };
