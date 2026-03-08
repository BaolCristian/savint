export interface EmojiCategory {
  name: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    name: "Faccine",
    emojis: [
      "\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F60E}", "\u{1F914}",
      "\u{1F913}", "\u{1F92A}", "\u{1F973}", "\u{1F929}", "\u{1F92B}",
      "\u{1F9D0}", "\u{1F92F}", "\u{1F47B}", "\u{1F47D}", "\u{1F916}",
    ],
  },
  {
    name: "Animali",
    emojis: [
      "\u{1F436}", "\u{1F431}", "\u{1F98A}", "\u{1F984}", "\u{1F43B}",
      "\u{1F43C}", "\u{1F428}", "\u{1F42F}", "\u{1F981}", "\u{1F438}",
      "\u{1F435}", "\u{1F427}", "\u{1F989}", "\u{1F98B}", "\u{1F419}",
    ],
  },
  {
    name: "Cibo",
    emojis: [
      "\u{1F355}", "\u{1F354}", "\u{1F32E}", "\u{1F363}", "\u{1F366}",
      "\u{1F369}", "\u{1F36A}", "\u{1F349}", "\u{1F951}", "\u{1F37F}",
      "\u{1F382}", "\u{1F36B}",
    ],
  },
  {
    name: "Sport",
    emojis: [
      "\u26BD", "\u{1F3C0}", "\u{1F3C8}", "\u{1F3BE}", "\u{1F3B8}",
      "\u{1F3AE}", "\u{1F680}", "\u{1F308}", "\u26A1", "\u{1F525}",
      "\u2B50", "\u{1F48E}", "\u{1F451}",
    ],
  },
];

export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

export function randomEmoji(): string {
  return ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
}
