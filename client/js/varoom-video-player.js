(function () {
  'use strict';

  var MUTE_KEY = 'varoom-video-muted';
  var observedVideos = new WeakSet();
  var savedMuted = sessionStorage.getItem(MUTE_KEY);
  var defaultMuted = savedMuted === null ? true : savedMuted === 'true';
  var viewer = null;
  var viewerTrack = null;
  var viewerWrappers = [];
  var viewerState = null;
  var activeWrapper = null;

  function isMobile() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  function icon(name) {
    var paths = {
      play: '<path d="m8 5 11 7-11 7V5Z"/>',
      pause: '<path d="M8 5v14M16 5v14"/>',
      volume: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>',
      muted: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m17 9 4 6m0-6-4 6"/>',
      fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
      exitFullscreen: '<path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
      replay: '<path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/>'
    };
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function stopOtherVideos(video) {
    document.querySelectorAll('.varoom-video-player > video').forEach(function (other) {
      if (other !== video && !other.paused) other.pause();
    });
  }

  function setStatus(wrapper, message, error) {
    wrapper.classList.toggle('is-error', Boolean(error));
    wrapper.classList.toggle('is-buffering', !error && Boolean(message));
    wrapper.querySelector('.varoom-video-status-text').textContent = message || '';
  }

  function updatePlayButton(wrapper, video) {
    var button = wrapper.querySelector('[data-video-action="play"]');
    button.innerHTML = icon(video.ended ? 'replay' : (video.paused ? 'play' : 'pause'));
    button.setAttribute('aria-label', video.ended ? 'Replay video' : (video.paused ? 'Play video' : 'Pause video'));
  }

  function showControls(wrapper) {
    wrapper.classList.add('controls-visible');
    clearTimeout(wrapper._controlsTimer);
    if (viewerState && activeWrapper === wrapper) {
      wrapper._controlsTimer = setTimeout(function () {
        if (!wrapper.querySelector('.varoom-video-progress:active')) wrapper.classList.remove('controls-visible');
      }, 2800);
    }
  }

  function hideControls(wrapper) {
    wrapper.classList.remove('controls-visible');
  }

  function updateFullscreenButton(wrapper) {
    var button = wrapper.querySelector('[data-video-action="fullscreen"]');
    var active = viewerState && activeWrapper === wrapper;
    button.innerHTML = icon(active ? 'exitFullscreen' : 'fullscreen');
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    wrapper.classList.toggle('is-fullscreen', active);
    if (active) showControls(wrapper);
    else hideControls(wrapper);
  }

  function requestNativeFullscreen() {
    var request = viewer.requestFullscreen || viewer.webkitRequestFullscreen;
    if (!request) {
      console.warn('Continuous fullscreen video viewing is not supported by this browser');
      closeViewer();
      return;
    }
    var result = request.call(viewer);
    if (result && result.catch) {
      result.catch(function (error) {
        console.warn('Fullscreen request was blocked:', error);
        closeViewer();
      });
    }
  }

  function createViewer(wrappers, selectedWrapper) {
    viewer = document.createElement('div');
    viewer.className = 'varoom-video-viewer';
    viewer.setAttribute('aria-label', 'VaRoom video viewer');
    viewer.innerHTML = '<button type="button" class="varoom-video-viewer-close" aria-label="Close fullscreen video viewer">×</button><div class="varoom-video-viewer-track"></div>';
    viewerTrack = viewer.querySelector('.varoom-video-viewer-track');
    document.body.appendChild(viewer);
    viewerWrappers = wrappers;
    viewerState = { selectedWrapper: selectedWrapper, placeholders: [], feedScrollX: window.scrollX, feedScrollY: window.scrollY };

    wrappers.forEach(function (wrapper) {
      var placeholder = document.createComment('varoom-video-placeholder');
      wrapper.parentNode.insertBefore(placeholder, wrapper);
      viewerState.placeholders.push({ wrapper: wrapper, placeholder: placeholder });
      var slide = document.createElement('section');
      slide.className = 'varoom-video-viewer-slide';
      slide.appendChild(wrapper);
      viewerTrack.appendChild(slide);
    });

    viewer.querySelector('.varoom-video-viewer-close').addEventListener('click', function (event) {
      event.stopPropagation();
      closeViewer();
    });
    viewerTrack.addEventListener('scroll', function () {
      showControls(activeWrapper);
    }, { passive: true });

    var selectedIndex = wrappers.indexOf(selectedWrapper);
    viewerTrack.scrollTop = Math.max(0, selectedIndex) * window.innerHeight;
    activeWrapper = selectedWrapper;
    selectedWrapper.classList.add('is-fullscreen');
    selectedWrapper.querySelector('video').preload = 'metadata';
    updateFullscreenButton(selectedWrapper);
    wrappers.forEach(function (wrapper) {
      wrapper.querySelector('video').preload = wrapper === selectedWrapper ? 'metadata' : 'none';
    });
    requestNativeFullscreen();
    playWrapper(selectedWrapper);
    observeViewer();
  }

  function openViewer(selectedWrapper) {
    if (viewerState) {
      viewerTrack.querySelectorAll('.varoom-video-viewer-slide').forEach(function (slide, index) {
        if (viewerWrappers[index] === selectedWrapper) viewerTrack.scrollTop = index * window.innerHeight;
      });
      return;
    }
    var wrappers = Array.prototype.slice.call(document.querySelectorAll('.varoom-video-player'));
    if (!wrappers.length) return;
    createViewer(wrappers, selectedWrapper);
  }

  function restoreWrappers() {
    if (!viewerState) return;
    viewerState.placeholders.forEach(function (entry) {
      entry.placeholder.parentNode.replaceChild(entry.wrapper, entry.placeholder);
    });
    viewerState.placeholders = [];
  }

  function closeViewer() {
    if (!viewerState) return;
    var fullscreen = fullscreenElement();
    if (fullscreen === viewer) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        exit.call(document);
        return;
      }
    }
    var feedScrollX = viewerState.feedScrollX;
    var feedScrollY = viewerState.feedScrollY;
    restoreWrappers();
    if (viewerState.observer) viewerState.observer.disconnect();
    viewerWrappers.forEach(function (wrapper) {
      wrapper.classList.remove('is-fullscreen', 'controls-visible');
      updateFullscreenButton(wrapper);
    });
    if (viewer) viewer.remove();
    viewer = null;
    viewerTrack = null;
    viewerWrappers = [];
    viewerState = null;
    activeWrapper = null;
    window.scrollTo(feedScrollX, feedScrollY);
  }

  function updateViewerActive(slide) {
    if (!viewerState) return;
    var index = Array.prototype.indexOf.call(viewerTrack.children, slide);
    if (index < 0 || viewerWrappers[index] === activeWrapper) return;
    if (activeWrapper) {
      activeWrapper.classList.remove('is-fullscreen', 'controls-visible');
      activeWrapper.querySelector('video').pause();
      updateFullscreenButton(activeWrapper);
    }
    activeWrapper = viewerWrappers[index];
    viewerWrappers.forEach(function (wrapper, wrapperIndex) {
      var video = wrapper.querySelector('video');
      video.preload = Math.abs(wrapperIndex - index) <= 1 ? 'metadata' : 'none';
    });
    activeWrapper.classList.add('is-fullscreen');
    updateFullscreenButton(activeWrapper);
    playWrapper(activeWrapper);
  }

  function observeViewer() {
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= .7) updateViewerActive(entry.target);
      });
    }, { root: viewerTrack, threshold: [.7] });
    Array.prototype.forEach.call(viewerTrack.children, function (slide) { observer.observe(slide); });
    viewerState.observer = observer;
  }

  function playWrapper(wrapper) {
    var video = wrapper.querySelector('video');
    stopOtherVideos(video);
    video.play().catch(function (error) {
      console.warn('Video playback was blocked or failed:', error);
      setStatus(wrapper, 'Tap play to start', false);
    });
  }

  function enhance(video) {
    if (video.closest('.varoom-video-player')) return;
    video.removeAttribute('autoplay');
    video.removeAttribute('loop');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'none');
    video.muted = defaultMuted;

    var wrapper = document.createElement('div');
    wrapper.className = 'varoom-video-player';
    video.parentNode.insertBefore(wrapper, video);
    wrapper.appendChild(video);
    wrapper.insertAdjacentHTML('beforeend',
      '<div class="varoom-video-status" role="status"><span class="varoom-video-status-text"></span><br><button type="button" class="varoom-video-error-retry">Retry</button></div>' +
      '<button type="button" class="varoom-video-control varoom-video-mobile-mute" data-video-action="mobile-mute" aria-label="Unmute video"></button>' +
      '<div class="varoom-video-controls" aria-label="Video controls">' +
        '<button type="button" class="varoom-video-control" data-video-action="play" aria-label="Play video"></button>' +
        '<input class="varoom-video-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Video progress">' +
        '<span class="varoom-video-time" aria-live="off">0:00 / 0:00</span>' +
        '<button type="button" class="varoom-video-control" data-video-action="mute" aria-label="Unmute video"></button>' +
        '<button type="button" class="varoom-video-control" data-video-action="fullscreen" aria-label="Enter fullscreen"></button>' +
      '</div>');

    var playButton = wrapper.querySelector('[data-video-action="play"]');
    var muteButton = wrapper.querySelector('[data-video-action="mute"]');
    var mobileMuteButton = wrapper.querySelector('[data-video-action="mobile-mute"]');
    var fullscreenButton = wrapper.querySelector('[data-video-action="fullscreen"]');
    var progress = wrapper.querySelector('.varoom-video-progress');
    var timeLabel = wrapper.querySelector('.varoom-video-time');

    function formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    }

    function updateProgress(value) {
      var percent = Math.max(0, Math.min(100, Number(value) || 0));
      progress.value = String(percent);
      progress.style.setProperty('--video-progress', percent + '%');
    }

    function updateMuteButton() {
      var label = video.muted ? 'Unmute video' : 'Mute video';
      var markup = icon(video.muted ? 'muted' : 'volume');
      muteButton.innerHTML = markup;
      muteButton.setAttribute('aria-label', label);
      mobileMuteButton.innerHTML = markup;
      mobileMuteButton.setAttribute('aria-label', label);
    }

    playButton.addEventListener('click', function (event) {
      event.stopPropagation();
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        playWrapper(wrapper);
      } else video.pause();
      showControls(wrapper);
    });
    function toggleMute(event) {
      event.stopPropagation();
      video.muted = !video.muted;
      sessionStorage.setItem(MUTE_KEY, String(video.muted));
      updateMuteButton();
    }
    muteButton.addEventListener('click', function (event) {
      toggleMute(event);
      showControls(wrapper);
    });
    mobileMuteButton.addEventListener('click', toggleMute);
    fullscreenButton.addEventListener('click', function (event) {
      event.stopPropagation();
      if (viewerState && activeWrapper === wrapper) closeViewer();
      else openViewer(wrapper);
    });
    wrapper.querySelector('.varoom-video-error-retry').addEventListener('click', function (event) {
      event.stopPropagation();
      setStatus(wrapper, 'Loading…', false);
      video.load();
      playWrapper(wrapper);
    });
    progress.addEventListener('pointerdown', function () { showControls(wrapper); });
    progress.addEventListener('input', function () {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = (Number(progress.value) / 100) * video.duration;
        updateProgress(progress.value);
      }
    });
    wrapper.addEventListener('pointerdown', function () {
      if (viewerState && activeWrapper === wrapper) showControls(wrapper);
    });
    wrapper.addEventListener('mouseenter', function () {
      if (!isMobile()) showControls(wrapper);
    });
    wrapper.addEventListener('mouseleave', function () {
      if (!isMobile() && viewerState && activeWrapper === wrapper) {
        clearTimeout(wrapper._controlsTimer);
        wrapper._controlsTimer = setTimeout(function () { hideControls(wrapper); }, 900);
      }
    });
    video.addEventListener('click', function (event) {
      if (event.target.closest('.varoom-video-controls') || event.target.closest('.varoom-video-mobile-mute')) return;
      if (isMobile() && !viewerState) {
        openViewer(wrapper);
        return;
      }
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        playWrapper(wrapper);
      } else video.pause();
    });
    video.addEventListener('play', function () {
      stopOtherVideos(video);
      wrapper.classList.add('is-playing');
      wrapper.classList.remove('is-ended');
      setStatus(wrapper, '', false);
      updatePlayButton(wrapper, video);
    });
    video.addEventListener('pause', function () {
      wrapper.classList.remove('is-playing');
      updatePlayButton(wrapper, video);
    });
    video.addEventListener('timeupdate', function () {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        updateProgress((video.currentTime / video.duration) * 100);
        timeLabel.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
      }
    });
    video.addEventListener('loadedmetadata', function () {
      updateProgress(0);
      timeLabel.textContent = '0:00 / ' + formatTime(video.duration);
      setStatus(wrapper, '', false);
    });
    video.addEventListener('waiting', function () { setStatus(wrapper, 'Loading…', false); });
    video.addEventListener('stalled', function () { setStatus(wrapper, 'Loading…', false); });
    video.addEventListener('canplay', function () { setStatus(wrapper, '', false); });
    video.addEventListener('ended', function () {
      wrapper.classList.remove('is-playing');
      wrapper.classList.add('is-ended');
      updatePlayButton(wrapper, video);
      showControls(wrapper);
    });
    video.addEventListener('error', function () {
      console.error('Video failed to load:', video.currentSrc || video.src, video.error);
      setStatus(wrapper, 'Video unavailable', true);
      updatePlayButton(wrapper, video);
    });

    updatePlayButton(wrapper, video);
    updateMuteButton();
    updateFullscreenButton(wrapper);
    observe(video, wrapper);
  }

  function observe(video, wrapper) {
    if (!('IntersectionObserver' in window) || observedVideos.has(video)) return;
    observedVideos.add(video);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (viewerState) return;
        if (entry.isIntersecting) {
          video.preload = 'metadata';
          if (!viewerState) playWrapper(wrapper);
        }
        else if (!video.paused) video.pause();
      });
    }, { rootMargin: '160px 0px', threshold: 0.1 });
    observer.observe(video);
  }

  document.addEventListener('fullscreenchange', function () {
    if (viewerState && fullscreenElement() !== viewer) closeViewer();
  });
  document.addEventListener('webkitfullscreenchange', function () {
    if (viewerState && fullscreenElement() !== viewer) closeViewer();
  });
  function scan(root) {
    (root || document).querySelectorAll('video[data-listing-id], .listing-thumb video').forEach(enhance);
  }
  scan(document);
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && !viewerState) document.querySelectorAll('.varoom-video-player > video').forEach(function (video) { video.pause(); });
  });
})();
