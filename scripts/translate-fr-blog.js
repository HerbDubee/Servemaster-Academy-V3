const fs = require('fs');
const path = require('path');
const OpenAI = require('openai').default;

const srcDir = path.join(__dirname, '../public/blog');
const frDir = path.join(__dirname, '../public/blog/fr');
const files = fs.readdirSync(frDir).filter(f => f.endsWith('.html'));

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

function escapeHtmlAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsonStr(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function extractFieldsFromEnglish(file) {
  const srcPath = path.join(srcDir, file);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  WARN: English source not found for ${file}`);
    return null;
  }
  const html = fs.readFileSync(srcPath, 'utf8');

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const introPMatch = html.match(/<p class="text-zinc-400 text-lg[^"]*">([^<]+)<\/p>/i);

  const rawTitle = titleMatch ? titleMatch[1] : '';
  const articleTitle = rawTitle
    .replace(/\s*[–—-]\s*ServeMaster Academy\s*$/, '')
    .trim();

  return {
    title: articleTitle,
    description: descMatch ? descMatch[1] : '',
    h1: h1Match ? h1Match[1].trim() : '',
    intro: introPMatch ? introPMatch[1].trim() : '',
  };
}

async function translateBatch(items) {
  const prompt = `You are a native-level professional French translator specializing in hospitality industry content for a Canadian audience (Québec/Canadian French). Translate the following JSON array from English to French with grammatically perfect, natural, idiomatic French.

Critical grammar rules:
- Respect gender agreement: "la réinitialisation" (f), "un pourboire" (m), "une table" (f), etc.
- Never produce constructions like "comme le s'attend" — use idiomatic alternatives like "à la hauteur de la haute cuisine" or "selon les standards de la haute cuisine"
- Use "dont" (not "que") after "se souvenir de": "les détails dont les clients se souviennent"
- Avoid literal word-for-word translation; aim for natural Canadian French
- Keep "ServeMaster Academy" as-is (brand name, do not translate)
- Use only standard straight double quotes in your JSON output

Return ONLY a valid JSON array with fields: title, description, h1, intro. No explanations, no markdown.

${JSON.stringify(items, null, 2)}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a native-level professional French translator for Canadian hospitality content. Produce grammatically correct, idiomatic Québec/Canadian French. Return only valid JSON using standard straight double quotes.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

function applyTranslations(frHtml, frTitle, frDesc, frH1, frIntro) {
  const frTitleSafe = escapeHtmlAttr(frTitle);
  const frDescSafe = escapeHtmlAttr(frDesc);
  const frH1Safe = escapeHtmlAttr(frH1);
  const frIntroSafe = escapeHtmlAttr(frIntro);
  const frTitleJson = escapeJsonStr(frTitle);

  const suffixedTitle = `${frTitleSafe} – ServeMaster Academy`;

  frHtml = frHtml.replace(
    /<title>[^<]+<\/title>/i,
    `<title>${suffixedTitle}</title>`
  );

  frHtml = frHtml.replace(
    /(<meta name="description" content=")[^"]*(")/i,
    `$1${frDescSafe}$2`
  );

  frHtml = frHtml.replace(
    /(<meta property="og:title" content=")[^"]*(")/i,
    `$1${suffixedTitle}$2`
  );

  frHtml = frHtml.replace(
    /(<meta property="og:description" content=")[^"]*(")/i,
    `$1${frDescSafe}$2`
  );

  frHtml = frHtml.replace(
    /(<h1[^>]*>)([^<]+)(<\/h1>)/i,
    `$1${frH1Safe}$3`
  );

  frHtml = frHtml.replace(
    /(<p class="text-zinc-400 text-lg[^"]*">)([^<]+)(<\/p>)/i,
    `$1${frIntroSafe}$3`
  );

  frHtml = frHtml.replace(
    /("position": 3,\s*\n\s*"name": ")[^"]*(")/,
    `$1${frTitleJson}$2`
  );

  return frHtml;
}

async function main() {
  console.log(`Found ${files.length} French blog articles to translate.\n`);

  const BATCH_SIZE = 10;
  let translated = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    const batchData = [];
    for (const file of batch) {
      const fields = extractFieldsFromEnglish(file);
      if (!fields) { errors++; continue; }
      batchData.push({ file, ...fields });
    }

    if (batchData.length === 0) continue;

    const itemsToTranslate = batchData.map(({ title, description, h1, intro }) => ({
      title, description, h1, intro
    }));

    console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1}: articles ${i + 1}–${Math.min(i + BATCH_SIZE, files.length)}...`);

    let translations;
    try {
      translations = await translateBatch(itemsToTranslate);
    } catch (err) {
      console.error(`  ERROR translating batch: ${err.message}`);
      errors += batchData.length;
      continue;
    }

    for (let j = 0; j < batchData.length; j++) {
      const { file } = batchData[j];
      const t = translations[j];

      if (!t) {
        console.error(`  SKIP: no translation returned for ${file}`);
        errors++;
        continue;
      }

      const filePath = path.join(frDir, file);
      let frHtml = fs.readFileSync(filePath, 'utf8');

      try {
        frHtml = applyTranslations(frHtml, t.title, t.description, t.h1, t.intro);
        fs.writeFileSync(filePath, frHtml, 'utf8');
        console.log(`  OK: ${file} → "${t.title}"`);
        translated++;
      } catch (err) {
        console.error(`  ERROR applying to ${file}: ${err.message}`);
        errors++;
      }
    }

    if (i + BATCH_SIZE < files.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\nDone. Translated: ${translated}, Errors: ${errors}`);

  console.log('\n--- Validation ---');
  let validationErrors = 0;
  for (const file of files) {
    const frHtml = fs.readFileSync(path.join(frDir, file), 'utf8');
    const titleMatch = frHtml.match(/<title>([^<]+)<\/title>/i);
    const introMatch = frHtml.match(/<p class="text-zinc-400 text-lg[^"]*">([^<]+)<\/p>/i);
    const schemaMatch = frHtml.match(/"position": 3,\s*\n\s*"name": "([^"]+)"/);

    const isEnglishTitle = /^(How |The |What |Why |When |Managing|Building|Understanding|Mastering|An |A |From |For |Let |Seven|Eight|Ten |Twenty|Serving|Navigating|Handling|Running|Closing|Reading|Writing|Spotting|Turning|Carrying|Getting|Presenting|Hosting|Taking|Pre-|Staff|Body|Slow|Seasonal|Rookie|Speed|Shift|Split|Batch|Bar |Pour |Garnish|Glassware|Ice |Modern|Bilingual|Essential|Perfect|Premium|Winning|Natural|Setting)/i.test(titleMatch ? titleMatch[1] : '');

    const isEnglishIntro = introMatch && /^[A-Za-z]/.test(introMatch[1]) && !/^[A-ZÀ-ÿ]/.test(introMatch[1].match(/^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ]/)?.[0] || '');

    if (!titleMatch || isEnglishTitle) {
      console.error(`  VALIDATION FAIL (title): ${file} → "${titleMatch ? titleMatch[1] : 'missing'}"`);
      validationErrors++;
    }
    if (!introMatch) {
      console.error(`  VALIDATION FAIL (intro not found): ${file}`);
      validationErrors++;
    }
    if (!schemaMatch) {
      console.error(`  VALIDATION FAIL (schema name not found): ${file}`);
      validationErrors++;
    }
  }
  if (validationErrors === 0) {
    console.log('All articles passed basic validation.');
  } else {
    console.log(`${validationErrors} validation issues found.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
