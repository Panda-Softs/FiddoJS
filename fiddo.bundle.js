/**
 * Fiddo — A Lightweight, Declarative Field Validator for Modern Forms
 * -------------------------------------------------
 * Version: 1.0
 * Author: Panda Softwares 2025
 *
 * Fiddo is a minimalist, extensible JavaScript library for validating HTML forms
 * using clean, attribute-based syntax. Whether you're building simple forms
 * or complex conditional/grouped validators, Fiddo handles it all — fast, reliable,
 * and dependency-free (except jQuery).
 *
 * Description:
 *   This plugin provides client-side form validation using declarative HTML attributes.
 *   It supports:
 *     - Built-in and custom validators (sync & async)
 *     - Conditional logic (`validate-if`, `not-validate-if`)
 *     - Group field validation (e.g. first + last name combination checks)
 *     - Remote validation via AJAX
 *     - Field-level styling (success/error classes, containers, handlers)
 *     - Auto-initialization with `autoBind` and namespace control
 *     - Configurable plugin name via `window.FiddoPluginName`
 *
 * Features:
 *   - Custom validator registration (`Fiddo.addValidator`)
 *   - Inline and global error messages
 *   - Promise-based validation lifecycle
 *   - Lifecycle event hooks (`form:validated`, `field:error`, etc.)
 *
 * Limitations:
 *   - Requires jQuery
 *   - Assumes flat form structure (no nested object schemas)
 *   - Depends on properly named data attributes (e.g. `data-parsley-required="true"`)
 */

(function ($) {

  const pluginName = window.FiddoPluginName || 'Fiddo';
  const namespace = pluginName.toLowerCase();

  const globalIds = {}

  const customValidators = {};

  const globalConfig = window[`${pluginName}Config`] || {};

  /**
   * Adds a custom jQuery pseudo-selector `:attrStartsWith`
   *
   * This allows you to query elements with attributes starting with a given string.
   * Useful when you want to match `data-fiddo-*` or other dynamic validation attributes.
   *
   * @param {HTMLElement} elem - The current DOM element being tested.
   * @param {number} index - Not used; present for jQuery compatibility.
   * @param {object} meta - Contains the selector arguments; meta[3] holds the value passed in the pseudo-selector.
   *
   * Example usage:
   *   $('input:attrStartsWith(data-fiddo-)') → matches input elements with any `data-fiddo-*` attribute.
   */
// Determine the correct jQuery pseudo-selector container based on version
  const jqVersion = +$.fn.jquery.split('.')[0];
  const exprPseudo = jqVersion < 4 ? $.expr[':'] : $.expr.pseudos;

// Define the :attrStartsWith custom selector
  exprPseudo.attrStartsWith = function(elem, index, meta) {
    const prefix = meta[3];
    if (!prefix) return false;
    return Array.from(elem.attributes).some(attr => attr.name.startsWith(prefix));
  };

  const Utils = {

    isThenable : r => r && (typeof r.then === 'function' || typeof r.promise === 'function'),
    /**
     * Waits for all promises to settle. If any are rejected, returns a rejected Promise with all errors.
     * Otherwise resolves with all values.
     *
     * @param {Promise[]} promises - An array of Promise objects (e.g. from multiple constraint validations).
     * @returns {Promise} Resolves to array of values, or rejects with array of errors.
     */
    all: (promises) => {
      return Promise.allSettled(promises).then(results => {
        const errors = results
            .filter(r => r.status === 'rejected')
            .map(r => r.reason);
        if (errors.length) return Promise.reject(errors);
        return results.map(r => r.value);
      });
    },

    runSequential : function(items) {
      // Accept Promises or thunks (functions returning a promise/value)
      const toThunk = it => (typeof it === 'function' ? it : () => it);
      const results = [];
      const errors  = [];

      let i = 0;
      function next() {
        if (i >= items.length) {
          return errors.length ? Promise.reject(errors) : Promise.resolve(results);
        }
        let p;
        try {
          p = toThunk(items[i++])();
        } catch (e) {
          errors.push(e);
          return Promise.reject(errors);
        }
        return Promise.resolve(p).then(
            v => { results.push(v); return next(); },
            e => { errors.push(e); return Promise.reject(errors); }
        );
      }
      return next();
    },

    namespaceEvents (events, ns) {
      const triggers = events.split(/\s+/).filter(Boolean);
      const suffix = ns || `${namespace}Field`; // fallback if not provided
      return triggers.map(t => `${t}.${suffix}`).join(' ');
    },

    _extends(...args) {
      let deep = false;
      const sources = [];

      for (let arg of args) {
        if (arg === true) {
          deep = true;
        } else if (typeof arg === 'object' && arg !== null) {
          sources.push(arg);
        }
      }

      const target = sources.shift() || {};

      for (const source of sources) {
        for (const key in source) {
          const val = source[key];

          if (
              deep &&
              val &&
              typeof val === 'object' &&
              !Array.isArray(val)
          ) {
            if (!target[key] || typeof target[key] !== 'object') {
              target[key] = {};
            }
            this._extends(target[key], true, val);
          } else {
            target[key] = val;
          }
        }
      }

      return target;
    },

    cloneValue (v) {
      if (Array.isArray(v)) {
        // Shallow copy array
        return v.slice();
      }
      if (v && typeof v === 'object') {
        // Shallow copy plain object
        return { ...v };
      }
      // Primitive (string, number, null, undefined, boolean, etc.)
      return v;
    },

    /**
     * Formats a string with %s placeholders, using parameters (string or object).
     *
     * @param {string} string - The template message.
     * @param {string|object} parameters - Value(s) to replace %s with.
     * @returns {string} The formatted message.
     */
    formatMessage(string, parameters) {
      if (!string) return;
      if (typeof parameters === 'object') {
        for (let i in parameters) {
          string = this.formatMessage(string, parameters[i]);
        }
        return string;
      }
      return typeof string === 'string' ? string.replace(/%s/i, parameters) : '';
    },

    /**
     * Fetches a namespaced attribute from an element.
     *
     * @param {HTMLElement} element - DOM element.
     * @param {string} namespace - e.g. 'data-fiddo-'
     * @param {string} attribute - The attribute suffix (e.g. 'required')
     * @returns {string|null} The attribute value or null.
     */
    getAttr(element, namespace, attribute) {
      return element.getAttribute(namespace + attribute);
    },

    /**
     * Generates a unique incremental ID based on a given name/type.
     *
     * @param {string} name - A field type or tag (e.g. 'input').
     * @returns {string} A unique ID string like '1', '2', etc.
     */
    generateID(name) {
      globalIds[name] = (globalIds[name] || 0) + 1;
      return '' + globalIds[name];
    },

    /**
     * Attempts to compute a unique element identifier from id, name, or tag fallback.
     *
     * @param {HTMLElement} element
     * @returns {string}
     */
    getElementId(element) {
      const tag = element.tagName.toLowerCase();
      return element.id || this.parseInputName(element.name) || `${tag}${this.generateID(tag)}`;
    },

    /**
     * Same as getElementId but skips fallback.
     */
    getId(element) {
      return element.id || this.parseInputName(element.name) || element.tagName.toLowerCase();
    },

    isSelector(str) {
      return str && typeof str === 'string' && /^([#.][\w-]+|\[[^\]]+\]|[a-zA-Z][\w-]*)$/.test(str);
    },

    /**
     * Deep comparison of two arrays for exact content and order.
     */
    arraysEqual(a, b) {
      return Array.isArray(a) && Array.isArray(b) &&
          a.length === b.length &&
          a.every((v, i) => v === b[i]);
    },

    areEquals(a, b) {
      // Both arrays → use your arraysEqual
      return (Array.isArray(a) && Array.isArray(b)) ? this.arraysEqual(a, b) :  a === b;
    }
  ,
    /**
     * Debounces a function call on an object property (typically used per-instance).
     *
     * @param {object} context - The object to attach the timer to.
     * @param {string} key - Unique timer ID (e.g. '_debounceTimer').
     * @param {number} delay - Delay in milliseconds.
     * @param {function} callback - The function to delay.
     */
    debounceCall(context, key, delay, callback) {
      if (delay) {
        window.clearTimeout(context[key]);
        context[key] = window.setTimeout(callback, delay);
      } else {
        callback();
      }
    },

    isElementVisible($el) {
      if ($el.is('select.selectized')) $el = $el.siblings('.selectize-control');
      return !!(
          $el[0].offsetWidth ||
          $el[0].offsetHeight ||
          $el[0].getClientRects().length
      );
      //return $el.is(':visible') && $el.css('visibility') !== 'hidden' && $el.css('display') !== 'none';
    },

    /**
     * Checks if the given event type is among a list of allowed event types.
     *
     * @param {Event} event - DOM event.
     * @param {string} allowedTypes - Space-separated list of allowed event types (e.g. 'input change').
     */
    eventTypeMatches(event, allowedTypes) {
      return event && event.type && allowedTypes.trim().split(/\s+/).includes(event.type);
    },

    /**
     * Parses a numeric requirement, or gets the value from a selector.
     * Used in gt/gte/lt/lte/notequalto.
     *
     * @param {string|number} requirement - A number or a CSS selector.
     */
    parseFloatRequirement(requirement) {
      if (isNaN(+requirement))
        return parseFloat($(requirement).val());
      return +requirement;
    },

    /**
     * Serializes a value (or array) to a string representation for storage/comparison.
     */
    serialize(value) {
      return Array.isArray(value) ? '[' + value.join(',') + ']' : value;
    },

    /**
     * Parses a serialized string (e.g. '[a,b,c]') back to an array.
     *
     * Returns the string as-is if not in array format.
     */
    deserialize(value) {
      value = value?.trim();
      if (!value) return '';
      if (value.includes('[')) {
        const arrayMatch = value.match(/^\[\s*(.*?)\s*\]$/);
        if (arrayMatch) {
          const inner = arrayMatch[1];
          const items = inner.split(',').map(item => item.trim()).filter(Boolean);
          return items;
        }
      }
      return value;
    },

    /**
     * Parses complex field names like 'user[info][email]' into simplified identifiers.
     *
     * @param {string} name - Input name attribute.
     * @returns {string} e.g. 'info_email'
     */
    parseInputName(name) {
      if (typeof name !== 'string' || !name.length) return '';
      if (!name.includes('[')) return name.trim();

      const parts = [];
      const regex = /([^\[\]]+)|\[(.*?)\]/g;
      let match;
      while ((match = regex.exec(name)) !== null) {
        const part = match[2] !== undefined ? match[2] : match[1];
        if (part && part.trim()) parts.push(part.trim());
      }

      if (parts.length > 1) parts.shift(); // remove root
      return parts.join('_');
    },

    /**
     * Temporarily adds a class to an element then removes it after a timeout.
     */
    flashClass($el, className, duration = 500) {
      if (!$el || !$el.length) return;
      $el.addClass(className);
      setTimeout(() => $el.removeClass(className), duration);
    },

    /**
     * Converts dash-case to camelCase (e.g. 'data-required' → 'dataRequired').
     */
    camelize(str) {
      return str.replace(/-+(.)?/g, (match, chr) => chr ? chr.toUpperCase() : '');
    },

    /**
     * Returns true if the value is a string or array.
     */
    isStringOrArray(val) {
      return typeof val === 'string' || Array.isArray(val);
    },

    /**
     * Normalizes any value to an array (null → []).
     */
    toArray(value) {
      return [].concat(value || []);
    },

    size (value) {
      if (Array.isArray(value)) {
        return value.length > 0;
      } else if (value && typeof value === 'object') {
        return Object.keys(value).length;
      } else if (typeof value === 'string')
        return value.length;
      return 0;
    },

    empty(value) {
      return !this.size(value?.toString().trim());
    },

    _isDiscreteControl($el) {
      return $el.is('select, input[type="checkbox"], input[type="radio"], input[type="file"]');
    },
    /**
     * Resolves a target DOM element from a dynamic source definition.
     *
     * @param {string|function|jQuery|HTMLElement} targetSource - Selector string, function, element, or jQuery object.
     * @param {jQuery|HTMLElement|undefined} fallbackElement - Fallback element if resolution fails.
     * @returns {jQuery|undefined} A resolved jQuery element or fallback.
     */
    resolveTargetElement(targetSource, fallbackElement = undefined) {
      if (!targetSource) return fallbackElement;

      if (typeof targetSource === 'string') {
        if (Utils.isSelector(targetSource)) {
          targetSource = $(targetSource);
        } else if (typeof window[targetSource] === 'function') {
          targetSource = window[targetSource];
        }
      }

      if (typeof targetSource === 'function') {
        targetSource = targetSource.call(this, this);
      }

      if (targetSource instanceof HTMLElement) {
        targetSource = $(targetSource);
      }

      if (targetSource && targetSource.jquery && targetSource.length) {
        return targetSource;
      }

      return fallbackElement;
    },

    isDateStr(str) {
      return str && typeof str === 'string' && /^(?:\d{1,2}([\/\-.])\d{1,2}\1\d{4}|\d{4}([\/\-.])\d{1,2}\2\d{1,2})$/.test(str);
    },

    parseDateWithFormat(value, format) {
      if (typeof value !== 'string') return null;

      // Use default American format if no format is provided
      if (typeof format !== 'string' || !format.trim()) {
        format = 'MM/DD/YYYY';
      }

      if (format.length !== value.length) return null;

      const separatorMatch = format.match(/[^A-Za-z]/);
      if (!separatorMatch) return null;

      const separator = separatorMatch[0];

      const formatParts = format.split(separator);
      const valueParts = value.split(separator);

      if (formatParts.length !== valueParts.length) return null;

      const dateParts = {
        day: null,
        month: null,
        year: null,
      };

      const tokenMap = {
        'D':    'day',
        'DD':   'day',
        'M':    'month',
        'MM':   'month',
        'YY':   'year',
        'YYYY': 'year',
      };

      for (let i = 0; i < formatParts.length; i++) {
        const token = formatParts[i];
        const part = valueParts[i];

        if (token === 'MMMM') {
          const monthIndex = getMonthIndex(part);
          if (monthIndex === -1) return null;
          dateParts.month = monthIndex + 1;
          continue;
        }

        const key = tokenMap[token];
        if (!key) return null;

        let parsed = parseInt(part, 10);

        if (token === 'YY') {
          parsed = 2000 + parsed;
        }

        dateParts[key] = parsed;
      }

      const { day, month, year } = dateParts;

      if (!day || !month || !year) return null;

      const date = new Date(year, month - 1, day);
      if (
          date.getFullYear() === year &&
          date.getMonth() === month - 1 &&
          date.getDate() === day
      ) {
        return date;
      }

      return null;
    },

    /*
    scrollIntoViewIfNeeded(targetEl) {
         // Find a DOM node we can scroll (Selectize support)
         const domForScroll = (node => {
             if (!node) return null;
             if (node.nodeType === 1) return node;
             // Selectize instance – try common containers
             return node.$control?.[0] || node.$wrapper?.[0] || node.$input?.[0] || null;
           })(targetEl);

         const isInViewport = (node) => {
           if (!node || !node.getBoundingClientRect) return false;
            const r = node.getBoundingClientRect();
            const vh = window.innerHeight || document.documentElement.clientHeight;
            const inView = r.top >= 0 && r.bottom <= vh;
            return inView;
         }

      if (domForScroll && domForScroll.scrollIntoView && !Utils.isInViewport(domForScroll)) {
        domForScroll.scrollIntoView({ block: 'center', behavior: 'smooth' }); // <-- smooth scroll
        return true;
      }
      return false;
    },
    */
    /**
     * Logs a console warning with plugin name prefix, if console is available.
     */
    warn(...args) {
      if (typeof window !== 'undefined' && window.console && typeof window.console.warn === 'function') {
        window.console.warn(`[${pluginName}]`, ...args);
      }
    },

    /**
     * Logs a debug message if debug mode is enabled.
     */
    debug(...args) {
      if (globalConfig?.debug === true &&
          typeof window !== 'undefined' &&
          window.console &&
          typeof window.console.debug === 'function') {
        window.console.debug(`[${pluginName}]`, ...args);
      }
    },

    /**
     * Logs a console warning with plugin name prefix, if console is available.
     */
    error(...args) {
      if (typeof window !== 'undefined' && window.console && typeof window.console.error === 'function') {
        window.console.error(`[${pluginName}]`, ...args);
      }
    },

  };



  const MessagesDefaults = {
    defaultMessage: "This value seems to be invalid.",
    type: {
      email: "This value should be a valid email address.",
      url: "This value should be a valid url.",
      number: "This value should be a valid number.",
      integer: "This value should be a valid integer.",
      digits: "This value should be digits.",
      alphanum: "This value should be alphanumeric.",
      color: "Please select a valid color.",
      date: "Please enter a valid date.",
      datetime: "Please enter a valid date and time.",
      'datetime-local': "Please enter a valid local date and time.",
      file: "Please upload a valid file.",
      image: "Please upload a valid image.",
      month: "Please enter a valid month.",
      password: "Please enter a valid password.",
      range: "Please select a valid range.",
      tel: "Please enter a valid telephone number.",
      time: "Please enter a valid time.",
      week: "Please enter a valid week.",
    },
    notblank: "This value should not be blank.",
    required: "This value is required.",
    minrequired : "At least %s input(s) are required.",
    pattern: "This value seems to be invalid.",
    min: "This value should be greater than or equal to %s.",
    max: "This value should be lower than or equal to %s.",
    range: "This value should be between %s and %s.",
    minlength: "This value is too short. It should have %s characters or more.",
    maxlength: "This value is too long. It should have %s characters or fewer.",
    length: "This value length is invalid. It should be between %s and %s characters long.",
    mincheck: "You must select at least %s choices.",
    maxcheck: "You must select %s choices or fewer.",
    check: "You must select between %s and %s choices.",
    equalto: "This value should be the same.",
    notequalto: "This value should be different.",
    gt: "This value should be greater than %s.",
    gte: "This value should be greater than or equal to %s.",
    lt: "This value should be less than %s.",
    lte: "This value should be less than or equal to %s.",
    euvatin: "It's not a valid VAT Identification Number.",

    // extras validators (English)
    money:      "Please enter a valid amount greater than zero",
    date:       "The entered date is invalid (expected format: %s)",
    datemin:    "The date cannot be earlier than %s",
    datemax:    "The date cannot be later than %s",
    datepast:   "The date cannot be in the future",
    datefuture: "The date cannot be in the past"
  };

  const Messages = Utils._extends(true,MessagesDefaults,globalConfig.Messages);

  const Defaults = {
    namespace: `data-${namespace}-`,
    inputs: 'input, textarea, select',
    excluded: 'input[type=button], input[type=submit], input[type=reset], input[type=hidden], .selectize-input > input, novalidate',
    validationThreshold: 3,
    focus: 'first',
    focusClass : `${namespace}-glow`,
    trigger: false,
    triggerAfterFailure: 'input',
    errorClass: `${namespace}-error`,
    successClass: `${namespace}-success`,
    stopAtFirstError: true,
    showMultipleErrors : false,

    // Return the $element that will receive these above
    // success or error classes. Could also be (and given
    // directly from DOM) a valid selector like '#div'

    classHandler: function (field) {
      if (field.$element.is('select.selectized')) {
        return field.$element.siblings('.selectize-control');
      }
    },
    /*
    errorsContainer: function(field) {
      if (field.$element.is('select.selectized')) {
        return field.$element.siblings('.selectize-control');
      }
    },*/
    errorsWrapper: '<ul class="parsley-errors-list"></ul>',
    errorTemplate: '<li></li>',
    successTemplate : ''
  };

  class ValidationError extends Error {
    constructor({ assert, message }) {
      super(message);
      this.name = 'ValidationError';
      this.assert = assert;
      this.errorMessage = message;
    }

    static from(assert, message) {
      return new ValidationError({ assert, message });
    }
  }

  class Validator {
    constructor({ name, validateFn, message, group, priority = 0 }) {
      this.name = name;
      if (typeof validateFn === 'function') this.validateFn = validateFn; // don't clobber subclass method
      this.message = message || Messages[name] || 'Validation failed';
      this.group = group;
      this.priority = priority;
    }

    _reject(reason, requirements) {
      const message = Utils.formatMessage(reason?.message || reason || this.message, requirements);
      return Promise.reject(ValidationError.from(this.name,message));
    }

    validate(value, requirements, field) {
      const fn = this.validateFn;

      if (typeof fn !== 'function') {
        throw new Error(`${pluginName} Validator:${this.name} : no validate function defined`);
      }

      try {

        const args = Array.isArray(requirements)
            ? [value, ...requirements]
            : [value, requirements];

        // Call `fn` with the `field` as `this` context
        const fnResult = fn.apply(field, args);
        Utils.debug(`Validator ${this.name} : validator returns \`${fnResult}\` for value \`${value}\``);

        if (Utils.isThenable(fnResult)) {
          // Normalize any thenable (jqXHR/Deferred/native Promise)
          return Promise.resolve(fnResult).catch(reason =>
              this._reject(reason, requirements));
        }

        // Sync validators: truthy = pass, falsy = fail
        return fnResult ? Promise.resolve() : this._reject(field.customErrorMessage || this.message, requirements);

      } catch (err) {
        console.error(`${pluginName} Error in validator "${this.name}":`, err);
        throw err;
      }
    }

  }

  /**
   * StandardValidator class
   * Used to wrap built-in validators with proper message handling
   * Handles edge case where Messages[name] is an object (e.g., type-specific messages)
   */
  class StandardValidator extends Validator {
    constructor(name, requirements) {

      const validatorDef = standardValidators[name];

      // Use optional chaining and fallback to default message
      const message = getErrorMessage(name, undefined, requirements);

      const priority =
          (typeof validatorDef === 'object' && typeof validatorDef.priority === 'number')
              ? validatorDef.priority
              : 0;

      super({ name, message, priority });

      if (typeof validatorDef === "object") {
        const requirementType = Utils.deserialize(validatorDef.requirementType);
        if (Utils.isStringOrArray(requirementType)) {

          if (!this._validateRequirementType(requirements, requirementType)) {
            throw new Error(`[${pluginName}] StandardValidator "${name}": Expected requirement of type "${Utils.serialize(requirementType)}", got "${Utils.serialize(requirements)}"`);
          }

        }
        if (typeof validatorDef.validate === "function") {
          this.validateFn = validatorDef.validate;
        } else
          throw new Error(`[${pluginName}] StandardValidator "${name}": Undefined validateFn`);
      } else if (typeof validatorDef === "function") {
        // function-style validator → no explicit priority, already defaulted to 0 above
        this.validateFn = validatorDef;
      } else
        throw new Error(`[${pluginName}] StandardValidator "${name}": Undefined validateFn`);

      // Store the specific requirement for future use if needed
      this.requirement = requirements;
    }

    _validateRequirementType(requirements, requirementType) {
      if (!requirementType) return true;
      const reqs = Utils.toArray(requirements);
      const types = Utils.toArray(requirementType);

      if (reqs.length !== types.length) return false;

      return reqs.every((r, i) => {
        const typeGroup = types[i].split('|').map(t => t.trim());

        // Check if at least one type in the group validates the requirement
        const isValid = typeGroup.some(type => {
          const tester = typeTesters[type];
          if (!tester || typeof tester.test !== 'function') {
            throw new Error(`[${pluginName}] Unknown requirement type "${type}" in validator.`);
          }
          return tester.test(r);
        });

        return isValid;
      });
    }

  }

  class RemoteValidator extends Validator {
    constructor({name, message, group, url, method = 'POST', dataKey = 'value', isValidFn = null, priority=10}) {
      super({name, message, group, priority});
      this.url = url;                 // may be undefined; then we'll use "requirements" as URL
      this.method = method;
      this.dataKey = dataKey;
      // bind both so "this" is always the RemoteValidator (bound functions ignore .apply/.call)
      this.validateFn = this.validateFn.bind(this);
      this.isValidFn = (isValidFn || this.defaultIsValidFn).bind(this);
    }

    defaultIsValidFn(data, textStatus, xhr) {
      return xhr?.status >= 200 && xhr?.status < 300;
    }

    validateFn(values, requirements) {
      // NEW: resolve URL from spec.url OR from the "requirement" (attribute value)
      const resolvedUrl =
          this.url ||
          (typeof requirements === 'string' && requirements) ||
          (requirements && requirements.url);

      if (!resolvedUrl) {
        console.error(`[${pluginName}] RemoteValidator "${this.name}": no URL resolved from spec or requirement`);
        return Promise.resolve(false);
      }

      // Optional: support extra payload via requirement object: { url, extra }
      // data-fiddo-coupon='{"url":"/fxbase/coupon/validate","extra":{"clientId":123}}'
      const extra = (requirements && requirements.extra) || {};

      // Return a *native* Promise that resolves (pass) or rejects (fail)
      return new Promise((resolve, reject) => {
        $.ajax({
          url: resolvedUrl,
          method: this.method,
          data: { [this.dataKey]: values, ...extra }
        }).done((data, textStatus, jqXHR) => {
              let isValid = false;
              try {
                isValid = typeof this.isValidFn === 'function' && !!this.isValidFn(data, textStatus, jqXHR);
                Utils.debug(`Remote validation is ${isValid}, response:`, data);
              } catch (e) {
                console.error(`${pluginName} RemoteValidator isValidFn threw an error:`, e);
                reject(e); return;
              }
              isValid ? resolve({successMessage : data?.successMessage}) : reject(data?.errorMessage || this.message);
       })//
       .fail((jqXHR, textStatus, errorThrown) => {
         reject(errorThrown || textStatus || 'Remote validation failed');
       });
      });
    }
  }

  function getErrorMessage(key, requirements, objectKey) {
    const errorMessage = (typeof Messages[key] === 'object' ? Messages[key]?.[objectKey] : Messages[key]) || Messages.defaultMessage;
    return requirements ? Utils.formatMessage(errorMessage, requirements) : errorMessage;
  }

  function addMessages(messages) {
    Utils._extends(Messages, messages);
  }

  function addValidator(name, spec) {

    name = name.trim();

    if (customValidators[name]) { //standardValidators[name] is allowed to overwrite
      Utils.warn(`Validator "${name}" already exists and will not be overwritten.`);
      return;
    }

    let instance;

    if (spec instanceof Validator) {
      instance = spec;
    } else if (spec.remote || spec.url) {
      instance = new RemoteValidator({ name, ...spec });
    } else {
      instance = new Validator({ name, ...spec });
    }

    customValidators[name] = instance;
  }

  class Constraint {
    constructor(field, name, requirements) {
      this.field = field;
      this.name = name;
      this.requirements = requirements;
      this._buildValidator();
      this.priority = this.validator?.priority ?? 0;
    }

    _buildValidator() {
      if (customValidators[this.name]) {
        this.validator = customValidators[this.name];
        if (this.validator.group) this.field.isGroupField = true;
      } else if (Constraint.isStandardConstraint(this.name, this.requirements)) {
        this.validator = new StandardValidator(this.name, this.requirements);
      } else {
        Utils.warn(`Constraint in field \`${this.field.__id__}\` - no validator found for name ${this.name}`);
      }
    }

    // Check if a constraint is a known standard validator
    static isStandardConstraint(name, requirement) {
      if (!standardValidators[name]) return false;

      // Special case: "type" validator requires requirement to be a valid key in typeTesters
      if (name === 'type') {
        return typeof requirement === 'string' && Object.prototype.hasOwnProperty.call(typeTesters, requirement);
      }

      return true;
    }

    // Check if a constraint is either a valid standard or custom validator
    static isValidConstraint(name, requirement) {
      return (
          customValidators[name] !== undefined ||
          Constraint.isStandardConstraint(name, requirement)
      );
    }

    validateConstraint(value) {
      if (!this.validator) throw new Error('Validator not found'); //return Promise.resolve();

      Utils.debug(`Constraint:${this.name} field:${this.field.__id__} validate with value:${value} requirements:${this.requirements}`);
      return this.validator.validate(value, this.requirements, this.field);
      // ?? NEEDED .catch(err => Promise.reject(err || this._defaultMessage()));
    }
  }
  class Field {
    constructor(el, form, options, parentGroup) {
      this.element = el;
      this.$element = $(el);
      this.form = form;
      this.options = options;
      this.constraints = {};
      this._lastValidatedValue = null;
      this._lastValidationState = null;
      this._failedOnce = false; // Track if field ever failed (to switch trigger)
      this.__id__ = Utils.getElementId(this.element);
      this._parentGroup = parentGroup;
      this._isValid = false;
      this._actualizeConstaints();
    }

    _actualizeConstaints() {
      this._bindConstraints();
      this._bindEvents();
    }

    _hasParentGroup() {
      return this._parentGroup && this._parentGroup instanceof GroupField;
    }

    _getAttr() {
      const attr = {}

      const attributes = this.element.attributes;
      for (let i = attributes.length; i--;) {
        const attribute = attributes[i];
        const attrName = attribute.name.toLowerCase();
        const attrValue =  attribute.value.trim();

        if (attribute && attribute.specified) {
          if (attribute.name.startsWith(this.options.namespace))
            attr[Utils.camelize(attribute.name.slice(this.options.namespace.length))] = Utils.deserialize(attribute.value);
          else if (attrName.startsWith('data-')) {
            attr[Utils.camelize(attribute.name.slice(5))] = Utils.deserialize(attribute.value);
          } else if (Constraint.isStandardConstraint(attrName, attrValue)) {
            attr[attrName] = attrValue;
          }
        }
      }

      return attr;
    }

    _bindConstraints() {
        const attributes = this._getAttr();
        this.domOptions = {}
        const usedKeys = new Set();

      const isDualConstraint = (name, attributes) => {
        const dualEntry = dualValidators[name];
        if (
            dualEntry &&
            attributes.hasOwnProperty(dualEntry.dualAttr) &&
            !usedKeys.has(dualEntry.dualAttr)
        ) {
          return dualEntry;
        }
        return false;
      };

        for (const [name, requirements] of Object.entries(attributes)) {

          if (usedKeys.has(name)) continue;

          if (Constraint.isValidConstraint(name, requirements)) {
            const dual = isDualConstraint(name, attributes);

            if (dual) {

              const dualValues = {
                [name]: requirements,
                [dual.dualAttr]: attributes[dual.dualAttr]
              };

              const orderedKeys = Utils.deserialize(standardValidators[dual.dualName].dual);
              const dualRequirements = orderedKeys.map(key => dualValues[key]);

              if (Constraint.isValidConstraint(dual.dualName, dualRequirements)) {
                this.addConstraint(dual.dualName, dualRequirements);
                usedKeys.add(dual.dualAttr);
              }
            } else
              this.addConstraint(name, requirements);

          } else
            this.domOptions[name] = requirements;
        }
    }

    // Choose sane defaults per element type
    _triggerForElement() {
      // text-like inputs benefit from "input" (live feedback) and "change" (fallback)
      if (Utils._isDiscreteControl(this.$element)) return 'change';
      return (this._failedOnce ? this.options.triggerAfterFailure : (this.domOptions.trigger || this.options.trigger)) || 'input';
    }

    // Bind validation trigger event (with support for triggerAfterFailure)
    _bindEvents() {
      const namespaceEvent = namespace+'Field';
      this.$element.off('.'+namespaceEvent);

      // Handle data-parsley-trigger="input paste change"
      const triggerEvents = this._triggerForElement();

      //this.$element.on(Utils.namespaceEvents(trigger,namespaceEvent), $.proxy(this._validateIfNeeded, this));
      if (!(this instanceof GroupField)) {
        this.$element.on(Utils.namespaceEvents(triggerEvents, namespaceEvent), (evt) => {
          //const newValue = this.getValue();
          this._validateIfNeeded(evt);
        });
      }
    }

    _validateIfNeeded(event) {

      Utils.debug(`[${this.__id__}] _validateIfNeeded event type:${event?.type} value:${this.getValue()}`)
      /*
      if (event && /key|input/.test(event.type)) {
        // Resolve per-element threshold (DOM > global > 0)
        const threshold = parseInt(
            this.domOptions.validationThreshold ?? this.options.validationThreshold ?? 0,
            10
        );

        const value = this.getValue();
        if (
            threshold > 0 &&
            typeof value === 'string' &&
            value.length < threshold &&
            !(this._isRequired() && value.length === 0)
        ) {
          return; // defer validation
        }
      }*/

      Utils.debounceCall(this, '_debounced', this.options.debounce, _ => this._silentValidate(event));
    }

    /*
    _updateParentGroup(isValid, event) {
      if (isValid) {
        // Some or all fields are invalid
        if (Utils.eventTypeMatches(event, this._parentGroup._eventTrigger)) {
          Utils.debug(`notifying parent group that ${this.element.name} is now valid`);
          this._parentGroup.whenValidate().catch(() => {});
        }
      } else {
        // All fields are valid
        // In case of preview validate state, clean the parent group field
        if (this._parentGroup._lastValidationState === false) {
          Utils.debug(`notifying parent group that ${this.element.name} is now invalid`);
          this._parentGroup.reset();
        }

      }
    }*/

    _silentValidate(event) {
      const prevState = this._lastValidationState;

      // Helper: decide whether to ping the parent group
      const notifyParentIfNeeded = () => {
        const stateChanged = prevState !== this._lastValidationState;
        const discreteEvt  = Utils.eventTypeMatches(event, 'change blur');

        if (this._hasParentGroup() && (stateChanged || discreteEvt)) {
          this._parentGroup.queueValidateFromChild(this, event);
        }
      };

      this.whenValidate()
          .then(() => {
            // child is valid → notify only if state flipped or discrete event
            notifyParentIfNeeded();
          })
          .catch(reason => {
            if (reason instanceof Field) {
              // validation failure (not an exception) → same notify rule
              notifyParentIfNeeded();
            } else if (reason instanceof Error) {
              // real exception: propagate
              throw reason;
            }
          });
    }


    addConstraint(name, requirements) {
      Utils.debug(`Field \`${this.__id__}\` : adding constraint:${name} requirements:${requirements}`);
      const constraint = new Constraint(this, name, requirements);

      // Handle
      const customConstraintMessage = this.domOptions[`${name}Message`];
      if (customConstraintMessage?.length) {
        if (customConstraintMessage.startsWith('@')) {
          const msgKey = customConstraintMessage.slice(1); // remove "@"
          constraint.validator.message = Messages[msgKey] || customConstraintMessage;
        } else {
          constraint.validator.message = customConstraintMessage;
        }
      }
      this.constraints[name] = constraint;
    }

    /**
     * shouldValidate()
     * ------------------------------------------------------------------
     * Determines whether this field should be validated,
     * based on `data-fiddo-validate-if` and `data-fiddo-not-validate-if` conditions.
     *
     * Supports:
     *   - jQuery-style CSS selectors (e.g., "#isCompany")
     *   - Global function names (e.g., "shouldValidateField")
     *   - Inline JavaScript expressions (e.g., "someVar === true")
     *   - Function references passed directly via JS config
     *
     * Evaluation order:
     *   1. `validateIf` must evaluate to true (or be undefined)
     *   2. `notValidateIf` must evaluate to false (or be undefined)
     *      → Both conditions must be satisfied to proceed with validation.
     *
     * Returns:
     *   - true: field should be validated
     *   - false: skip validation (e.g. field is hidden or not applicable)
     *
     * Limitations:
     *   - If `notValidateIf` and `validateIf` conflict, `notValidateIf` takes precedence.
     *   - Unsafe expression evaluation (e.g. JS string parsing) should be avoided in secure contexts.
     *
     * Examples:
     *   <input type="text"
     *     data-fiddo-validate-if="#isCompany"
     *     data-fiddo-not-validate-if="$('#skipField').is(':checked')">
     */
    shouldValidate() {
      const validateIf = this.domOptions.validateIf;
      const notValidateIf = this.domOptions.notValidateIf;

      /**
       * evaluateConditionValue(condition)
       * ----------------------------------
       * Evaluates the provided condition, which may be:
       *   - A jQuery-style selector string (e.g., "#myCheckbox")
       *   - A global JS function name string (e.g., "shouldValidateField")
       *   - A direct JS expression string (e.g., "'US' === $('#country').val()")
       *   - A function reference
       *
       * Returns:
       *   - Boolean result indicating whether condition is satisfied
       *   - false if an error occurs or selector is not found
       */
      const evaluateConditionValue = (condition) => {
        if (typeof condition === 'undefined') return true;

        try {
          // Case 1: condition is a CSS selector
          if (Utils.isSelector(condition)) {
            const $target = $(condition);

            // Fail if selector matches no elements
            if (!$target.length) {
              throw new Error(`[${pluginName}] validate-if selector "${condition}" did not match any elements.`);
            }

            // Checkbox → use .is(':checked')
            if ($target.is(':checkbox')) {
              return $target.is(':checked');

              // Select (single or multiple) → check for non-empty value(s)
            } else if ($target.is('select')) {
              const val = $target.val();
              return Array.isArray(val) ? val.length > 0 : !!val;

              // Other fields → check for non-empty value
            } else {
              return !!$target.val();
            }
          }

          // Case 2: condition is a global function name
          if (typeof condition === 'string' && typeof window[condition] === 'function') {
            return window[condition](this); // call with field as context
          }

          // Case 3: condition is a raw JS expression string
          if (typeof condition === 'string') {
            return Function('"use strict";return (' + condition + ')')(); // evaluated in global scope
          }

          // Case 4: condition is a function reference
          if (typeof condition === 'function') {
            return condition.call(this);
          }

        } catch (e) {
          Utils.warn(`Error evaluating validate-if condition:`, e);
          return false; // fail-safe: do not validate if logic fails
        }

        // Default fallback: treat as valid
        return true;
      };

      // Evaluate both validateIf and notValidateIf conditions
      const should = typeof validateIf !== 'undefined' ? evaluateConditionValue(validateIf) : true;
      const shouldNot = typeof notValidateIf !== 'undefined' ? evaluateConditionValue(notValidateIf) : false;

      // Only validate if validateIf is true and notValidateIf is false
      return should && !shouldNot;
    }


    /**
     * Field::whenValidate()
     * ------------------------------------------------------------------
     * Main validation entry point for an individual field.
     *
     * This method is responsible for determining whether validation should
     * happen, whether it can be skipped (cached or conditionally disabled),
     * and for running all registered constraints when necessary.
     *
     * It handles:
     *   - `fiddo-validate-if` logic (conditional validation)
     *     Examples:
     *       - data-fiddo-validate-if="#isCompany"
     *         → Validate only if the element with ID `isCompany` has a value.
     *
     *       - data-fiddo-validate-if="$('#country').val() === 'US'"
     *         → Validate only if the selected country is "US".
     *
     *       - data-fiddo-validate-if="shouldValidateField"
     *         → Call global JS function `shouldValidateField(field)`:
     *           window.shouldValidateField = field => $('#toggleField').is(':checked');
     *
     *   - Value change detection to avoid redundant validations
     *   - Required field logic (skip empty optional fields)
     *   - UI updates and event triggering
     *
     * Returns:
     *   - A resolved Promise if the field is valid (or skipped)
     *   - A rejected Promise (with `this` as reason) if invalid
     *
     * Caches:
     *   - Last validated value (`_lastValidatedValue`)
     *   - Last validation state (`_lastValidationState`)
     */
    // Inside class Field (so GroupField inherits it)
    _buildValidationsFor(value) {
      // 1) collect + sort
      const sorted = Object.values(this.constraints)
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      Utils.debug(
            `Validation order for ${this.__id__}:`,
            sorted.map(c => `${c.name ?? '(anon)'}@${c.priority ?? 0}`).join('  →  ')
      );

      // 2) map to thunks (sequential) or started promises (parallel)
      const mapConstraint = this.options?.stopAtFirstError
          ? (c) => () => c.validateConstraint(value)   // thunk → short-circuit
          : (c) => c.validateConstraint(value);        // promise → parallel

      return sorted.map(mapConstraint);
    }

    // In class Field
    _preValidate() {
      // Default: no pre-work needed for regular fields
      // Return either value or a Promise that resolves to a (possibly transformed) value
      return Promise.resolve();
    }

    whenValidate() {
      // Get the current field value (e.g., input value, select value, etc.)
      const value = this.getValue();

      /**
       * resolveAsValid()
       * ----------------
       * Called when validation is not needed (e.g., condition is false,
       * optional field is empty, or result is cached as valid).
       * Updates UI if needed and resolves the validation promise.
       */
      const resolveAsValid = (triggerValidateEvent) => {
        if (this._lastValidationState === false) this._handleUI(true);
        triggerValidateEvent && this._trigger('success', { field: this }); // Notify listeners
        this._lastValidationState = true;            // Cache valid state
        return Promise.resolve(value);               // Resolve with current value
      };

      if (Utils.areEquals(value, this._lastValidatedValue) && this._lastValidationState !== null) {
        return this._lastValidationState ? Promise.resolve(value) : Promise.reject(this);
      }

      /**
       * Reset internal state for new validation
       * -----------------------------------------------
       * Clear previous validation errors and store current value for caching.
       */
      this.validationResult = [];
      this._lastValidatedValue = Utils.cloneValue(value);

      /**
       * Conditional validation
       * ------------------------------
       * If a `data-fiddo-validate-if` condition is present and evaluates to false,
       * validation is skipped and field is treated as valid.
       */
      // Is this a checkbox or radio?
      if (/^(checkbox|radio)$/i.test(this.element.type)||!this.shouldValidate()||!Utils.size(this.constraints)||!Utils.isElementVisible(this.$element))
        return resolveAsValid(false);

      /**
       * Skip validation for empty, optional fields
       * --------------------------------------------------
       * Only validate empty fields if they are marked required.
       */
      if (Utils.empty(value) && !this._isRequired()) {
        return resolveAsValid(false);
      }

      // run pre-validation hook (GroupField will override this)
      return Promise.resolve(this._preValidate()).then(values => {
        // Build + run validators using the (possibly) transformed value
        const validations = this._buildValidationsFor(value);
        return this._finalizeValidationResult(value, validations);
      });
    }

    _getSuccessValidationMessage(value, onSuccessMessages) {
      const message = this.domOptions.successMessage ||
      (onSuccessMessages || [])
      .map(v => (typeof v === 'string' ? v : v?.successMessage))
      .find(Boolean) ||
      null;
      return Utils.formatMessage(message, value);
    }

    /**
     * _finalizeValidationResult(value, promises)
     * ----------------------------------------------------------------
     * Final step in field validation.
     *
     * This method processes the results of all constraint validations
     * and updates the internal state, UI, and events accordingly.
     *
     * Parameters:
     *   - value (any): The current value being validated.
     *   - promises (Promise[]): An array of Promises returned by `validateConstraint`.
     *
     * Behavior:
     *   - Resolves if all constraints pass.
     *   - Rejects if any constraints fail.
     *   - Updates:
     *     - UI feedback (success/error display)
     *     - Field validation state cache
     *     - Triggers appropriate events
     *
     * Returns:
     *   - Promise resolved with `value` if valid
     *   - Promise rejected with `this` (field) if invalid
     */
    _finalizeValidationResult(value, promises) {

      // --- Decide executor: parallel vs sequential ---
      // By default we use Utils.all(promises) → runs all validators in parallel
      // If stopAtFirstError is true → use Utils.runSequential(promises)
      //   → runs one by one and stops at the first failure (saves time, avoids remote calls)
      const run = this.options?.stopAtFirstError ? Utils.runSequential : Utils.all;

      return run(promises)

          // --- Success path (all validators resolved) ---
          .then((onSuccessMessages) => {

            // Collect any success messages returned by validators.
            // Validators may return either a string or an object { successMessage }.
            // We normalize them and pick the first truthy one.
            this.validationSuccessMessage = this._getSuccessValidationMessage(value,onSuccessMessages);

            // No error result in this case
            this.validationResult = null;

            // Update UI with success state
            this._handleUI(true);

            // Fire a "success" event so listeners can react (e.g., analytics, custom UI)
            this._trigger('success',[{field : this}]);

            // Remember last state to avoid redundant UI updates later
            this._lastValidationState = true;

            // Resolve original value back to caller (to chain validation + usage)
            return value;
          })

          // --- Error path (at least one validator rejected) ---
          .catch(onErrorMessages => {

            // If a raw JS Error was thrown (unexpected case), log it
            if (onErrorMessages instanceof Error) {
              Utils.error(onErrorMessages.message);
              return;
            }

            // No success message if there are errors
            this.validationSuccessMessage = null;

            // Store validation errors array for later reference
            this.validationResult = onErrorMessages;

            // Update UI with error state
            this._handleUI(false);

            // Fire an "error" event so external listeners can respond
            this._trigger('error',[{field : this}]);

            // Remember last state
            this._lastValidationState = false;

            // Reject the promise with `this` (the Field) so caller can inspect it
            return Promise.reject(this);
          })

          // --- Always ---
          .finally(() => {
            // Fire a "validated" event regardless of outcome
            // Useful for logging, enabling submit buttons, etc.
            this._trigger('validated',[{field : this, isValid : this._isValid}]);
          });
    }

    getValue() {
      return this.$element.val();
    }

    _isRequired() {
      return this.constraints.required && false !== this.constraints.required.requirements;
    }

    /**
     * Returns (or creates) the error container element for this field.
     * It creates and appends a wrapper element (like <ul>) for displaying errors,
     * and ensures it's only created once per field.
     */
    _insertErrorWrapper() {
      if (!this.$errorsWrapper) {

        // Create the wrapper element (e.g., <ul>) and assign a unique ID
        this.$errorsWrapper = $(this.options.errorsWrapper).attr('id', `${this.options.namespace}error-list-${this.__id__}`);

        const $errorContainer = this._getErrorContainer();

        if ($errorContainer?.length) {
          $errorContainer.append(this.$errorsWrapper);
        } else
          // Insert the wrapper into the DOM
          this._getClassHandler().after(this.$errorsWrapper);
      }
      return this.$errorsWrapper;
    }

    _getErrorWrapper() {
      return this.$errorsWrapper;
    }

    /**
     * Gets the class handler for this field (used to toggle error/success classes).
     */
    _getClassHandler() {
      return Utils.resolveTargetElement.call(this,this.domOptions.classHandler||this.options.classHandler, this.$element);
    }

    /**
     * Gets the container for error messages (used to insert the wrapper).
     */
    _getErrorContainer() {
      return Utils.resolveTargetElement.call(this,this.domOptions.errorsContainer || this.options.errorsContainer);
    }

    _handleUI(isValid) {
      // Save the latest validation state (true = valid, false = invalid)
      this._isValid = isValid;

      // Element that will visually reflect validation (usually the input,
      // but may be a wrapper if classHandler is customized).
      const $classHandler = this._getClassHandler();

      // Apply base accessibility + style classes
      $classHandler
          .attr('aria-invalid', !isValid)                 // Mark input as invalid for screen readers
          .toggleClass(this.options.successClass, isValid) // Add/remove "success" CSS class
          .toggleClass(this.options.errorClass, !isValid)  // Add/remove "error" CSS class
          .removeAttr('aria-describedby');                 // Reset description link (re-added later)

      // --- Clear any previous messages ---
      let $wrapper = this._getErrorWrapper();
      $wrapper && $wrapper.empty().removeClass('filled') // Empty content + reset "filled" marker
          .attr('aria-hidden', 'true')              // Hide from screen readers
          .removeAttr('role aria-live');            // Remove previous ARIA roles/live regions

      // Flags: decide what to display
      const hasSuccessMessages = isValid && this.validationSuccessMessage; // success text available?
      const hasErrorMessages   = !isValid && Array.isArray(this.validationResult) && this.validationResult.length > 0; // errors available?
      const hasMessages = hasSuccessMessages || hasErrorMessages;

      // If either success or error messages exist, ensure wrapper is present
      if (hasMessages) {
        $wrapper = this._insertErrorWrapper(); // Create wrapper if missing
        $classHandler.attr('aria-describedby', $wrapper.attr('id')); // Link input to wrapper for accessibility
      }

      // --- Render error messages ---
      if (hasErrorMessages) {
        if (!this._failedOnce) {
          this._failedOnce = true; // First failure → switch event trigger to "after failure" mode
          this._bindEvents();      // Rebind with stricter triggers (e.g., on input)
        }

        // Sort errors so "required" appears first (prioritize this type of error).
        const sortedErrors = this.validationResult.sort((a, b) => {
          return a.assert === 'required' ? -1 : b.assert === 'required' ? 1 : 0;
        });

        // Show either only the "required" error or multiple errors based on settings.
        const validationErrors = (sortedErrors[0]['assert'] === 'required' || !this.options.showMultipleErrors)
            ? [sortedErrors[0]]
            : sortedErrors;

        // Add each error message as an <li> inside the wrapper
        for (const error of validationErrors) {
          const $error = $(this.options.errorTemplate)
              .text(error.errorMessage)                    // Human-readable message
              .attr(`data-error-${error.assert}`, '');     // Data attribute for type of assertion

          $wrapper.append($error);
        }
      }

      // --- Render success message (if any) ---
      if (hasSuccessMessages) {
        const $success = $(this.options.successTemplate || this.options.errorTemplate)
            .text(this.validationSuccessMessage)            // Success text (provided by validator)
            .attr('data-success', '')                       // Marker attribute
            .addClass(`${this.options.namespace}success-message`); // Namespace-based CSS class

        $wrapper.append($success);

        // Mark wrapper visible and announce success using role="status"
        // (less urgent than alert, appropriate for non-error messages).
      }

      if (hasMessages) {
        $wrapper.addClass('filled').attr({'aria-hidden': 'false', 'role': hasErrorMessages ? 'alert' : 'status', 'aria-live': 'polite'});
      }
    }

    _neutralizeUI()   {
      this.validationResult = [];
      this.validationSuccessMessage = null;
      this._lastValidatedValue = null;
      this._lastValidationState = null;
      this._isValid = false;
      this.$errorsWrapper && this.$errorsWrapper.empty().removeClass('filled').attr('aria-hidden', 'true').removeAttr('role aria-live');
      this._getClassHandler().removeClass(this.options.successClass).removeClass(this.options.errorClass).removeAttr('aria-invalid aria-describedby');
    };

    // Reset the field validation state and UI
    reset() {
      this._failedOnce = false;
      this._neutralizeUI();
      this._bindEvents();
    }

    destroy() {
      this.$element.off(`.${pluginName}Field`);
      this.$errorsWrapper && (this.$errorsWrapper.remove(), this.$errorsWrapper = null);
      this.constraints = {};
      this._lastValidatedValue = null;
      this._lastValidationState = null;
      this._failedOnce = false;
      this._isValid = false;
    }

    refresh() {
      this.destroy();  // Clean up existing event bindings, UI, constraints
      this._actualizeConstaints();
    }

    // Shortcut to trigger an event
    _trigger(eventName, ...params) {
      return this.$element.trigger(`field:${eventName}`, params);
    }
  }

  class GroupField extends Field {

    fields = [];

    constructor(el, form, options) {
      super(el, form, options);
      el.classList.add('group-field');
      this._collectGroupFields();
    }

    _collectGroupFields() {
      let groupInputType = null;
      let hasSpecialGroupType = false;
      this.fields = [];

      this.form._getCandidateElements(this.$element).each((i, el) => {
        Utils.debug(`FieldGroup : collecting child element \`${Utils.getElementId(el)}\``);

        const field = new Field(el, this, this.options, this);
        this.fields.push(field);

        const type = (el.type || '').toLowerCase();

        // Only care about real input/select/textarea types
        if (/^(checkbox|radio)$/i.test(type)) {
          hasSpecialGroupType = true;

          if (groupInputType === null) {
            groupInputType = type;
          } else if (groupInputType !== type) {
            throw new Error(`${pluginName} GroupField error: mixed types in group: "${groupInputType}" and "${type}" are not allowed.`);
          }
        } else if (hasSpecialGroupType) {
          // Already seen checkbox or radio, but now a different type found
          throw new Error(`${pluginName} GroupField error: cannot mix "${groupInputType}" with other input types in the same group.`);
        }
      });

      if (groupInputType) {
        this.multipleType = groupInputType; // Store for later logic if needed
      }
    }

    _containsField(element) {
      return this.fields.some(field => field.element === element);
    }

    // In class GroupField
    _preValidate() {
      // No children => nothing to gate
      if (!this.fields || this.fields.length === 0) {
        Utils.debug(`[${this.__id__}] _preValidate: no child fields`);
        return Promise.resolve();
      }

      // 1) If any child is known-invalid right now, short-circuit: group must not proceed.
      const hasKnownInvalid = this.fields.some(f => f._lastValidationState === false);
      if (hasKnownInvalid) {
        // Reject with the group itself (pattern used elsewhere in the codebase)
        return Promise.reject(this);
      }

      // 2) Collect children that need (re)validation:
      //    - never validated yet, OR
      //    - value changed since last validation (by value semantics)
      const needValidations = this.fields.filter(f =>
          f._lastValidationState === null ||
          !Utils.areEquals(f.getValue(), f._lastValidatedValue)
      );

      // 3) If none need validation, allow/deny based on current states.
      if (needValidations.length === 0) {
        const allValid = this.fields.every(f => f._lastValidationState === true);
        return allValid ? Promise.resolve() : Promise.reject(this);
      }

      // 4) Validate the needed children now.
      const run = this.options?.stopAtFirstError ? Utils.runSequential : Utils.all;

      // If sequential, wrap as thunks so Utils.runSequential can short-circuit.
      const childItems = this.options?.stopAtFirstError
          ? needValidations.map(f => () => f.whenValidate())
          : needValidations.map(f => f.whenValidate());

      return run(childItems)
          .then(values => values)
          .catch(errs => {
            // True exception? bubble it.
            if (errs instanceof Error) throw errs;

            // A child failed validation → block group constraints.
            return Promise.reject(this);
          });
    }

    // GroupField
    queueValidateFromChild(child, event) {
      // Coalesce to one run per tick (configurable via options.debounce)
      Utils.debounceCall(this, '_groupDebounced', this.options.debounce || 50, () => {

        if (this._lastValidationState == false) {
          const hasInvalidChild = this.fields.some(f => f._lastValidationState === false);
          if (hasInvalidChild) {
            this._neutralizeUI();
            return;
          }
        }

        this.whenValidate().catch(() => {}); // UI gets updated by .catch in finalize
      });
    }

    /*
    whenValidate() {
      return this.isGroupField ?
          this.whenValidateGroup() :
          // Use the Field.whenValidate method to validate multiple standard types
          super.whenValidate();
    }

    whenValidateGroup() {
      Utils.debug(`Group field ${this.__id__} is validating with ${this.fields.length} fields`);

      // If sequential, wrap each field validation in a thunk (() => Promise).
      // If parallel, start all child validations immediately.
      const childItems = this.options?.stopAtFirstError
          ? this.fields.map(f => () => f.whenValidate())
          : this.fields.map(f => f.whenValidate());

      // --- 1) Decide how to run child field validations ---
      // If stopAtFirstError is true → use Utils.runSequential and thunks,
      // so we can short-circuit early when the first child fails.
      // Otherwise run them all in parallel with Utils.all.
      const run = this.options?.stopAtFirstError ? Utils.runSequential : Utils.all;

      // --- 2) Execute child validations (sequentially or in parallel) ---
      return run(childItems)

          .then(values => {
            // --- 3) Skip work if values didn’t change since last validation ---
            // Optimization: if the array of child values is identical to the last run,
            // and we have a cached result, just reuse it.
            if (Utils.arraysEqual(values, this._lastValidatedValue) && this._lastValidationState !== null) {
              Utils.debug(`Group field ${this.__id__} no value changed, returns same last validation state`);
              return this._lastValidationState ? Promise.resolve(values) : Promise.reject(this);
            }

            // Reset current validation state since we’re about to re-check
            this.validationResult = [];
            this._lastValidatedValue = Utils.cloneValue(values);

            // --- 4) Run group-level constraints (on the array of child values) ---
            // _buildValidationsFor returns either:
            //   - thunks (if stopAtFirstError) to run sequentially
            //   - or already-started promises (if parallel)
            const selfValidations = this._buildValidationsFor(values);
            Utils.debug(`Group field ${this.__id__} self validation returns ${selfValidations}`);

            // --- 5) Let the shared finalizer handle execution + UI updates ---
            // _finalizeValidationResult chooses runSequential/all again based on options,
            // and will set validationSuccessMessage, validationResult, update the UI, and trigger events.
            return this._finalizeValidationResult(values, selfValidations);
          })

          .catch(errors => {
            // --- 6) Handle errors (either child or group validation) ---
            if (errors instanceof Error) {
              // True exception, not just a validation failure
              Utils.error(errors.message);
              return;
            }

            // Otherwise, at least one child field failed validation.
            // With stopAtFirstError=true, this will be the *first* failing child.
            // With parallel, it may be multiple children.
            Utils.debug(`Group field ${this.__id__} contains invalid ${errors.length} fields, group validation stopped`);

            // Remember last validation state for optimization
            this._lastValidationState = false;

            // Reject with the group itself (pattern matches single field validate)
            return Promise.reject(this);
          });
    }
    */

    getValue() {
      switch (this.multipleType) {
        case 'checkbox':
          return this.fields
              .filter(field => field.element.checked)
              .map(field => field.element.value);

        case 'radio':
          const checkedField = this.fields.find(field => field.element.checked);
          return checkedField ? checkedField.element.value : '';

        default:
          return this.fields.map(field => field.getValue());
      }
    }

    destroy() {
      this.fields.forEach(field => field.destroy?.());
      // Call parent cleanup (Field.destroy)
      super.destroy();
    }

    refresh() {
      this.destroy();         // Destroy all inner fields + self
      this._collectGroupFields(); // Re-collect and recreate group fields
      this._bindEvents();     // Rebind group-level events
    }
  }

  class Form {
    constructor(form, options = {}) {
      this.element = form;
      this.$element = $(form);
      this.options = options;
      this.fields = [];
      this.$element.attr('novalidate', '').addClass(namespace);
      this.$element[namespace] = true;
      this._bindSubmit();
      this._bindFields();
      this._trigger('init', { form : this});
    }

    _submit(originalEvent, submitSource) {
      const event = $.Event('submit', {
        originalEvent,
        valid_submit: true,
        submitter: submitSource
      });

      this.$element.trigger(event);

      Utils.debug(`Form submitted`, event);
    }

    _bindSubmit() {
      this.$element.on(`submit.${pluginName}`, e => {
        if (e.valid_submit) return;
        e.preventDefault();
        e.stopImmediatePropagation();

        const submitSource = e.originalEvent?.submitter || document.activeElement || null;

        this.whenValidate()
            .then(values => {

              this._trigger('success');
              if (this._trigger('submit', { event: e }, submitSource) !== false) {
                this._submit(e, submitSource);
              }
            })
            .catch((failedFields) => {
              this._trigger('error');
              this.focus(failedFields);
            });

        return false;
      });
    }

    _getCandidateElements(element, extraSelector = '') {
      const fullSelector = this.options.inputs + (extraSelector ? ',' + extraSelector : '');

      return element.find(fullSelector)
          .not(this.options.excluded)
          .not(`[${this.options.namespace}excluded=true]`);
    }

    /**
     * Iterates over a set of elements and populates this.fields
     * Handles individual fields and grouped fields (GroupField).
     *
     * @param {HTMLElement[]} elements - DOM elements to scan
     */
    _addFieldsFromElements(elements) {
      let lastGroup = null;

      elements.forEach(el => {
        Utils.debug(`Form : collecting form element \`${Utils.getId(el)}\``);

        if (lastGroup && lastGroup._containsField(el)) {
          Utils.debug(`Form : skipping form element \`${Utils.getId(el)}\` already in group \`${lastGroup.__id__}\``);
          return;
        }

        let field;
        if ($(el).is('input, textarea, select')) {
          field = new Field(el, this, this.options);
        } else {
          field = lastGroup = new GroupField(el, this, this.options);
        }

        this.fields.push(field);
      });
    }
    _bindFields() {
      this.fields = [];
      const domElements = this._getCandidateElements(this.$element, `:attrStartsWith(${this.options.namespace})`);
      this._addFieldsFromElements(domElements.toArray());
    }

    // Form
    whenValidate() {
      this._trigger('validate');

      const validations = this.fields.map(field => field.whenValidate());

      return Utils.all(validations)
          .then(values => {
            this._trigger('validated');
            return values;
          })
          .catch(failedFields => {
            this._trigger('error');
            return Promise.reject(failedFields);
          });
    }

    validate() {
      return this.whenValidate().then(_ => true).catch(_ => false);
    }

    focus(failedFields) {
      if (!failedFields.length) return;

      const firstInvalid = failedFields[0];
      let targetEl = null;

      if (firstInvalid instanceof GroupField && firstInvalid.fields.length > 0) {
        const invalidField = firstInvalid.fields.find(f => f._isValid !== true);
        targetEl = (invalidField || firstInvalid.fields[0]).element;
      } else {
        targetEl = firstInvalid.element;
      }

      if (targetEl.tagName === 'SELECT' && targetEl.selectize && targetEl.selectize instanceof Selectize) targetEl = targetEl.selectize;

      if (targetEl && typeof targetEl.focus === 'function') {
        //Utils.scrollIntoViewIfNeeded(targetEl);
        targetEl.focus();
        if (this.options.focusClass) {
          Utils.flashClass($(targetEl), this.options.focusClass, 500);
        }
      }
    }

    _trigger(event, ...params) {
      return this.$element.trigger(`form:${event}`, params);
    }

    // Reset all field states
    reset() {
      this.fields.forEach(field => field.reset());
    }

    refresh() {
      const knownElements = this.fields.map(f => f.element);
      const currentDOMElements = this._getCandidateElements(this.$element, `:attrStartsWith(${this.options.namespace})`).toArray();

      this.destroy();
      // Step 2: Re-scan and rebind fresh fields
      this._bindFields();

      this._trigger('refreshed', { form: this });
    }

    destroy() {
      // Destroy all fields
      this.fields.forEach(field => field.destroy?.());

      // Unbind form events
      this.$element.off(`.${pluginName}`);

      // Remove plugin instance
      this.$element.removeData(pluginName);

      // Clear reference
      this.fields = [];

      this._trigger('destroy');
    }
  }

  const typeTesters = {
    number : {
      test: function (number) {
        return true;
      }
    },
    email: /^((([a-zA-Z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-zA-Z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-zA-Z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-zA-Z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-zA-Z]|\d|-|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-zA-Z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-zA-Z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-zA-Z]|\d|-|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-zA-Z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))$/,
    date: {
      test: function(value) {
        const d = new Date(value);
        return !isNaN(d.getTime());
      }
    },
    tel : {
      test : function (value) {
        value = value.trim();
        if (value==='*') return true;
        const swissPhoneRegex = /^(?:\+41|0041|0)(?:\s?)([2-9]{2})(?:\s?\d{3})(?:\s?\d{2})(?:\s?\d{2})$/;
        const internationalPhoneRegex = /^(?:\+|00)([1-9]\d{0,3})(?:\s?\d){6,14}$/;
        return swissPhoneRegex.test(value) || internationalPhoneRegex.test(value);
      }
    },
    url: new RegExp("^" + // protocol identifier
        "(?:(?:https?|ftp)://)?" + // ** mod: make scheme optional
        // user:pass authentication
        "(?:\\S+(?::\\S*)?@)?" + "(?:" + // IP address exclusion
        // private & local networks
        // "(?!(?:10|127)(?:\\.\\d{1,3}){3})" +   // ** mod: allow local networks
        // "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" +  // ** mod: allow local networks
        // "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +  // ** mod: allow local networks
        // IP address dotted notation octets
        // excludes loopback network 0.0.0.0
        // excludes reserved space >= 224.0.0.0
        // excludes network & broacast addresses
        // (first & last IP address of each class)
        "(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" + "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" + "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" + "|" + // host name
        "(?:(?:[a-zA-Z\\u00a1-\\uffff0-9]-*)*[a-zA-Z\\u00a1-\\uffff0-9]+)" + // domain name
        "(?:\\.(?:[a-zA-Z\\u00a1-\\uffff0-9]-*)*[a-zA-Z\\u00a1-\\uffff0-9]+)*" + // TLD identifier
        "(?:\\.(?:[a-zA-Z\\u00a1-\\uffff]{2,}))" + ")" + // port number
        "(?::\\d{2,5})?" + // resource path
        "(?:/\\S*)?" + "$"),

      selector : /^([#.][\w-]+|\[[^\]]+\]|[a-zA-Z][\w-]*)$/,
      regexp: {
        test : function (value) {
          try {
            // isAnchoredRegex
            return /^\^.*\$$/.test(value.trim()) && !! new RegExp(value);
          } catch(e) {
            return false;
          }
        }
      },
      integer: /^-?\d+$/,
      digits: /^\d+$/,
      alphanum: /^\w+$/i,

  };
  typeTesters.range = typeTesters.number; //// See http://stackoverflow.com/a/10454560/8279

  const standardValidators = {

    required: {
      validate: (value) => !Utils.empty(value),
      priority: 100, // must run first
    },

    // Minimum number of non-empty values (e.g. checkboxes)
    minrequired: {
      validate: (value, min) => value.filter(v => !!v?.trim()).length >= (parseInt(min) || 0),
      requirementType: 'integer',
      priority: 50,
    },

    // Pattern match using a regular expression string (must be anchored with ^ and $)
    pattern: {
      validate: (value, pattern) => new RegExp(pattern).test(value),
      requirementType: 'regexp',
      priority: 70,
    },

    // Minimum numeric value
    min: {
      validate: (value, min) => parseFloat(value) >= parseFloat(min),
      requirementType: 'number',
      priority: 60,
    },

    // Maximum numeric value
    max: {
      validate: (value, max) => parseFloat(value) <= parseFloat(max),
      requirementType: 'number',
      priority: 60,
    },

    // Numeric range [min, max]
    range: {
      validate: (value, min, max) =>
          parseFloat(value) >= parseFloat(min) && parseFloat(value) <= parseFloat(max),
      requirementType: '[number,number]',
      dual: '[min,max]',
      priority: 61,
    },

    // Minimum string length
    minlength: {
      validate: (value, min) => value.length >= parseInt(min, 10),
      requirementType: 'integer',
      priority: 50,
    },

    // Maximum string length
    maxlength: {
      validate: (value, max) => value.length <= parseInt(max, 10),
      requirementType: 'integer',
      priority: 50,
    },

    // String length range
    length: {
      validate: (value, min, max) =>
          value.length >= parseInt(min, 10) && value.length <= parseInt(max, 10),
      requirementType: '[integer,integer]',
      dual: '[minlength,maxlength]',
      priority: 51,
    },

    // Equal to another value (can be a selector)
    equalto: {
      validate: (value, ref) => parseFloat(value) == Utils.parseFloatRequirement(ref),
      requirementType: 'number|selector',
      priority: 40,
    },

    // Not equal to another value
    notequalto: {
      validate: (value, ref) => parseFloat(value) != Utils.parseFloatRequirement(ref),
      requirementType: 'number|selector',
      priority: 40,
    },

    // Greater than another value
    gt: {
      validate: (value, min) => parseFloat(value) > Utils.parseFloatRequirement(min),
      requirementType: 'number|selector',
      priority: 40,
    },

    // Greater than or equal to
    gte: {
      validate: (value, min) => parseFloat(value) >= Utils.parseFloatRequirement(min),
      requirementType: 'number|selector',
      priority: 40,
    },

    // Less than another value
    lt: {
      validate: (value, max) => parseFloat(value) < Utils.parseFloatRequirement(max),
      requirementType: 'number|selector',
      priority: 40,
    },

    // Less than or equal to
    lte: {
      validate: (value, max) => parseFloat(value) <= Utils.parseFloatRequirement(max),
      requirementType: 'number|selector',
      priority: 40,
    },

    // Checkbox count validators
    mincheck: {
      validate: (value, min) => value.length >= parseInt(min, 10),
      requirementType: 'integer',
      priority: 30,
    },

    maxcheck: {
      validate: (value, max) => value.length <= parseInt(max, 10),
      requirementType: 'integer',
      priority: 30,
    },

    check: {
      validate: (value, min, max) =>
          value.length >= parseInt(min, 10) && value.length <= parseInt(max, 10),
      requirementType: '[integer,integer]',
      dual: '[mincheck,maxcheck]',
      priority: 31,
    },

    date: {
      validate: function (value, format) {
        if (!value.trim()) return true;
        return Utils.parseDateWithFormat(value.trim(), format) !== null;
      },
      priority: 60,
    },

    type: {
      validate: (value, type) => {
        const tester = typeTesters[type];
        if (!tester || typeof tester.test !== 'function') {
          throw new Error(`[${pluginName}] Unknown requirement type "${type}" in validator.`);
        }
        return tester.test(value);
      },
      priority: 70,
    }
  };

  const dualValidators = (() => {
    const duals = {};

    for (const [dualName, validator] of Object.entries(standardValidators)) {
      if (validator.dual) {
        const [first, second] = Utils.deserialize(validator.dual); // e.g., ['min', 'max']

        duals[first] = { dualAttr: second, dualName };
        duals[second] = { dualAttr: first, dualName };
      }
    }

    return duals;
  })();

  $.fn[namespace] = function (options) {
    const instances = [];

    this.each(function () {

      // Ensure the element is a FORM tag
      if (!this.tagName || this.tagName.toLowerCase() !== 'form') {
        throw new Error(`[${pluginName}] Initialization must be called on a <form> element.`);
      }

      let instance = $(this).data(pluginName);
      if (!instance) {
        instance = new Form(this, $.extend(true, {}, Defaults, globalConfig, options));
        $(this).data(pluginName, instance);
      } else if (options === true)
        instance.reset(); // reset
      instances.push(instance);
    });

    // Return the instance directly if only one element was passed
    return instances.length === 1 ? instances[0] : instances;
  };

  // auto-bind
  if (globalConfig.autoBind !== false && globalConfig.namespace) {
      $(function () {
          const $forms = $(`[${globalConfig.namespace}validate]`);
          if ($forms.length && typeof $.fn[namespace] === 'function') {
            $forms[namespace]();
            }
      });
  }

  // exposed
  window[pluginName] = {
    customValidators,
    addValidator,
    addMessages,
    getErrorMessage,
    Messages,
    Utils
  };

})(jQuery);