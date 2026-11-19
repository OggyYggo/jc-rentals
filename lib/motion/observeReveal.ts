export function observeReveal(targets: Element[], reveal: (entering: Element[]) => void) {
  if (!targets.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const entering = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
    if (!entering.length) return;
    entering.forEach((target) => observer.unobserve(target));
    reveal(entering);
  }, { rootMargin: "0px 0px -12px 0px" });

  targets.forEach((target) => observer.observe(target));
  return () => observer.disconnect();
}
