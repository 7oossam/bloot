import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:528,height:760} });
await p.goto('file:///tmp/claude-0/-home-user-bloot/9396688c-21cc-58e0-b049-29fe795f7271/scratchpad/deck/card.html'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);
const specs=['back']; for (const s of 'HDCS') for (const r of ['7','8','9','10','J','Q','K','A']) specs.push(r+s);
for (const sp of specs){ await p.evaluate(x=>render(x), sp);
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>i.onload=r))));
  await p.waitForTimeout(60);
  await p.locator('#c').screenshot({ path:'/tmp/claude-0/-home-user-bloot/9396688c-21cc-58e0-b049-29fe795f7271/scratchpad/deck/out_'+sp+'.png', omitBackground:true }); }
await b.close();
