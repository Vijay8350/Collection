/* OptionForge storefront widget — vanilla JS, no framework.
 * Target: <60 KB gzipped. Lazy-loads Konva.js only for live preview.
 * Blueprint §6.
 */
(function () {
  "use strict";

  var cfg = window.OptionForgeConfig;
  if (!cfg) return;

  var CACHE_KEY = "optionforge_cache_" + cfg.product.id;
  var CACHE_TTL_MS = 5 * 60 * 1000;

  function log() {
    if (cfg.previewMode) console.log.apply(console, ["[OptionForge]"].concat([].slice.call(arguments)));
  }

  function fetchOptions() {
    var cached = readCache();
    if (cached) {
      log("cache hit", cached);
      return Promise.resolve(cached);
    }
    return fetch(cfg.proxyBase + "/options/" + cfg.product.gid.replace(/\//g, "%2F"), {
      credentials: "include",
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        writeCache(json);
        return json;
      })
      .catch(function (err) {
        console.error("[OptionForge] fetch failed", err);
        return { optionSets: [] };
      });
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.t > CACHE_TTL_MS) return null;
      return obj.v;
    } catch (e) { return null; }
  }

  function writeCache(v) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {}
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "style") node.setAttribute("style", attrs[k]);
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderOption(opt, state, onChange) {
    var labelEl = el("label", { class: "of-label" }, [
      opt.label + (opt.required ? " *" : ""),
    ]);
    var help = opt.helpText ? el("div", { class: "of-help" }, opt.helpText) : null;

    var input;
    switch (opt.type) {
      case "text":
      case "email":
      case "phone":
      case "url":
        input = el("input", {
          type: opt.type === "text" ? "text" : opt.type,
          class: "of-input",
          placeholder: opt.placeholder || "",
          maxlength: (opt.validation && opt.validation.maxLength) || "",
          required: opt.required ? "required" : null,
          oninput: function (e) { state[opt.id] = e.target.value; onChange(); },
        });
        break;
      case "textarea":
        input = el("textarea", {
          class: "of-input of-textarea",
          rows: 3,
          placeholder: opt.placeholder || "",
          maxlength: (opt.validation && opt.validation.maxLength) || "",
          required: opt.required ? "required" : null,
          oninput: function (e) { state[opt.id] = e.target.value; onChange(); },
        });
        break;
      case "number":
        input = el("input", {
          type: "number",
          class: "of-input",
          min: (opt.validation && opt.validation.min) != null ? opt.validation.min : "",
          max: (opt.validation && opt.validation.max) != null ? opt.validation.max : "",
          oninput: function (e) { state[opt.id] = e.target.value; onChange(); },
        });
        break;
      case "date":
        input = el("input", { type: "date", class: "of-input",
          oninput: function (e) { state[opt.id] = e.target.value; onChange(); } });
        break;
      case "dropdown":
        input = el("select", { class: "of-input",
          onchange: function (e) { state[opt.id] = e.target.value; onChange(); } },
          [el("option", { value: "" }, "Choose…")].concat(
            (opt.values || []).map(function (v) { return el("option", { value: v.value }, v.label); })
          )
        );
        break;
      case "radio":
        input = el("div", { class: "of-radio-group" },
          (opt.values || []).map(function (v, i) {
            var id = "of-" + opt.id + "-" + i;
            return el("label", { for: id, class: "of-radio-label" }, [
              el("input", { type: "radio", id: id, name: opt.id, value: v.value,
                onchange: function () { state[opt.id] = v.value; onChange(); } }),
              " " + v.label + priceSuffix(v),
            ]);
          })
        );
        break;
      case "checkbox":
        input = el("div", { class: "of-checkbox-group" },
          (opt.values || [{ label: opt.label, value: "on" }]).map(function (v, i) {
            var id = "of-" + opt.id + "-" + i;
            return el("label", { for: id, class: "of-checkbox-label" }, [
              el("input", { type: "checkbox", id: id, value: v.value,
                onchange: function (e) {
                  state[opt.id] = state[opt.id] || [];
                  if (e.target.checked) state[opt.id].push(v.value);
                  else state[opt.id] = state[opt.id].filter(function (x) { return x !== v.value; });
                  onChange();
                } }),
              " " + v.label + priceSuffix(v),
            ]);
          })
        );
        break;
      case "swatch_color":
        input = el("div", { class: "of-swatches" },
          (opt.values || []).map(function (v) {
            return el("button", {
              type: "button",
              class: "of-swatch",
              title: v.label + priceSuffix(v),
              style: "background:" + (v.swatchColor || "#ccc"),
              onclick: function () {
                state[opt.id] = v.value;
                document.querySelectorAll("#of-opt-" + opt.id + " .of-swatch").forEach(function (s) { s.classList.remove("active"); });
                this.classList.add("active");
                onChange();
              },
            });
          })
        );
        break;
      case "swatch_image":
        input = el("div", { class: "of-swatches" },
          (opt.values || []).map(function (v) {
            return el("button", {
              type: "button",
              class: "of-swatch of-swatch-img",
              title: v.label + priceSuffix(v),
              style: "background-image:url(" + (v.swatchImageUrl || "") + ")",
              onclick: function () { state[opt.id] = v.value; onChange(); },
            });
          })
        );
        break;
      case "file":
      case "image_upload":
        input = el("input", { type: "file", class: "of-input of-file",
          accept: opt.type === "image_upload" ? "image/*" : "*",
          onchange: function (e) { state[opt.id] = e.target.files && e.target.files[0]; onChange(); }
        });
        break;
      case "toggle":
        input = el("label", { class: "of-toggle" }, [
          el("input", { type: "checkbox",
            onchange: function (e) { state[opt.id] = e.target.checked; onChange(); }
          }),
          el("span", { class: "of-toggle-slider" }),
        ]);
        break;
      case "range":
        input = el("input", { type: "range", class: "of-input of-range",
          min: (opt.validation && opt.validation.min) || 0,
          max: (opt.validation && opt.validation.max) || 100,
          oninput: function (e) { state[opt.id] = e.target.value; onChange(); }
        });
        break;
      default:
        input = el("input", { type: "text", class: "of-input",
          oninput: function (e) { state[opt.id] = e.target.value; onChange(); }
        });
    }

    var wrap = el("div", { id: "of-opt-" + opt.id, class: "of-field of-type-" + opt.type }, [labelEl, input]);
    if (help) wrap.appendChild(help);
    return wrap;
  }

  function priceSuffix(v) {
    return v.addonPriceCents && v.addonPriceCents > 0
      ? " (+" + formatMoney(v.addonPriceCents) + ")"
      : "";
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat(cfg.locale || "en-US", {
      style: "currency",
      currency: cfg.product.currency || "USD",
    }).format(cents / 100);
  }

  function mount(data) {
    if (!data.optionSets || data.optionSets.length === 0) return;
    var state = {};
    var mountPoint = document.querySelector("[data-optionforge-mount]");
    if (!mountPoint) {
      var form = document.querySelector(cfg.cartFormSelector);
      if (!form) { log("no cart form found"); return; }
      mountPoint = el("div", { "data-optionforge-mount": "true", class: "of-root" });
      form.insertBefore(mountPoint, form.firstChild);
    } else {
      mountPoint.classList.add("of-root");
    }

    function rerender() {
      mountPoint.innerHTML = "";
      data.optionSets.forEach(function (set) {
        var setEl = el("fieldset", { class: "of-set" }, [el("legend", { class: "of-set-name" }, set.name)]);
        set.options.forEach(function (opt) {
          var node = renderOption(opt, state, rerender);
          setEl.appendChild(node);
          applyConditionalRules(opt, state, node);
        });
        mountPoint.appendChild(setEl);
      });
      updateLineItemProperties(state);
    }

    rerender();
    log("mounted", data);
  }

  function applyConditionalRules(opt, state, node) {
    if (!opt.conditionalRules || opt.conditionalRules.length === 0) return;
    var visible = true;
    opt.conditionalRules.forEach(function (rule) {
      var matched = evalPredicate(rule.predicate, state);
      if (rule.action === "show") visible = matched;
      if (rule.action === "hide" && matched) visible = false;
    });
    node.style.display = visible ? "" : "none";
  }

  function evalPredicate(predicate, state) {
    if (!predicate) return true;
    if (predicate.and) return predicate.and.every(function (p) { return evalPredicate(p, state); });
    if (predicate.or) return predicate.or.some(function (p) { return evalPredicate(p, state); });
    if (predicate.optionId && predicate.equals != null) {
      return state[predicate.optionId] === predicate.equals;
    }
    return true;
  }

  // Inject state as hidden line item properties so they land on the cart.
  function updateLineItemProperties(state) {
    var form = document.querySelector(cfg.cartFormSelector);
    if (!form) return;
    Object.keys(state).forEach(function (key) {
      var name = 'properties[_optionforge_' + key + ']';
      var existing = form.querySelector('input[name="' + name + '"]');
      var val = state[key];
      if (val == null || val === "") {
        if (existing) existing.remove();
        return;
      }
      if (!existing) {
        existing = el("input", { type: "hidden", name: name });
        form.appendChild(existing);
      }
      existing.value = typeof val === "object" ? JSON.stringify(val) : String(val);
    });
  }

  // Boot
  fetchOptions().then(mount).catch(function (err) {
    console.error("[OptionForge] boot failed", err);
  });
})();
