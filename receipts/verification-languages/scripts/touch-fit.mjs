// Measures every touch button with each label it can carry, in each language, against its width.
import puppeteer from "puppeteer-core";
for (const lang of (process.argv[2] || "en,fr,es,zh,hi").split(",")) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:3012/?nolock=1&lang=${lang}&chapter=checkpoint`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__READY__ === true && window.__GAME__?.mode === "play", { timeout: 120000 });
    await page.touchscreen.tap(206, 300);
    await new Promise((r) => setTimeout(r, 1500));
    const result = await page.evaluate(async () => {
      const { t } = await import("./i18n.js");
      const words = { jump: ["Jump", "Rise"], drop: ["Hang", "Dive"], throw: ["Link", "Fire"], interact: ["Use"], roll: ["Roll"], shield: ["Shield"] };
      const out = [];
      for (const button of document.querySelectorAll("[data-touch]")) {
        const action = button.dataset.touch;
        const hidden = button.hidden, display = button.style.display, text = button.textContent;
        button.hidden = false;
        button.style.display = "grid";
        for (const word of words[action] || []) {
          button.textContent = t(word);
          const fits = button.scrollWidth <= button.clientWidth + 1;
          out.push(`${action}:${t(word)}:${button.clientWidth}${fits ? "" : " OVERFLOW " + button.scrollWidth}`);
        }
        button.textContent = text;
        button.hidden = hidden;
        button.style.display = display;
      }
      return out;
    });
    console.log(lang, result.join(" | "));
  } finally {
    await browser.close();
  }
}
