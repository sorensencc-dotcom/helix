# Helix Phase 8 unified authority contract request

**Recipients:** Windows HTTP Auth/Platform Owner, ICF Contract Owner, and Sigil Contract Owner  
**Sender:** Helix Operator (Chris Sorensen)  
**Status:** Delivery packet; not an authority contract or implementation approval.

## Purpose

Helix Phase 8 requires authoritative, versioned, deterministic identity and authentication contracts before HTTP authentication, adapter identity binding, or contract-gate closure.

## Windows Integrated Authentication transport

Supply the Kerberos-preferred and NTLM-fallback handshake, required headers and negotiation flow, SID/UPN/group extraction, downgrade protection, expired/missing/failed-ticket behavior, Helix-envelope mapping, versioning, rotation rules, and deterministic fixtures for success, expired ticket, missing ticket, downgrade, and malformed negotiation.

## ICF identity and receipts

Supply required identity fields and envelope, validation rules, lineage anchors, audit-receipt identity fields, missing/invalid identity behavior, versioning, and deterministic identity/receipt success and failure fixtures.

## Sigil identity, approval, execution, and receipts

Supply required identity envelope and validation, approval and execution identity rules, receipt identity fields, missing/invalid identity behavior, versioning, and deterministic approval, execution, and receipt success and failure fixtures.

## Required delivery format

Each owner supplies a contract document, version-locked CI fixture package, canonical source declaration, change-control and compatibility rules, deprecation policy, and an approval statement: “This is the authoritative contract for Helix Phase 8.”

## Gate rule

Helix will not implement HTTP authentication transport, bind adapter identities, propagate identity into ICF or Sigil, or close the Phase 8 contract gate until all three contracts are supplied and approved.
