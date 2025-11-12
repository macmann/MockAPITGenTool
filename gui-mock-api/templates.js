const handlebars = require('handlebars');

const templateCache = new Map();

function compileTemplate(source) {
  if (!source) {
    return () => '';
  }

  if (templateCache.has(source)) {
    return templateCache.get(source);
  }

  const compiled = handlebars.compile(source);
  templateCache.set(source, compiled);
  return compiled;
}

function renderTemplate(source, data) {
  const template = compileTemplate(source);
  return template(data || {});
}

module.exports = {
  compileTemplate,
  renderTemplate
};
