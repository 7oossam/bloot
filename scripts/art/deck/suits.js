const SUIT_PATH = {
  H: "M0,42 C-46,8 -58,-22 -34,-38 C-18,-48 -4,-40 0,-26 C4,-40 18,-48 34,-38 C58,-22 46,8 0,42Z",
  D: "M0,-46 L35,0 L0,46 L-35,0Z",
  S: "M0,-46 C-10,-28 -50,-10 -46,13 C-43,30 -24,33 -9,22 C-10,33 -14,39 -22,45 L22,45 C14,39 10,33 9,22 C24,33 43,30 46,13 C50,-10 10,-28 0,-46Z",
};
const SUIT_INK = { H: "#B3202C", D: "#B3202C", C: "#221A16", S: "#221A16" };
// One suit sign as SVG markup in a -50..50 box. The club is three overlapping circles on a
// joined stem, so it reads as a single shape.
function suitShape(s, fill, stroke = "none", sw = 0) {
  const a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
  if (s !== "C") return `<path d="${SUIT_PATH[s]}" ${a}/>`;
  const body = `<circle cx="0" cy="-24" r="20"/><circle cx="-21" cy="4" r="20"/><circle cx="21" cy="4" r="20"/><path d="M-14,-10 L14,-10 L8,14 L-8,14Z"/><path d="M-5,6 C-5,26 -11,38 -24,46 L24,46 C11,38 5,26 5,6Z"/>`;
  return stroke === "none" ? `<g fill="${fill}">${body}</g>`
    : `<g fill="${stroke}" stroke="${stroke}" stroke-width="${sw * 2}" stroke-linejoin="round">${body}</g><g fill="${fill}">${body}</g>`;
}
