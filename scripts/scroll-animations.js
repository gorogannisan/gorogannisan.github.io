(function () {
  'use strict';

  function initAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      console.warn('GSAP or ScrollTrigger not loaded');
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // 1. Hero: Soft reveal of portrait canvas, subtitle, and buttons
    // NOTE: We do NOT touch .hr-title or .hr-wm because hero.js animates the pixel font!
    var heroCanvas = document.querySelector('#hero .hr-canvas');
    if (heroCanvas) {
      gsap.fromTo(
        heroCanvas,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 1.4, ease: 'power2.out' }
      );
    }

    var heroExtra = document.querySelectorAll('#hero .hr-sub, #hero .hr-actions');
    if (heroExtra.length) {
      gsap.fromTo(
        heroExtra,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 1.0, stagger: 0.2, delay: 0.5, ease: 'power3.out' }
      );
    }

    // 2. Alternating Sections (.fg-section-list): Text slide-up and visual scale-in
    document.querySelectorAll('.fg-section-list').forEach(function (sec) {
      var rowText = sec.querySelector('.fg-row-text');
      var rowVisual = sec.querySelector('.fg-row-visual');

      if (rowText) {
        gsap.fromTo(
          rowText.children,
          { opacity: 0, y: 45 },
          {
            scrollTrigger: {
              trigger: sec,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.85,
            stagger: 0.12,
            ease: 'power3.out',
          }
        );
      }

      if (rowVisual) {
        gsap.fromTo(
          rowVisual,
          { opacity: 0, scale: 0.82 },
          {
            scrollTrigger: {
              trigger: sec,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            scale: 1,
            duration: 1.1,
            ease: 'power3.out',
          }
        );
      }
    });

    // 3. Projects Section (.projects-section): Header & Card Cascade
    var projectsSec = document.querySelector('#projects');
    if (projectsSec) {
      var projHead = projectsSec.querySelector('.projects-header');
      if (projHead) {
        gsap.fromTo(
          projHead.children,
          { opacity: 0, y: 40 },
          {
            scrollTrigger: {
              trigger: projectsSec,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: 'power3.out',
          }
        );
      }

      var cards = projectsSec.querySelectorAll('.project-card');
      if (cards.length) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 65, scale: 0.94 },
          {
            scrollTrigger: {
              trigger: '.projects-grid',
              start: 'top 82%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.9,
            stagger: 0.18,
            ease: 'power3.out',
          }
        );
      }
    }

    // 4. FAQ Section (.fq-wrap): Header & List Cascade
    var fqSec = document.querySelector('#faq');
    if (fqSec) {
      var fqHead = fqSec.querySelector('.fq-head');
      if (fqHead) {
        gsap.fromTo(
          fqHead.children,
          { opacity: 0, y: 35 },
          {
            scrollTrigger: {
              trigger: fqSec,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.75,
            stagger: 0.1,
            ease: 'power3.out',
          }
        );
      }

      var items = fqSec.querySelectorAll('.fq-item');
      if (items.length) {
        gsap.fromTo(
          items,
          { opacity: 0, x: -35 },
          {
            scrollTrigger: {
              trigger: '.fq-list',
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            x: 0,
            duration: 0.7,
            stagger: 0.1,
            ease: 'power2.out',
          }
        );
      }
    }

    // 5. Footer (.ft)
    var ft = document.querySelector('#footer');
    if (ft) {
      var ftH = ft.querySelector('.ft-h');
      var ftCols = ft.querySelectorAll('.ft-col');
      if (ftH) {
        gsap.fromTo(
          ftH,
          { opacity: 0, y: 40 },
          {
            scrollTrigger: {
              trigger: ft,
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.85,
            ease: 'power3.out',
          }
        );
      }
      if (ftCols.length) {
        gsap.fromTo(
          ftCols,
          { opacity: 0, y: 30 },
          {
            scrollTrigger: {
              trigger: '.ft-cols',
              start: 'top 92%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.75,
            stagger: 0.12,
            ease: 'power3.out',
          }
        );
      }
    }

    // Refresh ScrollTrigger calculations after everything finishes rendering
    ScrollTrigger.refresh();
  }

  // Run on DOM ready and also refresh on full window load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnimations);
  } else {
    initAnimations();
  }

  window.addEventListener('load', function () {
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.refresh();
    }
  });
})();
