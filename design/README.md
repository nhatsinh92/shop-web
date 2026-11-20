# Design source — Mây (Home, PDP, Cart, Checkout)

Live canvas (view, play the prototype, toggle states in Tweaks): https://claude.ai/artifact/VWgweYqYmpyWXWUkCf1nac

| File | Page | Live artboard |
| --- | --- | --- |
| `Main.dc.html` | Home | https://claude.ai/artifact/VWgweYqYmpyWXWUkCf1nac#artboard-Main |
| `PDP.dc.html` | Product detail | https://claude.ai/artifact/VWgweYqYmpyWXWUkCf1nac#artboard-PDP |
| `Cart.dc.html` | Cart | https://claude.ai/artifact/VWgweYqYmpyWXWUkCf1nac#artboard-Cart |
| `Checkout.dc.html` | Checkout | https://claude.ai/artifact/VWgweYqYmpyWXWUkCf1nac#artboard-Checkout |

## How to use these files

- They are design references, not production code. Each file is a "Design Component" page: markup inside `<x-dc>`, data and state in the `class Component` script at the bottom. They need the canvas runtime (`support.js`) to render, so open the live links above to see them.
- Read them for layout, copy, spacing, colours, component states and interactions. Re-implement in Next.js + Tailwind + shadcn/ui; do not port the markup or the inline styles.
- Monospace tags on the artboards (`STATIC`, `CACHE`, `STREAM`, `CLIENT`) mark the rendering strategy of each region and are acceptance criteria for FE tasks.

## States per page (Tweaks in the live canvas)

| Page | Tweak | Values |
| --- | --- | --- |
| Home | `recState` | `ready`, `loading` (recommendations skeleton) |
| PDP | `memberState` | `ready`, `loading` (member price skeleton) |
| Cart | `cartState` | `loaded`, `skeleton`, `stale` (saved cart + banner + retry) |
| All | `showNotes` | show or hide the render-strategy tags |

## Design tokens

| Token | Value |
| --- | --- |
| Ink (text, dark buttons) | `#16181D` |
| Accent (sale, primary CTA) | `#C2410C` |
| Deep accent (text on light orange) | `#9A3412` |
| Accent tint (backgrounds) | `#FFF7ED`, bar track `#FED7AA` |
| Blue (secondary banner, info) | `#1E3A8A`, info background `#EFF6FF` |
| Success | `#15803D`, background `#F0FDF4` |
| Warning (stale banner) | text `#78350F`, background `#FFFBEB`, border `#FCD34D` |
| Neutrals | stone scale: `#FAFAF9`, `#F5F5F4`, `#E7E5E4`, `#D6D3D1`, `#A8A29E`, `#78716C`, `#57534E`, `#44403C` |
| Font | Be Vietnam Pro, 400–800 |
| Radius | 8 / 12 / 16 / 20 px |
| Content width | max 1240 px, 24 px side padding |
| Touch targets | ≥ 44 px |

Product images in the design are coloured placeholders; product names and prices are sample data. Real data comes from the seed script.
