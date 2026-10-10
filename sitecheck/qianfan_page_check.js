// jsdom 回归：千帆一答产品页（下载计数渲染 + 要求段落齐全 + 无脚本报错）
// 跑法：cd /tmp/sitecheck && node qianfan_page_check.js
const fs = require("fs");
const { JSDOM } = require("jsdom");

const PAGE = "/var/www/html/qianfan-yida.html";   // 线上真实目录那份
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) failed++; };

const html = fs.readFileSync(PAGE, "utf-8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable",
  url: "file://" + PAGE,
  beforeParse(window) {
    // 站点脚本会用到：jsdom 不提供这些
    window.matchMedia = window.matchMedia || ((q) => ({
      matches: false, media: q, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; },
    }));
    window.IntersectionObserver = window.IntersectionObserver || class {
      constructor() {} observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    };
    window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
    // 打桩：/download/count → 固定 JSON（同时验证「取数后渲染」这条路）
    const realFetch = window.fetch;
    window.fetch = (url, opts) => {
      if (String(url).includes("/download/count")) {
        const name = decodeURIComponent(String(url).split("name=")[1] || "");
        const total = name.endsWith(".exe") ? 7 : 21;
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ name, total, site_hits: total, seed: 0 }),
        });
      }
      return realFetch ? realFetch(url, opts) : Promise.reject(new Error("no fetch"));
    };
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(800);                      // 等 defer 脚本 + fetch 微任务
  const doc = dom.window.document;

  console.log("=== 下载计数渲染（fetch 打桩后应显示真实数字）");
  const nodes = Array.from(doc.querySelectorAll("[data-dl-count]"));
  ok(nodes.length === 2, `下载计数占位元素 2 个（实际 ${nodes.length}）`);
  nodes.forEach((n) => {
    const name = n.getAttribute("data-dl-count");
    const want = name.endsWith(".exe") ? "7" : "21";
    ok(n.textContent.trim() === want, `${name} → 显示 "${n.textContent.trim()}"（期望 ${want}）`);
  });

  console.log("=== 审核要求段落齐全");
  const text = doc.body.textContent;
  [["软件名称与功能", "软件名称"], ["适用系统", "适用系统与运行环境"], ["收费版本与价格", "收费版本、价格与会员权益"],
   ["如何购买", "如何购买"], ["如何生效", "付款后如何生效"], ["售后与联系", "售后说明与联系方式"],
   ["退款政策", "退款与售后政策"], ["联系方式", "lan0o0@qq.com"], ["备案号", "豫ICP备2026039037号-1"],
   ["Windows 下载链接", "/download/qianfan-yida-desktop-v0.1.7-windows-x64.exe"],
   ["Android 下载链接", "/download/qianfan-yida-v1.0.53.apk"]].forEach(([label, needle]) => {
    ok(html.includes(needle), label + " 存在");
  });

  console.log("=== 价格与档位一致（¥29 / ¥49 / ¥59）");
  ["¥29", "¥49", "¥59"].forEach((p) => ok(text.includes(p), "含 " + p));

  console.log("=== 无脚本错误");
  const errs = dom.window.__errors || [];
  ok(errs.length === 0, `页面脚本错误数 ${errs.length}`);

  console.log(failed === 0 ? "\nPASS 全部通过" : `\nFAIL ${failed} 项未通过`);
  process.exit(failed ? 1 : 0);
})();
