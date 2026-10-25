window.fermat =
  window.fermat ||
  function () {
    (window.fermat.q = window.fermat.q || []).push(arguments[0]);
  };
(function () {
  var script = document.createElement("script");
  script.src = "/sites/new-era/_ext/static.clairedefermat.com/pixel/v2/pixel.js";
  script.async = true;
  var firstScript = document.getElementsByTagName("script")[0];
  firstScript.parentNode.insertBefore(script, firstScript);
})();
window.fermat({
  method: "init",
  config: {
    id: "www-neweracap-com",
    recording: {
      enabled: true,
    },
  },
});