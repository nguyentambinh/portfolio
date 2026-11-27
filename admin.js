// Nguyễn Tâm Bình - 2324801030003
const track = document.getElementById('project-track');
const projects = Array.from(track.querySelectorAll('.project-record'));
const stops = Array.from(document.querySelectorAll('.project-stops a'));
const previous = document.querySelector('.project-prev');
const next = document.querySelector('.project-next');
const position = document.querySelector('.project-position');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let active = 0;
let settleTimer;
let drag;

function nearestProject() {
  return Math.max(0, Math.min(projects.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
}

function selectProject(index) {
  active = index;
  const focused = document.activeElement.closest('.project-record');
  if (focused && focused !== projects[index]) track.focus({ preventScroll: true });
  projects.forEach((project, i) => { project.inert = i !== index; });
  stops.forEach((stop, i) => {
    if (i === index) stop.setAttribute('aria-current', 'true');
    else stop.removeAttribute('aria-current');
  });
  position.value = `${index + 1} / ${projects.length}`;
  previous.setAttribute('aria-disabled', String(index === 0));
  next.setAttribute('aria-disabled', String(index === projects.length - 1));
}

function goTo(index, smooth = true) {
  if (index < 0 || index >= projects.length) return;
  clearTimeout(settleTimer);
  selectProject(index);
  track.scrollTo({ left: projects[index].offsetLeft, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
}

stops.forEach((stop, index) => stop.addEventListener('click', event => {
  event.preventDefault();
  goTo(index);
}));
previous.addEventListener('click', () => goTo(active - 1));
next.addEventListener('click', () => goTo(active + 1));
track.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  goTo(active + (event.key === 'ArrowLeft' ? -1 : 1));
});
track.addEventListener('scroll', () => {
  clearTimeout(settleTimer);
  if (!drag?.moved) settleTimer = setTimeout(() => selectProject(nearestProject()), 140);
}, { passive: true });

// Touch and trackpad scrolling use the browser's snap points. A mouse drag
// can move at most one project from its starting point.
track.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('summary, details p, a, button')) return;
  event.preventDefault();
  drag = { id: event.pointerId, x: event.clientX, left: track.scrollLeft, start: nearestProject(), moved: false };
  track.setPointerCapture(event.pointerId);
});
track.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  const distance = drag.x - event.clientX;
  if (!drag.moved && Math.abs(distance) < 8) return;
  if (!drag.moved) {
    clearTimeout(settleTimer);
    track.classList.add('is-dragging');
    drag.moved = true;
  }
  const min = projects[Math.max(0, drag.start - 1)].offsetLeft;
  const max = projects[Math.min(projects.length - 1, drag.start + 1)].offsetLeft;
  track.scrollLeft = Math.max(min, Math.min(max, drag.left + distance));
});
function finishDrag(event) {
  if (drag?.id !== event.pointerId) return;
  const { x, start, moved } = drag;
  drag = null;
  if (!moved) return;
  track.classList.remove('is-dragging');
  const distance = x - event.clientX;
  const threshold = Math.min(88, track.clientWidth * .15);
  const step = event.type === 'pointerup' && Math.abs(distance) >= threshold ? Math.sign(distance) : 0;
  goTo(Math.max(0, Math.min(projects.length - 1, start + step)));
}
track.addEventListener('pointerup', finishDrag);
track.addEventListener('pointercancel', finishDrag);
track.addEventListener('lostpointercapture', finishDrag);

track.dataset.draggable = '';
document.querySelector('.project-controls').hidden = false;
const linkedProject = stops.findIndex(stop => stop.hash === location.hash);
goTo(Math.max(0, linkedProject), false);
