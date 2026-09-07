# Mandatory UI/UX Design System Rules & Guidelines — Pointage

These guidelines must be strictly and unconditionally followed in EVERY interaction, component, refactor, and screen in this project:

## 1. Apple Design Guidelines & Apple-Like Glass UI
* High-end Apple iOS 18 / iPadOS / visionOS aesthetic.
* Translucent glassmorphism (`backdrop-filter: blur(28px) saturate(180%)`, specular highlights `inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`).
* Soft, organic, tactile feel with subtle borders (`rgba(255, 255, 255, 0.08)` or `rgba(0, 0, 0, 0.06)` in light mode).
* Deep charcoal matte dark mode (`#0c0d10`) and crisp high-contrast light mode.

## 2. "Less is More" Philosophy & Zero Clutter
* Radical simplification: never clutter or overwhelm the user with walls of text or secondary technical badges.
* Tune specifically for warehouse operators and managers with low attention span (quick, glanceable, high-impact visuals).
* Progressive disclosure: keep screens clean, open, and focused on the immediate task.

## 3. LOTS of White Space (SUPER IMPORTANT)
* Generous margins, paddings, and gaps (`gap: 12px` to `20px`, `marginBottom: 20px` to `24px`).
* NEVER let elements, cards, lists, or form boxes touch each other!
* Every section, card, and floating container must have breathing room around it.

## 4. STRICTLY NO SHARP CORNERS
* Absolutely avoid sharp rectangles, square corners, or harsh 0px/4px designs!
* All corners MUST be rounded and organic:
  - Cards & Modals: `border-radius: 20px` to `28px`
  - Floating items & rows: `border-radius: 18px` to `22px`
  - Interactive buttons & inputs: `border-radius: 16px` to `20px`
  - Status badges & pills: `border-radius: 9999px`
  - Icon buttons: Circular `border-radius: 50%`

## 5. Visuals Over Text
* "Never do something by text if you can do it visually more effectively."
* Use pure icons instead of text labels wherever intuitive.
* Use data visualizations:
  - Concentric Activity Rings (Apple Watch style)
  - Donut & Pie Charts (ConformityDonutChart)
  - Process flowcharts & dynamic steppers (WarehouseProcessFlow)
  - Truck & Quai loading diagrams (TruckLoadingDiagram)
  - Segmented capsule progress bars

## 6. Multi-Sensory VAKT System (Visual, Auditory, Kinesthetic, Tactile)
* **Visual (V)**: Color coding (Emerald = success/exact, Amber = warning/short, Ruby = error/anomaly, Violet = surplus), ambient perimeter flashes, smooth cubic-bezier transitions (`0.16, 1, 0.3, 1`).
* **Auditory (A)**: Harmonic Web Audio chimes (soft attack, pure sine waves, no harsh clicks) + global mute toggle.
* **Kinesthetic & Tactile (K/T)**: Haptic vibrations (`navigator.vibrate`) on every interactive touch:
  - `hapticTap('light')` (8ms) on chips, navigation tabs, minor buttons
  - `hapticTap('medium')` (16ms) on count additions, selections, steppers
  - `hapticSuccess()` ([12ms, 30ms, 18ms]) on completion, exact match, sign-off
  - `hapticWarning()` ([25ms, 40ms, 25ms]) on duplicates or warnings

## 7. Warehouse Touch Ergonomics
* Minimum 48px to 56px touch target height on all primary tap targets for gloved or fast fingers.
* High contrast typography (WCAG AAA) with Plus Jakarta Sans and JetBrains Mono.
