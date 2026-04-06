/**
 * HangHut Embed Widget v1.0
 * Drop-in JavaScript widget for embedding HangHut events on external websites.
 *
 * Usage:
 *   Storefront (all events):
 *     <div class="hanghut-widget" data-partner="your-slug"></div>
 *
 *   Single event:
 *     <div class="hanghut-widget" data-event="event-uuid"></div>
 *
 *   Customization attributes:
 *     data-primary-color="#FF5500"
 *     data-bg-color="#ffffff"
 *     data-text-color="#111111"
 *     data-border-radius="12"
 *     data-height="600"
 *
 *   Then add before </body>:
 *     <script src="https://hanghut.com/embed.js" async></script>
 */
(function () {
  'use strict';

  var HANGHUT_ORIGIN = 'https://hanghut.com';

  // Allow localhost during development
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost'
  ) {
    HANGHUT_ORIGIN = window.location.origin;
  }

  // ── Helpers ──────────────────────────────────────────────

  function buildParams(el) {
    var params = [];
    var map = {
      'data-primary-color': 'primary',
      'data-bg-color': 'bg',
      'data-text-color': 'text',
      'data-border-radius': 'radius',
    };
    for (var attr in map) {
      var val = el.getAttribute(attr);
      if (val) params.push(map[attr] + '=' + encodeURIComponent(val));
    }
    return params.length ? '?' + params.join('&') : '';
  }

  // ── Overlay / Modal ─────────────────────────────────────

  var overlay = null;
  var modalIframe = null;

  function createOverlay() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'hanghut-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.6);z-index:999999;display:flex;' +
      'align-items:center;justify-content:center;opacity:0;' +
      'transition:opacity .3s ease;backdrop-filter:blur(4px);';

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText =
      'position:absolute;top:16px;right:20px;font-size:32px;' +
      'color:#fff;background:none;border:none;cursor:pointer;' +
      'z-index:1000001;line-height:1;font-family:sans-serif;';
    closeBtn.onclick = closeOverlay;
    overlay.appendChild(closeBtn);

    // Modal container
    var modal = document.createElement('div');
    modal.style.cssText =
      'width:95%;max-width:560px;max-height:90vh;background:#fff;' +
      'border-radius:16px;overflow:hidden;position:relative;' +
      'box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);' +
      'transform:translateY(20px);transition:transform .3s ease;';
    modal.id = 'hanghut-modal';

    modalIframe = document.createElement('iframe');
    modalIframe.style.cssText =
      'width:100%;height:85vh;max-height:85vh;border:none;display:block;';
    modalIframe.setAttribute('allow', 'payment');

    modal.appendChild(modalIframe);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      modal.style.transform = 'translateY(0)';
    });

    // Close on background click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });

    // Close on Escape
    document.addEventListener('keydown', onEscKey);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.style.opacity = '0';
    var modal = document.getElementById('hanghut-modal');
    if (modal) modal.style.transform = 'translateY(20px)';
    setTimeout(function () {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      overlay = null;
      modalIframe = null;
    }, 300);
    document.removeEventListener('keydown', onEscKey);
  }

  function onEscKey(e) {
    if (e.key === 'Escape') closeOverlay();
  }

  // ── PostMessage Handler ─────────────────────────────────

  window.addEventListener('message', function (event) {
    // In production, validate origin
    // For now allow both prod and dev origins
    var data = event.data;
    if (!data || typeof data !== 'object' || !data.type) return;

    switch (data.type) {
      case 'HANGHUT_OPEN_CHECKOUT':
        // Open the checkout in a modal overlay
        createOverlay();
        if (modalIframe && data.url) {
          modalIframe.src = data.url;
        }
        break;

      case 'HANGHUT_REDIRECT_PARENT':
        // Xendit payment redirect — navigate the parent window
        if (data.url) {
          window.location.href = data.url;
        }
        break;

      case 'HANGHUT_CLOSE_MODAL':
        closeOverlay();
        break;

      case 'HANGHUT_RESIZE':
        // Auto-resize the storefront/event iframe
        if (data.frameId && data.height) {
          var frame = document.getElementById(data.frameId);
          if (frame) {
            frame.style.height = data.height + 'px';
          }
        }
        break;

      default:
        break;
    }
  });

  // ── Widget Initialization ───────────────────────────────

  function init() {
    var widgets = document.querySelectorAll('.hanghut-widget');

    for (var i = 0; i < widgets.length; i++) {
      var el = widgets[i];

      // Prevent double-init
      if (el.getAttribute('data-hanghut-initialized')) continue;
      el.setAttribute('data-hanghut-initialized', 'true');

      var partner = el.getAttribute('data-partner');
      var eventId = el.getAttribute('data-event');
      var height = el.getAttribute('data-height') || '500';
      var params = buildParams(el);
      var src;

      if (eventId) {
        src = HANGHUT_ORIGIN + '/embed/event/' + eventId + params;
      } else if (partner) {
        src = HANGHUT_ORIGIN + '/embed/storefront/' + partner + params;
      } else {
        console.warn('[HangHut Embed] Missing data-partner or data-event attribute.');
        continue;
      }

      var frameId = 'hanghut-frame-' + i;

      var iframe = document.createElement('iframe');
      iframe.id = frameId;
      iframe.src = src;
      iframe.style.cssText =
        'width:100%;height:' + height + 'px;border:none;' +
        'border-radius:8px;display:block;overflow:hidden;' +
        'color-scheme:light dark;';
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('allow', 'payment');
      iframe.setAttribute('data-frame-id', frameId);

      el.innerHTML = '';
      el.appendChild(iframe);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
