// jsdom 回归：产品矩阵页抽屉（千帆一答：隐藏顶图 / PC 下载 + 计数 / 详情按钮）+ 导航下拉
// 跑法：cd sitecheck && npm i jsdom && node products_drawer_check.js
const fs = require("fs");
const { JSDOM } = require("jsdom");

const PAGE = "/var/www/html/products.html";
const CSS = "/var/www/html/css/style.css";
let failed = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failed++; };

const html = fs.readFileSync(PAGE, "utf-8");
const dom = new JSDOM(html, {
  runScripts: "dangerously", resources: "usable", url: "file://" + PAGE,
  beforeParse(window) {
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; },
    }));
    window.IntersectionObserver = window.IntersectionObserver || class {
      constructor() {} observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    };
    window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
    window.fetch = (url) => {
      const name = decodeURIComponent(String(url).split("name=")[1] || "");
      const total = name.endsWith(".exe") ? 3 : 21;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name, total, site_hits: total, seed: 0 }) });
    };
  },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => dom.window.document.querySelector(sel);

(async () => {
  await sleep(700);
  const doc = dom.window.document;

  console.log("=== 导航：产品矩阵下拉，主栏不再单列「千帆一答」");
  ok(doc.querySelectorAll('.nav__links .nav__link[href="qianfan-yida.html"]').length === 0,
     "主栏无「千帆一答」直链");
  ok(doc.querySelectorAll('.nav__item .nav__dropdown .nav__dropdown-link[href="qianfan-yida.html"]').length === 1,
     "下拉里有「千帆一答」");
  ok(/\.nav__item:hover > \.nav__dropdown/.test(fs.readFileSync(CSS, "utf-8")),
     "CSS 含 hover 展开规则");

  console.log("=== 千帆一答抽屉：去掉顶部单张产品图");
  const card = doc.querySelector('.product[data-id="qianfan-yida"]');
  card.click();
  await sleep(600);
  const drawer = doc.querySelector("#drawer");
  ok(drawer.classList.contains("is-open"), "抽屉已打开");
  ok($("[data-drawer-device]").hidden === true, "顶部产品图已隐藏");
  ok($("[data-drawer-shots]").hidden === false, "应用截图区仍显示");

  console.log("=== 千帆一答抽屉：PC 端下载 + 计数");
  const pc = $("[data-drawer-pcdl]");
  ok(pc.hidden === false, "PC 下载块显示");
  ok($("[data-drawer-pc-link]").getAttribute("href") === "/download/qianfan-yida-desktop-v0.1.7-windows-x64.exe",
     "PC 下载链接正确");
  ok(/v0\.1\.7/.test($("[data-drawer-pc-meta]").textContent), "PC 版本信息已填充");
  ok($("[data-drawer-pc-count]").textContent.trim() === "3", `PC 下载次数已渲染（实际 "${$("[data-drawer-pc-count]").textContent.trim()}"）`);
  ok($("[data-drawer-dl-count]").textContent.trim() === "21", `APK 下载次数仍渲染（实际 "${$("[data-drawer-dl-count]").textContent.trim()}"）`);

  console.log("=== 千帆一答抽屉：详情按钮");
  const detail = $("[data-drawer-detail]");
  ok(detail.hidden === false, "详情按钮显示");
  ok(detail.getAttribute("href") === "/qianfan-yida.html", "详情按钮指向产品页");
  ok($("#notifyForm").hidden === true, "内测可下载产品不再显示预约表单");

  console.log("=== 反向断言：切到其它产品（成长积分卡）应全部回退");
  const other = Array.from(doc.querySelectorAll(".product")).find((c) => c.dataset.title === "成长积分卡");
  other.click();
  await sleep(600);
  ok($("[data-drawer-device]").hidden === false, "顶部产品图恢复显示");
  ok($("[data-drawer-pcdl]").hidden === true, "PC 下载块隐藏");
  ok($("[data-drawer-detail]").hidden === true, "详情按钮隐藏");
  ok($("[data-drawer-shots]").hidden === true, "截图区隐藏（该产品无截图）");
  ok($("#notifyForm").hidden === false, "预约表单恢复显示");

  console.log(failed === 0 ? "\nPASS 全部通过" : `\nFAIL ${failed} 项未通过`);
  process.exit(failed ? 1 : 0);
})();
