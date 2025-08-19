
# FiddoJS Demo — Documentation

This document explains the **`demo.html`** page included with FiddoJS, describing each example and the purpose of the validations.

---

## Overview
The demo page demonstrates common use cases for FiddoJS validation. It includes examples of required fields, email and URL validation, length checks, pattern matching, group (checkbox/radio) validation, cross-field rules, remote validators, conditional validation, and custom UI messages.

By studying the demo, you will see how **data-fiddo-* attributes** work in real HTML, how validation messages appear, and how group containers behave.

---

## Sections in the Demo

### 1. Basic required input
```html
<input type="text" required>
```
- Demonstrates the **required** validator.
- Field must be non-empty.

### 2. Email input
```html
<input type="email" required data-fiddo-type="email">
```
- Uses HTML5 `type="email"` and Fiddo’s **type=email** validator.
- Ensures a syntactically valid email.

### 3. URL input
```html
<input type="url" data-fiddo-type="url">
```
- Fiddo validates the value as a valid URL.

### 4. Length constraints
```html
<input type="text" data-fiddo-minlength="6" data-fiddo-maxlength="10">
```
- Field must be between 6 and 10 characters.

### 5. Pattern matching
```html
<input type="text" data-fiddo-pattern="^[0-9]+$">
```
- Accepts only digits (pattern is anchored).

### 6. Checkbox group with minimum selection
```html
<p data-fiddo-mincheck="2">
  <label><input type="checkbox" name="h[]" value="a"> A</label>
  <label><input type="checkbox" name="h[]" value="b"> B</label>
  <label><input type="checkbox" name="h[]" value="c"> C</label>
</p>
```
- GroupField ensures at least 2 checkboxes are checked.

### 7. Radio button group (required)
```html
<fieldset data-fiddo-required="true">
  <input type="radio" name="q" value="yes">
  <input type="radio" name="q" value="no">
</fieldset>
```
- Requires one radio option to be selected.

### 8. Cross-field comparison
```html
<input type="password" id="pwd">
<input type="password" data-fiddo-equalto="#pwd">
```
- Confirms two password fields match.

### 9. Cross-field alternative (minrequired)
```html
<div data-fiddo-minrequired="1">
  <input type="email" name="email">
  <input type="tel" name="tel">
</div>
```
- At least one of the fields (email or phone) must be filled.

### 10. Remote validator (AJAX)
```html
<input name="email" required data-fiddo-email-available>
```
- Demonstrates asynchronous check (e.g., verifying email availability via server).

### 11. Conditional validation
```html
<input type="checkbox" id="isCompany">
<input name="vat" data-fiddo-required="true" data-fiddo-validate-if="#isCompany">
```
- VAT is required only if the **isCompany** checkbox is selected.

### 12. Custom error messages
```html
<input required data-fiddo-required-message="This field is mandatory.">
```
- Overrides default error message for this field.

### 13. Success messages
```html
<input required data-success-message="Looks good!">
```
- Displays a success message when the field validates.

---

## Behavior in the Demo
- Fields show validation errors inline as soon as the rules are violated and the trigger events fire (`blur`, `input`, etc.).
- After fixing inputs, success states and messages are displayed where configured.
- Group containers highlight errors for multiple inputs together.
- Remote validator example may simulate an async call (server required for real check).

---

## How to run the demo
Simply open **demo.html** in a browser with FiddoJS included.  
Ensure that `fiddo.bundle.js` is correctly referenced and loaded.

---

## Link from Documentation
The main [FiddoJS — The ultimate documentation](README.md) now includes a reference link to this demo explanation and demo page.

