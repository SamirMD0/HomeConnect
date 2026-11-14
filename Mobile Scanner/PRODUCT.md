# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Mainly the shop owner/admin on the go (confirmed 2026-11-14). They check money at a glance (receivables, totals, what needs action), record supplier payments and bills, approve, and look up customers and stock. Shop staff also use it at the counter to scan, sell, receive goods and photograph bills. Staff see fewer money screens because of role permissions.

## Product Purpose

Home Connect Mobile is the phone client of the Home Connect ERP that runs on the shop PC: the same data and business rules, reached over the shop Wi-Fi. It isn't a separate system. Success means the owner can run the shop from the phone without walking to the PC, and staff never retype what the phone already captured.

## Positioning

A phone that speaks directly to the shop's own PC over the LAN. There is no cloud account and nothing hosted between them. Every number on the phone is the same number the PC shows, because both read one backend.

## Operating Context

- Android phones, used one-handed in a busy shop, often with gloves or wet hands. Light can be bright daylight at the door or dim stock rooms.
- Connected to the shop PC gateway on port 3011 over Wi-Fi. Offline moments are normal, so bill photos queue on the phone and sync later.
- Multi-branch: one branch is picked in the header, and every screen follows it.
- Money is USD with LBP alongside. Customer names and notes are often Arabic, mixed with English.
- Updates: small changes arrive over the air (EAS preview channel). Native changes need a new APK.

## Capabilities and Constraints

- Expo SDK 54, expo-router, React Query. Light theme only for now.
- Roles: ADMIN and EMPLOYEE. Money totals and admin writes follow the PC's rules (`src/permissions/can.ts`).
- Phone features ship only as far as the shop PC version allows. Features that need a newer PC are held until the PC updates.
- No shop-PC commands: operator steps on the PC are click-only.

## Brand Commitments

- The Home Connect logo blue (#1A6FC9) is the brand colour. Green means money in or done.
- The style reference is the Noble POS-ERP mobile design (screenshots shared 2026-11-14): white screens, light blue filled inputs, bold left-aligned titles, a blue hero card, tinted icon tiles, pill filters and zebra tables. It is a reference, not a copy.
- System font (Roboto), so Arabic renders natively.
- Short screen text with no tutorial copy. Labels and icons do the work.

## Evidence on Hand

Real shop data lives on the shop PC. There are no marketing assets, testimonials or screenshots to reuse, so none may be invented.

## Product Principles

1. Same truth as the PC: never compute a second answer for money.
2. Numbers first for the owner, actions first for staff.
3. Capture once: what the phone records never needs retyping.
4. Works in a real shop: big targets, readable in sunlight, tolerant of flaky Wi-Fi.

## Accessibility & Inclusion

Mixed Arabic and English text (RTL names inside LTR screens). Touch targets of at least 48 dp. Must stay readable at large system font sizes.
