/**
 * Scroll-triggered fade-in animations.
 *
 * Add class="fade-section" to any element that should
 * fade in when it enters the viewport.
 */
document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('.fade-section');

  if (!('IntersectionObserver' in window)) {
    sections.forEach((s) => s.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  sections.forEach((s) => observer.observe(s));
});
