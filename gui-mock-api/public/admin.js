(function () {
  const jsonFields = document.querySelectorAll('textarea[data-json-field]');
  for (const field of jsonFields) {
    field.addEventListener('blur', () => {
      const value = field.value.trim();
      if (!value) {
        return;
      }
      try {
        const parsed = JSON.parse(value);
        field.value = JSON.stringify(parsed, null, 2);
        field.setCustomValidity('');
      } catch (err) {
        field.setCustomValidity('Invalid JSON');
      }
    });
    field.addEventListener('input', () => field.setCustomValidity(''));
  }
})();

(function () {
  const statusValueInput = document.querySelector('[data-status-value]');
  const statusSelect = document.querySelector('[data-status-select]');
  const statusCustomContainer = document.querySelector('[data-status-custom]');
  const statusCustomInput = statusCustomContainer?.querySelector('[data-status-custom-input]') || null;

  const toggleCustom = (show) => {
    if (!statusCustomContainer) return;
    statusCustomContainer.style.display = show ? '' : 'none';
    if (statusCustomInput) {
      statusCustomInput.required = show;
      if (!show) {
        statusCustomInput.value = '';
      }
    }
  };

  const setStatusValue = (value) => {
    if (!statusValueInput) return;
    const stringValue = value === undefined || value === null ? '' : String(value);
    statusValueInput.value = stringValue;
    if (!statusSelect) return;

    const matchingOption = Array.from(statusSelect.options || []).find((option) => option.value === stringValue);
    if (matchingOption) {
      statusSelect.value = stringValue;
      toggleCustom(false);
    } else {
      statusSelect.value = 'custom';
      toggleCustom(true);
      if (statusCustomInput) {
        statusCustomInput.value = stringValue;
      }
    }
  };

  if (statusSelect && statusValueInput) {
    setStatusValue(statusValueInput.value || statusSelect.value);

    statusSelect.addEventListener('change', () => {
      if (statusSelect.value === 'custom') {
        toggleCustom(true);
        if (statusCustomInput) {
          statusCustomInput.focus();
        }
      } else {
        setStatusValue(statusSelect.value);
      }
    });

    if (statusCustomInput) {
      statusCustomInput.addEventListener('input', () => {
        if (statusSelect.value === 'custom') {
          statusValueInput.value = statusCustomInput.value;
        }
      });
    }
  }

  const templateSelect = document.querySelector('[data-response-template]');
  const responseBodyField = document.querySelector('[data-response-body]');
  const responseHeadersField = document.querySelector('[data-response-headers]');
  const responseJsonCheckbox = document.querySelector('[data-response-json]');

  const templates = {
    success: {
      status: 200,
      body: JSON.stringify({ success: true, message: 'Request completed successfully.' }, null, 2),
      headers: { 'Content-Type': 'application/json' },
      json: true
    },
    created: {
      status: 201,
      body: JSON.stringify({ id: '12345', message: 'Resource created successfully.' }, null, 2),
      headers: { 'Content-Type': 'application/json' },
      json: true
    },
    empty: {
      status: 204,
      body: '',
      headers: null,
      json: false
    },
    not_found: {
      status: 404,
      body: JSON.stringify({ error: 'Not found', message: 'We couldn\'t find what you were looking for.' }, null, 2),
      headers: { 'Content-Type': 'application/json' },
      json: true
    },
    conflict: {
      status: 409,
      body: JSON.stringify({ error: 'Conflict', message: 'This item already exists. Try a different value.' }, null, 2),
      headers: { 'Content-Type': 'application/json' },
      json: true
    },
    error: {
      status: 500,
      body: JSON.stringify({ error: 'Server error', message: 'Something went wrong on our side.' }, null, 2),
      headers: { 'Content-Type': 'application/json' },
      json: true
    }
  };

  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      const key = templateSelect.value;
      if (!key) {
        return;
      }

      const template = templates[key];
      if (!template) {
        templateSelect.value = '';
        return;
      }

      const bodyHasText = responseBodyField && responseBodyField.value.trim().length > 0;
      const willReplaceBody = !bodyHasText || !template.body || window.confirm('Replace the current response body with this template?');
      if (!willReplaceBody) {
        templateSelect.value = '';
        return;
      }

      if (typeof template.body !== 'undefined' && responseBodyField) {
        responseBodyField.value = template.body;
      }

      if (typeof template.status !== 'undefined') {
        setStatusValue(template.status);
      }

      if (typeof template.json === 'boolean' && responseJsonCheckbox) {
        responseJsonCheckbox.checked = template.json;
      }

      if (template.headers && responseHeadersField) {
        const trimmed = responseHeadersField.value.trim();
        if (!trimmed || trimmed === '{}' || trimmed === '{ }') {
          responseHeadersField.value = JSON.stringify(template.headers, null, 2);
          responseHeadersField.dispatchEvent(new Event('blur'));
        }
      }

      templateSelect.value = '';
    });
  }
})();
