// Hand the authorisation response to the page that opened this window, then close.
if (window.opener) {
  window.opener.postMessage({ type: 'cw-oauth', search: location.search }, location.origin);
  window.close();
}
