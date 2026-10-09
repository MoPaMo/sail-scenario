/**
 * Word data for the profanity filter (see profanity.ts for how it's matched).
 *
 * Curated by hand for short, user-written titles in a pirate board game.
 * Entries were cross-checked against the "List of Dirty, Naughty, Obscene and
 * Otherwise Bad Words" (LDNOOBW, CC BY 4.0, github.com/LDNOOBW), but those
 * lists are not used directly: matched as whole words they block ordinary
 * words such as "pesce" (fish), "regina", "nave scuola" (training ship),
 * "pot", "nicht", "bitte", "concha" (shell) or "maldito" (cursed).
 *
 * Every pattern is ASCII-normalised (umlauts as ae/oe/ue, accents removed)
 * unless it contains non-ASCII letters, in which case it is matched against
 * the text as typed (used for Cyrillic and for words that would be innocent
 * without their accents, e.g. "coño" vs "cono" = cone).
 *
 * Modes:
 *   word  – the whole word must match              (W)
 *   start – the word must start with the pattern   (S)
 *   any   – the pattern may appear inside a word   (A)
 */

export type Mode = "word" | "start" | "any";

export interface Root {
  p: string;
  m: Mode;
  /**
   * Restrict to one view of the text: "stripped" drops accents (ö -> o),
   * "spelled" writes German umlauts out (ö -> oe). Used where a German word
   * with an umlaut would otherwise collide with a word in another language.
   */
  view?: "spelled" | "stripped";
}

const W = (...p: string[]): Root[] => p.map((x) => ({ p: x, m: "word" }));
const S = (...p: string[]): Root[] => p.map((x) => ({ p: x, m: "start" }));
const A = (...p: string[]): Root[] => p.map((x) => ({ p: x, m: "any" }));

/* ---------------------------------------------------------------------- */
/* Patterns checked on every word                                          */
/* ---------------------------------------------------------------------- */

export const ROOTS: Root[] = [
  // German. "arsch" only at the start of a word so "Barsch" (perch) passes;
  // "scheiss" with double s so "Kirscheis" (cherry ice cream) passes;
  // "Schwanz" is not listed: it is the fish-tail symbol in the German edition.
  ...S("arsch", "fick", "hure", "wichs", "kack", "porno", "onanier", "spast", "kanake", "kanacke", "zigeuner", "polacke", "nazi", "schlampe", "scheis"),
  ...A(
    "scheiss", "arschloch", "arschgeige", "arschkriecher", "ficker", "ficken", "fotze", "votze", "hurensohn", "missgeburt",
    "schwuchtel", "pimmel", "titten", "verpiss", "judensau", "schlitzauge", "kameltreiber", "morgenlatte", "kampflesbe",
    "hackfresse", "wixer", "wixxer", "hitler", "siegheil", "kinderschaender",
  ),
  ...W("neger", "negers", "negern", "negerin", "nutte", "nutten", "tunte", "mongo", "spasti", "bimbo", "moese", "doedel", "bumsen", "pimpern", "pisser", "dödel", "möse"),

  // English additions (obscenity covers the core vocabulary).
  ...S("beaner", "jizz", "phuck", "biatch", "clitor", "darkie", "pedo"),
  ...A("wetback", "raghead", "towelhead", "shemale", "bukkake", "pedophil", "paedophil", "douchebag", "golliwog", "zipperhead", "dumbass", "onlyfans", "cocksuck", "motherfuck"),
  ...W("spic", "spics", "gook", "gooks", "coon", "coons", "paki", "pakis", "wog", "wogs", "skank", "tosser", "bellend", "milf", "kkk", "fuq", "xxx", "nsfw", "gyppo", "pikey", "threesome", "jackass", "clit", "darky", "wpww"),

  // French
  ...S("encul", "enfoire", "branleu", "merdeu", "merdiq"),
  ...A("connard", "connasse", "salope", "putain", "pouffiasse", "petasse", "bougnoul", "youpin", "niquer"),
  ...W("pute", "putes", "batard", "batarde", "gouine", "chier", "merde", "couilles", "foutre", "salaud", "salauds", "zob", "fdp", "nique",
    // Accented forms only: "pede" is Portuguese for "asks", "negre" Catalan for "black".
    "pédé", "pédés", "nègre", "nègres", "négresse"),

  // Spanish
  ...S("puta", "cabron", "maricon", "pendej", "chinga", "malparid", "gilipoll", "jilipoll"),
  ...A("mierda", "hijueputa", "hijoputa", "hijaputa", "conchetumare", "conchatumadre", "chupapolla", "soplapolla", "lameculo"),
  ...W("puto", "putos", "marica", "maricas", "verga", "culero", "culeros", "follar", "follador", "joder", "jodido", "jodida", "mamada", "hdp", "culo", "coño", "pezón", "bollera"),

  // Portuguese
  ...S("caralh", "arrombad", "punheta"),
  ...W("porra", "foda", "fodase", "fodasse", "foder", "fodido", "fodida", "buceta", "boceta", "viado", "cuzao", "cuzão", "merda", "merdas", "paneleiro", "xoxota", "xota", "piroca"),

  // Italian
  ...S("cazz", "stronz", "coglion", "mignott", "bocchinar", "sborr", "merdos", "minchion"),
  ...A("puttan", "vaffanculo", "fanculo", "minchia", "porcodio", "diocane", "dioporco"),
  ...W("frocio", "froci", "froscio", "ricchione", "recchione", "culattone", "zoccola", "pompino", "scopata", "chiavare", "figa", "fregna", "terrone", "terroni", "sorca", "patonza"),

  // Dutch. "hoer" words only on the accent-stripped view: German "hören"
  // becomes "hoeren" when umlauts are spelled out.
  ...A("klootzak", "godverdomme", "teringlijer", "kankerlijer", "kankerhoer", "kutwijf", "rothoer", "stoephoer"),
  ...W("kut", "lul", "kloten", "slet", "sletten", "teef", "tering", "flikker", "flikkers", "mongool", "neuken", "neukt", "godver"),
  { p: "hoer", m: "word", view: "stripped" },
  { p: "hoeren", m: "word", view: "stripped" },
  { p: "hoerig", m: "word", view: "stripped" },

  // Polish
  ...S("chuj", "pizd", "jebac", "jeban", "dziwk", "zajebi"),
  ...A("kurw", "pierdol", "spierdal", "wypierdal", "skurwiel"),
  ...W("huj", "cipa", "ciota", "fiut", "kutas", "suka"),

  // Czech / Slovak. Not "kurv…" at word start: German "Kurve" means curve.
  ...S("prdel", "kokot", "mrdat", "mrdka", "zkurv"),
  ...W("kurva", "kurvo", "kurvy", "kurvin", "kurvinsin", "zmrd", "hovno", "sracka", "curak", "buzna", "píča", "píčo", "čurák", "sračka"),

  // Croatian / Serbian / Bosnian / Slovenian
  ...S("jebem", "jebote", "jebeni", "jebena", "jebo", "jebi", "jebat", "jebig"),
  ...A("pičk", "pička", "kurčin"),
  ...W("picka", "picke", "picku", "kurac", "kurca", "kurcu", "govno", "sranje", "seronja", "pederu", "pederi", // not "peder": a Scandinavian first name
    "drolja", "pizda", "pizdo"),

  // Russian / Ukrainian (Cyrillic as typed, plus common transliterations)
  ...A("хуй", "хуе", "хуё", "хуя", "пизд", "заеб", "заёб", "выеб", "уеб", "долбоеб", "долбоёб", "разъеб", "гандон", "залуп", "шлюх"),
  ...S("ебан", "ебат", "ебал", "ебл", "ёбан", "бля", "мудак", "мудил", "пидор", "пидар", "пидр"),
  ...W("сука", "суки", "сучка", "блять", "suka", "blyat", "blyad", "blya", "cyka", "nahui", "nahuy", "nahuj", "mudak", "pidor", "pidar", "ebat", "eblan"),

  // Turkish
  ...S("orospu", "siktir", "sikey", "siker", "sikik", "pezevenk", "kahpe", "kaltak", "amcik", "amcık"),
  ...W("sikim", "amk", "yarrak", "yarak", "ibne", "gavat", "piç", "göt"),

  // Hungarian. Not "basz…" at word start: "baszk" is Basque.
  ...S("fasz", "picsa", "segg", "baszd", "baszott", "baszik", "baszni"),
  ...A("kibaszott", "bazmeg", "bazdmeg"),
  ...W("geci", "buzi", "szar", "szaros", "kurvak", "kurvat"),

  // Swedish / Norwegian / Danish. Not "fitt…" at word start: English "fitting".
  ...S("knull"),
  ...W("fitta", "fittan", "fittor", "fitte", "fisse", "kuk", "javla", "jävla", "jävlar", "jævla", "pikk"),
  { p: "kuken", m: "word", view: "spelled" }, // German "Küken" (chick) strips to "kuken"

  // Finnish
  ...S("vittu", "vitun", "huora", "neekeri", "runkk", "nussi", "kyrpä"),
  ...A("paskiain", "paskapaa", "paskanaama"),
  ...W("paska", "paskaa", "paskan", "paskat", "mulkku", "kyrpa"),
];

/**
 * Core English and German words used only for words split into pieces
 * ("fu ck", "wich ser") and for censored spellings ("f*ck"). Obscenity checks
 * whole words better, so these don't run on ordinary words.
 */
export const WINDOW_ROOTS: Root[] = [
  ...A("fuck", "cunt", "nigg", "fagg", "wank", "scheiss", "fotze", "wichser", "ficken", "hurensohn", "arschloch"),
  ...S("bitch", "porn", "whore", "slut"),
  ...W("shit", "shits", "shitty", "twat", "dick", "cock", "pussy", "rape", "nazi"),
];

/** Words that contain a pattern but are innocent. Matched against whole words. */
export const WHITELIST = new Set([
  "fickle", "fickler", "fickleness", "putative", "putatively", "putamen", "kirscheis", "pedometer", "pedometers", "pedology",
  "pedologist", "pedosphere", "nazir", "nazira", "nazim", "clitoria", "arschen", "mongolia", "mongol", "mongols", "mongoose",
  "kurven", "kurve",
]);

/** Phrases matched on whole words in sequence (ASCII-normalised). */
export const PHRASES = [
  "fils de pute", "nique ta mere", "nique ta race", "trou du cul", "va te faire foutre", "ta gueule",
  "hijo de puta", "concha de tu madre", "concha tu madre", "chupame la",
  "porco dio", "dio cane", "dio porco", "porca madonna", "porca puttana",
  "sieg heil", "heil hitler", "white power", "white pride", "jebem ti", "leck mich",
  "son of a bitch", "suck my", "kiss my ass", "eat shit",
];

/** Extra innocent phrases for obscenity's English dataset (place names, birds, food). */
export const ENGLISH_WHITELIST = [
  "cockpit", "cockpits", "moby dick", "peacock", "woodcock", "weathercock", "shuttlecock", "ballcock",
  "shiitake", "rapeseed", "retardant", "pussycat", "penistone", "booby", "great tit", "blue tit", "coal tit",
  "cockatoo", "cockburn", "hancock", "hitchcock", "scunthorpe", "sussex", "essex", "middlesex",
  // German "Kanal" (canal, channel), as in "Ärmelkanal" or "Nord-Ostsee-Kanal".
  "kanal", "kanäle", "kanale",
  // "negro" means black in Spanish and Portuguese. Allowed in sea and pirate phrases
  // (Black Sea, Blackbeard, Black Pearl…); on its own it stays blocked.
  "mar negro", "mar negra", "rio negro", "río negro", "cabo negro", "barco negro", "monte negro", "montenegro", "negroni",
  "barba negra", "barbanegra", "perla negra", "bandera negra", "vela negra", "isla negra", "costa negra", "pirata negro",
  "kraken negro", "agua negra",
];

/** Words recognised behind asterisks or hashes: "f*ck", "sh**", "a**hole". */
export const CENSOR_TARGETS = [
  "fuck", "fucker", "fucking", "shit", "cunt", "bitch", "asshole", "bastard", "nigger", "nigga", "faggot", "whore", "slut",
  "dick", "cock", "pussy", "wichser", "fotze", "scheisse", "arschloch", "ficken", "hurensohn", "kurwa", "puta", "merde",
  "cazzo", "putain", "salope",
];

/** Hate symbols and codes, matched on the raw text. */
export const HATE_PATTERNS: RegExp[] = [
  /[卐卍࿕࿖࿗࿘]/u, // swastikas
  /ᛋᛋ|ϟϟ|ꜱꜱ(?=\s|$)/u, // SS runes
  /(?:^|[^\d])14\s*[/\\.,\-\s]?\s*88(?=$|[^\p{L}\d])/u, // "14 words" + 88 (not "1488m deep")
  /(?:^|[^\p{L}\d])h\s*h\s*88(?=$|[^\p{L}\d])/iu,
  /\u{1F595}/u, // 🖕
];
