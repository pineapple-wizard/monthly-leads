const QUICK_SERVICE_CHAINS = [
  "mcdonalds",
  "burger king",
  "taco bell",
  "wendys",
  "chick fil a",
  "wingstop",
  "white castle",
  "kfc",
  "popeyes",
  "pizza hut",
  "dominos",
  "little caesars",
  "papa johns",
  "subway",
  "chipotle",
  "tropical smoothie",
  "pepper lunch",
  "starbucks",
  "dunkin",
  "dairy queen",
  "sonic",
  "whataburger",
  "in n out",
  "five guys",
  "raising canes",
  "zaxbys",
  "bojangles",
  "churchs chicken",
  "el pollo loco",
  "del taco",
  "carls jr",
  "hardees",
  "jack in the box",
  "arbys",
  "panda express",
  "jersey mikes",
  "firehouse subs",
  "jimmy johns",
  "qdoba",
  "smoothie king",
  "jamba",
  "krispy kreme",
  "pizza guys",
  "za zoom",
  "the coop",
  "the knox",
  "handies",
];

export function isQuickServiceChain(title: string): boolean {
  const words = normalize(title).split(" ").filter(Boolean);
  return QUICK_SERVICE_CHAINS.some((chain) => containsPhrase(words, chain.split(" ")));
}

function containsPhrase(words: string[], phrase: string[]): boolean {
  for (let index = 0; index <= words.length - phrase.length; index += 1) {
    if (phrase.every((word, offset) => words[index + offset] === word)) return true;
  }
  return false;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
