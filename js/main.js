/* ============================================================
 * 格一网络 · Main interaction layer
 * Vanilla ES6+, no dependencies. Mobile-first progressive.
 * ============================================================ */
(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 配置区:FormSubmit 表单服务 ----------
   * FormSubmit (https://formsubmit.co) —— 无需注册、无需后端,
   * 提交转发到公司邮箱,契合"轻量无后端"理念。
   *
   * 已激活:首次提交后 FormSubmit 发了确认邮件,点击 Activate Form 链接完成激活。
   * 激活后 FormSubmit 分配一个随机 token,用它替代裸邮箱作为提交目标,
   * 既隐藏邮箱(防爬虫/防垃圾邮件),又保持转发到原邮箱。
   *
   * 公司:郑州格一网络科技有限公司(简称格一网络)
   * 收件邮箱:lan0o0@qq.com  (已通过 FormSubmit 激活)
   * -------------------------------------------------------------------------- */
  const CONFIG = {
    // FormSubmit 激活后分配的 token,绑定到 lan0o0@qq.com
    formToken: 'd6f16c692d30121f7f31ab1a120d1a12',
  };
  // FormSubmit AJAX 端点:返回 JSON,适合前端异步提交
  const formEndpoint = (token) => (token ? `https://formsubmit.co/ajax/${token}` : '');

  // 通用提交:JSON POST + Accept JSON,兼容 FormSubmit AJAX 协议
  // FormSubmit 字段:
  //   _subject  邮件主题(区分表单类型)
  //   _template 邮件模板(table / frilio / box)
  //   _captcha  关闭 reCAPTCHA(已用前端校验代替)
  async function postToService(endpoint, payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _template: 'table',
        _captcha: 'false',
        ...payload,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json().catch(() => ({}));
    // FormSubmit AJAX 成功时返回 { success: "true", message: "..." }
    // 首次提交未激活时返回 { success: "false", message: "..." }
    if (data && data.success === 'false') {
      throw new Error(data.message || 'FormSubmit 未激活');
    }
    return data;
  }
  // 提交按钮 loading 态
  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = busyText;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  /* ---------- Toast ---------- */
  let toastEl = null;
  let toastTimer = null;
  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
  }

  /* ---------- Navigation: glassmorphism on scroll + active link ---------- */
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => {
      const scrolled = window.scrollY > 24;
      nav.dataset.state = scrolled ? 'scrolled' : 'transparent';
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Active link highlight
    const path = location.pathname.split('/').pop() || 'index.html';
    $$('.nav__link').forEach((link) => {
      const href = link.getAttribute('href');
      if (href === path || (path === 'index.html' && href === 'index.html')) {
        link.classList.add('is-active');
      }
    });
  }

  /* ---------- Mobile menu ---------- */
  const burger = $('#navBurger');
  const mobile = $('#navMobile');
  if (burger && mobile) {
    const closeMenu = () => {
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '打开菜单');
      mobile.classList.remove('is-open');
      mobile.setAttribute('aria-hidden', 'true');
    };
    burger.addEventListener('click', () => {
      const open = mobile.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      mobile.setAttribute('aria-hidden', String(!open));
    });
    $$('.nav__mobile-link, .nav__mobile-cta', mobile).forEach((link) => {
      link.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobile.classList.contains('is-open')) closeMenu();
    });
  }

  /* ---------- Reveal on scroll (IntersectionObserver) ---------- */
  const revealEls = $$('[data-reveal]');
  if (revealEls.length) {
    if (prefersReduced || !('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach((el) => io.observe(el));
    }
  }

  /* ---------- Number counters ---------- */
  const counters = $$('.strength__num[data-target]');
  if (counters.length) {
    const animateCount = (el) => {
      const target = parseInt(el.dataset.target, 10);
      const suffix = el.dataset.suffix || '';
      const duration = 1400;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (prefersReduced) {
      counters.forEach((el) => (el.textContent = el.dataset.target + (el.dataset.suffix || '')));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      counters.forEach((el) => io.observe(el));
    }
  }

  /* ---------- Subscribe form (home) ---------- */
  const subscribeForm = $('#subscribeForm');
  if (subscribeForm) {
    subscribeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = $('#email', subscribeForm);
      const value = (emailInput.value || '').trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!valid) {
        emailInput.focus();
        showToast('请输入有效的邮箱地址');
        return;
      }
      const btn = $('.subscribe__submit', subscribeForm);

      // 未配置后端:本地模拟(数据不真正发出,仅存浏览器)
      if (!CONFIG.formToken) {
        try {
          const list = JSON.parse(localStorage.getItem('geyi_subscribers') || '[]');
          if (!list.includes(value)) list.push(value);
          localStorage.setItem('geyi_subscribers', JSON.stringify(list));
        } catch (_) {}
        subscribeForm.reset();
        showToast('已加入订阅列表(本地模拟·需配置 endpoint 后才能真正发送)');
        return;
      }

      // 已配置:真正提交到第三方服务
      setBusy(btn, true, '提交中…');
      try {
        await postToService(formEndpoint(CONFIG.formToken), {
          email: value,
          _subject: '订阅动态 - 格一网络',
        });
        subscribeForm.reset();
        showToast('已加入订阅列表,产品上架第一时间通知你');
      } catch (err) {
        showToast('提交失败,请稍后重试');
      } finally {
        setBusy(btn, false);
      }
    });
  }

  /* ---------- Parallax hero orbs (subtle) ---------- */
  const orbs = $$('.hero__orb');
  if (orbs.length && !prefersReduced) {
    let raf = null;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const cx = (e.clientX / window.innerWidth - 0.5);
        const cy = (e.clientY / window.innerHeight - 0.5);
        orbs.forEach((orb, i) => {
          const depth = (i + 1) * 18;
          orb.style.transform = `translate(${cx * depth}px, ${cy * depth}px)`;
        });
        raf = null;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
  }

  /* ---------- Drawer (products page) ---------- */
  const drawer = $('#drawer');
  const statusBadgeClass = {
    'App Store 审核中': 'badge--review',
    '即将上线': 'badge--soon',
    '开发中': 'badge--dev',
  };
  if (drawer) {
    const panel = $('.drawer__panel', drawer);
    const elDevice = $('[data-drawer-device]', drawer);
    const elScreen = $('[data-drawer-screen]', drawer);
    const elNum = $('[data-drawer-num]', drawer);
    const elLabel = $('[data-drawer-label]', drawer);
    const elTitle = $('[data-drawer-title]', drawer);
    const elTagline = $('[data-drawer-tagline]', drawer);
    const elStatus = $('[data-drawer-status]', drawer);
    const elFeatures = $('[data-drawer-features]', drawer);
    const notifyForm = $('#notifyForm', drawer);

    const openDrawer = (card) => {
      // Populate from data attributes
      const title = card.dataset.title;
      const tagline = card.dataset.tagline;
      const gradient = card.dataset.gradient;
      const num = card.dataset.num;
      const screenLabel = card.dataset.screenLabel;
      const statusText = card.dataset.statusText;
      const features = (card.dataset.features || '').split('::').filter(Boolean);

      if (elTitle) elTitle.textContent = title;
      if (elTagline) elTagline.textContent = tagline;
      if (elNum) elNum.textContent = num;
      if (elLabel) elLabel.textContent = screenLabel;
      if (elScreen) {
        elScreen.className = 'card__screen card__screen--gradient-' + gradient;
      }
      if (elStatus) {
        const cls = statusBadgeClass[statusText] || 'badge--soon';
        elStatus.innerHTML = `<span class="badge ${cls}">${statusText}</span>`;
      }
      if (elFeatures) {
        elFeatures.innerHTML = features
          .map((f) => `<div class="drawer__feature"><strong>·</strong> ${f}</div>`)
          .join('');
      }

      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const focusable = $('.drawer__close', panel);
      setTimeout(() => focusable && focusable.focus(), 320);
    };
    const closeDrawer = () => {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    // Wire product cards
    $$('.product').forEach((card) => {
      card.addEventListener('click', () => openDrawer(card));
    });

    // Close handlers (data-close attribute on overlay + close btn)
    $$('[data-close]', drawer).forEach((el) => el.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
    });

    if (notifyForm) {
      notifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = $('input[name="email"]', notifyForm);
        const value = (emailEl.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          emailEl.focus();
          showToast('请输入有效的邮箱地址');
          return;
        }
        const productTitle = (elTitle && elTitle.textContent) || '未知产品';
        const btn = $('.drawer__notify', notifyForm);

        // 未配置后端:本地模拟
        if (!CONFIG.formToken) {
          try {
            const list = JSON.parse(localStorage.getItem('geyi_subscribers') || '[]');
            if (!list.includes(value)) list.push(value);
            localStorage.setItem('geyi_subscribers', JSON.stringify(list));
          } catch (_) {}
          notifyForm.reset();
          showToast('已记录(本地模拟·需配置 endpoint 后才能真正发送)');
          setTimeout(closeDrawer, 600);
          return;
        }

        setBusy(btn, true, '提交中…');
        try {
          await postToService(formEndpoint(CONFIG.formToken), {
            email: value,
            _subject: '产品预约提醒 - 格一网络',
            product: productTitle,
          });
          notifyForm.reset();
          showToast('已记录,我们将提醒你关注 ' + productTitle);
          setTimeout(closeDrawer, 600);
        } catch (err) {
          showToast('提交失败,请稍后重试');
        } finally {
          setBusy(btn, false);
        }
      });
    }
  }

  /* ---------- Products filter ---------- */
  const filter = $('.filter');
  if (filter) {
    const items = $$('.product');
    filter.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter__btn');
      if (!btn) return;
      $$('.filter__btn', filter).forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const cat = btn.dataset.filter;
      items.forEach((item) => {
        const match = cat === 'all' || item.dataset.category === cat;
        item.style.display = match ? '' : 'none';
      });
    });
  }

  /* ---------- Contact form ---------- */
  const contactForm = $('#contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('[name="name"]', contactForm);
      const email = $('[name="email"]', contactForm);
      const message = $('[name="message"]', contactForm);
      let ok = true;
      if (!(name.value || '').trim()) { name.focus(); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email.value || '').trim())) { email.focus(); ok = false; }
      if (!(message.value || '').trim()) { message.focus(); ok = false; }
      if (!ok) {
        showToast('请补全所有必填项');
        return;
      }
      const btn = $('.form__submit', contactForm);
      const payload = {
        name: name.value.trim(),
        email: email.value.trim(),
        message: message.value.trim(),
        _subject: '官网联系留言 - 格一网络',
      };

      // 未配置后端:不清空表单(保留用户输入),引导改用邮件
      if (!CONFIG.formToken) {
        showToast('联系表单尚未接入后端,请改用邮件 lan0o0@qq.com');
        return;
      }

      setBusy(btn, true, '发送中…');
      try {
        await postToService(formEndpoint(CONFIG.formToken), payload);
        contactForm.reset();
        showToast('已收到你的留言,我们会尽快回复');
      } catch (err) {
        showToast('发送失败,请稍后重试或直接邮件联系');
      } finally {
        setBusy(btn, false);
      }
    });
  }

  /* ---------- Smooth-scroll for in-page anchors ---------- */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href');
    if (id.length <= 1) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
  });
})();
