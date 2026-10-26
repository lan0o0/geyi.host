// jsdom 回归：片羽拾光（TuGui 图归）上架检查
// 跑法：cd /tmp/sitecheck && node pianyu_check.js
const fs = require("fs");
const { JSDOM } = require("jsdom");

const ROOT = "/var/www/html";
let failed = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeDom(file, url) {
  const html = fs.readFileSync(file, "utf-8");
  return new JSDOM(html, {
    runScripts: "dangerously", resources: "usable", url,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q, addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; },
      }));
      window.IntersectionObserver = window.IntersectionObserver || class {
        constructor() {} observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
      };
      window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
      window.fetch = (u) => {
        const name = decodeURIComponent(String(u).split("name=")[1] || "");
        const total = name === "tugui-v1.18.4.apk" ? 7 : 21;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ name, total, site_hits: total, seed: 0 }) });
      };
    },
  });
}

(async () => {
  // ---------- 产品矩阵页 ----------
  const dom = makeDom(ROOT + "/products.html", "https://geyi.host/products.html");
  await sleep(800);
  const doc = dom.window.document;
  const $ = (s) => doc.querySelector(s);

  console.log("=== 产品矩阵：片羽拾光卡片");
  const card = $('.product[data-id="pianyu-shiguang"]');
  ok(!!card, "卡片存在（data-id=pianyu-shiguang）");
  ok(card && card.dataset.category === "beta", "分类为内测中(beta)");
  ok(card && card.dataset.download === "/download/tugui-v1.18.4.apk", "APK 下载地址正确");
  ok(card && card.dataset.detailUrl === "/pianyu-shiguang.html", "详情页地址正确");
  ok(card && /片羽拾光/.test(card.textContent), "卡片标题为片羽拾光");
  ok(card && !!card.querySelector('.card__screen--shot img[src="/jpg/片羽拾光.jpg"]'), "卡片使用真机截图");
  ok(doc.querySelectorAll(".product").length === 7, `卡片总数 7（实际 ${doc.querySelectorAll(".product").length}）`);

  console.log("=== 抽屉：点击片羽拾光");
  card.click();
  await sleep(700);
  ok($("#drawer").classList.contains("is-open"), "抽屉已打开");
  ok($("[data-drawer-title]").textContent === "片羽拾光", "标题已填充");
  ok($("[data-drawer-device]").hidden === false, "顶部产品图显示（该产品只有一张图）");
  ok(/片羽拾光\.jpg/.test($("[data-drawer-screen]").innerHTML), "屏幕显示截图");
  ok($("[data-drawer-shots]").hidden === true, "无 data-shots 时不显示截图区（避免与顶图重复）");
  ok($("[data-drawer-status]").textContent.includes("内测中"), "状态徽标为内测中");
  ok($("[data-drawer-download]").hidden === false, "下载区显示");
  ok($("[data-drawer-dl-link]").getAttribute("href") === "/download/tugui-v1.18.4.apk", "Android 下载链接正确");
  ok($("[data-drawer-dl-link]").textContent.includes("Android"), "按钮文案为 Android 版");
  ok($("[data-drawer-pc-link]").hidden === true, "无 Windows 版时 PC 按钮隐藏");
  ok($("[data-drawer-pc-meta-row]").hidden === true, "PC 版本行隐藏");
  ok(/v1\.18\.4/.test($("[data-drawer-dl-meta]").textContent), "版本信息已填充");
  ok($("[data-drawer-dl-count]").textContent.trim() === "7", `下载次数已渲染（实际 "${$("[data-drawer-dl-count]").textContent.trim()}"）`);
  ok($("[data-drawer-detail]").hidden === false && $("[data-drawer-detail]").getAttribute("href") === "/pianyu-shiguang.html", "详情按钮指向产品页");
  ok($("#notifyForm").hidden === true, "可下载产品不再显示预约表单");

  console.log("=== 反向断言：切到成长积分卡应回退");
  Array.from(doc.querySelectorAll(".product")).find((c) => c.dataset.title === "成长积分卡").click();
  await sleep(700);
  ok($("[data-drawer-device]").hidden === false, "顶部产品图恢复");
  ok($("[data-drawer-download]").hidden === true, "下载区隐藏");
  ok($("[data-drawer-dl-link]").hidden === true, "Android 按钮隐藏");
  ok($("[data-drawer-detail]").hidden === true, "详情按钮隐藏");
  ok($("#notifyForm").hidden === false, "预约表单恢复");

  console.log("=== 导航与首页");
  ok(doc.querySelectorAll('.nav__dropdown .nav__dropdown-link[href="pianyu-shiguang.html"]').length === 1, "桌面下拉含片羽拾光");
  ok(doc.querySelectorAll('.nav__mobile .nav__mobile-link[href="pianyu-shiguang.html"]').length === 1, "移动端菜单含片羽拾光");
  ok(/七款应用/.test(doc.querySelector(".page-hero__title").textContent), "标题数量词已改为七款");

  const idx = makeDom(ROOT + "/index.html", "https://geyi.host/");
  await sleep(700);
  const idoc = idx.window.document;
  const teaser = idoc.querySelector('a.card--teaser[href="products.html#pianyu-shiguang"]');
  ok(!!teaser, "首页 teaser 卡片存在且深链正确");
  ok(teaser && !!teaser.querySelector('img[src="jpg/片羽拾光.jpg"]'), "首页 teaser 使用该截图");
  ok(idoc.querySelectorAll('.teaser__track .card--teaser').length === 7, `首页 teaser 共 7 张（实际 ${idoc.querySelectorAll('.teaser__track .card--teaser').length}）`);
  ok(idoc.querySelectorAll('.nav__dropdown-link[href="pianyu-shiguang.html"]').length === 1, "首页下拉含片羽拾光");

  // ---------- 产品详情页 ----------
  console.log("=== 片羽拾光产品页");
  const pdom = makeDom(ROOT + "/pianyu-shiguang.html", "https://geyi.host/pianyu-shiguang.html");
  await sleep(800);
  const pdoc = pdom.window.document;
  ok(pdoc.querySelectorAll('[data-dl-count="tugui-v1.18.4.apk"]').length === 1, "下载次数占位存在");
  ok(pdoc.querySelector('[data-dl-count="tugui-v1.18.4.apk"]').textContent.trim() === "7", "下载次数已从计数服务渲染");
  ok(pdoc.querySelector('a[href="/download/tugui-v1.18.4.apk"]') !== null, "详情页有 APK 下载入口");
  ok(/v1\.18\.4/.test(pdoc.body.textContent), "页面含版本号 v1.18.4");
  ok(/内测期免费/.test(pdoc.body.textContent), "含内测期免费声明");
  ok(pdoc.querySelector('img[src="jpg/片羽拾光.jpg"]') !== null, "含应用截图");
  ok(pdoc.querySelectorAll('.nav__dropdown-link[href="pianyu-shiguang.html"]').length === 1, "导航含自身且 aria-current");
  ok(pdoc.querySelector('.nav__dropdown-link[href="pianyu-shiguang.html"]').getAttribute("aria-current") === "page", "aria-current=page");

  console.log(failed === 0 ? "\nPASS 全部通过" : `\nFAIL ${failed} 项未通过`);
  process.exit(failed ? 1 : 0);
})();
