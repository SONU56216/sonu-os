# SONU OS — Personal Productivity & Performance System

A real-time personal productivity dashboard built with **HTML, CSS, vanilla ES modules,
Firebase Auth, and Cloud Firestore**. Hosted for free on **GitHub Pages**.

## Features (planned / in progress)

- Email/password auth with persistent sessions
- Daily schedule builder with categories, priorities, and notes
- One-click Done with real-time Firestore sync
- GitHub-style contribution heatmap (365 days)
- LeetCode-style analytics (daily / weekly / monthly)
- Streak and consistency tracking
- Pomodoro focus timer with session logging
- ChatGPT schedule import (JSON) with validation + preview
- Per-user data isolation via Firestore Security Rules
- Dark/light theme, keyboard accessible, reduced-motion friendly

## Project structure

See the folder tree in the project README (Phase 1 of the master prompt).

## Setup

1. Create a Firebase project.
2. Enable **Email/Password** authentication.
3. Create a **Firestore** database.
4. Paste your web config into `js/firebase-config.js`.
5. Publish the rules in `firestore.rules`.

Full instructions will be added in Phase 8.

## Deployment

The app deploys as-is to GitHub Pages. All paths are relative so it works at
`https://<user>.github.io/<repo>/` (not just at the domain root).