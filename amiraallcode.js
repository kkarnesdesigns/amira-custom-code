/* =============================================================================
   Utils (ready, debounce, waitFor)
============================================================================= */
(() => {
  const U = {
    debounce(fn, delay = 150) {
      let t;
      return function debounced(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
      };
    },
    onReady(cb) {
      if (document.readyState !== "loading") cb();
      else document.addEventListener("DOMContentLoaded", cb, { once: true });
    },
    waitFor(checkFn, { timeout = 8000, interval = 50 } = {}) {
      return new Promise((res, rej) => {
        if (checkFn()) return res(true);
        const start = Date.now();
        const timer = setInterval(() => {
          if (checkFn()) {
            clearInterval(timer);
            res(true);
          } else if (Date.now() - start > timeout) {
            clearInterval(timer);
            rej(new Error("waitFor timeout"));
          }
        }, interval);
      });
    },
    has(el) {
      return !!(el && (el.length === undefined ? el : el.length));
    },
  };
  window.__DF_UTILS__ = U;
})();

/* =============================================================================
     0. Dev “edit mode” off
  ============================================================================= */
(() => {
  const { onReady } = window.__DF_UTILS__;
  onReady(() => {
    document.querySelectorAll(".dev-edite-mode.is-on").forEach((el) => {
      el.classList.remove("is-on");
    });
  });
})();

/* =============================================================================
     1. Clickable CMS cards (safe)
     – Delegation for card body / "Read the Post" clicks.
     – Wraps card images in <a> tags so they are native links.
     – Re-runs after Finsweet pagination loads new items.
  ============================================================================= */
(() => {
  const { onReady } = window.__DF_UTILS__;

  function wrapCardImages() {
    document
      .querySelectorAll(
        ".card-white-blog .box-ratio-cover:not(.__img-linked), .grid-blog-content .box-ratio-cover:not(.__img-linked)"
      )
      .forEach((img) => {
        img.classList.add("__img-linked");
        const block = img.closest(".card-white-blog, .grid-blog-content");
        if (!block) return;
        const link = block.querySelector(".is-cms-link");
        if (!link?.href) return;
        const a = document.createElement("a");
        a.href = link.href;
        a.style.display = "block";
        img.parentNode.insertBefore(a, img);
        a.appendChild(img);
      });
  }

  onReady(() => {
    wrapCardImages();
    document.addEventListener("fs-cmsload", () =>
      requestAnimationFrame(wrapCardImages)
    );

    // Delegation for non-image, non-link areas (e.g. "Read the Post")
    document.addEventListener(
      "click",
      (ev) => {
        const block = ev.target.closest(".card-white-blog, .grid-blog-content");
        if (!block) return;
        if (ev.target.closest("a, button, [role='button']")) return;
        const link = block.querySelector(".is-cms-link");
        if (link?.href) window.location.href = link.href;
      },
      true
    );

    const style = document.createElement("style");
    style.textContent =
      ".card-white-blog, .grid-blog-content { cursor: pointer; }";
    document.head.appendChild(style);
  });
})();

/* =============================================================================
     2. Interactive Grid Tabs (GSAP + ScrollTrigger)
  ============================================================================= */
(() => {
  const { onReady, debounce, waitFor } = window.__DF_UTILS__;

  function initInteractiveGrids(root = document) {
    const wrappers = root.querySelectorAll(
      ".interactive-grid_wrapper:not(.__inited)"
    );
    if (!wrappers.length) return;
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined")
      return;

    gsap.registerPlugin(ScrollTrigger);

    wrappers.forEach((wrapper) => {
      wrapper.classList.add("__inited");
      setupInteractiveGrid(wrapper);
    });

    function setupInteractiveGrid(wrapper) {
      const duration = parseFloat(wrapper.dataset.stepDuration) || 6;
      const autoMediaHeight = wrapper.dataset.mediaWrapperAuto === "true";
      const fadeDuration = parseFloat(wrapper.dataset.fadeDuration) || 0.5;
      const animateInterContent = wrapper.dataset.animeInterContent === "true";

      const tabEls = Array.from(wrapper.querySelectorAll(".interactive-tab"));
      if (!tabEls.length) return;

      const tabs = tabEls.map((el) => ({
        container: el,
        hidden: el.querySelector(".interactive-tab_content_hidden"),
        visible: el.querySelector(".interactive-tab_content_visible"),
        content: el.querySelector(".interactive-tab_content"),
        bullet: el.querySelector(".bullets_active"),
        mediaWrapper: el.querySelector(".interactive-tab_media_wrap"),
        progressBar: el.querySelector(".interactive-progress"),
        progressWrapper: el.querySelector(".interactive-progress_wrap"),
        lottieEl: el.querySelector(".lottie-element"),
        contentInteractiveMedia: el.querySelector(
          ".content-in-interactive-media"
        ),
      }));

      let heightCache = [];
      let activeIndex = 0;
      let playTimer = null;
      let progressTween = null;
      let isAutoPlay = true;
      let isInViewport = false;

      function measureHeights() {
        heightCache = tabs.map((tab) => {
          if (!tab.hidden) return 0;
          const w = tab.hidden.getBoundingClientRect().width;
          gsap.set(tab.hidden, {
            height: "auto",
            width: `${w}px`,
            opacity: 1,
            position: "absolute",
            visibility: "hidden",
          });
          const h = tab.hidden.scrollHeight;
          gsap.set(tab.hidden, {
            clearProps: "height,width,opacity,position,visibility",
          });
          return h;
        });
      }
      measureHeights();

      const reMeasure = debounce(() => {
        measureHeights();
        const a = tabs[activeIndex];
        if (!a) return;
        if (a.hidden) gsap.set(a.hidden, { height: "auto", opacity: 1 });
        if (a.mediaWrapper) {
          if (window.innerWidth < 991) {
            if (autoMediaHeight) {
              gsap.set(a.mediaWrapper, { height: "auto", opacity: 1 });
            } else {
              gsap.set(a.mediaWrapper, {
                height: "80vw",
                overflow: "hidden",
                opacity: 1,
              });
            }
          } else {
            gsap.set(a.mediaWrapper, { clearProps: "height", opacity: 1 });
          }
        }
      }, 100);

      window.addEventListener("resize", reMeasure, { passive: true });

      function clearPlay() {
        if (playTimer) clearTimeout(playTimer);
        playTimer = null;
        if (progressTween) progressTween.kill();
        progressTween = null;
      }

      function startProgress() {
        if (!isAutoPlay || !isInViewport) return;
        const t = tabs[activeIndex];
        if (!t?.progressBar || !t?.progressWrapper) return;
        clearPlay();
        gsap.set(t.progressWrapper, { opacity: 1 });
        gsap.set(t.progressBar, { opacity: 1, width: 0 });
        progressTween = gsap.fromTo(
          t.progressBar,
          { width: 0 },
          { width: "100%", ease: "none", duration }
        );
        playTimer = setTimeout(
          () => activateTab((activeIndex + 1) % tabs.length, false),
          duration * 1000
        );
      }

      const scrollStart = wrapper.dataset.scrollStart || "top 100%";
      const scrollEnd = wrapper.dataset.scrollEnd || "bottom 0%";
      ScrollTrigger.create({
        trigger: wrapper,
        start: scrollStart,
        end: scrollEnd,
        onEnter: () => ((isInViewport = true), startProgress()),
        onEnterBack: () => ((isInViewport = true), startProgress()),
        onLeave: () => ((isInViewport = false), clearPlay()),
        onLeaveBack: () => ((isInViewport = false), clearPlay()),
      });

      function resetTabs() {
        tabs.forEach((tab) => {
          tab.container?.classList.remove("is-interactive-active");
          if (tab.hidden)
            gsap.set(tab.hidden, { clearProps: "height,opacity,width" });
          if (tab.mediaWrapper)
            gsap.set(tab.mediaWrapper, { clearProps: "height,opacity" });
          if (tab.progressWrapper)
            gsap.set(tab.progressWrapper, { clearProps: "opacity" });
          if (tab.progressBar)
            gsap.set(tab.progressBar, { clearProps: "width,opacity" });
          if (tab.content) gsap.set(tab.content, { clearProps: "opacity" });
          if (tab.bullet) gsap.set(tab.bullet, { clearProps: "opacity" });
          if (animateInterContent && tab.contentInteractiveMedia) {
            gsap.set(tab.contentInteractiveMedia, {
              clearProps: "opacity,y,zIndex,position",
            });
          }
        });
      }

      function activateTab(index, userClicked) {
        const mobileUpStop = wrapper.dataset.mobileUpStop === "true";
        activeIndex = index;
        resetTabs();
        clearPlay();

        const tab = tabs[index];
        if (!tab) return;
        tab.container?.classList.add("is-interactive-active");

        tab.content &&
          gsap.to(tab.content, {
            opacity: 1,
            duration: fadeDuration,
            ease: "power2.out",
          });
        tab.bullet &&
          gsap.to(tab.bullet, {
            opacity: 1,
            duration: fadeDuration,
            ease: "power2.out",
          });
        tab.visible &&
          gsap.to(tab.visible, {
            opacity: 1,
            duration: fadeDuration,
            ease: "power2.out",
          });

        if (tab.hidden) {
          gsap.fromTo(
            tab.hidden,
            { height: 0, opacity: 0 },
            {
              height: `${heightCache[index]}px`,
              opacity: 1,
              duration: 0.5,
              ease: "power2.out",
              onComplete: () => gsap.set(tab.hidden, { height: "auto" }),
            }
          );
        }

        if (tab.mediaWrapper) {
          if (window.innerWidth < 991) {
            if (autoMediaHeight) {
              const mw = tab.mediaWrapper;
              const w = mw.getBoundingClientRect().width;
              gsap.set(mw, {
                height: "auto",
                width: `${w}px`,
                position: "absolute",
                visibility: "hidden",
              });
              const targetH = mw.scrollHeight;
              gsap.set(mw, {
                clearProps: "width,position,visibility",
                height: 0,
                overflow: "hidden",
                opacity: 1,
              });
              gsap.to(mw, {
                height: `${targetH}px`,
                duration: 0.5,
                ease: "power2.out",
                onComplete: () => gsap.set(mw, { height: "auto" }),
              });
            } else {
              gsap.to(tab.mediaWrapper, {
                height: "68vw",
                overflow: "hidden",
                opacity: 1,
                duration: 0.5,
                ease: "power2.out",
              });
            }
          } else {
            gsap.to(tab.mediaWrapper, {
              opacity: 1,
              duration: 0.5,
              ease: "power2.out",
            });
          }
        }

        if (
          animateInterContent &&
          window.innerWidth >= 991 &&
          tab.contentInteractiveMedia
        ) {
          tab.contentInteractiveMedia.style.position = "relative";
          tab.contentInteractiveMedia.style.zIndex = "10";
          gsap.fromTo(
            tab.contentInteractiveMedia,
            { y: 40, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }
          );
        }

        if (userClicked) {
          isAutoPlay = false;
          if (tab.progressWrapper && tab.progressBar) {
            gsap.set(tab.progressWrapper, { opacity: 1 });
            gsap.set(tab.progressBar, { opacity: 1, width: "100%" });
          }
        } else {
          startProgress();
        }

        if (userClicked && window.innerWidth < 991 && !mobileUpStop) {
          const header = document.querySelector("header, .navbar_component");
          const headerH = header ? header.getBoundingClientRect().height : 0;
          const extraOff = 30;
          const topY =
            tab.container.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: topY - headerH - extraOff,
            behavior: "smooth",
          });
        }

        if (tab.lottieEl?.__lottieAnim)
          tab.lottieEl.__lottieAnim.goToAndPlay(0, true);
      }

      tabs.forEach((tab, i) => {
        const clickArea = tab.container?.querySelector(
          ".interactive-tab_content_wrap"
        );
        if (clickArea) {
          clickArea.addEventListener("click", () => {
            if (activeIndex !== i) activateTab(i, true);
          });
        }
      });

      activateTab(0, false);
    }
  }

  onReady(() => {
    waitFor(
      () => typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined"
    )
      .then(() => initInteractiveGrids())
      .catch(() => {
        /* silently skip if no GSAP */
      });

    // Re-init on .menu_tab click after dynamic content changes
    document.addEventListener("click", (e) => {
      if (e.target.closest(".menu_tab")) {
        setTimeout(() => {
          initInteractiveGrids();
          if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
          window.dispatchEvent(new Event("resize"));
        }, 50);
      }
    });
  });
})();

/* =============================================================================
     3. Progress lines in scrolling components (GSAP)
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;
  onReady(() => {
    waitFor(
      () => typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined"
    )
      .then(() => {
        const boxes = document.querySelectorAll(
          ".box-wrapper-scroll, .scrolling_component"
        );
        if (!boxes.length) return;
        boxes.forEach((box) => {
          const line = box.querySelector(".progress-line-scroll");
          if (!line) return;
          gsap.to(line, {
            height: "100%",
            ease: "none",
            scrollTrigger: {
              trigger: box,
              start: "top 50%",
              end: "bottom 50%",
              scrub: 0.7,
            },
          });
        });
      })
      .catch(() => {
        /* skip if no GSAP */
      });
  });
})();

/* =============================================================================
     4. Sticky cards transform (desktop only) + wiring
  ============================================================================= */
(() => {
  const { onReady, debounce } = window.__DF_UTILS__;

  function applyCardTransforms() {
    if (window.innerWidth < 768) return;
    const cards = document.querySelectorAll(".layout_card");
    if (!cards.length) return;
    const vh = window.innerHeight;
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const ratio = Math.min(
        Math.max(1 - Math.abs(mid - vh / 2) / (vh / 2), 0),
        1
      );
      const scale = 0.9 + ratio * 0.1;
      const offsetY = index * 12;
      card.style.transform = `translateY(${offsetY}px) scale(${scale})`;
    });
  }
  window.applyCardTransforms = applyCardTransforms; // used by slider block

  onReady(() => {
    const deb = debounce(applyCardTransforms, 150);
    window.addEventListener("scroll", applyCardTransforms, { passive: true });
    window.addEventListener("resize", deb);
    window.addEventListener("orientationchange", deb);
    window.addEventListener("load", applyCardTransforms, { passive: true });
  });
})();

/* =============================================================================
     5. Sticky slider (sticky-swiper-investor) with deferred Swiper
  ============================================================================= */
(() => {
  const { onReady, debounce, waitFor } = window.__DF_UTILS__;

  const SELECTOR = ".sticky-swiper-investor";
  const BP = 768;

  const instances = new Map(); // el -> Swiper

  function listStickyEls() {
    return Array.from(document.querySelectorAll(SELECTOR));
  }

  function getControls(sliderEl) {
    const block = sliderEl.closest(".block-wrapper") || document;
    return {
      prevArrow: block.querySelector("#blog-arrow-slider-prev") || null,
      nextArrow: block.querySelector("#blog-arrow-slider-next") || null,
      scrollbarEl: block.querySelector(".swiper-scrollbar") || null,
      paginationEl: block.querySelector(".swiper-pagination") || null,
    };
  }

  function createSwiper(el) {
    const { prevArrow, nextArrow, scrollbarEl, paginationEl } = getControls(el);

    const opts = {
      slidesPerView: 1,
      spaceBetween: 12,
      grabCursor: true,
      a11y: true,
      loop: false,
      initialSlide: 0,
      breakpoints: {
        0: { slidesPerView: 1 },
        480: { slidesPerView: 1 },
        640: { slidesPerView: 1 },
      },
    };

    if (prevArrow && nextArrow) {
      opts.navigation = { prevEl: prevArrow, nextEl: nextArrow };
    }
    if (scrollbarEl) {
      opts.scrollbar = { el: scrollbarEl, hide: false, draggable: true };
    }
    if (paginationEl) {
      opts.pagination = { el: paginationEl, type: "progressbar" };
    }

    const inst = new Swiper(el, opts);
    instances.set(el, inst);
    return inst;
  }

  function destroySwiper(el) {
    const inst = instances.get(el);
    if (inst) {
      inst.destroy(true, true);
      instances.delete(el);
    }
  }

  function gcInstances() {
    for (const el of Array.from(instances.keys())) {
      if (!document.documentElement.contains(el)) destroySwiper(el);
    }
  }

  onReady(() => {
    let running = false;

    const maybeInitAll = () => {
      if (running) return;
      running = true;
      try {
        if (!window.Swiper) return;

        const w = window.innerWidth;
        const els = listStickyEls();

        gcInstances();

        els.forEach((el) => {
          const has = instances.has(el);
          if (w < BP && !has) {
            createSwiper(el);
          } else if (w >= BP && has) {
            destroySwiper(el);
          }
        });
      } finally {
        running = false;
      }
    };

    const deb = debounce(maybeInitAll, 200);

    waitFor(() => !!window.Swiper, { timeout: 7000 }).finally(() => {
      maybeInitAll();
      window.addEventListener("resize", deb, { passive: true });
      window.addEventListener("orientationchange", deb, { passive: true });
      window.addEventListener("pageshow", maybeInitAll, { passive: true });
    });

    const mo = new MutationObserver(deb);
    mo.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener("load", maybeInitAll, { passive: true });
  });
})();

/* =============================================================================
     6. Marquee (no jank safeguards)
  ============================================================================= */
(() => {
  const { onReady } = window.__DF_UTILS__;
  function initMarquees(selector, speed) {
    const marquees = document.querySelectorAll(selector);
    if (!marquees.length) return;
    marquees.forEach((parent) => {
      const original = parent.innerHTML;
      parent.insertAdjacentHTML("beforeend", original);
      parent.insertAdjacentHTML("beforeend", original);
      let offset = 0;
      let paused = false;
      // Example hover pause (optional):
      // parent.addEventListener("mouseenter", () => (paused = true));
      // parent.addEventListener("mouseleave", () => (paused = false));
      setInterval(() => {
        if (paused) return;
        const first = parent.firstElementChild;
        if (!first) return;
        first.style.marginLeft = `-${offset}px`;
        if (offset > first.clientWidth) offset = 0;
        else offset += speed;
      }, 16);
    });
  }
  onReady(() => initMarquees(".marquee", 0.9));
})();

/* =============================================================================
     7. Slider for Related Resources (.blog-swiper-wrap) – wait for Swiper
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;

  onReady(() => {
    waitFor(() => !!window.Swiper, { timeout: 7000 })
      .then(() => {
        document.querySelectorAll(".blog-swiper-wrap").forEach((sliderEl) => {
          const block = sliderEl.closest(".block-wrapper") || document;
          const prevArrow = block.querySelector("#blog-arrow-slider-prev");
          const nextArrow = block.querySelector("#blog-arrow-slider-next");

          const swiper = new Swiper(sliderEl, {
            slidesPerView: 1,
            spaceBetween: 20,
            effect: "fade",
            fadeEffect: { crossFade: true },
            speed: 600,
            navigation:
              prevArrow && nextArrow
                ? { prevEl: prevArrow, nextEl: nextArrow }
                : undefined,
            breakpoints: {
              992: { slidesPerView: 1, spaceBetween: 20 },
              768: { slidesPerView: 1, spaceBetween: 8 },
              0: { slidesPerView: 1, spaceBetween: 8 },
            },
            on: {
              afterInit(sw) {
                fixA11y(sw.el);
              },
              slidesLengthChange(sw) {
                fixA11y(sw.el);
              },
            },
          });

          function fixA11y(root) {
            const wrapper = root.querySelector(".swiper-wrapper");
            if (wrapper) wrapper.setAttribute("role", "list");
            root.querySelectorAll(".swiper-slide").forEach((slide) => {
              slide.setAttribute("role", "listitem");
              slide.removeAttribute("aria-roledescription");
            });
          }

          function updateArrowState() {
            if (!prevArrow || !nextArrow) return;
            prevArrow.classList.toggle("is-on", !swiper.isBeginning);
            nextArrow.classList.toggle("is-on", !swiper.isEnd);
          }
          updateArrowState();
          swiper.on("slideChange", updateArrowState);
          swiper.on("breakpoint", updateArrowState);
        });
      })
      .catch(() => {
        /* no Swiper → skip */
      });
  });
})();

/* =============================================================================
     8. Simple Custom Tabs (.tab-wrapper)
  ============================================================================= */
(() => {
  const { onReady } = window.__DF_UTILS__;
  onReady(() => {
    document.querySelectorAll(".tab-wrapper").forEach((wrapper) => {
      const tabs = wrapper.querySelectorAll(
        ".menu_tab, .switch_tab, .tab-img_switch"
      );
      const panels = wrapper.querySelectorAll(".content_tab");
      if (!tabs.length || !panels.length) return;

      tabs.forEach((tab, idx) => {
        tab.addEventListener("click", () => {
          tabs.forEach((t) => t.classList.remove("is-active"));
          tab.classList.add("is-active");
          panels.forEach((p) =>
            p.classList.remove("is-active", "visible-anime")
          );
          const target = panels[idx];
          if (!target) return;
          target.classList.add("is-active");
          // force reflow for CSS animation
          void target.offsetWidth;
          target.classList.add("visible-anime");
        });
      });

      // optional: activate the first tab
      tabs[0]?.click();
    });
  });
})();

/* =============================================================================
     9. Mobile-only sliders init/destroy (menu-tabs-slider, winter, brand)
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;
  onReady(() => {
    waitFor(() => !!window.Swiper, { timeout: 7000 })
      .then(() => {
        const BREAKPOINT = 768;
        const instances = new Map();

        function init() {
          document.querySelectorAll(".menu-tabs-slider").forEach((el) => {
            if (!instances.has(el)) {
              let space = parseInt(el.dataset.sliderSpace, 10);
              if (isNaN(space)) space = 8;
              const sw = new Swiper(el, {
                slidesPerView: 2,
                spaceBetween: space,
              });
              instances.set(el, sw);
            }
          });
          document.querySelectorAll(".winter-slider").forEach((el) => {
            if (!instances.has(el)) {
              const sw = new Swiper(el, {
                slidesPerView: 2.1,
                spaceBetween: 8,
                loop: true,
                pagination: {
                  el: ".swiper-bullet-wrapper.is-slider-winter",
                  clickable: true,
                  bulletClass: "swiper-bullet-winter",
                  bulletActiveClass: "is_active_winter",
                },
              });
              instances.set(el, sw);
            }
          });
          document.querySelectorAll(".brand-slider").forEach((el) => {
            if (!instances.has(el)) {
              const sw = new Swiper(el, {
                slidesPerView: 1.2,
                spaceBetween: 8,
                loop: true,
                pagination: {
                  el: ".swiper-bullet-wrapper.is-slider-brand",
                  clickable: true,
                  bulletClass: "swiper-bullet-brand",
                  bulletActiveClass: "is_active_brand",
                },
              });
              instances.set(el, sw);
            }
          });
        }
        function destroyAll() {
          instances.forEach((sw, el) => {
            sw.destroy(true, true);
            instances.delete(el);
          });
        }
        function check() {
          window.innerWidth <= BREAKPOINT ? init() : destroyAll();
        }

        check();
        window.addEventListener("resize", check, { passive: true });
        window.addEventListener("orientationchange", check, { passive: true });
      })
      .catch(() => {
        /* skip if no Swiper */
      });
  });
})();

/* =============================================================================
     10. Webflow Lightbox: dynamic video src (safe)
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;

  function isUsableHttpsUrl(s) {
    if (!/^https:\/\//i.test(s)) return false;
    const placeholderRe =
      /(put\s+your\s+link\s+here|your\s+link|paste\s+link|insert\s+link|встав(те|ити)?.*посиланн|сюди\s*лінк|сюди\s*посилання)/i;
    if (placeholderRe.test(s)) return false;
    try {
      const u = new URL(s);
      if (!u.hostname || u.protocol !== "https:") return false;
      if (/\s/.test(s)) return false;
    } catch {
      return false;
    }
    return true;
  }
  function parseYouTube(url) {
    const m = url.match(
      /(?:youtube\.com\/.*[?&]v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i
    );
    return m ? { id: m[1] } : null;
  }
  function parseVimeo(url) {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    return m ? { id: m[1] } : null;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function iframeHtml(src, w, h) {
    const s = escapeHtml(src);
    return `<iframe src="${s}" width="${w}" height="${h}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  }
  function buildLightboxItem(url) {
    const yt = parseYouTube(url);
    if (yt) {
      const embed = `https://www.youtube.com/embed/${yt.id}?autoplay=1&rel=0&showinfo=0`;
      return {
        type: "video",
        originalUrl: url,
        url,
        html: iframeHtml(embed, 940, 528),
        thumbnailUrl: `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`,
        width: 940,
        height: 528,
      };
    }
    const vm = parseVimeo(url);
    if (vm) {
      const embed = `https://player.vimeo.com/video/${vm.id}?autoplay=1&title=0&byline=0&portrait=0`;
      return {
        type: "video",
        originalUrl: url,
        url,
        html: iframeHtml(embed, 940, 528),
        width: 940,
        height: 528,
      };
    }
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
      const html = `<video controls autoplay playsinline src="${escapeHtml(
        url
      )}" style="width:100%;height:auto"></video>`;
      return {
        type: "video",
        originalUrl: url,
        url,
        html,
        width: 940,
        height: 528,
      };
    }
    return {
      type: "video",
      originalUrl: url,
      url,
      html: iframeHtml(url, 940, 528),
      width: 940,
      height: 528,
    };
  }

  function initDynamicLightboxes(root) {
    const lightboxes = root.querySelectorAll(".dynamic-src");
    if (!lightboxes.length) return;
    lightboxes.forEach((lb) => {
      const urlEl = lb.querySelector(".video-data-url");
      const rawUrl = (urlEl?.textContent || "").trim();
      if (!isUsableHttpsUrl(rawUrl)) return;
      const item = buildLightboxItem(rawUrl);
      if (!item) return;

      lb.setAttribute("href", rawUrl);
      let jsonScript = lb.querySelector("script.w-json");
      if (!jsonScript) {
        jsonScript = document.createElement("script");
        jsonScript.type = "application/json";
        jsonScript.className = "w-json";
        lb.appendChild(jsonScript);
      }
      jsonScript.textContent = JSON.stringify({ items: [item], group: "" });
      lb.removeAttribute("data-wf-lightbox");
    });

    try {
      if (window.Webflow?.require) {
        const mod = Webflow.require("lightbox");
        if (mod && typeof mod.ready === "function") mod.ready();
      }
    } catch {}
  }

  onReady(() => {
    // Webflow ready
    waitFor(() => !!window.Webflow?.push, { timeout: 4000 })
      .then(() => {
        window.Webflow = window.Webflow || [];
        window.Webflow.push(() => {
          initDynamicLightboxes(document);
          document.addEventListener("fs-cmsload", () =>
            initDynamicLightboxes(document)
          );
        });
      })
      .catch(() => {
        // Fallback: just run on DOM ready if Webflow API not accessible
        initDynamicLightboxes(document);
        document.addEventListener("fs-cmsload", () =>
          initDynamicLightboxes(document)
        );
      });
  });
})();

/* =============================================================================
     11. Lottie: load on visibility + hover control (with .lottie-data-url)
  ============================================================================= */
(() => {
  const { onReady } = window.__DF_UTILS__;

  // patch loadAnimation to stash ref on container
  onReady(() => {
    if (!window.bodymovin) {
      console.warn("[Lottie] bodymovin not found.");
      return;
    }
    const orig = bodymovin.loadAnimation;
    bodymovin.loadAnimation = function (config) {
      const anim = orig(config);
      if (config.container) config.container.__lottieAnim = anim;
      return anim;
    };
  });

  function getLottiePath(el) {
    const inlineEl = el.querySelector(".lottie-data-url");
    const inlineUrl = inlineEl?.textContent?.trim() || "";
    if (inlineUrl) {
      inlineEl.style.display = "none";
      return inlineUrl;
    }
    return (el.getAttribute("data-lottie-src") || "").trim();
  }

  function initLottie(el) {
    if (!window.bodymovin) return;
    const path = getLottiePath(el);
    if (!path) return;

    const playOnHover = el.hasAttribute("data-play-hover");
    const loopLottie = el.hasAttribute("data-lottie-loop");
    const rendererType = el.getAttribute("data-lottie-renderer") || "svg";

    const anim = bodymovin.loadAnimation({
      container: el,
      renderer: rendererType,
      path,
      rendererSettings: { preserveAspectRatio: "xMidYMid slice" },
      loop: !playOnHover && loopLottie,
      autoplay: !playOnHover,
    });

    if (playOnHover) {
      const parent = el.closest(".lottie-wrapper-hover") || el;
      anim.setDirection(1);
      parent.addEventListener(
        "mouseenter",
        () => {
          anim.setDirection(1);
          anim.play();
        },
        { passive: true }
      );
      parent.addEventListener(
        "mouseleave",
        () => {
          anim.setDirection(-1);
          anim.play();
        },
        { passive: true }
      );
    }
  }

  onReady(() => {
    if (!window.bodymovin) return;
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (!entry.target.__lottieAnim) initLottie(entry.target);
          obs.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px 200px 0px", threshold: 0.1 }
    );

    const setCandidates = new Set();
    document
      .querySelectorAll(".lottie-element, [data-lottie-src]")
      .forEach((el) => setCandidates.add(el));
    const els = Array.from(setCandidates);

    els.forEach((el) => {
      el.style.position = "relative";
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.overflow = "hidden";
      if (el.hasAttribute("data-no-wait")) {
        if (!el.__lottieAnim) initLottie(el);
      } else {
        observer.observe(el);
      }
    });
  });
})();

/* =============================================================================
     12. Filters accordion (jQuery if present)
  ============================================================================= */
(() => {
  const { waitFor } = window.__DF_UTILS__;
  waitFor(() => !!window.jQuery, { timeout: 4000 })
    .then(() => {
      const $ = window.jQuery;
      function initFiltersAccordion() {
        const $groups = $(".filters_filter-group");
        if (!$groups.length) return;
        const $headings = $groups.find(".filters_filter-group-heading");
        $headings.off(".accordion");

        if ($(window).width() < 991) {
          $groups.removeClass("is-active").find(".flex-filtres-left").hide();
          $headings.on("click.accordion", function () {
            const $group = $(this).closest(".filters_filter-group");
            const $content = $group.find(".flex-filtres-left");
            if ($group.hasClass("is-active")) {
              $content.slideUp(200);
              $group.removeClass("is-active");
            } else {
              $groups
                .filter(".is-active")
                .removeClass("is-active")
                .find(".flex-filtres-left")
                .slideUp(200);
              $group.addClass("is-active");
              $content.slideDown(200);
            }
          });
        } else {
          $groups.each(function () {
            const $g = $(this);
            const $c = $g.find(".flex-filtres-left");
            $g.hasClass("is-active") ? $c.show() : $c.hide();
          });
          $headings.on("click.accordion", function () {
            const $group = $(this).closest(".filters_filter-group");
            const $content = $group.find(".flex-filtres-left");
            if ($group.hasClass("is-active")) {
              $group.removeClass("is-active");
              $content.slideUp(200);
            } else {
              $group.addClass("is-active");
              $content.slideDown(200);
            }
          });
        }
      }
      initFiltersAccordion();
      let rt;
      $(window).on("resize", function () {
        clearTimeout(rt);
        rt = setTimeout(initFiltersAccordion, 120);
      });
    })
    .catch(() => {
      /* no jQuery → skip */
    });
})();

/* =============================================================================
     13. Filters open/close on tablet (jQuery if present)
  ============================================================================= */
(() => {
  const { waitFor } = window.__DF_UTILS__;
  waitFor(() => !!window.jQuery, { timeout: 4000 })
    .then(() => {
      const $ = window.jQuery;
      function initFilterToggle() {
        const $wrapper = $(".filters_lists-wrapper");
        if (!$wrapper.length) return;
        const $openBtn = $("[data-filters-open]");
        const $closeBtn = $("[data-filters-close]");

        $openBtn.off("click.filterToggle");
        $closeBtn.off("click.filterToggle");

        if ($(window).width() < 991) {
          $wrapper.hide().removeClass("is-active");
          $openBtn.on("click.filterToggle", function () {
            $wrapper.hasClass("is-active")
              ? $wrapper.removeClass("is-active").slideUp(200)
              : $wrapper.addClass("is-active").slideDown(200);
          });
          $closeBtn.on("click.filterToggle", function () {
            if ($wrapper.hasClass("is-active"))
              $wrapper.removeClass("is-active").slideUp(200);
          });
        } else {
          $wrapper.show().removeClass("is-active");
        }
      }
      initFilterToggle();
      let rt;
      $(window).on("resize", function () {
        clearTimeout(rt);
        rt = setTimeout(initFilterToggle, 120);
      });
    })
    .catch(() => {
      /* no jQuery → skip */
    });
})();

/* =============================================================================
     14. Pagination hide state (robust observers)
  ============================================================================= */
(() => {
  const { onReady } = window.__DF_UTILS__;
  const PAGINATION_SELECTOR = ".pagination";
  const COUNT_SELECTOR = ".w-page-count";

  function normalize(text) {
    return (text || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function readTotalPages(paginationEl) {
    const countEl = paginationEl.querySelector(COUNT_SELECTOR);
    if (!countEl) return null;
    const text = normalize(countEl.textContent);
    const m = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      const total = parseInt(m[2], 10);
      if (!Number.isNaN(total)) return total;
    }
    const aria = countEl.getAttribute("aria-label") || "";
    const ariaMatch = aria.match(/of\s+(\d+)/i);
    if (ariaMatch) {
      const total = parseInt(ariaMatch[1], 10);
      if (!Number.isNaN(total)) return total;
    }
    return null;
  }
  function updateVisibility(paginationEl) {
    const total = readTotalPages(paginationEl);
    if (total === null) {
      paginationEl.removeAttribute("data-hidden");
      return;
    }
    total <= 1
      ? paginationEl.setAttribute("data-hidden", "true")
      : paginationEl.removeAttribute("data-hidden");
  }
  function observeCount(paginationEl) {
    const countEl = paginationEl.querySelector(COUNT_SELECTOR);
    if (!countEl) return;
    updateVisibility(paginationEl);
    const mo = new MutationObserver(() =>
      setTimeout(() => updateVisibility(paginationEl), 0)
    );
    mo.observe(countEl, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }
  function attach() {
    const paginationEl = document.querySelector(PAGINATION_SELECTOR);
    if (!paginationEl) return;
    observeCount(paginationEl);
  }

  onReady(attach);

  const outer = new MutationObserver(() => {
    const paginationEl = document.querySelector(PAGINATION_SELECTOR);
    if (!paginationEl) return;
    observeCount(paginationEl);
  });
  outer.observe(document.body, { childList: true, subtree: true });

  [
    "fs-cmsfilter-update",
    "fs-cmsfilter-reset",
    "fs-cmsfilter-change",
    "fs-cmsload",
  ].forEach((evt) => {
    window.addEventListener(evt, () => setTimeout(attach, 0), {
      passive: true,
    });
  });
})();

/* =============================================================================
     15. Scrolling Component (desktop) – sticky media & Lottie reset
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;
  onReady(() => {
    waitFor(
      () => typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined"
    )
      .then(() => {
        const mm = gsap.matchMedia();
        mm.add("(min-width: 992px)", () => {
          document.querySelectorAll(".scrolling_component").forEach((comp) => {
            comp
              .querySelectorAll(".scrolling_content-and-media")
              .forEach((sec) => {
                ScrollTrigger.create({
                  trigger: sec,
                  start: "top 50%",
                  end: "bottom 50%",
                  onEnter: () => activate(sec),
                  onEnterBack: () => activate(sec),
                });
              });
          });
          function activate(sec) {
            const parent = sec.closest(".scrolling_component");
            parent
              ?.querySelectorAll(".scrolling_content-and-media")
              .forEach((s) => s.classList.remove("is-active-scrolling"));
            sec.classList.add("is-active-scrolling");
            const lottie = sec.querySelector(".lottie-element");
            lottie?.__lottieAnim?.goToAndPlay(0, true);
          }
          return () => ScrollTrigger.getAll().forEach((t) => t.kill());
        });
      })
      .catch(() => {
        /* no GSAP */
      });
  });
})();

/* =============================================================================
     16. New scroll block component (pairs): desktop scrub & mobile reveal
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;

  onReady(() => {
    waitFor(
      () => typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined"
    )
      .then(() => {
        const pairs = [];
        gsap.utils
          .toArray(".scrolling_content-and-media-new")
          .forEach((wrapper) => {
            const content = wrapper.querySelector(".scrolling_content-box-new");
            const media = wrapper.querySelector(".scrolling_media_wrap-new");
            if (content && media) pairs.push({ wrapper, content, media });
          });
        if (!pairs.length) {
          gsap.utils.toArray(".scrolling_content-box-new").forEach((box) => {
            const next = box.nextElementSibling;
            if (next?.matches(".scrolling_media_wrap-new")) {
              const wrapper =
                box.closest(".scrolling_content-and-media-new") ||
                box.parentElement;
              pairs.push({ wrapper, content: box, media: next });
            }
          });
        }
        if (!pairs.length) return;

        const getOffset = (c, m) =>
          m.getAttribute("data-media-offset") ||
          c.getAttribute("data-media-offset") ||
          "3rem";

        pairs.forEach(({ content, media }) => {
          const off = getOffset(content, media);
          gsap.set(content, { opacity: 0 });
          gsap.set(media, { opacity: 0, y: off });
        });

        function setupDesktop({ content, media }) {
          const D1 = 20,
            D2 = 40,
            D3 = 30;
          const offset = getOffset(content, media);

          const tl = gsap.timeline({
            defaults: { ease: "none", overwrite: "auto" },
            scrollTrigger: {
              trigger: content,
              start: "top 50%",
              end: "top 0%",
              scrub: true,
              invalidateOnRefresh: true,
            },
          });
          tl.fromTo(content, { opacity: 0 }, { opacity: 1, duration: D1 })
            .to(content, { opacity: 1, duration: D2 })
            .to(content, { opacity: 0, duration: D3 });

          ScrollTrigger.create({
            trigger: content,
            start: "top 50%",
            end: "top -11%",
            invalidateOnRefresh: true,
            onEnter: () =>
              gsap.fromTo(
                media,
                { opacity: 0, y: offset },
                {
                  opacity: 1,
                  y: 0,
                  duration: 0.5,
                  ease: "power2.out",
                  overwrite: "auto",
                }
              ),
            onEnterBack: () =>
              gsap.fromTo(
                media,
                { opacity: 0, y: offset },
                {
                  opacity: 1,
                  y: 0,
                  duration: 0.5,
                  ease: "power2.out",
                  overwrite: "auto",
                }
              ),
            onLeave: () =>
              gsap.to(media, {
                opacity: 0,
                y: offset,
                duration: 0.3,
                ease: "power2.out",
                overwrite: "auto",
              }),
            onLeaveBack: () =>
              gsap.to(media, {
                opacity: 0,
                y: offset,
                duration: 0.3,
                ease: "power2.out",
                overwrite: "auto",
              }),
          });
        }

        function setupMobile({ wrapper, content, media }) {
          const offset = getOffset(content, media);
          gsap.set([content, media], { opacity: 0 });
          gsap.set(media, { y: offset });
          gsap
            .timeline({
              defaults: { ease: "power2.out", overwrite: "auto" },
              scrollTrigger: {
                trigger: wrapper || content,
                start: "top 50%",
                toggleActions: "play none none none",
                once: true,
                invalidateOnRefresh: true,
              },
            })
            .fromTo(
              [content, media],
              { opacity: 0, y: (i, el) => (el === media ? offset : "3rem") },
              { opacity: 1, y: 0, duration: 0.8, stagger: 0 }
            );
        }

        const mm = gsap.matchMedia();
        mm.add("(min-width: 992px)", () => pairs.forEach(setupDesktop));
        mm.add("(max-width: 991px)", () => pairs.forEach(setupMobile));

        window.addEventListener("load", () => ScrollTrigger.refresh(), {
          passive: true,
        });
      })
      .catch(() => {
        /* no GSAP */
      });
  });
})();

/* =============================================================================
     17. Progress lines for .scrolling_component-new
  ============================================================================= */
(() => {
  const { onReady, waitFor } = window.__DF_UTILS__;
  onReady(() => {
    waitFor(
      () => typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined"
    )
      .then(() => {
        const boxes = document.querySelectorAll(".scrolling_component-new");
        if (!boxes.length) return;
        boxes.forEach((box) => {
          const line = box.querySelector(".progress-line-scroll");
          if (!line) return;
          gsap.to(line, {
            height: "100%",
            ease: "none",
            scrollTrigger: {
              trigger: box,
              start: "top 50%",
              end: "bottom 50%",
              scrub: true,
            },
          });
        });
      })
      .catch(() => {
        /* no GSAP */
      });
  });
})();
