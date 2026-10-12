// Samples both knees' bend twice a second for 16 s of standing still, to read the stance across
// weight shifts rather than at one moment.
//   node knees.mjs [url]
import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2] || "http://localhost:3002/";
const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage();
  await page.goto(`${base}?nolock=1&debug=1&chapter=floor`, {
    waitUntil: "load",
  });
  await page.waitForFunction(
    () => window.__READY__ === true && window.__GAME__?.mode === "play",
    { timeout: 180000 },
  );
  for (
    let i = 0;
    i < 4 && (await page.evaluate(() => window.__GAME__.cinematic));
    i++
  ) {
    await page.keyboard.press("Enter");
    await sleep(700);
  }
  await sleep(2000);
  const samples = [];
  for (let i = 0; i < 32; i++) {
    samples.push(
      await page.evaluate(() => {
        const J = window.__FD__.heroModel.userData.joints;
        const d = (r) => +((r * 180) / Math.PI).toFixed(1);
        return [d(J.leftLowerLeg.rotation.x), d(J.rightLowerLeg.rotation.x)];
      }),
    );
    await sleep(500);
  }
  const straighter = samples.map(([l, r]) => Math.min(l, r)),
    bent = samples.map(([l, r]) => Math.max(l, r));
  const range = (v) => [Math.min(...v), Math.max(...v)];
  console.log(
    JSON.stringify({
      base,
      straighterKnee: range(straighter),
      otherKnee: range(bent),
      samples,
    }),
  );
} finally {
  await browser.close();
}
