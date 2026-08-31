(function () {
  'use strict';

  var MUTE_KEY = 'varoom-video-muted';
  var observedVideos = new WeakSet();
  var savedMuted = sessionStorage.getItem(MUTE_KEY);
  var defaultMuted = savedMuted === null ? true : savedMuted === 'true';

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

  function updateFullscreenButton(wrapper) {
    var button = wrapper.querySelector('[data-video-action="fullscreen"]');
    var active = fullscreenElement() === wrapper;
    button.innerHTML = icon(active ? 'exitFullscreen' : 'fullscreen');
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    wrapper.classList.toggle('is-fullscreen', active);
    if (active) showControls(wrapper);
    else hideControls(wrapper);
  }

  function showControls(wrapper) {
    wrapper.classList.add('controls-visible');
    clearTimeout(wrapper._controlsTimer);
    if (fullscreenElement() === wrapper) {
      wrapper._controlsTimer = setTimeout(function () {
        if (!wrapper.querySelector('.varoom-video-progress:active')) hideControls(wrapper);
      }, 2800);
    }
  }

  function hideControls(wrapper) {
    if (fullscreenElement() === wrapper) wrapper.classList.remove('controls-visible');
  }

  function requestFullscreen(wrapper, video) {
    if (fullscreenElement() === wrapper) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    var request = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
    if (request) {
      var result = request.call(wrapper);
      if (result && result.catch) result.catch(function (error) {
        console.warn('Fullscreen request was blocked:', error);
      });
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else {
      console.warn('Fullscreen is not supported by this browser');
    }
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
      '<div class="varoom-video-controls" aria-label="Video controls">' +
        '<button type="button" class="varoom-video-control" data-video-action="play" aria-label="Play video"></button>' +
        '<input class="varoom-video-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Video progress">' +
        '<span class="varoom-video-time" aria-live="off">0:00 / 0:00</span>' +
        '<button type="button" class="varoom-video-control" data-video-action="mute" aria-label="Unmute video"></button>' +
        '<button type="button" class="varoom-video-control" data-video-action="fullscreen" aria-label="Enter fullscreen"></button>' +
      '</div>');

    var playButton = wrapper.querySelector('[data-video-action="play"]');
    var muteButton = wrapper.querySelector('[data-video-action="mute"]');
    var fullscreenButton = wrapper.querySelector('[data-video-action="fullscreen"]');
    var progress = wrapper.querySelector('.varoom-video-progress');
    var timeLabel = wrapper.querySelector('.varoom-video-time');

    function formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    }

    function updateMuteButton() {
      muteButton.innerHTML = icon(video.muted ? 'muted' : 'volume');
      muteButton.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
    }

    function play() {
      stopOtherVideos(video);
      video.play().catch(function (error) {
        console.warn('Video playback was blocked or failed:', error);
        setStatus(wrapper, 'Tap play to start', false);
      });
    }

    function handleVideoTap(event) {
      if (event.target.closest('.varoom-video-controls')) return;
      if (isMobile() && !fullscreenElement()) {
        requestFullscreen(wrapper, video);
        play();
        return;
      }
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        play();
      } else video.pause();
    }

    playButton.addEventListener('click', function (event) {
      event.stopPropagation();
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0;
        play();
      } else video.pause();
      showControls(wrapper);
    });
    muteButton.addEventListener('click', function (event) {
      event.stopPropagation();
      video.muted = !video.muted;
      sessionStorage.setItem(MUTE_KEY, String(video.muted));
      updateMuteButton();
      showControls(wrapper);
    });
    fullscreenButton.addEventListener('click', function (event) {
      event.stopPropagation();
      requestFullscreen(wrapper, video);
    });
    wrapper.querySelector('.varoom-video-error-retry').addEventListener('click', function (event) {
      event.stopPropagation();
      setStatus(wrapper, 'Loading…', false);
      video.load();
      play();
    });
    progress.addEventListener('pointerdown', function () { showControls(wrapper); });
    progress.addEventListener('input', function () {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = (Number(progress.value) / 100) * video.duration;
      }
    });
    wrapper.addEventListener('pointerdown', function () {
      if (fullscreenElement() === wrapper) showControls(wrapper);
    });
    video.addEventListener('click', handleVideoTap);
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
        progress.value = String((video.currentTime / video.duration) * 100);
        timeLabel.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
      }
    });
    video.addEventListener('loadedmetadata', function () {
      progress.value = '0';
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
    observe(video);
  }

  function observe(video) {
    if (!('IntersectionObserver' in window) || observedVideos.has(video)) return;
    observedVideos.add(video);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) video.preload = 'metadata';
        else if (!video.paused) video.pause();
      });
    }, { rootMargin: '160px 0px', threshold: 0.1 });
    observer.observe(video);
  }

  function scan(root) {
    (root || document).querySelectorAll('video[data-listing-id], .listing-thumb video').forEach(enhance);
  }

  document.addEventListener('fullscreenchange', function () {
    document.querySelectorAll('.varoom-video-player').forEach(updateFullscreenButton);
  });
  document.addEventListener('webkitfullscreenchange', function () {
    document.querySelectorAll('.varoom-video-player').forEach(updateFullscreenButton);
  });
  scan(document);
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) document.querySelectorAll('.varoom-video-player > video').forEach(function (video) { video.pause(); });
  });
})();
