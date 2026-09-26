# AI usage notes

This is a running log that feeds the README's "AI Usage" section. Add a dated entry whenever an AI
suggestion is accepted, rejected, or changed in a way that's worth mentioning.

## Tools
- Claude Code (Claude Opus 5.5): used for requirements analysis, design brainstorming, the spec and plans, and implementation help.

## Log
- 2026-09-26: **Accepted.** Split the PRD's single lifecycle into a pool state machine and a ride-request state machine, so per-passenger status and privacy stay simple.
- 2026-09-26: **Changed.** The AI's first stack suggestion was framed around "what I'd pick". I asked instead which stack would be easiest to *explain*. That moved us to Express over NestJS and React + Vite over the Next.js App Router.
