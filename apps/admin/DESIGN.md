# Design

## Summary

Quickload Admin is a restrained product interface for logistics operations. It uses neutral surfaces, compact typography, strong table rhythm, and semantic state color. The design should disappear into the work.

## Color

- Background: cool neutral slate, not warm beige.
- Surface: white and near-white panels with defined borders.
- Ink: high-contrast slate text for body and data.
- Accent: emerald for primary navigation and confirmed/healthy states.
- Warning: amber for pending operational work.
- Critical: rose/red for failed, canceled, or overdue states.
- Info: sky/blue for in-transit or system progress.

## Typography

Use the existing system sans stack. Keep product headings fixed-size and compact. Labels should be small, readable, and untracked. Tables should prioritize clear numeric alignment and stable row height.

## Components

- Shell: left navigation on desktop, compact top navigation on small screens.
- Metrics: compact summary panels with labels, values, and one supporting line.
- Tables: full-width, bordered containers, sticky visual header styling, readable row separators.
- Pills: semantic state chips for parcel and payment status.
- Forms: consistent border, focus ring, disabled, and error treatment.
- Empty states: short explanatory copy and a next action when available.

## Layout

Prioritize operations over decoration. The dashboard starts with context, then KPIs, then an attention queue, then recent activity. Use dense grids only where comparison helps. Avoid nested cards and oversized empty spacing.

## Motion

Keep motion minimal. Use hover/focus feedback only. Respect reduced motion. No page-load choreography.
