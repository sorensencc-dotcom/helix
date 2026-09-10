# Helix status

## Current goal

Build the unified foundation for Helix, a local personal AI assistant serving IronLedger and IronCommand Forge.

## Approved decisions

- Local Windows daemon with HTTP API, CLI, and browser UI from the first release.
- ICF owns knowledge, retrieval, context, lineage, audit, and governance.
- Sigil owns execution, approvals, capabilities, and environment interaction.
- Windows identity controls local access; ICF and Sigil identities remain distinct.
- WhichLLM manages model selection; cloud routing requires explicit operator enablement.
- Automatic retrieval is default; operators can constrain or explicitly select sources.
- Governed content fails closed when ICF is unavailable; ungoverned reasoning may degrade read-only; governance-grade work queues.
- Ordinary conversations persist in encrypted local storage; governed content remains RAM-only unless explicitly exported or pinned.
- Foundation begins read-only; future mutations require registered capabilities and Sigil approval.

## Artifacts

- Design: `docs/superpowers/specs/2026-09-10-helix-unified-foundation-design.md`
- Implementation plan: `docs/superpowers/plans/2026-09-10-helix-unified-foundation-implementation-plan.md`

## Commits

- `6f3e0a6` — foundation design
- `e1f6dab` — client design completion
- `7279be8` — engineering design completion
- `83471c6` — runtime contract hardening
- `8b111d7` — implementation plan

## Next action

Start Phase 1: add the TypeScript runtime manifest, test framework, CI, domain contracts, application service boundaries, infrastructure ports, configuration validation, and daemon health endpoint.

## Blockers

- Confirm concrete ICF, WhichLLM, and Sigil adapter protocols before integration work.
- Supply MSIX signing identity and release channel before packaging work.
- Repository preflight requires a recognized manifest; Phase 1 adds one.

## Working state

Branch `main`, five commits ahead of `origin/main`, clean at handoff. No implementation code exists yet.
