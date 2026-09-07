# RelayDrop interface design

## Direction

RelayDrop uses an original warm editorial utility system. Its core choices are:

- warm cream canvas
- coral primary actions
- warm ink rather than pure black
- serif display headings with humanist sans UI text
- dark product-chrome surfaces
- 4-pixel spacing system
- 8 to 12-pixel radii
- color-block depth with rare shadows

Marketing-specific patterns such as pricing grids, oversized landing-page sections, third-party marks, and code showcase cards are not used.

## Product direction

RelayDrop is a quiet editorial utility. The interface should feel thoughtful and human without becoming decorative or nostalgic.

The product shell is dark and compact. It carries navigation, device state, OneDrive status, and manual-sync guidance. The default light theme uses a warm cream working canvas so user content remains the visual focus.

## Core tokens

### Color

- Canvas: #faf9f5
- Soft surface: #f5f0e8
- Card surface: #efe9de
- Dark product chrome: #181715
- Elevated dark surface: #252320
- Primary coral: #cc785c
- Active coral: #a9583e
- Accent teal: #5db8a6
- Ink: #141413
- Body: #3d3d3a
- Muted: #6c6a64
- Hairline: #e6dfd8

Coral is reserved for primary actions, focus, and small status emphasis. It must not become a general decorative color.

The dark palette remaps canvas, soft surface, card surface, ink, muted text, and hairlines while preserving coral as the primary accent and meeting the same contrast requirements.

### Typography

- Display: Cormorant Garamond Variable, used for page and panel headings
- Interface and body: Inter Variable
- Display weight: 500 or lighter
- Body weight: 400
- Label weight: 500 to 600

Serif typography creates the editorial voice; it is not used for controls, metadata, navigation, or file details.

### Shape and depth

- Controls: 6 to 8-pixel radius
- Cards and panels: 10 to 12-pixel radius
- Pills: full radius
- Default depth: surface contrast and hairline borders
- Hover depth: at most a faint one-pixel shadow

## Layout

### Desktop

1. A 64-pixel cream application header
2. A dark 240-pixel product sidebar
3. A centered working canvas
4. A recent-item panel paired with a sticky send panel
5. A compact dark status bar

### Mobile

- sidebar removed
- product header reduced to brand and account
- page heading and Refresh command stacked
- send panel placed before recent items
- all feed actions remain available
- status bar removed

## Components

### Refresh

Refresh is a secondary cream button with a hairline border. It becomes lightly coral on interaction. The PWA remains manual. In the Edge side panel, cached cards appear first and an understated status communicates the configurable two-minute open cooldown and five-minute visible-panel refresh without making the interface feel live or noisy.

### Send panel

The panel uses the card-cream surface. Note and file modes use a segmented control. Send is the only persistent coral-filled action.

### Recent items

Feed items use the base canvas with a hairline border. Metadata remains sans-serif and muted. File containers use the card-cream surface, while links receive a light coral tint.

Common file families use small document tiles with restrained semantic color: blue for documents, green for spreadsheets, orange for presentations, red for PDF, violet for images, and slate for code or generic files. Generated OneDrive thumbnails replace the tile when available. The treatment should resemble a mature operating-system file surface, not a decorative illustration.

Image and video cards make the preview area the primary click target. Image previews use a dark, distraction-free lightbox; video previews use native browser playback controls. Download remains a separate explicit action so opening content never silently saves the original.

### Sidebar

The dark sidebar is RelayDrop's product-chrome surface. Selected navigation and OneDrive cards use the elevated dark token. Teal is limited to online and connection cues.

In the narrow Edge side panel, the OneDrive card moves into the working canvas. It reports the size of RelayDrop's App Folder rather than total OneDrive quota, and the whole card opens the folder's OneDrive web page for management.

The narrow side panel includes a compact mobile-access card near OneDrive status. It explains that phones use the hosted PWA, gives short same-account and Add to Home Screen instructions, and offers Copy link and Open web app actions. Any future QR code must be generated locally rather than loaded from a remote QR service.

The side-panel canvas must always fit its current width and never expose page-level horizontal scrolling. Long URLs and file names truncate inside their rows. Long notes wrap continuous text and use a bounded, keyboard-focusable internal scroll region so the surrounding feed remains stable.

### Account and settings

The account avatar is a compact circular control whose initial is derived from the first Unicode grapheme in the Microsoft display name. Clicking it opens a restrained profile popover with the full account name, username, Settings, and Log out; it never signs the user out immediately.

Settings use a focused cream dialog with native-feeling switches for “Refresh when opened” and “Refresh while open.” Supporting copy states the two-minute and five-minute limits and explains exactly what the quick-start cache stores. The dialog also provides the OneDrive App Folder management link when available.

Settings expose a Light/Dark choice stored locally for each browser surface. The selected theme is applied before the React interface mounts. An installed PWA's operating-system splash screen still uses the static manifest color before the document loads.

### Transfer state

Pasted files enter the existing File composer and use a small “From clipboard” source chip rather than a separate workflow. Selected images show a contained local preview, while Choose another and Remove file remain distinct actions. Active uploads show a compact phase label and progress track inside the composer. Cancel remains available through preparation, safe-retry checking, and byte upload; cancelling and terminal states never keep the indeterminate animation running, and failed or cancelled files stay selected with an explicit Retry upload action.

Downloaded Edge items keep the normal file card hierarchy. A completed local copy adds a restrained Downloaded label plus Open local, Show, and Delete local actions; interrupted, externally removed, or manually deleted copies return to Download again. These controls may wrap on a narrow side panel but must never widen the page.

### Notices

Preview state uses a dark inline notice rather than a blue enterprise information banner. Errors remain light red and explicit.

### Dialogs

Dialogs return to the cream canvas and use coral-red only for destructive confirmation. A partially failed deletion stays open, names the failed step in plain language, and changes the primary action to Retry deletion.

Media previews are the exception: they use dark chrome so image and video content controls the visual hierarchy.

## Accessibility

- semantic landmarks and headings
- visible coral focus rings
- text labels for important commands
- sufficient contrast on cream and dark surfaces
- minimum practical touch targets
- reduced-motion support
- dialog modal semantics
- responsive content at a 320-pixel viewport

## Demo boundary

The interface clearly identifies temporary in-memory behavior. It does not imitate Microsoft consent or imply that files have reached OneDrive.

The production repository must preserve the same UI contract:

- list the PWA only after explicit refresh; let the extension restore its local snapshot before a bounded foreground refresh
- publish only after successful upload
- return stable item metadata
- delete remote content before removing a card
- surface authentication, quota, and network errors
