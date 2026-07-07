# UX/UI Page Audit Report

Date: 2026-07-07

Scope:

- Admin auth entry at `/`
- Public product landing page at `/landing`
- Authenticated admin workspace structure from `apps/admin/app/page.tsx`
- Desktop and mobile viewport checks through the local admin app on port `3002`

## Executive Summary

The product is moving in the right direction: the top-level admin tabs are much
clearer than a technical console, the Today page has the right idea with command
queue and readiness surfaces, and most major action areas use real buttons
instead of ambiguous static cards.

The main UX problem is not missing functionality. It is density and hierarchy.
The page often gives users several valid next places to click at once. For a
business owner, the interface should always answer:

1. What needs attention now?
2. Why does it matter?
3. What is the one next action?

The product should keep the current five-tab structure, but each tab needs a
stronger primary path and fewer same-level surfaces.

## Priority Findings

### P0: Make the primary goal impossible to miss

Current state:

- The admin auth screen is clear enough for returning users.
- On mobile, the product-page escape route sits below the intro and requires
  scrolling.
- The landing page has a visible primary CTA, but the mobile nav consumes about
  159px before the hero starts.

Recommended change:

- Keep login first on `/`, but add a small first-screen secondary link under the
  auth card: `Learn about the product`.
- On mobile landing, collapse navigation into a compact row or menu so the hero
  starts higher.
- Keep one dominant CTA label across the product: use `Open admin` everywhere,
  not both `Open admin` and `Open the admin`.

Why:

- A new visitor should understand within one screen whether they should log in,
  learn, or open the admin.

### P1: Enforce 44px touch targets

Current state:

- Auth mode buttons are about 34px tall.
- `Advanced` text buttons are about 17px tall.
- Landing mobile nav links are about 32px tall.
- Desktop hero/product buttons are acceptable, and mobile hero CTAs are 44px.

Recommended change:

- Give `.segmented button` and `.platformTabs button` `min-height: 44px` on all
  breakpoints.
- Give `.textToggle` a visible hit area, for example `min-height: 36px` plus
  padding, or turn it into a secondary icon/text button where it opens hidden
  settings.
- Give landing nav links at least 40-44px height on mobile.

Why:

- These controls invite clicking but are smaller than expected touch targets.
  Users should not need precision tapping.

### P1: Reduce same-level choices on the Today page

Current state:

- Today can show metrics, today panel, production readiness, progression,
  command queue, operational health, checklist, workflow suggestions, business
  readiness, needs attention, and recent conversations.
- Many of these are useful, but they compete for the same priority.

Recommended change:

- Put `Command queue` first after the intro and make it the single main task
  surface.
- Merge overlapping readiness/checklist/operational health panels into a
  smaller `Launch health` section.
- Keep metrics, but make metric cards secondary to action cards.
- On mobile, do not hide the home quick actions entirely; replace them with a
  compact action strip or keep only the top two actions.

Why:

- The user goal is not to read the dashboard. It is to know what to do next.

### P1: Make every dashboard click land closer to the goal

Current state:

- Many buttons switch tabs only. Examples: command queue actions,
  readiness actions, workflow recommendations, and some quick actions.
- Some actions already scroll to a target section, which is better.

Recommended change:

- Every action card should deep-link to the exact section, selected item, or
  drawer it references.
- Example: `Answer unanswered questions` should open Answers and scroll to the
  knowledge gap panel with a draft started if possible.
- Example: `Follow up open leads` should open Inbox/Leads with the highest
  priority lead selected.

Why:

- The two-click rule should mean: click action, land at the exact place, click
  confirm/save/reply. Tab-only navigation often adds a hunt step.

### P1: Simplify the Leads workspace hierarchy

Current state:

- Leads includes an action center, metrics, pipeline board, lead capture inbox,
  conversation inbox, handoff workflow, and contacts.
- This is comprehensive, but the mental model can feel like several products on
  one page.

Recommended change:

- Split the visible hierarchy into three bands:
  - `Work now`: due today, hot leads, open handoffs
  - `Pipeline`: stage board and lead cards
  - `Customer context`: conversations and contacts
- Keep handoff workflow in the same tab, but make handoff cards selectable from
  the `Work now` band instead of another full competing surface.
- Rename `Lead capture inbox` to `Captured leads`.

Why:

- Operators should know whether they are handling a lead, a conversation, or a
  handoff without reading every panel.

### P1: Simplify channel setup cards

Current state:

- Channel cards include purpose, next action, tutorial, checklist, status rows,
  fields, webhook, guide link, hint, and action buttons in one card.

Recommended change:

- Turn each channel card into a progressive disclosure flow:
  - Always visible: channel name, status, one next action, last issue
  - Expand: checklist and provider fields
  - Advanced: webhook and implementation guide
- Keep `Website first -> Telephone AI -> Messaging and email`, but visually
  mark the current step and the next required step.

Why:

- Setup should feel guided, not like a configuration dump.

### P2: Rename unclear or technical labels

Recommended text changes:

- `Brain suggestions` -> `Suggested answers`
- `Knowledge autopilot` -> `Knowledge gaps`
- `Bootstrap token` -> `Admin token` or hide under `Advanced admin access`
- `API base` -> `API endpoint`
- `User login` -> `Login`
- `Register` -> `Create account`
- `Open the admin` -> `Open admin`
- `View product page` -> `Learn about the product`

Why:

- Plain language reduces hesitation and support questions.

### P2: Make non-clickable cards less button-like

Current state:

- Some landing feature cards are static but use the same elevated card language
  as clickable admin cards.
- Admin metric cards are clickable, which is good, but static metrics elsewhere
  look similar.

Recommended change:

- Add a clear hover/focus affordance only to clickable cards.
- Add chevron/action icon to clickable metric/action cards.
- Keep static cards flatter and without hover movement.

Why:

- If something feels clickable, it should either be clickable or visually quiet.

### P2: Improve first-use empty states

Current state:

- Empty states are generally present, but some are passive: `No conversations`,
  `No handoff requests`, `No pending learning suggestions`.

Recommended change:

- Every empty state should include one action:
  - `No conversations yet. Send a test message.`
  - `No handoffs yet. Test a low-confidence question.`
  - `No suggested answers yet. Scan recent conversations.`

Why:

- Empty states are onboarding moments.

## What To Add

1. A persistent `Next best action` strip at the top of each authenticated tab.
2. Exact-section deep links for dashboard action cards.
3. A compact mobile quick-action strip on Today.
4. A clear touch-target rule in CSS for segmented controls, text toggles, and
   landing nav links.
5. Optional chevrons on clickable cards.
6. Empty-state action buttons.
7. A progressive disclosure pattern for channel setup.

## What To Change

1. Reorder Today so command queue comes before broad metrics/readiness panels.
2. Merge overlapping readiness/checklist/health widgets into one launch-health
   summary.
3. Rename technical labels to user-recognizable labels.
4. Use one CTA vocabulary: `Open admin`, `Login`, `Create account`,
   `Suggested answers`, `Knowledge gaps`.
5. Make tab-level actions scroll/select the exact item where possible.

## What To Delete Or Hide

1. Hide `Bootstrap token` from the default auth segmented control for normal
   users; keep it under advanced admin access.
2. Hide `API base` unless advanced mode is open.
3. Remove duplicate same-priority panels from the first screen of Today.
4. Remove the mobile landing full nav layout if it continues to consume too much
   vertical space.
5. Remove hover/raised treatment from static informational cards that are not
   clickable.

## Two-Click Goal Plan

### Login goal

Target path:

1. User enters email/password and clicks `Login`.
2. User lands on Today with the top action visible.

Change needed:

- Keep auth clean, make advanced/admin-token access secondary, and show product
  learning link on the first screen.

### Improve an answer

Target path:

1. Click `Answer unanswered questions` from Today.
2. Land on the specific knowledge gap with `Draft answer` ready.

Change needed:

- Deep-link action cards to `knowledge-manager` or the knowledge gap section and
  prefill draft fields when a gap exists.

### Follow up a lead

Target path:

1. Click `Follow up open leads` from Today.
2. Lead drawer opens with reply/call/follow-up actions visible.

Change needed:

- Command queue actions should select the highest-priority lead, not only switch
  to the Leads tab.

### Connect a channel

Target path:

1. Click channel setup action.
2. Land on the relevant channel card expanded to its next missing step.

Change needed:

- Store target channel/step state when navigating to Channels.

### Test the assistant

Target path:

1. Click `Open test` or `Run test`.
2. Test Studio opens with a suggested scenario filled.

Change needed:

- The knowledge loop already does part of this. Apply the same pattern to more
  action cards.

## Implementation Plan

### Phase 1: Fast UX fixes

- Increase touch targets for segmented controls, text toggles, and landing nav.
- Rename unclear labels.
- Unify CTA wording.
- Add clear hover/focus affordance only to clickable cards.
- Move/harden the mobile product-page link on auth.

### Phase 2: Navigation and hierarchy

- Reorder Today around `Command queue`.
- Add exact-section navigation helpers for actions.
- Keep mobile quick actions visible in compact form.
- Merge readiness/checklist/health into one launch-health block.

### Phase 3: Workflow polish

- Lead action click opens the selected lead drawer.
- Knowledge action click starts from the relevant gap.
- Channel action click expands the required setup step.
- Empty states become action-oriented.

### Phase 4: Larger cleanup

- Extract major page areas from `page.tsx` into focused components.
- Convert channel setup cards to progressive disclosure.
- Split Leads into `Work now`, `Pipeline`, and `Customer context`.

## Acceptance Criteria

- All mobile clickable targets are at least 44px high or have a 44px hit area.
- Every action card lands at a specific task, not just a broad tab.
- A new owner can identify the next action on Today in under 5 seconds.
- No first-screen mobile page is dominated by navigation chrome.
- Clickable cards have consistent hover/focus/chevron affordance.
- Static cards no longer look like buttons.
- Empty states always offer a next action.
