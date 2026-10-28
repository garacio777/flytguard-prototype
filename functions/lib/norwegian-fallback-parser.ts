import type { DispatchRequest } from "../../src/schemas/dispatch.js";

interface CandidateItem {
  category:
    | "GRAVEMASKIN"
    | "HJULLASTER"
    | "LIFT_STILLAS"
    | "STRØM_VARME_LYS"
    | "KOMPRIMERING";
  modelSpecification: string;
  quantity: number;
  deliveryLocation: string;
  requestedStartIso: string;
  requiresCertifiedOperator: boolean;
}

interface EquipmentRule {
  readonly category: CandidateItem["category"];
  readonly pattern: RegExp;
  readonly defaultSpec: string;
}

const EQUIPMENT_RULES: readonly EquipmentRule[] = [
  {
    category: "GRAVEMASKIN",
    pattern: /\b(gravemaskin(?:er)?|beltegraver(?:e)?|hjulgraver(?:e)?|minigraver(?:e)?|graver(?:e)?)\b/i,
    defaultSpec: "Gravemaskin standard"
  },
  {
    category: "HJULLASTER",
    pattern: /\b(hjullaster(?:e)?| kompaktlaster(?:e)?)\b/i,
    defaultSpec: "Hjullaster standard"
  },
  {
    category: "LIFT_STILLAS",
    pattern: /\b(sakselift(?:er)?|bomlift(?:er)?|tilhengerlift(?:er)?|personlift(?:er)?|stillas(?:er)?|lift(?:er)?)\b/i,
    defaultSpec: "Lift / arbeidshøydeplattform"
  },
  {
    category: "STRØM_VARME_LYS",
    pattern: /\b(lysmast(?:er)?|strømaggregat(?:er)?|aggregat(?:er)?|byggestrøm|byggvarmer(?:e)?|varmeovn(?:er)?|avfukter(?:e)?)\b/i,
    defaultSpec: "Mobil lys- eller strømenhet"
  },
  {
    category: "KOMPRIMERING",
    pattern: /\b(vibroplate(?:r)?|hoppetusse(?:r)?|valsetog|asfaltvals(?:er)?|vals(?:er)?|komprimering(?:sutstyr)?)\b/i,
    defaultSpec: "Komprimeringsutstyr"
  }
];

const NORWEGIAN_WORD_NUMBERS: Readonly<Record<string, number>> = {
  en: 1,
  ei: 1,
  ett: 1,
  to: 2,
  tre: 3,
  fire: 4,
  fem: 5,
  seks: 6,
  syv: 7,
  sju: 7,
  åtte: 8,
  ni: 9,
  ti: 10,
  elleve: 11,
  tolv: 12
};

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  søndag: 0,
  mandag: 1,
  tirsdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lørdag: 6
};

function padTwo(num: number): string {
  return String(num).padStart(2, "0");
}

function extractRequestedStartIso(message: string): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const lower = message.toLowerCase();
  if (/\bi\s+morgen\b/.test(lower)) {
    target.setUTCDate(target.getUTCDate() + 1);
  } else if (/\bi\s+overmorgen\b/.test(lower)) {
    target.setUTCDate(target.getUTCDate() + 2);
  } else {
    let matchedWeekday = false;
    for (const [dayName, dayIdx] of Object.entries(WEEKDAY_INDEX)) {
      if (lower.includes(dayName)) {
        const currentDay = target.getUTCDay();
        const delta = (dayIdx - currentDay + 7) % 7 || 7;
        target.setUTCDate(target.getUTCDate() + delta);
        matchedWeekday = true;
        break;
      }
    }
    if (!matchedWeekday && !/\bi\s+dag\b/.test(lower)) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
  }

  let hours = 7;
  let minutes = 0;

  const timeMatch = /\b(?:kl\.?\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/i.exec(message);
  if (timeMatch && timeMatch[1] && timeMatch[2]) {
    hours = Number.parseInt(timeMatch[1], 10);
    minutes = Number.parseInt(timeMatch[2], 10);
  } else {
    const hourOnlyMatch = /\bkl\.?\s*([01]?\d|2[0-3])\b/i.exec(message);
    if (hourOnlyMatch && hourOnlyMatch[1]) {
      hours = Number.parseInt(hourOnlyMatch[1], 10);
      minutes = 0;
    }
  }

  const year = target.getUTCFullYear();
  const month = padTwo(target.getUTCMonth() + 1);
  const day = padTwo(target.getUTCDate());
  return `${year}-${month}-${day}T${padTwo(hours)}:${padTwo(minutes)}:00+01:00`;
}

function extractDeliveryLocation(message: string, projectSiteId: string): string {
  const siteInMatch = /\b(byggeplass(?:en)?\s+i\s+[A-ZÆØÅa-zæøå0-9\-]+(?:\s+[A-ZÆØÅa-zæøå0-9\-]+)?)(?=\s+(?:i\s+morgen|i\s+dag|kl\b|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|[,.]|$)/i.exec(
    message
  );
  if (siteInMatch && siteInMatch[1]) {
    const loc = siteInMatch[1].trim();
    return loc.charAt(0).toUpperCase() + loc.slice(1);
  }

  const prepCityMatch = /\b(?:i|på|ved)\s+([A-ZÆØÅ][A-ZÆØÅa-zæøå\-]{1,40})\b/.exec(message);
  if (prepCityMatch && prepCityMatch[1]) {
    return `Anleggsplass i ${prepCityMatch[1].trim()}`;
  }

  const toPlaceMatch = /\blevert\s+til\s+([^,.;]{2,50}?)(?=\s+(?:i\s+morgen|i\s+dag|kl\b|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|[,.]|$)/i.exec(
    message
  );
  if (toPlaceMatch && toPlaceMatch[1]) {
    const loc = toPlaceMatch[1].trim();
    return loc.charAt(0).toUpperCase() + loc.slice(1);
  }

  return `Prosjektlokasjon ${projectSiteId}`;
}

function extractQuantity(clause: string): number {
  const stkMatch = /\b([1-9]|1\d|20)\s*stk\.?\b/i.exec(clause);
  if (stkMatch && stkMatch[1]) {
    return Number.parseInt(stkMatch[1], 10);
  }

  const tokens = clause
    .toLowerCase()
    .replace(/[,.;:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;

    const wordVal = NORWEGIAN_WORD_NUMBERS[token];
    if (wordVal !== undefined) {
      const nextToken = tokens[i + 1] ?? "";
      if (!/^(tonn|tonns|t|kg|meter|m|kw|kva)$/.test(nextToken)) {
        return wordVal;
      }
    }

    if (/^([1-9]|1\d|20)$/.test(token)) {
      const prevToken = tokens[i - 1] ?? "";
      const nextToken = tokens[i + 1] ?? "";
      if (
        prevToken !== "kl" &&
        prevToken !== "kl." &&
        !/^(tonn|tonns|t|kg|meter|m|kw|kva)$/.test(nextToken)
      ) {
        return Number.parseInt(token, 10);
      }
    }
  }

  return 1;
}

function extractModelSpecification(clause: string, matchedKeyword: string, defaultSpec: string): string {
  const tonnageBefore = /(\d{1,2}(?:[.,]\d)?(?:\s*-\s*tonns|\s*tonns|\s*t))\s+([a-zæøå\-]+)/i.exec(
    clause
  );
  if (tonnageBefore && tonnageBefore[1]) {
    return `${tonnageBefore[1].trim()} ${matchedKeyword.toLowerCase()}`.slice(0, 80);
  }

  const weightAfter = /(\d{2,5}\s*(?:kg|kw|kva|meter|m)\b)/i.exec(clause);
  if (weightAfter && weightAfter[1]) {
    const label = matchedKeyword.charAt(0).toUpperCase() + matchedKeyword.slice(1).toLowerCase();
    return `${label} (${weightAfter[1].trim()})`.slice(0, 80);
  }

  const cleanKeyword =
    matchedKeyword.charAt(0).toUpperCase() + matchedKeyword.slice(1).toLowerCase();
  return cleanKeyword.length >= 2 ? cleanKeyword.slice(0, 80) : defaultSpec;
}

/**
 * Deterministic Zone 4 fallback parser when upstream OPENAI_API_KEY is not provisioned.
 * Returns `unknown` so the caller MUST still validate via Gate 3 (`DispatchOutputSchema.safeParse`).
 */
export function parseNorwegianDispatchDeterministically(input: DispatchRequest): unknown {
  const requestedStartIso = extractRequestedStartIso(input.rawMessage);
  const deliveryLocation = extractDeliveryLocation(input.rawMessage, input.projectSiteId);
  const globalOperatorReq = /\b(med\s+(?:sertifisert\s+)?(?:maskin)?fører|sertifisert\s+(?:maskin)?fører|inkludert\s+fører)\b/i.test(
    input.rawMessage
  );

  const clauses = input.rawMessage
    .split(/\b(?:og|samt|pluss)\b|[,;+]/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const items: CandidateItem[] = [];

  for (const clause of clauses) {
    for (const rule of EQUIPMENT_RULES) {
      const match = rule.pattern.exec(clause);
      if (match && match[1]) {
        const clauseHasOperator =
          /\b(fører|maskinfører|sertifisert)\b/i.test(clause) ||
          (globalOperatorReq &&
            (rule.category === "GRAVEMASKIN" ||
              rule.category === "HJULLASTER" ||
              rule.category === "LIFT_STILLAS"));

        items.push({
          category: rule.category,
          modelSpecification: extractModelSpecification(clause, match[1], rule.defaultSpec),
          quantity: extractQuantity(clause),
          deliveryLocation,
          requestedStartIso,
          requiresCertifiedOperator: clauseHasOperator
        });
        break;
      }
    }
  }

  if (items.length === 0) {
    return {
      confidenceScore: 0.62,
      needsHumanReview: true,
      items: [
        {
          category: "GRAVEMASKIN",
          modelSpecification: "Uspesifisert anleggsutstyr (krever manuell avklaring)",
          quantity: 1,
          deliveryLocation,
          requestedStartIso,
          requiresCertifiedOperator: globalOperatorReq
        }
      ],
      safetyNotes:
        "Ingen entydig maskinkategori gjenkjent i fritekst. Ordren er flagget for manuell kontroll før utsending."
    };
  }

  const limitedItems = items.slice(0, 10);
  const hasHeavyOperator = limitedItems.some((item) => item.requiresCertifiedOperator);

  const safetyNotes = hasHeavyOperator
    ? "Kontroller gyldig maskinførerbevis (M2/M4) og sikker adkomst på anleggsplass før oppstart."
    : "Kontroller bæreevne og fri høyde/adkomstvei ved avlessing på byggeplass før avtalt leveringstidspunkt.";

  return {
    confidenceScore: 0.95,
    needsHumanReview: false,
    items: limitedItems,
    safetyNotes
  };
}
