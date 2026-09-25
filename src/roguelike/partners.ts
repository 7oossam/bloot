/**
 * شخصيات الخوي: at the start of a run you pick who sits across from you (like picking a
 * character in Slay the Spire). Each partner has a perk and a quirk that change how you play
 * the whole run; the table shows their name where "شريكك" used to be.
 */
export interface PartnerOptions {
  /** Comes to the suit your التهريب asks for before cashing his own winners. */
  answerFirst?: boolean;
  /** Never raises in the دبل round. */
  neverDoubles?: boolean;
  /** Buys on a bar this much lower than a careful player. */
  bidEager?: number;
  /** Raises in the دبل round on a bar this much lower. */
  doubleEager?: number;
  /** Always dealt at least this many Aces in his first five (from the shared deck). */
  luckyAces?: number;
  /** Plays by habit — the rule-based AI, without thinking ahead. */
  noSearch?: boolean;
  /** Doesn't understand your التهريب or your برقية. */
  deaf?: boolean;
}

export interface PartnerDef {
  id: string;
  name: string;
  icon: string;
  perk: string;
  quirk: string;
  options: PartnerOptions;
  /** Run-level rewards (الغشيم's): match gold ×this… */
  goldMultiplier?: number;
  /** …and this many extra spoils to choose from after a won match. */
  extraRewards?: number;
}

export const PARTNERS: PartnerDef[] = [
  {
    id: "elder",
    name: "الشايب",
    icon: "👴",
    perk: "يفهم تهريبك دايم، ويجيك في شكلك قبل ما ياكل أكلاته",
    quirk: "ما يدبل أبداً",
    options: { answerFirst: true, neverDoubles: true },
  },
  {
    id: "eager",
    name: "المتحمس",
    icon: "🔥",
    perk: "يشتري ويدبل بسهولة — الأيادي الكبيرة تجي معه",
    quirk: "حماسه أحياناً يطيّح عليكم خسرانة",
    options: { bidEager: 10, doubleEager: 20 },
  },
  {
    id: "lucky",
    name: "الجفرة",
    icon: "🍀",
    perk: "دايم يجيه إكة في أول خمس أوراق",
    quirk: "يلعب على البركة: ما يحسبها زين",
    options: { luckyAces: 1, noSearch: true },
  },
  {
    id: "rookie",
    name: "الغشيم",
    icon: "🙃",
    perk: "ذهب المباريات ×1.5، وخيار زيادة في الجوايز",
    quirk: "ما يفهم تهريبك، ولعبه ضعيف",
    options: { noSearch: true, deaf: true },
    goldMultiplier: 1.5,
    extraRewards: 1,
  },
];

export function getPartner(id: string | undefined): PartnerDef | undefined {
  return PARTNERS.find((p) => p.id === id);
}
