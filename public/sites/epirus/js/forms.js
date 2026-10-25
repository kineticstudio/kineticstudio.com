/*
 * Forms for epirusinc.com, off Webflow.
 *
 * The markup and field names are Webflow's, unchanged. Webflow's own script
 * (webflow.js) would post every form to Webflow's form inbox, which stops
 * working when the site leaves Webflow; this file takes the submit first, in
 * the capture phase, so webflow.js never sees it.
 *
 * Where submissions go is one setting, the build's FORMS_ENDPOINT
 * (src/lib/site.ts), written onto this script tag as data-endpoint. When it is
 * empty, forms are switched off and nothing is sent anywhere, so a preview
 * can never reach Epirus's inbox.
 *
 * Each submission is a JSON POST:
 *   { form, formId, page, pageId, elementId, fields: { <field name>: value }, elapsed }
 * A field name that repeats in the markup (the newsroom contact modal has two)
 * arrives as an array, so nothing is lost. `elapsed` is how long the page had
 * been open, in milliseconds: the backend (api/forms.js) refuses a submission
 * sent within seconds of the page opening, which only a script does. It is
 * the spam check that replaces Webflow's Turnstile without touching the
 * markup. Success and failure show Webflow's own done and fail blocks, as
 * webflow.js did.
 */
(function () {
  var script = document.currentScript;
  var endpoint = (script && script.getAttribute("data-endpoint")) || "";
  var opened = new Date().getTime();

  function elapsed() {
    if (window.performance && typeof window.performance.now === "function") return Math.round(window.performance.now());
    return new Date().getTime() - opened;
  }

  function fieldsOf(form) {
    var out = {};
    var els = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute("name");
      var type = (el.getAttribute("type") || "").toLowerCase();
      if (!name || type === "submit" || type === "button" || el.disabled) continue;
      var value;
      if (type === "checkbox") value = el.checked;
      else if (type === "radio") {
        if (!el.checked) continue;
        value = el.value;
      } else value = el.value;
      if (Object.prototype.hasOwnProperty.call(out, name)) out[name] = [].concat(out[name], value);
      else out[name] = value;
    }
    return out;
  }

  function show(el, on) {
    if (el) el.style.display = on ? "block" : "none";
  }

  function finish(form, ok) {
    var block = form.parentElement;
    var done = block && block.querySelector(".w-form-done");
    var fail = block && block.querySelector(".w-form-fail");
    var redirect = form.getAttribute("data-redirect") || form.getAttribute("redirect");
    if (ok && redirect) {
      window.location.href = redirect;
      return;
    }
    show(done, ok);
    show(fail, !ok);
    form.style.display = ok ? "none" : "";
    var focus = ok ? done : fail;
    if (focus && focus.focus) focus.focus();
  }

  window.addEventListener(
    "submit",
    function (event) {
      var form = event.target;
      if (!form || form.tagName !== "FORM" || !form.closest(".w-form")) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      // Webflow's site password page: there is no password protection off Webflow.
      if (form.closest(".w-password-page")) return;

      if (!endpoint) {
        // a preview (the studio, a review deploy): say so on the form instead
        // of doing nothing, and send nothing
        if (window.console) console.info("Forms are switched off in this build (no FORMS_ENDPOINT): nothing was sent.");
        var block = form.parentElement;
        var fail = block && block.querySelector(".w-form-fail");
        if (fail) {
          var text = fail.querySelector("div") || fail;
          text.textContent = "This preview does not send forms. Nothing was sent.";
          show(fail, true);
        }
        return;
      }

      var button = form.querySelector('[type="submit"]');
      var label = button && button.value;
      var wait = button && button.getAttribute("data-wait");
      if (button && wait) button.value = wait;

      var body = JSON.stringify({
        form: form.getAttribute("data-name") || form.getAttribute("name") || "",
        formId: form.id || "",
        page: window.location.pathname,
        pageId: form.getAttribute("data-wf-page-id") || document.documentElement.getAttribute("data-wf-page") || "",
        elementId: form.getAttribute("data-wf-element-id") || "",
        fields: fieldsOf(form),
        elapsed: elapsed(),
      });

      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: body })
        .then(function (res) {
          finish(form, res.ok);
        })
        .catch(function () {
          finish(form, false);
        })
        .then(function () {
          if (button && label != null) button.value = label;
        });
    },
    true,
  );
})();
