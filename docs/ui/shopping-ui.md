# Shopping List UI

*Status: **implemented** (`web/src/modules/shopping/`): the **Shopping list** (one card per type, crossing off, quick add, clearing, Reorder mode), **Common items**, the item sheet, the Add from common items sheet, the Shopping types sheet and the Home card. What's not built yet is in [roadmap.md](../roadmap.md).*

What the Shopping list screens look like and how they behave. The data model is in [shopping.md](../db/shopping.md), the endpoints in [api-overview.md](../api/api-overview.md) §7.4, and the shell around these pages in [app-shell.md](app-shell.md). Engineering conventions (hooks, query keys, `Sheet`, `Field`, `SortableList`, `ReorderToggle`) are in [web-overview.md](web-overview.md).

---

## 1. Routes and navigation

| Route | Page | Notes |
|---|---|---|
| `/shopping` | (redirect) | Goes straight to `/shopping/list`. |
| `/shopping/list` | **Shopping list** (`ListPage`) | See §2. |
| `/shopping/common` | **Common items** (`CommonPage`) | See §3. |

**Sub-nav tabs:** Shopping list, Common items.

**Edit shopping types** is an outline icon button (a tags icon) in the header of both pages. It opens the Shopping types sheet (§5).

**Home card** (`ShoppingHomeCard`, built on the shared `ModuleCard`): links to `/shopping/list`. The subtitle reads "Nothing on the list" or "N to buy" (items not crossed off). Below it, each type with something to buy and its count, in the list's order, up to **four**, then "and N more".

---

## 2. Shopping list page

```
Shopping list                            [🏷] [ ⇅ Reorder ]
┌ Groceries ──────────────────────── 2 to buy ┐
│ (   )  Milk                                 │
│        2%                                   │  ← the note
│ (   )  Eggs                                 │
│ ( ✓ )  Bread                                │  ← crossed off: sinks to the bottom
├─────────────────────────────────────────────┤
│ [ Add to Groceries              ] [ + ]     │
│            Clear 1 crossed off              │
└─────────────────────────────────────────────┘
┌ Kroger ─────────────────────────────────────┐
│ [ Add to Kroger                 ] [ + ]     │  ← empty types still get a card
└─────────────────────────────────────────────┘
┌ Uncategorized ──────────────────── All done ┐
│ ( ✓ )  Tape                                 │
│ ...                                         │
└─────────────────────────────────────────────┘
                              [ ≡+ Common items ]
```

- **One card per type**, in the user's type order, even when empty (so there's somewhere to add). **Uncategorized** comes last, and only when it has items or the user has no types (`groupByType` in `groups.ts`).
- The heading's right side reads "N to buy", or "All done" when everything in it is crossed off; nothing when the card is empty.
- **Rows**: a round **check control** (44 px tap target) on the left, then the name and note, which open the item sheet (§4).
- **Crossing off** is **optimistic**: the row updates at once, then the list is refetched. A crossed-off item is muted and struck through, and **sinks to the bottom** of its card (items to buy first, then crossed off, each in list order). Tapping its filled check puts it back.
- **Quick add** at the bottom of each card ("Add to Groceries"; "Add an item" in Uncategorized): type a name and press Return or **+**. The item goes last in that type and the field clears but **keeps focus**, so several items go in one after another. Errors show under the field.
- **Clear N crossed off** (below quick add, when the card has crossed-off items) removes that card's crossed-off items for good, with no confirm.
- **Common items** is a floating pill button fixed at the bottom-right (above the safe-area inset), like finance's Log transaction. It opens the Add from common items sheet (§3.1).

### 2.1 Reorder mode

The **Reorder** button (`ReorderToggle`, shared with finance's budget and categories pages) switches the page into drag-to-reorder mode; it becomes a filled **Done** button that switches back. While reordering, the types button, the floating button, check controls, notes, quick add and clear are hidden.

- Each type is a card with a grip handle, and its items are rows with their own grips. **Drag types** to reorder the cards, or **items within a type**. "Drag types by their grip, or items within them." shows when there's more than one type.
- **Uncategorized** stays last and has no grip, though its items can be reordered.
- Items can't be dragged between types; change an item's type in its sheet.
- Each drop saves right away, with an optimistic cache update (item order is one sequence, so the page sends every item with that card's in their new order).

---

## 3. Common items page

"Things you buy often. Add one to your shopping list in a tap."

- One card per type, grouped the same way as the list (§2), with common items sorted by name.
- Each row is the name and note (tap to open the item sheet, §4) and, on the right, **Add** (plus icon): puts a copy on the list. Once it's on the list (an item with the same name and type, not crossed off), the button is a muted, disabled **On list** with a check.
- Each card ends with a quick add ("New common item in Groceries"), which creates a common item, not a list item. A duplicate name in that type shows "that's already a common item".

### 3.1 Add from common items sheet (`AddFromCommonSheet`)

Opened from the list's floating button. Title "Add from common items".

- Only the types that have common items, each under a small uppercase heading, with the same rows (**Add** / **On list**) but no tap-to-edit.
- The sheet **stays open**, so several items go on in a row; each one turns to **On list** as it's added.
- With no common items yet: "No common items yet. Add the things you buy often on the Common items page." (the link closes the sheet).

---

## 4. Item sheet (`ItemSheet`)

One bottom sheet for a list item (title "Item") or a common item (title "Common item"), opened by tapping a row's name.

| Field | Behaviour |
|---|---|
| Name | Required, up to 200 characters. |
| Type | A select of the user's types, then **Uncategorized**. Moving a list item to another type puts it last there. |
| Note (optional) | Up to 300 characters. Hint: "Like 2 lbs, the blue one, size 10". |

**Save** saves and closes; API errors show under it.

- **List item** extras:
  - **Save to common items** (outline, bookmark icon) saves the current name, type and note as a common item. It then reads "Saved to common items", or "Already a common item" when one exists (the API's 409), and is disabled.
  - **Remove from list** (red) deletes the item for good and closes, with no confirm.
- **Common item** extra: **Delete common item** (red; confirms "Delete "<name>" from your common items? Your list isn't affected.").

The list and common items aren't linked: editing one never changes the other.

---

## 5. Shopping types sheet (`TypesSheet`)

Title "Shopping types": "What you shop by: a kind (Groceries, Clothing) or a store (Kroger, Trader Joe's). Deleting one moves its items to Uncategorized."

- The user's types in order, each with **Rename** (pencil: an inline field with **Save** and cancel) and **Delete** (trash; confirms "Delete "<name>"? Its items become Uncategorized.").
- A quick add ("Add a type") at the bottom; new types go last. A duplicate name shows "a type with that name already exists".
- Reordering types is the list page's Reorder mode (§2.1), not this sheet.

---

## 6. Data and caching

Hooks live in `web/src/modules/shopping/api.ts`; query keys are in `shoppingKeys` (`['shopping', 'types']`, `['shopping', 'items']`, `['shopping', 'common']`).

| Mutation | Cache update |
|---|---|
| Types: create, rename, delete | Invalidate everything under `['shopping']` (a deleted type moves items and common items). |
| Reorder types / items | **Optimistic**: the cached list is re-sorted immediately; the returned list replaces it. |
| Cross off / put back (`useSetDone`) | **Optimistic**: the item's `done` flips in the cache; everything under `['shopping']` is invalidated when it settles. |
| Add, edit, remove items; clear crossed off | Invalidate everything under `['shopping']`: common items' **On list** depends on the list. |
| Common items: create, edit, delete, add to list | Invalidate everything under `['shopping']`. |

---

## 7. Not built yet

See [roadmap.md](../roadmap.md).
