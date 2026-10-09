# Design System Document: Financial Editorial Experience

## 1. Overview & Creative North Star
The **Creative North Star** for this design system is **"The Sovereign Vault."** 

In financial services, luxury is defined by stability, depth, and intentionality. We are moving away from the "flat" and "generic" mobile-app look (Reference Image 2) to create a high-end editorial experience. By utilizing the deep navy and vibrant green of the brand identity, this system breaks traditional grid constraints with intentional asymmetry, overlapping elements, and high-contrast typography scales. The UI should feel like a premium digital ledger—authoritative yet breathable.

## 2. Colors
Our palette is anchored in deep, ink-like navies and punctuated by high-energy greens.

*   **Primary (`#b6c4ff`):** Used for interactive elements and highlights that guide the user's eye.
*   **Secondary (`#40e56c`):** The signature vibrant green from the logo. Reserve this for "success" moments and high-priority brand accents.
*   **Neutral Surfaces (`#10131b` to `#32353e`):** The foundation of our dark theme.

### The "No-Line" Rule
To maintain a high-end editorial feel, **prohibit the use of 1px solid borders for sectioning.** Boundaries must be defined solely through background color shifts or tonal transitions. Use `surface-container-low` against a `background` to create a section without a structural line.

### Surface Hierarchy & Nesting
Treat the UI as layered sheets of obsidian. 
*   **Background (`#10131b`):** The base layer.
*   **Surface-Container-Low (`#181b24`):** Use for large secondary content areas.
*   **Surface-Container-High (`#272a32`):** Use for primary interactive cards.
Nesting these creates depth without clutter. For example, an input field (`surface-container-highest`) sitting inside a login card (`surface-container-high`).

### The "Glass & Gradient" Rule
For floating elements (like a login modal), apply a semi-transparent `surface` color with a `backdrop-blur` of 20px. For main Action Buttons, use a subtle linear gradient from `primary` to `primary-container` to give the UI "soul" and a sense of metallic weight.

## 3. Typography
We use a dual-typeface system to balance authority with readability.

*   **Display & Headlines (Manrope):** A modern geometric sans-serif that feels architectural. Use `display-lg` (3.5rem) for hero login titles to create a bold, editorial entrance.
*   **Body & Labels (Inter):** A high-legibility workhorse. Use `body-md` (0.875rem) for form instructions to ensure clarity.
*   **Intentional Contrast:** Pair a large `headline-lg` title with a significantly smaller `label-md` uppercase subtitle to create a "Signature Editorial" hierarchy that feels custom-designed rather than templated.

## 4. Elevation & Depth
Depth in "The Sovereign Vault" is achieved through light and layering, never through heavy black shadows.

*   **The Layering Principle:** Stack `surface-container` tiers. Place a `surface-container-lowest` element on a `surface-container-low` section to create a soft "recessed" look.
*   **Ambient Shadows:** For floating login cards, use an extra-diffused shadow. 
    *   *Blur:* 40px–60px.
    *   *Opacity:* 6%. 
    *   *Color:* Tint the shadow with `primary-container` (`#001b5e`) to mimic the way light behaves in a dark blue environment.
*   **The "Ghost Border" Fallback:** If a field requires definition for accessibility, use the `outline-variant` (`#454650`) at **15% opacity**. This provides a hint of structure without the "boxiness" of a standard UI.

## 5. Components

### Input Fields
*   **Styling:** No solid borders. Use `surface-container-highest` (`#32353e`) as the fill. 
*   **States:** On focus, transition the background to `primary-container` and add a subtle `secondary` (`#40e56c`) glow (2px blur) to the bottom edge only.
*   **Typography:** Labels should use `label-md` in `on-surface-variant`.

### Buttons
*   **Primary:** A gradient-filled container using `primary` to `primary-container`. Corner radius: `xl` (0.75rem) for a sophisticated, modern hand-feel.
*   **Secondary/Tertiary:** Avoid boxes. Use text-only with `label-md` bold weight in `primary` color. 

### Cards
*   **Constraint:** Forbid divider lines. Use vertical white space (32px minimum) to separate the logo header from the input fields. 
*   **Depth:** Use the "Glassmorphism" rule for the main login card to allow the navy background to bleed through the edges.

### Biometric Quick-Login (Contextual Addition)
*   As a financial app, include a signature "Biometric Chip" using the `secondary` green. It should be a low-profile action chip at the bottom of the login screen to emphasize modern security.

## 6. Do's and Don'ts

### Do:
*   **DO** use whitespace as a structural element. If an element feels "stuck," add more padding instead of a line.
*   **DO** use `secondary_fixed_dim` (`#3ce36a`) for success icons to ensure they pop against the dark navy.
*   **DO** align typography to a strict baseline, but feel free to offset containers for an asymmetrical, editorial layout.

### Don't:
*   **DON'T** use pure black (`#000000`) or pure white (`#ffffff`). They break the sophisticated tonal depth of the system.
*   **DON'T** use the standard Material Design 1px border on inputs. It looks cheap and "off-the-shelf."
*   **DON'T** stack more than three levels of surface containers. It leads to visual mud.