# Mandatory UI/UX Design System Rules & HCI Framework — Pointage

These guidelines must be strictly and unconditionally followed in EVERY interaction, component, refactor, and screen in this project:

---

## 1. Fundamental Interaction Laws

### A. Fitts’s Law ($T = a + b \log_2(1 + \frac{D}{L})$)
* Time to reach a target depends on distance $D$ and target width/height $L$.
* **Application**:
  - Place frequently used controls in the primary thumb zone (bottom & central prominence on mobile).
  - Enlarge critical call-to-action buttons (e.g., Scanner, Add Count, Stage navigation) to $\ge 48\text{px}$ – $56\text{px}$.
  - Avoid small, distant clickable areas.
  - Floating bottom bar keeps primary actions at zero reach distance.

### B. Miller’s Law ($7 \pm 2$ Chunks)
* Short-term memory (MCT) saturates quickly.
* **Application**:
  - Information must be structured into digestible "chunks" (e.g., grouping line numbers, package counts, phone digits).
  - Limit menus, tabs, and standalone list options to a maximum of 7 items (e.g., exactly 3 process stages: Préparation, Chargement, Pointage).
  - Restrict the functional color palette to $\le 7$ colors (Emerald, Sapphire Blue, Amethyst, Amber, Ruby/Red, Charcoal, Slate).

### C. Jakob’s Law
* Users spend most of their time on other applications.
* **Application**:
  - Leverage familiar interaction paradigms, common conventions, and established mental models (iOS/Android mobile navigation, floating bottom bar, pull-to-refresh, standard back navigation, card metaphor).
  - Immediate zero-training usability on first contact.

### D. Hick’s Law
* Decision time increases logarithmically with the number and complexity of choices ($T = b \log_2(n + 1)$).
* **Application**:
  - Simplify choices and use progressive disclosure: hide secondary technical controls under collapsible cards or modals.
  - Default to smart recommendations (e.g., smart quantity step, default operator, auto-selected active stage).

---

## 2. Cognitive & Memory Constraints (MPH Consequences)

### Short-Term Memory (MCT)
* Limit menu items and standalone list options to a maximum of 7 items.
* Establish visual associations across related elements using coordinated colors, formats, and positioning.
* Keep all system feedback and interface messages concise and explicit.
* Eliminate redundant and unnecessary background noise/information to avoid visual clutter.

### Long-Term Memory (MLT)
* Foster learning through structured repetition and standardized layouts.
* Differentiate UI patterns between frequent-use tools (fast counter, barcode scanning) and intermittent-use tools (export, settings, sync).
* Cap system response times at a maximum threshold of 2 seconds to prevent attentional drift.
* Ensure immediate visual/haptic/audio confirmation in $< 100\text{ms}$ (instant sensory reassurance).
* **3-Click Rule**: Ensure any desired piece of information (bill, line item, summary, export) can be reached within 3 clicks from home.

---

## 3. Screen Organization & Visual Perception

* **Visual Parsing**:
  - First-time users scan in a **Z-Pattern** (Top-left branding/header $\rightarrow$ top-right status $\rightarrow$ central summary $\rightarrow$ bottom primary action).
  - Experienced users follow a **Selective Path** directly toward the search bar or product card.
* **Central Prominence**: Center of the viewport offers highest visibility and physical accessibility.
* **Temporal Threshold**: Visual stimuli separated by $< 100\text{ms}$ are perceived simultaneously by the visual sensory subsystem (foundation for instantaneous haptic/audio chime/luminous feedback).
* **Global Context (Gestalt Perception)**: Visual elements are interpreted within their surrounding context. Containers, borders, and whitespace clearly demarcate semantic boundaries.

---

## 4. Visual Styling, Colors & Typography

### Color Rules
* Maintain strong luminance contrast between text and background (WCAG AAA compliance).
* Restrict functional color palette to a maximum of **7 semantic colors**:
  1. 🟢 **Emerald (#10b981)**: Success, Valid, Conforme, Préparation.
  2. 🔵 **Sapphire Blue (#3b82f6)**: Chargement, Logistics, Information.
  3. 🟣 **Amethyst Violet (#a855f7)**: Pointage, Excess, Wilaya badge.
  4. 🟡 **Amber (#f59e0b)**: Warning, Shortage (Manquant), In rotation.
  5. 🔴 **Ruby (#ef4444)**: Error, Anomaly, Out of stock (Rupture).
  6. ⚪ **White / Pure Silver (#ffffff / #d1d5db)**: Primary high-contrast text.
  7. ⚫ **Charcoal Obsidian (#0c0d10 / #16171b)**: Deep matte canvas background.
* **Color-Blind Accessibility (Affects 8–10% of men)**:
  - NEVER rely on color alone!
  - Always pair color with an explicit shape/icon (`IconCheck`, `IconAlertTriangle`, `IconPlus`, `IconX`, `IconBox`) and text label.
* **Functional Color Coding**:
  - Same information type $\rightarrow$ Identical color.
  - Contrasting information types $\rightarrow$ High-contrast colors.
  - Similar information types $\rightarrow$ Subtle variations.

### Typography Guidelines
* Sans-serif typefaces (`Plus Jakarta Sans`, system `-apple-system`, `SF Pro Display`) for digital displays to preserve legibility.
* Monospace font (`JetBrains Mono`) strictly for barcodes, references, numbers, and quantities.
* Restrict continuous use of bold, italics, and underlining in body copy.
* **Avoid sustained UPPERCASE text**: Standard mixed lowercase (Title Case / Sentence case) is significantly easier and faster to read. Reserve uppercase only for short 2-3 letter abbreviations (BL, BC, EAN, REF, DA).

---

## 5. Language, Navigation & Dialogue Flow

* **Grouping Controls**: Cluster interface actions and buttons according to their shared semantic meaning or the specific data object they manipulate.
* **User Language**: Avoid cryptic jargon (no obscure slang like "douchette"), use plain warehouse vocabulary, and prevent navigation dead ends (every modal and subscreen has a clear return/close path).
* **Natural Chronological Sequence**: Preparation $\rightarrow$ Chargement $\rightarrow$ Pointage $\rightarrow$ Récapitulatif / Bon de Sortie.
* **System Messages**: Draft messages that are concise, homogenous, phrased in the active voice, framed in the affirmative, and explicit about context and consequences.

---

## 6. Ergonomic Criteria & Design Frameworks

### Bastien & Scapin (INRIA Criteria)
* **Guidance (Guidage)**: Grey out disabled commands, display lists of acceptable values, visually group equivalent items while separating distinct ones.
* **Compatibility (Compatibilité)**: Align presentation formats with existing physical Algerian BL/invoice documentation.
* **Consistency (Homogénéité / Cohérence)**: Standardize layout regions, button placement, typography, wording, and response latencies across every view.
* **Assistance in Error Handling**: Immediate detection, diagnosis, and non-destructive recovery (e.g. Undo toast, Stage transfer suggestion, Cross-bill reallocation).

### Nielsen’s 10 Usability Heuristics
1. Visibility of system status (instant feedback).
2. Match between system and real world (warehouse terminology, carton counts).
3. User control and freedom (emergency exit, undo, collapsible sections).
4. Consistency and standards (Apple HIG + Material patterns).
5. Error prevention (confirmation modals on irreversible deletions, safety checks).
6. Recognition over recall (visual rings, carton photo placeholders, client badges).
7. Flexibility and accelerators (Smart search, quick quantity step buttons).
8. Aesthetic and minimalist design (Less is more, generous whitespace).
9. Help users recognize, diagnose, and recover from errors.
10. Help and documentation (built-in onboarding walkthrough).

### Coutaz’s 7 Golden Rules
1. Strive for consistency (lutter pour la cohérence).
2. Strive for conciseness (lutter pour la concision).
3. Reduce cognitive load (réduire la charge cognitive).
4. Keep control in the hands of the user (mettre le contrôle entre les mains de l'utilisateur).
5. Flexibility of use (souplesse d’utilisation).
6. Structure the dialogue (structurer le dialogue).
7. Predict errors (prédire les erreurs).

---

## 7. Geometry, Whitespace & Apple Glass Aesthetic

* **Strictly No Sharp Corners**: Radii from 18px to 28px for cards/modals, 9999px for pills, 50% for circular icon buttons.
* **Lots of Whitespace**: Minimum 16px to 24px margins, paddings, and gaps. Elements must never touch.
* **Multi-Sensory VAKT Feedback**:
  - Visual: Ambient color glows, smooth 100ms transitions.
  - Auditory: Pure harmonic sine wave Web Audio chimes (high-frequency match, dissonant low error).
  - Kinesthetic / Tactile: Haptic vibration feedback on every meaningful interaction.
