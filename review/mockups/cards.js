// Number cards in the approved design: white paper, suit-colour field inside a stepped double gold frame,
// index (rank + suit) centred in both steps, the bottom one turned 180°.
const SUIT = {
  H: { field: "#5E1F24", ink: "#9B1C24", glyph: "♥", pip: "#FAF7F0" },
  D: { field: "#2D4A4D", ink: "#9B1C24", glyph: "♦", pip: "#F0CB7A" },
  C: { field: "#3E4A2A", ink: "#2B3320", glyph: "♣", pip: "#FAF7F0" },
  S: { field: "#1C2B4A", ink: "#1C2B4A", glyph: "♠", pip: "#FAF7F0" },
};
const PATHS = {
  "♥": "M0,32 C-40,4 -52,-22 -30,-36 C-16,-45 -4,-38 0,-26 C4,-38 16,-45 30,-36 C52,-22 40,4 0,32Z",
  "♦": "M0,-40 L30,0 L0,40 L-30,0Z",
  "♠": "M0,-38 C-8,-24 -44,-8 -40,12 C-37,26 -20,28 -7,18 C-8,28 -12,34 -18,38 L18,38 C12,34 8,28 7,18 C20,28 37,26 40,12 C44,-8 8,-24 0,-38Z",
  "♣": "M0,-38 a15,15 0 1,1 -.1,0Z M-21,-4 a15,15 0 1,1 -.1,0Z M21,-4 a15,15 0 1,1 -.1,0Z M-5,6 L5,6 L9,36 L-9,36Z",
};
function stepPath(L, T, R, B, sx, sy, r) {
  const p = [[L+sx,T],[R,T],[R,B-sy],[R-sx,B-sy],[R-sx,B],[L,B],[L,T+sy],[L+sx,T+sy]];
  let d = "";
  for (let i = 0; i < p.length; i++) {
    const a = p[(i+p.length-1)%p.length], b = p[i], c = p[(i+1)%p.length];
    const v1=[a[0]-b[0],a[1]-b[1]], v2=[c[0]-b[0],c[1]-b[1]]; const l1=Math.hypot(...v1), l2=Math.hypot(...v2);
    const q1=[b[0]+v1[0]/l1*r,b[1]+v1[1]/l1*r], q2=[b[0]+v2[0]/l2*r,b[1]+v2[1]/l2*r];
    d += (i?"L":"M")+q1.join(" ")+"Q"+b.join(" ")+" "+q2.join(" ");
  }
  return d+"Z";
}
const PIPS = {
  A: [[0.5,0.5,2.4]],
  7: [[.3,.14],[.7,.14],[.5,.32],[.3,.5],[.7,.5],[.3,.86],[.7,.86]],
  8: [[.3,.14],[.7,.14],[.5,.32],[.3,.5],[.7,.5],[.5,.68],[.3,.86],[.7,.86]],
  9: [[.3,.14],[.7,.14],[.3,.38],[.7,.38],[.5,.5],[.3,.62],[.7,.62],[.3,.86],[.7,.86]],
  10:[[.3,.14],[.7,.14],[.5,.27],[.3,.38],[.7,.38],[.3,.62],[.7,.62],[.5,.73],[.3,.86],[.7,.86]],
};
function numberCard(rank, suit) {
  const s = SUIT[suit], g = s.glyph;
  const L=85,T=49,R=939,B=1456,SX=150,SY=300;
  const outer = stepPath(L,T,R,B,SX,SY,16), inner = stepPath(L+26,T+26,R-26,B-26,SX,SY,12);
  const fx0=L+SX+30, fx1=R-SX-30, fy0=T+80, fy1=B-80;
  const pips = PIPS[rank].map(([u,v,k=1]) => {
    const x=fx0+(fx1-fx0)*u, y=fy0+(fy1-fy0)*v, sc=2.05*k, flip=v>0.55&&rank!=="A";
    return `<g transform="translate(${x} ${y}) scale(${sc}) ${flip?"rotate(180)":""}"><path d="${PATHS[g]}" fill="${s.pip}" stroke="#D6A44A" stroke-width="3"/></g>`;
  }).join("");
  const idx = `<text x="0" y="0" text-anchor="middle" font-family="Cinzel, 'Times New Roman', serif" font-weight="700" font-size="${rank==="10"?96:118}" fill="${s.ink}" stroke="#D6A44A" stroke-width="7" paint-order="stroke" dy="-8">${rank}</text>
    <g transform="translate(0 80) scale(1.25)"><path d="${PATHS[g]}" fill="${s.ink}" stroke="#D6A44A" stroke-width="4"/></g>`;
  const cx=(L+L+SX)/2, cy=(T+T+SY)/2-28;
  return `<svg viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1536" fill="#FAF7F0"/>
    <path d="${outer}" fill="${s.field}"/>
    <path d="${outer}" fill="none" stroke="#281E19" stroke-width="20"/><path d="${outer}" fill="none" stroke="#D6A44A" stroke-width="12"/>
    <path d="${inner}" fill="none" stroke="#281E19" stroke-width="11"/><path d="${inner}" fill="none" stroke="#D6A44A" stroke-width="6"/>
    ${pips}
    <g transform="translate(${cx} ${cy})">${idx}</g>
    <g transform="translate(${1024-cx} ${1536-cy}) rotate(180)">${idx}</g>
  </svg>`;
}
function card(el, spec) { // spec: "KH" image, "back", or rank+suit like "10H"
  if (spec === "back") el.innerHTML = `<img src="back.jpg" alt="">`;
  else if (spec === "KH") el.innerHTML = `<img src="kh.jpg" alt="">`;
  else el.innerHTML = numberCard(spec.slice(0,-1), spec.slice(-1));
}
function plate(el, tone, h) {
  const P = { burgundy:142, sun:150, navy:149, teal:147, paper:96, olive:132 };
  const w = P[tone] * h / 128;
  el.style.borderWidth = `0 ${w}px`; el.style.height = h+"px";
  el.style.borderImage = `url("plate-${tone}.webp") 0 ${P[tone]} fill / 0 ${w}px stretch`;
  if (tone==="sun"||tone==="paper") el.classList.add("light");
}
