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
  { key: 'book2-ch01', file: 'Book2_Ch1.md', num: 1, title: 'The City That Asks Everything',   voice: 'sofia' },
  { key: 'book2-ch02', file: 'Book2_Ch2.md', num: 2, title: 'The Weight of Getting It Right',  voice: 'luca'  },
  { key: 'book2-ch03', file: 'Book2_Ch3.md', num: 3, title: 'The Shape of the Room',           voice: 'sofia' },
  { key: 'book2-ch04', file: 'Book2_Ch4.md', num: 4, title: 'The Temperature of the Room',     voice: 'luca'  },
];

const _byKey = {};
for (const ch of [...BOOK1_CHAPTERS, ...BOOK2_CHAPTERS]) {
  if (_byKey[ch.key]) throw new Error(`Duplicate chapter key in voice-map: ${ch.key}`);
  _byKey[ch.key] = ch;
}

function getChapter(key) {
  const ch = _byKey[key];
  if (!ch) throw new Error(`Unknown chapter key: "${key}". No fallback voice is permitted.`);
  return { ...ch, voiceId: VOICES[ch.voice].id, voiceName: VOICES[ch.voice].name };
}

function getAllChapters(book) {
  const source = book === 'book2' ? BOOK2_CHAPTERS : BOOK1_CHAPTERS;
  return source.map(ch => ({
    ...ch,
    voiceId: VOICES[ch.voice].id,
    voiceName: VOICES[ch.voice].name,
  }));
}

module.exports = { getChapter, getAllChapters, VOICES, BOOK2_CHAPTERS };
