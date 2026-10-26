# CeramiSys ERP - Agent Guidelines

## Project Overview
CeramiSys ERP is a desktop ERP system for ceramic and finishing materials showroom management. Built with Electron, React, and SQLite.

## Available Skills

### TestSprite Testing
- **testsprite-onboard**: First-run test setup for fresh projects
  - Use: `testsprite setup` then `testsprite onboard`
  - Requires: TestSprite API key from https://www.testsprite.com
  - This project currently has no TestSprite tests

- **testsprite-verify**: Verification loop after code changes
  - Use: Run `testsprite test run --all --project <id>`
  - For: Ensuring changes don't break existing functionality

### Code Review
- **zen-review**: Single-model code review
  - Costly - use only when explicitly requested
  - Analyzes: correctness, security, performance, quality

- **cross-review**: Multi-model code review
  - Requires: model specification from user
  - Merges findings from 3 subagents

- **zen-comprehensive-review**: Full multi-model orchestration
  - Most costly - spawns 3 review subagents
  - Posts to GitHub PR comments in PR mode

### Frontend & Design
- **frontend-design**: Create HTML pages and UI mockups
  - Can design: landing pages, dashboards, application interfaces
  - Supports: single designs and multiple variants

- **agent-browser**: Browser automation
  - For: website interaction, form filling, data extraction
  - Also: Electron desktop app automation

### Project Initialization
- **init**: Create AGENTS.md, contributor guidelines, documentation
  - Just created: AGENTS.md

### Skill Management
- **skill-creator**: Create/modify skills, run evals, benchmark performance

## Project Structure
- `src/` - Main source code (React + Electron)
- `src/pages/` - Page components
- `src/services/` - Business services
- `src/components/` - Reusable UI components
- `test/` - Jest test files
- `database/` - SQLite schema and migrations

## Development
- `npm run dev` - Start development server
- `npm run typecheck` - TypeScript type checking
- `npm test` - Run test suite
- `npm run build` - Build for production

## Adding New Features
1. Add service in `src/services/`
2. Create page component in `src/pages/`
3. Add route in `src/App.tsx`
4. Add tests in `test/`
5. Update database schema if needed

## Contributing
- Follow existing code conventions
- Write tests for new functionality
- Type-check before committing
- Document any new APIs or components