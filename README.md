# AI Engineering Academy

A beginner classroom with seven first-week lessons, visuals, practice, quizzes, a notebook, and read-aloud.

This version runs on GitHub Pages. It needs no always-on PC or API key. Open `index.html` through the published HTTPS website rather than directly from disk.

## Learning and privacy

Progress, attempts, and notes are stored in this browser only. They are not uploaded to the repository. Use My progress > Export my record, then Import my record on another device. Imports merge records rather than erase existing notes. Clearing browser storage can remove this device's record, so keep an export.

ChatGPT opens in a separate tab. Copy the current lesson and your question, then paste them into ChatGPT. This site does not claim to embed the ChatGPT product or run the PC-only Codex tutor online. No account tokens or API keys are requested.

Lesson pages and quiz questions include recorded narration, created from the original course text using a local Windows voice. Playback speed, pause, and resume work in the browser. Reading custom notes uses the browser's speech service. Available browser voices vary; online voices may send text to their voice provider.

The Python pad loads Pyodide v314.0.8 from jsDelivr into a module worker. It uses a restricted AST interpreter for print, variables, and arithmetic. Practice code stays in the browser. The first run needs an internet connection to download the runtime. Later course levels are plans, not completed lessons.

## Deploy

Publish this repository's main branch from the root folder using GitHub Pages. All public files are listed in RELEASE_MANIFEST.json. Private study records, credentials, the local SQLite database, and local server logs are not part of the release.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [Pyodide workers](https://pyodide.org/en/stable/usage/webworker.html).
