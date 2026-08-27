/* ============================================================
 * Nullspace Studio · Main interaction layer
 * Vanilla ES6+, no dependencies. Mobile-first progressive.
 * ============================================================ */
(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    subscribeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = $('#email', subscribeForm);
      const value = (emailInput.value || '').trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!valid) {
        emailInput.focus();
        showToast('请输入有效的邮箱地址');
        return;
      }
      // Persist locally (front-end only, no backend)
      try {
        const list = JSON.parse(localStorage.getItem('ns_subscribers') || '[]');
        if (!list.includes(value)) list.push(value);
        localStorage.setItem('ns_subscribers', JSON.stringify(list));
      } catch (_) {}
      subscribeForm.reset();
      showToast('已加入订阅列表,产品上架第一时间通知你');
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
      notifyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('input[name="email"]', notifyForm);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email.value || '').trim())) {
          email.focus();
          showToast('请输入有效的邮箱地址');
          return;
        }
        notifyForm.reset();
        showToast('已记录,我们将提醒你关注这款产品');
        setTimeout(closeDrawer, 600);
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
    contactForm.addEventListener('submit', (e) => {
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
      contactForm.reset();
      showToast('已收到你的留言,我们会尽快回复');
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
