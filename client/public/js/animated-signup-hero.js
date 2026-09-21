(function () {
  'use strict';

  var heroContent = {
    host: [
      'Create your host account.',
      'Access your host tools in one place.',
      'Manage chats without losing track.',
      'Keep reminders and your calendar together.',
      'Manage bookings with ease.',
      'Keep your listings organized.',
      'Build long-term client relationships.',
      'Create your host account.'
    ],
    client: [
      'Create your client account.',
      'Find hospitality in one place.',
      'Explore Airbnbs, hotels and apartments.',
      'Discover spaces across categories.',
      'Talk directly with hosts.',
      'Know exactly where you are booking.',
      'See your booking location without guessing.',
      'Create your client account.'
    ]
  };

  var sharedStyles = `
    html, body { min-height: 100%; max-height: none; overflow-x: hidden; overflow-y: auto; }
    body { min-height: 100vh; min-height: 100svh; background: #fff; color: #151515; }
    .page { display: block; height: auto; min-height: 100vh; min-height: 100svh; overflow: visible; background: #fff; }
    .topbar, .photo-panel { display: none; }
    .form-panel { display: block; width: 100%; height: auto; min-height: 100vh; min-height: 100svh; padding: 0 0 32px; overflow: visible; background: #fff; }
    .signup-hero { min-height: 40vh; min-height: 40svh; display: flex; align-items: center; justify-content: center; padding: 28px; overflow: hidden; border-radius: 0 0 34px 34px; background: #000; color: #fff; }
    .signup-hero__messages { position: relative; width: min(100%, 650px); height: 3.2em; font: 700 clamp(25px, 5vw, 34px) Arial, Helvetica, sans-serif; letter-spacing: -0.7px; line-height: 1.25; text-align: center; }
    .signup-hero__message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; opacity: 0; transform: translateY(10px); will-change: transform, opacity; animation: signup-hero-message 1.45s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--slot) * 1.45s); }
    .signup-hero__message.is-final { animation-name: signup-hero-final; }
    @keyframes signup-hero-message { 0% { opacity: 0; transform: translateY(10px); } 14%, 78% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-10px); } }
    @keyframes signup-hero-final { 0% { opacity: 0; transform: translateY(10px); } 14%, 100% { opacity: 1; transform: translateY(0); } }
    .signup-content { width: min(100%, 460px); margin: 0 auto; padding: 26px max(7vw, 28px) 0; }
    .form-eyebrow, .form-title { display: none; }
    .form-sub { max-width: none; margin: 0 0 18px; color: #707070; font: 13px/1.55 Arial, Helvetica, sans-serif; }
    .btn-google { width: 100%; margin: 0 0 18px; padding: 14px; border: 1px solid #b8b8b8; border-radius: 9px; background: #fff; color: #1d1d1d; font: 700 14px Arial, Helvetica, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .btn-google:hover { background: #f7f7f7; border-color: #777; box-shadow: 0 3px 10px rgba(0,0,0,.12); }
    .divider { margin: 0 0 18px; gap: 10px; color: #3d3d3d; font-size: 13px; font-weight: 600; }
    .divider::before, .divider::after { background: #dedede; }
    .field { margin-bottom: 12px; }
    .field label { display: block; margin-bottom: 5px; color: #333; font: 600 12px Arial, Helvetica, sans-serif; }
    .field input { padding: 12px 14px; border: 1px solid #a8a8a8; border-radius: 8px; background: #fff; color: #111; font: 13px Arial, Helvetica, sans-serif; }
    .field input::placeholder { color: #999; }
    .field input:focus { border-color: #000; background: #fff; box-shadow: 0 0 0 3px rgba(0,0,0,.08); }
    .field input.error { border-color: #b42318; }
    .field-error { color: #b42318; }
    .checkbox-row { color: #4d4d4d; font-size: 13px; }
    .checkbox-row input[type=checkbox] { appearance: none; width: 17px; height: 17px; margin-top: 1px; border: 1px solid #9a9a9a; border-radius: 4px; background: #fff; }
    .checkbox-row input[type=checkbox]:checked { border-color: #c41e3a; background: #c41e3a; box-shadow: inset 0 0 0 3px #fff; }
    .checkbox-row a, .form-switch a { color: #b01e36; font-weight: 700; }
    .btn-submit { padding: 13px; border-radius: 8px; background: #000; box-shadow: 0 4px 14px rgba(0,0,0,.18); font: 700 13px Arial, Helvetica, sans-serif; }
    .btn-submit:hover { background: #242424; box-shadow: 0 6px 18px rgba(0,0,0,.24); }
    .form-note { color: #707070; font-size: 11px; }
    .form-switch { color: #707070; font-size: 13px; }
    .alert { margin-bottom: 14px; }
    .alert.error { background: #fff1f0; color: #b42318; border-color: #fecdca; }
    @media (max-width: 760px) { .form-panel { padding-bottom: 26px; } .signup-hero { min-height: 40vh; min-height: 40svh; border-radius: 0 0 30px 30px; } .signup-content { padding: 22px 22px 0; } }
    @media (prefers-reduced-motion: reduce) { .signup-hero__message { animation: none; } .signup-hero__message:first-child { opacity: 1; transform: none; } }
  `;

  function addSharedStyles() {
    if (document.getElementById('animated-signup-hero-styles')) return;
    var style = document.createElement('style');
    style.id = 'animated-signup-hero-styles';
    style.textContent = sharedStyles;
    document.head.appendChild(style);
  }

  function AnimatedSignupHero(element) {
    var type = element.getAttribute('data-signup-type');
    var messages = heroContent[type] || heroContent.client;
    element.setAttribute('aria-label', messages.join(' '));
    element.innerHTML = '<div class="signup-hero__messages" aria-hidden="true">' + messages.map(function (message, index) {
      var finalClass = index === messages.length - 1 ? ' is-final' : '';
      return '<span class="signup-hero__message' + finalClass + '" style="--slot:' + index + '">' + message + '</span>';
    }).join('') + '</div>';
  }

  addSharedStyles();
  document.querySelectorAll('.signup-hero[data-signup-type]').forEach(AnimatedSignupHero);
}());
