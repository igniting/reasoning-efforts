const progressBar = document.querySelector(".read-progress span");

function updateReadingProgress() {
  const available = document.documentElement.scrollHeight - window.innerHeight;
  const progress = available > 0 ? (window.scrollY / available) * 100 : 0;
  progressBar.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
}

window.addEventListener("scroll", updateReadingProgress, { passive: true });
window.addEventListener("resize", updateReadingProgress);
updateReadingProgress();

const sections = [...document.querySelectorAll(".article-section, .sources")];
const contentsLinks = [...document.querySelectorAll(".contents a")];
const navigationGroup = {
  "reasoning-tokens": "what-effort-controls",
  "nearby-controls": "what-effort-controls",
  "agent-harness": "automatic-effort",
  evaluating: "choosing",
  "failure-modes": "production",
  closing: "rules",
};

function updateCurrentSection() {
  const readingLine = window.innerHeight * 0.18;
  let current = sections[0];

  sections.forEach((section) => {
    if (section.getBoundingClientRect().top <= readingLine) current = section;
  });

  if (!current) return;
  const navigationId = navigationGroup[current.id] ?? current.id;
  contentsLinks.forEach((link) => {
    link.classList.toggle("is-current", link.hash === `#${navigationId}`);
  });
}

window.addEventListener("scroll", updateCurrentSection, { passive: true });
window.addEventListener("resize", updateCurrentSection);
updateCurrentSection();

document.querySelectorAll(".copy-button").forEach((copyButton) => {
  copyButton.addEventListener("click", async () => {
    const target = document.querySelector(`#${copyButton.dataset.copyTarget}`);
    if (!target) return;

    try {
      await navigator.clipboard.writeText(target.innerText);
      copyButton.textContent = "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyButton.textContent = "Selected";
    }

    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1400);
  });
});

document.querySelectorAll(".mobile-contents a").forEach((link) => {
  link.addEventListener("click", () => link.closest("details")?.removeAttribute("open"));
});
