# [QUALITY] Add formatter + linter with CI gates

## Type
Quality · Developer experience

## Summary
Introduce **Biome** or **Prettier + ESLint** (pick one ecosystem) scoped to `main/`, `renderer/`, scripts. Add **`npm run check`** wired in CI alongside `npm run build`.

## Acceptance criteria
- [ ] Config committed; autofix documented in CONTRIBUTING.
- [ ] First PR ignores historical noise via incremental `warn`/`off` pragmas minimized — preferably one-time format commit with maintainer ACK.
- [ ] CI fails on regression.
