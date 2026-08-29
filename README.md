# Reasoning Effort

A zero-build, GitHub Pages-ready long-form guide to reasoning effort in LLMs. It covers provider APIs, open-weight training and serving, automatic effort selection, and the role of an agent harness in production.

## What is included

- A complete long-form article, from the history of test-time reasoning to current provider APIs, open-weight implementations, published benchmarks, agent harnesses, and production routing
- Text-first editorial layout with a narrow long-form reading column
- Sticky section navigation and reading progress
- Responsive layouts for desktop, tablet, and mobile
- Accessible focus states and reduced-motion support
- Editable Markdown article source in [`content/article.md`](./content/article.md)
- Automatic GitHub Pages deployment on pushes to `main`

## Preview locally

No package install or build step is required.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a GitHub repository and push this directory to its `main` branch.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the **Actions** tab and wait for “Deploy to GitHub Pages” to finish.

The site will be available at `https://YOUR-USERNAME.github.io/REPOSITORY/`. Relative asset paths make it safe to publish beneath a repository subpath.

The workflow follows GitHub's current static-site guidance and uses the official Pages actions. See [GitHub's deployment documentation](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically).

## Editing

- Page structure and published copy: `index.html`
- Visual system and responsive behavior: `styles.css`
- Reading progress, section navigation, and copy action: `script.js`
- Plain Markdown article: `content/article.md`

When API details change, update both `index.html` and `content/article.md` and keep claims tied to model-specific sources. The expandable reference appendices are intended to absorb fast-moving provider and open-model details without interrupting the main narrative.
