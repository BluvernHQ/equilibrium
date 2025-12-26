# Tagging System – Technical Specification (Final)

## 1. Purpose

This document defines the **technical implementation and operational behavior** of the tagging system as observed and refined from the current design, flows, and constraints. It serves as the **single source of truth** for backend, frontend, analytics, and data-organization layers.

The system is designed for **structured qualitative analysis of transcripts**, not as a flat labeling mechanism.

---

## 2. Core Design Principles

1. **Text is immutable; tags are movable**
2. **Structure (sections) and semantics (tags) are decoupled**
3. **Concepts (master tags) are distinct from instances (primary tags)**
4. **Analytics is instance-based, not name-based**
5. **Scoping is enforced strictly at the section level**

---

## 3. Hierarchy Model (Authoritative)

```
Transcript
 └── Section (Main Section)
      └── Sub-section
           └── Master Tag
                └── Primary Tag
                     ├── Secondary Tags
                     └── Branch Tags
```

All levels are optional except **Transcript** and **Primary Tag → Highlight** linkage.

---

## 4. Structural Layer

### 4.1 Transcript

A transcript is a linear body of text identified by character offsets.

```ts
Transcript {
  id
  content
}
```

---

### 4.2 Section (Main Section)

A **Section** is a top-level structural bucket used to group contiguous ranges of text.

```ts
Section {
  id
  transcriptId
  name
  startOffset
  endOffset
}
```

**Rules**
- Sections do not overlap
- Text may belong to **at most one section**
- Text outside all sections is valid and taggable
- Sections may exist without any tags

---

### 4.3 Sub-section

A **Sub-section** is a structural child of a section.

```ts
SubSection {
  id
  sectionId
  name
  startOffset
  endOffset
}
```

**Rules (Strict)**
- A sub-section **must belong to exactly one section**
- Sub-sections do not overlap
- Sub-section names must be unique **within the same section**
- A sub-section may exist without tags

> Standalone sub-sections without a parent section are **not supported**. Logical grouping without a section must be represented as a section instead.

---

## 5. Tagging Layer

### 5.1 Master Tag (Meta Tag)

A **Master Tag** represents a high-level analytic concept.

```ts
MasterTag {
  id
  transcriptId
  name
  description
  sectionId?      // optional scope
  subSectionId?   // optional scope
}
```

**Rules**
- Master tag names are **unique per transcript**
- A master tag may be:
  - Scoped to a section
  - Scoped to a sub-section
  - Unscoped (global within transcript)
- Master tags do **not** directly own highlights

---

### 5.2 Primary Tag

A **Primary Tag** is a concrete analytic code applied to highlighted text.

```ts
PrimaryTag {
  id
  masterTagId
  name
}
```

**Rules**
- Multiple primary tags may share the same name
- Primary tags belong to exactly one master tag
- Each primary tag instance is analytically distinct

---

### 5.3 Secondary Tag

A **Secondary Tag** is an attribute or qualifier of a primary tag.

```ts
SecondaryTag {
  id
  primaryTagId
  name
}
```

**Rules**
- Secondary tag names are not unique
- A primary tag may have multiple secondary tags with the same name

---

### 5.4 Branch Tag

A **Branch Tag** represents a parallel analytic dimension (e.g., Sentiment, Emotion).

```ts
BranchTag {
  id
  masterTagId
  name
}
```

**Rules**
- Branch tag names must be **unique within the same master tag**
- Branch tags do not attach directly to text
- Branch tags group secondary tags conceptually

---

## 6. Highlight Model

### 6.1 Highlight

A **Highlight** binds text to tags.

```ts
Highlight {
  id
  transcriptId
  startOffset
  endOffset
  primaryTagId
  secondaryTagIds[]
}
```

**Rules**
- A highlight cannot span multiple sections
- Highlights do not reference sections directly
- Moving tags never alters highlight offsets

---

## 7. Logical Constraints

### 7.1 Naming & Collision Rules

| Constraint | Enforced |
|----------|----------|
| Duplicate sub-section name under same section | ❌ |
| Master tag name = sub-section name | ❌ |
| Duplicate master tag name (same transcript) | ❌ |
| Duplicate primary tag names | ✅ |
| Duplicate secondary tag names | ✅ |
| Duplicate branch tag names (same master tag) | ❌ |

---

## 8. Permutations & Valid Combinations

### 8.1 Text Ownership

| Case | Section | Sub-section |
|----|--------|------------|
| A | ❌ | ❌ |
| B | ✅ | ❌ |
| C | ✅ | ✅ |

---

### 8.2 Tag Attachment

| Master | Primary | Secondary | Valid |
|-------|--------|-----------|-------|
| ❌ | ❌ | ❌ | ❌ |
| ✅ | ❌ | ❌ | ❌ |
| ✅ | ✅ | ❌ | ✅ |
| ✅ | ✅ | ✅ | ✅ |

---

### 8.3 Cross-Scope Usage

| Scenario | Allowed |
|--------|--------|
| Same master tag in multiple sections | ✅ |
| Same primary tag name across sections | ✅ |
| Same highlight across sections | ❌ |
| Tagging text outside sections | ✅ |

---

## 9. Cross-Transcript Behavior

- Master tags are **created per transcript**
- Cross-transcript equivalence is resolved later in a **data-organization layer**
- Identical master tag names across transcripts may map to different IDs
- Primary tag counts are accumulated per transcript and later aggregated

---

## 10. Editing & Re-parenting Rules

### 10.1 Primary Tag Movement

- A primary tag may be moved to another master tag
- All linked highlights remain unchanged

### 10.2 Primary Tag Duplication

- Creates a new primary tag ID
- Optionally reuses highlight references

### 10.3 Master Tag Movement

- Master tags may move between sections/sub-sections
- No highlight offsets are modified

### 10.4 Promotion

- Sections, master tags, or primary tags can be promoted to create a new master tag

---

## 11. Transcript View UX Rules

- All tags are selected by default
- Users may hide untagged text
- Unselecting tags filters visible highlights
- Sections may be expanded to reveal nested tags
- Master tags may be expanded to inspect primary and secondary tags

---

## 12. Analytics Model

- Each primary tag instance = one impression
- Counts may be grouped by:
  - Transcript
  - Section / Sub-section
  - Master tag
  - Primary tag
- Secondary and branch tags refine dimensions

---

## 13. Summary

This tagging system is:
- Hierarchical
- Scope-aware
- Instance-driven
- Analytics-first
- Designed for scale and ML readiness

It intentionally separates **structure**, **concepts**, and **instances** to enable flexible analysis without compromising data integrity.

