import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTitle, findProfanity } from "../lib/profanity";

/** Must be blocked. Grouped by what they exercise. */
export const BLOCKED: Record<string, string[]> = {
  english: [
    "Fuck Island", "Shit Storm", "Kraken's Ass", "Bastard Bay", "Whore Island", "Cunt Cove", "Bitch Reef", "Motherfucker Strait",
    "Dickhead Passage", "Cocksucker Cove", "Slut Sound", "Twat Tide", "Wanker's Wharf", "Pussy Point", "Nigger Bay", "Faggot Harbour",
    "Spic Shoals", "Wetback Waters", "Raghead Reef", "Paki Port", "Gook Gulf", "Kike Key", "Beaner Bay", "Tranny Tide", "Bukkake Bay",
    "Jizz Juice", "Pedophile Point", "Hitler's Harbour", "Nazi Navy", "KKK Cove", "Douchebag Dock", "MILF Island", "Dumbass Deep",
    "Rape Reef", "Porn Port", "Dildo Dock", "Negro Island",
  ],
  german: [
    "Scheiß Sturm", "Scheisse Bucht", "Kackbratze Kap", "Arschloch Atoll", "Arschgeige", "Fick dich", "Ficken", "Kinderficker",
    "Hurensohn Hafen", "Huren Insel", "Wichser Riff", "Fotze", "Missgeburt", "Schwuchtel Strand", "Spast", "Spasti", "Mongo Meer",
    "Neger Kuss", "Negerin", "Kanake", "Zigeuner Bucht", "Judensau", "Schlampe", "Nutte", "Titten Tiefe", "Pimmel Pier", "Verpiss dich", "Möse",
    "Sieg Heil", "Heil Hitler", "Morgenlatte",
  ],
  french: ["Putain de Kraken", "Fils de pute", "Salope", "Connard", "Connasse", "Enculé", "Nique ta mère", "Merde Alors", "Trou du cul", "Pédé", "Nègre", "Bougnoule", "Va te faire foutre"],
  spanish: ["Hijo de puta", "Puta Madre", "Cabrón", "Maricón", "Gilipollas", "Mierda Mar", "Pendejo Puerto", "Chingada", "Coño", "Joder", "Concha de tu madre", "Malparido", "Verga"],
  portuguese: ["Caralho", "Porra Porto", "Foda-se", "Buceta", "Viado", "Arrombado", "Filho da puta", "Punheta"],
  italian: ["Cazzo Canale", "Vaffanculo", "Stronzo", "Coglione", "Porco Dio", "Dio Cane", "Puttana", "Minchia", "Frocio", "Pompino"],
  dutch: ["Klootzak", "Godverdomme", "Kut Kanaal", "Hoer Haven", "Kankerlijer", "Teringlijer", "Lul"],
  polish: ["Kurwa Mać", "Do kurwy nędzy", "Chuj", "Pierdolony", "Spierdalaj", "Jebać", "Pizda", "Skurwysyn"],
  czechSlovak: ["Kurva", "Píča", "Prdel", "Kokot", "Zmrd", "Hovno"],
  croatianSerbian: ["Jebem ti", "Jebote", "Pička materina", "Picka", "Kurac", "Govno", "Sranje", "Pizda ti materina"],
  russian: ["Сука блять", "Хуй", "Пиздец", "Ебать", "Cyka Blyat", "Nahui", "Мудак", "Пидор"],
  turkish: ["Orospu", "Siktir", "Amk", "Yarrak", "Ibne", "Piç"],
  hungarian: ["Bazmeg", "Kurva anyád", "Faszfej", "Geci", "Picsa", "Kibaszott"],
  nordic: ["Fitta", "Knulla", "Kuk", "Jävla", "Faen ta deg fitte"],
  finnish: ["Vittu", "Perkeleen vittu", "Paska", "Huora", "Neekeri"],
  evasion: [
    "F u c k", "f.u.c.k", "F-U-C-K Bay", "fuuuuuck", "FUCK", "Fück", "Sh1t Storm", "5h!t", "$h1t", "B1tch", "A$$hole", "N1gg3r",
    "Arsch1och", "4rschloch", "Sch3iße", "W1chser", "Fiсk", "fuсk", "Ƒuck", "ｆｕｃｋ", "fu​ck", "F*ck", "Sh*t", "F**k", "B*tch",
    "Wich ser", "Hu ren sohn", "Fot ze", "Schei sse", "Kur wa", "Ar sch loch", "p u t a", "c.a.z.z.o",
  ],
  hate: ["卐 Island", "14/88", "1488 Bay", "HH88", "ᛋᛋ Ship", "🖕 Kraken", "White Power Port"],
};

/** Must pass. Real places, birds, food, nautical terms and harmless foreign words. */
export const ALLOWED: string[] = [
  // English place names and words that contain rude-looking letters
  "Scunthorpe Shoals", "Penistone Pier", "Middlesex Marina", "Sussex Sound", "Essex Estuary", "Cockburn Sound", "Hancock Harbour",
  "Booby Island", "Brown Booby Bay", "Great Tit Cove", "Blue Tit Bay", "Shiitake Sea", "Rapeseed Fields", "Cockpit Cove", "Moby Dick",
  "Peacock Point", "Cockatoo Island", "Assassin's Reef", "Bass Strait", "Passage of Glass", "Classic Crossing", "Grasshopper Gulf",
  "Cumulus Clouds", "Therapist Bay", "Titanic Trail", "Analog Atoll", "Canal Chase", "Arsenal Isles", "Shell Shock", "Hell's Gate",
  "Pistol Point", "Spice Islands", "Spicy Seas", "Raccoon Rock", "Cocoon Cove", "Tycoon Tides", "Lagoon Loop", "Monsoon Run",
  "Mongolia Maps", "Niger Delta", "Nigeria Nights", "Snowballing Storms", "Shrimping Grounds", "Escort Mission", "Ocean Domination",
  "Hardcore Mode", "Tied Up at the Dock", "Big Black Rock", "Pleasure Cove", "Sextant Run", "Dickens' Deep", "Hitchcock Harbour",
  "Fickle Winds", "Putative Passage", "Pedometer Path", "Pedal to the Metal", "Pedro's Pass", "Nazir's Gulf", "Japanese Junk",
  "Butt Rock", "Scuttlebutt Shoal", "Fart of the Sea", "Damn the Torpedoes", "Crap Shoot", "Bloody Mary", "Bugger All",
  "Fisch Eis Spass", "Pass Hit", "Shi Take", "Ship Hits", "Wash It", "Grass Hut", "Moss Hitch", "As Shown",
  // German
  "Kirscheis Insel", "Barsch Bucht", "Fischschwanz-Passage", "Schwanzflosse", "Kurvenreiche Küste", "Gefährliche Kurve",
  "Hörnum Hafen", "Hören und Sehen", "Die Möwe", "Mosel Meer", "Möpse am Meer", "Vögel über der Insel", "Bitte nicht stören",
  "Kampf um die Karibik", "Ärmelkanal", "Nord-Ostsee-Kanal", "Kanal", "Hurrikan", "Nutzen", "Wichtig", "Pimpinelle",
  "Sturm auf Sylt", "Neue Kurse", "Negative Kräfte", "Negeri Sembilan", "Zigarrenbucht",
  // French
  "Cul-de-sac Cove", "La Bite du Corsaire", "Bordel de Mer", "Con Brio", "Queue de Baleine", "Gerbe d'Or", "Tanche Lac",
  "Pédale douce", "Pede ajuda", "Vi negre", "Chatte Noire", "Baiser du Vent", "Bourrée Bretonne", "Folle Nuit",
  // Spanish / Portuguese / Italian
  "Concha Bay", "Barco Maldito", "Mar Negro", "Barba Negra", "Montenegro", "Perla Negra", "Isla de Mona", "Cono Sur", "Polla Chilena", "Martillo Marino", "Trio de Islas",
  "Disputa del Mar", "Computadora", "Amputación", "Reputación", "Heroína del Mar", "Aranha do Mar", "Veado Veloz", "Troia",
  "Nave Scuola", "Pesce Spada", "Regina del Mare", "Pisello", "Cozza Nera", "Fava Island", "Scopare il ponte", "Porca Miseria",
  "Fica a dica", "Culinária", "Merdaland", "Figaro",
  // Dutch / Nordic / Slavic / others
  "Gat van Texel", "Pot Luck", "Nicht so schnell", "Anita's Eiland", "Del Mar", "Hol van de Haai", "Naaien en Varen",
  "Fan Island", "Hård Vind", "Fitting Out", "Fitter Island", "Küken Kai", "Peder Skram", "Kurve", "Baszkföld", "Buzios",
  "Picknick Point", "Pickle Point", "Kukri Cove", "Suki's Sea", "Sukabumi", "Kokomo", "Mrduja", "Jeb's Bay", "Sikeston",
  "Kutno Harbour", "Pizza Point", "Pizzeria", "Hora Dance", "Paskal", "Vitus Bering", "Gotland", "Got Away",
  "Amkreuz", "Pica Pica", "Ibneya",
  // Numbers and symbols
  "Route 88", "Scenario 14", "Kraken 1488m deep?",
];

test("blocks profanity across languages, evasions and hate codes", () => {
  const missed: string[] = [];
  for (const [group, titles] of Object.entries(BLOCKED)) {
    for (const t of titles) if (!findProfanity(t)) missed.push(`${group}: ${t}`);
  }
  assert.deepEqual(missed, []);
});

test("lets ordinary titles through", () => {
  const flagged = ALLOWED.map((t) => [t, findProfanity(t)] as const).filter(([, hit]) => hit);
  assert.deepEqual(flagged, []);
});

test("title rules", () => {
  assert.equal(checkTitle("ab").ok, false);
  assert.equal(checkTitle("Visit www.spam.example").ok, false);
  assert.equal(checkTitle("12345").ok, false);
  assert.equal(checkTitle("Kraken Alley").ok, true);
  assert.equal(checkTitle("Kraken​ Alley").ok, true);
});
