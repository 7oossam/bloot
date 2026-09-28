import { cardId } from "../engine/cards";
import { runController } from "../roguelike/RunController";
import { getStamp, GROW_STARS } from "../roguelike/stamps";
import { CardView } from "./CardView";

/** Lets every CardView show the run's الوسوم on the cards that carry them. */
export function installStampView(): void {
  CardView.stampsFor = (card) => {
    const st = runController.getState();
    const id = cardId(card);
    const ids = st.stamps?.[id];
    if (!ids?.length) return undefined;
    const stars = ids.includes("grow") ? (st.stampStars?.[id] ?? 0) : 0;
    return { icons: ids.map((x) => getStamp(x)?.icon ?? ""), stars, grown: stars >= GROW_STARS };
  };
}
