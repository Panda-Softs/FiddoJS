<img src="./images/FiddoJS-logo.png" alt="FiddoJS Logo" style="max-height:150px;">

# FiddoJS — The ultimate documentation
*A lightweight, declarative, jQuery-friendly form validator*

**FiddoJS** is a modern, full‑rewrite form validation library for the web. It was inspired by the ideas behind **ParsleyJS**, but was re‑engineered from the ground up to address shortcomings encountered in real projects — especially with **grouped validation** and **AJAX workflows**.

### Why FiddoJS?
During the use of ParsleyJS, developers often faced challenges:
- **Grouped validation issues**: complex forms with dependent fields or checkbox/radio groups were difficult to validate consistently.  
- **Remote checks & AJAX integration**: validating uniqueness (like email availability) or server-side constraints required workarounds.  
- **Performance & flexibility**: ParsleyJS grew heavy and harder to extend for modern, dynamic web apps.

FiddoJS was designed to solve these problems while keeping the developer experience familiar and simple. It is:
- **Lightweight & fast**: a minimal footprint, efficient event handling, and promise‑based validation flow.  
- **Declarative by design**: most validation rules are expressed directly in HTML with `data-fiddo-*` attributes, keeping markup self‑describing.  
- **Extensible & configurable**: add your own validators, hook into events, and configure UI integration without rewriting core logic.  
- **Group‑aware**: FiddoJS introduces a robust **GroupField** concept to handle multiple inputs, cross‑field rules, and checkbox/radio counts correctly.  
- **AJAX‑friendly**: remote validators are first‑class citizens, returning Promises and integrating smoothly with async checks.  
- **Accessible by default**: error messages and validation states integrate with ARIA attributes for better screen reader support.  

### Who should use FiddoJS?
- Developers who liked the declarative style of ParsleyJS but need something lighter, faster, and more modern.  
- Teams that need reliable **cross‑field validation** (e.g., password confirmation, at least one contact field filled, checkbox limits).  
- Apps requiring **remote validators** (AJAX lookups, uniqueness checks).  
- Anyone building forms where validation logic must be **clear in markup** but also **programmable and testable**.  

### Philosophy
FiddoJS bridges the gap between **ease of use** (HTML attributes for 90% of cases) and **power** (a rich programmatic API and extensibility). It is not just a fork or patch of ParsleyJS: it is a **complete rewrite** that retains familiarity while eliminating long‑standing issues.

This documentation mirrors the structure of popular validation libraries while documenting FiddoJS’s features and behavior.  
It uses the **fiddo** namespace everywhere by default (except when demonstrating drop‑in replacement for ParsleyJS).


## Table of contents
1. [Introduction](#introduction)  
2. [Installation](#installation)  
3. [Quick start](#quick-start)  
4. [Configuration](#configuration)  
5. [HTML attributes](#html-attributes)  
6. [Built‑in validators](#built-in-validators)  
7. [GroupField (cross‑field & multiple inputs)](#groupfield-cross-field--multiple-inputs)  
8. [Conditional validation](#conditional-validation)  
9. [Custom validators](#custom-validators)  
10. [Remote (AJAX) validators](#remote-ajax-validators)  
11. [UI, messages, and accessibility](#ui-messages-and-accessibility)  
12. [Events](#events)  
13. [Programmatic API](#programmatic-api)  
14. [Internationalization (i18n)](#internationalization-i18n)  
15. [Error handling & troubleshooting](#error-handling--troubleshooting)  
16. [Migrating from Parsley (drop‑in)](#migrating-from-parsley-drop-in)  
17. [FAQ](#faq)

---

## Introduction
Fiddo provides *frontend* validation for forms. It gives users immediate feedback, keeps your server leaner, and improves UX.  
Client validation never replaces **secure server‑side validation**.

Core ideas:
- **Declarative rules** via `data-fiddo-*` attributes.
- **Promise-based** lifecycle (works with async/remote checks).
- **GroupField** for cross-field logic and checkbox/radio counts.
- **Hooks & events** for UI integration.

---

## Installation

### Via `<script>` tags
```html
<script src="https://code.jquery.com/jquery.min.js"></script>
<script src="fiddo.bundle.js"></script>
```

### Global config (optional)
```html
<script>
  window.FiddoConfig = {
    autoBind: true,
    namespace: 'data-fiddo-',     // attribute prefix for rules & auto-bind
    errorClass: 'fiddo-error',
    successClass: 'fiddo-success',
    focusClass: 'fiddo-glow',
    trigger: false,               // smart defaults; override per field with data-fiddo-trigger
    triggerAfterFailure: 'input',
    stopAtFirstError: true,
    showMultipleErrors: false,
    inputs: 'input, textarea, select',
    excluded: 'input[type=button], input[type=submit], input[type=reset], input[type=hidden], .selectize-input > input, [novalidate]',
    errorsWrapper: '<ul class="fiddo-errors-list"></ul>',
    errorTemplate: '<li></li>',
    successTemplate: ''
  };
</script>
```

> When `autoBind` is `true` and `namespace` is set, Fiddo automatically initializes all forms that have the attribute **`[data-fiddo-validate]`** on DOM ready.

---

## Quick start

### 1) Mark up your form
```html
<form id="signup" data-fiddo-validate>
  <label>Email</label>
  <input name="email" required type="email" data-fiddo-type="email">

  <label>Password</label>
  <input name="pwd" type="password" required minlength="8">

  <label>Confirm</label>
  <input name="pwd2" type="password" data-fiddo-equalto="#signup [name='pwd']">

  <button type="submit">Create account</button>
</form>
```

### 2) Initialize (if not using autoBind)
```html
<script>
  const form = $('#signup').fiddo();
</script>
```

On submit, Fiddo will block submission until all rules pass. During typing, rules are evaluated on sensible events (e.g., `input` vs `change`).

---

## Configuration

You can set options globally through `window.FiddoConfig` and/or pass them per form:

```js
const form = $('#signup').fiddo({
  stopAtFirstError: false,
  debounce: 200, // optional; coalesces rapid typing
});
```

Key options:
- **namespace**: `'data-fiddo-'` (controls which attributes are read and which forms auto-bind).
- **inputs / excluded**: CSS selectors used to identify candidate fields.
- **trigger / triggerAfterFailure**: space-separated list of events (e.g., `'input blur'`).
- **errorsWrapper / errorTemplate / successTemplate**: HTML used to render messages.
- **errorClass / successClass / focusClass**: CSS classes added to class handler elements.
- **stopAtFirstError**: short-circuits validations for speed.
- **showMultipleErrors**: render all errors vs only the top one.

---

## HTML attributes

> Replace `X` below with your namespace prefix (`data-fiddo-`).

### Core
| Attribute | Example | Description |
|---|---|---|
| `required` | `<input required>` | HTML5 required; Fiddo also supports `X-required="true"`. |
| `X-type` | `data-fiddo-type="email"` | Built-in type testers (see list below). |
| `X-min` / `X-max` | `data-fiddo-min="10"` | Numeric min/max. |
| `X-range` | `data-fiddo-range="[10,20]"` | Inclusive numeric range. |
| `X-minlength` / `X-maxlength` | `data-fiddo-minlength="3"` | String lengths. |
| `X-length` | `data-fiddo-length="[3,20]"` | Inclusive string length range. |
| `X-pattern` | `data-fiddo-pattern="^\\d+$"` | Anchored regular expression. |
| `X-equalto` / `X-notequalto` | `data-fiddo-equalto="#id"` | Compare to selector or number. |
| `X-gt/gte/lt/lte` | `data-fiddo-lt="#max"` | Numeric comparisons to number or selector. |

### Multiple / group rules (define on a container)
| Attribute | Description |
|---|---|
| `X-mincheck` | Minimum number of checked checkboxes in the container. |
| `X-maxcheck` | Maximum number of checked checkboxes in the container. |
| `X-check="[min, max]"` | Range for checked count. |
| `X-minrequired` | Minimum number of **non-empty** child fields (e.g., email or phone). |

Wrap the inputs in any container (`div`, `p`, `fieldset`) and add the group attribute(s). Fiddo will create a **GroupField** for the container.

### Conditional
| Attribute | Description |
|---|---|
| `X-validate-if="selector|fnName|expr"` | Validate only if condition is truthy. |
| `X-not-validate-if="..."` | Skip validation if condition is truthy. |

### UI & behavior
| Attribute | Description |
|---|---|
| `X-trigger="input blur"` | Override events for this field. |
| `X-errors-container="#target"` | Where to append the error list. |
| `X-class-handler="#target"|".cls"|fnName` | Element that receives error/success classes. |
| `X-*-message="..."` | Per-rule error message. |
| `data-success-message="..."` | Success message for a field or group. |

---

## Built‑in validators

> All validators are **sync** unless otherwise stated. They return truthy to pass, or falsy/throw to fail.

| Name | Requirement | Priority | Notes |
|---|---|---:|---|
| `required` | `true` | 100 | Empty = fail. |
| `pattern` | anchored regex string | 70 | Example: `^\\d+$`. |
| `type` | `email` \| `url` \| `number` \| `integer` \| `digits` \| `alphanum` \| `tel` \| `date` | 70 | Uses internal testers; `tel` supports Swiss & international formats. |
| `min` / `max` / `range` | number(s) | 60/60/61 | Numeric comparisons. |
| `minlength` / `maxlength` / `length` | int(s) | 50/50/51 | String lengths. |
| `equalto` / `notequalto` | number or selector | 40 | Compares after numeric coercion or selected value. |
| `gt/gte/lt/lte` | number or selector | 40 | Strict/loose comparisons. |
| `mincheck` / `maxcheck` / `check` | int(s) | 30/30/31 | Checkbox group counts. |
| `date` | format (optional) | 60 | `Utils.parseDateWithFormat` with default `MM/DD/YYYY` when omitted. |

Messages can be globally customized via `Fiddo.addMessages()` or per field with `X-*-message` attributes.

---

## GroupField (cross‑field & multiple inputs)

A **GroupField** is created when a container element has **any** `data-fiddo-*` validator attributes. Fiddo then treats its **descendant inputs** as the group’s children.

Examples:

### Checkbox count
```html
<p data-fiddo-mincheck="2">
  <label><input type="checkbox" name="h[]" value="a"> A</label>
  <label><input type="checkbox" name="h[]" value="b"> B</label>
  <label><input type="checkbox" name="h[]" value="c"> C</label>
</p>
```

- The group’s `getValue()` returns an **array of checked values**.
- The `mincheck` validator compares `value.length` against the requirement.

### Radio group
```html
<fieldset data-fiddo-required="true">
  <label><input type="radio" name="q" value="yes"> Yes</label>
  <label><input type="radio" name="q" value="no"> No</label>
</fieldset>
```

- The group’s `getValue()` returns the **checked value** or `''`.
- `required` passes only if one is selected.

### Cross-field logic
```html
<div data-fiddo-minrequired="1">
  <input type="email" name="email">
  <input type="tel"   name="tel">
</div>
```

- At least **one** child must be non-empty.

**Execution order**  
1. Each child is validated first (re-validating changed/unknown children).  
2. If **any child** is invalid, the group **does not** run its constraints.  
3. Only when **all children are valid** (or skipped by conditions), group validators run.  
4. Group UI (errors/success) is applied to the container (or its class handler).

---

## Conditional validation

Use `data-fiddo-validate-if` and/or `data-fiddo-not-validate-if`:

```html
<input type="checkbox" id="isCompany">

<input name="vat"
       data-fiddo-required="true"
       data-fiddo-validate-if="#isCompany">
```

Conditions can be:
- a **selector** (`#id`, `.cls`, `[attr]`),
- a **global function name** (`"shouldValidateVAT"`),
- a **JS expression** string (`"$('#country').val()==='US'"`),
- or a **function reference** via JS API.

Fiddo evaluates selectors smartly (`:checked` for checkboxes, non-empty for inputs/selects).

---

## Custom validators

Register with `Fiddo.addValidator(name, spec)`:

```js
Fiddo.addValidator('startsWith', {
  message: 'Value must start with "%s"',
  priority: 60,
  validate(value, prefix) {
    if (typeof value !== 'string') return false;
    return value.trim().startsWith(prefix);
  }
});
```

Use in HTML:
```html
<input data-fiddo-starts-with="ABC">
```

Advanced:
- `group: true` → mark validator intended for group containers.
- `requirementType` (for standard-like validators) allows automatic type checking.
- Throw or return falsy to fail; return truthy to pass. For async, return a Promise.

---

## Remote (AJAX) validators

```js
Fiddo.addValidator('emailAvailable', {
  url: '/api/users/email/available',
  dataKey: 'email',
  message: 'This email is already registered',
  priority: 10 // remote checks usually run later
});
```

```html
<input name="email" required data-fiddo-email-available>
```

Behavior:
- Sends `{ [dataKey]: value }` by default (method `POST`).
- Considers HTTP 2xx as success; customize via `isValidFn(data, textStatus, xhr)`.
- Reject resolves with server `errorMessage` (if provided); success can bubble a `successMessage`.

---

## UI, messages, and accessibility

- Errors are rendered into **`errorsWrapper`** using **`errorTemplate`**; success uses **`successTemplate`** (or the same template if omitted).  
- The **class handler** receives `fiddo-error` / `fiddo-success` (customizable) and ARIA attributes.  
- After first failure, field switches to `triggerAfterFailure` events for quicker feedback.  
- Use `data-success-message="Great job %s!"` to display a success callout for a field/group.

Per-field message override examples:
```html
<input required data-fiddo-required-message="This is mandatory.">
<input data-fiddo-type="email" data-fiddo-type-message="Invalid email format.">
```

Global messages:
```js
Fiddo.addMessages({
  required: "Champ obligatoire",
  type: { email: "Adresse email invalide" }
});
```

---

## Events

Fiddo triggers **form** and **field** events (jQuery events).

### Form events
- `form:init` — instance created.
- `form:validate` — before validating all fields.
- `form:validated` — all fields valid.
- `form:error` — at least one field failed.
- `form:submit` — right before programmatic submit dispatch.
- `form:refreshed` — after `refresh()` rebinds fields.
- `form:destroy` — after `destroy()`.

### Field events
- `field:success` — field passed.
- `field:error` — field failed (receives a list of `ValidationError`s).
- `field:validated` — always, with `{ field, isValid }`.

Example:
```js
const f = $('#signup').fiddo();
f.$element
  .on('field:validated', function (ev, data) {
    const ok = $('.fiddo-error').length === 0;
    $('.callout-ok').toggleClass('hidden', !ok);
    $('.callout-warn').toggleClass('hidden', ok);
  })
  .on('form:submit', function (ev, args, submitter) {
    // Prevent real submit in demo
    return false;
  });
```

---

## Programmatic API

```js
const form = $('#form').fiddo();

await form.validate();     // boolean: true if valid
await form.whenValidate(); // Promise that resolves with values or rejects with failed fields

form.reset();              // clear UI/state, rebind triggers
form.refresh();            // re-scan DOM and rebuild fields
form.destroy();            // unbind everything
```

Instance fields (internal):
- `form.fields`: array of Field / GroupField instances.
- Each Field has: `.constraints`, `.validationResult`, `.validationSuccessMessage`, `._lastValidationState`, etc.

---

## Internationalization (i18n)

Override/extend messages at runtime:
```js
Fiddo.addMessages({
  defaultMessage: "This value is invalid.",
  required: "This field is required.",
  type: { email: "Please enter a valid email address." }
});
```

---

## Error handling & troubleshooting

### Validation failures vs exceptions
- **Failures** are represented by `ValidationError` objects (with `assert` and `message`). They are collected/rendered to the UI.
- **Exceptions** (unexpected JS errors) are logged via `Utils.error()` and **do not** create user-facing messages by themselves.

### Remote validator errors
- Network/HTTP failures **reject** with transport errors (status text or thrown error).  
- Server responses may include `{ errorMessage, successMessage }`; when provided, these are preferred for UI.

### GroupField gating
- Group validators run **only when all children are valid**.  
- If any child is invalid (known state), the group **rejects early** and does not run its constraints.

### Common pitfalls
- **Unanchored patterns**: use `^` and `$`.  
- **Hidden/zero-size inputs**: Fiddo skips these (unless targeted via group rules).  
- **Selector requirements** (`equalto`, `gt`, etc.): ensure the selector resolves to an element with a numeric value if a numeric comparison is intended.

---

## Migrating from Parsley (drop‑in)

You can run Fiddo as a transparent replacement for Parsley’s jQuery plugin and attributes:

1) **Set the plugin name to “Parsley” _before_ loading Fiddo:**
```html
<script>
  window.FiddoPluginName = 'Parsley';
</script>
<script src="fiddo.bundle.js"></script>
```

2) **(Optional) Configure using the same key naming convention:**
```html
<script>
  window.ParsleyConfig = {
    autoBind: true,
    namespace: 'data-parsley-'
  };
</script>
```

3) **Keep your existing HTML and init:**
```html
<form data-parsley-validate>
  <input required data-parsley-type="email">
</form>
<script>
  $('#myForm').parsley();
</script>
```

Under the hood, Fiddo will mount under `$.fn.parsley` and read `data-parsley-*` attributes when `FiddoPluginName` is set to `'Parsley'`.

> For new projects, prefer the native **fiddo** namespace and API.

---

## FAQ

**Q: Does Fiddo require jQuery?**  
Yes. It integrates as a standard jQuery plugin and uses jQuery for DOM/events and (optionally) AJAX.

**Q: Can I run validators in parallel?**  
Yes. Set `stopAtFirstError: false`. By default, Fiddo short-circuits for performance.

**Q: How do I validate on demand?**  
`form.validate()` returns a `Promise<boolean>`; `form.whenValidate()` returns a Promise that resolves or rejects with details.

**Q: How do I validate dynamic fields?**  
Call `form.refresh()` after injecting/removing inputs, or re-init on your form.

**Q: How do I style errors?**  
Customize `errorClass`, `successClass`, and wrapper templates; or supply a `data-fiddo-class-handler` per field/group.

---

## License & Credits
© Panda Softwares 2025. Inspired by the ergonomics of widely used validation libraries; rethought for **GroupField** and attribute-first workflows.
